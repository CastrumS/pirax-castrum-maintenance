// GF/FF adapters, compatibility preflight and recovery sweep against real Gravity Forms and Fluent Forms
// (plan D6–D9; AC2–AC7). Forms are submitted in headless Chromium; queues run in separate native requests.
// bun --env-file=/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/.env test test/plugin/adapters.test.ts --timeout 180000
import { afterAll, beforeAll, expect, test } from "bun:test";
import { appendFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { BrowserContext, Page } from "playwright";
import { findSecret } from "./artifacts";
import { startHarness, type Harness, type MailRecord } from "./harness";

const ROOT = resolve(import.meta.dir, "../..");
const ZIP = join(ROOT, "dist/pirax-form-test.zip");
const REDIRECT = "form-tests+pirax@operator.test";
const ID = "abc123";
const BLOCKED = "Pirax test blocked: integrations could not be suppressed";
const MARKER = "Pirax test blocked: invalid test marker";
const CONFIG = "Pirax test blocked: test configuration is invalid";
const WRONG = "pirax-wrong-token-00000000";
const DUMMY_CAPTCHA = "pirax-dummy-recaptcha-response";

/** A PHP expression decoding a JSON value (single-quoted literal, so `$` and `\` stay literal). */
const lit = (v: unknown) => `json_decode('${JSON.stringify(v).replace(/\\/g, "\\\\").replace(/'/g, "\\'")}', true)`;

let h: Harness;
let visitor: { context: BrowserContext; page: Page };
let marker: string;

beforeAll(async () => {
  const build = await Bun.$`bun run build:plugin`.cwd(ROOT).quiet().nothrow();
  if (build.exitCode !== 0) throw new Error(`build:plugin failed: ${build.stderr}`);
  h = await startHarness({ run: "adapters" });
  marker = `${h.token}-${ID}`;

  const admin = await h.browser("adapters-install");
  await admin.page.goto(`${h.url}/wp-login.php`);
  await admin.page.fill("#user_login", h.users.admin.login);
  await admin.page.fill("#user_pass", h.users.admin.password);
  await admin.page.click("#wp-submit");
  await admin.page.waitForURL(/\/wp-admin\/?/);
  await h.uploadPlugin(admin.page, ZIP);
  await h.closeBrowser(admin.context);
  await setOptions({ pirax_form_test_token: h.token, pirax_form_test_redirect: REDIRECT });

  visitor = await h.browser("adapters-visitor");
  // Local, deterministic reCAPTCHA widget: Google's script is not loaded and each test supplies a
  // dummy response, which the real plugin validation sends to (harness-answered) siteverify.
  await visitor.context.route(/^https:\/\/www\.(google|gstatic|recaptcha)\.(com|net)\/recaptcha\//, (route) =>
    route.fulfill({ contentType: "text/javascript", body: "" }),
  );
}, 600_000);

afterAll(async () => {
  if (visitor) await h.closeBrowser(visitor.context).catch(() => {});
  if (h) {
    await h.saveEvidence().catch(() => {});
    await h.stop();
  }
}, 120_000);

/** Native queue/entry states for the run's evidence (ids and statuses only). */
const note = (step: string, data: unknown) => appendFile(join(h.artifactDir, "queue-states.jsonl"), JSON.stringify({ step, data }) + "\n");

const setOptions = (options: Record<string, unknown>) =>
  h.php(`foreach (${lit(options)} as $name => $value) { null === $value ? delete_option($name) : update_option($name, $value, false); } return true;`);

async function counts() {
  return { mail: (await h.mail()).length, feeds: (await h.feeds()).length, entries: await h.entries(), siteverify: (await h.siteverify()).length };
}

type Submitted = { ok: boolean; text: string; insertId?: number; body?: any };

async function gfSubmit(formId: number, url: string, values: Record<string, string>, opts: { captcha?: boolean; honeypot?: boolean } = {}): Promise<Submitted> {
  const { page } = visitor;
  await page.goto(url);
  const form = page.locator(`#gform_${formId}`);
  for (const [name, value] of Object.entries(values)) await form.locator(`[name='${name}']`).fill(value);
  if (opts.captcha)
    await form.evaluate((f, value) => {
      const input = Object.assign(document.createElement("input"), { type: "hidden", name: "g-recaptcha-response", value });
      f.appendChild(input);
    }, DUMMY_CAPTCHA);
  if (opts.honeypot) await form.locator(".gform_validation_container input").evaluate((i: HTMLInputElement) => (i.value = "bot"));
  await form.locator("[type=submit]").click();
  await page.locator(`#gform_confirmation_message_${formId}, #gform_${formId}_validation_container`).first().waitFor();
  const ok = (await page.locator(`#gform_confirmation_message_${formId}`).count()) > 0;
  const text = await page.locator(ok ? `#gform_confirmation_message_${formId}` : `#gform_wrapper_${formId}`).innerText();
  return { ok, text };
}

/**
 * Submit a rendered FF form. `direct` posts the form's own serialized data to FF's submit endpoint from
 * the page, as FF's script does, without FF's client-side checks, so server-side rules are what decide.
 */
async function ffSubmit(formId: number, url: string, values: Record<string, string>, opts: { captcha?: boolean; honeypot?: boolean; direct?: boolean } = {}): Promise<Submitted> {
  const { page } = visitor;
  await page.goto(url);
  const form = page.locator(`form[data-form_id='${formId}']`);
  for (const [name, value] of Object.entries(values)) await form.locator(`[name='${name}']`).fill(value);
  if (opts.captcha)
    await form.evaluate((f, value) => {
      const input = Object.assign(document.createElement("input"), { type: "hidden", name: "g-recaptcha-response", value });
      f.appendChild(input);
    }, DUMMY_CAPTCHA);
  if (opts.honeypot) await form.locator(`[name='item_${formId}__fluent_sf']`).evaluate((i: HTMLInputElement) => (i.value = "bot"));
  if (opts.direct) {
    const res = await form.evaluate(async (f: HTMLFormElement, id) => {
      const data = new URLSearchParams(new FormData(f) as any).toString();
      const r = await fetch("/wp-admin/admin-ajax.php", { method: "POST", body: new URLSearchParams({ action: "fluentform_submit", form_id: String(id), data }) });
      return { ok: r.ok, text: await r.text() };
    }, formId);
    return { ok: res.ok, text: res.text };
  }
  const response = page.waitForResponse((r) => r.url().includes("admin-ajax.php") && (r.request().postData() ?? "").includes("action=fluentform_submit"));
  await form.locator("button[type=submit]").click();
  const res = await response;
  const body = await res.json().catch(() => null);
  const ok = res.ok();
  if (ok) await page.locator(".ff-message-success").first().waitFor();
  const insertId = ok ? Number(body?.data?.insert_id ?? body?.insert_id) : undefined;
  return { ok, text: JSON.stringify(body), insertId, body };
}

const gfValues = (message: string, name = "Pirax Visitor") => ({ input_1: name, input_2: "visitor@example.test", input_3: message });
const ffValues = (message: string, first = "Pirax") => ({ "names[first_name]": first, email: "visitor@example.test", message });

function expectRedirected(mails: MailRecord[], id = ID) {
  expect(mails.length).toBeGreaterThan(0);
  for (const m of mails) {
    expect(m.to).toEqual([REDIRECT]);
    expect(m.subject.startsWith(`[pirax-test ${id}] `)).toBe(true);
    expect(m.subject.lastIndexOf("[pirax-test")).toBe(0);
    expect(m.headers.filter((line) => /^x-pirax-form-test\s*:/i.test(line))).toEqual([`X-Pirax-Form-Test: ${id}`]);
    expect(m.headers.some((line) => /^(cc|bcc)\s*:/i.test(line))).toBe(false);
  }
}

function expectOriginal(mails: MailRecord[]) {
  expect(mails.length).toBeGreaterThan(0);
  for (const m of mails) {
    expect(m.to.join(",")).toMatch(/^owner(-\d)?@client\.test$/);
    expect(m.subject).not.toContain("[pirax-test");
    expect(m.headers.join("\n")).toMatch(/^Cc:\s*cc@client\.test/im);
    expect(m.headers.join("\n")).toMatch(/^Bcc:\s*bcc@client\.test/im);
    expect(m.headers.some((line) => /^x-pirax-form-test/i.test(line))).toBe(false);
  }
}

const ffRows = (ids: number[]) =>
  h.php<{ id: number; origin: number; status: string; retries: number; action: string }[]>(`
    global $wpdb;
    $ids = array_map('intval', ${lit(ids)}) ?: [0];
    return array_map(fn($r) => ['id' => (int) $r->id, 'origin' => (int) $r->origin_id, 'status' => $r->status, 'retries' => (int) $r->retry_count, 'action' => $r->action],
      $wpdb->get_results("SELECT * FROM {$wpdb->prefix}ff_scheduled_actions WHERE origin_id IN (" . implode(',', $ids) . ") ORDER BY id"));
  `);

/** Rows still referring to FF submissions/GF entries that no longer exist (deletion must cascade). */
const orphans = () =>
  h.php<Record<string, number>>(`
    global $wpdb; $p = $wpdb->prefix;
    $n = fn($sql) => (int) $wpdb->get_var($sql);
    return [
      'ffMeta' => $n("SELECT COUNT(*) FROM {$p}fluentform_submission_meta m LEFT JOIN {$p}fluentform_submissions s ON s.id = m.response_id WHERE m.response_id > 0 AND s.id IS NULL"),
      'ffDetails' => $n("SELECT COUNT(*) FROM {$p}fluentform_entry_details d LEFT JOIN {$p}fluentform_submissions s ON s.id = d.submission_id WHERE s.id IS NULL"),
      'ffLogs' => $n("SELECT COUNT(*) FROM {$p}fluentform_logs l LEFT JOIN {$p}fluentform_submissions s ON s.id = l.source_id WHERE l.source_type = 'submission_item' AND s.id IS NULL"),
      'ffActions' => $n("SELECT COUNT(*) FROM {$p}ff_scheduled_actions a LEFT JOIN {$p}fluentform_submissions s ON s.id = a.origin_id WHERE s.id IS NULL"),
      'gfMeta' => $n("SELECT COUNT(*) FROM {$p}gf_entry_meta m LEFT JOIN {$p}gf_entry e ON e.id = m.entry_id WHERE e.id IS NULL"),
      'gfNotes' => $n("SELECT COUNT(*) FROM {$p}gf_entry_notes m LEFT JOIN {$p}gf_entry e ON e.id = m.entry_id WHERE e.id IS NULL"),
    ];
  `);
const NO_ORPHANS = { ffMeta: 0, ffDetails: 0, ffLogs: 0, ffActions: 0, gfMeta: 0, gfNotes: 0 };

/** GF field values containing the configured token. */
const gfTokenValues = () =>
  h.php<number>(`global $wpdb; return (int) $wpdb->get_var($wpdb->prepare("SELECT COUNT(*) FROM {$wpdb->prefix}gf_entry_meta WHERE meta_value LIKE %s", '%' . $wpdb->esc_like(get_option('pirax_form_test_token')) . '%'));`);

/** Pending Action Scheduler jobs for FF's feed queue. */
const asPending = () =>
  h.php<number>(`return count(as_get_scheduled_actions(['hook' => 'fluentform/schedule_feed', 'status' => ActionScheduler_Store::STATUS_PENDING, 'per_page' => -1], 'ids'));`);

// ---------------------------------------------------------------------------------------------
// AC2/AC3 — Gravity Forms

test("GF marked browser submission: both notifications redirected synchronously, no feeds, entry deleted after mail", async () => {
  expect(await h.php("return (bool) get_option('gform_enable_async_notifications');")).toBe(true);
  const before = await counts();
  const tokenValues = await gfTokenValues();
  // Later add-on/form-specific filters re-enable feeds and background notifications for every
  // submission, and feeds use GF's background feed processor.
  await setOptions({ pirax_harness_competing_filters: true, pirax_harness_gf_async_feeds: true });
  let result: Submitted;
  try {
    result = await gfSubmit(h.fixtures.gf, h.fixtures.page, gfValues(`Pirax check ${marker}`));
  } finally {
    await setOptions({ pirax_harness_competing_filters: null, pirax_harness_gf_async_feeds: null });
  }
  expect(result.ok).toBe(true);

  // Synchronous despite GF's global background-notification option: sent inside the submit request.
  const queued = await h.queues();
  expect(Object.keys(queued.gf)).toContain("wp_gf_pirax-harness-ledger_feed_processor");
  await note("gf marked: after submit request", { gf: Object.fromEntries(Object.entries(queued.gf).map(([k, v]) => [k, v.active])), actionScheduler: queued.actionScheduler.pending });
  expect(Object.values(queued.gf).some((p) => p.active)).toBe(false);
  const mail = (await h.mail()).slice(before.mail);
  expect(mail.map((m) => m.subject.replace(/notification [AB]$/, "")).sort()).toEqual(
    Array(2).fill(`[pirax-test ${ID}] gf-${h.fixtures.gf} `),
  );
  expectRedirected(mail);
  for (const m of mail) expect(m.request).not.toContain("admin-ajax.php");
  expect(mail.every((m) => m.message.includes("Pirax check"))).toBe(true);

  await h.drainQueues();
  expect((await h.mail()).length).toBe(before.mail + 2);
  expect((await h.feeds()).length).toBe(before.feeds);
  const after = await h.entries();
  expect(after.gf).toBe(before.entries.gf);
  expect(await gfTokenValues()).toBe(tokenValues);
  expect(await orphans()).toEqual(NO_ORPHANS);
  expect(await h.php("return (bool) get_option('gform_enable_async_notifications');")).toBe(true);
}, 180_000);

test("GF controls: unmarked, wrong-token and empty-token submissions keep recipients, feeds and entries", async () => {
  const before = await counts();
  // The ordinary control runs its feed through GF's background feed processor (the marked test's mode).
  await setOptions({ pirax_harness_gf_async_feeds: true });
  try {
    expect((await gfSubmit(h.fixtures.gf, h.fixtures.page, gfValues("ordinary message"))).ok).toBe(true);
    await h.drainQueues();
  } finally {
    await setOptions({ pirax_harness_gf_async_feeds: null });
  }
  const asyncFeed = (await h.feeds()).slice(before.feeds);
  expect(asyncFeed.map((f) => f.plugin)).toEqual(["gf"]);
  expect(asyncFeed[0].request).toMatch(/action=wp_gf_pirax-harness-ledger_feed_processor/);
  expect((await gfSubmit(h.fixtures.gf, h.fixtures.page, gfValues(`Pirax check ${WRONG}-${ID}`))).ok).toBe(true);
  await setOptions({ pirax_form_test_token: "" });
  try {
    expect((await gfSubmit(h.fixtures.gf, h.fixtures.page, gfValues(`Pirax check ${marker}`))).ok).toBe(true);
  } finally {
    await setOptions({ pirax_form_test_token: h.token });
  }
  await h.drainQueues();
  const mail = (await h.mail()).slice(before.mail);
  expect(mail.length).toBe(6);
  expectOriginal(mail);
  expect(mail.every((m) => m.request.includes("admin-ajax.php?action=wp_gf_notifications_processor"))).toBe(true);
  const feeds = (await h.feeds()).slice(before.feeds);
  expect(feeds.map((f) => f.plugin)).toEqual(["gf", "gf", "gf"]);
  expect((await h.entries()).gf).toBe(before.entries.gf + 3);
}, 180_000);

// ---------------------------------------------------------------------------------------------
// AC2/AC3 — Fluent Forms, synchronous email (FF default)

test("FF marked browser submission: both notifications redirected, only the email feed runs, entry and related rows deleted at request end", async () => {
  const before = await counts();
  const result = await ffSubmit(h.fixtures.ff, h.fixtures.page, ffValues(`Pirax check ${marker}`));
  expect(result.ok).toBe(true);
  expect(result.insertId).toBeGreaterThan(0);
  const mail = (await h.mail()).slice(before.mail);
  expect(mail.map((m) => m.subject).sort()).toEqual([
    `[pirax-test ${ID}] ff-${h.fixtures.ff} notification A`,
    `[pirax-test ${ID}] ff-${h.fixtures.ff} notification B`,
  ]);
  expectRedirected(mail);
  // Nothing queued for the ledger integration, and the entry is gone after the submit request.
  expect(await ffRows([result.insertId!])).toEqual([]);
  expect(await asPending()).toBe(0);
  const after = await h.entries();
  expect(after.ff).toBe(before.entries.ff);
  expect(after.rows.some((r) => r.plugin === "ff" && r.id === result.insertId)).toBe(false);
  expect(await orphans()).toEqual(NO_ORPHANS);
  await h.drainQueues();
  expect((await h.feeds()).length).toBe(before.feeds);
  expect((await h.mail()).length).toBe(before.mail + 2);
}, 180_000);

test("FF controls: unmarked, wrong-token and empty-token submissions keep recipients, feeds and entries", async () => {
  const before = await counts();
  const ids: number[] = [];
  ids.push((await ffSubmit(h.fixtures.ff, h.fixtures.page, ffValues("ordinary message"))).insertId!);
  ids.push((await ffSubmit(h.fixtures.ff, h.fixtures.page, ffValues(`Pirax check ${WRONG}-${ID}`))).insertId!);
  await setOptions({ pirax_form_test_token: "" });
  try {
    ids.push((await ffSubmit(h.fixtures.ff, h.fixtures.page, ffValues(`Pirax check ${marker}`))).insertId!);
  } finally {
    await setOptions({ pirax_form_test_token: h.token });
  }
  for (const id of ids) expect(id).toBeGreaterThan(0);
  await h.drainQueues();
  const mail = (await h.mail()).slice(before.mail);
  expect(mail.length).toBe(6);
  expectOriginal(mail);
  expect((await h.feeds()).slice(before.feeds).map((f) => f.entry).sort()).toEqual([...ids].sort());
  const rows = (await h.entries()).rows.filter((r) => r.plugin === "ff").map((r) => r.id);
  for (const id of ids) expect(rows).toContain(id);
}, 180_000);

// ---------------------------------------------------------------------------------------------
// AC4 — CAPTCHA

test("GF reCAPTCHA v2 with failing siteverify: marked passes, unmarked fails; other errors and honeypot still apply", async () => {
  const { gf, page } = h.fixtures.captcha;
  const values = (message: string, name = "Pirax Visitor") => ({ input_1: name, input_2: message });

  let before = await counts();
  const unmarked = await gfSubmit(gf, page, values("ordinary message"), { captcha: true });
  expect(unmarked.ok).toBe(false);
  expect(unmarked.text).toContain("The reCAPTCHA was invalid");
  expect((await h.siteverify()).length).toBe(before.siteverify + 1);
  expect((await h.entries()).gf).toBe(before.entries.gf);

  before = await counts();
  const marked = await gfSubmit(gf, page, values(`Pirax check ${marker}`), { captcha: true });
  expect(marked.ok).toBe(true);
  expect((await h.siteverify()).length).toBe(before.siteverify + 1); // real server-side verification still ran
  const mail = (await h.mail()).slice(before.mail);
  expect(mail.length).toBe(1);
  expectRedirected(mail);
  expect((await h.entries()).gf).toBe(before.entries.gf);

  // Other validation failures stay failures for marked submissions.
  before = await counts();
  const missing = await gfSubmit(gf, page, values(`Pirax check ${marker}`, ""), { captcha: true });
  expect(missing.ok).toBe(false);
  expect(missing.text).toContain("This field is required");
  expect(missing.text).not.toContain("reCAPTCHA");
  const honeypot = await gfSubmit(gf, page, values(`Pirax check ${marker}`), { captcha: true, honeypot: true });
  expect(honeypot.ok).toBe(true); // GF's honeypot "abort" shows the confirmation but processes nothing
  await h.drainQueues();
  expect((await h.mail()).length).toBe(before.mail);
  expect((await h.entries()).gf).toBe(before.entries.gf);
}, 240_000);

test("FF reCAPTCHA with failing siteverify: marked passes, unmarked fails; other errors and honeypot still apply", async () => {
  const { ff, page } = h.fixtures.captcha;
  let before = await counts();
  const unmarked = await ffSubmit(ff, page, ffValues("ordinary message"), { captcha: true });
  expect(unmarked.ok).toBe(false);
  expect(unmarked.text).toContain("reCaptcha verification failed");
  expect((await h.siteverify()).length).toBe(before.siteverify + 1);

  // Without a response the negative control would never reach the verifier.
  expect((await h.php("return get_option('_fluentform_reCaptcha_details')['secretKey'];"))).toBe("pirax-local-secret-key");

  before = await counts();
  const marked = await ffSubmit(ff, page, ffValues(`Pirax check ${marker}`), { captcha: true });
  expect(marked.ok).toBe(true);
  const mail = (await h.mail()).slice(before.mail);
  expect(mail.map((m) => m.subject)).toEqual([`[pirax-test ${ID}] ff-${ff} notification C`]);
  expectRedirected(mail);
  expect((await h.entries()).ff).toBe(before.entries.ff);

  before = await counts();
  const missing = await ffSubmit(ff, page, { "names[first_name]": "Pirax", email: "", message: `Pirax check ${marker}` }, { captcha: true, direct: true });
  expect(missing.ok).toBe(false);
  expect(missing.text).toContain("email");
  expect(missing.text).not.toContain("reCaptcha");

  const settings = await h.php("return get_option('_fluentform_global_form_settings');");
  await h.php(`$s = (array) get_option('_fluentform_global_form_settings', []); $s['misc']['honeypotStatus'] = 'yes'; update_option('_fluentform_global_form_settings', $s); return true;`);
  try {
    const honeypot = await ffSubmit(ff, page, ffValues(`Pirax check ${marker}`), { captcha: true, honeypot: true, direct: true });
    expect(honeypot.ok).toBe(false);
    expect(honeypot.text).toContain("Sorry! You can not submit this form at this moment!");
  } finally {
    await setOptions({ _fluentform_global_form_settings: settings || null });
  }
  await h.drainQueues();
  expect((await h.mail()).length).toBe(before.mail);
  expect((await h.entries()).ff).toBe(before.entries.ff);
}, 240_000);

// ---------------------------------------------------------------------------------------------
// AC6 — fail closed

test("an integration outside the suppressible feed paths blocks marked submissions; ordinary ones still run it", async () => {
  await setOptions({ pirax_harness_direct_dispatch: true });
  try {
    const before = await counts();
    const gf = await gfSubmit(h.fixtures.gf, h.fixtures.page, gfValues(`Pirax check ${marker}`));
    expect(gf.ok).toBe(false);
    expect(gf.text).toContain(BLOCKED);
    const ff = await ffSubmit(h.fixtures.ff, h.fixtures.page, ffValues(`Pirax check ${marker}`));
    expect(ff.ok).toBe(false);
    expect(ff.text).toContain(BLOCKED);
    await visitor.page.getByText(BLOCKED).first().waitFor();
    await h.drainQueues();
    expect((await h.mail()).length).toBe(before.mail);
    expect((await h.feeds()).length).toBe(before.feeds);
    const entries = await h.entries();
    expect([entries.gf, entries.ff]).toEqual([before.entries.gf, before.entries.ff]);
    expect(await asPending()).toBe(0);

    // Ordinary submissions are untouched, direct integration included.
    expect((await gfSubmit(h.fixtures.gf, h.fixtures.page, gfValues("ordinary message"))).ok).toBe(true);
    expect((await ffSubmit(h.fixtures.ff, h.fixtures.page, ffValues("ordinary message"))).ok).toBe(true);
    await h.drainQueues();
    expect((await h.feeds()).slice(before.feeds).map((f) => f.plugin).sort()).toEqual(["ff", "ff-direct", "gf", "gf-direct"]);
    expectOriginal((await h.mail()).slice(before.mail));
  } finally {
    await setOptions({ pirax_harness_direct_dispatch: null });
  }
}, 240_000);

test("payment and post-creation paths are rejected for marked submissions", async () => {
  const { gf, ff, page } = h.fixtures.unsupported;
  const before = await counts();
  const posts = await h.php<number>("return (int) wp_count_posts('post')->publish + (int) wp_count_posts('post')->draft;");
  const gfResult = await gfSubmit(gf, page, { input_1: "Pirax post", input_2: `Pirax check ${marker}` });
  expect(gfResult.ok).toBe(false);
  expect(gfResult.text).toContain(BLOCKED);
  const ffResult = await ffSubmit(ff, page, ffValues(`Pirax check ${marker}`));
  expect(ffResult.ok).toBe(false);
  expect(ffResult.text).toContain(BLOCKED);
  await h.drainQueues();
  expect((await h.mail()).length).toBe(before.mail);
  const entries = await h.entries();
  expect([entries.gf, entries.ff]).toEqual([before.entries.gf, before.entries.ff]);
  expect(await h.php<number>("return (int) wp_count_posts('post')->publish + (int) wp_count_posts('post')->draft;")).toBe(posts);
}, 180_000);

test("malformed or ambiguous markers and an invalid redirect reject safely; nothing reaches original recipients", async () => {
  const before = await counts();
  for (const value of [`Pirax check ${h.token}-ABC123`, `Pirax check ${marker} and ${h.token}-def456`, `Pirax check ${h.token}`]) {
    const gf = await gfSubmit(h.fixtures.gf, h.fixtures.page, gfValues(value));
    expect(gf.ok).toBe(false);
    expect(gf.text).toContain(MARKER);
    const ff = await ffSubmit(h.fixtures.ff, h.fixtures.page, ffValues(value));
    expect(ff.ok).toBe(false);
    expect(ff.text).toContain(MARKER);
  }
  await setOptions({ pirax_form_test_redirect: "a@operator.test,b@operator.test" });
  try {
    const gf = await gfSubmit(h.fixtures.gf, h.fixtures.page, gfValues(`Pirax check ${marker}`));
    expect(gf.ok).toBe(false);
    expect(gf.text).toContain(CONFIG);
    const ff = await ffSubmit(h.fixtures.ff, h.fixtures.page, ffValues(`Pirax check ${marker}`));
    expect(ff.ok).toBe(false);
    expect(ff.text).toContain(CONFIG);
  } finally {
    await setOptions({ pirax_form_test_redirect: REDIRECT });
  }
  await h.drainQueues();
  expect((await h.mail()).length).toBe(before.mail);
  expect((await h.feeds()).length).toBe(before.feeds);
  const entries = await h.entries();
  expect([entries.gf, entries.ff]).toEqual([before.entries.gf, before.entries.ff]);
}, 240_000);

// ---------------------------------------------------------------------------------------------
// AC5 — FF native email queue: context per job, retries and completion

test("FF queued email: marked entry kept until every job completes across requests; ordinary job in the same runner keeps its recipients", async () => {
  await setOptions({ pirax_harness_ff_async_email: true, pirax_harness_fail_mail: { match: [`[pirax-test ${ID}] `, "notification B"], times: 1 } });
  try {
    const before = await counts();
    const marked = await ffSubmit(h.fixtures.ff, h.fixtures.page, ffValues(`Pirax check ${marker}`));
    const ordinary = await ffSubmit(h.fixtures.ff, h.fixtures.page, ffValues("ordinary queued message"));
    expect(marked.ok && ordinary.ok).toBe(true);
    const [m, o] = [marked.insertId!, ordinary.insertId!];

    // Queued natively: no mail yet; marked entry has only its two email jobs (no ledger feed).
    expect((await h.mail()).length).toBe(before.mail);
    const queued = await ffRows([m, o]);
    await note("ff queued: after marked + ordinary submissions", { marked: m, ordinary: o, rows: queued, asPending: await asPending() });
    expect(queued.filter((r) => r.origin === m).map((r) => [r.action, r.status])).toEqual([
      ["fluentform/integration_notify_notifications", "pending"],
      ["fluentform/integration_notify_notifications", "pending"],
    ]);
    expect(queued.filter((r) => r.origin === o).map((r) => r.status)).toEqual(["pending", "pending", "pending"]);
    expect((await h.entries()).rows.some((r) => r.plugin === "ff" && r.id === m)).toBe(true);

    // One Action Scheduler runner request: marked A, marked B (fails), then the ordinary jobs.
    await h.drainQueues();
    const mail = (await h.mail()).slice(before.mail);
    const failed = await h.php<{ subject: string }[]>(`
      $file = WP_CONTENT_DIR . '/pirax-harness/mail-failed.jsonl';
      return array_map(fn($l) => json_decode($l, true), file($file, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES));
    `);
    expect(failed.at(-1)!.subject).toBe(`[pirax-test ${ID}] ff-${h.fixtures.ff} notification B`);
    const markedMail = mail.filter((x) => x.subject.startsWith("[pirax-test"));
    const ordinaryMail = mail.filter((x) => !x.subject.startsWith("[pirax-test"));
    expect(markedMail.map((x) => x.subject)).toEqual([`[pirax-test ${ID}] ff-${h.fixtures.ff} notification A`]);
    expectRedirected(markedMail);
    expect(ordinaryMail.length).toBe(2);
    expectOriginal(ordinaryMail);
    expect(new Set([...markedMail, ...ordinaryMail].map((x) => x.request)).size).toBe(1); // same runner request
    expect(markedMail[0].time).toBeLessThan(Math.min(...ordinaryMail.map((x) => x.time)));
    expect((await h.feeds()).slice(before.feeds).map((f) => f.entry)).toEqual([o]);

    // Retryable failure: the marked entry survives this and a fresh request.
    const afterRunner = await ffRows([m]);
    await note("ff queued: after one Action Scheduler runner request", { rows: await ffRows([m, o]), asPending: await asPending() });
    expect(afterRunner.map((r) => r.status)).toEqual(["success", "failed"]);
    expect(afterRunner[1].retries).toBe(1);
    expect((await h.entries()).rows.some((r) => r.plugin === "ff" && r.id === m)).toBe(true);

    // FF's own retry (WP-Cron fluentform_do_scheduled_tasks) delivers B, then cleanup runs at request end.
    await h.php("if (!wp_next_scheduled('fluentform_do_scheduled_tasks')) wp_schedule_event(time(), 'ff_every_five_minutes', 'fluentform_do_scheduled_tasks'); return true;");
    await h.runCron(["fluentform_do_scheduled_tasks"]);
    const retried = (await h.mail()).slice(before.mail + mail.length);
    await note("ff queued: after WP-Cron retry request", { rows: await ffRows([m, o]), entries: (await h.entries()).rows.filter((r) => r.id === m || r.id === o) });
    expect(retried.map((x) => x.subject)).toEqual([`[pirax-test ${ID}] ff-${h.fixtures.ff} notification B`]);
    expectRedirected(retried);
    expect(retried[0].request).toContain("wp-cron.php");
    const rows = (await h.entries()).rows.filter((r) => r.plugin === "ff").map((r) => r.id);
    expect(rows).not.toContain(m);
    expect(rows).toContain(o);
    expect(await ffRows([m])).toEqual([]);
    expect(await orphans()).toEqual(NO_ORPHANS);
  } finally {
    await setOptions({ pirax_harness_ff_async_email: null, pirax_harness_fail_mail: null });
  }
}, 300_000);

test("FF queued email: a job still processing elsewhere blocks FF's pending-only completion signal", async () => {
  await setOptions({ pirax_harness_ff_async_email: true });
  try {
    const before = await counts();
    const marked = await ffSubmit(h.fixtures.ff, h.fixtures.page, ffValues(`Pirax check ${marker}`));
    const m = marked.insertId!;
    const [, b] = await ffRows([m]);
    // Another worker has claimed job B (FF's own claim: status processing, retry_count + 1).
    await h.php(`global $wpdb; $wpdb->update("{$wpdb->prefix}ff_scheduled_actions", ['status' => 'processing', 'retry_count' => 1, 'updated_at' => current_time('mysql')], ['id' => ${b.id}]); return true;`);
    await h.drainQueues(); // runs A; B's queued action finds no pending row; FF's maybeFinished sees no pending rows
    await note("ff processing elsewhere: after runner", { rows: await ffRows([m]) });
    expect((await ffRows([m])).map((r) => r.status)).toEqual(["success", "processing"]);
    expect((await h.entries()).rows.some((r) => r.plugin === "ff" && r.id === m)).toBe(true);

    // That worker then fails; FF retries it on its cron and the entry is removed once all jobs are done.
    await h.php(`global $wpdb; $wpdb->update("{$wpdb->prefix}ff_scheduled_actions", ['status' => 'failed'], ['id' => ${b.id}]); return true;`);
    await h.php("if (!wp_next_scheduled('fluentform_do_scheduled_tasks')) wp_schedule_event(time(), 'ff_every_five_minutes', 'fluentform_do_scheduled_tasks'); return true;");
    await h.runCron(["fluentform_do_scheduled_tasks"]);
    const mail = (await h.mail()).slice(before.mail);
    expect(mail.map((x) => x.subject).sort()).toEqual([
      `[pirax-test ${ID}] ff-${h.fixtures.ff} notification A`,
      `[pirax-test ${ID}] ff-${h.fixtures.ff} notification B`,
    ]);
    expectRedirected(mail);
    expect((await h.entries()).rows.some((r) => r.plugin === "ff" && r.id === m)).toBe(false);
    expect(await orphans()).toEqual(NO_ORPHANS);
  } finally {
    await setOptions({ pirax_harness_ff_async_email: null });
  }
}, 300_000);

test("FF queued email: rotating or clearing the token never turns queued test mail into client mail", async () => {
  await setOptions({ pirax_harness_ff_async_email: true });
  try {
    const before = await counts();
    const rotated = (await ffSubmit(h.fixtures.ff, h.fixtures.page, ffValues(`Pirax check ${marker}`))).insertId!;
    await setOptions({ pirax_form_test_token: `rotated-${h.token}` });
    await h.drainQueues();
    let mail = (await h.mail()).slice(before.mail);
    expect(mail.length).toBe(2);
    expectRedirected(mail);
    expect((await h.entries()).rows.some((r) => r.plugin === "ff" && r.id === rotated)).toBe(false);

    // Cleared token: marked mail fails closed (nothing sent), the jobs stay retryable, the entry stays.
    await setOptions({ pirax_form_test_token: h.token });
    const cleared = (await ffSubmit(h.fixtures.ff, h.fixtures.page, ffValues(`Pirax check ${marker}`))).insertId!;
    await setOptions({ pirax_form_test_token: "" });
    await h.drainQueues();
    expect((await h.mail()).length).toBe(before.mail + 2);
    expect((await ffRows([cleared])).map((r) => [r.status, r.retries])).toEqual([["failed", 1], ["failed", 1]]);
    expect((await h.entries()).rows.some((r) => r.plugin === "ff" && r.id === cleared)).toBe(true);

    // Once configured again, FF's retry delivers to the redirect and the entry is removed.
    await setOptions({ pirax_form_test_token: h.token });
    await h.php("if (!wp_next_scheduled('fluentform_do_scheduled_tasks')) wp_schedule_event(time(), 'ff_every_five_minutes', 'fluentform_do_scheduled_tasks'); return true;");
    await h.runCron(["fluentform_do_scheduled_tasks"]);
    mail = (await h.mail()).slice(before.mail + 2);
    expect(mail.length).toBe(2);
    expectRedirected(mail);
    expect((await h.entries()).rows.some((r) => r.plugin === "ff" && r.id === cleared)).toBe(false);
    expect(await orphans()).toEqual(NO_ORPHANS);
  } finally {
    await setOptions({ pirax_harness_ff_async_email: null, pirax_form_test_token: h.token });
  }
}, 300_000);

test("FF legacy batch runner: marked and ordinary jobs in one request keep their own recipients; marked entry removed", async () => {
  await setOptions({ pirax_harness_ff_async_email: true });
  try {
    const before = await counts();
    const m = (await ffSubmit(h.fixtures.ff, h.fixtures.page, ffValues(`Pirax check ${marker}`))).insertId!;
    const o = (await ffSubmit(h.fixtures.ff, h.fixtures.page, ffValues("ordinary batch message"))).insertId!;
    const o2 = (await ffSubmit(h.fixtures.ff, h.fixtures.page, ffValues("second ordinary batch message"))).insertId!;
    const { ff } = await h.queues();
    // FF's legacy background endpoint processes every pending row in a single request.
    await note("ff legacy batch: before", { rows: await ffRows([m, o, o2]) });
    const res = await fetch(`${h.url}/wp-admin/admin-ajax.php?action=fluentform_background_process&nonce=${ff.nonce}`, { method: "POST" });
    expect(await res.text()).toContain("success");
    const mail = (await h.mail()).slice(before.mail);
    expect(new Set(mail.map((x) => x.request)).size).toBe(1);
    const markedMail = mail.filter((x) => x.subject.startsWith("[pirax-test"));
    expect(markedMail.length).toBe(2);
    expectRedirected(markedMail);
    const ordinaryMail = mail.filter((x) => !x.subject.startsWith("[pirax-test"));
    expect(ordinaryMail.length).toBe(4);
    expectOriginal(ordinaryMail);
    await h.drainQueues();
    expect((await h.mail()).length).toBe(before.mail + 6);
    await note("ff legacy batch: after", { rows: await ffRows([m, o, o2]) });
    const rows = (await h.entries()).rows.filter((r) => r.plugin === "ff").map((r) => r.id);
    expect(rows).not.toContain(m);
    expect(rows).toEqual(expect.arrayContaining([o, o2]));
    expect(await orphans()).toEqual(NO_ORPHANS);
  } finally {
    await setOptions({ pirax_harness_ff_async_email: null });
  }
}, 300_000);

// ---------------------------------------------------------------------------------------------
// AC7 — hourly recovery sweep

/** Seed GF/FF entries through native APIs/tables; ages in seconds. Returns ids by label. */
const seed = (items: { label: string; plugin: "gf" | "ff"; value: string; age: number; source?: string; job?: "pending" | "active" | "stale" }[]) =>
  h.php<Record<string, number>>(`
    global $wpdb; $p = $wpdb->prefix; $ids = [];
    foreach (${lit(items)} as $item) {
      $when = time() - $item['age'];
      if ($item['plugin'] === 'gf') {
        $id = GFAPI::add_entry(['form_id' => ${h.fixtures.gf}, '1' => 'Seed', '2' => 'seed@example.test', '3' => $item['value'], 'source_url' => $item['source'] ?? '', 'date_created' => gmdate('Y-m-d H:i:s', $when)]);
        if (is_wp_error($id)) throw new RuntimeException($id->get_error_message());
      } else {
        $local = wp_date('Y-m-d H:i:s', $when);
        $wpdb->insert("{$p}fluentform_submissions", ['form_id' => ${h.fixtures.ff}, 'serial_number' => 1, 'response' => wp_json_encode(['names' => ['first_name' => 'Seed'], 'email' => 'seed@example.test', 'message' => $item['value']]), 'source_url' => $item['source'] ?? '', 'user_id' => 0, 'status' => 'unread', 'is_favourite' => 0, 'created_at' => $local, 'updated_at' => $local]);
        $id = (int) $wpdb->insert_id;
        $wpdb->insert("{$p}fluentform_submission_meta", ['response_id' => $id, 'form_id' => ${h.fixtures.ff}, 'meta_key' => '_entry_uid_hash', 'value' => md5((string) $id), 'created_at' => $local, 'updated_at' => $local]);
        $wpdb->insert("{$p}fluentform_entry_details", ['form_id' => ${h.fixtures.ff}, 'submission_id' => $id, 'field_name' => 'message', 'field_value' => $item['value']]);
        if (!empty($item['job'])) {
          $updated = $item['job'] === 'active' ? current_time('mysql') : wp_date('Y-m-d H:i:s', time() - 2 * HOUR_IN_SECONDS);
          $queue = wpFluentForm('fluentFormAsyncRequest')->queue(['action' => 'fluentform/integration_notify_notifications', 'form_id' => ${h.fixtures.ff}, 'origin_id' => $id, 'feed_id' => 0, 'type' => 'submission_action', 'status' => $item['job'] === 'pending' ? 'pending' : 'processing', 'data' => maybe_serialize([]), 'created_at' => $local, 'updated_at' => $updated]);
          if ($item['job'] === 'pending') as_enqueue_async_action('fluentform/schedule_feed', ['queueId' => $queue], 'fluentform');
        }
      }
      $ids[$item['label']] = (int) $id;
    }
    return $ids;
  `);

const exists = (ids: Record<string, number>, plugin: Record<string, "gf" | "ff">) =>
  h.php<Record<string, boolean>>(`
    global $wpdb; $p = $wpdb->prefix; $out = [];
    foreach (${lit(ids)} as $label => $id) {
      $table = ${lit(plugin)}[$label] === 'gf' ? "{$p}gf_entry" : "{$p}fluentform_submissions";
      $out[$label] = (bool) $wpdb->get_var($wpdb->prepare("SELECT COUNT(*) FROM $table WHERE id = %d", $id));
    }
    return $out;
  `);

test("hourly sweep: real cron deletes only old token entries across pages, with native cascade and queued-job removal, in a non-UTC site", async () => {
  await h.php("update_option('timezone_string', 'Asia/Kathmandu'); update_option('gmt_offset', ''); return true;");
  const items = [
    { label: "gfMarkedOld", plugin: "gf", value: `Pirax check ${marker}`, age: 3700 },
    { label: "gfMarkedYoung", plugin: "gf", value: `Pirax check ${marker}`, age: 3500 },
    { label: "gfOrdinaryOld", plugin: "gf", value: "ordinary", age: 3700 },
    { label: "gfMalformedOld", plugin: "gf", value: `stale ${h.token}`, age: 3700 },
    { label: "gfSourceOnlyOld", plugin: "gf", value: "ordinary", age: 3700, source: `https://site.test/?m=${marker}` },
    { label: "ffMarkedOld", plugin: "ff", value: `Pirax check ${marker}`, age: 3700, job: "pending" },
    { label: "ffMarkedYoung", plugin: "ff", value: `Pirax check ${marker}`, age: 3500 },
    { label: "ffOrdinaryOld", plugin: "ff", value: "ordinary", age: 3700, job: "pending" },
    { label: "ffActiveOld", plugin: "ff", value: `Pirax check ${marker}`, age: 3700, job: "active" },
    { label: "ffStaleOld", plugin: "ff", value: `Pirax check ${marker}`, age: 3700, job: "stale" },
    ...Array.from({ length: 120 }, (_, i) => ({ label: `gfBulk${i}`, plugin: "gf", value: `${h.token}-bulk${String(i).padStart(4, "0")}`, age: 7200 })),
    ...Array.from({ length: 120 }, (_, i) => ({ label: `ffBulk${i}`, plugin: "ff", value: `${h.token}-bulk${String(i).padStart(4, "0")}`, age: 7200 })),
  ] as const;
  const ids = await seed(items as any);
  const plugin = Object.fromEntries(items.map((i) => [i.label, i.plugin]));
  const pendingBefore = await asPending();
  expect(pendingBefore).toBeGreaterThanOrEqual(2);

  const special = ["ffMarkedOld", "ffOrdinaryOld", "ffActiveOld", "ffStaleOld"].map((k) => ids[k]);
  await note("sweep: before", { rows: await ffRows(special), asPending: pendingBefore, seeded: Object.keys(ids).length });
  await h.runCron(["pirax_form_test_sweep"]);
  const state = await exists(ids, plugin);
  await note("sweep: after", { rows: await ffRows(special), asPending: await asPending(), kept: Object.keys(state).filter((k) => state[k]) });
  const kept = Object.entries(state).filter(([, v]) => v).map(([k]) => k).sort();
  expect(kept).toEqual(["ffActiveOld", "ffMarkedYoung", "ffOrdinaryOld", "gfMarkedYoung", "gfOrdinaryOld", "gfSourceOnlyOld"]);
  expect(await ffRows([ids.ffMarkedOld, ids.ffStaleOld])).toEqual([]);
  expect((await ffRows([ids.ffOrdinaryOld])).map((r) => r.status)).toEqual(["pending"]);
  expect((await ffRows([ids.ffActiveOld])).map((r) => r.status)).toEqual(["processing"]);
  expect(await asPending()).toBe(pendingBefore - 1); // the marked entry's queued job was cancelled, the ordinary one kept
  expect(await orphans()).toEqual(NO_ORPHANS);
  expect(await h.php("return wp_next_scheduled('pirax_form_test_sweep') > time();")).toBe(true);

  // Repeating is a no-op.
  await h.runCron(["pirax_form_test_sweep"]);
  expect(await exists(ids, plugin)).toEqual(state);
  await h.php(`global $wpdb; $wpdb->query($wpdb->prepare("DELETE FROM {$wpdb->prefix}ff_scheduled_actions WHERE origin_id = %d", ${ids.ffOrdinaryOld})); as_unschedule_all_actions('fluentform/schedule_feed', [], 'fluentform'); return true;`);
}, 300_000);

test("sweep: literal token with SQL wildcards, empty token no-op, and strict one-hour boundary", async () => {
  const legacy = "pirax%legacy_token-with_wild";
  await setOptions({ pirax_form_test_token: legacy });
  try {
    const ids = await seed([
      { label: "gfLiteral", plugin: "gf", value: `check ${legacy}-abc123`, age: 3700 },
      { label: "gfLookalike", plugin: "gf", value: "check piraxXlegacyXtoken-withXwild-abc123", age: 3700 },
      { label: "ffLiteral", plugin: "ff", value: `check ${legacy}-abc123`, age: 3700 },
      { label: "ffLookalike", plugin: "ff", value: "check pirax legacy token-with wild-abc123", age: 3700 },
    ]);
    const plugin = { gfLiteral: "gf", gfLookalike: "gf", ffLiteral: "ff", ffLookalike: "ff" } as const;
    await h.runCron(["pirax_form_test_sweep"]);
    expect(await exists(ids, plugin)).toEqual({ gfLiteral: false, gfLookalike: true, ffLiteral: false, ffLookalike: true });

    await setOptions({ pirax_form_test_token: "" });
    const empty = await seed([
      { label: "gfOld", plugin: "gf", value: `check ${legacy}-abc123`, age: 7200 },
      { label: "ffOld", plugin: "ff", value: `check ${legacy}-abc123`, age: 7200 },
    ]);
    await h.runCron(["pirax_form_test_sweep"]);
    expect(await exists(empty, { gfOld: "gf", ffOld: "ff" })).toEqual({ gfOld: true, ffOld: true });
  } finally {
    await setOptions({ pirax_form_test_token: h.token });
  }

  // Strictly older than one hour: seed and sweep within one second so time() is shared.
  const boundary = await h.php<{ exact: boolean[]; older: boolean[] }>(`
    global $wpdb; $p = $wpdb->prefix; $value = 'boundary ' . get_option('pirax_form_test_token') . '-abc123';
    for ($try = 0; $try < 5; $try++) {
      while (fmod(microtime(true), 1) > 0.3) usleep(10000);
      $t = time(); $ids = [];
      foreach ([3600, 3601] as $age) {
        $ids[$age]['gf'] = GFAPI::add_entry(['form_id' => ${h.fixtures.gf}, '1' => 'Seed', '2' => 'seed@example.test', '3' => $value, 'date_created' => gmdate('Y-m-d H:i:s', $t - $age)]);
        $local = wp_date('Y-m-d H:i:s', $t - $age);
        $wpdb->insert("{$p}fluentform_submissions", ['form_id' => ${h.fixtures.ff}, 'serial_number' => 1, 'response' => wp_json_encode(['message' => $value]), 'status' => 'unread', 'created_at' => $local, 'updated_at' => $local]);
        $ids[$age]['ff'] = $wpdb->insert_id;
      }
      do_action('pirax_form_test_sweep');
      $alive = fn($age) => [(bool) GFAPI::get_entry($ids[$age]['gf']) && !is_wp_error(GFAPI::get_entry($ids[$age]['gf'])), (bool) $wpdb->get_var($wpdb->prepare("SELECT COUNT(*) FROM {$p}fluentform_submissions WHERE id = %d", $ids[$age]['ff']))];
      $result = ['exact' => $alive(3600), 'older' => $alive(3601)];
      foreach ($ids as $pair) { GFAPI::delete_entry($pair['gf']); $wpdb->delete("{$p}fluentform_submissions", ['id' => $pair['ff']]); }
      if (time() === $t) return $result;
    }
    throw new RuntimeException('could not complete the boundary check within one second');
  `);
  expect(boundary).toEqual({ exact: [true, true], older: [false, false] });
}, 300_000);

test("retained evidence contains no token", async () => {
  await h.closeBrowser(visitor.context);
  visitor = undefined as any;
  const evidence = await h.saveEvidence();
  expect(evidence.files).toEqual(expect.arrayContaining(["mail.jsonl", "feeds.jsonl", "entries.json", "manifest.json"]));
  expect(await findSecret(h.artifactDir, [h.token])).toEqual([]);
}, 120_000);
