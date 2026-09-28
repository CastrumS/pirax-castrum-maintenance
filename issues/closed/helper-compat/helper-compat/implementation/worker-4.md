# Worker 4 — final full-suite R2 failure investigation

Outcome: **recheck with no code change; the failure did not reproduce. No repair was made.**

## Observed facts (attempt 1, `final-full-suite-attempt-1.log`)

- `test/forms/report.test.ts:261` threw `S3Error: We encountered an internal error. Please try again.`, `code: "InternalError"`. It came from `real.get(...)` on
  `test/forms-report-2026-09-28T16-41-21.550Z-87f2b628/reports/2026-09-25T13-00-00.000Z/manifest.json`. This is the server's R2/S3 error response to a GET. It is not a test assertion failure.
- Everything before that line passed: `publishReport` returned an `index.html` URL, the recorded puts were exactly `[index.html, manifest.json]` (manifest last), and the local traces stayed local.
- The second failure, `(unnamed)`, is the `afterAll` check `expect(evidence.remote?.ok).toBe(true)` at `:191`. `evidence.remote` is only set after the failing GET, so this is a consequence of the first failure and not a separate defect.
- Retained evidence for that run is `runs/forms-report-tests-c32c7644-4d78-4ca2-9e70-f474cbcf64be/summary.json`. It shows `remote: null`, `local.ok: true` and `cleanup: {ok: true, deleted: 8, remaining: 0}`, and the privacy scan passed. The temporary test prefix was fully removed by the test's own `finally`, so no bucket state was left behind.
- Scope check: `git diff e2075da -- src test/forms` is empty. The leaf does not touch the storage client, the report writer/publisher, approval or this test. Earlier runs of the same test on this branch passed: `forms-report-tests-9b7ea777…` (15:20Z) and `forms-report-tests-86ce9519…` (16:04Z) both have `remote.ok: true` and `cleanup.ok: true`.

## Classification

The observed failure was a server-side `InternalError` on one real-R2 GET, outside the leaf's changed code. My explanation that it was a transient R2/S3 fault is **unconfirmed**. Only the error code and the passing rerun support it; I have no server-side evidence, and one passing rerun does not prove a root cause. There is no evidence of a leaf defect. I found no reason to change storage/checker code, retry policy or the test.

## Rerun (steps 2–3)

- The configured command ran from the worktree, in the foreground of a background shell, and I waited for it to finish (started 2026-09-28T19:06:26+02:00, finished 19:38:22+02:00):
  `AKROGON_BASE=e2075daad1c5b0dd2438ff61d71e606c47819a39 bash -c ': "${AKROGON_BASE:?AKROGON_BASE is required}" && bun test'`
- **Exit 0.** Summary as printed:
  ```text
   239 pass
   0 fail
   2955 expect() calls
  Ran 239 tests across 22 files. [1916.12s]
  ```
  Attempt 1 reported 240 because the failing `afterAll` hook was counted as an extra `(unnamed)` test: 238 + 2 = 240, and 239 = the same 238 + the real-R2 test.
- The real-R2 test passed in this run. Evidence is `runs/forms-report-tests-e7d6b375-df51-4b21-ac6f-2a9bb856ef54/summary.json`, which shows root `test/forms-report-2026-09-28T17-17-01.930Z-4c3549c3/`, `remote.ok: true`, `manifestLast: true`, `traceUploads: 0`, `cleanup: {ok: true, deleted: 13, remaining: 0}`, `local.ok: true`, and a passing privacy scan.
- Sanitized evidence: the log is `implementation/worker-4-full-suite.log` (34 lines), with the start time in `worker-4-full-suite.log.start` and the exit/finish time in `worker-4-full-suite.exit`. I scanned the log for the credential env values (raw) and for `X-Amz-Signature/Credential=` markers, printing only names/counts: none were found and there were 0 markers. No `.env*` file was read and no credential value was printed.

## Report

Changed files and reasons: none. This was verification only, with no tracked or source edits. The only new files are the untracked log/report files in the leaf `implementation/` directory. The worktree's `git status` is unchanged from the start.
Tests run: `AKROGON_BASE=e2075daad1c5b0dd2438ff61d71e606c47819a39 bash -c ': "${AKROGON_BASE:?AKROGON_BASE is required}" && bun test'`, exit 0, `239 pass / 0 fail / 2955 expect() calls / Ran 239 tests across 22 files [1916.12s]`. The log is `implementation/worker-4-full-suite.log` and the R2 evidence is `runs/forms-report-tests-e7d6b375-df51-4b21-ac6f-2a9bb856ef54/summary.json`.
Known limitations: Attempt 1's failure was an external R2/S3 `InternalError` on one GET that did not reproduce. Confidence that it was transient is moderate and unconfirmed (no server-side data). The same test can fail again for the same external reason in B's final rerun. Its cleanup was proven to still run in that case (0 keys remaining).
Unverified criteria: none for this unit. Root cause of the attempt-1 server `InternalError` is unverifiable from the client side. B still has to rerun the final blocking checks as planned.
