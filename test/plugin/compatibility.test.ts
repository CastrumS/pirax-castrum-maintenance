// Production plugin on the opt-in compatibility stack (helper-compat plan D1–D7; AC1–AC7): GF, FF + FF Pro,
// CleanTalk and FluentSMTP at their AUDITED_VERSIONS pins, active together, with HTTP contained,
// CleanTalk moderation and the Pro webhook answered at the Requests transport and FluentSMTP's
// Simulator as the mail transport. Forms are submitted in headless Chromium; queues run natively.
// bun --env-file=/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/.env test test/plugin/compatibility.test.ts
import { afterAll, beforeAll, expect, setDefaultTimeout, test } from "bun:test";
import { appendFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { BrowserContext, Page } from "playwright";
import { findSecret } from "./artifacts";
import { startHarness, type EnvelopeRecord, type Harness, type HttpRecord } from "./harness";
import { nextPatch, PINS, withAlteredFile as alteredFile } from "./version-fixtures";

// Playground round trips exceed Bun's 5 s default. Bun 1.4 scopes this to the calling file, so every suite sets it.
setDefaultTimeout(180_000);

const ROOT = resolve(import.meta.dir, "../..");
const ZIP = join(ROOT, "dist/pirax-form-test.zip");
const REDIRECT = "form-tests+pirax@operator.test";
const ID = "abc123";
const BLOCKED = "Pirax test blocked: integrations could not be suppressed";
const AWAITING = "Pirax test blocked: awaiting audit of ";
const INVALID_MARKER = "Pirax test blocked: invalid test marker";
const INVALID_CONFIG = "Pirax test blocked: test configuration is invalid";
const SETTINGS = "/wp-admin/options-general.php?page=pirax-form-test";
const EMAIL_PRECHECK = "/wp-json/cleantalk-antispam/v1/check_email_before_post";
/** A genuinely different GF version than the pin, for wrong-version cases. */
const GF_NEXT = nextPatch(PINS.gf);

/** A PHP expression decoding a JSON value (single-quoted literal, so `$` and `\` stay literal). */
const lit = (v: unknown) => `json_decode('${JSON.stringify(v).replace(/\\/g, "\\\\").replace(/'/g, "\\'")}', true)`;

let h: Harness;
let admin: { context: BrowserContext; page: Page };
let visitor: { context: BrowserContext; page: Page };
let marker: string;

beforeAll(async () => {
  const build = await Bun.$`bun run build:plugin`.cwd(ROOT).quiet().nothrow();
  if (build.exitCode !== 0) throw new Error(`build:plugin failed: ${build.stderr}`);
  h = await startHarness({ run: "compatibility", compatibility: true });
  marker = `${h.token}-${ID}`;

  admin = await h.browser("compatibility-admin");
  await admin.page.goto(`${h.url}/wp-login.php`);
  await admin.page.fill("#user_login", h.users.admin.login);
  await admin.page.fill("#user_pass", h.users.admin.password);
  await admin.page.click("#wp-submit");
  await admin.page.waitForURL(/\/wp-admin\/?/);
  await h.uploadPlugin(admin.page, ZIP);
  await setOptions({ pirax_form_test_token: h.token, pirax_form_test_redirect: REDIRECT });

  // One enabled notification per form, so "exactly one mail" is meaningful.
  await h.php(`
    global $wpdb;
    $form = GFAPI::get_form(${h.fixtures.gf});
    $form['notifications']['pirax00000002']['isActive'] = false;
    GFAPI::update_form($form);
    foreach ($wpdb->get_results($wpdb->prepare("SELECT id, value FROM {$wpdb->prefix}fluentform_form_meta WHERE form_id = %d AND meta_key = 'notifications'", ${h.fixtures.ff})) as $row) {
      $value = json_decode($row->value, true);
      if (str_ends_with($value['subject'], 'notification B')) {
        $value['enabled'] = false;
        $wpdb->update("{$wpdb->prefix}fluentform_form_meta", ['value' => wp_json_encode($value)], ['id' => $row->id]);
      }
    }
    return true;
  `);
  visitor = await h.browser("compatibility-visitor");
}, 600_000);

afterAll(async () => {
  for (const c of [visitor, admin]) if (c) await h.closeBrowser(c.context).catch(() => {});
  if (h) {
    await h.saveEvidence().catch(() => {});
    await h.stop();
  }
}, 120_000);

const setOptions = (options: Record<string, unknown>) =>
  h.php(`foreach (${lit(options)} as $name => $value) { null === $value ? delete_option($name) : update_option($name, $value, false); } return true;`);

/** Evidence notes (states, ids and hashes only). */
const note = (step: string, data: unknown) => appendFile(join(h.artifactDir, "compatibility-notes.jsonl"), JSON.stringify({ step, data }) + "\n");

/** Log lengths, entries and the newest native job ids, to slice what one step produced. */
async function mark() {
  const jobs = await h.php<{ ff: number; as: number }>(`
    global $wpdb;
    return ['ff' => (int) $wpdb->get_var("SELECT MAX(id) FROM {$wpdb->prefix}ff_scheduled_actions"), 'as' => (int) $wpdb->get_var("SELECT MAX(action_id) FROM {$wpdb->prefix}actionscheduler_actions")];
  `);
  return { http: (await h.http()).length, env: (await h.envelopes()).length, sim: (await h.simulator()).length, mail: (await h.mail()).length, feeds: (await h.feeds()).length, entries: await h.entries(), jobs };
}
type Mark = Awaited<ReturnType<typeof mark>>;

/** What happened since `m`: contained HTTP, envelopes, Simulator rows, feeds, new entries and new native jobs. */
async function since(m: Mark) {
  const entries = await h.entries();
  const known = new Set(m.entries.rows.map((r) => `${r.plugin}:${r.id}`));
  const jobs = await h.php<{ ff: { action: string; origin: number; status: string }[]; as: { hook: string; status: string }[] }>(`
    global $wpdb;
    return [
      'ff' => array_map(fn($r) => ['action' => $r->action, 'origin' => (int) $r->origin_id, 'status' => $r->status], $wpdb->get_results($wpdb->prepare("SELECT * FROM {$wpdb->prefix}ff_scheduled_actions WHERE id > %d ORDER BY id", ${m.jobs.ff}))),
      'as' => array_map(fn($r) => ['hook' => $r->hook, 'status' => $r->status], $wpdb->get_results($wpdb->prepare("SELECT hook, status FROM {$wpdb->prefix}actionscheduler_actions WHERE action_id > %d AND hook NOT LIKE 'action_scheduler%%' ORDER BY action_id", ${m.jobs.as}))),
    ];
  `);
  return {
    http: (await h.http()).slice(m.http),
    env: (await h.envelopes()).slice(m.env),
    sim: (await h.simulator()).slice(m.sim),
    mail: (await h.mail()).slice(m.mail),
    feeds: (await h.feeds()).slice(m.feeds),
    added: entries.rows.filter((r) => !known.has(`${r.plugin}:${r.id}`)),
    entries,
    jobs,
  };
}

/** CleanTalk traffic caused by a submission: moderation, or anything else to its hosts except the visitor's pre-submit email check. */
const cleantalkAttempts = (records: HttpRecord[]) =>
  records.filter((r) => r.purpose === "cleantalk-moderation" || (/(^|\.)cleantalk\.org$/.test(r.host) && r.request !== EMAIL_PRECHECK));

const ffValues = (message: string) => ({ "names[first_name]": "Stack", email: "visitor@example.test", message });
const gfValues = (message: string) => ({ input_1: "Stack Visitor", input_2: "visitor@example.test", input_3: message });

/** Submit the rendered FF contact form; `hidden` adds hidden fields (e.g. Pro's saved-state hash). */
async function ffSubmit(message: string, hidden: Record<string, string> = {}) {
  const { page } = visitor;
  await page.goto(h.fixtures.page);
  const form = page.locator(`form[data-form_id='${h.fixtures.ff}']`);
  for (const [name, value] of Object.entries(ffValues(message))) await form.locator(`[name='${name}']`).fill(value);
  await form.evaluate((f, fields) => {
    for (const [name, value] of Object.entries(fields)) f.appendChild(Object.assign(document.createElement("input"), { type: "hidden", name, value }));
  }, hidden);
  const response = page.waitForResponse((r) => r.url().includes("admin-ajax.php") && (r.request().postData() ?? "").includes("action=fluentform_submit"));
  await form.locator("button[type=submit]").click();
  const res = await response;
  const body = await res.json().catch(() => null);
  return { status: res.status(), body, text: JSON.stringify(body), insertId: Number(body?.data?.insert_id) || undefined };
}

/** The helper's own message in FF's 423 validation response, else undefined. */
const ffRejection = (body: any): string | undefined => body?.errors?.pirax_form_test?.pirax_form_test;

/** Latest blocked marked submission's stored diagnosis (pirax_form_test_last_block), or false. */
const lastBlock = () => h.php<any>(`return get_option('pirax_form_test_last_block');`);
const clearLastBlock = () => h.php(`delete_option('pirax_form_test_last_block'); return true;`);

async function gfSubmit(message: string) {
  const { page } = visitor;
  const id = h.fixtures.gf;
  await page.goto(h.fixtures.page);
  const form = page.locator(`#gform_${id}`);
  for (const [name, value] of Object.entries(gfValues(message))) await form.locator(`[name='${name}']`).fill(value);
  await form.locator("[type=submit]").click();
  await page.locator(`#gform_confirmation_message_${id}, #gform_${id}_validation_container`).first().waitFor();
  const ok = (await page.locator(`#gform_confirmation_message_${id}`).count()) > 0;
  return { ok, text: await page.locator(ok ? `#gform_confirmation_message_${id}` : `#gform_wrapper_${id}`).innerText() };
}

/**
 * Submit the fixture GF form with GF's modern AJAX method (admin-ajax.php action=gform_submit_form;
 * needs pirax_harness_gf_ajax). `hidden` adds inputs to the form, `query` goes on GF's AJAX URL and
 * `cookie` is set for the site. `keepPage` submits the already loaded (and partly filled) page.
 * `session` defaults to the anonymous visitor (e.g. `admin` for a logged-in submission).
 */
async function gfAjaxSubmit(
  message: string,
  { hidden = {}, query = "", cookie, keepPage = false, session = visitor }: { hidden?: Record<string, string>; query?: string; cookie?: string; keepPage?: boolean; session?: { context: BrowserContext; page: Page } } = {},
) {
  const { page, context } = session;
  const id = h.fixtures.gf;
  if (cookie) await context.addCookies([{ name: "pirax_probe", value: cookie, url: h.url }]);
  try {
    if (!keepPage) await page.goto(h.fixtures.page);
    const form = page.locator(`#gform_${id}`);
    expect(await form.locator("[name=gform_submission_method]").getAttribute("value")).toBe("ajax");
    for (const [name, value] of Object.entries(gfValues(message))) await form.locator(`[name='${name}']`).fill(value);
    await form.evaluate((f, fields) => {
      for (const [name, value] of Object.entries(fields)) f.appendChild(Object.assign(document.createElement("input"), { type: "hidden", name, value }));
    }, hidden);
    if (query) await page.evaluate((q) => ((window as any).gform_theme_config.common.form.ajax.ajaxurl += q), query);
    const response = page.waitForResponse((r) => r.url().includes("admin-ajax.php") && r.request().method() === "POST" && (r.request().postData() ?? "").includes("gform_submit_form"));
    await form.locator("[type=submit]").click();
    const res = await response;
    await page.locator(`#gform_confirmation_message_${id}, #gform_${id}_validation_container`).first().waitFor();
    const ok = (await page.locator(`#gform_confirmation_message_${id}`).count()) > 0;
    return { status: res.status(), queried: new URL(res.url()).search !== "", ok, text: await page.locator(ok ? `#gform_confirmation_message_${id}` : `#gform_wrapper_${id}`).innerText() };
  } finally {
    if (cookie) await context.clearCookies({ name: "pirax_probe" });
  }
}

/** Contained HTTP whose URL or body held the marker token (booleans only are recorded). */
const tokenBearing = (records: HttpRecord[]) => records.filter((r) => r.carriesToken);

/** CleanTalk's generic admin-ajax check on a GF modern AJAX submission (plugins_loaded, action gform_submit_form). */
const genericCheck = (records: HttpRecord[]) => records.filter((r) => r.purpose === "cleantalk-moderation" && r.hooks.includes("plugins_loaded") && r.action === "gform_submit_form");

function expectRedirected(envelopes: EnvelopeRecord[]) {
  expect(envelopes.length).toBeGreaterThan(0);
  for (const e of envelopes) {
    expect(e).toMatchObject({ to: [REDIRECT], cc: [], bcc: [], mailer: "fluent-smtp.php", transport: "fluentsmtp-simulator" });
    expect(e.subject.startsWith(`[pirax-test ${ID}] `)).toBe(true);
    expect(e.subject.lastIndexOf("[pirax-test")).toBe(0);
    expect(e.headers.filter((line) => /^x-pirax-form-test\s*:/i.test(line))).toEqual([`X-Pirax-Form-Test: ${ID}`]);
  }
}

function expectOriginal(envelopes: EnvelopeRecord[], to: string) {
  expect(envelopes.length).toBeGreaterThan(0);
  for (const e of envelopes) {
    expect(e).toMatchObject({ to: [to], cc: ["cc@client.test"], bcc: ["bcc@client.test"], transport: "fluentsmtp-simulator" });
    expect(e.subject).not.toContain("[pirax-test");
    expect(e.headers.some((line) => /^x-pirax-form-test/i.test(line))).toBe(false);
  }
}

/**
 * Ordinary FF and GF submissions: CleanTalk moderates each, FF's Pro webhook fires once for its
 * entry after the native queue drains, GF's ledger feed runs, entries stay and mail keeps its recipients.
 */
async function ordinaryControls(label: string) {
  const m = await mark();
  const ff = await ffSubmit(`ff ordinary ${label}`);
  const gf = await gfSubmit(`gf ordinary ${label}`);
  expect(ff.status).toBe(200);
  expect(gf).toMatchObject({ ok: true, text: "Pirax GF thanks" });
  const queued = await since(m);
  const ffEntry = queued.added.find((r) => r.plugin === "ff")!.id;
  const gfEntry = queued.added.find((r) => r.plugin === "gf")!.id;
  expect(queued.added.map((r) => r.plugin).sort()).toEqual(["ff", "gf"]);
  expect(ffEntry).toBe(ff.insertId!);
  expect(queued.http.filter((r) => r.purpose === "cleantalk-moderation" && r.hooks.includes("fluentform/before_insert_submission")).length).toBeGreaterThanOrEqual(1);
  expect(queued.http.filter((r) => r.purpose === "cleantalk-moderation" && r.hooks.includes("gform_entry_is_spam")).length).toBeGreaterThanOrEqual(1);
  expect(queued.jobs.ff.filter((j) => j.origin === ffEntry).map((j) => j.action)).toContain("fluentform/integration_notify_fluentform_webhook_feed");

  await h.drainQueues();
  const done = await since(m);
  await note(`ordinary controls ${label}`, { ffEntry, gfEntry, http: done.http, jobs: done.jobs, feeds: done.feeds });
  expect(done.http.filter((r) => r.purpose === "webhook-capture").map((r) => r.entry)).toEqual([ffEntry]);
  expect(done.feeds.map((f) => [f.plugin, f.entry]).sort()).toEqual([["ff", ffEntry], ["gf", gfEntry]]);
  const ffMail = done.env.filter((e) => e.subject === `ff-${h.fixtures.ff} notification A`);
  const gfMail = done.env.filter((e) => e.subject === `gf-${h.fixtures.gf} notification A`);
  expect([ffMail.length, gfMail.length]).toEqual([1, 1]);
  expectOriginal([...ffMail, ...gfMail], "owner@client.test");
  expect(done.sim.map((s) => [s.subject, s.to.join(",")]).sort()).toEqual([
    [`ff-${h.fixtures.ff} notification A`, "owner@client.test"],
    [`gf-${h.fixtures.gf} notification A`, "owner@client.test"],
  ]);
  const rows = done.entries.rows.map((r) => `${r.plugin}:${r.id}`);
  expect(rows).toEqual(expect.arrayContaining([`ff:${ffEntry}`, `gf:${gfEntry}`]));
  return { ffEntry, gfEntry };
}

/** Admin view of the compatibility panel section for one plugin. */
async function panel(plugin: "gf" | "ff") {
  const { page } = admin;
  await page.goto(`${h.url}${SETTINGS}`);
  const section = page.locator(`#pirax-form-test-compat-${plugin}`);
  const rows = await section.locator("tr").evaluateAll((trs) => trs.map((tr) => [...tr.querySelectorAll("th,td")].map((c) => (c as HTMLElement).innerText.trim())));
  const hooks: Record<string, string[]> = {};
  for (const li of await section.locator("ul.pirax-form-test-unaudited > li").all()) {
    hooks[await li.locator(":scope > code").innerText()] = await li.locator("ul code").allInnerTexts();
  }
  return { rows, verdict: await section.locator(".pirax-form-test-verdict").innerText(), hooks };
}

/** withAlteredFile() on this stack; the original and altered hashes are kept in the evidence notes. */
const withAlteredFile = (file: string, search: string, replace: string, body: () => Promise<void>) =>
  alteredFile(h, file, search, replace, async (hashes) => {
    await note("altered vendor fixture", { file, search, replace, ...hashes });
    await body();
  });

// ---------------------------------------------------------------------------------------------
// AC1/AC2 — marked success between ordinary controls

test("full stack before marked submissions: ordinary FF and GF keep CleanTalk moderation, the Pro webhook, the GF ledger and original mail", async () => {
  await ordinaryControls("before");
}, 300_000);

test("full stack: marked FF and GF each confirm with one redirected Simulator mail, no CleanTalk moderation, no Pro webhook job or hit, and no entry left", async () => {
  const m = await mark();
  const ff = await ffSubmit(`Pirax check ${marker}`);
  const gf = await gfSubmit(`Pirax check ${marker}`);
  expect(ff.status).toBe(200);
  expect(ff.body?.success).toBe(true);
  expect(ff.body?.data?.result?.message).toBe("Thank you for your message. We will get in touch with you shortly");
  expect(gf).toMatchObject({ ok: true, text: "Pirax GF thanks" });

  const submitted = await since(m);
  await note("marked full stack: before draining", { http: submitted.http, jobs: submitted.jobs, added: submitted.added });
  expect(cleantalkAttempts(submitted.http)).toEqual([]);
  expect(submitted.jobs).toEqual({ ff: [], as: [] }); // no Pro webhook (or any other) job was queued
  expect(submitted.added).toEqual([]);

  await h.drainQueues();
  const done = await since(m);
  expect(cleantalkAttempts(done.http)).toEqual([]);
  expect(done.http.filter((r) => r.purpose === "webhook-capture")).toEqual([]);
  expect(done.feeds).toEqual([]);
  expect(done.added).toEqual([]);
  expect(done.entries.rows).toEqual(m.entries.rows);
  expect(done.env.map((e) => e.subject).sort()).toEqual([`[pirax-test ${ID}] ff-${h.fixtures.ff} notification A`, `[pirax-test ${ID}] gf-${h.fixtures.gf} notification A`]);
  expectRedirected(done.env);
  expect(done.sim.map((s) => ({ to: s.to, subject: s.subject, provider: s.provider, status: s.status, tagged: s.headers.filter((x) => /^x-pirax-form-test:/i.test(x)) })).sort((a, b) => a.subject.localeCompare(b.subject))).toEqual(
    ["ff", "gf"].map((p) => ({
      to: [REDIRECT],
      subject: `[pirax-test ${ID}] ${p}-${p === "ff" ? h.fixtures.ff : h.fixtures.gf} notification A`,
      provider: "Simulator",
      status: "sent",
      tagged: [`X-Pirax-Form-Test: ${ID}`],
    })),
  );
  expect(done.mail.map((x) => x.to)).toEqual([[REDIRECT], [REDIRECT]]);
  expect(tokenBearing(done.http)).toEqual([]);
}, 300_000);

test("GF modern AJAX (admin-ajax gform_submit_form): marked confirms with one redirected Simulator mail and no CleanTalk request or token-bearing HTTP; ordinary keeps CleanTalk's generic check, its entry, ledger feed and original mail", async () => {
  await setOptions({ pirax_harness_gf_ajax: true });
  try {
    let m = await mark();
    const marked = await gfAjaxSubmit(`Pirax check ${marker}`);
    expect(marked).toMatchObject({ status: 200, ok: true, text: "Pirax GF thanks" });
    await h.drainQueues();
    let done = await since(m);
    await note("marked GF modern AJAX", { http: done.http, jobs: done.jobs, added: done.added });
    expect(cleantalkAttempts(done.http)).toEqual([]);
    expect(tokenBearing(done.http)).toEqual([]);
    expect(done.added).toEqual([]);
    expect(done.feeds).toEqual([]);
    expect(done.env.map((e) => e.subject)).toEqual([`[pirax-test ${ID}] gf-${h.fixtures.gf} notification A`]);
    expectRedirected(done.env);
    expect(done.sim.map((s) => ({ to: s.to, provider: s.provider, status: s.status }))).toEqual([{ to: [REDIRECT], provider: "Simulator", status: "sent" }]);

    m = await mark();
    const ordinary = await gfAjaxSubmit("gf ordinary modern ajax");
    expect(ordinary).toMatchObject({ status: 200, ok: true, text: "Pirax GF thanks" });
    await h.drainQueues();
    done = await since(m);
    await note("ordinary GF modern AJAX", { http: done.http, added: done.added, feeds: done.feeds });
    expect(genericCheck(done.http).length).toBeGreaterThanOrEqual(1);
    expect(tokenBearing(done.http)).toEqual([]);
    expect(done.added.map((r) => r.plugin)).toEqual(["gf"]);
    expect(done.feeds.map((f) => [f.plugin, f.entry])).toEqual([["gf", done.added[0]!.id]]);
    const mail = done.env.filter((e) => e.subject === `gf-${h.fixtures.gf} notification A`);
    expect(mail.length).toBe(1);
    expectOriginal(mail, "owner@client.test");
  } finally {
    await setOptions({ pirax_harness_gf_ajax: null });
  }
}, 300_000);

test("GF modern AJAX early boundary: malformed markers, invalid configuration and the token in a field input the stored form lacks are refused without CleanTalk; the token outside field inputs (query, cookie, other POST names) stays ordinary and keeps CleanTalk", async () => {
  await setOptions({ pirax_harness_gf_ajax: true });
  try {
    let m = await mark();
    const malformed = await gfAjaxSubmit(`Pirax check ${h.token}-AB`);
    await setOptions({ pirax_form_test_redirect: null });
    let invalidConfig;
    try {
      invalidConfig = await gfAjaxSubmit(`Pirax check ${marker}`);
    } finally {
      await setOptions({ pirax_form_test_redirect: REDIRECT });
    }
    await clearLastBlock();
    const unknownField = await gfAjaxSubmit("gf with the marker in an input of no stored field", { hidden: { input_99: `Pirax ${marker}` } });
    const unknownBlock = await lastBlock();
    let done = await since(m);
    await note("GF modern AJAX refusals", { malformed: malformed.ok, invalidConfig: invalidConfig.ok, unknownField: unknownField.ok, http: done.http, added: done.added });
    expect(malformed.ok).toBe(false);
    expect(malformed.text).toContain(INVALID_MARKER);
    expect(invalidConfig.ok).toBe(false);
    expect(invalidConfig.text).toContain(INVALID_CONFIG);
    expect(unknownField.ok).toBe(false);
    expect(unknownField.text).toContain(BLOCKED);
    expect(unknownField.text).not.toContain(AWAITING);
    // The early refusal records its diagnosis too: posted form id, reasons, no values.
    expect(unknownBlock).toMatchObject({ plugin: "gf", form: h.fixtures.gf, message: BLOCKED, unaudited: [] });
    expect(unknownBlock.reasons).toContain("the marker is in an input the stored form does not have");
    expect([JSON.stringify(unknownBlock).includes(h.token), JSON.stringify(unknownBlock).includes(marker)]).toEqual([false, false]);
    await clearLastBlock();
    expect(cleantalkAttempts(done.http)).toEqual([]);
    expect(tokenBearing(done.http)).toEqual([]);
    expect(done.added).toEqual([]);
    expect(done.env).toEqual([]);

    m = await mark();
    const outside = await gfAjaxSubmit("gf ordinary with the marker outside its fields", { hidden: { pirax_unrelated: `Pirax ${marker}` }, query: `?pirax_probe=${encodeURIComponent(marker)}`, cookie: encodeURIComponent(marker) });
    await h.drainQueues();
    done = await since(m);
    await note("GF modern AJAX marker outside fields", { http: done.http, added: done.added });
    expect(outside).toMatchObject({ status: 200, queried: true, ok: true, text: "Pirax GF thanks" });
    expect(done.added.map((r) => r.plugin)).toEqual(["gf"]);
    // Ordinary: CleanTalk's generic check still runs, and sees the whole POST (the observer detects the token in it).
    expect(genericCheck(done.http).length).toBeGreaterThanOrEqual(1);
    expect(tokenBearing(genericCheck(done.http)).length).toBeGreaterThanOrEqual(1);
    expectOriginal(done.env.filter((e) => e.subject === `gf-${h.fixtures.gf} notification A`), "owner@client.test");
  } finally {
    await setOptions({ pirax_harness_gf_ajax: null });
  }
}, 300_000);

for (const mode of ["wrap", "early"] as const) {
  test(`GF modern AJAX: CleanTalk's generic check ${mode === "wrap" ? "wrapped (unrecognizable)" : "moved to plugins_loaded priority 1"} refuses marked submissions before it runs; ordinary ones keep it`, async () => {
    await setOptions({ pirax_harness_gf_ajax: true, pirax_harness_ct_ajax_rebind: mode });
    try {
      const m = await mark();
      const marked = await gfAjaxSubmit(`Pirax rebound ${marker}`);
      const ordinary = await gfAjaxSubmit(`gf ordinary with ${mode} generic check`);
      await h.drainQueues();
      const done = await since(m);
      await note(`GF modern AJAX generic check ${mode}`, { marked: marked.ok, ordinary: ordinary.ok, http: done.http, added: done.added });
      expect(marked.ok).toBe(false);
      expect(marked.text).toContain(BLOCKED);
      expect(marked.text).not.toContain(AWAITING);
      expect(ordinary).toMatchObject({ ok: true, text: "Pirax GF thanks" });
      expect(tokenBearing(done.http)).toEqual([]);
      expect(done.added.map((r) => r.plugin)).toEqual(["gf"]);
      // The rebound check still runs for the ordinary submission, and only for it.
      expect(genericCheck(done.http).length).toBe(1);
      expect(done.env.filter((e) => e.subject.startsWith("[pirax-test"))).toEqual([]);

      // Another GF version too: the audited CleanTalk's rebound check is an independent cause, so not version-only.
      await setOptions({ pirax_harness_gf_ajax_version: GF_NEXT });
      await clearLastBlock();
      const m2 = await mark();
      const compound = await gfAjaxSubmit(`Pirax rebound GF version ${marker}`);
      const compoundBlock = await lastBlock();
      await h.drainQueues();
      const done2 = await since(m2);
      await note(`GF modern AJAX generic check ${mode}, GF ${GF_NEXT}`, { marked: compound.ok, http: done2.http, added: done2.added, last: compoundBlock && { message: compoundBlock.message, reasons: compoundBlock.reasons } });
      expect(compound.ok).toBe(false);
      expect(compound.text).toContain(BLOCKED);
      expect(compound.text).not.toContain(AWAITING);
      expect(compoundBlock).toMatchObject({ plugin: "gf", form: h.fixtures.gf, message: BLOCKED });
      expect(compoundBlock.reasons).toEqual([`Gravity Forms ${GF_NEXT} is not the audited ${PINS.gf}`, "CleanTalk's generic AJAX check could not be removed"]);
      expect([done2.added, done2.env, genericCheck(done2.http), tokenBearing(done2.http)]).toEqual([[], [], [], []]);
    } finally {
      await setOptions({ pirax_harness_gf_ajax: null, pirax_harness_ct_ajax_rebind: null, pirax_harness_gf_ajax_version: null });
      await clearLastBlock();
    }
  }, 300_000);
}

test("GF modern AJAX: the marker only in a field a GF form filter adds is refused before CleanTalk's generic check; ordinary submissions with that field keep it", async () => {
  await setOptions({ pirax_harness_gf_ajax: true, pirax_harness_gf_dynamic_field: h.fixtures.gf });
  try {
    const m = await mark();
    const submit = async (dynamic: string) => {
      const { page } = visitor;
      await page.goto(h.fixtures.page);
      await page.locator(`#gform_${h.fixtures.gf} [name='input_50']`).fill(dynamic);
      return gfAjaxSubmit("gf dynamic field", { keepPage: true });
    };
    const marked = await submit(`Pirax dynamic ${marker}`);
    const ordinary = await submit("ordinary dynamic value");
    await h.drainQueues();
    const done = await since(m);
    await note("GF modern AJAX dynamic field", { marked: marked.ok, ordinary: ordinary.ok, http: done.http, added: done.added });
    expect(marked.ok).toBe(false);
    expect(marked.text).toContain(BLOCKED);
    expect(marked.text).not.toContain(AWAITING);
    expect(ordinary).toMatchObject({ ok: true, text: "Pirax GF thanks" });
    expect(tokenBearing(done.http)).toEqual([]);
    expect(genericCheck(done.http).length).toBe(1);
    expect(done.added.map((r) => r.plugin)).toEqual(["gf"]);
    expect(await h.php<string>(`return (string) GFAPI::get_entry(${done.added[0]!.id})['50'];`)).toBe("ordinary dynamic value");
    expect(done.env.filter((e) => e.subject.startsWith("[pirax-test"))).toEqual([]);
  } finally {
    await setOptions({ pirax_harness_gf_ajax: null, pirax_harness_gf_dynamic_field: null });
  }
}, 300_000);

/** Rows of a probe ledger in the site's pirax-harness directory (gf-meta: pirax_harness_gf_meta_probe, ct-skips: pirax_harness_ct_skip_probe). */
const probe = <T = { request: string }>(name: string) =>
  h.php<T[]>(`$f = WP_CONTENT_DIR . '/pirax-harness/${name}.jsonl'; return file_exists($f) ? array_map(fn($l) => json_decode($l, true), file($f, FILE_IGNORE_NEW_LINES)) : [];`);

/** Reads of GF's form meta table during plugins_loaded, before GF initializes. */
const gfMetaReads = async () => (await probe("gf-meta")).length;

/** gfAjaxSubmit(), plus how many early stored-form reads the request made. */
async function gfAjaxCounted(message: string, options?: Parameters<typeof gfAjaxSubmit>[1]) {
  const before = await gfMetaReads();
  const result = await gfAjaxSubmit(message, options);
  return { ...result, reads: (await gfMetaReads()) - before };
}

test("GF modern AJAX before GF initializes: ordinary requests read no stored form; a marked one reads it only under the audited GF core, and another GF version refuses it before any form read or CleanTalk request", async () => {
  await setOptions({ pirax_harness_gf_ajax: true, pirax_harness_gf_meta_probe: true });
  try {
    let m = await mark();
    const ordinary = await gfAjaxCounted("gf ordinary with the audited GF core");
    const marked = await gfAjaxCounted(`Pirax audited GF core ${marker}`);
    await h.drainQueues();
    let done = await since(m);
    await note("GF modern AJAX early reads: audited GF", { ordinary: [ordinary.ok, ordinary.reads], marked: [marked.ok, marked.reads], http: done.http, added: done.added });
    expect(ordinary).toMatchObject({ ok: true, text: "Pirax GF thanks", reads: 0 });
    expect(marked).toMatchObject({ ok: true, text: "Pirax GF thanks", reads: 1 });
    expect(genericCheck(done.http).length).toBe(1); // the ordinary one only
    expect(tokenBearing(done.http)).toEqual([]);
    expect(done.added.map((r) => r.plugin)).toEqual(["gf"]);
    expectRedirected(done.env.filter((e) => e.subject.startsWith("[pirax-test")));
    expectOriginal(done.env.filter((e) => e.subject === `gf-${h.fixtures.gf} notification A`), "owner@client.test");

    await setOptions({ pirax_harness_gf_ajax_version: GF_NEXT });
    try {
      await clearLastBlock();
      m = await mark();
      const wrongMarked = await gfAjaxCounted(`Pirax GF version ${marker}`);
      const wrongBlock = await lastBlock();
      const wrongOrdinary = await gfAjaxCounted("gf ordinary with another GF version");
      await h.drainQueues();
      done = await since(m);
      await note(`GF modern AJAX early reads: GF ${GF_NEXT}`, { marked: [wrongMarked.ok, wrongMarked.reads], ordinary: [wrongOrdinary.ok, wrongOrdinary.reads], http: done.http, added: done.added });
      expect(wrongMarked).toMatchObject({ ok: false, reads: 0 });
      // Version-only: the known GF version is the whole observable cause, found without reading the form.
      expect(wrongMarked.text).toContain(`${AWAITING}Gravity Forms ${GF_NEXT}`);
      expect(wrongMarked.text).not.toContain(BLOCKED);
      expect(wrongBlock).toMatchObject({ plugin: "gf", form: h.fixtures.gf, message: `${AWAITING}Gravity Forms ${GF_NEXT}` });
      expect(wrongBlock.reasons).toContain(`Gravity Forms ${GF_NEXT} is not the audited ${PINS.gf}`);
      expect(wrongOrdinary).toMatchObject({ ok: true, text: "Pirax GF thanks", reads: 0 });
      expect(genericCheck(done.http).length).toBe(1); // the ordinary one only
      expect(tokenBearing(done.http)).toEqual([]);
      expect(done.added.map((r) => r.plugin)).toEqual(["gf"]);
      expect(done.env.filter((e) => e.subject.startsWith("[pirax-test"))).toEqual([]);
    } finally {
      await setOptions({ pirax_harness_gf_ajax_version: null });
      await clearLastBlock();
    }
  } finally {
    await setOptions({ pirax_harness_gf_ajax: null, pirax_harness_gf_meta_probe: null });
  }
}, 300_000);

test("GF modern AJAX from a logged-in admin: with CleanTalk's logged-in protection off it binds no generic check; on, marked submissions have it removed and ordinary ones keep it (it runs, and skips this admin)", async () => {
  const original = await h.php<number | null>(`$s = get_option('cleantalk_settings'); return isset($s['data__protect_logged_in']) ? (int) $s['data__protect_logged_in'] : null;`);
  const protect = (value: number | null) =>
    h.php(`$s = get_option('cleantalk_settings'); if (null === ${lit(value)}) unset($s['data__protect_logged_in']); else $s['data__protect_logged_in'] = ${lit(value)}; update_option('cleantalk_settings', $s); return true;`);
  /** CleanTalk's generic check running (and skipping) during one submission. */
  const submit = async (message: string) => {
    const before = (await probe<{ where: string }>("ct-skips")).length;
    const result = await gfAjaxSubmit(message, { session: admin });
    const skips = (await probe<{ where: string }>("ct-skips")).slice(before).filter((r) => r.where.includes("ct_ajax_hook()"));
    return { ...result, ran: skips.length, skips: skips.map((r) => r.where) };
  };
  await setOptions({ pirax_harness_gf_ajax: true, pirax_harness_ct_skip_probe: true });
  try {
    for (const on of [0, 1]) {
      await protect(on);
      const m = await mark();
      const marked = await submit(`Pirax logged in ${marker}`);
      const ordinary = await submit(`gf ordinary logged in, protection ${on}`);
      await h.drainQueues();
      const done = await since(m);
      await note(`GF modern AJAX logged in, protection ${on}`, { marked: [marked.ok, marked.ran], ordinary: [ordinary.ok, ordinary.ran, ordinary.skips], http: done.http, added: done.added });
      expect(marked).toMatchObject({ ok: true, text: "Pirax GF thanks", ran: 0 });
      expect(ordinary).toMatchObject({ ok: true, text: "Pirax GF thanks", ran: on });
      // CleanTalk's own skip for this admin means no moderation request either way.
      expect(cleantalkAttempts(done.http)).toEqual([]);
      expect(tokenBearing(done.http)).toEqual([]);
      expect(done.added.map((r) => r.plugin)).toEqual(["gf"]);
      expect(done.feeds.map((f) => [f.plugin, f.entry])).toEqual([["gf", done.added[0]!.id]]);
      expect(done.env.filter((e) => e.subject.startsWith("[pirax-test")).map((e) => e.subject)).toEqual([`[pirax-test ${ID}] gf-${h.fixtures.gf} notification A`]);
      expectRedirected(done.env.filter((e) => e.subject.startsWith("[pirax-test")));
      expectOriginal(done.env.filter((e) => e.subject === `gf-${h.fixtures.gf} notification A`), "owner@client.test");
    }
  } finally {
    await protect(original);
    await setOptions({ pirax_harness_gf_ajax: null, pirax_harness_ct_skip_probe: null });
  }
}, 300_000);

test("marked wp_mail through FluentSMTP: control-padded and folded recipient headers never reach the effective envelope or the Simulator log; ordinary mail keeps them", async () => {
  const headers = `implode("\\r\\n", [chr(11) . 'Cc: cc@client.test', 'Bcc' . chr(11) . ': bcc@client.test', 'X-Keep: 1', "\\tCc: folded@client.test", ' Bcc: folded-bcc@client.test', 'Reply-To: visitor@example.test'])`;
  const send = (marked: boolean, subject: string) =>
    h.php<boolean>(`${marked ? `if (true !== \\Pirax\\FormTest\\mark('${ID}')) return false;` : ""} return wp_mail('owner@client.test', '${subject}', 'Body', ${headers});`);
  const m = await mark();
  expect(await send(false, "N2 ordinary")).toBe(true);
  expect(await send(true, "N2 marked")).toBe(true);
  const done = await since(m);
  const [ordinary = [], marked = []] = ["N2 ordinary", `[pirax-test ${ID}] N2 marked`].map((subject) => done.env.filter((e) => e.subject === subject));
  expect(ordinary).toEqual([expect.objectContaining({ to: ["owner@client.test"], cc: ["cc@client.test", "folded@client.test"], bcc: ["bcc@client.test", "folded-bcc@client.test"], transport: "fluentsmtp-simulator" })]);
  expect(marked).toEqual([expect.objectContaining({ to: [REDIRECT], cc: [], bcc: [], replyTo: ["visitor@example.test"], mailer: "fluent-smtp.php", transport: "fluentsmtp-simulator" })]);
  expectRedirected(marked);
  const sim = done.sim.filter((s) => s.subject.includes("N2 "));
  expect(sim.map((s) => [s.subject, s.to.join(","), s.provider, s.status])).toEqual([
    ["N2 ordinary", "owner@client.test", "Simulator", "sent"],
    [`[pirax-test ${ID}] N2 marked`, REDIRECT, "Simulator", "sent"],
  ]);
  expect(sim[1]!.headers.some((x) => /client\.test/.test(x) && /^(cc|bcc|to)\s*:/i.test(x))).toBe(false);
}, 120_000);

test("full stack after marked submissions: ordinary controls are unchanged", async () => {
  await ordinaryControls("after");
  expect(await h.php<number>(`global $apbct; return (int) $apbct->settings['wp__use_builtin_http_api'];`)).toBe(1);
}, 300_000);

// ---------------------------------------------------------------------------------------------
// AC5 — Pro's direct callbacks are suppressed, not merely dormant

test("Pro double opt-in and admin approval: ordinary submissions take Pro's path; marked ones get only the redirected notification", async () => {
  for (const feature of ["double_optin", "admin_approval"] as const) {
    await h.php(`pirax_harness_ff_pro_feature(${h.fixtures.ff}, '${feature}', true); return true;`);
    try {
      // Ordinary: Pro replaces the notification flow (its own mail, entry status) and answers first.
      let m = await mark();
      const ordinary = await ffSubmit(`ordinary ${feature}`);
      let done = await since(m);
      const status = await h.php<string>(`global $wpdb; return $wpdb->get_var($wpdb->prepare("SELECT status FROM {$wpdb->prefix}fluentform_submissions WHERE id = %d", ${ordinary.insertId}));`);
      await note(`pro ${feature}: ordinary`, { entry: ordinary.insertId, status, envelopes: done.env.map((e) => e.subject) });
      expect(ordinary.status).toBe(200);
      expect(status).toBe(feature === "double_optin" ? "unconfirmed" : "unapproved");
      expect(done.env.some((e) => e.subject === `ff-${h.fixtures.ff} notification A`)).toBe(false);
      expect(done.env.length).toBe(1); // Pro's opt-in mail to the visitor, or approval mail to the admin
      expect(done.env[0]!.to).toEqual([feature === "double_optin" ? "visitor@example.test" : "admin@localhost.com"]);

      // Marked: FF's own confirmation and notification only; nothing of Pro's.
      m = await mark();
      const marked = await ffSubmit(`Pirax ${feature} ${marker}`);
      await h.drainQueues();
      done = await since(m);
      await note(`pro ${feature}: marked`, { body: marked.body?.data?.result, envelopes: done.env.map((e) => e.subject), added: done.added });
      expect(marked.status).toBe(200);
      expect(marked.body?.data?.result?.message).toBe("Thank you for your message. We will get in touch with you shortly");
      expect(done.env.map((e) => e.subject)).toEqual([`[pirax-test ${ID}] ff-${h.fixtures.ff} notification A`]);
      expectRedirected(done.env);
      expect(done.added).toEqual([]);
      expect(cleantalkAttempts(done.http)).toEqual([]);
    } finally {
      await h.php(`pirax_harness_ff_pro_feature(${h.fixtures.ff}, '${feature}', false); return true;`);
    }
  }
}, 300_000);

test("Pro auto-delete and drafts: a marked entry outlives a failed queued mail until FF's retry and its draft survives; Pro deletes ordinary ones", async () => {
  const drafts = { ordinary: "piraxdraftordinary0001", marked: "piraxdraftmarked000001" };
  const draftsLeft = () =>
    h.php<string[]>(`global $wpdb; return $wpdb->get_col("SELECT hash FROM {$wpdb->prefix}fluentform_draft_submissions WHERE hash LIKE 'piraxdraft%' ORDER BY hash");`);
  await h.php(`
    global $wpdb;
    foreach (${lit(Object.values(drafts))} as $hash) {
      $wpdb->insert("{$wpdb->prefix}fluentform_draft_submissions", ['form_id' => ${h.fixtures.ff}, 'hash' => $hash, 'type' => 'saved_state_data', 'step_completed' => 0, 'response' => '{}', 'user_id' => 0, 'created_at' => current_time('mysql'), 'updated_at' => current_time('mysql')]);
    }
    pirax_harness_ff_pro_feature(${h.fixtures.ff}, 'auto_delete', true);
    return true;
  `);
  await setOptions({ pirax_harness_ff_async_email: true, pirax_harness_fail_mail: { match: [`ff-${h.fixtures.ff} notification A`], times: 2 } });
  try {
    expect(await draftsLeft()).toEqual([drafts.marked, drafts.ordinary].sort());
    const m = await mark();
    const ordinary = await ffSubmit("ordinary auto-delete", { __fluent_state_hash: drafts.ordinary });
    const marked = await ffSubmit(`Pirax auto-delete ${marker}`, { __fluent_state_hash: drafts.marked });
    expect([ordinary.status, marked.status]).toEqual([200, 200]);
    const [o, k] = [ordinary.insertId!, marked.insertId!];
    // Pro deleted the ordinary visitor's draft; the marked one is untouched.
    expect(await draftsLeft()).toEqual([drafts.marked]);

    // One runner: both notification jobs fail (retryable). FF's pending-only completion signal fires anyway:
    // Pro deletes the ordinary entry at once, but not the marked one, whose retry is still to come.
    await h.drainQueues();
    let rows = (await h.entries()).rows.filter((r) => r.plugin === "ff").map((r) => r.id);
    const jobs = await h.php<{ origin: number; status: string; retries: number }[]>(`
      global $wpdb;
      return array_map(fn($r) => ['origin' => (int) $r->origin_id, 'status' => $r->status, 'retries' => (int) $r->retry_count],
        $wpdb->get_results("SELECT * FROM {$wpdb->prefix}ff_scheduled_actions WHERE origin_id IN (${o}, ${k}) AND action = 'fluentform/integration_notify_notifications' ORDER BY id"));
    `);
    await note("pro auto-delete: after the failing runner", { ordinary: o, marked: k, rows, jobs });
    // Pro's deletion took the ordinary entry's retryable job with it; the marked job waits for its retry.
    expect(jobs).toEqual([{ origin: k, status: "failed", retries: 1 }]);
    expect(rows).not.toContain(o);
    expect(rows).toContain(k);

    // FF's own retry delivers the marked mail (redirected); then the helper removes the entry.
    await h.php("if (!wp_next_scheduled('fluentform_do_scheduled_tasks')) wp_schedule_event(time(), 'ff_every_five_minutes', 'fluentform_do_scheduled_tasks'); return true;");
    await h.runCron(["fluentform_do_scheduled_tasks"]);
    const done = await since(m);
    const markedMail = done.env.filter((e) => e.subject.startsWith("[pirax-test"));
    expect(markedMail.map((e) => e.subject)).toEqual([`[pirax-test ${ID}] ff-${h.fixtures.ff} notification A`]);
    expectRedirected(markedMail);
    expect(done.env.filter((e) => !e.subject.startsWith("[pirax-test")).every((e) => e.to[0] !== REDIRECT)).toBe(true);
    rows = (await h.entries()).rows.filter((r) => r.plugin === "ff").map((r) => r.id);
    expect(rows).not.toContain(k);
    expect(await draftsLeft()).toEqual([drafts.marked]);
    expect(done.http.filter((r) => r.purpose === "cleantalk-moderation").length).toBe(1); // the ordinary submission's only
  } finally {
    await setOptions({ pirax_harness_ff_async_email: null, pirax_harness_fail_mail: null });
    await h.php(`
      global $wpdb;
      pirax_harness_ff_pro_feature(${h.fixtures.ff}, 'auto_delete', false);
      $wpdb->query("DELETE FROM {$wpdb->prefix}fluentform_draft_submissions WHERE hash LIKE 'piraxdraft%'");
      return true;
    `);
    await h.drainQueues();
  }
}, 300_000);

test("one request: a marked entry's completion keeps Pro's auto-delete away, the next ordinary one gets it back, and the hook inventory ends identical", async () => {
  const result = await h.php<any>(`
    global $wpdb, $wp_filter;
    $form = wpFluent()->table('fluentform_forms')->find(${h.fixtures.ff});
    pirax_harness_ff_pro_feature($form->id, 'auto_delete', true);
    $insert = function () use ($wpdb, $form) {
      $wpdb->insert("{$wpdb->prefix}fluentform_submissions", ['form_id' => $form->id, 'response' => '{}', 'status' => 'unread', 'created_at' => current_time('mysql'), 'updated_at' => current_time('mysql')]);
      return (int) $wpdb->insert_id;
    };
    $inventory = function () use (&$wp_filter) {
      $out = [];
      foreach (['fluentform/before_insert_submission', 'fluentform/before_form_actions_processing', 'fluentform/submission_inserted', 'fluentform/global_notify_completed'] as $hook)
        foreach ($wp_filter[$hook]->callbacks as $priority => $callbacks) foreach ($callbacks as $key => $_) $out[] = "$hook $priority $key";
      return $out;
    };
    $exists = fn($id) => (bool) $wpdb->get_var($wpdb->prepare("SELECT id FROM {$wpdb->prefix}fluentform_submissions WHERE id = %d", $id));
    $marked = $insert();
    FluentForm\\App\\Helpers\\Helper::setSubmissionMeta($marked, '_pirax_form_test', '${ID}', $form->id);
    $ordinary = $insert();
    $before = $inventory();
    do_action('fluentform/global_notify_completed', $marked, $form);
    $during = $inventory();
    $markedKept = $exists($marked);
    do_action('fluentform/global_notify_completed', $ordinary, $form);
    $after = $inventory();
    pirax_harness_ff_pro_feature($form->id, 'auto_delete', false);
    return [
      'markedKept' => $markedKept, 'ordinaryDeleted' => !$exists($ordinary), 'identical' => $before === $after,
      'removed' => array_values(array_diff($before, $during)), 'marked' => $marked,
    ];
  `);
  expect(result.markedKept).toBe(true);
  expect(result.ordinaryDeleted).toBe(true);
  expect(result.identical).toBe(true);
  // While the marked completion ran: exactly the audited CleanTalk and Pro bindings were out.
  expect(result.removed.map((r: string) => r.split(" ").slice(0, 2).join(" ")).sort()).toEqual([
    "fluentform/before_form_actions_processing 10",
    "fluentform/before_insert_submission 10",
    "fluentform/global_notify_completed 10",
    "fluentform/submission_inserted 10",
  ]);
  // The marked entry (no jobs) was removed by the helper at the end of that request.
  expect((await h.entries()).rows.some((r) => r.plugin === "ff" && r.id === result.marked)).toBe(false);
});

// ---------------------------------------------------------------------------------------------
// AC3 — CleanTalk bindings: disabled, unrecognizable, re-registered

test("CleanTalk switched off for contact forms needs no binding; a rebound (unrecognizable) FF check blocks marked FF and the panel names it", async () => {
  const setting = (on: number) =>
    h.php(`$s = get_option('cleantalk_settings'); $s['forms__contact_forms_test'] = ${on}; update_option('cleantalk_settings', $s); return (int) get_option('cleantalk_settings')['forms__contact_forms_test'];`);
  expect(await setting(0)).toBe(0);
  try {
    const m = await mark();
    const ordinary = await ffSubmit("ordinary with CleanTalk off");
    const marked = await ffSubmit(`Pirax CleanTalk off ${marker}`);
    await h.drainQueues();
    const done = await since(m);
    expect([ordinary.status, marked.status]).toEqual([200, 200]);
    expect(done.http.filter((r) => r.purpose === "cleantalk-moderation")).toEqual([]); // really off
    expectRedirected(done.env.filter((e) => e.subject.startsWith("[pirax-test")));
    expect(done.added.map((r) => r.id)).toEqual([ordinary.insertId!]);
  } finally {
    expect(await setting(1)).toBe(1);
  }

  await setOptions({ pirax_harness_ct_rebind: true });
  try {
    const { hooks, verdict } = await panel("ff");
    expect(hooks["fluentform/before_insert_submission"]).toEqual(["closure:pirax-harness.php"]);
    expect(verdict).toContain("blocked: ");
    expect(verdict).toContain("CleanTalk's check on fluentform/before_insert_submission could not be identified");
    const m = await mark();
    const marked = await ffSubmit(`Pirax rebound ${marker}`);
    const ordinary = await ffSubmit("ordinary with rebound CleanTalk");
    const done = await since(m);
    expect(marked.status).toBe(423);
    expect(marked.text).toContain(BLOCKED);
    expect(ordinary.status).toBe(200);
    expect(done.added.map((r) => r.id)).toEqual([ordinary.insertId!]);
    // The rebound check still runs for ordinary submissions, and only for them.
    expect(done.http.filter((r) => r.purpose === "cleantalk-moderation").length).toBe(1);
  } finally {
    await setOptions({ pirax_harness_ct_rebind: null });
  }
}, 300_000);

test("CleanTalk re-registered during a marked submission's own dispatch is removed again; ordinary submissions keep it", async () => {
  await setOptions({ pirax_harness_ct_late: true });
  try {
    let m = await mark();
    const ff = await ffSubmit(`Pirax late ${marker}`);
    const gf = await gfSubmit(`Pirax late ${marker}`);
    await h.drainQueues();
    let done = await since(m);
    expect(ff.status).toBe(200);
    expect(gf.ok).toBe(true);
    expect(cleantalkAttempts(done.http)).toEqual([]);
    expect(done.env.length).toBe(2);
    expectRedirected(done.env);
    expect(done.added).toEqual([]);

    m = await mark();
    const ordinaryFf = await ffSubmit("ordinary late CleanTalk");
    const ordinaryGf = await gfSubmit("ordinary late CleanTalk");
    await h.drainQueues();
    done = await since(m);
    expect([ordinaryFf.status, ordinaryGf.ok]).toEqual([200, true]);
    expect(done.http.filter((r) => r.purpose === "cleantalk-moderation" && r.hooks.includes("fluentform/before_insert_submission")).length).toBeGreaterThanOrEqual(1);
    expect(done.http.filter((r) => r.purpose === "cleantalk-moderation" && r.hooks.includes("gform_entry_is_spam")).length).toBeGreaterThanOrEqual(1);
  } finally {
    await setOptions({ pirax_harness_ct_late: null });
  }
}, 300_000);

// ---------------------------------------------------------------------------------------------
// AC3/AC4 — exact versions at the native gates, and the panel

test("admin panel on the full stack: exact versions audited per form plugin and both ready", async () => {
  const [gf, ff] = [await panel("gf"), await panel("ff")];
  expect(gf.rows).toEqual([
    ["Gravity Forms", PINS.gf, "audited"],
    ["Anti-Spam by CleanTalk", PINS.cleantalk, "audited"],
    ["FluentSMTP", PINS.fluent_smtp, "audited"],
  ]);
  expect(ff.rows).toEqual([
    ["Fluent Forms", PINS.ff, "audited"],
    ["Fluent Forms Pro", PINS.ff_pro, "audited"],
    ["Anti-Spam by CleanTalk", PINS.cleantalk, "audited"],
    ["FluentSMTP", PINS.fluent_smtp, "audited"],
  ]);
  expect([gf.verdict, ff.verdict]).toEqual(["ready", "ready"]);
  expect([gf.hooks, ff.hooks]).toEqual([{}, {}]);
});

/**
 * One version declaration per plugin, rewritten from its pin to a genuinely different version (CleanTalk: a longer
 * form, the others: the next patch). withAlteredFile() requires the declaration to occur exactly once.
 */
const VERSIONS = [
  { name: "CleanTalk", label: "Anti-Spam by CleanTalk", file: "cleantalk-spam-protect/cleantalk.php", declare: (v: string) => `Version: ${v}\n`, pin: PINS.cleantalk, wrong: `${PINS.cleantalk}.1`, gf: true },
  { name: "Fluent Forms Pro", label: "Fluent Forms Pro", file: "fluentformpro/fluentformpro.php", declare: (v: string) => `define('FLUENTFORMPRO_VERSION', '${v}');`, pin: PINS.ff_pro, wrong: nextPatch(PINS.ff_pro), gf: false },
  { name: "FluentSMTP", label: "FluentSMTP", file: "fluent-smtp/boot.php", declare: (v: string) => `define('FLUENTMAIL_PLUGIN_VERSION', '${v}');`, pin: PINS.fluent_smtp, wrong: nextPatch(PINS.fluent_smtp), gf: true },
].map((v) => ({ ...v, search: v.declare(v.pin), replace: v.declare(v.wrong), reason: `${v.label} ${v.wrong} is not the audited ${v.pin}`, awaiting: `${AWAITING}${v.label} ${v.wrong}` }));

for (const v of VERSIONS) {
  test(`${v.name} at another version blocks marked ${v.gf ? "FF and GF" : "FF (not GF)"} at the native gates with the version-only message; the panel shows the version and still lists callbacks`, async () => {
    await withAlteredFile(v.file, v.search, v.replace, async () => {
      const [gf, ff] = [await panel("gf"), await panel("ff")];
      expect(ff.verdict).toContain(v.reason);
      expect(gf.verdict.includes(v.reason)).toBe(v.gf);
      if (v.name === "CleanTalk") {
        // Its bindings are only audited for the pinned version: now they are unaudited callbacks, still listed.
        expect(ff.hooks["fluentform/before_insert_submission"]).toEqual(["closure:cleantalk-spam-protect/lib/Cleantalk/Antispam/Integrations.php"]);
      }

      await clearLastBlock();
      const m = await mark();
      const ff1 = await ffSubmit(`Pirax version ${marker}`);
      const gf1 = await gfSubmit(`Pirax version ${marker}`);
      await h.drainQueues();
      const done = await since(m);
      const last = await lastBlock();
      await note(`version gate: ${v.name}`, { ff: ff1.status, ffMessage: ffRejection(ff1.body), gf: gf1.ok, added: done.added, feeds: done.feeds, last: last && { message: last.message, reasons: last.reasons } });
      expect(ff1.status).toBe(423);
      expect(ffRejection(ff1.body)).toBe(v.awaiting);
      expect(last).toMatchObject({ plugin: v.gf ? "gf" : "ff", message: v.awaiting });
      expect(last.reasons).toContain(v.reason);
      expect(done.feeds).toEqual([]);
      expect(done.http.filter((r) => r.purpose === "webhook-capture")).toEqual([]);
      if (v.gf) {
        expect(gf1.ok).toBe(false);
        expect(gf1.text).toContain(v.awaiting);
        expect(gf1.text).not.toContain(BLOCKED);
        expect(done.env).toEqual([]);
      } else {
        expect(gf1).toMatchObject({ ok: true, text: "Pirax GF thanks" });
        expect(done.env.map((e) => e.subject)).toEqual([`[pirax-test ${ID}] gf-${h.fixtures.gf} notification A`]);
        expectRedirected(done.env);
      }
      expect(done.added).toEqual([]);
      expect(cleantalkAttempts(done.http)).toEqual([]);
      expect(tokenBearing(done.http)).toEqual([]);

      // GF modern AJAX: a wrong CleanTalk version is refused before CleanTalk's generic check can run;
      // the other versions are refused later by the submission gate, with that check already removed.
      await setOptions({ pirax_harness_gf_ajax: true });
      try {
        const m2 = await mark();
        const ajax = await gfAjaxSubmit(`Pirax version ${marker}`);
        await h.drainQueues();
        const done2 = await since(m2);
        await note(`version gate (GF modern AJAX): ${v.name}`, { gf: ajax.ok, http: done2.http, added: done2.added });
        if (v.gf) {
          expect(ajax.ok).toBe(false);
          expect(ajax.text).toContain(v.awaiting);
          expect(ajax.text).not.toContain(BLOCKED);
          expect(done2.env).toEqual([]);
        } else {
          expect(ajax).toMatchObject({ ok: true, text: "Pirax GF thanks" });
          expectRedirected(done2.env);
        }
        expect(done2.added).toEqual([]);
        expect(cleantalkAttempts(done2.http)).toEqual([]);
        expect(tokenBearing(done2.http)).toEqual([]);
      } finally {
        await setOptions({ pirax_harness_gf_ajax: null });
        await clearLastBlock();
      }
    });
    // Restored: ready again for both.
    expect([(await panel("gf")).verdict, (await panel("ff")).verdict]).toEqual(["ready", "ready"]);
  }, 300_000);
}

/** Switch Fluent Forms Pro's Inventory module, whose submission callbacks are not audited. */
const inventoryModule = (on: boolean) =>
  h.php(`$m = (array) get_option('fluentform_global_modules_status', []); $m['inventory_module'] = '${on ? "yes" : "no"}'; update_option('fluentform_global_modules_status', $m); return true;`);

test("an unaudited optional Pro module (Inventory) keeps blocking marked FF with the generic message; the panel names its callbacks", async () => {
  const module = inventoryModule;
  await module(true);
  try {
    const { hooks, verdict } = await panel("ff");
    expect(verdict).toMatch(/^blocked: \d+ unaudited callback\(s\) on submission hooks$/);
    expect(hooks["fluentform/submission_inserted"]).toContain("FluentFormPro\\classes\\Inventory\\InventoryController::insertGlobalInventory");
    expect(hooks["fluentform/before_insert_submission"]).toContain("closure:fluentformpro/src/classes/Inventory/InventoryController.php");
    const m = await mark();
    const marked = await ffSubmit(`Pirax inventory ${marker}`);
    const done = await since(m);
    expect(marked.status).toBe(423);
    expect(ffRejection(marked.body)).toBe(BLOCKED);
    expect(done.added).toEqual([]);
    expect(done.env).toEqual([]);

    // The blocked request's own diagnosis is kept for the panel: reasons and callback identities, no values.
    const last = await h.php<any>(`return get_option('pirax_form_test_last_block');`);
    expect(last).toMatchObject({ plugin: "ff", form: expect.any(Number), message: BLOCKED });
    expect(last.reasons.join("; ")).toMatch(/\d+ unaudited callback\(s\) on submission hooks/);
    expect(last.unaudited).toContainEqual({ hook: "fluentform/submission_inserted", priority: expect.any(Number), id: "FluentFormPro\\classes\\Inventory\\InventoryController::insertGlobalInventory" });
    const raw = JSON.stringify(last);
    expect([raw.includes(h.token), raw.includes(marker), raw.includes("Pirax inventory")]).toEqual([false, false, false]);
    await admin.page.goto(`${h.url}${SETTINGS}`);
    const note = admin.page.locator("#pirax-form-test-last-block");
    expect(await note.locator(".pirax-form-test-last-reasons").innerText()).toMatch(/Fluent Forms form \d+: .*unaudited callback/);
    expect(await note.locator("ul.pirax-form-test-last-unaudited").innerText()).toContain("InventoryController::insertGlobalInventory");
  } finally {
    await module(false);
    await h.php(`delete_option('pirax_form_test_last_block'); return true;`);
  }
  expect((await panel("ff")).verdict).toBe("ready");
}, 300_000);

test("Pro at the next patch: its own Inventory callbacks keep the version-only message, a second mismatch is listed in report order, and a callback outside every mismatched plugin (a rebound CleanTalk wrapper) makes it generic; all stay blocked", async () => {
  const [pro, smtp] = [VERSIONS.find((v) => v.name === "Fluent Forms Pro")!, VERSIONS.find((v) => v.name === "FluentSMTP")!];
  /** One marked FF submission: rejected before insert, mail, feeds and CleanTalk; returns its message. */
  const blocked = async (label: string) => {
    const m = await mark();
    const result = await ffSubmit(`Pirax ${label} ${marker}`);
    await h.drainQueues();
    const done = await since(m);
    await note(`version-only classification: ${label}`, { status: result.status, message: ffRejection(result.body), added: done.added, feeds: done.feeds });
    expect(result.status).toBe(423);
    expect([done.added, done.env, done.feeds, cleantalkAttempts(done.http), tokenBearing(done.http)]).toEqual([[], [], [], [], []]);
    return ffRejection(result.body);
  };
  await withAlteredFile(pro.file, pro.search, pro.replace, async () => {
    await inventoryModule(true);
    try {
      expect((await panel("ff")).hooks["fluentform/submission_inserted"]).toContain("FluentFormPro\\classes\\Inventory\\InventoryController::insertGlobalInventory");
      expect(await blocked("pro inventory")).toBe(pro.awaiting);
    } finally {
      await inventoryModule(false);
    }
    await withAlteredFile(smtp.file, smtp.search, smtp.replace, async () => {
      expect(await blocked("pro and smtp")).toBe(`${AWAITING}Fluent Forms Pro ${pro.wrong}, FluentSMTP ${smtp.wrong}`);
    });
    await setOptions({ pirax_harness_ct_rebind: true });
    try {
      expect(await blocked("pro with rebound CleanTalk")).toBe(BLOCKED);
    } finally {
      await setOptions({ pirax_harness_ct_rebind: null });
    }
  });
  await clearLastBlock();
  expect((await panel("ff")).verdict).toBe("ready");
}, 600_000);

// ---------------------------------------------------------------------------------------------
// AC7 — evidence

test("retained evidence names every version and ZIP hash and contains no token or licensed path", async () => {
  await h.closeBrowser(visitor.context);
  await h.closeBrowser(admin.context);
  visitor = admin = undefined as any;
  const evidence = await h.saveEvidence();
  expect(evidence.files).toEqual(expect.arrayContaining(["http.jsonl", "envelopes.jsonl", "simulator.jsonl", "manifest.json"]));
  const manifest = await Bun.file(`${h.artifactDir}/manifest.json`).json();
  expect(manifest.versions).toMatchObject({ gf: PINS.gf, ff: PINS.ff, ffPro: PINS.ff_pro, cleantalk: PINS.cleantalk, fluentSmtp: PINS.fluent_smtp });
  expect(Object.keys(manifest.zips).sort()).toEqual(["cleantalk", "fluentSmtp", "fluentform", "fluentformpro", "gravityforms"]);
  expect(await findSecret(h.artifactDir, [h.token, process.env.GRAVITY_FORMS_ZIP!, process.env.FLUENT_FORMS_PRO_ZIP!])).toEqual([]);
}, 120_000);
