# Workflow reruns retain earlier artifacts

Date: 2026-10-07

## Case

The re-audit workflow initially used fixed candidate and failure-summary artifact names. GitHub reruns keep the run ID and earlier artifacts while incrementing `run_attempt`. If a second attempt failed before writing a summary, notification could load the first attempt's cleanup-confirmed summary and describe cleanup that had not been established for the second attempt. The publisher also accepted an earlier attempt's candidate when only the run ID matched.

Candidate identity now includes the attempt. Upload/download names and the summary loader select only the trusted current attempt; missing evidence produces an unknown-cleanup fallback. A failed-job-only rerun cannot inherit the prior audit's candidate; recovery requires a fresh main dispatch/audit.

## Evidence

- `tests/reaudit-decide.test.ts` exercises two attempts with an old confirmed summary and no current summary, plus attempt-bound candidate validation.
- `tests/reaudit-publish.test.ts` refuses an earlier attempt's candidate before any push; mutations use a local bare remote and a fake GitHub boundary.
- `tests/reaudit-workflow.test.ts` checks matching upload/download names and real CLI fallback without SMTP credentials.
- The leaf's `implementation/evidence-u4/attempt-red*.log` records the old behavior, including a synthetic publication of an earlier candidate. The final worker check passed516 tests,0fail, exit0 on03612df. This proves local contracts, not live Actions rerun behavior; that remains post-merge.

## Learning

A workflow run ID does not uniquely identify an execution. Bind handoff data and artifact selection to both run and attempt. Never substitute older evidence when the current execution produced none, especially for cleanup or publication state.
