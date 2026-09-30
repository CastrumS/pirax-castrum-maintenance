// Opt-in compatibility stack (plan D5–D7): GF + FF + FF Pro + CleanTalk + FluentSMTP in one Playground,
// with WordPress/browser egress contained, CleanTalk moderation and the Pro webhook answered at the
// test Requests transport (Pirax_Harness_Transport), and FluentSMTP's real Simulator as the mail
// transport. Ordinary controls only.
// bun --env-file=/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/.env test test/plugin/stack-harness.test.ts
import { afterAll, beforeAll, expect, setDefaultTimeout, test } from "bun:test";
import { findSecret } from "./artifacts";
import { startHarness, type Harness } from "./harness";

// Playground round trips exceed Bun's 5 s default. Bun 1.4 scopes this to the calling file, so every suite sets it.
setDefaultTimeout(180_000);

let h: Harness;
beforeAll(async () => {
  h = await startHarness({ run: "stack-harness", compatibility: true });
}, 600_000);
afterAll(async () => {
  await h?.stop();
}, 60_000);

test("optional plugins are real, exact, active, and activated after the safeguards", async () => {
  expect(h.compatibility).toBe(true);
  expect(h.versions).toMatchObject({ ff: "6.2.14", ffPro: "6.2.15", cleantalk: "6.88", fluentSmtp: "2.4.1" });
  const info = await h.php<any>(`
    global $apbct;
    return [
      'active' => get_option('active_plugins'),
      'pro' => FLUENTFORMPRO_VERSION, 'cleantalk' => APBCT_VERSION, 'smtp' => FLUENTMAIL_PLUGIN_VERSION,
      'wp_mail' => basename((new ReflectionFunction('wp_mail'))->getFileName()),
      'simulate' => defined('FLUENTMAIL_SIMULATE_EMAILS') && FLUENTMAIL_SIMULATE_EMAILS,
      'builtin_http' => (int) $apbct->settings['wp__use_builtin_http_api'],
      'contact_forms' => (int) $apbct->settings['forms__contact_forms_test'],
      'webhook' => get_option('fluentform_global_modules_status')['webhook'] ?? null,
    ];
  `);
  for (const plugin of ["fluentformpro/fluentformpro.php", "cleantalk-spam-protect/cleantalk.php", "fluent-smtp/fluent-smtp.php"])
    expect(info.active).toContain(plugin);
  expect(info).toMatchObject({ pro: "6.2.15", cleantalk: "6.88", smtp: "2.4.1", wp_mail: "fluent-smtp.php", simulate: true, builtin_http: 1, contact_forms: 1, webhook: "yes" });

  // The mu-plugin (HTTP containment, mail observers) was loaded in every optional plugin's activation request.
  const activations = await h.php<string[]>(`
    $file = WP_CONTENT_DIR . '/pirax-harness/activations.jsonl';
    return array_map(fn($l) => json_decode($l, true)['plugin'], file($file, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES));
  `);
  expect(activations).toEqual(expect.arrayContaining(["fluentformpro/fluentformpro.php", "cleantalk-spam-protect/cleantalk.php", "fluent-smtp/fluent-smtp.php"]));
});

test("third-party WordPress HTTP is blocked and logged without the outgoing or incoming request's query strings or bodies", async () => {
  const before = (await h.http()).length;
  // The incoming request carries a synthetic query and nonce, as wp-admin requests do.
  const result = await h.php<{ code: string; message: string }>(`
    $_SERVER['REQUEST_URI'] = '/wp-admin/admin.php?page=pirax-probe&_wpnonce=pirax-inbound-nonce&q=pirax-inbound-secret';
    $r = wp_remote_post('https://api.example.test/collect?key=pirax-query-secret', ['body' => ['field' => 'pirax-body-secret']]);
    return is_wp_error($r) ? ['code' => $r->get_error_code(), 'message' => $r->get_error_message()] : ['code' => 'sent', 'message' => ''];
  `);
  expect(result).toEqual({ code: "http_request_failed", message: "Pirax harness: third-party HTTP is contained" });
  const [record] = (await h.http()).slice(before);
  expect(record).toMatchObject({ purpose: "blocked", method: "POST", host: "api.example.test", path: "/collect", request: "/wp-admin/admin.php", carriesToken: false });
  for (const value of ["pirax-query-secret", "pirax-body-secret", "pirax-inbound-secret", "pirax-inbound-nonce", "_wpnonce", "?"]) expect(JSON.stringify(record)).not.toContain(value);
});

