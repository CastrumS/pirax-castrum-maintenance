# Pending-promise rejection matchers can delay browser I/O

Date: 2026-10-13

## Case

The deployment-folder final gate timed out in a missing-IMAP preflight test on Bun 1.4.3. Its `expect(scanPageForms(...)).rejects.toThrow(...)` wrapped a still-running Playwright scan. Timeout left the test's environment restoration pending; Bun killed dangling browser processes, producing misleading later browser-closed and missing-credential failures.

## Evidence

- `artifacts/deployment-folder/final-tests-attempt2.log`: timeout and downstream failures; `final-browser-recheck.log` reproduced the timeout.
- Unit 7 controlled the same local `/plain` scan: on Bun 1.4.3, 58,993 ms inside the pending-promise matcher versus 757 ms awaited normally; on 1.4.2, 42,732 ms versus 721 ms. Diagnostic scripts/logs are retained in `artifacts/deployment-folder/unit-7-evidence/`; the leaf's `implementation/return-7.md` records verification.
- Settling the promise before applying the unchanged rejection matcher reduced the complete test to about three seconds on both versions. No timeout, assertion, trace or production code was weakened.

## Learning

When an async rejection test is disproportionately slow, measure the operation with and without the matcher before changing application code or timeouts. Let external I/O settle first, then assert the same rejection; a successful resolution must still fail that assertion. Treat later environment/browser failures as possible consequences of the first timeout, not evidence of missing operator credentials. This observation is bounded to the measured Bun versions and matcher path, not a claim that every async matcher is affected.
