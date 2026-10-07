# Unit1 fixture repair: reboot remainder only

## 1. Goal
Finish the retained fixture repair after the host reboot at 2026-10-06T10:34:54Z. Worktree `/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/worktrees/reaudit-job-u1` remains at b120086 with exactly three modified files. No prior worker/check process survived. Do not redo the original unit or discard its edits.

## 2. Numbered acceptance criteria
1. Preserve the proven fix: UUID backup names plus copy/write/rename/readback checks; retain restored-byte assertions. Probe showed copy returns false/ENOENT after a different Playground worker renamed the reused backup away, even though file_exists says true. Repeated/nested regression is red on original mechanism and green on current changes. Focused Pro/SMTP compatibility scenario is already green.
2. Finish configured changed tests with the native gh binary actually FIRST on PATH, avoiding the mise wrapper that caused changed-tests-aborted-wrong-gh-path.log. Most recent changed-tests.log began10:33:33Z and was interrupted by reboot, not passed. Preserve both incomplete logs and run anew under shared flock, with exact command, exit and counts recorded.
3. Commit the existing repair as a NEW commit on b120086 (already landed on B as0d32481), not an amendment. Return complete updated report-u1.md with actual outcomes and limitations.

## 3. Read-first list
Read `/home/rudi/.pi/agent/skills/implement-issue/ponytail.md`, original brief-1-fixture-repair.md, report-u1.md and evidence-u1-fixture-repair/ logs. Inspect the exact retained diff in compatibility.test.ts, harness.test.ts and version-fixtures.ts. B verified the old wrong hash is precisely SMTP2.4.2 bytes rather than original2.4.1. Do not invent another cause.

## 4. Change list and interfaces
Only remaining verification/report/commit, plus corrections proven necessary in those three owned files. No production behavior or pin/helper changes. All preceding interfaces are already present. Existing pure regression and native probe logs are evidence, not extra tests to add. Temporary fixture-probe.test.ts was removed; keep it removed. No other workers currently run after reboot. Other units are returned but not landed.

## 5. Do-not, reasons and exceptions
Never open/print/copy/write .env/.env.*. Load needed values via Bun env-file only; no secret-bearing matcher subjects or raw private output. Do not loosen assertions/timeouts, repeat real email/GPL activation, push main, publish, or amend landed b120086. Preserve incomplete logs so a canceled run is not represented as green. Report mismatch with concrete evidence rather than expanding scope; only B's revised brief permits an exception. These exclusions protect privacy, exact-byte proof and the reviewed publication boundary.

## 6. Ordered steps
1. Inspect retained state and prior logs; preserve reboot-interrupted changed-tests.log under a distinct name.
2. Verify actual executable paths, then build plugin and run configured changed tests under native-check.lock. PATH must start with `/home/rudi/.local/share/mise/installs/node/24.21.0/bin:/home/rudi/.local/share/mise/installs/gh/latest/gh_2.101.0_linux_amd64/bin`, without later prepending ~/.local/bin. Verify `command -v gh` before beginning.
3. Address only an actual owned failure; update report-u1.md with diagnosis, three changed paths, red/green/broad evidence, limitations and unverified criteria. Commit new repair and report hash.

Advisory three files, under20 editing turns plus native wait. Stay active until report/commit; print-mode background-notification promises do not resume you.

## 7. Commands
AKROGON_BASE=4e929fca0a8c793f2189454091fb5c0fcf74a1da. Resolved changed command `: "${AKROGON_BASE:?AKROGON_BASE is required}" && bun test`, through Bun env-file wrapper loading `/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/.env`. Acquire `flock /home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/open/helper-auto-audit/reaudit-job/implementation/native-check.lock` for expensive native check. Record process exit explicitly, not a final grep alone. Dependencies are already installed; verify rather than reinstall unnecessarily.

## 8. Done-when, evidence and report
New committed repair with complete report-u1.md and preserved evidence under evidence-u1-fixture-repair. Record wrong-gh interrupted run separately from reboot interrupted run, no invented successful exits. No lifecycle command. Return commit and report only after completion or a concrete mismatch.

Changed files and reasons: <paths and why>
Tests run: <commands and results>
Known limitations: <limitations or none known>
Unverified criteria: <criterion and why, or none>