test("Pro feature fixtures write native settings that Pro's own getters read", async () => {
  const read = `
    $id = ${h.fixtures.ff};
    $optin = (new \\FluentFormPro\\classes\\DoubleOptin())->getDoubleOptinSettings($id, 'public');
    $approval = new \\FluentFormPro\\classes\\AdminApproval\\AdminApproval();
    return ['optin' => $optin['status'] ?? null, 'approval' => $approval->isEnabled() && 'yes' === \\FluentForm\\App\\Helpers\\Helper::getFormMeta($id, 'admin_approval_settings', [])['status'],
      'autoDelete' => \\FluentForm\\App\\Helpers\\Helper::isEntryAutoDeleteEnabled($id)];`;
  expect(await h.php<any>(read)).toEqual({ optin: "no", approval: false, autoDelete: false });
  await h.php(`foreach (['double_optin', 'admin_approval', 'auto_delete'] as $f) pirax_harness_ff_pro_feature(${h.fixtures.ff}, $f, true); return true;`);
  expect(await h.php<any>(read)).toEqual({ optin: "yes", approval: true, autoDelete: true });
  await h.php(`foreach (['double_optin', 'admin_approval', 'auto_delete'] as $f) pirax_harness_ff_pro_feature(${h.fixtures.ff}, $f, false); return true;`);
  expect(await h.php<any>(read)).toEqual({ optin: "no", approval: false, autoDelete: false });
});

test("ordinary FF and GF controls reach CleanTalk moderation, the Pro webhook and FluentSMTP's Simulator", async () => {
  const { context, page } = await h.browser("stack-controls");
  const http0 = (await h.http()).length;
  const env0 = (await h.envelopes()).length;
  const sim0 = (await h.simulator()).length;
  const entries0 = await h.entries();
  try {
    await page.goto(h.fixtures.page);
    const ff = page.locator(`form[data-form_id='${h.fixtures.ff}']`);
    await ff.locator("input[name='names[first_name]']").fill("Stack");
    await ff.locator("input[name='email']").fill("visitor@example.test");
    await ff.locator("textarea[name='message']").fill("ff ordinary stack control");
    await ff.locator("button[type=submit]").click();
    await page.locator(".ff-message-success").waitFor();

    await page.goto(h.fixtures.page);
    const gf = page.locator(`#gform_${h.fixtures.gf}`);
    await gf.locator("input[name='input_1']").fill("Stack Visitor");
    await gf.locator("input[name='input_2']").fill("visitor@example.test");
    await gf.locator("textarea[name='input_3']").fill("gf ordinary stack control");
    await gf.locator("[type=submit]").click();
    await page.locator(".gform_confirmation_message").waitFor();
  } finally {
    await h.closeBrowser(context);
  }

  const entries = await h.entries();
  expect(entries.ff).toBe(entries0.ff + 1);
  expect(entries.gf).toBe(entries0.gf + 1);
  const ffEntry = Math.max(...entries.rows.filter((r) => r.plugin === "ff").map((r) => r.id));

  // Pro's webhook is queued natively; nothing reaches the capture URL until the FF runner drains it.
  const moderation = (await h.http()).slice(http0);
  expect(moderation.filter((r) => r.purpose === "webhook-capture")).toEqual([]);
  const ctFf = moderation.filter((r) => r.purpose === "cleantalk-moderation" && r.hooks.includes("fluentform/before_insert_submission"));
  const ctGf = moderation.filter((r) => r.purpose === "cleantalk-moderation" && r.hooks.includes("gform_entry_is_spam"));
  expect(ctFf.length).toBeGreaterThanOrEqual(1);
  expect(ctGf.length).toBeGreaterThanOrEqual(1);
  expect(ctFf[0]).toMatchObject({ method: "POST", api: "check_message" });

  await h.drainQueues();
  const captures = (await h.http()).slice(http0).filter((r) => r.purpose === "webhook-capture");
  expect(captures).toEqual([expect.objectContaining({ method: "POST", entry: ffEntry, hooks: expect.arrayContaining(["fluentform/integration_notify_fluentform_webhook_feed"]) })]);
  expect((await h.feeds()).map((f) => f.plugin).sort()).toEqual(["ff", "gf"]);

  // FluentSMTP's wp_mail hands the original envelope to its Simulator provider, which logs it.
  const envelopes = (await h.envelopes()).slice(env0);
  const sim = (await h.simulator()).slice(sim0);
  for (const [plugin, form] of [["gf", h.fixtures.gf], ["ff", h.fixtures.ff]] as const) {
    const mine = envelopes.filter((e) => e.subject.startsWith(`${plugin}-${form} notification`));
    expect(mine.map((e) => e.to.join(",")).sort()).toEqual(["owner-2@client.test", "owner@client.test"]);
    for (const e of mine) expect(e).toMatchObject({ transport: "fluentsmtp-simulator", cc: ["cc@client.test"], bcc: ["bcc@client.test"] });
    expect(sim.filter((s) => s.subject.startsWith(`${plugin}-${form} notification`)).map((s) => s.to.join(",")).sort()).toEqual(["owner-2@client.test", "owner@client.test"]);
  }
  expect(sim.every((s) => s.provider === "Simulator" && s.status === "sent" && s.headers.includes("content-type: text/html"))).toBe(true);
  expect(envelopes.every((e) => e.transport === "fluentsmtp-simulator")).toBe(true);
  // A successful moderation answer keeps CleanTalk on the WordPress HTTP API (no direct-transport fallback).
  expect(await h.php<number>(`global $apbct; return (int) $apbct->settings['wp__use_builtin_http_api'];`)).toBe(1);
}, 300_000);

