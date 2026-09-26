// Safety hardening regressions against real Gravity Forms and Fluent Forms (plan D4, D7–D9; AC3, AC5–AC7):
// a late FF feed-type filter, a throwing queued FF notification, FF CAPTCHA vs. rejection precedence,
// GF recovery of queued work for swept entries, and the exact audited version gate.
// bun --env-file=/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/.env test test/plugin/safety.test.ts
import { afterAll, beforeAll, expect, setDefaultTimeout, test } from "bun:test";
import { appendFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { BrowserContext, Page } from "playwright";
import { findSecret } from "./artifacts";
import { startHarness, type Harness, type MailRecord } from "./harness";

// Playground round trips exceed Bun's 5 s default. Bun 1.4 scopes this to the calling file, so every suite sets it.
setDefaultTimeout(180_000);

const ROOT = resolve(import.meta.dir, "../..");
const ZIP = join(ROOT, "dist/pirax-form-test.zip");
const REDIRECT = "form-tests+pirax@operator.test";
const ID = "abc123";
const BLOCKED = "Pirax test blocked: integrations could not be suppressed";
const DUMMY_CAPTCHA = "pirax-dummy-recaptcha-response";

/** A PHP expression decoding a JSON value (single-quoted literal, so `$` and `\` stay literal). */
const lit = (v: unknown) => `json_decode('${JSON.stringify(v).replace(/\\/g, "\\\\").replace(/'/g, "\\'")}', true)`;

let h: Harness;
let visitor: { context: BrowserContext; page: Page };
let marker: string;

beforeAll(async () => {
  const build = await Bun.$`bun run build:plugin`.cwd(ROOT).quiet().nothrow();
  if (build.exitCode !== 0) throw new Error(`build:plugin failed: ${build.stderr}`);
  h = await startHarness({ run: "safety" });
  marker = `${h.token}-${ID}`;

  const admin = await h.browser("safety-install");
  await admin.page.goto(`${h.url}/wp-login.php`);
  await admin.page.fill("#user_login", h.users.admin.login);
  await admin.page.fill("#user_pass", h.users.admin.password);
  await admin.page.click("#wp-submit");
  await admin.page.waitForURL(/\/wp-admin\/?/);
  await h.uploadPlugin(admin.page, ZIP);
  await h.closeBrowser(admin.context);
  await setOptions({ pirax_form_test_token: h.token, pirax_form_test_redirect: REDIRECT });

  visitor = await h.browser("safety-visitor");
  // Local, deterministic reCAPTCHA widget; the dummy response still goes to (harness-answered) siteverify.
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

/** Submit a rendered FF form in the browser (as adapters.test.ts does). */
async function ffSubmit(formId: number, url: string, values: Record<string, string>, opts: { captcha?: boolean } = {}) {
  const { page } = visitor;
  await page.goto(url);
  const form = page.locator(`form[data-form_id='${formId}']`);
  for (const [name, value] of Object.entries(values)) await form.locator(`[name='${name}']`).fill(value);
  if (opts.captcha)
    await form.evaluate((f, value) => {
      const input = Object.assign(document.createElement("input"), { type: "hidden", name: "g-recaptcha-response", value });
      f.appendChild(input);
    }, DUMMY_CAPTCHA);
  const response = page.waitForResponse((r) => r.url().includes("admin-ajax.php") && (r.request().postData() ?? "").includes("action=fluentform_submit"));
  await form.locator("button[type=submit]").click();
  const res = await response;
  const body = await res.json().catch(() => null);
  const ok = res.ok();
  if (ok) await page.locator(".ff-message-success").first().waitFor();
  return { ok, text: JSON.stringify(body), insertId: ok ? Number(body?.data?.insert_id ?? body?.insert_id) : undefined };
}

const ffValues = (message: string, first = "Pirax") => ({ "names[first_name]": first, email: "visitor@example.test", message });

function expectRedirected(mails: MailRecord[], id = ID) {
  expect(mails.length).toBeGreaterThan(0);
  for (const m of mails) {
    expect(m.to).toEqual([REDIRECT]);
    expect(m.subject.startsWith(`[pirax-test ${id}] `)).toBe(true);
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

const ffExists = async (id: number) => (await h.entries()).rows.some((r) => r.plugin === "ff" && r.id === id);

// ---------------------------------------------------------------------------------------------
// Criterion 1 — a late feed-type filter cannot bring back native feeds for a marked FF submission

test("FF: a later PHP_INT_MAX feed-type filter registered after the plugin cannot resurrect the ledger feed on a marked submission", async () => {
  await setOptions({ pirax_harness_late_feed_types: true });
  try {
    const before = await counts();
    const marked = await ffSubmit(h.fixtures.ff, h.fixtures.page, ffValues(`Pirax check ${marker}`));
    expect(marked.ok).toBe(true);
    await h.drainQueues();
    const mail = (await h.mail()).slice(before.mail);
    expect(mail.map((m) => m.subject).sort()).toEqual([
      `[pirax-test ${ID}] ff-${h.fixtures.ff} notification A`,
      `[pirax-test ${ID}] ff-${h.fixtures.ff} notification B`,
    ]);
    expectRedirected(mail);
    expect((await h.feeds()).slice(before.feeds)).toEqual([]);
    expect(await ffRows([marked.insertId!])).toEqual([]);
    expect(await ffExists(marked.insertId!)).toBe(false);

    // Ordinary submissions keep the late filter's effect and their feed.
    const ordinary = await ffSubmit(h.fixtures.ff, h.fixtures.page, ffValues("ordinary message"));
    expect(ordinary.ok).toBe(true);
    await h.drainQueues();
    expect((await h.feeds()).slice(before.feeds).map((f) => [f.plugin, f.entry])).toEqual([["ff", ordinary.insertId]]);
    expectOriginal((await h.mail()).slice(before.mail + 2));
  } finally {
    await setOptions({ pirax_harness_late_feed_types: null });
  }
}, 240_000);

// ---------------------------------------------------------------------------------------------
// Criterion 2 — a throwing queued marked notification does not leave its context behind

test("FF queued: a marked notification that throws inside native mail processing does not redirect the next ordinary job in the same runner request", async () => {
  await setOptions({
    pirax_harness_ff_async_email: true,
    pirax_harness_fail_mail: { match: [`[pirax-test ${ID}] `, "notification B"], times: 1, throw: true },
  });
  try {
    const before = await counts();
    const marked = await ffSubmit(h.fixtures.ff, h.fixtures.page, ffValues(`Pirax check ${marker}`));
    const ordinary = await ffSubmit(h.fixtures.ff, h.fixtures.page, ffValues("ordinary queued message"));
    expect(marked.ok && ordinary.ok).toBe(true);
    const [m, o] = [marked.insertId!, ordinary.insertId!];
    expect((await ffRows([m, o])).map((r) => r.status)).toEqual(["pending", "pending", "pending", "pending", "pending"]);

    // One Action Scheduler runner request: marked A, marked B (throws; AS catches and continues), ordinary jobs.
    await h.drainQueues();
    const mail = (await h.mail()).slice(before.mail);
    await note("ff throw: after one runner request", { marked: m, ordinary: o, rows: await ffRows([m, o]), subjects: mail.map((x) => x.subject.replace(/\[pirax-test [a-z0-9]+\] /, "[pirax-test] ")) });
    const failedAs = await h.php<number>(`return count(as_get_scheduled_actions(['hook' => 'fluentform/schedule_feed', 'status' => ActionScheduler_Store::STATUS_FAILED, 'per_page' => -1], 'ids'));`);
    expect(failedAs).toBe(1);
    const ordinaryMail = mail.filter((x) => x.message.includes("ordinary queued message"));
    expect(ordinaryMail.length).toBe(2);
    expectOriginal(ordinaryMail);
    const markedMail = mail.filter((x) => !ordinaryMail.includes(x));
    expect(markedMail.map((x) => x.subject)).toEqual([`[pirax-test ${ID}] ff-${h.fixtures.ff} notification A`]);
    expectRedirected(markedMail);
    expect(new Set(mail.map((x) => x.request)).size).toBe(1); // same runner request
    expect(markedMail[0].time).toBeLessThan(Math.min(...ordinaryMail.map((x) => x.time)));

    // The thrown job is reported failed (retryable), and the marked entry is kept for it.
    expect((await ffRows([m])).map((r) => [r.status, r.retries])).toEqual([["success", 1], ["failed", 1]]);
    expect(await ffExists(m)).toBe(true);

    // FF's own retry delivers it to the redirect, then the marked entry is removed; the ordinary one stays.
    await h.php("if (!wp_next_scheduled('fluentform_do_scheduled_tasks')) wp_schedule_event(time(), 'ff_every_five_minutes', 'fluentform_do_scheduled_tasks'); return true;");
    await h.runCron(["fluentform_do_scheduled_tasks"]);
    const retried = (await h.mail()).slice(before.mail + mail.length);
    expect(retried.map((x) => x.subject)).toEqual([`[pirax-test ${ID}] ff-${h.fixtures.ff} notification B`]);
    expectRedirected(retried);
    expect(await ffExists(m)).toBe(false);
    expect(await ffExists(o)).toBe(true);
  } finally {
    await setOptions({ pirax_harness_ff_async_email: null, pirax_harness_fail_mail: null });
  }
}, 300_000);

// ---------------------------------------------------------------------------------------------
// Brief 6 — native cleanup deletes the marked entry after the runner loaded it (cleanup race)

/** Queued FF feed payloads per row: whether each carries the plugin's key, and its value when it is a string. */
const ffPayloads = (ids: number[]) =>
  h.php<{ origin: number; has: boolean; value: string | null }[]>(`
    global $wpdb;
    $ids = array_map('intval', ${lit(ids)}) ?: [0];
    return array_map(function ($r) { $feed = maybe_unserialize($r->data); $has = is_array($feed) && array_key_exists('_pirax_form_test', $feed);
      return ['origin' => (int) $r->origin_id, 'has' => $has, 'value' => $has && is_string($feed['_pirax_form_test']) ? $feed['_pirax_form_test'] : null]; },
      $wpdb->get_results("SELECT * FROM {$wpdb->prefix}ff_scheduled_actions WHERE origin_id IN (" . implode(',', $ids) . ") ORDER BY id"));
  `);

test("FF queued cleanup race: a marked entry deleted natively after the runner loaded it, with the token rotated, still sends only redirected mail; ordinary jobs stay ordinary", async () => {
  await setOptions({ pirax_harness_ff_async_email: true });
  try {
    const before = await counts();
    const marked = await ffSubmit(h.fixtures.ff, h.fixtures.page, ffValues(`Pirax check ${marker}`));
    const ordinary = await ffSubmit(h.fixtures.ff, h.fixtures.page, ffValues("ordinary race message"));
    expect(marked.ok && ordinary.ok).toBe(true);
    const [m, o] = [marked.insertId!, ordinary.insertId!];
    const payloads = await ffPayloads([m, o]);

    // Runner request only: the marked entry and its meta are deleted natively at priority 8 of its first job.
    await setOptions({ pirax_harness_ff_delete_on_notify: m, pirax_form_test_token: `rotated-${h.token}` });
    await h.drainQueues();
    const mail = (await h.mail()).slice(before.mail);
    await note("ff cleanup race: after runner", { marked: m, ordinary: o, rows: await ffRows([m, o]), subjects: mail.map((x) => x.subject.replace(/\[pirax-test [a-z0-9]+\] /, "[pirax-test] ")) });
    expect(await h.php<unknown>("return get_option('pirax_harness_ff_delete_on_notify');")).toBe(false); // the deletion ran
    expect(await ffExists(m)).toBe(false);
    expect(await ffExists(o)).toBe(true);

    const ordinaryMail = mail.filter((x) => x.message.includes("ordinary race message"));
    expect(ordinaryMail.length).toBe(2);
    expectOriginal(ordinaryMail);
    const markedMail = mail.filter((x) => !ordinaryMail.includes(x));
    // Deleting the entry also removed its second queued job natively; the job already running still sends, redirected.
    expect(markedMail.map((x) => x.subject)).toEqual([`[pirax-test ${ID}] ff-${h.fixtures.ff} notification A`]);
    expectRedirected(markedMail);

    // Only the marked jobs carry the (validated, token-free) submission-time id; the ordinary
    // submission's two notification jobs and its ledger job carry none.
    expect(payloads).toEqual([
      { origin: m, has: true, value: ID },
      { origin: m, has: true, value: ID },
      ...Array(3).fill({ origin: o, has: false, value: null }),
    ]);
  } finally {
    await setOptions({ pirax_harness_ff_async_email: null, pirax_harness_ff_delete_on_notify: null, pirax_form_test_token: h.token });
  }
}, 300_000);

// ---------------------------------------------------------------------------------------------
// Criterion 3 — unsupported marked FF form with reCAPTCHA gets the blocked message, not a CAPTCHA error

test("FF unsupported marked form with reCAPTCHA and failing siteverify is rejected with the blocked message before CAPTCHA", async () => {
  const { ff, page } = h.fixtures.captcha;
  await setOptions({ pirax_harness_direct_dispatch: true });
  try {
    let before = await counts();
    const marked = await ffSubmit(ff, page, ffValues(`Pirax check ${marker}`), { captcha: true });
    expect(marked.ok).toBe(false);
    expect(marked.text).toContain(BLOCKED);
    expect(marked.text).not.toContain("reCaptcha");
    await h.drainQueues();
    const after = await counts();
    expect([after.mail, after.feeds, after.entries.ff, after.siteverify]).toEqual([before.mail, before.feeds, before.entries.ff, before.siteverify]);

    // Non-marker submissions keep FF's own CAPTCHA error.
    before = await counts();
    const ordinary = await ffSubmit(ff, page, ffValues("ordinary message"), { captcha: true });
    expect(ordinary.ok).toBe(false);
    expect(ordinary.text).toContain("reCaptcha verification failed");
    expect(ordinary.text).not.toContain("Pirax test blocked");
    expect((await h.siteverify()).length).toBe(before.siteverify + 1);
    expect((await h.entries()).ff).toBe(before.entries.ff);
  } finally {
    await setOptions({ pirax_harness_direct_dispatch: null });
  }
}, 240_000);

// ---------------------------------------------------------------------------------------------
// Criterion 4 — GF sweep removes an old token entry's queued native work (entry snapshots included)

/** GF background batches per processor: entry id per task, `snapshot:<id>` for tasks carrying the entry itself. */
const gfBatches = () =>
  h.php<Record<string, (number | string)[][]>>(`
    $container = GFForms::get_service_container();
    $processors = [$container->get('notifications_processor'), $container->get('feeds_processor')];
    foreach (GFAddOn::get_registered_addons(true) as $addon) if ($addon instanceof GFFeedAddOn) $processors[] = gf_feed_processor($addon);
    $out = [];
    foreach ($processors as $p) foreach ($p->get_batches() as $batch)
      $out[$p->get_identifier()][] = array_map(fn($t) => isset($t['entry_id']) ? (int) $t['entry_id'] : 'snapshot:' . (int) rgars($t, 'entry/id'), array_values((array) $batch->data));
    return (object) $out;
  `);

test("GF sweep: an old token entry's queued notifications (entry snapshots included) and feeds are removed before deletion; ordinary queued work runs; active worker defers", async () => {
  const ids = await h.php<{ old: number; ordinary: number; lock: string }>(`
    $gf = ${h.fixtures.gf};
    $container = GFForms::get_service_container();
    $notes = $container->get('notifications_processor');
    $ledger = null;
    foreach (GFAddOn::get_registered_addons(true) as $addon) if ($addon instanceof GFFeedAddOn && $addon->get_slug() === 'pirax-harness-ledger') $ledger = $addon;
    $feeds = gf_feed_processor($ledger);
    $form = GFAPI::get_form($gf);
    $add = function ($value) use ($gf) {
      $id = GFAPI::add_entry(['form_id' => $gf, '1' => 'Seed', '2' => 'seed@example.test', '3' => $value, 'date_created' => gmdate('Y-m-d H:i:s', time() - 3700)]);
      if (is_wp_error($id)) throw new RuntimeException($id->get_error_message());
      return (int) $id;
    };
    $old = $add('Pirax check ' . get_option('pirax_form_test_token') . '-${ID}');
    $ordinary = $add('ordinary queued message');
    $byId = fn($id) => ['notifications' => ['pirax00000001'], 'form_id' => $gf, 'entry_id' => $id, 'event' => 'form_submission', 'data' => []];
    $snapshot = ['notification' => $form['notifications']['pirax00000002'], 'form_id' => $gf, 'entry' => GFAPI::get_entry($old), 'event' => 'form_submission', 'data' => []];
    // One mixed batch and one batch holding only the old entry's snapshot task.
    $notes->push_to_queue($byId($old))->push_to_queue($snapshot)->push_to_queue($byId($ordinary))->save();
    $notes->push_to_queue($snapshot)->save();
    $feed = GFAPI::get_feed(${h.fixtures.feeds.gf});
    foreach ([$old, $ordinary] as $id) $feeds->push_to_queue(['addon' => get_class($ledger), 'feed' => $feed, 'entry_id' => $id, 'form_id' => $gf]);
    $feeds->save();
    return ['old' => $old, 'ordinary' => $ordinary, 'lock' => $notes->get_identifier() . '_process_lock'];
  `);
  const { old, ordinary } = ids;
  const queued = await gfBatches();
  await note("gf sweep: seeded", { old, ordinary, batches: queued });
  expect(queued["wp_gf_notifications_processor"]).toEqual([[old, `snapshot:${old}`, ordinary], [`snapshot:${old}`]]);
  expect(queued["wp_gf_pirax-harness-ledger_feed_processor"]).toEqual([[old, ordinary]]);
  const gfExists = async (id: number) => (await h.entries()).rows.some((r) => r.plugin === "gf" && r.id === id);

  // A notifications worker holds its lock: the entry and every batch are left for a later run.
  await h.php(`set_site_transient('${ids.lock}', microtime(), 600); return true;`);
  try {
    await h.runCron(["pirax_form_test_sweep"]);
    await note("gf sweep: with active worker", { batches: await gfBatches(), oldExists: await gfExists(old) });
    expect(await gfExists(old)).toBe(true);
    expect(await gfBatches()).toEqual(queued);
  } finally {
    await h.php(`delete_site_transient('${ids.lock}'); return true;`);
  }

  // Worker gone: queued work for the old entry is removed, then the entry; the ordinary work stays.
  await h.runCron(["pirax_form_test_sweep"]);
  const pruned = await gfBatches();
  await note("gf sweep: after", { batches: pruned, oldExists: await gfExists(old) });
  expect(await gfExists(old)).toBe(false);
  expect(await gfExists(ordinary)).toBe(true);
  expect(pruned).toEqual({ wp_gf_notifications_processor: [[ordinary]], "wp_gf_pirax-harness-ledger_feed_processor": [[ordinary]] });

  // The real runners then send only the ordinary notification and run only the ordinary feed.
  const before = await counts();
  await h.drainQueues();
  const mail = (await h.mail()).slice(before.mail);
  expect(mail.map((m) => m.subject)).toEqual([`gf-${h.fixtures.gf} notification A`]);
  expectOriginal(mail);
  expect(mail.some((m) => m.message.includes(`-${ID}`))).toBe(false);
  expect((await h.feeds()).slice(before.feeds).map((f) => [f.plugin, f.entry])).toEqual([["gf", ordinary]]);
  expect(await gfBatches()).toEqual({});
}, 300_000);

// ---------------------------------------------------------------------------------------------
// Criterion 5 — exact audited versions

test("compatibility gate accepts exactly GF 3.1.2 and FF 6.2.14", async () => {
  const result = await h.php<any>(`
    $audited = fn($plugin, $versions) => array_combine($versions, array_map(fn($v) => Pirax\\FormTest\\version_is_audited($plugin, $v), $versions));
    $form = GFAPI::get_form(${h.fixtures.gf});
    $ffForm = wpFluent()->table('fluentform_forms')->find(${h.fixtures.ff});
    $real = GFForms::$version;
    $out = [
      'installed' => [$real, FLUENTFORM_VERSION],
      'gf' => $audited('gf', ['3.1.2', '3.1.3', '3.1.20', '3.1', '3.1.2.1', '3.1.2-beta', '3.2.0']),
      'ff' => $audited('ff', ['6.2.14', '6.2.15', '6.2.1', '6.2', '6.2.14.1', '6.3.0']),
      'supported' => [Pirax\\FormTest\\gf_supported($form), Pirax\\FormTest\\ff_supported($ffForm)],
    ];
    GFForms::$version = '3.1.3';
    $out['nextPatch'] = Pirax\\FormTest\\gf_supported($form);
    GFForms::$version = $real;
    return $out;
  `);
  expect(result).toEqual({
    installed: ["3.1.2", "6.2.14"],
    gf: { "3.1.2": true, "3.1.3": false, "3.1.20": false, "3.1": false, "3.1.2.1": false, "3.1.2-beta": false, "3.2.0": false },
    ff: { "6.2.14": true, "6.2.15": false, "6.2.1": false, "6.2": false, "6.2.14.1": false, "6.3.0": false },
    supported: [true, true],
    nextPatch: false,
  });
}, 60_000);

test("retained evidence contains no token", async () => {
  await h.closeBrowser(visitor.context);
  visitor = undefined as any;
  const evidence = await h.saveEvidence();
  expect(evidence.files).toEqual(expect.arrayContaining(["mail.jsonl", "feeds.jsonl", "entries.json", "manifest.json"]));
  expect(await findSecret(h.artifactDir, [h.token])).toEqual([]);
}, 120_000);
