# Review B — visual-health-check

Verdict: **fix**

- Base: `0663984e0d80887123298bd43d6768e1cc2cbbf9`
- Reviewed head: `f2abb31c4f4e58eeed25188ad121031e0d30b9bc`
- Initial blind B review. No peer review was opened and no peer was contacted or awaited.
- Worktree: `/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/worktrees/visual-health-check`

## Fixes

### B-F1 — Track the final main-document response and reclassify after client-side navigation

**Priority:** high. **Surface:** `src/capture.ts:189–210`, with the stale value returned at lines 158–168 and readiness/capture continuing from line 212.

`status` and challenge classification come only from the initial `page.goto()` response, before network-idle/scroll/settling. The response listener deliberately excludes subsequent main-document failures from `failedRequests`. A page that performs a delayed JavaScript navigation therefore produces a screenshot/finalUrl for the new page while retaining the initial HTTP 200 and initial challenge decision.

**Reproduced with the real production capture function and real Chromium:** an initial HTTP 200 page executes `setTimeout(() => location.replace('/final-404'), 100)`. The destination returns 404. A second case uses a final 403.

```text
expected final status 404 -> actual health.status 200
finalUrl .../final-404
actual capture captured; consoleErrors []; failedRequests []; health findings []

expected final status 403 and blocked -> actual health.status 200
finalUrl .../final-403
actual capture captured; consoleErrors []; failedRequests []; health findings []
```

The probe exits **1** on those mismatches. This is not just a missing test: the captured error page is reported as health-clean. Baseline/approval can persist that false health snapshot, allowing an unchanged error page to compare cleanly later. A client-side challenge arriving during readiness can likewise bypass the early classification.

**Contract:** brief done-criteria **2** (404 health detection) and **4** (403/challenge reported blocked); plan **D4**, **A2**, **A5**; README lines **79/84** explicitly promise final HTTP errors and blocked 403 handling. The current documented behavior is false for this scenario.

**Repair expectation:** maintain the current main-document response across navigations and reconcile final status/headers/document identity with the page actually captured. Apply final blocked/challenge classification after relevant readiness/navigation changes rather than freezing it at the first response. Repair the shared capture path used by baseline and check, not just one command. Add real-browser regressions for delayed 200→404 and 200→403/challenge; verify correct final health and blocked state, plus continuation to a later normal site/page.

**Evidence:**

- Reproduce: `bun --no-env-file runs/review-B-navigation/probe.ts`
- Script and structured results: `runs/review-B-navigation/{probe.ts,results.json}`
- Traces: `runs/review-B-navigation/redirect-404.trace.zip`, `redirect-403.trace.zip`
- Authoritative output: `review-B-navigation.log` beside this review.

### B-F2 — The read-only guard allows page-originated WebSocket writes

**Priority:** medium. **Surface:** `src/capture.ts:169–177` and browser-context setup.

The guard intercepts HTTP requests with `context.route`, but does not intercept WebSocket connections/messages. A loaded page can open a WebSocket and send a state-changing payload while capture reports clean health and no policy warning. This is distinct from the documented unavoidable possibility that a remote GET endpoint itself has side effects: the browser actively sends an additional non-GET application message after the handshake.

**Reproduced with a real local Bun WebSocket server and the real production capture function:** the served page sends `"mutate"` on socket open; the server increments its mutation counter on that message.

```json
{"mutations":1,"capture":"captured","warnings":[],"health":{"status":200,"criticalError":false,"consoleErrors":[],"failedRequests":[],"mixedContent":[]}}
```

The probe exits **1** because the server received a mutation during nominally read-only capture. The existing POST/beacon tests do not cover this transport.

**Contract:** locked design exclusion: “nothing that writes to a live site (read-only GETs only)”; plan **D3/A9** read-only browsing. The allowed GET-side-effect limitation does not cover outbound WebSocket messages.

**Repair expectation:** prevent page-originated WebSocket traffic from reaching remote peers in the capture context, registering interception before navigation, and surface a read-only-policy warning consistent with the existing POST/beacon guard. Add a real local WebSocket regression asserting zero received mutation messages while ordinary GET-based capture still completes. Apply it centrally for baseline/check; do not weaken the locked scope or merely document the bypass.

**Evidence:**

- Reproduce: `bun --no-env-file runs/review-B-websocket/probe.ts`
- Script and structured results: `runs/review-B-websocket/{probe.ts,results.json}`
- Trace: `runs/review-B-websocket/capture.trace.zip`
- Authoritative output: `review-B-websocket.log` beside this review.

## Review coverage and verification

Grounded in the authoritative design, plan including the Node implementation note, implementation report and check skill's ponytail guidance. These existing same-thread artifacts were retained as context rather than redundantly reopened. Reviewed the changed capture/health/comparison, command/approval, report/manifest/writer, fixtures/selftest, dependency/types and affected README contracts. The configured grounding is `none`; no AREA.md changed, so no AREA path audit is applicable. No agent doc was introduced.

Reviewed the documented operator flows, final-health promises, private report/approval/retention semantics and selftest instructions. Documentation changed and was inspected; this is not a “no documented behavior changed” review. B-F1 identifies a reproducible contradiction. Other documented operational limitations, including nontransactional writes, global retention, Node compatibility and uninduced storage outages, are explicit rather than disguised as tested guarantees.

Checked the new lesson against the implementation failure/repair evidence already inspected in this thread: Buffer transfer did not establish correct plugin installation; exact text readback plus a served fixture marker now does. The lesson remains narrowly tied to that observed Playground bridge. `learnings/LESSONS.md` was not used as review input.

Existing unchanged-head evidence remains valid:

- `bun test`: **89 pass, 0 fail, 737 assertions**, 9 files.
- `bun run typecheck`: pass.
- `bun run store:selftest`: pass, real test prefix cleaned.
- `mise exec node@24 -- bun run visual:selftest`: **15 scenarios, 44 command invocations**, pass; 198 remaining test objects deleted and zero left. B previously checked all recorded final report/trace paths.
- Evidence logs are `implementation/final-{tests,typecheck,store-selftest,visual-selftest}.log`; the final real integration summary is `runs/visual-selftest-2026-09-25T17-13-50.363Z/summary.json`.

Those suites were not rerun without a change. Instead this review ran the two specific missing-edge probes above; both use real local servers and real Chromium with saved traces, not mocked capture/authentication/storage. They expose gaps in the existing browser tests despite the prior green suite. The implementation's real R2/WordPress evidence and exact approval checks are substantive; no blanket request to replace them is made.

No configured checks/advisories exist. No new full-suite failure is alleged. The two concrete behavioral defects, not the admitted lack of forced R2 outage tests, determine `fix`. No additional Nits are raised.

## Boundaries

No tracked code/document was changed during review. Reproduction scripts/results/traces are under gitignored `runs/`; this review and console logs are under the authoritative leaf. No env file was opened/printed/modified, no credential values were requested, and the review probes needed no R2 access or live-site mutations. `git status --short` remains clean. No human-only blocker exists.
