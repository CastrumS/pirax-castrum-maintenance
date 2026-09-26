# Worker 6 report: FF queued cleanup race

## Changed files and reasons

- `plugin/pirax-form-test/includes/fluent-forms.php`
  - New `ff_stamp_feed()` on FF's native `fluentform/integration_feed_before_parse` (PHP_INT_MAX, 4 args). FF runs this filter on each feed right before it serializes the feed into the `ff_scheduled_actions.data` row (GlobalNotificationHandler::globalNotify, lines 103/144). A synchronous feed is passed straight to the action.
    - The filter always unsets `_pirax_form_test` (the `FF_META` key).
    - It sets the key again only when all of these hold: `current_id()` is set, `ff_verdict($form) === 'supported'`, and the entry meta written by `ff_submitted` holds the same id (`ff_test_id($entry_id) === $id`).
    - Only the already-validated id is stored. The raw token is never stored, and there is no new table.
  - `ff_before_notification()` takes the id from `$feed['_pirax_form_test']` when it passes `id_is_valid`. Otherwise it uses the legacy entry-meta lookup `ff_test_id($entry->id)`, which covers jobs queued before this change. Ordinary field content and the token are never re-parsed in the runner.
  - Header docblock updated: the queued job carries the id, and deleting the entry or rotating the token cannot turn the mail into client mail.
- `test/plugin/mu-plugin.php`: new option-driven fixture `pirax_harness_ff_delete_on_notify = <entry id>`.
  - It is registered only when the option is set. The test sets it after submitting, so only the runner request has it.
  - It hooks `fluentform/integration_notify_notifications` at priority 8. That is after FF's runner has loaded the submission, form, response and entry, and before our priority-9 context setup.
  - It runs once and deletes the entry with FF's native `SubmissionService::deleteEntries()`. That removes the submission, its meta and its other queued rows.
- `test/plugin/safety.test.ts`: new test `FF queued cleanup race: ...` and helper `ffPayloads()`.
  - Setup: native email queue on, one marked and one ordinary browser submission.
  - Before the runner, the deletion fixture is armed and the token is rotated (`rotated-<token>`). Then one real Action Scheduler runner request runs (`h.drainQueues()`).
  - Asserts:
    - the deletion ran;
    - the marked entry is gone and the ordinary entry is still there;
    - the marked mail is exactly `[pirax-test abc123] ff-N notification A`, redirected with the header and no Cc/Bcc. The native deletion also removed marked job B, so it never runs;
    - both ordinary mails keep their original recipients and Cc, with no tag.
  - It also checks the queued payloads captured before the runner: both marked rows carry `abc123`, and none of the 3 ordinary rows (2 notifications and 1 ledger) has the key.
  - The token is restored in `finally`.
- `plugin/pirax-form-test/README.md`
  - Queued email: the id is stored in each queued job, a job stays redirected if its entry and meta are deleted after load, and there is a legacy meta fallback. This replaces the claim that each job runs "under that stored id", which implied the entry meta.
  - CAPTCHA: FF's single `recaptcha` check covers reCAPTCHA v2 and v3, so both are bypassed but only v2 was tested. hCaptcha and Turnstile are unchanged. Verified in FF source: `FormValidationService.php:595` applies `disable_captcha` with type `recaptcha` before calling `ReCaptcha::validate(..., $version)` for any `api_version`.
- `test/plugin/README.md`: the `safety.test.ts` row and the fixture list now mention the native-deletion race fixture.

Existing marker, option and mail literals are unchanged.

## Tests run

All runs used `AKROGON_BASE=93cf3b7f6b99f3a34be7f69c004345c439fa6a76 bun --env-file=<root>/.env test ...`.

1. **Red, behavioral.** `test/plugin/safety.test.ts -t 'cleanup race|retained evidence'`, before the fix: 1 fail, 1 pass. The marked job's mail was sent unredirected: subject `ff-3 notification A` where `[pirax-test abc123] ff-3 notification A` was expected. Evidence: `artifacts/plugin/safety-2026-09-25T15-37-55-300Z/`. In `queue-states.jsonl`, step "ff cleanup race: after runner", the subjects are three untagged mails. An earlier red run (`artifacts/plugin/safety-2026-09-25T15-37-00-664Z/`) failed first on the payload assertion, with no key in the marked rows. That assertion was then moved after the behavioral checks so the mail-level red would be recorded.
2. **Green, targeted.** Same command after the fix: 2 pass, 0 fail, 23 expect() calls. The run includes `retained evidence contains no token`. Evidence: `artifacts/plugin/safety-2026-09-25T15-40-16-611Z/`, where `queue-states.jsonl` subjects are `[pirax-test] ff-3 notification A`, `ff-3 notification A`, `ff-3 notification B`. The first green run, `safety-2026-09-25T15-39-17-245Z`, had correct behavior but failed only on my payload expectation: it omitted the ordinary ledger row. That expectation was fixed.
3. **Focused regression** of code paths that share `ff_before_notification`:
   - `test/plugin/adapters.test.ts -t 'FF marked browser|FF queued email|FF legacy batch'`: 5 pass, 0 fail (`artifacts/plugin/adapters-2026-09-25T15-41-32-335Z/`). This covers synchronous marked notifications, queued jobs across requests, a job still processing, token rotation/clearing, and the legacy batch runner.
   - `test/plugin/safety.test.ts -t 'FF queued|feed-type filter'`: 3 pass, 0 fail (`artifacts/plugin/safety-2026-09-25T15-43-49-222Z/`). This covers the throwing queued notification, the new race test, and the late feed-type filter.

The full suite was not run, as the brief requires; B owns it. The plugin ZIP was rebuilt by each suite's `beforeAll` (`bun run build:plugin`). `php -l` was not available locally, so the PHP was validated only by the Playground runs above.

## Known limitations

- `fluentform/integration_feed_before_parse` is not in the compatibility inventory. A third-party filter registered later at PHP_INT_MAX could strip the key. The job then falls back to the entry meta, which is the previous behavior, so this is no regression but the race window reopens for that site. Adding the hook to the audited inventory would reject marked submissions on sites with such filters. I left that out of scope; B can decide.
- Ordinary email rows stay `processing` after the runner, because FF's email action reports no result. This is native, pre-existing behavior and not changed here.
- Jobs queued before this change (no key) still depend on the entry meta and keep the old race window. Accepted as the legacy fallback.

## Unverified criteria

- AC2 "cannot acquire a marker from user-supplied fields/feed settings": covered by construction and the ordinary-payload assertion. The key is top-level in the feed array and FF puts form settings under `settings`. The filter always unsets the key and sets it only for a supported marked submission whose entry meta matches. No test stores a forged top-level key in an admin feed row. That would need direct DB forgery, which is outside the trust boundary.
- AC2 "previous job": covered because the ordinary jobs run after the marked job in the same runner request and keep their original recipients. FF unserializes the feed separately for each row.
