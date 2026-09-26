// Production plugin core against real WordPress (plan D1–D5, D12; AC1–AC3, AC6, AC8): build/upload,
// capability+nonce protected settings, marker parsing/context and final wp_mail transformation.
// Adapters (GF/FF), compatibility preflight and the sweep are covered by the next unit's suites.
// bun --env-file=/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/.env test test/plugin/core.test.ts
import { afterAll, beforeAll, expect, setDefaultTimeout, test } from "bun:test";
import { createHash } from "node:crypto";
import { readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { BrowserContext, Page } from "playwright";
import { findSecret } from "./artifacts";
import { startHarness, type Harness } from "./harness";

// Playground round trips exceed Bun's 5 s default. Bun 1.4 scopes this to the calling file, so every suite sets it.
setDefaultTimeout(180_000);

const ROOT = resolve(import.meta.dir, "../..");
const ZIP = join(ROOT, "dist/pirax-form-test.zip");
const PLUGIN = "pirax-form-test/pirax-form-test.php";
const F = "\\Pirax\\FormTest\\";
const REDIRECT = "form-tests+pirax@operator.test";
const SETTINGS = "/wp-admin/options-general.php?page=pirax-form-test";
const PRODUCTION_FILES = [
  "pirax-form-test/README.md",
  "pirax-form-test/includes/cleanup.php",
  "pirax-form-test/includes/compatibility.php",
  "pirax-form-test/includes/fluent-forms.php",
  "pirax-form-test/includes/gravity-forms.php",
  "pirax-form-test/includes/mail.php",
  "pirax-form-test/includes/marker.php",
  "pirax-form-test/includes/settings.php",
  "pirax-form-test/pirax-form-test.php",
  "pirax-form-test/uninstall.php",
];

const sha = (s: string) => createHash("sha256").update(s).digest("hex");
/** A PHP expression decoding a JSON value (single-quoted literal, so `$` and `\` stay literal). */
const lit = (v: unknown) => `json_decode('${JSON.stringify(v).replace(/\\/g, "\\\\").replace(/'/g, "\\'")}', true)`;

let h: Harness;
let admin: { context: BrowserContext; page: Page };
beforeAll(async () => {
  h = await startHarness({ run: "core" });
}, 600_000);
afterAll(async () => {
  await h?.stop();
}, 60_000);

const settings = () =>
  h.php<{ token: string; redirect: string; autoload: Record<string, string> }>(`
    global $wpdb;
    $autoload = [];
    foreach (['pirax_form_test_token', 'pirax_form_test_redirect'] as $name) {
      $autoload[$name] = (string) $wpdb->get_var($wpdb->prepare("SELECT autoload FROM {$wpdb->options} WHERE option_name = %s", $name));
    }
    return ['token' => hash('sha256', (string) get_option('pirax_form_test_token')), 'redirect' => (string) get_option('pirax_form_test_redirect'), 'autoload' => $autoload];
  `);

async function login(page: Page, user: { login: string; password: string }) {
  await page.goto(`${h.url}/wp-login.php`);
  await page.fill("#user_login", user.login);
  await page.fill("#user_pass", user.password);
  await page.click("#wp-submit");
  await page.waitForURL(/\/wp-admin\/?/);
}

/** Mail logged by the harness mu-plugin while `code` runs; `code` returns anything JSON-encodable. */
async function mailDuring<T>(code: string) {
  const before = (await h.mail()).length;
  const value = await h.php<T>(code);
  return { value, mail: (await h.mail()).slice(before) };
}

test("build:plugin produces only the allowlisted uploadable ZIP with no tests, secrets or licensed code", async () => {
  const build = await Bun.$`bun run build:plugin`.cwd(ROOT).quiet().nothrow();
  expect(build.exitCode).toBe(0);
  expect(await readdir(join(ROOT, "dist"))).toEqual(["pirax-form-test.zip"]);
  const entries = (await Bun.$`unzip -Z1 ${ZIP}`.text()).trim().split("\n");
  for (const entry of entries) expect(entry.startsWith("pirax-form-test/")).toBe(true);
  expect(entries.filter((e) => !e.endsWith("/")).sort()).toEqual(PRODUCTION_FILES);
  // Code only: comments may name wp_mail() when documenting what the filters do.
  const source = (await Bun.$`unzip -p ${ZIP} ${"*.php"}`.text()).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  expect(source).not.toMatch(/register_rest_route|rest_api_init|\bwp_mail\s*\(|PHPMailer|PIRAX_FORM_TEST_HARNESS/);
  expect(await findSecret(join(ROOT, "dist"), [h.token, process.env.GRAVITY_FORMS_ZIP ?? ""])).toEqual([]);
});

test("generated ZIP uploads and activates through wp-admin without Gravity Forms or Fluent Forms", async () => {
  const inactive = await h.php<string[]>(`
    require_once ABSPATH . 'wp-admin/includes/plugin.php';
    deactivate_plugins(['gravityforms/gravityforms.php', 'fluentform/fluentform.php']);
    return get_option('active_plugins');
  `);
  expect(inactive).not.toContain("gravityforms/gravityforms.php");
  expect(inactive).not.toContain("fluentform/fluentform.php");

  admin = await h.browser("core-install-settings");
  const { page } = admin;
  await login(page, h.users.admin);
  await h.uploadPlugin(page, ZIP);

  const state = await h.php<{ active: string[]; forms: boolean[]; events: number; rest: string[]; options: Record<string, string> }>(`
    global $wpdb;
    $events = 0;
    foreach (_get_cron_array() as $hooks) { $events += count($hooks['pirax_form_test_sweep'] ?? []); }
    return [
      'active' => get_option('active_plugins'),
      'forms' => [class_exists('GFForms', false), defined('FLUENTFORM_VERSION')],
      'events' => $events,
      'rest' => array_values(array_filter(array_keys(rest_get_server()->get_routes()), fn($r) => stripos($r, 'pirax') !== false)),
      'options' => $wpdb->get_results("SELECT option_name, autoload FROM {$wpdb->options} WHERE option_name LIKE 'pirax\\\\_form\\\\_test\\\\_%'", OBJECT_K),
    ];
  `);
  expect(state.active).toContain(PLUGIN);
  expect(state.forms).toEqual([false, false]);
  expect(state.events).toBe(1);
  expect(state.rest).toEqual([]);
  expect(Object.keys(state.options).sort()).toEqual(["pirax_form_test_redirect", "pirax_form_test_token"]);
  for (const row of Object.values(state.options) as any[]) expect(["off", "no"]).toContain(row.autoload);

  // Settings → Pirax Form Test, as the real administrator.
  await page.goto(`${h.url}/wp-admin/`);
  await page.hover("#menu-settings");
  await page.click(`#menu-settings a[href$="page=pirax-form-test"]`);
  await page.waitForURL(/page=pirax-form-test/);
  expect(await page.locator("h1").innerText()).toBe("Pirax Form Test");
  expect(await page.locator("#pirax-form-test-token-status").innerText()).toMatch(/not set/i);
  await page.fill("#pirax_form_test_token", h.token);
  await page.fill("#pirax_form_test_redirect", REDIRECT);
  await page.click("#submit");
  await page.locator(".notice-success").waitFor();
  expect(await page.locator("#pirax-form-test-token-status").innerText()).toMatch(/is set/i);
  expect(await page.inputValue("#pirax_form_test_token")).toBe("");
  expect(await page.content()).not.toContain(h.token);

  const saved = await settings();
  expect(saved.token).toBe(sha(h.token));
  expect(saved.redirect).toBe(REDIRECT);
  for (const autoload of Object.values(saved.autoload)) expect(["off", "no"]).toContain(autoload);

  // Supported form plugins come back without a fatal error next to the core.
  const back = await h.php<string[]>(`
    require_once ABSPATH . 'wp-admin/includes/plugin.php';
    foreach (['gravityforms/gravityforms.php', 'fluentform/fluentform.php'] as $p) { $r = activate_plugin($p); if (is_wp_error($r)) throw new RuntimeException($r->get_error_message()); }
    return get_option('active_plugins');
  `);
  expect(back).toEqual(expect.arrayContaining([PLUGIN, "gravityforms/gravityforms.php", "fluentform/fluentform.php"]));
  await page.goto(`${h.url}${SETTINGS}`);
  expect(await page.locator("h1").innerText()).toBe("Pirax Form Test");
}, 300_000);

test("settings mutate only for manage_options with a valid nonce and valid values", async () => {
  const { page } = admin;
  const good = await settings();
  await page.goto(`${h.url}${SETTINGS}`);
  const nonce = await page.inputValue("#pirax-form-test-settings input[name=_wpnonce]");
  const post = (request: Page["request"], form: Record<string, string>) =>
    request.post(`${h.url}/wp-admin/admin-post.php`, { form: { action: "pirax_form_test_save", ...form }, maxRedirects: 0 });

  // Admin with a valid nonce, invalid values: rejected, nothing changes.
  const invalid: [Record<string, string>, string][] = [
    [{ pirax_form_test_redirect: "a@operator.test, b@operator.test" }, "invalid-redirect"],
    [{ pirax_form_test_redirect: "ops@operator.test\r\nBcc: leak@client.test" }, "invalid-redirect"],
    [{ pirax_form_test_redirect: "ops@operator.test\n" }, "invalid-redirect"],
    [{ pirax_form_test_redirect: "not-an-address" }, "invalid-redirect"],
    [{ pirax_form_test_redirect: "" }, "redirect-required"],
    [{ pirax_form_test_redirect: REDIRECT, pirax_form_test_token: "short" }, "invalid-token"],
    [{ pirax_form_test_redirect: REDIRECT, pirax_form_test_token: "x".repeat(20) + "\n" }, "invalid-token"],
    [{ pirax_form_test_redirect: REDIRECT, pirax_form_test_token: "has space in it 1234" }, "invalid-token"],
  ];
  for (const [form, code] of invalid) {
    const response = await post(page.request, { _wpnonce: nonce, ...form });
    expect(response.status()).toBe(302);
    expect(response.headers().location).toContain(`pirax-form-test=${code}`);
    expect(await settings()).toEqual(good);
  }

  // Missing or forged nonce: WordPress refuses before any mutation.
  const badNonces: Record<string, string>[] = [{}, { _wpnonce: "0123456789" }];
  for (const form of badNonces) {
    const response = await post(page.request, { ...form, pirax_form_test_redirect: "other@operator.test", pirax_form_test_clear: "1" });
    expect(response.status()).toBe(403);
    expect(await settings()).toEqual(good);
  }

  // Logged out: admin-post has no nopriv handler.
  const anonymous = await fetch(`${h.url}/wp-admin/admin-post.php`, {
    method: "POST",
    body: new URLSearchParams({ action: "pirax_form_test_save", _wpnonce: nonce, pirax_form_test_clear: "1" }),
    redirect: "manual",
  });
  expect(anonymous.status).toBeGreaterThanOrEqual(400);
  expect(await settings()).toEqual(good);

  // Non-admin roles: no menu, no page, and even a valid nonce for their own session cannot save.
  for (const role of ["editor", "subscriber"] as const) {
    const other = await h.browser(`core-settings-${role}`);
    try {
      await login(other.page, h.users[role]);
      expect(await other.page.locator(`a[href$="page=pirax-form-test"]`).count()).toBe(0);
      const denied = await other.page.goto(`${h.url}${SETTINGS}`);
      expect(denied?.status()).toBe(403);
      expect(await other.page.locator("#pirax-form-test-settings").count()).toBe(0);
      const cookie = (await other.context.cookies()).find((c) => c.name.startsWith("wordpress_logged_in_"))!;
      const ownNonce = await h.php<string>(`
        $_COOKIE[LOGGED_IN_COOKIE] = ${lit(decodeURIComponent(cookie.value))};
        wp_set_current_user(${h.users[role].id});
        return wp_create_nonce('pirax_form_test_save');
      `);
      const response = await post(other.page.request, { _wpnonce: ownNonce, pirax_form_test_redirect: "other@operator.test", pirax_form_test_clear: "1" });
      expect(response.status()).toBe(403);
      expect(await settings()).toEqual(good);
    } finally {
      await h.closeBrowser(other.context);
    }
  }

  // A blank token field keeps the stored token; the redirect can change on its own.
  await page.fill("#pirax_form_test_redirect", `x${REDIRECT}`);
  await page.click("#submit");
  await page.locator(".notice-success").waitFor();
  expect(await settings()).toEqual({ ...good, redirect: `x${REDIRECT}` });

  // Clearing the token disables marker behaviour entirely.
  await page.check("#pirax_form_test_clear");
  await page.click("#submit");
  await page.locator(".notice-success").waitFor();
  expect(await page.locator("#pirax-form-test-token-status").innerText()).toMatch(/not set/i);
  expect((await settings()).token).toBe(sha(""));
  const disabled = await h.php<any>(`
    return ['parse' => ${F}parse(['field' => ${lit(h.token)} . '-abc123']), 'mark' => is_wp_error(${F}mark('abc123')), 'id' => ${F}current_id()];
  `);
  expect(disabled).toEqual({ parse: { state: "ordinary", id: null, reason: null }, mark: true, id: null });

  await page.fill("#pirax_form_test_token", h.token);
  await page.fill("#pirax_form_test_redirect", REDIRECT);
  await page.click("#submit");
  await page.locator(".notice-success").waitFor();
  expect(await page.content()).not.toContain(h.token);
  expect(await settings()).toEqual(good);
}, 300_000);

test("marker parser classifies submitted values: ordinary, marked(id) or invalid-marker", async () => {
  const T = "Tok.en+*(x)$%_[a]\\/";
  const W = "syntheticTOKEN123456";
  const ordinary = { state: "ordinary", id: null, reason: null };
  const marked = (id: string) => ({ state: "marked", id, reason: null });
  const malformed = { state: "invalid-marker", id: null, reason: "malformed" };
  const ambiguous = { state: "invalid-marker", id: null, reason: "ambiguous" };
  const id32 = "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6";
  const cases: [string, unknown, string, object][] = [
    ["plain values", { name: "Visitor", email: "v@example.test" }, T, ordinary],
    ["scalar value", `${T}-abc123`, T, marked("abc123")],
    ["nested field", { name: { first: "x", last: { deep: `hi ${T}-abc123 there` } } }, T, marked("abc123")],
    ["multi-value field", { choices: ["one", `${T}-abc123`] }, T, marked("abc123")],
    ["marker only in a key", { [`${T}-abc123`]: "x" }, T, ordinary],
    ["email suffix", { email: `${T}-abc123@example.test` }, T, marked("abc123")],
    ["plus-address", { email: `ops+${T}-abc123@example.test` }, T, marked("abc123")],
    ["32-character id", { m: `${T}-${id32}` }, T, marked(id32)],
    ["33-character id is not truncated", { m: `${T}-${id32}q` }, T, malformed],
    ["5-character id", { m: `${T}-abc12` }, T, malformed],
    ["uppercase id", { m: `${T}-ABC123` }, T, malformed],
    ["id followed by uppercase", { m: `${T}-abc123X` }, T, malformed],
    ["id followed by underscore", { m: `${T}-abc123_x` }, T, malformed],
    ["id followed by hyphen", { m: `${T}-abc123-x` }, T, malformed],
    ["secret alone", { m: T }, T, malformed],
    ["secret and hyphen", { m: `${T}-` }, T, malformed],
    ["secret with suffix", { m: `${T}X-abc123` }, T, malformed],
    ["same id twice", { a: `${T}-abc123`, b: [`again ${T}-abc123`] }, T, marked("abc123")],
    ["different ids", { a: `${T}-abc123`, b: `${T}-def456` }, T, ambiguous],
    ["valid and malformed", { a: `${T}-abc123`, b: `${T}-BAD` }, T, malformed],
    ["regex dot is literal", { m: "abc-abc123" }, "a.c", ordinary],
    ["metacharacters are literal", { m: "TokXen+*(x)$%_[a]\\/-abc123" }, T, ordinary],
    ["wrong token", { m: `${W.slice(0, -1)}7-abc123` }, W, ordinary],
    ["truncated token", { m: `${W.slice(0, -1)}-abc123` }, W, ordinary],
    ["empty token disables", { m: `${W}-abc123` }, "", ordinary],
    ["non-string leaves", { n: 5, f: 1.5, b: true, z: null, e: [] }, W, ordinary],
  ];
  const results = await h.php<object[]>(`
    return array_map(fn($c) => ${F}parse($c[1], $c[2]), ${lit(cases)});
  `);
  cases.forEach(([label, , , expected], i) => expect({ label, ...results[i] }).toEqual({ label, ...expected }));

  // Without an explicit token the configured option is used.
  expect(
    await h.php<{ state: string; id: string | null; reason: string | null }>(`return ${F}parse(['f' => ['x' => get_option('pirax_form_test_token') . '-abc123@example.test']]);`),
  ).toEqual(marked("abc123"));
});

test("request marker and stacked worker context; nothing is inherited by another request", async () => {
  const request = await h.php<any>(`
    $r = ['start' => ${F}current_id()];
    $e = ${F}mark('ABC123');
    $r['bad'] = is_wp_error($e) ? $e->get_error_code() : $e;
    $r['ok'] = ${F}mark('abc123');
    $r['again'] = ${F}mark('abc123');
    $e = ${F}mark('def456');
    $r['other'] = is_wp_error($e) ? $e->get_error_code() : $e;
    $r['id'] = ${F}current_id();
    ${F}push_context(null);
    $r['unmarkedWorker'] = ${F}current_id();
    ${F}pop_context();
    return $r;
  `);
  expect(request).toEqual({ start: null, bad: "pirax_form_test_marker", ok: true, again: true, other: "pirax_form_test_marker", id: "abc123", unmarkedWorker: "abc123" });

  const stack = await h.php<any>(`
    $r = [${F}current_id()];
    ${F}push_context('aaa111'); $r[] = ${F}current_id();
    ${F}push_context('bbb222'); $r[] = ${F}current_id();
    ${F}push_context(null);     $r[] = ${F}current_id();
    ${F}pop_context();          $r[] = ${F}current_id();
    ${F}pop_context();          $r[] = ${F}current_id();
    ${F}pop_context();          $r[] = ${F}current_id();
    ${F}pop_context();          $r[] = ${F}current_id();
    try { ${F}push_context('Bad!'); $r[] = 'accepted'; } catch (InvalidArgumentException $e) { $r[] = 'rejected'; }
    $r[] = ${F}current_id();
    return $r;
  `);
  expect(stack).toEqual([null, "aaa111", "bbb222", "bbb222", "bbb222", "aaa111", null, null, "rejected", null]);
  expect(await h.php(`return ${F}current_id();`)).toBeNull();
});

test("wp_mail in marked context is redirected, stripped and tagged; ordinary mail is untouched", async () => {
  const ordinary = await mailDuring<boolean>(`
    return wp_mail(['owner@client.test', 'second@client.test'], 'Hello', 'Body', ['Cc: cc@client.test', 'Bcc: bcc@client.test', 'X-Other: 1']);
  `);
  expect(ordinary.value).toBe(true);
  expect(ordinary.mail).toHaveLength(1);
  expect(ordinary.mail[0]).toMatchObject({
    to: ["owner@client.test", "second@client.test"],
    subject: "Hello",
    headers: ["Cc: cc@client.test", "Bcc: bcc@client.test", "X-Other: 1"],
  });

  const marked = await mailDuring<{ sent: boolean[]; idempotent: boolean; tags: number }>(`
    if (true !== ${F}mark('abc123')) throw new RuntimeException('mark failed');
    $sent = [];
    $sent[] = wp_mail(
      ['owner@client.test', 'second@client.test'],
      'Hello',
      "Body\\r\\nline 2",
      "From: Site <wordpress@site.test>\\r\\nCC: cc1@client.test,\\r\\n cc2@client.test\\r\\nbcc: bcc@client.test\\r\\nReply-To: visitor@example.test\\r\\nX-Pirax-Form-Test: evil\\r\\nX-Keep: yes\\r\\nContent-Type: text/plain; charset=UTF-8",
      ['/tmp/attachment.txt']
    );
    $sent[] = wp_mail(
      'a@client.test, b@client.test',
      '[pirax-test abc123] Already',
      'Body 2',
      ["CC: a@client.test,\\r\\n\\tb@client.test", 'BCC:z@client.test', 'To: extra@client.test', 'Resent-Bcc: r@client.test', 'x-pirax-form-test: other', "X-A: 1\\r\\nCc: hidden@client.test", 'X-Keep: 2']
    );
    $once = apply_filters('wp_mail', ['to' => 'o@client.test', 'subject' => 'S', 'message' => 'M', 'headers' => 'Cc: c@client.test', 'attachments' => []]);
    $twice = apply_filters('wp_mail', $once);
    return ['sent' => $sent, 'idempotent' => $once === $twice, 'tags' => count(preg_grep('/^x-pirax-form-test:/i', (array) $twice['headers']))];
  `);
  expect(marked.value).toEqual({ sent: [true, true], idempotent: true, tags: 1 });
  expect(marked.mail).toHaveLength(2);
  expect(marked.mail[0]).toMatchObject({
    to: [REDIRECT],
    subject: "[pirax-test abc123] Hello",
    message: "Body\r\nline 2",
    headers: [
      "From: Site <wordpress@site.test>",
      "Reply-To: visitor@example.test",
      "X-Keep: yes",
      "Content-Type: text/plain; charset=UTF-8",
      "X-Pirax-Form-Test: abc123",
    ],
    attachments: ["/tmp/attachment.txt"],
  });
  expect(marked.mail[1]).toMatchObject({
    to: [REDIRECT],
    subject: "[pirax-test abc123] Already",
    message: "Body 2",
    headers: ["X-A: 1", "X-Keep: 2", "X-Pirax-Form-Test: abc123"],
  });

  const stacked = await mailDuring<boolean[]>(`
    $s = [];
    ${F}push_context('aaa111'); $s[] = wp_mail('owner@client.test', 'S', 'M');
    ${F}push_context('bbb222'); $s[] = wp_mail('owner@client.test', '[pirax-test aaa111] S', 'M');
    ${F}pop_context();          $s[] = wp_mail('owner@client.test', 'S', 'M');
    ${F}pop_context();          $s[] = wp_mail('owner@client.test', 'S', 'M', 'Cc: cc@client.test');
    return $s;
  `);
  expect(stacked.value).toEqual([true, true, true, true]);
  expect(stacked.mail.map((m) => [m.to, m.subject, m.headers])).toEqual([
    [[REDIRECT], "[pirax-test aaa111] S", ["X-Pirax-Form-Test: aaa111"]],
    [[REDIRECT], "[pirax-test bbb222] S", ["X-Pirax-Form-Test: bbb222"]],
    [[REDIRECT], "[pirax-test aaa111] S", ["X-Pirax-Form-Test: aaa111"]],
    [["owner@client.test"], "S", ["Cc: cc@client.test"]],
  ]);
});

test("a bad redirect fails before marking and marked mail is never delivered to original recipients", async () => {
  for (const bad of ["ops@operator.test, owner@client.test", "ops@operator.test\r\nBcc: leak@client.test", ""]) {
    await h.php(`update_option('pirax_form_test_redirect', ${lit(bad)}, false); return true;`);
    const result = await mailDuring<any>(`
      $failed = [];
      add_action('wp_mail_failed', function ($e) use (&$failed) { $failed[] = $e->get_error_code(); });
      $e = ${F}mark('abc123');
      $r = ['mark' => is_wp_error($e) ? $e->get_error_code() : $e, 'id' => ${F}current_id()];
      ${F}push_context('abc123');
      $r['sent'] = wp_mail('owner@client.test', 'S', 'M', 'Cc: cc@client.test');
      $r['failed'] = $failed;
      return $r;
    `);
    expect(result.value).toEqual({ mark: "pirax_form_test_config", id: null, sent: false, failed: ["pirax_form_test_config"] });
    expect(result.mail).toEqual([]);
  }
  await h.php(`update_option('pirax_form_test_redirect', ${lit(REDIRECT)}, false); return true;`);
  expect((await settings()).redirect).toBe(REDIRECT);
});

test("the core never marks a request from query strings, cookies or arbitrary POST data", async () => {
  const marker = `${h.token}-abc123`;
  const before = (await h.mail()).length;
  const response = await fetch(`${h.url}/wp-login.php?action=lostpassword&m=${encodeURIComponent(marker)}`, {
    method: "POST",
    headers: { cookie: `pirax=${encodeURIComponent(marker)}`, "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ user_login: h.users.admin.login, [marker]: "1", note: marker, "wp-submit": "Get New Password" }),
    redirect: "manual",
  });
  await response.text();
  const mail = (await h.mail()).slice(before);
  expect(mail).toHaveLength(1);
  expect(mail[0]!.to).not.toContain(REDIRECT);
  expect(mail[0]!.subject.startsWith("[pirax-test")).toBe(false);
  expect(mail[0]!.headers.join("\n")).not.toMatch(/x-pirax-form-test/i);
});

test("deactivation unschedules, uninstall is guarded and removes options and owned events", async () => {
  await h.closeBrowser(admin.context);
  const events = `$n = 0; foreach (_get_cron_array() as $hooks) { $n += count($hooks['pirax_form_test_sweep'] ?? []); }`;

  const deactivated = await h.php<any>(`
    require_once ABSPATH . 'wp-admin/includes/plugin.php';
    deactivate_plugins('${PLUGIN}');
    ${events}
    return ['events' => $n, 'options' => [get_option('pirax_form_test_redirect'), hash('sha256', (string) get_option('pirax_form_test_token'))]];
  `);
  expect(deactivated).toEqual({ events: 0, options: [REDIRECT, sha(h.token)] });

  const reactivated = await h.php<number>(`
    require_once ABSPATH . 'wp-admin/includes/plugin.php';
    $r = activate_plugin('${PLUGIN}');
    if (is_wp_error($r)) throw new RuntimeException($r->get_error_message());
    ${F}activate();
    ${events}
    return $n;
  `);
  expect(reactivated).toBe(1);

  // Direct HTTP access to uninstall.php is inert.
  await (await fetch(`${h.url}/wp-content/plugins/pirax-form-test/uninstall.php`)).text();
  expect((await settings()).redirect).toBe(REDIRECT);

  const uninstalled = await h.php<any>(`
    global $wpdb;
    require_once ABSPATH . 'wp-admin/includes/plugin.php';
    require_once ABSPATH . 'wp-admin/includes/file.php';
    if (!defined('FS_METHOD')) define('FS_METHOD', 'direct');
    wp_set_current_user(1);
    deactivate_plugins('${PLUGIN}');
    wp_schedule_event(time() + 60, 'hourly', 'pirax_form_test_sweep'); // a stray owned event
    $deleted = delete_plugins(['${PLUGIN}']);
    ${events}
    return [
      'deleted' => $deleted,
      'events' => $n,
      'rows' => (int) $wpdb->get_var("SELECT COUNT(*) FROM {$wpdb->options} WHERE option_name IN ('pirax_form_test_token', 'pirax_form_test_redirect')"),
      'dir' => is_dir(WP_PLUGIN_DIR . '/pirax-form-test'),
    ];
  `);
  expect(uninstalled).toEqual({ deleted: true, events: 0, rows: 0, dir: false });

  const evidence = await h.saveEvidence();
  expect(evidence.trace).toMatch(/\.trace\.zip$/);
  expect(await findSecret(h.artifactDir, [h.token])).toEqual([]);
}, 120_000);
