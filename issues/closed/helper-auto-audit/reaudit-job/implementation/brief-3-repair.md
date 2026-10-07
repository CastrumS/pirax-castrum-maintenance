# Unit 3 repair: tracked heartbeat and strict operational diagnostics

## 1. Goal

Repair concrete integration findings in retained worktree `/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/worktrees/reaudit-job-u3`, starting from unlanded c01afc3. Do not repeat completed implementation/mail selftest. Plan D8–D10 remain binding.

## 2. Numbered acceptance criteria

1. An already-TRACKED `.github/audit/heartbeat.txt` on main with a >=30day-old last commit is updated and pushed to a local bare remote, only that path changes, no release/tag. Existing code wrongly trims the leading porcelain status space and then slices off a path character, refusing every normal subsequent heartbeat. B reproduced exit1 `heartbeat: refusing changes outside the heartbeat file` in implementation/evidence/heartbeat-tracked-repro.log. Add the fail-first tracked-file case (not merely creating an untracked heartbeat) and fix status parsing.
2. Reject invalid ISO offsets +99:99 and +00:99 and nonfinite injected clocks; B reproduced acceptance in evidence/operations-validation-repro.log. Retain documented skew/30day/48hour boundaries.
3. Uncontrolled error.code and unknown JSON property names must not appear in diagnostics even if purely alphabetical. B reproduced both echoing a synthetic secret-shaped sentinel. Use fixed field messages and a finite allowlist of public SMTP/network error codes or omit unknown codes. Add fail-first synthetic tests. Do not print raw names/messages of arbitrary errors under a format-only “safe” rule.
4. Extend FailureSummary with optional intended `commit` (exact40 lowercase hex) and `tag` (v + stable dotted numeric helper version), needed by plan D7 partial-publication recovery. Validate and render them; never accept arbitrary text. Add negative tests. Preserve current callers and real-mail evidence.
5. Complete report with actual configured changed-test result, red/green evidence, amended commit and limitations. No report placeholders.

## 3. Read-first list

Read brief-3.md, this repair, `/home/rudi/.pi/agent/skills/implement-issue/ponytail.md`, implementation/integration-findings.md and current report-u3.md. Inspect scripts/reaudit/{heartbeat,notify,watchdog}.ts and tests/reaudit-operations.test.ts. Preserve existing safe operational scope.

## 4. Change list and needed interfaces

Own the same four unit3 code/test files. This explicitly authorizes the two optional FailureSummary fields; later integration consumes them. Unit3 has not been cherry-picked, so amend its original commit after the repair to return one unit commit. Keep worktree path unchanged. Other workers own pin/acquisition code; no edits there.

## 5. Do-not, reasons and exceptions

No new real SMTP selftest (the first arrived and is sufficient), no real heartbeat/main/tag mutation, no workflow disabling, no env file access/writes. Use local git and synthetic secrets only. Do not weaken assertions or merely report the confirmed heartbeat bug as a limitation. Return mismatch with evidence rather than alter scope; only revised brief allows exceptions. These constraints preserve live safety and make the concrete defect fixed rather than hidden.

## 6. Ordered steps

1. Confirm the earlier unit3 configured test has finished; preserve its completed result. Do not edit during an in-flight test.
2. Add tracked-heartbeat/offset/privacy negatives; capture red.
3. Fix parsing/diagnostics and add validated commit/tag fields; capture green.
4. Run owned targeted checks/typecheck and resolved changed tests. No parallel duplicate native suite. Amend unit commit and update report/evidence.

Advisory: four files, under28 editing turns plus bounded verification waits.

## 7. Commands

Node24 PATH prefix `/home/rudi/.local/share/mise/installs/node/24.21.0/bin` and installed native gh directory `/home/rudi/.local/share/mise/installs/gh/latest/gh_2.101.0_linux_amd64/bin` before wrapper paths for any read-only GitHub check. Resolved changed command remains `: "${AKROGON_BASE:?AKROGON_BASE is required}" && bun test`, AKROGON_BASE=4e929fca0a8c793f2189454091fb5c0fcf74a1da. Use original brief7 Bun env-file wrapper, never open environment files. Serialize the expensive configured command with `flock /home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/open/helper-auto-audit/reaudit-job/implementation/native-check.lock` around the complete Bun wrapper: B's lane check holds that lock now. Wait for it instead of starting another concurrent native suite. Focused red/green: `bun --no-env-file test tests/reaudit-operations.test.ts` (these cheap nonnative tests need no lock).

## 8. Done-when, evidence and report

Update authoritative report-u3.md with original and repaired results, final amended commit ID, exact interfaces, evidence paths and remaining limitations. Preserve delivered selftest evidence. Remain active until tests/report/commit finish: a print-mode final “waiting for background notification” ends the worker and is not completion. Return commit and report; no phase command.

Changed files and reasons: <paths and why>
Tests run: <commands and results>
Known limitations: <limitations or none known>
Unverified criteria: <criterion and why, or none>
