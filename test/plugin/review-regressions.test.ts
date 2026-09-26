// Review round 1 regressions (plan D5, D9; AC2, AC7) against the uploaded ZIP in real WordPress:
// the effective PHPMailer envelope for header names WordPress trims (review B F1), and recovery of
// old FF test entries after the field holding the marker was renamed or removed (review B F2).
// bun --env-file=/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/.env test test/plugin/review-regressions.test.ts
import { afterAll, beforeAll, expect, setDefaultTimeout, test } from "bun:test";
import { join, resolve } from "node:path";
import { findSecret } from "./artifacts";
import { startHarness, type Harness } from "./harness";

// Playground round trips exceed Bun's 5 s default. Bun 1.4 scopes this to the calling file, so every suite sets it.
setDefaultTimeout(180_000);

const ROOT = resolve(import.meta.dir, "../..");
const ZIP = join(ROOT, "dist/pirax-form-test.zip");
const REDIRECT = "form-tests+pirax@operator.test";

/** A PHP expression decoding a JSON value (single-quoted literal, so `$` and `\` stay literal). */
const lit = (v: unknown) => `json_decode('${JSON.stringify(v).replace(/\\/g, "\\\\").replace(/'/g, "\\'")}', true)`;

let h: Harness;
let marker: string;
beforeAll(async () => {
  const build = await Bun.$`bun run build:plugin`.cwd(ROOT).quiet().nothrow();
  if (build.exitCode !== 0) throw new Error(`build:plugin failed: ${build.stderr}`);
  h = await startHarness({ run: "review-regressions" });
  marker = `${h.token}-abc123`;
  const admin = await h.browser("review-regressions-install");
  await admin.page.goto(`${h.url}/wp-login.php`);
  await admin.page.fill("#user_login", h.users.admin.login);
  await admin.page.fill("#user_pass", h.users.admin.password);
  await admin.page.click("#wp-submit");
  await admin.page.waitForURL(/\/wp-admin\/?/);
  await h.uploadPlugin(admin.page, ZIP);
  await h.closeBrowser(admin.context);
  await h.php(`update_option('pirax_form_test_token', ${lit(h.token)}, false); update_option('pirax_form_test_redirect', ${lit(REDIRECT)}, false); return true;`);
}, 600_000);
afterAll(async () => {
  await h?.stop();
}, 60_000);

/**
 * Runs `code` (which assigns $sent = wp_mail(...)) with the harness's PHP_INT_MAX pre_wp_mail observer
 * removed, so native wp_mail() header parsing reaches PHPMailer. The production PHP_INT_MIN guard stays.
 * A phpmailer_init observer records the effective envelope and throws before any transport.
 */
const envelope = (code: string) =>
  h.php<any>(`
    remove_all_filters('pre_wp_mail', PHP_INT_MAX);
    $failed = [];
    add_action('wp_mail_failed', function ($e) use (&$failed) { $failed[] = $e->get_error_code(); });
    $envelope = null;
    add_action('phpmailer_init', static function ($m) use (&$envelope) {
      $names = fn($list) => array_values(array_map(fn($a) => $a[0], $list));
      $envelope = ['to' => $names($m->getToAddresses()), 'cc' => $names($m->getCcAddresses()), 'bcc' => $names($m->getBccAddresses()),
        'from' => $m->From, 'replyTo' => $names($m->getReplyToAddresses()), 'subject' => $m->Subject, 'headers' => $names($m->getCustomHeaders())];
      throw new \\PHPMailer\\PHPMailer\\Exception('stopped before transport');
    }, PHP_INT_MAX);
    try { ${code} } catch (\\PHPMailer\\PHPMailer\\Exception $e) { $sent = 'stopped before transport'; }
    return ['guard' => PHP_INT_MIN === has_filter('pre_wp_mail', 'Pirax\\FormTest\\guard_mail'), 'sent' => $sent, 'failed' => $failed, 'envelope' => $envelope];
  `);

