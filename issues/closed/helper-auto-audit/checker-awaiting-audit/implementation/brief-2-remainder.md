## 1. Goal
Finish worker 2's retained implementation, verification and report in existing u2 worktree; do not restart the original implementation. Original scope/criteria/interfaces remain binding.

## 2. Numbered acceptance criteria
1. Preserve all existing unit-2 changes/tests. Finish currently running configured changed-test process (PID 364115 at coordinator inspection), capture real exit and output, repair only owned defects, and commit.
2. Correct the one population mismatch: design says any non-awaiting completed site outcome clears. The runner currently guards reconciliation with `runtime && browser`, leaving stale state when launch fails but reports failed rows for the completed site loop. Reconcile for `runtime` regardless of browser launch; interrupted config errors remain untouched because the loop throws before reconciliation. No per-row reset.
3. Report all changed files/reasons, pasted test results/artifacts, commit, limitations and unverified criteria. No placeholders or promise of a later return.

## 3. Read-first list
Your retained diff and `runs/awaiting-audit-changed-tests.log`, original `implementation/brief-2.md`, `/home/rudi/.pi/agent/skills/implement-issue/ponytail.md`. Do not reread unrelated scopes.

## 4. Change list and needed interfaces
Same owned paths/interfaces as brief-2. Starting state: seven modified/new files, targeted tests apparently green, full configured changed-test running in background. No commit/report yet. B has not cherry-picked anything. Keep this exact worktree `/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/worktrees/checker-awaiting-audit-u2`.

## 5. Do-not, reasons and exceptions
No original scope expansion, no env-file access, no live-site/production R2 writes, no worker-1 file changes. Preserve real scoped tests and privacy. Return mismatch evidence if necessary; only revised B brief authorizes exceptions. These restrictions retain locked scope, ownership and credential privacy.

## 6. Ordered steps
Inspect retained work and existing test process/output, make the one population correction, run changed tests on corrected code (do not use an earlier in-flight pass as evidence for changed code), commit and report. Wait/poll until actual completion: a background process is not a completed result and print-mode Claude will not resume itself after your final response. Advisory one-line fix plus verification/report, under 16 turns excluding deliberate waits.

## 7. Commands
Same resolved command as brief-2: export `AKROGON_BASE=2689aaa3bd69a9a46cc77788fdc5219354cc923a`, Node24 PATH, Bun-load registered environment then `: "${AKROGON_BASE:?AKROGON_BASE is required}" && bun test`. Targeted development allowed; final configured changed command required. Never lifecycle commands.

## 8. Done-when, evidence and report
Write completed `implementation/worker-2.md` in authoritative leaf; return commit. Do not finish with background work outstanding. Record real failures honestly rather than silently claiming success.
Changed files and reasons: <paths and why>
Tests run: <commands/results and evidence>
Known limitations: <limitations>
Unverified criteria: <criteria or none>
