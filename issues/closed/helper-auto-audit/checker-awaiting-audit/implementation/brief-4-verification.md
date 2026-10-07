## 1. Goal
Finish only worker4's missing clean verification on committed `f1b75c19aa435e0875e0e5f6ede28578abb4dd0c` in retained worktree `/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/worktrees/checker-awaiting-audit-u4`. Your repair and complete mismatch report are retained; do not repeat implementation.

## 2. Numbered acceptance criteria
1. Run the exact configured changed-tests to completion on the unchanged committed repair, report actual exit and retain output.
2. Verify typecheck and the real unrelated-probe regression; retain original red evidence. No code change is expected or authorized.
3. If green, resolve AC6 in the worker return with evidence; otherwise return the specific remaining failure rather than silently retrying, expanding scope or claiming completion.

## 3. Read-first list
`implementation/brief-4.md`, `implementation/worker-4.md`, `implementation/worker-4-evidence/changed-tests.log`; `/home/rudi/.pi/agent/skills/implement-issue/ponytail.md`.
Environment correction: journal proves `Lid closed` at 19:33 before the repeated suspends. Ordinary `sleep:idle` inhibitors do NOT stop logind lid handling. B added a temporary `handle-lid-switch` block inhibitor at 21:07, and there are no suspend entries since 21:08. Both test-scoped inhibitors remain held until B's verification finishes. No host file, setting, local service or deadline was changed; no operator action was needed. Use fresh browser processes, not sessions from the interrupted run.

## 4. Change list and interfaces
Own only pass artifacts: `implementation/worker-4-verification.md` and new `worker-4-evidence/retry-*` logs/exit/head, plus a short link/status update in worker-4.md. No source edits and no empty commit; return existing f1b75c1. B has not cherry-picked it yet and is waiting. No concurrent test worker exists.

## 5. Do-not, reasons and exceptions
Never open/copy/print/write any .env file; Bun alone loads values. No secret or signed URL output. No live sites or production R2. No source, helper, timeout, dependency, lifecycle or host configuration changes; failures are an evidence mismatch to B, only a revised brief can authorize a code change. Preserve the failed first-run log rather than overwriting it: this is a clean environment retry, not a hidden repair.

## 6. Ordered steps
1. Confirm git clean at f1b75c1, Node24 first on PATH, inhibitors visible and no new suspend entries.
2. Run typecheck and exact configured changed command below, waiting for actual completion (roughly 37 minutes). No unfinished background promises in final response.
3. Run the existing scanner external-probe verification if the new suite is green; write worker-4-verification.md and add a follow-up link to worker-4.md. Return a specific mismatch if a failure persists without suspension.
Advisory: no source files, under 12 turns plus waits.

## 7. Commands
Node `/home/rudi/.local/share/mise/installs/node/24.21.0/bin` first on PATH; export `AKROGON_BASE=2689aaa3bd69a9a46cc77788fdc5219354cc923a`.
Configured changed-tests is `: "${AKROGON_BASE:?AKROGON_BASE is required}" && bun test`.
Load through `bun --env-file=/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/.env -e 'const p=Bun.spawn(["bash","-c",": \"${AKROGON_BASE:?AKROGON_BASE is required}\" && bun test"],{stdout:"inherit",stderr:"inherit"});process.exit(await p.exited)'`. This configured changed command happens to run the full suite; B owns the final lane gates independently.

## 8. Done-when, evidence and report
A completed configured run on the unchanged repair with precise results, log/exit/head and relevant native summary paths. Keep initial failures identified as suspended runs and qualify the old operator-blocker statement: the process-scoped low-level lid inhibitor resolved it if this retry proves green.
Changed files and reasons: <none expected; artifact updates>
Tests run: <exact commands, results and paths>
Known limitations: <remaining, not superseded host issues>
Unverified criteria: <none, or precise remaining failure>
