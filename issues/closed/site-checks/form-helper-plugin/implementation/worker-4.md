# Worker 4 report: safety hardening (FF late feed filter, exception context, CAPTCHA precedence, GF queue recovery, exact version gate)

Scope: brief-4 only. All code is in `/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/worktrees/form-helper-plugin`.

- No commits, lifecycle commands or full suite. Nothing under the worktree's `issues/` was touched.
- No `.env`/`.env.*` file was opened, printed or edited. Credentials came only from `bun --env-file=/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/.env`.
- No vendor sources were edited and no live sites were touched.
- No auth, form processors or queued-mail functions were mocked. The only native simulation is a test-only exception thrown from the mail observer for one marked message.

## Result

`test/plugin/safety.test.ts` (new, 6 tests) runs against real WordPress 7.1.2 / PHP 8.3 in Playground, with licensed GF 3.1.2 and FF 6.2.14. The ZIP is uploaded and activated through wp-admin.

- Forms are submitted in headless Chromium.
- Queues run through the native Action Scheduler runner, GF background processors, FF cron retry and real `wp-cron.php` requests.

All 5 regressions failed before the repairs and all 6 tests pass after them.

## Changed files and reasons

**Production**

- `plugin/pirax-form-test/includes/fluent-forms.php`
  - **Criterion 1: late feed filter.**
    - Cause: the filter was registered once at plugin load. Same-priority callbacks run in registration order (`WP_Hook` appends to `callbacks[PHP_INT_MAX]`), so a filter added later at `PHP_INT_MAX` ran after ours and could re-add a feed type.
    - Fix: for a marked, supported entry, `ff_submitted` (`fluentform/before_form_actions_processing`) now does `remove_filter` + `add_filter` on `ff_email_feed_only` right before dispatch. That moves it to the end of the `PHP_INT_MAX` slot, after every callback registered so far.
    - This is FF's last hook before `submission_inserted` → `globalNotify`, and the callbacks on `submission_inserted` are already audited.
    - Choice: I used "ensure email-only dispatch" rather than preflight rejection. Once our filter is last, a late filter is controllable, so adding the hook to the audit inventory would only have blocked extra sites without making anything safer.
    - Ordinary submissions are unchanged.
  - **Criterion 3: CAPTCHA precedence.**
    - Cause: FF's `validateSubmission()` runs `before_form_validation` → `preventMaliciousAttacks` → `validateRestrictions` (which always applies `fluentform/is_form_renderable` with the form) → nonce → CAPTCHA → field rules → `validation_errors`. The old rejection sat on `validation_errors`, after CAPTCHA could throw.
    - Fix: `ff_reject` moved to `fluentform/is_form_renderable` at `PHP_INT_MIN`. It throws FF's own `ValidationException(423, ['errors' => ['pirax_form_test' => [...]]])`, the same shape as before.
    - Non-marker and supported-marked submissions are untouched: their CAPTCHA and field errors are unchanged, and CAPTCHA is not bypassed globally.
    - The old `validation_errors` hook was removed as dead code.
  - **Criterion 2: exception context.**
    - Each job record now also keeps its `feed`, `entry` and `form`. `ff_after_notification` became `ff_finish_notification($threw)`.
    - New handler `ff_abandon_notifications` on Action Scheduler's native `action_scheduler_failed_execution`. This fires after `process_action()` catches the Throwable and before the runner moves to the next action.
    - The handler unwinds every job left open by that action: it pops the context, and reports marked queued jobs `failed` through FF's native `fluentform/integration_action_result`, so FF's cron retries them. It then schedules the cleanup check, which keeps the entry because a retryable job remains.
    - Legacy and synchronous paths stay safe without extra code:
      - the legacy `processActions` ajax endpoint and the WP-Cron retry (`fluentFormHandleScheduledTasks`, `boot/globals.php`) have no try/catch, so the exception ends that request;
      - a synchronous submission is marked for its whole request, and FF's `catch (\Exception)` around `submission_inserted` only stops its own feed loop.