test("evidence names every version and ZIP hash and retains no token, licensed path or third-party response", async () => {
  const evidence = await h.saveEvidence();
  expect(evidence.files).toEqual(expect.arrayContaining(["http.jsonl", "envelopes.jsonl", "simulator.jsonl", "manifest.json"]));
  const manifest = await Bun.file(`${h.artifactDir}/manifest.json`).json();
  expect(manifest.versions).toEqual(h.versions);
  expect(Object.keys(manifest.zips).sort()).toEqual(["cleantalk", "fluentSmtp", "fluentform", "fluentformpro", "gravityforms"]);
  for (const hash of Object.values(manifest.zips)) expect(hash).toMatch(/^[0-9a-f]{64}$/);
  const secrets = [h.token, process.env.GRAVITY_FORMS_ZIP!, process.env.FLUENT_FORMS_PRO_ZIP!];
  expect(await findSecret(h.artifactDir, secrets)).toEqual([]);
  // Real activation and admin requests included: no retained HTTP record keeps an incoming query.
  const http = (await Bun.file(`${h.artifactDir}/http.jsonl`).text()).trim().split("\n").map((l) => JSON.parse(l));
  expect(http.length).toBeGreaterThan(0);
  expect(http.filter((r) => r.request.includes("?") || r.path.includes("?")).length).toBe(0);
  expect(await Bun.$`unzip -Z1 ${evidence.trace!}`.text()).not.toMatch(/\.(jpe?g|png|webm)$/m);

  // The browser reached nothing but the loopback site.
  const network = (await Bun.file(`${h.artifactDir}/network.jsonl`).text()).trim().split("\n").map((l) => JSON.parse(l));
  const external = network.filter((r) => /^https?:/.test(r.url) && new URL(r.url).hostname !== "127.0.0.1");
  expect(external.length).toBeGreaterThan(0); // CleanTalk's bot detector was attempted ...
  expect(external.filter((r) => r.status !== null)).toEqual([]); // ... and blocked, like everything third-party
});
