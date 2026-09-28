# Unit 4 — investigate final full-suite R2 failure

## 1. Goal

Resolve or accurately classify B's failed blocking check without changing helper-compat scope. Worktree: `/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/worktrees/helper-compat`. Production/plugin criteria remain locked; no acceptance may be weakened. All plugin tests passed in B's final run, but an existing real-R2 integration failed.

## 2. Numbered acceptance criteria

1. Investigate these exact failures from `implementation/final-full-suite-attempt-1.log` in the authoritative leaf:

```text
S3Error: We encountered an internal error. Please try again.
code: "InternalError"
at test/forms/report.test.ts:261:92, real.get(...manifest.json)
(fail) forms-only local and published reports > real R2: manifest last, traces excluded, approval still selects the older check
(fail) forms-only local and published reports > (unnamed)
  evidence.remote?.ok was undefined in teardown after the failure
238 pass, 2 fail, Ran 240 tests across 22 files [1959.65s], exit 1
```

2. Preserve evidence and distinguish observed server InternalError from an unconfirmed explanation. A temporary re-run passing does not prove a root cause. All new/old plugin tests, build and typecheck already passed; no reason to touch production storage/checker code solely to mask this failure.
3. Rerun the resolved changed-tests command and capture its actual exit/results. If it succeeds with no code change, explicitly report a transient/unreproduced external failure and that no repair was made. If it still fails, report exact evidence and smallest appropriate correction/blocker, without broadening scope or hiding failures.
4. Complete a report with no placeholders before returning. No pending background test promise counts as completion.

## 3. Read-first list

- `/home/rudi/.pi/agent/skills/implement-issue/ponytail.md`.
- Leaf `implementation/final-full-suite-attempt-1.log` and `worker-3.md` (the earlier browser failure was different; its isolated recheck passed).
- `test/forms/report.test.ts` around its scoped R2 test/cleanup and the root README full-suite prerequisites.
- `src/store.ts` only if needed to understand the boundary; it is excluded from edits.

## 4. Change list and needed interfaces

This is a verification/failure-investigation unit. No tracked source edit is expected. Use only the existing scoped test R2 prefix and its cleanup, not real client data or manual broad bucket operations. If a concrete leaf defect is established, return mismatch with evidence and a minimal brief correction to B. Write the report at the authoritative leaf's `implementation/worker-4.md`.

## 5. Do-not, reasons and exceptions

- Never read/write/print `.env*`. Execute scripts with Bun's environment loader, printing names/results only; no credential values/ZIP paths in argv/logs. Sanitize retained command output.
- No changes to `src/**`, sites, tests/assertions, retry policies, dependencies, commits, lifecycle state or deployed sites. No weakening/skipping tests to get green.
- No real bucket cleanup except the test's existing temporary-prefix cleanup.
- Return a mismatch for needed code/scope changes; only a revised brief from B is an exception. These exclusions prevent masking unrelated external failures, preserve client data and keep leaf ownership; convenience never permits an exception.

## 6. Ordered steps

1. Read the failure and failing test boundary; classify observed facts (criteria 1–2).
2. Run the configured changed-tests command below, keeping it alive and waiting until it really exits (criterion 3). A targeted diagnostic of the failing boundary is allowed but cannot substitute for the command.
3. Sanitize/preserve results and fill the complete report (criterion 4).

Advisory size: no tracked files, under 20 turns excluding waits. **Wait synchronously or poll the running process via tools until done. Do not end the CLI session with 'I will finish later'; that previously killed a wrapper and lost exit status.**

## 7. Commands

```sh
AKROGON_BASE=e2075daad1c5b0dd2438ff61d71e606c47819a39 bash -c ': "${AKROGON_BASE:?AKROGON_BASE is required}" && bun test'
```

Do not run other full suites. B reruns final blocking checks after this return.

## 8. Done-when, evidence and report

Write `/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/open/helper-compat/helper-compat/implementation/worker-4.md` with actual completed results/exit/evidence, distinguishing remediation from no-code recheck. Do not return while the command is running.

Changed files and reasons: <none if verification only; otherwise mismatch, not unauthorized edits>
Tests run: <exact command, actual exit and pasted summary, sanitized evidence path>
Known limitations: <external/transient failure facts, root cause confidence>
Unverified criteria: <any remaining failed/missing evidence, or none>