- `plugin/pirax-form-test/includes/cleanup.php`, **criterion 4.**
  - Before `GFAPI::delete_entry`, `gf_unqueue($id)` walks GF's processors: notifications, feeds, and each `GFFeedAddOn`'s `gf_feed_processor($addon)`.
  - It uses only public processor APIs: `get_batches()`, then `update()` or `delete()` for batches containing the entry, and `is_processing()`.
  - A task belongs to the entry if its `entry_id` matches or if it carries an entry copy whose `entry.id` matches. The copy matters because `GF_Notifications_Processor::task()` sends from `$item['entry']` without re-reading the entry.
  - Other tasks are kept. A batch left empty is deleted. The whole queue is never cleared.
  - If a processor holding such a task `is_processing()`, the entry is left in place for a later sweep: a running worker rewrites its batch from memory (`handle()` → `update($batch->key, $batch->data)`).
  - A `ponytail:` comment names the remaining check-to-update race; GF has no compare-and-set batch API.
- `plugin/pirax-form-test/includes/compatibility.php`, **criterion 5.** `AUDITED_VERSIONS` is now exactly `3.1.2` / `6.2.14`, and `version_is_audited()` is a strict string equality. The other compatibility checks are unchanged.

**Tests** (test-only; the new options are off by default)

- `test/plugin/safety.test.ts` (new): regressions for criteria 1–5 and a token-absence check on the evidence.
  - It duplicates a few small helpers from `adapters.test.ts` (`ffSubmit`, `expectRedirected`/`expectOriginal`, `ffRows`). Importing that file would register its tests.
- `test/plugin/mu-plugin.php`:
  - `pirax_harness_fail_mail` accepts `'throw' => true`, which throws a `RuntimeException('Pirax harness mail exception')` from the `pre_wp_mail` observer after logging.
  - New `pirax_harness_late_feed_types`: on `init` (after every plugin has loaded), a closure on `fluentform/global_notification_active_types` at `PHP_INT_MAX` re-adds `pirax_ledger_feeds => pirax_ledger`.

No harness, fixture, build-script or ZIP-allowlist change was needed. The ZIP has the same 9 files.

## Tests run

**Red** (step 1, suite written before any production change; log `/tmp/pirax-safety-red.log`, artifacts `artifacts/plugin/safety-2026-09-25T15-15-16-056Z/`):

```
$ AKROGON_BASE=93cf3b7f6b99f3a34be7f69c004345c439fa6a76 bun --env-file=/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/.env test test/plugin/safety.test.ts --timeout 180000
(fail) FF: a later PHP_INT_MAX feed-type filter … — marked entry's ledger feed ran:
       + [{ "entry": 1, "feed": 13, "form": 3, "plugin": "ff", "request": "…action=as_async_request_queue_runner…" }]
(fail) FF queued: a marked notification that throws … — expectOriginal on the ordinary job's mail:
       Expected /^owner(-\d)?@client\.test$/  Received: "form-tests+pirax@operator.test"   (leaked context redirected ordinary mail)
(fail) FF unsupported marked form with reCAPTCHA … — Received: {"errors":{"g-recaptcha-response":["reCaptcha verification failed, please try again."]}}
(fail) GF sweep: … active worker defers — old entry deleted despite the notifications processor lock (Expected: true, Received: false)
(fail) compatibility gate accepts exactly GF 3.1.2 and FF 6.2.14 — "3.1.3", "3.1.20", "3.1", "3.1.2.1", "3.1.2-beta",
       "6.2.15", "6.2.1", "6.2", "6.2.14.1" all true; gf_supported() at GFForms::$version = '3.1.3' true
 1 pass
 5 fail
Ran 6 tests across 1 file. [75.77s]
```

