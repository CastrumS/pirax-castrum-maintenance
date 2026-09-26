# Worker 3 report: GF/FF adapters, compatibility preflight, native cleanup and sweep

Scope: brief-3 only. All code is in `/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/worktrees/form-helper-plugin`.

- I made no commits, ran no lifecycle commands and did not run the full suite.
- I did not touch `issues/` in the worktree.
- I did not open, print or edit any `.env` or `.env.*` file. Credentials were loaded only through `bun --env-file=/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/.env`.
- The only credential check printed per-directory hit counts, and they were zero.
- No licensed GF code was vendored. GF 3.1.2 and FF 6.2.14 sources were read from the temporary extraction paths named in the plan.

## Result

`test/plugin/adapters.test.ts` has 16 tests. They run against real WordPress 7.1.2 / PHP 8.3 in Playground, with licensed Gravity Forms 3.1.2 and Fluent Forms 6.2.14. The generated ZIP is uploaded and activated through wp-admin.

- **Forms:** submitted in headless Chromium through the rendered forms.
- **Queues:** run in separate native requests:
  - the Action Scheduler runner;
  - GF's background processors;
  - FF's legacy `fluentform_background_process` endpoint;
  - real `wp-cron.php` requests.
- **Nothing mocked:** no auth, form processing or validation, apart from the planned siteverify answer.

