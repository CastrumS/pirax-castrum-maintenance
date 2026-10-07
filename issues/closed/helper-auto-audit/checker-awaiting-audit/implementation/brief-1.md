## 1. Goal
Implement exact awaiting-audit browser classification and report support (plan D1,D5,D6) in detached worktree `/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/worktrees/checker-awaiting-audit-u1`.

## 2. Numbered acceptance criteria
1. A fresh selected GF/FF native refusal starting exactly `Pirax test blocked: awaiting audit of ` with nonempty `<Plugin label> <version>` items separated by `, ` produces `awaiting-audit`, retaining redacted version text. Native GF generic validation summary plus appended helper paragraph must work, including overlapping ancestor selectors.
2. Old `integrations could not be suppressed`, near-matches/case differences/blank payloads/mid-sentence mentions, stale or foreign messages stay rejected or existing failed behavior. Genuine additional field/helper refusal must not be masked by awaiting. Do not change ordinary native validation handling. Completion correction: blanket ignoring of the GF validation container's own text violates this criterion. Ignore only recognizable native summary framing (e.g. the native summary heading), not all container text. A literal generic block or substantive extra text directly inside that container alongside an awaiting paragraph must stay rejected; a fresh awaiting-only container should also classify correctly. Add fail-first fixtures for these cases; do not retain the report's blanket-summary limitation.
3. No retry/extra POST/mailbox polling on these refusals; preserve route authorization, association, stale-error guard, transport precedence and privacy.
4. Form model and both manifest modes accept the new outcome, unknown outcomes still reject, warning status/HTML/escaped version detail are correct, check approval remains valid. Existing visual failures still fail. Update exhaustive test record in `test/forms/report.test.ts` in this unit so compilation is coherent.
5. Browser tests use existing real loopback fixture server and headless Chromium, trace on, video/snapshots/sources/screenshots off for forms traces. Retain artifacts in `runs/forms-browser-*`. Tests fail on old code then pass on implementation.

## 3. Read-first list
`src/forms/submit.ts`, `src/forms/runner.ts`, `src/report/{model,manifest,html}.ts`, `test/forms/browser.test.ts`, `tests/report.test.ts`, `test/forms/report.test.ts`, `README.md` Form checks, `test/forms/README.md`, `test/plugin/README.md`, `plugin/pirax-form-test/includes/gravity-forms.php` gf_rejection_message (read-only), `/home/rudi/.pi/agent/skills/implement-issue/ponytail.md`. Copy existing browser visit/server/redaction pattern. Full plan available at authoritative leaf `plan.md` if needed.

## 4. Change list and needed interfaces
Own only `src/forms/submit.ts`, `src/report/model.ts`, `src/report/manifest.ts`, `src/report/html.ts`, `test/forms/browser.test.ts`, `tests/report.test.ts`, `test/forms/report.test.ts`. Extend SubmissionResult.state and FormResult.outcome. Scanner already forwards non-confirmed states. Keep individual error observations for exact classification rather than searching page-wide/joined text. No preceding chunks required. Worker 2 owns storage/runner/commands and new state tests; it does not edit your files. Worker 3 will own command E2E tests/docs after both commits.

## 5. Do-not, reasons and exceptions
Do not edit helper/plugin, storage/runner/commands, docs, env files, lifecycle state, or sibling worktree: ownership/scope must remain independent. Never open/print/copy/write `.env` or `.env.*`; load existing values through Bun only, never log credential or bearer values. No auth/storage mocks or live site checks. The local browser fixture pattern is expressly allowed, not proof of new helper release behavior. Return mismatch evidence to B for incompatible scope/interface or large work rather than changing the contract; only a revised brief authorizes an exception. These exclusions protect locked scope, real boundaries, independent workers and secret privacy; exceptions require B's revised brief.

## 6. Ordered steps
1. Install worktree dependencies (`bun install --frozen-lockfile`) with `/home/rudi/.local/share/mise/installs/node/24.21.0/bin` first on PATH; install Chromium if missing; build helper ZIP before native tests. All agent-owned setup.
2. Derive browser/report assertions from 2.1–2.5, capture targeted red evidence before modifying implementation. Use synthetic secrets in assertions.
3. Implement minimal submit/model/manifest/renderer changes, then green browser/report checks. No new dependency or generic framework.
4. Run configured changed-tests with supplied base and real environment. Full command is unfortunately the full suite; keep sanitized log in authoritative leaf implementation directory. Report any prerequisite blocker by name; no secret requests to user. Completion turn: existing b307e0e commit and targeted evidence are retained; do not restart original work. Finish the existing background changed-test run, correct criterion 2, rerun on corrected code, and replace CHANGED_TESTS_RESULT with actual output. Wait/poll to completion: print-mode Claude will not auto-resume after a final reply. No final return while testing is outstanding.
5. Commit only owned code/test files. Write report to authoritative `implementation/worker-1.md` with commit, red/green results and evidence.
Advisory: 7 files, under 40 turns; scale/interface mismatch is a return with evidence, not permission to stop silently.

## 7. Commands
Configured changed-test command (not a separate full-suite request):
`AKROGON_BASE=2689aaa3bd69a9a46cc77788fdc5219354cc923a bash -c ': "${AKROGON_BASE:?AKROGON_BASE is required}" && bun test'`
Run with Node 24 first on PATH and environment loaded by `bun --env-file=/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/.env -e 'const p=Bun.spawn(["bash","-c",": \"${AKROGON_BASE:?AKROGON_BASE is required}\" && bun test"],{stdout:"inherit",stderr:"inherit"});process.exit(await p.exited)'` with AKROGON_BASE exported. Targeted red/green development runs are allowed; final changed-test result must be recorded. Do not run lifecycle commands or separate B gates.

## 8. Done-when, evidence and report

Repair round 1: the scanner mailbox assertion from this unit is superseded by `brief-4.md`: observe the installed client's actual connection/socket, retain its confirmed positive control and assert zero owned connections despite a deliberately unrelated real listener probe. Do not count all accepted peers as checker traffic. The original browser outcome/POST/privacy criteria remain intact.
Return committed chunk and report at `/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/open/helper-auto-audit/checker-awaiting-audit/implementation/worker-1.md`. Include pasted command summaries, sanitized logs/evidence paths, commit ID, and all limitations/unverified criteria. Do not claim storage/CLI aging covered by this unit.
Changed files and reasons: <paths and why>
Tests run: <commands and results, red then green and configured changed-tests>
Known limitations: <limitations or none known>
Unverified criteria: <criterion and why, or none>
