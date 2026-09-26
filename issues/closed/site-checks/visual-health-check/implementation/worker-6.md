# Worker 6 — B-F1/B-F2 repair

Repaired only brief-6's shared capture unit. Changes are uncommitted for B. Section 8 was reread before writing this return.

## Changed files and reasons

- `src/capture.ts`: track the latest main-document request/response across client-side navigation; ignore old-request responses and iframe/subresource statuses when selecting main health. Read final response headers and rendered document health after readiness, with navigation/response identity guards around classification and screenshot. Retain the observed URL during trace shutdown. Register native context-level WebSocket interception before creating the page, close locally with a policy warning, and never connect to the remote peer. Context setup now occurs inside the existing try/finally cleanup.
- `tests/capture.test.ts`: durable real Bun/Chromium delayed-navigation fixtures for final 404, 500/critical, 403, HTML challenge and header-only HTTP-200 challenge; direct redirect, navigation during scrolling, subsequent normal-page continuation with failing iframe/asset, and a real WebSocket server counting connections and mutation messages. Existing screenshot/JSON/trace evidence mechanism is reused.
- `README.md`: narrowly document final-document tracking, navigation-race image rejection and context-level WebSocket policy.

No health/report/session/result interface changed. No dependency, command, viewport, mask, timeout or storage change. Shared `captureSelection` already calls this session for both baseline and check; no caller-specific workaround was added. Optional A nits remain untouched.

## Finding resolution

**B-F1:** `page.goto()` no longer freezes status or challenge classification. Real delayed navigation now yields captured final 404 with an unconditional status failure; captured 500 with rendered critical-error evidence; blocked final 403; and blocked final HTTP-200 challenges identified independently by HTML and response header. Blocked results contain no usable image. Subsequent normal captures succeed in the same session. Failing iframe/subresource statuses remain subresource findings, never main status. Navigation during readiness scrolling also resolves to the final document. Response headers are awaited on the selected response object, with no asynchronous response-listener assignment that could finish out of order. Changes in request/navigation generation or response identity during final observation/screenshot reject the image.

**B-F2:** `context.routeWebSocket` is installed before `newPage`. The handler warns and closes the page-side socket without `connectToServer`. Real server counters changed from **1 connection / 1 mutation** before repair to **0 connections / 0 mutations** after repair. Ordinary GET content still captures, with the explicit WebSocket policy warning and no health findings. Existing POST/beacon and service-worker counters remain passing.

## Tests run and exact outcomes

All Bun invocations used `--no-env-file`. All servers/browser targets were local disposable fixtures.

### Fail-first behavioral regression

Command:

```sh
bun --no-env-file test tests/capture.test.ts --test-name-pattern 'delayed main-document|direct HTTP redirect|real WebSocket'
```

Exit **1**, before any production edit. Full exact output: `unit-6-red.log`.

```text
WebSocket fixture: {"mutations":1,"connections":1} artifacts: /home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/worktrees/visual-health-check/runs/capture-test-2026-09-26T08-52-20.841Z
 1 pass
 11 filtered out
 6 fail
 7 expect() calls
Ran 7 tests across 1 file. [6.16s]
```

All five delayed-navigation cases failed: 404/500/403 kept status 200, and final challenges were captured with images. WebSocket expected 0 mutations, received 1. Direct HTTP redirect passed. The initial matcher dumped PNG bytes in assertion diagnostics; after retaining the exact log, the matcher was narrowed to state/detail/health to keep later failures readable without weakening assertions.

### Focused green and scrolling verification

Same focused command after repair: exit **0**, `unit-6-green-focused.log`:

```text
 7 pass
 11 filtered out
 0 fail
 39 expect() calls
Ran 7 tests across 1 file. [9.96s]
```

`bun --no-env-file test tests/capture.test.ts --test-name-pattern 'readiness scrolling'`: exit **0**, `unit-6-scrolling.log`:

```text
 1 pass
 18 filtered out
 0 fail
 5 expect() calls
Ran 1 test across 1 file. [2.29s]
```

### Required changed browser/health/command tests

```sh
AKROGON_BASE=0663984e0d80887123298bd43d6768e1cc2cbbf9 bun --no-env-file test tests/capture.test.ts tests/health.test.ts tests/commands.test.ts
```

