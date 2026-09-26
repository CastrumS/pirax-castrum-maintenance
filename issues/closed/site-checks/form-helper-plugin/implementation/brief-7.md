## 1. Goal

Repair review round 1 from head `2e2105c37b199065a311b16ffc5797799fc50253`: review A F1, review B F1/F2, plus A N1/N2. Preserve plan D5/D9/D10–D12 and AC1–AC8. One coherent review-repair unit; B owns the final full suite/commit/handoff.

## 2. Numbered acceptance criteria

1. **A F1:** Plain `bun test` works with credentials loaded, without an external timeout flag. Default Bun 5 s currently times out core mail tests (observed 6.6–10.3 s). Set an adequate repository default (e.g. root bunfig.toml `[test] timeout = 180000`) or equivalent; keep real assertions/readiness deadlines. Targeted core suite command below must pass without `--timeout`.
2. **B F1:** A real marked `wp_mail()` using headers `chr(11).'Cc: cc@client.test'` and `chr(0).'Bcc: bcc@client.test'` yields redirect-only To and empty native PHPMailer Cc/Bcc. Current regex leaves them; core WordPress trims names and adds actual recipients. Cover string and array headers, ordinary mail unchanged, correlation header idempotence and preservation of legitimate headers. Keep the production guard installed. Observe native `phpmailer_init` and stop before transport; do not claim `pre_wp_mail` argument observation alone proves this.
3. **B F2:** A two-hour-old FF response containing `<token>-abc123` in `message` is deleted by real hourly cron even after the form field name becomes `renamed_message` or the field is removed. Preserve ordinary/young entries, source/metadata-only exclusions, literal matching, queue protections and native deletion. Match historical stored values, not only fields currently defined on the form. Handle malformed JSON defensively. Remove ff_field_values if it becomes unused.
4. **A N1/N2:** Required packaged modules load unconditionally instead of optional is_readable fallthrough. Preserve the historical learning case, append a dated queued-payload follow-up and small durable evidence summary/tracked regression reference; no invented evidence or wholesale rewrite of the case.
5. Meaningful regressions derived before repairs, observed red→green; native real WordPress/Playwright with sanitized artifacts. Update affected docs/config descriptions without weakening claims. No full-suite run by worker.

## 3. Read-first list

- `/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/open/site-checks/form-helper-plugin/review-A.md` and `review-B.md` (all findings), plus `review-B-evidence.json`.
- Same leaf `plan.md` including new 2026-09-26 repair notes; `design.md`; `implementation/report.md`.
- `/home/rudi/.pi/agent/skills/implement-issue/ponytail.md`.
- `plugin/pirax-form-test/includes/{mail,cleanup,fluent-forms}.php`, bootstrap; existing `test/plugin/core.test.ts`, `adapters.test.ts`, `harness.ts`, `mu-plugin.php` as patterns.
- `.cache/review-B-probes.ts` is a retained executable reproducer for B's findings. It installs current ZIP through real wp-admin, observes PHPMailer envelope without sending and runs real cron.
- `plugin/pirax-form-test/README.md`, `test/plugin/README.md`, `learnings/history/2026-09-25-form-helper-plugin.md`; worker3 and worker6 reports for historical claims if needed. Do not use learnings/LESSONS.md as pass input.

## 4. Change list and needed interfaces

Own root `bunfig.toml` (new if chosen), a small `test/plugin/review-regressions.test.ts` (or focused existing-suite additions), fixes in `includes/mail.php`, `includes/cleanup.php`, deletion of unused helper in `includes/fluent-forms.php`, mandatory-loading simplification in bootstrap, and affected READMEs/history follow-up. Minimal test-only observation helpers allowed if needed. No new dependencies. Keep build's explicit file allowlist correct; bunfig/test files never go into ZIP.

Use actual existing h.startHarness/h.php/h.browser/h.uploadPlugin/h.runCron/h.saveEvidence/stop. F1 envelope probe removes only the harness PHP_INT_MAX `pre_wp_mail` observer, NOT the production PHP_INT_MIN guard; phpmailer_init captures getToAddresses/getCcAddresses/getBccAddresses then throws, caught around wp_mail locally so no transport sends. The old probe's initial uncaught-exception iteration is not the product red; its final result demonstrates the actual recipients.

WordPress normalizes header **names** with trim before interpreting Cc/Bcc. Make the filter agree with that parser or safely reject bad names; do not strip controls from unrelated body/attachments or globally disable ordinary mail. Preserve folded-line handling and idempotence.

For the sweep, stored `response` contains historical values; the current FormFieldsParser key intersection drops renamed/removed fields. Inspect native saved shape as needed and keep deliberate non-field/source metadata exclusions. A missing/currently changed form schema must not silently erase historical marker values from matching. Native deletion and queued-job safeguards remain unchanged.

The test timeout is implementation configuration, not relaxed safety. Existing explicit hook timeouts may remain. Test docs should truthfully describe configured default and plain command. History addendum should name immutable prior commit/regression and summarized observed states, not depend solely on future-removed worktree artifacts.

## 5. Do-not, reasons and exceptions

- No commit/lifecycle commands/full suite or files under worktree issues/. Report only in authoritative leaf below. B owns final aggregation.
- Never open/print/write `.env`/`.env.*`; load credentials only with Bun --env-file registered root and print results/names, never values. No live sites/mailboxes/R2/vendor edits.
- No auth/native-parser/form-processing mocks, disabling flaky tests, weaker criteria, or external timeout override to hide A's defect. Do not send real mail during envelope regression.
- No unrelated refactor or rewriting historical evidence; apply narrow shared root-cause fixes, grep every caller before removing helpers.
- Return mismatch with concrete source/test/scale evidence and smallest correction instead of changing scope or interfaces; only a revised brief from B authorizes an exception.

Reasons are trustworthy native safety, literal-command reproducibility, credential privacy and focused repair; exceptions require B's revised brief and never permit leaks, mocks or weakened checks.

## 6. Ordered steps

1. Derive meaningful regressions from criteria 1–3 before fixes; reuse the already-recorded A timeout red or reproduce with the same plain command, and reproduce B's native envelope/renamed-field failures. Keep red evidence without dumping tokens.
2. Add adequate default timeout and repair header-name normalization; run native envelope regressions for arrays/strings and ordinary control.
3. Decouple FF recovery matching from current schema, retain exclusions/native cleanup, exercise renamed/removed/ordinary/young cases via real cron.
4. Simplify mandatory bootstrap includes and update docs/history; do not rewrite original historical case. Run targeted command green, report all findings' disposition/artifacts.

Advisory ~9 files under 65 turns. Return explicit mismatch/remainder if unexpectedly larger; no silently dropped acceptance.

## 7. Commands

Resolved changed tests (without timeout override):

`AKROGON_BASE=93cf3b7f6b99f3a34be7f69c004345c439fa6a76 bun --env-file=/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/.env test test/plugin/core.test.ts test/plugin/review-regressions.test.ts`

If adding assertions to existing files instead, use a narrow test-name filter for those plus core and record the exact targeted command. Build as needed. B will run literal full `bun --env-file=<root>/.env test` after your return.

## 8. Done-when, evidence and report

Write `/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/open/site-checks/form-helper-plugin/implementation/worker-7.md` with each A/B finding's disposition, changed paths, pasted red/green results, no-timeout-flag proof, artifact paths and actual limitations. Code only in `/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/worktrees/form-helper-plugin`.

Changed files and reasons: <paths and why>
Tests run: <commands and results>
Known limitations: <limitations or none known>
Unverified criteria: <criterion and why, or none>
