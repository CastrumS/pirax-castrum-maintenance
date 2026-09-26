## 1. Goal

Repair only blocking review findings B-F1 and B-F2 in the shared browser capture path (D3/D4, A2/A5/A9). Worktree `/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/worktrees/visual-health-check`; authoritative leaf `/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/open/site-checks/visual-health-check`. Reviewed head is `f2abb31c4f4e58eeed25188ad121031e0d30b9bc`. This is delegated repair round 1 of 3, not a new feature unit.

## 2. Numbered acceptance criteria

1. Fail-first real browser regressions: initial HTTP 200 page performs `setTimeout(() => location.replace(...), 100)` to a final 404, final 403, and final 200 explicit challenge. Capture's finalUrl/status/critical/challenge classification describes the actual final main document, not the original goto response. Final 404 is captured and health-failing; final 403/challenge is blocked, with no usable screenshot for baseline replacement. Normal page later in the same session still captures successfully. Existing direct redirects, status/health and blocked behavior remain intact.
2. HTTP-only routing currently allows WebSocket `send("mutate")`. Add a real Bun WebSocket fixture that counts received mutation messages; before repair show >0 and after repair zero. Intercept at browser-context scope before any navigated page can connect/send; capture completes on ordinary GET content with an explicit read-only-policy warning, not a fabricated server asset failure. Applies to baseline and check through shared capture. No service-worker or HTTP POST/beacon regression.
3. Preserve literal health/report types, viewport/mask/trace contracts, bounded readiness and scope. Avoid stale response/header races or iframe/subresource statuses overwriting main-document status. If navigation happens during readiness, ensure final status and challenge evidence are reconciled with the captured document. No broad architecture rewrite.
4. Update README's capture/read-only description for repaired final-document tracking and WebSocket policy. Run changed browser/health/command tests and typecheck. Retain real traces and red/green output; no full suite or live/R2 invocation by worker.

## 3. Read-first list

- Authoritative `review-B.md` findings/evidence; `review-A.md` records only unrelated nits, not additional repair criteria.
- `plan.md` D3/D4, review repair Implementation note; `design.md` read-only exclusion; `implementation/report.md` base/evidence.
- `src/capture.ts`, `src/health.ts`, `src/commands/common.ts` caller, `tests/capture.test.ts`, `tests/health.test.ts`, README Capture/masks/health section.
- Existing real repros: `runs/review-B-navigation/probe.ts`, `results.json`; `runs/review-B-websocket/probe.ts`, `results.json`. Copy their real fixture mechanism into durable targeted tests rather than only rerunning ignored scripts.
- `/home/rudi/.pi/agent/skills/implement-issue/ponytail.md`; existing local Bun fixture and Playwright trace pattern in tests/capture.test.ts.

## 4. Change list and needed interfaces

Own expected changes in `src/capture.ts`, `tests/capture.test.ts`, `README.md`. Additional focused health/caller tests only if truly needed to demonstrate repair; return mismatch before substantial scope/interface changes. CaptureSession stays `validateMasks`, `capture`, `close`; CaptureResult stays state/detail/raw health/image/warnings/tracePath. HealthSnapshot status/finalUrl/criticalError/consoleErrors/failedRequests/mixedContent literal must not change.

Main response handling is currently at src/capture.ts response listener and initial goto assignment (~189–210); classification runs before readiness. GET guard uses context.route only (~171). Playwright dependency is installed 1.63.x and provides WebSocket routing; use the existing native API rather than a new dependency. Baseline/check already reuse captureSelection; fix the root shared path.

## 5. Do-not, reasons and exceptions

Never open/print/append/write `.env` or `.env.*`. Credential-free local tests use `bun --no-env-file`. No R2 or production sites, source update actions, forms/mail/discovery/scheduling work. No lifecycle calls, git commits, subagents, user questions, whole-suite/selftest runs or worktree issue artifacts. Ignore optional A nits (baseline-list caching, redundant sort, implicit env-load docs, Playground bind) unless a blocking repair actually requires a change. Do not weaken expected health/GET-only scope or replace real browser/server behavior with mocks. Return mismatch with actual code/evidence rather than changing locked interfaces; only a revised B brief authorizes scope changes. Reasons: narrowly reviewed repair, private credentials, real verification and shared ownership. Exceptions: local fixture server mutations are permitted only to prove blocking; other changes need revised brief.

## 6. Ordered steps

1. Add durable targeted regressions for delayed final responses/challenges and WebSocket messages; run them red before code (criteria 1/2).
2. Repair shared capture implementation, including final-document response and policy observation (1–3); keep contexts/traces finally-cleaned.
3. Run targeted tests green and typecheck; also rerun original ignored review probes if useful. Retain new trace paths and exact outcomes.
4. Update README narrowly, inspect diff for scope, and write complete return (4).

Advisory size ~3–5 files, under 30 turns (at least four per file). A larger real scope returns evidence/mismatch, not a hard cutoff. No need to rerun successful unrelated suites or remote fixtures.

## 7. Commands

No configured changed-test runner; original base `AKROGON_BASE=0663984e0d80887123298bd43d6768e1cc2cbbf9`.

`AKROGON_BASE=0663984e0d80887123298bd43d6768e1cc2cbbf9 bun --no-env-file test tests/capture.test.ts tests/health.test.ts tests/commands.test.ts`

Also `bun --no-env-file run typecheck`, `git diff --check`; focused `--test-name-pattern` and original real review probes permitted. B alone runs full suite and real selftests afterward.

## 8. Done-when, evidence and report

Save authoritative `implementation/worker-6.md` with changed files/reasons, exact red and green outputs, current trace/repro results, limits and unverified criteria. Name how each B finding is resolved. Save console evidence as `implementation/unit-6-*.log` in authoritative leaf, browser artifacts under ignored worktree runs/. Reread this section before returning. Leave changes uncommitted for B.

Changed files and reasons: <paths and why>
Tests run: <commands and results>
Known limitations: <limitations or none known>
Unverified criteria: <criterion and why, or none>
