# Unit 1 remainder: finish retained pin refactor, verification and return

## 1. Goal

Finish ONLY remaining work from brief-1.md in the retained detached worktree `/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/worktrees/reaudit-job-u1`. The previous worker exited with “I'll wait for the background run to finish; it notifies me when it does” and no commit/report. All its edits remain. Do not repeat the original implementation.

## 2. Numbered acceptance criteria

1. Inspect retained diff against brief1; preserve completed strict reader/harness/native/doc refactor. Commit it only after checking completeness.
2. Complete the in-flight configured test run and record its actual result. It started at 06:51:42Z, PID1150473 (`bun test`, orphaned after worker exit), log authoritative implementation/evidence-u1/changed-tests.log. Do not start a duplicate run while it is active or edit runtime code mid-run. Its log already contains a PHP120s timeout in unchanged adapters sweep and consequent closed-context failures. Diagnose concretely; do not weaken tests or timeouts to make them green. Report unrelated/resource failures with evidence for B's sequential lane verification.
3. Pin reader errors must not echo an unknown source key merely because it matches lowercase letters: use a fixed field error and a synthetic credential-shaped unknown-key test after the in-flight run ends. This is a small privacy hardening within original scope.
4. Supply the missing commit and complete report with changed paths/reasons, tests/results, limits and unverified criteria. Never return merely saying a background test will notify you; remain active until report/commit or an evidence-backed mismatch.

## 3. Read-first list

Read original brief-1.md, `/home/rudi/.pi/agent/skills/implement-issue/ponytail.md`, retained diff and existing evidence-u1 files. Shared interfaces and scope remain the original brief; do not re-read entire repository unnecessarily.

## 4. Change list and needed interfaces

Same owned paths/interfaces as brief1. Existing source reader and version-fixtures are untracked but complete-looking; include them in the unit commit. No predecessor/new worktree required: resume the existing path unchanged. Units2/3 own acquisition and operations separately. Original baseline is 4e929fca0a8c793f2189454091fb5c0fcf74a1da.

## 5. Do-not, reasons and exceptions

Do not restart completed implementation, create another worktree, change current pins/header, weaken tests, touch other units, publish or invoke phases. No env files opened/printed/copied/written: Bun --env-file only. Never print credential subjects. Do not edit while the retained test is still reading source. These limits preserve landed work, reproducible tests and credential safety; exception only an explicit revised brief from B. Return an evidence-backed mismatch rather than silently changing scope.

## 6. Ordered steps

1. Inspect diff and pending test state. Wait via bounded polling for PID1150473, and do useful read-only completeness checks meanwhile.
2. Record final test summary/failures. If exit code was lost with previous parent, say so rather than invent it; nonzero failure counts remain red evidence.
3. Add fail-first synthetic unknown-key privacy check, one-line parser correction, focused green tests/typecheck; inspect native literals and docs completeness.
4. Run configured changed tests if necessary for missing result or a specific unresolved owned defect; do not parallelize another native suite against an existing one. Preserve actual results and diagnose without loosening acceptance.
5. Commit unit and fill report-u1.md, copying sanitized summaries/artifacts needed after removal into authoritative evidence-u1. Return commit/report.

Advisory: remainder is one small fix plus verification/report, not 17 files of new work; under30 turns apart from bounded waits.

## 7. Commands

Node24 PATH prefix `/home/rudi/.local/share/mise/installs/node/24.21.0/bin`. The resolved changed-test command stays `: "${AKROGON_BASE:?AKROGON_BASE is required}" && bun test`, AKROGON_BASE=4e929fca0a8c793f2189454091fb5c0fcf74a1da. Load credentials exactly as original brief7 through Bun --env-file=/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/.env, never by reading it. Focused red/green parser checks use `bun --no-env-file test tests/plugin-source.test.ts`. No separate full-suite alias beyond the configured command.

## 8. Done-when, evidence and report

Authoritative report: `/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/open/helper-auto-audit/reaudit-job/implementation/report-u1.md`. Must include commit and actual observed tests (no placeholders), evidence paths, known timeout/runner caveats, remaining criteria. Do not exit as if background completion automatically resumes a noninteractive worker.

Changed files and reasons: <paths and why>
Tests run: <commands and results>
Known limitations: <limitations or none known>
Unverified criteria: <criterion and why, or none>
