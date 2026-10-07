## 1. Goal
Finish ONLY worker4 verification/report at retained clean worktree `/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/worktrees/checker-awaiting-audit-u4`, commit `f1b75c19aa435e0875e0e5f6ede28578abb4dd0c`. Implementation is complete. The prior resume worker stopped without a report; no own tests remain alive.

## 2. Numbered acceptance criteria
1. Configured changed-tests complete on unchanged f1b75c1 with an actual exit file; typecheck passes.
2. Existing scanner regression passes with unrelated real TCP traffic; original red evidence is retained.
3. Complete a report with actual results, limitations and unverified criteria. No code edits or empty commit.

## 3. Read-first list
`implementation/worker-4.md`, `implementation/brief-4-resume.md`, `/home/rudi/.pi/agent/skills/implement-issue/ponytail.md`.
B inspected the prior CLI transcript: it launched tests, armed a Monitor for suspend events, then returned a final 'still waiting' response when that monitor expired at 10 minutes. The CLI exited and its test process vanished with no exit file. The host did NOT suspend or OOM this time. This is an incomplete worker return, not a test failure or operator blocker. No code needs changing.

## 4. Change list and interfaces
Artifacts only: `implementation/worker-4-finish.md`, new `worker-4-evidence/finish-*` logs/head/exit and copies of successful command/state summaries. Preserve earlier failed/incomplete logs. B's temporary sleep/idle/lid inhibitor remains active. Node24 is installed and dependencies are ready.

## 5. Do-not, reasons and exceptions
Never open/copy/print/write .env files; Bun alone loads them. No secret output, live sites or production R2 mutation. No source, lifecycle, host setting, service or timeout changes; report any persistent failure to B. Most importantly: do NOT use Monitor, automatic background-task notifications, TaskOutput or a final waiting response. Their print-mode lifecycle ended your previous run. This launch disables automatic background tasks. Only a revised brief permits a code change.

## 6. Ordered steps
1. Confirm clean f1b75c1 and no own tests alive. Run typecheck.
2. Launch the configured command from a shell using `setsid nohup bash -c '...run command, redirect output, write actual exit...' ... &`. Record the detached PID and HEAD. This separates test lifetime from the CLI's process group.
3. While the exit file is absent, call foreground Bash with `sleep 240` and a tool timeout of at least 300000 ms, then inspect the PID and log progress. Repeat until real completion. These foreground waits (NOT run_in_background) keep this worker alive. Do NOT return to wait for a notification; none will resume this print-mode session. Roughly 37 minutes means about 9 such waits. If PID dies without exit, report interrupted rather than waiting forever.
4. If green, run the scanner external-probe regression as documented in worker-4.md, copy successful command/state summary.json evidence and write the report. If red without suspension, report the concrete mismatch, no silent retries.
Advisory: zero source files, under 12 work turns plus all needed waits. No turn ceiling requires premature return.

## 7. Commands
PATH first `/home/rudi/.local/share/mise/installs/node/24.21.0/bin`; export `AKROGON_BASE=2689aaa3bd69a9a46cc77788fdc5219354cc923a`.
Configured changed-tests: `: "${AKROGON_BASE:?AKROGON_BASE is required}" && bun test`.
Load through `bun --env-file=/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/.env -e 'const p=Bun.spawn(["bash","-c",": \"${AKROGON_BASE:?AKROGON_BASE is required}\" && bun test"],{stdout:"inherit",stderr:"inherit"});process.exit(await p.exited)'`. This configured command happens to be the full suite; B separately owns final lane checks.

## 8. Done-when, evidence and report
Return f1b75c1 plus `worker-4-finish.md` only after actual completion or a concrete terminal failure. Distinguish initial suspend-affected failure, interrupted retries, and the new completed result. No new delivered-mail claim.
Changed files and reasons: <none; artifact updates>
Tests run: <commands, real exits/results, log/head paths and summary copies>
Known limitations: <remaining limitations>
Unverified criteria: <none or precise remaining failure>
