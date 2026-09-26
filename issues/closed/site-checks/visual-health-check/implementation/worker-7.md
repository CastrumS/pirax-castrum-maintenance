# Worker 7 — A-F1 repair

Completed only brief-7's shared capture unit. Section 8 was reread before writing this return. Changes remain uncommitted for the lifecycle owner.

## Changed files and reasons

- `src/capture.ts`: clear the prior main response as soon as a new main-document request starts. Select final headers/status only from a response owned by the current request. Reject a missing current response or explicit Chromium error document before screenshot/classification success, with blocked state, null status, navigation-failure detail and no image. Existing request failure text supplies the explanation when available.
- `tests/capture.test.ts`: two durable real Bun/Chromium regressions for delayed HTTP-200 navigation to a refused local port and delayed POST form submission aborted by the existing read-only guard. Assert missing-response health failure with no baseline and with the identical snapshot as baseline, retained trace, zero server writes, retained POST warning and subsequent plain HTTP-200 capture in the same session. Existing fixture/evidence helpers are reused.
- `README.md`: document failed later navigation/browser-error semantics and rejection of stale HTTP 200.

No dependency or interface changes. No health evaluator or command-specific workaround. Both baseline/check consume the shared capture implementation; the existing baseline guard skips blocked captures without images and therefore preserves previous pairs.

## Finding resolution

**A-F1 resolved:** both real-browser regressions initially returned captured Chrome error documents, status 200, and usable images. After repair both return `state: "blocked"`, `health.status: null`, `image: null`, and `navigation failed` details. Refused navigation reports `net::ERR_CONNECTION_REFUSED`; the POST reports `net::ERR_BLOCKED_BY_CLIENT`. Both produce unconditional missing-response health failures even against their own health snapshot. Main-document failures remain outside the subresource failure list. Traces survive; each following plain page captures its own HTTP 200 with no health findings. The POST never reaches the local server and its policy warning remains.

**B-F1 preserved:** the targeted suite passes delayed final 404, 500/critical, 403, HTML challenge and header-only challenge cases, direct HTTP redirect, scrolling-triggered navigation and normal continuation with failing iframe/asset isolation. Final 404/500 remain captured health failures; 403/challenges remain blocked without images.

**B-F2 preserved:** the real WebSocket server records zero connections and zero mutations, ordinary GET content captures, and the policy warning remains. Existing POST/beacon and service-worker blocking checks pass. Masking, both viewports, lazy content, bounded readiness and TLS/mixed-content checks also pass.

## Tests run

All Bun commands used `--no-env-file`; all browser targets were disposable local fixtures.

1. Before production edits:

   `bun --no-env-file test tests/capture.test.ts --test-name-pattern 'failed later main-document'`

   Exit 1: **0 pass, 19 filtered out, 2 fail, 15 expect() calls**, 3.61s. Exact output is retained in `unit-7-red.log`. Both cases failed on captured/status-200/image-present versus blocked/null/no-image. Zero-write, POST-warning, trace and plain-continuation assertions passed before the failing assertion.

2. Same focused command after repair:

   Exit 0: **2 pass, 19 filtered out, 0 fail, 21 expect() calls**, 3.55s. Exact output: `unit-7-green-focused.log`.

3. Required targeted suite:

   `AKROGON_BASE=0663984e0d80887123298bd43d6768e1cc2cbbf9 bun --no-env-file test tests/capture.test.ts tests/health.test.ts tests/commands.test.ts`

   Exit 0: **36 pass, 0 fail, 218 expect() calls**, 35.23s. Exact output: `unit-7-green.log`.

4. `bun --no-env-file run typecheck`: exit 0, `$ tsc --noEmit`; exact output: `unit-7-typecheck.log`.
5. `git diff --check`: exit 0, no output; `unit-7-diff-check.log` is intentionally empty. Final diff inspected; exactly the three owned files above are modified.

## Retained artifacts

All paths below are relative to the worktree unless specified. `unit-7-artifacts.log` in this authoritative implementation directory records every result's state/status/detail/warnings/image presence and exact trace path, verifies result-referenced traces exist, and verifies **4 red, 4 focused-green and 40 targeted-green nonempty trace archives**.

- Red directory: `runs/capture-test-2026-09-26T09-15-07.609Z/`.
- Focused green: `runs/capture-test-2026-09-26T09-15-39.200Z/`.
- Final targeted green: `runs/capture-test-2026-09-26T09-15-55.461Z/`.

Each of those directories contains:

- `0-delayedunreachable-desktop.trace.zip` and sibling `.result.json`.
- `1-plain-desktop.trace.zip` and sibling `.result.json`.
- `2-delayedpost-desktop.trace.zip` and sibling `.result.json`.
- `3-plain-desktop.trace.zip` and sibling `.result.json`.
- `delayed-unreachable-counts.json` and `delayed-post-counts.json`, each recording `writes: 0`.

Red failure captures have PNGs; green blocked captures have no PNGs. Both plain controls retain PNGs. The final targeted directory also contains the prior navigation/challenge cases and `17-socketpage-desktop.trace.zip`, plus `websocket-counts.json` recording zero mutations/connections. Original A/B review probes and evidence were left unchanged.

## Known limitations

Readiness remains bounded; a navigation racing final observation/screenshot is conservatively rejected without automatic retry, and a destroyed execution context can still return an operational capture error. This repair addresses settled failed final navigation and response ownership, without expanding the existing state model. Optional 204/download/noncommitting-navigation and same-document history-update nits remain outside this unit. Existing remote GET side effects and mixed-content/challenge detection coverage limits remain unchanged.

## Unverified criteria / permutations

No required A-F1 regression or targeted check remains unverified. Delayed DNS/TLS failure permutations were not separately injected; refused-connection and policy-aborted navigation exercise the shared missing-response path, and existing direct TLS failure tests pass. Exact screenshot-window races, artificially reordered header completion, 204/download and history events were not fault-injected. Full suite, live WordPress/R2 verification and integration selftests were expressly reserved for B and were not run. Baseline storage preservation was inspected through the shared caller and existing blocked/image guard, without remote writes.

No `.env` or `.env.*` was opened, printed, appended to or written. No live sites, R2, subagents, user questions, commits or lifecycle calls. Report/logs are only in the authoritative leaf; browser artifacts remain in ignored `runs/`.
