// Smoke test for the real Playground harness (plan D10–D12). Run from a worktree with:
// bun --env-file=/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/.env test test/plugin/harness.test.ts
import { afterAll, beforeAll, expect, setDefaultTimeout, test } from "bun:test";
import { FF_VERSION, GF_VERSION, pinnedVersion, preflight, startHarness, type Harness } from "./harness";
import { nextPatch, withAlteredFile } from "./version-fixtures";
import { findSecret } from "./artifacts";
import { withoutSigningKey } from "../../scripts/build-plugin";
import { mkdir, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Playground round trips exceed Bun's 5 s default. Bun 1.4 scopes this to the calling file, so every suite sets it.
setDefaultTimeout(180_000);

let h: Harness;
beforeAll(async () => {
  h = await startHarness({ run: "harness-smoke" });
}, 600_000);
afterAll(async () => {
  await h?.stop();
}, 60_000);

test("preflight names missing or invalid credentials without their values", () => {
  expect(() => preflight({})).toThrow(/GRAVITY_FORMS_ZIP[\s\S]*FORM_TEST_TOKEN/);
  const path = "/nonexistent/licensed-gf-secret-path.zip";
  const token = "tok-value-that-must-not-leak";
  let message = "";
  try {
    preflight({ GRAVITY_FORMS_ZIP: path, FORM_TEST_TOKEN: token });
  } catch (error) {
    message = String(error);
  }
  expect(message).toContain("GRAVITY_FORMS_ZIP");
  expect(message).not.toContain(path);
  expect(message).not.toContain(token);
});

test("compatibility preflight requires FLUENT_FORMS_PRO_ZIP by name only; the default stack does not", async () => {
  // A stand-in file, not the real licensed path: a failing assertion may print preflight's return value.
  const gf = join(await mkdtemp(join(tmpdir(), "pirax-preflight-")), "gf.zip");
  await Bun.write(gf, "stand-in");
  const base = { GRAVITY_FORMS_ZIP: gf, FORM_TEST_TOKEN: "tok-value-that-must-not-leak" };
  expect(() => preflight(base)).not.toThrow();
  expect(() => preflight(base, { compatibility: true })).toThrow(/FLUENT_FORMS_PRO_ZIP is not set/);
  const path = "/nonexistent/licensed-pro-secret-path.zip";
  let message = "";
  try {
    preflight({ ...base, FLUENT_FORMS_PRO_ZIP: path }, { compatibility: true });
  } catch (error) {
    message = String(error);
  }
  expect(message).toContain("FLUENT_FORMS_PRO_ZIP");
  expect(message).not.toContain(path);
  expect(message).not.toContain(base.FORM_TEST_TOKEN);
});

test("licensed and cached ZIPs must declare exactly their pinned version, and refusals name the variable, not the path", async () => {
  // Stand-in ZIPs under a private-looking directory name: never the real licensed files.
  const dir = await mkdtemp(join(tmpdir(), "pirax-licensed-secret-path-"));
  const zip = async (name: string, header: string | null) => {
    await mkdir(join(dir, name, "gravityforms"), { recursive: true });
    if (header !== null) await Bun.write(join(dir, name, "gravityforms/gravityforms.php"), `<?php\n/*\nPlugin Name: Gravity Forms\n${header}\n*/\n`);
    else await Bun.write(join(dir, name, "gravityforms/other.php"), "<?php\n");
    await Bun.$`zip -qr ${`../${name}.zip`} .`.cwd(join(dir, name)).env(withoutSigningKey());
    return join(dir, `${name}.zip`);
  };
  const check = (path: string) => pinnedVersion(path, "gravityforms/gravityforms.php", "GRAVITY_FORMS_ZIP", GF_VERSION);
  expect(await check(await zip("pinned", `Version: ${GF_VERSION}`))).toBe(GF_VERSION);
  const refusals: Record<string, [string | null, string]> = {
    "next patch": [`Version: ${nextPatch(GF_VERSION)}`, `GRAVITY_FORMS_ZIP contains gravityforms/gravityforms.php version ${nextPatch(GF_VERSION)}, expected ${GF_VERSION}`],
    longer: [`Version: ${GF_VERSION}.1`, `GRAVITY_FORMS_ZIP contains gravityforms/gravityforms.php version ${GF_VERSION}.1, expected ${GF_VERSION}`],
    "no header": ["Description: none", "GRAVITY_FORMS_ZIP does not contain gravityforms/gravityforms.php with a Version header"],
    "no main file": [null, "GRAVITY_FORMS_ZIP does not contain gravityforms/gravityforms.php with a Version header"],
  };
  for (const [name, [header, expected]] of Object.entries(refusals)) {
    const path = await zip(name.replace(/ /g, "-"), header);
    const message = await check(path).then(() => "accepted", (error) => String(error));
    expect({ name, message }).toEqual({ name, message: `Error: ${expected}` });
    expect(message).not.toContain(dir);
  }
});

test("loopback WordPress runs licensed Gravity Forms and pinned Fluent Forms with real PHP and database", async () => {
  expect(new URL(h.url).hostname).toBe("127.0.0.1");
  const info = await h.php<{
    active: string[];
    gf: string;
    ff: string;
    users: number;
    tables: number;
    mu: boolean;
  }>(`
    global $wpdb;
    return [
      'active' => get_option('active_plugins'),
      'gf' => GFForms::$version,
      'ff' => FLUENTFORM_VERSION,
      'users' => (int) $wpdb->get_var("SELECT COUNT(*) FROM {$wpdb->users}"),
      'tables' => count($wpdb->get_col($wpdb->prepare('SHOW TABLES LIKE %s', $wpdb->esc_like($wpdb->prefix . 'gf_') . '%'))),
      'mu' => defined('PIRAX_FORM_TEST_HARNESS'),
    ];
  `);
  expect(info.active).toContain("gravityforms/gravityforms.php");
  expect(info.active).toContain("fluentform/fluentform.php");
  expect(info.ff).toBe(FF_VERSION);
  expect(info.gf).toBe(GF_VERSION);
  expect(h.versions.gf).toBe(GF_VERSION);
  expect(info.users).toBeGreaterThanOrEqual(2);
  expect(info.tables).toBeGreaterThan(0);
  expect(info.mu).toBe(true);
  // The default stack stays GF + FF only: no optional plugins, no Pro prerequisite, baseline mail observer.
  expect(h.compatibility).toBe(false);
  expect(h.versions).toEqual({ gf: GF_VERSION, ff: FF_VERSION, wp: "7.1.2", php: "8.3" });
  expect(info.active.filter((p) => !/^(gravityforms|fluentform)\//.test(p))).toEqual([]);
  await expect(h.php("throw new RuntimeException('boom');")).rejects.toThrow(/boom/);

  const verify = await h.php<{ success: boolean }>(`
    $r = wp_remote_post('https://www.google.com/recaptcha/api/siteverify', ['body' => ['secret' => 's', 'response' => 'r']]);
    return json_decode(wp_remote_retrieve_body($r), true);
  `);
  expect(verify.success).toBe(false);
  expect((await h.siteverify()).length).toBe(1);
});

let probeSha = "";
test("browser logs in to real wp-admin and submits unmarked forms for both plugins", async () => {
  const { context, page } = await h.browser("smoke");
  try {
    await page.goto(`${h.url}/wp-login.php`);
    await page.fill("#user_login", h.users.admin.login);
    await page.fill("#user_pass", h.users.admin.password);
    await page.click("#wp-submit");
    await page.waitForURL(/\/wp-admin\/?/);
    expect(await page.locator("#wpadminbar").count()).toBe(1);
    expect(await page.locator("#menu-plugins").count()).toBe(1);

    // Upload path for later plugin builds: a throwaway plugin ZIP through Plugins → Add New → Upload.
    const dir = await mkdtemp(join(tmpdir(), "pirax-probe-"));
    await mkdir(join(dir, "pirax-harness-probe"));
    await Bun.write(join(dir, "pirax-harness-probe/pirax-harness-probe.php"), "<?php\n/*\nPlugin Name: Pirax harness probe\n*/\n");
    await Bun.$`zip -q -r probe.zip pirax-harness-probe`.cwd(dir).env(withoutSigningKey());
    await h.uploadPlugin(page, join(dir, "probe.zip"));
    probeSha = new Bun.CryptoHasher("sha256").update(await Bun.file(join(dir, "probe.zip")).bytes()).digest("hex");
    expect(await h.php<boolean>("return in_array('pirax-harness-probe/pirax-harness-probe.php', get_option('active_plugins'), true);")).toBe(true);

    const before = await h.entries();
    const mailBefore = (await h.mail()).length;

    await page.goto(h.fixtures.page);
    const gf = page.locator(`#gform_${h.fixtures.gf}`);
    await gf.locator("input[name='input_1']").fill("Smoke Visitor");
    await gf.locator("input[name='input_2']").fill("visitor@example.test");
    await gf.locator("textarea[name='input_3']").fill("gf unmarked smoke");
    await gf.locator("[type=submit]").click();
    await page.locator(".gform_confirmation_message").waitFor();

    await page.goto(h.fixtures.page);
    const ff = page.locator(`form[data-form_id='${h.fixtures.ff}']`);
    await ff.locator("input[name='names[first_name]']").fill("Smoke");
    await ff.locator("input[name='email']").fill("visitor@example.test");
    await ff.locator("textarea[name='message']").fill("ff unmarked smoke");
    await ff.locator("button[type=submit]").click();
    await page.locator(".ff-message-success").waitFor();

    // Probe redaction: the configured token enters the trace (URL and typed value) but must not be retained.
    await page.goto(`${h.fixtures.page}?probe=${encodeURIComponent(h.token)}`);
    await gf.locator("textarea[name='input_3']").fill(`${h.token}-probe01`);

    await h.drainQueues();
    const mail = (await h.mail()).slice(mailBefore);
    const gfMail = mail.filter((m) => m.subject.includes(`gf-${h.fixtures.gf}`));
    const ffMail = mail.filter((m) => m.subject.includes(`ff-${h.fixtures.ff}`));
    expect(gfMail.length).toBe(2);
    expect(ffMail.length).toBe(2);
    for (const m of [...gfMail, ...ffMail]) {
      expect(m.to.join(",")).toMatch(/owner(-2)?@client\.test/);
      expect(m.headers.join("\n")).toMatch(/^Cc:\s*cc@client\.test/im);
      expect(m.headers.join("\n")).toMatch(/^Bcc:\s*bcc@client\.test/im);
    }
    expect(gfMail.map((m) => m.to.join(",")).sort()).toEqual(["owner-2@client.test", "owner@client.test"]);

    const after = await h.entries();
    expect(after.gf).toBe(before.gf + 1);
    expect(after.ff).toBe(before.ff + 1);
    const feeds = (await h.feeds()).map((f) => f.plugin).sort();
    expect(feeds).toEqual(["ff", "gf"]);
  } finally {
    await h.closeBrowser(context);
  }
  const evidence = await h.saveEvidence();
  expect(evidence.trace).toMatch(/smoke\.trace\.zip$/);
  expect(evidence.redacted).toBeGreaterThan(0); // the probe token was captured, then scrubbed
  expect(await findSecret(h.artifactDir, [h.token])).toEqual([]);
  expect(await Bun.file(`${h.artifactDir}/mail.jsonl`).text()).toContain("owner@client.test");

  // Action trace without DOM snapshots/screenshots, plus a separate sanitized request/response ledger.
  const traceEntries = await Bun.$`unzip -Z1 ${evidence.trace!}`.env(withoutSigningKey()).text();
  expect(traceEntries).not.toMatch(/\.(jpe?g|png|webm)$/m);
  const network = (await Bun.file(`${h.artifactDir}/network.jsonl`).text())
    .trim()
    .split("\n")
    .map((l) => JSON.parse(l) as { context: string; method: string; url: string; status: number | null; type: string });
  // Only request line facts: no headers, cookies or bodies.
  const allowed = ["context", "method", "url", "status", "type", "failure"];
  expect(network.flatMap((r) => Object.keys(r)).filter((k) => !allowed.includes(k))).toEqual([]);
  expect(network.every((r) => r.context === "smoke")).toBe(true);
  expect(network).toContainEqual(expect.objectContaining({ method: "POST", type: "document", url: expect.stringContaining("/wp-login.php") }));
  expect(network).toContainEqual(expect.objectContaining({ method: "POST", type: "document", url: expect.stringContaining("action=upload-plugin") }));
  expect(network).toContainEqual(expect.objectContaining({ method: "POST", url: expect.stringContaining("/admin-ajax.php"), status: 200 }));
  expect(network).toContainEqual(
    expect.objectContaining({ method: "GET", type: "document", status: 200, url: expect.stringContaining("?probe=[REDACTED]") }),
  );

  const manifest = await Bun.file(`${h.artifactDir}/manifest.json`).json();
  expect(manifest).toMatchObject({
    suite: "harness-smoke",
    scenarios: ["smoke"],
    versions: h.versions,
    artifacts: { mail: "mail.jsonl", feeds: "feeds.jsonl", entries: "entries.json", network: "network.jsonl", traces: ["smoke.trace.zip"] },
    uploads: [{ file: "probe.zip", sha256: probeSha }],
  });
  expect(Object.keys(manifest.zips).sort()).toEqual(["fluentform", "gravityforms"]);
  expect(evidence.files).toEqual(expect.arrayContaining(["network.jsonl", "manifest.json"]));
}, 300_000);

test("withAlteredFile: repeated and nested plugin edits reach every Playground worker and restore the original bytes", async () => {
  // Playground's run() goes round-robin over its workers (6 here); 7 fresh reads reach each of them.
  const seen = async () => {
    const versions = new Set<string>();
    for (let i = 0; i < 7; i++)
      versions.add(await h.php<string>(`return FLUENTFORM_VERSION . ' ' . get_file_data(WP_PLUGIN_DIR . '/gravityforms/gravityforms.php', ['v' => 'Version'])['v'];`));
    return [...versions];
  };
  const [ff, gf] = [nextPatch(FF_VERSION), nextPatch(GF_VERSION)];
  const ffDefine = (v: string) => `define('FLUENTFORM_VERSION', '${v}');`;
  const gfHeader = (v: string) => `Version: ${v}\n`;
  // Edit, one fresh read, restore: the restore runs on another worker than the edit, and within 7 cycles a later
  // edit runs again on a worker that made an earlier backup (which that worker's file cache still lists).
  for (let cycle = 0; cycle < 7; cycle++) {
    await withAlteredFile(h, "fluentform/fluentform.php", ffDefine(FF_VERSION), ffDefine(ff), async () => {
      expect(await h.php<string>(`return FLUENTFORM_VERSION;`)).toBe(ff);
    });
  }
  // Nested, as in the compatibility suite: each fresh read on every worker sees exactly the current edits.
  for (let round = 0; round < 2; round++) {
    await withAlteredFile(h, "fluentform/fluentform.php", ffDefine(FF_VERSION), ffDefine(ff), async (outer) => {
      expect(outer.altered).not.toBe(outer.original);
      expect(await seen()).toEqual([`${ff} ${GF_VERSION}`]);
      await withAlteredFile(h, "gravityforms/gravityforms.php", gfHeader(GF_VERSION), gfHeader(gf), async () => {
        expect(await seen()).toEqual([`${ff} ${gf}`]);
      });
      expect(await seen()).toEqual([`${ff} ${GF_VERSION}`]);
    });
    expect(await seen()).toEqual([`${FF_VERSION} ${GF_VERSION}`]);
  }
}, 300_000);

test("stop shuts the site down", async () => {
  const url = h.url;
  await h.stop();
  await expect(fetch(url, { signal: AbortSignal.timeout(3000) })).rejects.toThrow();
}, 60_000);
