## 1. Goal

Build the minimal reproducible real WordPress/Gravity Forms/Fluent Forms Playground test harness, preparing plan D10–D12 and AC1–AC8. One unit only: harness/tooling, not production plugin/adapters.

## 2. Numbered acceptance criteria

1. A targeted Bun test starts real `@wp-playground/cli` WordPress on loopback with the licensed GF ZIP and FF 6.2.14 from wordpress.org, verifies activation/version and real PHP/database access, and shuts down reliably. Missing prerequisites/readiness failure fail loudly without exposing secrets.
2. Consumer `playwright` drives headless Chromium (video off) through real WordPress admin login and a public fixture page with trace retained. No mocked auth/capabilities. At least a basic real form for each plugin is rendered and can be submitted unmarked; native notifications are captured by test-only `pre_wp_mail` with original recipients and entries retained.
3. Harness exposes setup/assertion PHP execution, mail-log reading, native queue driving across requests, browser lifecycle, and plugin-ZIP upload support for later workers. Fixtures are real native forms/settings, not mock PHP classes. Credential names only in errors.
4. Trace/log retention redacts FORM_TEST_TOKEN; do not expose environment values or create/change any `.env`/`.env.*`. Derive tests before helpers and preserve red/green evidence. No tests silently skipped.

## 3. Read-first list

- `/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/open/site-checks/form-helper-plugin/plan.md` (D10–D12, source evidence, AC sections).
- Same leaf `design.md` and `brief.md`.
- `/home/rudi/.pi/agent/skills/implement-issue/ponytail.md`.
- `.gitignore`; no existing code/test pattern exists (empty project). Reuse native Playground blueprint/PHP APIs and Bun/Playwright library API rather than introducing frameworks.
- Inspected temporary sources `/tmp/pirax-gf-plan-KBir8t/gravityforms/`, `/tmp/pirax-fluentform-plan/fluentform/`, if still present. Never vendor licensed source.

## 4. Change list and needed interfaces

Own `package.json`, `bun.lock`, `.gitignore`, `test/plugin/harness.ts`, `test/plugin/blueprint.ts` (if useful), `test/plugin/fixtures.php`, `test/plugin/mu-plugin.php`, `test/plugin/artifacts.ts`, and `test/plugin/harness.test.ts`. Keep fewest files, explain any planned-file consolidation. Add `@wp-playground/cli` and `playwright` pinned; use Bun test and Playwright library, not Playwright test runner. `test:plugin` should resolve to targeted `bun test test/plugin` with sufficient timeouts. Reserve `build:plugin` for `bun scripts/build-plugin.ts` implemented next unit.

Expose a small documented harness interface for start/stop, URL, native PHP execution returning structured results, browser creation, form fixture IDs, captured mail/entry/queue inspection and artifact folder. The local PHP execution bridge must use Playground-supported APIs/CLI rather than an unprotected HTTP backdoor. Test-only mu-plugin may log final `pre_wp_mail` arguments and short-circuit sending, intercept Google siteverify to success:false, and offer real framework feed fixture observations, but must not alter real authorization. Defer unsupported integration fixtures until adapters if necessary, explaining interfaces.

Environment is present only in registered repo, not worktree. Load scripts as `bun --env-file=/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/.env ...`, not by reading the file. `GRAVITY_FORMS_ZIP` and `FORM_TEST_TOKEN` are present; licensed path accessible. Inspect presence by name only. A token-bearing error/child log must be sanitized before printing. Runtime/downloads/distribution/artifacts are ignored and never packaged or committed.

## 5. Do-not, reasons and exceptions

- Do not edit production plugin files or issue state, run lifecycle commands, commit, or run the whole suite: later units/B own these.
- Never open, print, append or write `.env` or `.env.*`; load via Bun `--env-file` and print results only. Do not reveal credential values/paths in logs. No live sites, mailbox, SMTP or R2 access: this unit is local WordPress only.
- Do not mock authorization, replace real form processing with stubs, or claim skipped/partial tests passed: acceptance requires native execution.
- Return a mismatch with actual conflicting requirement/interface evidence and smallest correction, rather than changing scope/interfaces; only a revised brief from B authorizes a change.

These exclusions preserve scope, credential privacy and trustworthy native evidence; only B's revised brief can authorize interface/scope changes, never exposure of credentials or auth mocks.

## 6. Ordered steps

1. Derive `test/plugin/harness.test.ts` smoke assertions from criteria 1–2 before helper code; record initial meaningful failure.
2. Add manifest/dependencies and ignored runtime folders; inspect Playground APIs and installed CLI docs/source as needed.
3. Implement harness/setup using native tools; create real form fixtures/mu-plugin capturing final mail.
4. Run targeted tests until green and retain safe trace/results. Inspect artifacts for secrets without printing them.
5. Document exported interfaces, evidence and gaps in the report. No production adapter tests are required green yet.

Advisory size: ~8 files, under 60 turns. Work clearly beyond this should return a mismatch with evidence, not silently cut acceptance criteria.

## 7. Commands

Resolved changed-test command (no configured runner exists):

`AKROGON_BASE=93cf3b7f6b99f3a34be7f69c004345c439fa6a76 bun --env-file=/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/.env test test/plugin/harness.test.ts --timeout 180000`

Install prerequisites as necessary, but do not run the full suite.

## 8. Done-when, evidence and report

Harness smoke criteria are green against real plugins and a retained trace. Write report to `/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/open/site-checks/form-helper-plugin/implementation/worker-1.md`, including pasted results, red/green, exported interfaces, artifact paths, and explicit remaining criteria. All code edits only in `/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/worktrees/form-helper-plugin`.

Changed files and reasons: <paths and why>
Tests run: <commands and results>
Known limitations: <limitations or none known>
Unverified criteria: <criterion and why, or none>
