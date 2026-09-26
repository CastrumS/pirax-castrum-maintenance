## 1. Goal

Repair one concrete FF asynchronous cleanup race in the final code (D4/D7/D9, AC2/AC3/AC5). One small lifecycle-safety unit: carry submission-time marker ID in the queued notification payload so native cleanup cannot erase classification between worker entry-load and the mail callback. B runs the full suite afterward.

## 2. Numbered acceptance criteria

1. Fail-first native regression: submit a marked FF form with email queueing on, then during the native runner's notification action **after it has loaded entry/form data but before our priority-9 context setup**, delete that entry and its metadata via the native deletion API. The logged mail must still be redirected/tagged, not sent to original recipients. This deterministically reproduces the cleanup race without threads or mocked form processing.
2. The same protection holds if the configured token changed after enqueueing (classification must not re-parse against mutable credentials). Ordinary queued jobs remain ordinary and cannot acquire a marker from user-supplied fields/feed settings or a previous job.
3. Fix persists only the already-validated test ID in the native queued email feed payload; no raw secret/new custom table. The early mail scope can use that trusted submission-time payload after DB deletion, with legacy metadata fallback where appropriate. New marked jobs and synchronous notifications still behave normally. Do not reinterpret ordinary saved field content on every runner invocation.
4. Update any affected plugin/test docs and remove any false statement that loaded entry data alone guarantees redirection after marker metadata is deleted. Also correct the packaged README's claim that FF reCAPTCHA v3 is not bypassed: the native `recaptcha` hook applies to v2/v3, while only v2 was tested; hCaptcha/Turnstile remain unchanged. Targeted real test green, redacted evidence retained; existing marker/options/mail literals unchanged.

## 3. Read-first list

- Authoritative `/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/open/site-checks/form-helper-plugin/plan.md` D4/D7/D9 and implementation notes.
- Same leaf `implementation/worker-3.md` (submission meta rationale), `worker-4.md` (native async runner/exception handling), `worker-5.md` (final docs/evidence).
- `/home/rudi/.pi/agent/skills/implement-issue/ponytail.md`.
- `plugin/pirax-form-test/includes/fluent-forms.php`, `cleanup.php`, and `test/plugin/safety.test.ts`, `mu-plugin.php`, `harness.ts`.
- `/tmp/pirax-fluentform-plan/fluentform/app/Hooks/Handlers/GlobalNotificationHandler.php`: integration_feed_before_parse modifies the feed before serialize/enqueue.
- `/tmp/pirax-fluentform-plan/fluentform/app/Services/WPAsync/FluentFormAsyncRequest.php`: reads the entry into memory then invokes integration_notify_notifications.

## 4. Change list and needed interfaces

Own a minimal fix to `includes/fluent-forms.php`, a focused regression in `test/plugin/safety.test.ts`, option-driven test-only race fixture in `mu-plugin.php`, and affected `plugin/pirax-form-test/README.md` / `test/plugin/README.md` if necessary. No new dependencies or files needed.

Current code: ff_submitted saves only submission meta FF_META; ff_before_notification obtains id only by re-querying meta with ff_test_id(entry.id). FF's expire/delete removes that metadata. A worker can already have loaded entry/form/response before deletion; its subsequent meta read returns null and current code sends original recipients. A private ID in serialized queued notification feed survives this interleaving. Use the native integration_feed_before_parse hook (verified in source) or an equivalent small native interface to stamp a reserved payload key only for genuinely marked submissions. Remove/ignore preexisting untrusted copies for ordinary submissions, and validate ID grammar on use. No raw token in payload.

The test-only deletion callback should register only in the runner request (set option after submitting), at priority 8 on the real notification hook, so it doesn't cause submit-time compatibility rejection. It represents a concurrent native cleanup after entry load. Let the real sender and Action Scheduler execute; do not directly call plugin mail helpers as acceptance evidence. Existing h.browser, h.runCron/drainQueues, h.mail/feeds and h.saveEvidence provide the harness.

## 5. Do-not, reasons and exceptions

- No full suite/commits/lifecycle commands or worktree issues/ edits. B owns final checks and handoff.
- Never open/print/write `.env`/`.env.*`; load via Bun --env-file registered root and print results only. No live sites/vendor changes.
- No auth/native sender mocks, re-parsing mutable token as the primary queued identity, changing public contract, or broad queue refactor. The fix must preserve ordinary jobs and be narrowly testable.
- Return mismatch with actual native source/test evidence and smallest correction rather than change scope; only B's revised brief authorizes an exception.

Reasons are privacy, native evidence, stable queued identity and limited scope; no exception permits secret exposure, mocks or weakened safety.

## 6. Ordered steps

1. Add regression demonstrating metadata deletion between native entry-load and context setup; capture unredirected-mail red.
2. Persist/consume validated submission-time ID on the native feed payload; include ordinary job control and rotation case, restore tests green.
3. Update stale docs/comments, run targeted test and return report. Do not repeat unrelated successful suites; B will run the full suite.

Advisory ~4 files under 25 turns. Report unexpected scope clearly.

## 7. Commands

`AKROGON_BASE=93cf3b7f6b99f3a34be7f69c004345c439fa6a76 bun --env-file=/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/.env test test/plugin/safety.test.ts --timeout 180000 -t 'cleanup race|retained evidence'`

Build ZIP as needed; no full suite.

## 8. Done-when, evidence and report

Write `/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/open/site-checks/form-helper-plugin/implementation/worker-6.md` with red/green, native evidence paths and any unverified cases. Code only current leaf worktree.

Changed files and reasons: <paths and why>
Tests run: <commands and results>
Known limitations: <limitations or none known>
Unverified criteria: <criterion and why, or none>
