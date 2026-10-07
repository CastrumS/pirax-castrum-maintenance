## 1. Goal
Implement forms-owned R2 first-seen lifecycle and command wiring (D2–D4,D6,D8) in `/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/worktrees/checker-awaiting-audit-u2`.

## 2. Numbered acceptance criteria
1. Real command Store persists `{firstSeen: '<canonical UTC ISO>'}` with JSON content type at `state/awaiting-audit/<slug>.json`, validating slug/schema/finite canonical nonfuture time. Missing state begins now; existing valid firstSeen is preserved. No submitted text/credentials in state.
2. Raw awaiting result stays warning at elapsed <=259200000ms, becomes failed strictly above; detail retains versions plus human duration, firstSeen and 72h threshold. Repeated escalations do not clear/restart clock. Plugin/version change and command-mode switch do not reset it.
3. Reconcile once per completed site's full forms pass. Any raw awaiting row retains clock despite skipped rows/page order/unrelated visual or other failures; those other failures still independently fail report. No raw awaiting row clears site key, including no forms, no designation, rejection, unsupported/helper-false/delivery failure. Unvisited/interrupted-config-error sites untouched.
4. Read/list/write/malformed/future-state failures degrade to first sighting and safe detail diagnostic, not exception or escalation. Attempt replacement timestamp after unusable read. Valid continuing clock needs no rewrite. Clearing failures are nonfatal and disclosed, retried next non-awaiting pass. Return safe log diagnostics where empty forms means no detail exists; never fabricate form rows. Do not expose raw storage errors/credentials.
5. Tests cover precise 72h boundaries, repeat/clear/isolation, malformed/future data, real R2 reads/writes/deletes/pruning and failure handling with retained evidence/cleanup. No fake auth or in-memory success backend. Pure decision tests may use synthetic input; backend mutations use scoped real R2.

## 3. Read-first list
`src/store.ts`, `src/forms/runner.ts`, `src/commands/{forms,check,common}.ts`, `src/report/model.ts`, `test/forms/report.test.ts` (read-only scoped R2/evidence pattern), `tests/store.test.ts`, `test/forms/README.md`, `test/plugin/README.md`, root README storage/forms, `/home/rudi/.pi/agent/skills/implement-issue/ponytail.md`. Plan D2–D4 contains exact details.

## 4. Change list and needed interfaces
Own new `src/forms/awaiting-audit.ts`, `src/forms/runner.ts`, `src/commands/forms.ts`, `src/commands/check.ts`, new `tests/awaiting-audit.test.ts`, new `test/forms/awaiting-audit.test.ts`, and `tests/store.test.ts` (state retention sentinel). No prerequisites. Worker 1 separately adds the new model union and refusal parsing; do not edit those files or browser/report test files.
Minimal independent state interface: `reconcileAwaitingAudit(slug, results: {outcome:string;detail:string}[], store: Store, nowMs: number): Promise<string[]>`, mutating awaiting result outcome/detail, returning safe diagnostics. Use pure timestamp/decision helpers as appropriate, minimal exported surface. Optional fourth `populateForms` arg `{store:Store;now?:()=>number}` separate from FormsOptions; return diagnostics. Existing low-level scanner/populate callers omit it and stay storage-free. Production commands always supply their own Store and log returned diagnostics. Capture now per completed site. Report/state finish before publication; upload failure doesn't undo observation.
Use list(exactKey) + exact membership to distinguish missing from operational failure, then get. No Store API changes. Your tests may call state helper directly with structural result arrays; command awaiting fixtures land in unit 3 after parser commit. Existing end-to-end non-awaiting command tests must still pass.

## 5. Do-not, reasons and exceptions
No model/submit/report/browser-test/doc/helper edits (other ownership); no dependency, global unscoped Store, CLI clock flag, lock service or mocked auth. No live sites or production R2 mutations: unique `test/forms-awaiting-*` root only, finally cleanup and require zero remaining. Never open/print/copy/write `.env`/`.env.*` or print bearer links/SDK raw errors. For deterministic operation failure delegate that operation to an actual Store targeting a closed loopback endpoint, others to real R2; this is real transport failure, not fabricated auth. Return mismatch with evidence rather than changing interfaces/scope; B's revised brief is the only exception. Reasons: preserve ownership/locked behavior, scoped real evidence and privacy; exceptions require revised authorization.

## 6. Ordered steps
1. Prepare isolated worktree with Node 24.21.0 bin first on PATH, frozen Bun install and helper build; install Chromium if needed.
2. Write boundary/transition tests first and retain red evidence for absent implementation. Test state persistence with real R2, not fake storage; retain safe summary.
3. Implement module and per-site population then command wiring. Deletion/read failure note on existing row when present, otherwise returned log. Do not interpret escalated failed output as next run's raw outcome.
4. Green targeted tests, configured changed-tests; commit only owned files. Write report with results/evidence/commit.
Advisory: 8 files, under 45 turns. Real scale/interface mismatch returns evidence, no silent incomplete stop.

## 7. Commands
Resolved changed tests: `AKROGON_BASE=2689aaa3bd69a9a46cc77788fdc5219354cc923a bash -c ': "${AKROGON_BASE:?AKROGON_BASE is required}" && bun test'`.
Use Node 24 first on PATH. Load values without reading a file: export AKROGON_BASE then `bun --env-file=/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/.env -e 'const p=Bun.spawn(["bash","-c",": \"${AKROGON_BASE:?AKROGON_BASE is required}\" && bun test"],{stdout:"inherit",stderr:"inherit"});process.exit(await p.exited)'`. Targeted test development allowed for red/green. Final configured changed-tests required even though repo resolves it to full suite; B owns final lane gates. Never call lifecycle commands.

## 8. Done-when, evidence and report
Commit unit and return `/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/open/helper-auto-audit/checker-awaiting-audit/implementation/worker-2.md` with commit and pasted test results/paths. Explicitly note raw browser classification/command awaiting E2E belongs to later integrated verification. Preserve limitation: overlapping writers race (no conditional API), outages postpone aging/failed clears may retain old clock, renamed slug orphaning not collected.
Changed files and reasons: <paths and why>
Tests run: <commands and results, red then green and configured changed-tests>
Known limitations: <limitations or none known>
Unverified criteria: <criterion and why, or none>