test("marked wp_mail: control-prefixed Cc/Bcc header names never reach the native envelope; ordinary mail keeps them", async () => {
  const hidden = `chr(11) . 'Cc: cc@client.test', chr(0) . 'Bcc: bcc@client.test', 'Cc' . chr(11) . ': cc2@client.test', chr(11) . 'To: extra@client.test', "\\r\\nBcc: bcc2@client.test"`;
  const ordinary = await envelope(`$sent = wp_mail('owner@client.test', 'Hello', 'Body', [${hidden}, 'X-Keep: 1']);`);
  expect(ordinary).toMatchObject({ sent: "stopped before transport", failed: [] });
  expect(ordinary.envelope).toMatchObject({
    to: ["owner@client.test"],
    cc: ["cc@client.test", "cc2@client.test"],
    bcc: ["bcc@client.test", "bcc2@client.test"],
    subject: "Hello",
  });

  const legit = `'From: Site <wordpress@site.test>', 'Reply-To: visitor@example.test', 'X-Keep: 1'`;
  const expected = {
    sent: "stopped before transport",
    failed: [],
    envelope: {
      to: [REDIRECT],
      cc: [],
      bcc: [],
      from: "wordpress@site.test",
      replyTo: ["visitor@example.test"],
      subject: "[pirax-test abc123] Hello",
      headers: ["X-Keep", "X-Pirax-Form-Test"],
    },
  };
  const array = await envelope(`\\Pirax\\FormTest\\mark('abc123'); $sent = wp_mail(['owner@client.test'], 'Hello', 'Body', [${hidden}, ${legit}]);`);
  expect(array).toMatchObject(expected);
  const string = await envelope(`\\Pirax\\FormTest\\mark('abc123'); $sent = wp_mail('owner@client.test', 'Hello', 'Body', implode("\\r\\n", [${hidden}, ${legit}]));`);
  expect(string).toMatchObject(expected);
  // The production guard is still the earliest pre_wp_mail filter in every case.
  for (const r of [ordinary, array, string]) expect(r.guard).toBe(true);

  // Correlation header and subject prefix stay single; a later filter adding a hidden Bcc is refused.
  const again = await h.php<{ idempotent: boolean; tags: number }>(`
    \\Pirax\\FormTest\\mark('abc123');
    $once = apply_filters('wp_mail', ['to' => 'o@client.test', 'subject' => 'S', 'message' => 'M', 'headers' => [chr(11) . 'X-Pirax-Form-Test: evil', chr(0) . 'Cc: c@client.test', 'X-Keep: 1'], 'attachments' => []]);
    $twice = apply_filters('wp_mail', $once);
    return ['idempotent' => $once === $twice, 'tags' => count(preg_grep('/x-pirax-form-test\\s*:/i', $twice['headers'])), 'headers' => $twice['headers']];
  `);
  expect(again).toEqual({ idempotent: true, tags: 1, headers: ["X-Keep: 1", "X-Pirax-Form-Test: abc123"] } as any);
  const late = await envelope(`
    add_filter('wp_mail', fn($a) => array_merge($a, ['headers' => array_merge((array) $a['headers'], [chr(11) . 'Bcc: late@client.test'])]), PHP_INT_MAX);
    \\Pirax\\FormTest\\mark('abc123'); $sent = wp_mail('owner@client.test', 'Hello', 'Body');`);
  expect(late).toMatchObject({ sent: false, failed: ["pirax_form_test_mail"], envelope: null });
}, 120_000);