Exit **0**, full exact output: `unit-6-green.log`:

```text
WebSocket fixture: {"mutations":0,"connections":0} artifacts: /home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/worktrees/visual-health-check/runs/capture-test-2026-09-26T08-55-13.710Z
 34 pass
 0 fail
 197 expect() calls
Ran 34 tests across 3 files. [31.83s]
```

Includes both viewports/full-page lazy content, masks/stability, CSS validation, health/console/resource failures, POST/beacon/service-worker blocking, direct and delayed challenges, bounded never-idle/infinite-scroll capture, TLS/mixed content and command preflight/approval-selection tests.

### Typecheck and whitespace

`bun --no-env-file run typecheck`: final exit **0**, `unit-6-typecheck-final.log`:

```text
$ tsc --noEmit
```

An earlier typecheck found local variable `document` shadowing the DOM global in the initializer's type inference, plus Bun's required upgrade options argument. Fixed by renaming the observation variable and supplying `{ data: undefined }`. Original failure retained in `unit-6-typecheck.log`; intermediate successful result in `unit-6-typecheck-green.log`.

`git diff --check`: exit **0**, no output (`unit-6-diff-check.log`). Final diff inspected; only the three owned files are changed.

## Current traces and repro evidence

Paths are relative to the worktree. All traces below and their sibling `.result.json` files exist. Images exist only for captured results. `unit-6-artifacts.log` records the structured red/green result audit and verifies **7 red / 36 final-green nonempty trace archives**.

- Red: `runs/capture-test-2026-09-26T08-52-20.841Z/` — original incorrect final statuses/classification and `websocket-counts.json` with 1/1 counters.
- Final green: `runs/capture-test-2026-09-26T08-55-13.710Z/`:
  - `0-delayedtomissing-desktop.trace.zip`: final 404, captured, status health failure asserted even against itself as baseline.
  - `2-delayedtocritical-desktop.trace.zip`: final 500, captured, criticalError true.
  - `4-delayedtoforbidden-desktop.trace.zip`: final 403, blocked, image null.
  - `6-delayedtochallenge-desktop.trace.zip`: final 200 explicit HTML challenge, blocked, image null.
  - `8-delayedtoheaderonlychallenge-desktop.trace.zip`: final 200 header challenge, blocked, image null.
  - `1/3/5/7/9-normal-desktop.trace.zip` (each numbered file): continuation captured with main status 200 despite iframe 403 and asset 404.
  - `10-redirect-desktop.trace.zip`: direct redirect to captured 404.
  - `11-scrollnavigationtomissing-desktop.trace.zip`: scrolling triggers navigation to captured final 404.
  - `12-scrollnavigationtoheaderonlychallenge-desktop.trace.zip`: scrolling triggers final header challenge, blocked, image null.
  - `13-socketpage-desktop.trace.zip` and `websocket-counts.json`: captured HTTP-200 GET content, zero server connections/messages, policy warning, no health findings.

Original ignored review probes/results were read for grounding and left intact. Their fixture mechanisms are now durable tests, so no redundant rerun overwrote their original red evidence.

## Known limitations

- A navigation that races the final observation/screenshot is conservatively rejected with no usable image; there is no automatic retry loop. A destroyed browser execution context can still return the existing operational capture-error result. Readiness remains bounded and does not guarantee a permanently stable page.
- The screenshot-window navigation guard and deliberately out-of-order response-header completion were inspected, not deterministically fault-injected. Real timer-driven and scroll-driven readiness navigation are exercised.
- Existing remote GET side effects and challenge-vendor limitations remain; WebSocket-driven content may be absent by the required read-only policy.

## Unverified criteria / boundaries

All explicitly requested red/green scenarios and required targeted checks were run. Criterion 3's screenshot-window/out-of-order-header race permutations have the inspection-only limit noted above. Live WordPress/R2 baseline/check/approval, full suite and integration selftests were not invoked, as expressly reserved for B. Shared caller use and blocked-result baseline exclusion were inspected rather than invoking remote storage.

No `.env` or `.env.*` was opened, printed or written. No live sites, R2, lifecycle commands, commits, subagents or user questions. Authoritative report/logs are outside the worktree; browser artifacts remain in ignored `runs/`.