Final results are in [Tests run](#tests-run).

## Changed files and reasons

**Production** (all four are loaded by the existing bootstrap and tolerate GF/FF being absent):

- `plugin/pirax-form-test/includes/compatibility.php` (new): the audited callback inventory and preflight (D8).
  - An exact per-hook allowlist of callback identities: declaring `Class::method`, function name, or `closure:<file>`. Nothing is approved by plugin-directory prefix.
  - The plugin's own `Pirax\FormTest\` callbacks are allowed.
  - Version gate: GF `3.1.x` and FF `6.2.x` only.
  - Also rejected:
    - GF forms with post fields, which would create a post;
    - FF forms with `has_payment`;
    - FF forms whose type is not `form`.
- `plugin/pirax-form-test/includes/gravity-forms.php` (new): the GF adapter (D6).
  - Detection runs on `gform_pre_validation` at `PHP_INT_MIN`. It reads posted `input_<field>[_<sub>]` values of the form's own fields and unslashes them once.
  - `gform_field_validation` only overrides the result for `captcha` fields, and only for supported marked submissions.
  - `gform_validation` rejects the submission (`is_valid=false`, other errors kept). The literal message is appended through `gform_validation_message_<form>`.
  - Feeds are emptied at `PHP_INT_MAX` on the generic filter plus the form-specific, add-on-specific and add-on+form-specific `pre_process_feeds` filters.
  - `gform_is_asynchronous_notifications_enabled` and its `_<form>` variant return false only while the request is marked.
  - `GFAPI::delete_entry` runs at `PHP_INT_MAX` on `gform_after_submission`.
- `plugin/pirax-form-test/includes/fluent-forms.php` (new): the FF adapter (D7).
  - Detection on `fluentform/before_form_validation`, using FF's parsed data limited to the form's own inputs.
  - `disable_captcha` returns true only for `recaptcha`; `validation_errors` carries the rejection.
  - `global_notification_active_types` at `PHP_INT_MAX` keeps only `notifications`.
  - At `fluentform/before_form_actions_processing` (after insert, before any dispatch), a marked supported entry gets FF submission meta `_pirax_form_test = <id>`, which holds the id only, never the token.
  - A before/after wrapper (priorities 9 and 11) around FF's priority-10 email sender. For each job it:
    - pushes the context from that entry's stored test id and pops it afterwards;
    - for marked queued jobs, reports `success` or `failed` through FF's native `fluentform/integration_action_result`;
    - schedules a cleanup check.
  - Cleanup is deferred to `shutdown`. It deletes with `SubmissionService::deleteEntries()` only when the entry carries the meta and no job is `pending`, `processing` or `failed` with `retry_count < 4`.
- `plugin/pirax-form-test/includes/cleanup.php` (new): the hourly sweep on `SWEEP_HOOK` (D9).
  - Candidates are found with an escaped `LIKE` and a stable id cursor, in batches of 50.
  - The token is split on characters JSON may escape, such as `/`, so the `LIKE` is a superset.
  - The decoded field values decide: GF numeric field keys, FF values of the form's own inputs. Metadata and source URLs never count.
  - Times: GF entries are compared in UTC, FF in site-local time (`wp_date`).
  - Deletion uses `GFAPI::delete_entry`, or for FF: `as_unschedule_all_actions` for pending jobs, then `deleteEntries`.
  - An FF entry is skipped while any of its jobs is `processing` and was touched within the hour. The check is repeated just before deletion.

**Build/tests:**

- `scripts/build-plugin.ts` and `test/plugin/core.test.ts`: the four files were added to both strict archive allowlists.
- `test/plugin/adapters.test.ts` (new): the suite, derived from criteria 1–5 before any adapter code existed.
- `test/plugin/fixtures.php`: two new native fixture sets.
  - CAPTCHA: a GF form with a reCAPTCHA v2 field (keys set, `checkbox` type, honeypot enabled with `abort`) and an FF form with a `recaptcha` element (`_fluentform_reCaptcha_details`, v2), on one page.
  - Unsupported: a GF form with a post field and an FF clone with `has_payment=1`, on another page.
- `test/plugin/mu-plugin.php` (test-only; every addition is option-driven and off by default):
  - `pirax_harness_ff_async_email`: FF's own email queueing, a later filter over FF's priority-9 `__return_false`.
  - `pirax_harness_fail_mail`: the next *n* matching final mails fail like a transport (`false` plus `wp_mail_failed`).
  - `pirax_harness_direct_dispatch`: direct `gform_after_submission` / `fluentform/submission_inserted` side effects, logged as `gf-direct` / `ff-direct`.
  - `pirax_harness_gf_async_feeds`: GF's `gform_is_feed_asynchronous`.
  - `pirax_harness_competing_filters`: a later add-on-specific GF filter that re-adds the ledger feeds, and form-specific `_<form>` filters that re-enable background notifications.
  - Always on: `action_scheduler_allow_async_request_runner` → false and AS sleep → 0, so Action Scheduler's loopback runner never races harness-driven queues.
- `test/plugin/harness.ts`: minimal changes for native async driving.
  - `runCron(hooks)` makes the named events due, moves other due events an hour later and runs a real `wp-cron.php` request. It fails if a named event did not run.
  - `drainQueues` counts only `pending` FF rows. FF 6.2.14 leaves every *sent* queued email job `processing`, because its email action reports no result; the previous count could never drain.
  - `queues()` includes each feed add-on's GF 3.x processor (`wp_gf_<slug>_feed_processor`).
  - Fixtures pass through, and `FeedRecord` gains the `-direct` plugins.

## Hook compatibility rationale (the audited inventory)

Callbacks registered on the audited hooks in the harness site with GF 3.1.2 + FF 6.2.14. They were discovered at runtime first, then checked against the source:

| Hook | Allowed callback | Why it is safe |
|---|---|---|
| `gform_validation` | `GF_Honeypot_Handler::cache_invalid_state_counts` | honeypot bookkeeping |
| `gform_abort_submission_with_confirmation` | `GF_Honeypot_Handler::handle_abort_submission` | honeypot abort still applies (tested) |
| `gform_entry_is_spam` | `GF_Honeypot_Handler::handle_entry_is_spam` | spam marking |
| `gform_after_submission` | `GF_Honeypot_Handler::handle_after_submission` | honeypot note |
| `gform_entry_post_save` | `GFFeedAddOn::maybe_process_feed` (declaring class) | GF feed framework; its feeds are emptied by `pre_process_feeds`. A payment add-on's own `GFPaymentAddOn` methods are not allowed. |
| `fluentform/before_insert_submission` | `closure:fluentform/app/Hooks/actions.php` | FF honeypot and token spam check (tested) |
| `fluentform/submission_inserted` | `closure:fluentform/app/Hooks/actions.php` | FF `globalNotify` feed dispatch, narrowed to the email feed |
| `fluentform/global_notify_completed` | `closure:fluentform/app/Hooks/actions.php` | password truncation |
| `fluentform/integration_notify_notifications` | `EmailNotificationActions::notify` | FF email sender; mail is redirected |
| `fluentform/notify_on_form_submit` | `EmailNotificationActions::notifyOnSubmitPaymentForm` | payment-form emails (payment forms are blocked anyway) |

Other audited hooks allow nothing but this plugin:

- **GF**, each plus its form-specific `_<id>` variant: `gform_pre_submission`, `_filter`, `gform_entry_id_pre_save_lead`, `gform_entry_created`, `gform_pre_handle_confirmation`, `gform_post_submission`, `gform_after_email`, `gform_delete_entry`.
- **FF**, including the deprecated underscore aliases: `before_insert_payment_form`, `before_form_actions_processing`, `submission_inserted_form_form`, `before_submission_confirmation`, `before_deleting_entries`, `after_deleting_submissions`.

Anything else makes a marked submission fail preflight with `Pirax test blocked: integrations could not be suppressed`. Ordinary submissions are never audited or changed.

**For the documentation worker:** the audit covers **GF 3.1.x / FF 6.2.x (free) only**. Any other plugin hooked on these hooks blocks marked submissions on that site, as does any other version. Examples: FF Pro, GF payment add-ons, or any add-on hooking `gform_after_submission`.

## Native queue states (from `queue-states.jsonl`)

Taken from the final run of `adapters-2026-09-25T14-59-26-211Z` (ids are per run):

- **GF marked, right after the submit request:** `wp_gf_notifications_processor`, `wp_gf_feed_processor` and `wp_gf_pirax-harness-ledger_feed_processor` are all `false`, even with background feeds and the competing filters on. Both mails were logged in the page request, not `admin-ajax`, with `gform_enable_async_notifications` still true.
  - The snapshot also shows one due Action Scheduler action. GF's notification and feed processors are all inactive, and I did not identify that action.
- **FF queued, after the marked (7) and ordinary (8) submissions:**
  - entry 7: two `integration_notify_notifications` rows, `pending`, with no ledger row;
  - entry 8: two email rows plus one `integration_notify_pirax_ledger_feeds` row, all `pending`;
  - 5 Action Scheduler actions pending.
- **After one AS runner request:**
  - entry 7: A `success`/1, B `failed`/1 (the mail was redirected, and B's failed attempt is logged);
  - entry 8: emails `processing` (FF's native terminal state), ledger `success`.
  - All four mails came from the same request, and 0 Action Scheduler actions remain pending.
- **After the WP-Cron retry request** (`fluentform_do_scheduled_tasks`): B was delivered to the redirect from `wp-cron.php`. Entry 7 and all its rows and meta are gone; entry 8 is kept.
- **Job processing elsewhere:** after the runner, the rows are `success` and `processing`, and the entry is kept even though FF's `maybeFinished` found nothing pending. After FF's cron retry it is deleted.
- **Legacy batch:** before, all rows `pending` for 1 marked and 2 ordinary entries. After one request, the marked entry's rows were removed with the entry. Ordinary rows: emails `processing`, ledger `success`.
- **Sweep:**
  - before: `ffMarkedOld` pending, `ffOrdinaryOld` pending, `ffActiveOld` processing (touched now), `ffStaleOld` processing (touched 2h ago);
  - after: only the ordinary pending row and the active processing row remain, and AS pending went from 2 to 1;
  - kept: `gfMarkedYoung`, `gfOrdinaryOld`, `gfSourceOnlyOld`, `ffMarkedYoung`, `ffOrdinaryOld`, `ffActiveOld`.

## Tests run

**Red** (brief step 1: suite written, only core plugin files present):

```
$ AKROGON_BASE=93cf3b7f6b99f3a34be7f69c004345c439fa6a76 bun --env-file=/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/.env test test/plugin/adapters.test.ts --timeout 180000
(fail) GF marked browser submission … — subjects "gf-1 notification A/B" (no [pirax-test abc123] prefix)
(fail) FF marked browser submission … — "ff-3 notification A/B" unredirected
(fail) FF controls … — knock-on: the unsuppressed marked entry's ledger ran in this test's drain
(fail) GF reCAPTCHA v2 … — marked.ok false (reCAPTCHA invalid)
(fail) FF reCAPTCHA … — marked rejected
(fail) integration outside suppressible paths … / payment and post-creation … / malformed markers … — marked submissions accepted (ok true)
(fail) FF queued email … — marked entry also queued integration_notify_pirax_ledger_feeds
(fail) FF job processing elsewhere … — statuses ["processing","processing","success"]; entry kept only by accident
(fail) FF legacy batch … — 0 redirected mails
(fail) hourly sweep … — every old token entry (incl. 240 bulk) kept
(fail) sweep wildcards/boundary … — literal-token entries kept
 2 pass
 13 fail
Ran 15 tests across 1 file. [176.76s]
```

Red also confirmed two things:

- `runCron` really runs the sweep hook: the hook ran, it was simply a no-op before the adapters existed.
- FF leaves an ordinary *sent* queued email `processing`.

**Intermediate failures, each fixed at its root cause:**

1. FF's client-side validation stopped the empty-email "other errors still apply" case in the browser.
   - For the two server-rule negatives only (empty email, filled honeypot), the test now posts the rendered form's own `FormData` to FF's `fluentform_submit` from the page. This is exactly what FF's script sends, minus its client checks.
2. **A real adapter bug.** The FF empty-token control entry, submitted while the token was empty and so ordinary, was deleted later.
   - Cause: its queued ledger job finished after the token was restored. Cleanup re-parsed the stored response with the *current* token.
   - Fix: the marked state is stored at submission as FF submission meta (the test id, never the token), and both job context and cleanup use it.
   - This also closes a leak: clearing or rotating the token while marked jobs are queued would have sent them to clients.
   - New regression test: rotated token → still redirected and deleted; cleared token → mail fails closed, jobs `failed`/1, entry kept; after reconfiguring, FF's retry delivers to the redirect and the entry is deleted.
3. Races with Action Scheduler's own loopback runner:
   - it split the legacy batch across requests;
   - it claimed the seeded `ffMarkedOld` job just before the sweep, so the sweep correctly treated it as active.
   - Fixed by the test-only AS dispatch filters described above. Tests are otherwise unchanged.
4. GF 3.x runs async add-on feeds in a per-add-on processor. `queues()` now tracks it, so `drainQueues` waits for it.

**Mutation check.** I removed the GF form-specific and add-on-specific overrides and ran the GF marked test (`-t "GF marked browser"`):

```
- [ "[pirax-test abc123] gf-1 ", "[pirax-test abc123] gf-1 " ]
+ []
(fail) GF marked browser submission … 0 pass 1 fail
```

The form-specific background-notification filter re-queued the marked mail: the entry-deletion hazard D6 describes. The code was restored (diff-checked) and the ZIP rebuilt.

**Green** (the brief's exact command, final code):

```
$ AKROGON_BASE=93cf3b7f6b99f3a34be7f69c004345c439fa6a76 bun --env-file=/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/.env test test/plugin/core.test.ts test/plugin/adapters.test.ts --timeout 180000
bun test v1.4.2 (744846f84)
 25 pass
 0 fail
 504 expect() calls
Ran 25 tests across 2 files. [405.53s]
```

That is core 9/9 (unchanged behaviour, with the four new files in the strict ZIP allowlist) plus adapters 16/16. Two earlier full green runs of the same command, before the GF background-feed additions, gave 25 pass / 0 fail each (501 expects).

Harness smoke (`test/plugin/harness.test.ts`), rerun because `harness.ts`, `fixtures.php` and `mu-plugin.php` changed:

```
bun test v1.4.2 (744846f84)
 4 pass
 0 fail
 42 expect() calls
Ran 4 tests across 1 file. [48.46s]
```

What the adapter suite asserts, by brief criterion:

1. **Marked delivery and controls (AC2/AC3).**
   - A marked submission `<token>-abc123` in the browser, for both GF and FF:
     - both notifications go only to `form-tests+pirax@operator.test`, with no Cc/Bcc headers;
     - the subject has the prefix exactly once, and there is exactly one `X-Pirax-Form-Test: abc123`;
     - no ledger feed runs or is queued;
     - the entry and its related rows are gone, with no orphaned GF meta/notes or FF meta/details/logs/jobs.
   - GF specifics:
     - the global async option stays on;
     - no GF processor is active;
     - mail is sent inside the page request;
     - this holds even with competing later filters and GF background feeds enabled.
   - FF: the entry is gone after the ajax request's shutdown.
   - Controls (unmarked, wrong token, empty configured token) keep original recipients, Cc/Bcc and entries, and run their feeds. For GF this includes the background feed processor, with a positive feed-count control.
2. **CAPTCHA (AC4).**
   - GF reCAPTCHA v2 and FF reCAPTCHA both receive a dummy response and a harness `siteverify` `success:false`:
     - unmarked fails ("The reCAPTCHA was invalid" / "reCaptcha verification failed");
     - marked succeeds;
     - GF's server verification still ran (siteverify count +1).
   - Marked with a missing required field stays invalid.
   - Marked with a filled honeypot stays blocked: GF aborts (no entry/mail); FF returns 422 "Sorry! You can not submit…".
3. **Queued FF email (AC5)**, covered by the four FF queue tests: marked A succeeds, marked B fails then is retried from `wp-cron.php`, the ordinary jobs in the same runner request keep their recipients, a job processing elsewhere blocks FF's pending-only completion signal, the legacy batch path works, and token rotation/clearing is handled.
4. **Fail closed (AC6).**
   - The direct-dispatch fixture (a GF and an FF submission action) blocks marked submissions with the literal message, shown in the page: no entry, mail, feed, direct call or AS job. The same ordinary submissions run the direct integration.
   - GF post-field and FF payment forms are blocked (no post created).
   - `…-ABC123`, two different ids, and a bare token → `Pirax test blocked: invalid test marker`.
   - A redirect list → `Pirax test blocked: test configuration is invalid`.
   - Nothing is mailed in any of these cases.
5. **Sweep (AC7).**
   - Runs through a real `wp-cron.php` request in `Asia/Kathmandu` (+05:45).
   - GF and FF entries aged 3700 s are deleted, including a malformed bare-token entry and 120 + 120 bulk entries aged 7200 s (several pages of 50).
   - Kept: young entries (3500 s), ordinary entries, a token only in GF `source_url`, and an FF entry with a recently touched processing job.
   - The marked entry's pending job and AS action are removed. The stale-processing entry is deleted. The ordinary pending job is untouched.
   - A second run is a no-op, and the event is rescheduled.
   - With the legacy token `pirax%legacy_token-with_wild`, only literal matches are deleted; look-alikes that would match an unescaped `LIKE` are kept.
   - An empty token deletes nothing.
   - Boundary, in one aligned second: GF and FF at exactly 3600 s are kept, at 3601 s deleted.
6. **Evidence.** The saved artifacts contain no token.

## Retained artifacts

Latest green adapter run: `artifacts/plugin/adapters-2026-09-25T14-59-26-211Z/`. The matching core run and the harness smoke run are the latest `core-*` and `harness-smoke-*` directories beside it. It contains:

- `adapters-install.trace.zip` and `adapters-visitor.trace.zip` (scrubbed);
- `mail.jsonl`, `feeds.jsonl`, `entries.json`, `manifest.json` and `playground.log`;
- `queue-states.jsonl` (ids and statuses only).

The red baseline and each iteration's directories sit beside it. A Bun `findSecret` over all of `artifacts/plugin/` and `dist/` found 0 hits for both `FORM_TEST_TOKEN` and `GRAVITY_FORMS_ZIP`; only counts were printed.

`dist/pirax-form-test.zip` has 9 files (last build: sha256 `666412c1eb9ad17b6568da5bbe462bb06f8bc96cdbed40a670dc2ee824fb49b3`). The ZIP embeds timestamps, so its digest changes on every build; the manifest records the digests of both form plugin ZIPs.

## Deviations and mismatches for B

1. **FF queued-job marker comes from entry meta, not re-parsing.** The brief's interface says "queued stored response determines marker, not POST". I kept "not POST" and "stored with the entry", but store the parsed result at submission as FF submission meta holding the id only.
   - Reason: parsing with the current token deleted an ordinary entry (observed in run 2). It could also turn queued test mail into client mail after the token is cleared or rotated.
   - The meta is removed by FF's native deletion. The sweep still uses the token-content predicate from the plan.
   - Smallest reversal, if B rejects this: read `ff_test_id()` from the parse of the stored response instead. The regression test above would then fail for the cleared-token case.
2. **Marked FF queued jobs report their result through FF's native `fluentform/integration_action_result`.**
   - FF 6.2.14's email action reports nothing, so sent jobs stay `processing` forever and would be indistinguishable from in-flight jobs.
   - Ordinary jobs are never touched.
3. **Harness semantics changes.**
   - `drainQueues` counts pending FF rows only.
   - The test-only mu-plugin disables Action Scheduler's loopback dispatch.
   - `queues()` tracks GF 3.x per-add-on feed processors.
4. **GF CAPTCHA scope.** The override applies to GF's built-in `captcha` field of any `captchaType`: reCAPTCHA v2 checkbox or invisible, plus math/simple. It never applies to other fields. Only the v2 checkbox was exercised.
5. **Version gate.** Marked submissions are blocked on any GF other than 3.1.x or FF other than 6.2.x. This is conservative by design, but a plugin update forces a re-audit.

## Known limitations

- **Unaudited callbacks block whole sites.** Any additional callback on an audited hook (FF Pro, GF payment/user-registration add-ons, custom snippets) blocks marked submissions on every form of that site. Operators need a re-audit to support them.
- **After `pre_wp_mail`, and arbitrary PHP.** Code outside the audited hooks, or anything acting after `pre_wp_mail`, is out of reach (plan D8).
- **GF save-and-continue** (`gform_save`) skips validation, so a marker in a draft is not detected. Its `form_saved` notification goes to the address the visitor enters.
- **GF sweep does not cancel GF queued work.** Marked GF submissions never queue any: notifications are synchronous and feeds are emptied.
- **An exception inside FF's own email sender leaves the job's context pushed.** Action Scheduler continues with the next action in the same request, so later jobs in that runner request would be redirected rather than delivered. The failure direction is test mail, never a leak.
- **FF job still `processing` at crash.** It blocks immediate cleanup. The sweep deletes the entry once the job has been untouched for over an hour.
- **Race at sweep delete time.** A job claimed between the final check and the delete already loaded the entry, so its mail is still redirected.
- **Site-local FF times.** In a DST fall-back hour, the one-hour comparison is ambiguous by up to an hour.
- **Traffic-driven cleanup.** WP-Cron and FF retries only run when the site has traffic. Retries stop after FF's 4 attempts; the entry is then deleted as complete, and the checker reports missing delivery.
- **Token rotation.** The sweep cannot find entries containing only an old token; clear pending tests before rotating. Queued FF test jobs stay marked through their meta.
- **Syntax only checked on PHP 8.3.** No local `php` binary exists. PHP 7.4 compatibility is by construction: no arrow functions or 8.x syntax in plugin code.

## Unverified criteria

- **GF payment add-on rejection:** no licensed payment add-on is available. GF's unsupported paths were exercised with a post-field form and a direct `gform_after_submission` dispatcher. The payment path is covered only by the allowlist logic (`GFPaymentAddOn` methods are not allowed).
- **Other CAPTCHA and anti-spam variants:** GF invisible reCAPTCHA, math/simple CAPTCHA and the reCAPTCHA v3 add-on are untested. For FF, v3, hCaptcha and Turnstile are deliberately not bypassed and were not tested.
- **Plugin combinations and site types:** FF Pro, other GF add-ons, multisite, and GF/FF versions other than 3.1.2/6.2.14 were not tested.
- **Real mail delivery:** local `pre_wp_mail` logging only; there is no SMTP/IMAP (plan limitation).
