// Smoke test for the real Playground harness (plan D10–D12). Run from a worktree with:
// bun --env-file=/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/.env test test/plugin/harness.test.ts
import { afterAll, beforeAll, expect, setDefaultTimeout, test } from "bun:test";
import { preflight, startHarness, type Harness } from "./harness";
import { findSecret } from "./artifacts";
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
  expect(info.ff).toBe("6.2.14");
  expect(info.gf).toBe(h.versions.gf);
  expect(info.gf).toMatch(/^\d+\.\d+/);
  expect(info.users).toBeGreaterThanOrEqual(2);
  expect(info.tables).toBeGreaterThan(0);
  expect(info.mu).toBe(true);
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
    await Bun.$`zip -q -r probe.zip pirax-harness-probe`.cwd(dir);
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
  const traceEntries = await Bun.$`unzip -Z1 ${evidence.trace!}`.text();
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
  expect(evidence.files).toEqual(expect.arrayContaining(["network.jsonl", "manifest.json"]));
}, 300_000);

test("stop shuts the site down", async () => {
  const url = h.url;
  await h.stop();
  await expect(fetch(url, { signal: AbortSignal.timeout(3000) })).rejects.toThrow();
}, 60_000);
