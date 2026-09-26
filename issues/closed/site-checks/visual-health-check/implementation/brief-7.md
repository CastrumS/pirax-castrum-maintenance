## 1. Goal

Repair only A-F1 from A's first re-check: failed later main-document navigation must not retain old HTTP 200 (D3/D4, A2/A5). Worktree `/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/worktrees/visual-health-check`; authoritative leaf `/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/open/site-checks/visual-health-check`. Reviewed repair head `2aa4e09bb15feb8046aefdbf7181c4e8cb4b1263`. Round 2 of 3, delegated.

## 2. Numbered acceptance criteria

1. Before production edits, add real browser regressions for an HTTP 200 page delayed-navigating to a closed local port, and an HTTP 200 page delayed-auto-submitting a POST form that the existing read-only guard aborts. Both currently show chrome-error://chromewebdata/ but claim captured/status 200/no health findings. Preserve actual red output.
2. After repair both cases yield `state:'blocked'`, `health.status:null`, no usable image, navigation-failure explanation, and an unconditional missing-response health failure even when compared with the same snapshot. POST never reaches the local server and its policy warning remains. Trace is retained. A subsequent plain page in the same session is captured with its own HTTP 200.
3. The current main response must belong to the current main request; previous response headers/status cannot be paired with a new browser-error document. Explicit browser-error documents are ineligible for captured success. Handle shared capture centrally; preserve successful final 404/500/403/challenge classification, direct redirects, iframe/subresource isolation, masks, bounded waits, existing POST/beacon/WebSocket blocking and normal continuation.
4. Run targeted browser/health/command tests and typecheck; update README narrowly if needed to accurately describe failed-final-navigation semantics. Preserve exact interfaces and do not reopen scope. Return complete evidence and any remaining limits.

## 3. Read-first list

- Authoritative `review-A.md`, specifically Re-check A/A-F1; `plan.md` D3/D4 and round-2 note; `implementation/worker-6.md` and latest report repair section.
- `src/capture.ts`, `src/health.ts`, `src/commands/common.ts`, `src/commands/baseline.ts`, `tests/capture.test.ts`, README capture/health documentation.
- `runs/review-A-recheck/probe.ts` and existing results only for reproduction grounding; do not overwrite review evidence. Add durable tests using the current Bun fixture pattern.
- `/home/rudi/.pi/agent/skills/implement-issue/ponytail.md`.

## 4. Change list and needed interfaces

Expected owned changes: `src/capture.ts`, `tests/capture.test.ts`, and a narrow README statement. No new dependency or interface. Current capture tracks mainRequest/mainResponse, navigationVersion/navigating; response listener assigns only matching request, but the previous mainResponse remains when a newer request fails. Final observation uses it after browser-error navigation settles. Fix response ownership/failure classification rather than patching health evaluation or a single command. HealthSnapshot remains literal status/finalUrl/criticalError/consoleErrors/failedRequests/mixedContent. Captured blocked results have image:null, so existing baseline consumer preserves prior pairs.

## 5. Do-not, reasons and exceptions

Never open/print/append/write `.env` or `.env.*`. Use `bun --no-env-file` for credential-free local tests; no R2 or live sites. No updates/forms/mail/discovery work, subagents, user questions, commits, lifecycle commands, full suite or real selftests. No worktree issue artifacts. Do not weaken existing tests or treat a browser error page as success just because an older response exists. Optional A nits about 204/download/history events are awareness, not mandatory new scope; avoid blanket regressions in the same state but return evidence if meaningful scope expansion is required. Return mismatch instead of changing locked interfaces; only revised B brief authorizes expansion. Reasons: narrow review repair, true read-only behavior, private credentials, preserved acceptance; exception is a disposable local fixture mutation attempt solely to assert it is blocked.

## 6. Ordered steps

1. Derive/add the two durable regressions plus normal continuation/POST counter; run red against current source.
2. Repair current-response correlation and failed-navigation classification; run tests green, retaining traces.
3. Run required targeted suite/typecheck and diff check; update README truthfully if behavior wording needs it.
4. Reread section 8 and write full return.

Advisory ~3 files, under 20 turns; evidence/mismatch rather than silent scope expansion. Preserve the previous repair's passing cases and existing review artifacts.

## 7. Commands

`AKROGON_BASE=0663984e0d80887123298bd43d6768e1cc2cbbf9 bun --no-env-file test tests/capture.test.ts tests/health.test.ts tests/commands.test.ts`

`bun --no-env-file run typecheck`, `git diff --check`; focused test-name filters permitted for red/green. B owns full suite and real WordPress/R2 verification.

## 8. Done-when, evidence and report

Save authoritative `implementation/worker-7.md` and `unit-7-*.log` with exact before/after outputs and trace paths. Explicitly state A-F1 resolution and preserved B-F1/B-F2 behavior; list any unverified permutations. No commits/phase actions. Browser artifacts remain in ignored runs/; pass artifacts only authoritative leaf.

Changed files and reasons: <paths and why>
Tests run: <commands and results>
Known limitations: <limitations or none known>
Unverified criteria: <criterion and why, or none>
