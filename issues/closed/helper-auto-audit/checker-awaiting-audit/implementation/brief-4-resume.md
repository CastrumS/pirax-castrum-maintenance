## 1. Goal
Finish only missing verification for worker4 after the prior session was interrupted. Retained worktree `/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/worktrees/checker-awaiting-audit-u4` is clean at `f1b75c19aa435e0875e0e5f6ede28578abb4dd0c`. No implementation remains.

## 2. Numbered acceptance criteria
1. Run the exact configured changed-tests on unchanged f1b75c1 to real completion; report exit and retain output.
2. Typecheck and the existing scanner unrelated-probe regression pass. Preserve existing red evidence.
3. Resolve worker4 AC6 only if the configured command passes. Otherwise return a specific remaining failure, without source changes or silent retries.

## 3. Read-first list
`implementation/brief-4-verification.md`, `implementation/worker-4.md`, `implementation/worker-4-evidence/retry-changed-tests.log`, `/home/rudi/.pi/agent/skills/implement-issue/ponytail.md`. The earlier verification worker stopped without a report or test exit file; no own Bun tests remain alive. Host rebooted Oct5 14:24 and has no suspend events this boot at resumption. B holds new temporary sleep/idle/lid inhibitors for verification; no host settings changed.

## 4. Change list and interfaces
Own pass artifacts only: `implementation/worker-4-resume.md` and new `worker-4-evidence/resume-*` logs/exit/head/summary copies. Do not overwrite the failed first run or incomplete retry. Existing repair has five source/doc files and is complete. Return f1b75c1; no source change or empty commit. B waits before picking it.

## 5. Do-not, reasons and exceptions
Never open, copy, print or write .env files; load values through Bun only. No credential/signed URL output, live-site work or production R2 mutation. No code, helper, timeout, dependency, lifecycle, host setting or service changes. A persistent failing check is a mismatch to B; only a revised brief authorizes repair. Preserve prior evidence so an interrupted command is never reported as a pass.

## 6. Ordered steps
1. Confirm clean f1b75c1, installed Node24 first on PATH, dependencies available, inhibitor visible, no new suspends.
2. Run typecheck and exact configured changed-tests, retaining logs, HEAD and actual exit. Wait for completion (roughly 37 min), never return an unfinished-background promise.
3. If green, rerun the existing scanner external-probe verification (see original worker artifacts) and write report. Copy the successful command/state summary.json files to your evidence directory so later worktree removal does not erase the useful evidence. If a test remains red, report exact failure and stop; do not broaden scope.
Advisory: no source files, under 12 turns plus waits.

## 7. Commands
Node `/home/rudi/.local/share/mise/installs/node/24.21.0/bin` first on PATH. Export `AKROGON_BASE=2689aaa3bd69a9a46cc77788fdc5219354cc923a`.
Configured changed-tests: `: "${AKROGON_BASE:?AKROGON_BASE is required}" && bun test`.
Load through `bun --env-file=/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/.env -e 'const p=Bun.spawn(["bash","-c",": \"${AKROGON_BASE:?AKROGON_BASE is required}\" && bun test"],{stdout:"inherit",stderr:"inherit"});process.exit(await p.exited)'`. The configured changed command happens to be the full suite; B owns final lane checks independently.

## 8. Done-when, evidence and report
Completed configured run with precise results, log/exit/head and preserved command/state summaries. Qualify prior worker4 report: original run failed during suspend-loop, second run was interrupted, current run is the new evidence. No native mail delivery claim.
Changed files and reasons: <none; artifact updates>
Tests run: <exact commands/results and paths>
Known limitations: <remaining limitations>
Unverified criteria: <none or precise remaining failure>