test("hourly sweep deletes old FF test entries whose marker field was later renamed or removed; controls stay", async () => {
  const items = [
    { label: "malformedOld", age: 7200, raw: `{"message":"${marker}` },
    { label: "renamedOld", age: 7200, response: { message: `Pirax check ${marker}` }, job: "pending" },
    { label: "removedOld", age: 7200, response: { email: `Pirax check ${marker}` } },
    { label: "nestedRenamedOld", age: 7200, response: { message: ["x", { deep: marker }] } },
    { label: "activeRenamedOld", age: 7200, response: { message: marker }, job: "active" },
    { label: "renamedYoung", age: 1800, response: { message: marker } },
    { label: "ordinaryOld", age: 7200, response: { message: "ordinary" }, job: "pending" },
    { label: "metadataOnlyOld", age: 7200, response: { message: "ordinary", _wp_http_referer: `/?m=${marker}`, __fluent_form_embded_post_id: marker }, source: `https://site.test/?m=${marker}` },
    { label: "keyOnlyOld", age: 7200, response: { [marker]: "ordinary" } },
  ];
  const ids = await h.php<Record<string, number>>(`
    global $wpdb; $p = $wpdb->prefix; $ids = []; $form = ${h.fixtures.ff};
    foreach (${lit(items)} as $item) {
      $local = wp_date('Y-m-d H:i:s', time() - $item['age']);
      $wpdb->insert("{$p}fluentform_submissions", ['form_id' => $form, 'serial_number' => 1, 'response' => $item['raw'] ?? wp_json_encode($item['response']), 'source_url' => $item['source'] ?? '', 'user_id' => 0, 'status' => 'unread', 'is_favourite' => 0, 'created_at' => $local, 'updated_at' => $local]);
      $id = (int) $wpdb->insert_id;
      $wpdb->insert("{$p}fluentform_submission_meta", ['response_id' => $id, 'form_id' => $form, 'meta_key' => '_entry_uid_hash', 'value' => md5((string) $id), 'created_at' => $local, 'updated_at' => $local]);
      if (!empty($item['job'])) {
        $updated = $item['job'] === 'active' ? current_time('mysql') : $local;
        $queue = wpFluentForm('fluentFormAsyncRequest')->queue(['action' => 'fluentform/integration_notify_notifications', 'form_id' => $form, 'origin_id' => $id, 'feed_id' => 0, 'type' => 'submission_action', 'status' => $item['job'] === 'pending' ? 'pending' : 'processing', 'data' => maybe_serialize([]), 'created_at' => $local, 'updated_at' => $updated]);
        if ($item['job'] === 'pending') as_enqueue_async_action('fluentform/schedule_feed', ['queueId' => $queue], 'fluentform');
      }
      $ids[$item['label']] = $id;
    }
    return $ids;
  `);

  // The operator renames the marker's field and removes another one after the entries were stored.
  const schema = await h.php<{ renamed: number; inputs: string[] }>(`
    global $wpdb; $table = $wpdb->prefix . 'fluentform_forms'; $form = ${h.fixtures.ff};
    $fields = json_decode($wpdb->get_var($wpdb->prepare("SELECT form_fields FROM $table WHERE id = %d", $form)), true);
    $fields['fields'] = array_values(array_filter($fields['fields'], fn($f) => ($f['attributes']['name'] ?? '') !== 'email'));
    $renamed = 0;
    array_walk_recursive($fields, function (&$v, $k) use (&$renamed) { if ($k === 'name' && $v === 'message') { $v = 'renamed_message'; ++$renamed; } });
    $wpdb->update($table, ['form_fields' => wp_json_encode($fields)], ['id' => $form]);
    return ['renamed' => $renamed, 'inputs' => array_keys(\\FluentForm\\App\\Modules\\Form\\FormFieldsParser::getInputs(wpFluent()->table('fluentform_forms')->find($form)))];
  `);
  expect(schema.renamed).toBe(1);
  expect(schema.inputs).toContain("renamed_message");
  expect(schema.inputs).not.toContain("message");
  expect(schema.inputs).not.toContain("email");

  const state = () =>
    h.php<{ rows: Record<string, boolean>; meta: number; jobs: Record<string, string[]>; asPending: number }>(`
      global $wpdb; $p = $wpdb->prefix; $ids = ${lit(ids)}; $rows = []; $jobs = [];
      foreach ($ids as $label => $id) {
        $rows[$label] = (bool) $wpdb->get_var($wpdb->prepare("SELECT COUNT(*) FROM {$p}fluentform_submissions WHERE id = %d", $id));
        $jobs[$label] = $wpdb->get_col($wpdb->prepare("SELECT status FROM {$p}ff_scheduled_actions WHERE origin_id = %d", $id));
      }
      $in = implode(',', array_map('intval', $ids));
      return ['rows' => $rows, 'meta' => (int) $wpdb->get_var("SELECT COUNT(*) FROM {$p}fluentform_submission_meta WHERE response_id IN ($in)"),
        'jobs' => array_filter($jobs), 'asPending' => count(as_get_scheduled_actions(['hook' => 'fluentform/schedule_feed', 'status' => 'pending', 'group' => 'fluentform', 'per_page' => -1], 'ids'))];
    `);
  const before = await state();
  await h.runCron(["pirax_form_test_sweep"]);
  const after = await state();
  const kept = Object.entries(after.rows).filter(([, v]) => v).map(([k]) => k).sort();
  expect(kept).toEqual(["activeRenamedOld", "keyOnlyOld", "malformedOld", "metadataOnlyOld", "ordinaryOld", "renamedYoung"]);
  expect(after.meta).toBe(kept.length); // native deletion removed the deleted entries' meta rows
  expect(after.jobs).toEqual({ activeRenamedOld: ["processing"], ordinaryOld: ["pending"] });
  expect(after.asPending).toBe(before.asPending - 1);

  await h.runCron(["pirax_form_test_sweep"]);
  expect((await state()).rows).toEqual(after.rows);
  await h.saveEvidence();
  expect(await findSecret(h.artifactDir, [h.token])).toEqual([]);
}, 300_000);