**Green** (the brief's exact command, final code; log `/tmp/pirax-safety-green1.log`, artifacts `artifacts/plugin/safety-2026-09-25T15-17-42-737Z/`):

```
bun test v1.4.2 (744846f84)
 6 pass
 0 fail
 84 expect() calls
Ran 6 tests across 1 file. [121.90s]
```

**Targeted adapter regression**, not the full suite. It covers only the adapter tests whose paths I changed: FF rejection mechanics, the notification finish refactor, and the GF sweep. Log `/tmp/pirax-adapters-targeted.log`, artifacts `artifacts/plugin/adapters-2026-09-25T15-19-55-851Z/`.

```
$ AKROGON_BASE=… bun --env-file=…/.env test test/plugin/adapters.test.ts --timeout 180000 \
    -t "integration outside|payment and post|malformed or ambiguous|FF queued email: marked entry kept|legacy batch|hourly sweep|FF reCAPTCHA"
 7 pass
 9 filtered out
 0 fail
 170 expect() calls
Ran 7 tests across 1 file. [204.47s]
```

**Artifacts.** Each safety run directory holds `safety-install.trace.zip` and `safety-visitor.trace.zip` (scrubbed), plus `mail.jsonl`, `feeds.jsonl`, `entries.json`, `manifest.json`, `playground.log` and `queue-states.jsonl`.

**Secret check.** A Bun `findSecret` for `FORM_TEST_TOKEN` and `GRAVITY_FORMS_ZIP` found 0 hits in both safety runs, the targeted adapters run and `dist/`. Only counts were printed.

- `dist/pirax-form-test.zip` has 9 files, the same allowlist as before.
- Last build sha256: `f23fd1bc608329fd3030e0a2c5f3799277cd1770e0f823d34a402f86934a6311`. It embeds timestamps, so it changes on every build.

### What each test asserts (green evidence, `queue-states.jsonl`)

1. **Late feed-type filter.**
   - With `pirax_harness_late_feed_types` on, a marked browser submission sends 2 mails (A, B), both redirected. The ledger records nothing, no `ff_scheduled_actions` row is created, and the entry is deleted.
   - An ordinary submission with the same filter keeps its ledger feed (exactly one `ff` feed for that entry) and its original recipients.
2. **Throwing marked job.** Async FF email is on, and marked B throws once.
   - One Action Scheduler runner request runs marked A (redirected), marked B (throws), then the ordinary jobs, whose 2 mails keep the owner recipients and Cc. All of this happens in the same request, with marked mail first.
   - Exactly 1 AS action is `failed`. Rows are `marked A success/1, marked B failed/1`; the ordinary rows are `processing` (FF's terminal state) plus the ledger.
   - The marked entry is kept. FF's WP-Cron retry then delivers B to the redirect, the marked entry is deleted, and the ordinary entry stays.
3. **CAPTCHA precedence.**
   - Captcha form with `pirax_harness_direct_dispatch` (an unsupported integration) and siteverify false: the marked submission returns the literal blocked message with no `reCaptcha` text, and siteverify is not called. Mail, feeds and FF entries are unchanged.
   - The ordinary submission still gets `reCaptcha verification failed` (siteverify +1) and no entry.
4. **GF sweep.**
   - Seeded batches: `wp_gf_notifications_processor: [[old, snapshot:old, ordinary], [snapshot:old]]` and `wp_gf_pirax-harness-ledger_feed_processor: [[old, ordinary]]`. The old entry is 3700 s old and holds the marker; the ordinary entry is the same age.
   - With the notifications processor lock set, the sweep leaves the entry and every batch unchanged.
   - With the lock gone, the next real cron sweep leaves `[[ordinary]]` and `[[ordinary]]`: the snapshot-only batch is deleted, the old entry is gone and the ordinary entry is kept.
   - The real runners then send only `gf-1 notification A` to the owner, with no marker text, and run only the ordinary ledger feed. All queues end empty.
5. **Version gate.**
   - Installed versions are `3.1.2` / `6.2.14`. Only those exact strings are accepted.
   - `gf_supported` and `ff_supported` are true on the real site.
   - `gf_supported` is false after setting `GFForms::$version = '3.1.3'` inside that request.
6. **Evidence.** The retained safety artifacts contain no token.

## Criteria disposition

1. **Done**, via the email-only dispatch option: the filter moves to the end of the hook just before dispatch. Ordinary flow is unchanged (tested).
2. **Done.** The fail-first regression reproduced worker 3's leak (ordinary mail redirected). The fix restores context through AS's native failure hook, and the failed marked job is reported retryable and recovered by FF's cron.
3. **Done.** Unsafe marked submissions are rejected before CAPTCHA and insert with FF's native `ValidationException`. The non-marker CAPTCHA error is kept (tested).
4. **Done.** Entry-owned GF notification and feed tasks, entry copies included, are removed through `get_batches`/`update`/`delete` and `is_processing`. The entry is deferred while a worker runs. There is no whole-queue deletion, ordinary tasks are kept, and the real runners confirm no old test mail or feeds.
5. **Done.** The gate is exactly `3.1.2` / `6.2.14`. Unsafe future versions (a later patch included) are rejected; checked by a real-WP predicate test and by `gf_supported` at a bumped version.
6. **Done** for the targeted scope: red-then-green real WordPress runs, sanitized evidence (0 secret hits), and unchanged public interfaces (`FF_META`, parser/state, marker/options/mail literals, sweep hook).

## Deviations and notes for B

- The FF rejection now happens at `fluentform/is_form_renderable`, not `validation_errors`. An unsafe marked FF submission therefore reports only the Pirax message, not also its other field errors; it is rejected either way. The FF honeypot or token checks cannot run first for such a submission, which does not matter because it never inserts. The plugin README (docs worker) should describe the FF rejection as happening "before CAPTCHA".
- The adapter header comment in `fluent-forms.php` and the cleanup header in `cleanup.php` were updated to match. Worker 3's "An exception inside FF's own email sender leaves the job's context pushed" limitation and its "GF sweep does not cancel GF queued work" note are now resolved. The docs should say that GF queued work is cleaned, and that the entry is deferred while a GF worker is running.
- The version gate is stricter than worker 3's report and README notes (`3.1.x`/`6.2.x`). Docs must say exact `3.1.2`/`6.2.14`.

## Known limitations

- **Dynamic registration after the move.** A callback that registers a new `global_notification_active_types` filter after `before_form_actions_processing` (for example from the deprecated `fluentform_global_notification_active_types` hook or `fluentform/submission_form_data`) is arbitrary PHP outside the audited surface. This is the existing D8 limitation.
- **GF prune race.** A GF worker that starts between `is_processing()` and `update()` can write back a removed task from memory (`ponytail:` comment). When a worker is already running, the entry is deferred, not deleted.
- **GF sweep cost.** The sweep reads each processor's batches once per expired token entry, a few option queries per entry. Queues are normally empty or small.
- **Unwinding only covers Action Scheduler.** Other runners that catch exceptions and continue in the same request would not be covered. FF 6.2.14's own runners (AS, legacy ajax, WP-Cron retry) are covered as described above.

## Unverified criteria

- **Legacy batch and WP-Cron retry with a throwing notification** were not executed. That they end the request is established from source only (no try/catch in `processActions`/`handleBackgroundCall` or `fluentFormHandleScheduledTasks`).
- **A synchronous marked notification that throws** was not executed. The request stays marked, so there is no leak, but FF's catch stops the remaining sync feeds and the entry is still cleaned at shutdown; that behaviour comes from source only.
- **The GF prune race** (a worker starting mid-prune) is not reproducible deterministically and was not tested.
- **Full core/adapters/harness suites** were not run, per the brief (B owns them). Only the 7 adapter tests on changed paths were rerun.
