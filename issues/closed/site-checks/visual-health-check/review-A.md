# Review A — visual-health-check (check.review, initial)

- Base: `0663984e0d80887123298bd43d6768e1cc2cbbf9`
- Reviewed head: `f2abb31c4f4e58eeed25188ad121031e0d30b9bc` (worktree clean)
- Debate: `no` — no positions/rebuttal artifacts expected. Reviewed blind (peer review not read).
- Inputs: `akrogon config` (checks `{}`, advisory `[]`), plan.md incl. implementation notes, design.md, implementation/report.md, ponytail.md, full diff of `src/`, `test/`, `scripts/`, README, learnings.

## Verification evidence (rerun by A)

- `bun --no-env-file test`: **89 pass, 0 fail**, 737 expect() calls (matches report).
- `bun run typecheck`: `tsc --noEmit` exit 0.
- `store:selftest` / `visual:selftest` not rerun (no code change since B's final run, no specific concern). Retained evidence inspected instead: `runs/visual-selftest-2026-09-25T17-13-50.363Z/summary.json` has 0 failed checks and cleanup `{"remote":true,"remaining":0,"deleted":198,"wordpress":true,"https":true,"errors":[]}`; the changed-alpha report `commands/2026-09-25T17-14-13.507Z/index.html` and its desktop trace exist.
- Lesson/history evidence paths (`runs/visual-selftest-2026-09-25T16-44-41.594Z/summary.json`, `…16-56-31.445Z/summary.json`, its report, and leaf `implementation/unit-4-integration-third.log`, `unit-4-validation.log`) all exist, supporting the lesson claim.
- No `AREA.md` in the diff; `grounding: none`. No `.env*` opened.

## Plan decisions traced against code

- D1/D10: `parseArgs`/`selectSites`/`dispatch` (`src/commands/common.ts`) — arg count, `approve all`, unknown slug, page membership, sites config and `readR2Config()` all precede browser/storage; empty `all` returns 0 before R2; config errors → 2, others → 1; `safeError` never surfaces raw SDK text. Entrypoints only set `process.exitCode`.
- D3: fresh context per page/viewport, fixed viewports, DSF 1, reduced motion, SW blocked, non-GET aborted and recorded as warnings, bounded goto/idle/scroll/settle, freeze CSS + `animations: "disabled"`, CSS-only masks with invalid → `MaskSelectorError`, unmatched → warning, PNG dims from IHDR, trace saved in `finally`.
- D4: health shape matches design literal; HTTP ≥400/null status, critical phrase, mixed content unconditional; console/request known→warning, new→failure, removed absent; main document excluded from `failedRequests`; mixed content only for final HTTPS doc, via request events + console diagnostics + DOM attribute sweep.
- D5: baseline writes only complete captured pairs; check lists the prefix (absence vs. operational error), missing either object → `missing-baseline`, corrupt → `error`; check never writes baselines.
- D6: threshold 0.1, strict `>` allowance, dimension change always `changed` with padded magenta diff, decode failures → `error`.
- D7/D8: `FormResult` literal matches design; orthogonal capture/visual/health fields; self-contained HTML with CSP `default-src 'none'; img-src data:`; all site text escaped; manifest uploaded last; `pruneReports(10)` then 604800 s presign; failures → exit 1 with local path kept.
- D9: newest completed manifest containing the site, invalid manifest is an error, URL equality, whole-selection read/decode/dimension/health validation before first write, keys derived from validated identity (not manifest paths), exact bytes promoted.

## Documentation

README "Commands", "Capture, masks and health", "Storage", "Private reports and local evidence", "Visual selftest" describe the changed behavior; spot-checked claims (empty `all` → 0 without R2/browser, `--sites` before/after positionals, exit-code mapping, manifest-last, trace exclusion from publication, approve preflight/no-fallback) match the code. No wrong claim or missing path found.

## Findings

No Fix.

### Nit 1 — repeated baseline prefix listing
`src/commands/check.ts:100` lists all of `baselines/<slug>/<viewport>/` once per page×viewport, so a site with N pages does 2N full listings each returning ~2N keys. Correct, and fine at the operator's tens of pages; listing once per site/viewport would be the lazier shape. Not a defect.

### Nit 2 — redundant sort
`newestSiteCheck` (`src/commands/approve.ts:17`) re-sorts IDs that `completedRunIds` already returns sorted descending. Harmless; kept because the exported seam accepts arbitrary input.

### Nit 3 — production scripts rely on Bun's implicit `.env` load
`package.json` `baseline`/`check`/`approve` run `bun src/commands/*.ts` without `--env-file=.env`, while the selftests pass it explicitly. Bun auto-loads `.env` from the cwd, so this works; README does not state the reliance. Documentation-only clarity nit.

### Nit 4 — Playground fixture briefly binds all interfaces
`test/wp/playground.ts` rebinds to 127.0.0.1 only after `runCLI` has started listening; documented in README Limitations and report. Test-only, disposable instance; acceptable as recorded.

## Verdict

`nits`

---

# Re-check A after check.fix (round 1)

- Repair diff: `f2abb31c4f4e58eeed25188ad121031e0d30b9bc..2aa4e09bb15feb8046aefdbf7181c4e8cb4b1263` (`README.md`, `src/capture.ts`, `tests/capture.test.ts`); worktree clean.
- Findings under repair: B-F1 (final main-document status/challenge after client-side navigation), B-F2 (WebSocket writes).

## Verification

- `bun --no-env-file test`: **97 pass, 0 fail**, 781 expect() calls. `bun run typecheck`: pass.
- B's original probes rerun against the repaired head: `runs/review-B-navigation/probe.ts` exit **0** (final 404 / 403 now reported); `runs/review-B-websocket/probe.ts` exit **0** (no mutation reaches the server).
- New probe from A, real Bun server + production `openCaptureSession().capture`: `runs/review-A-recheck/probe.ts`, output `runs/review-A-recheck/{probe.log,results.json}`, traces `runs/review-A-recheck/{unreachable,autopost,plain}.trace.zip`.

## Confirmations

- **B-F2 — confirmed fixed.** `context.routeWebSocket` is installed before `newPage()`, closes without `connectToServer`, and adds a policy warning. B's probe passes; the README section matches.
- **B-F1 — confirmed fixed for final HTTP responses** (delayed 200→404 / 200→403 / challenge cases, the probe and the new regressions). **Not fixed for a failed final navigation. See A-F1.**

## Fix

### A-F1 — B-F1 incomplete: a failed later main-document navigation is captured as a clean HTTP 200

`src/capture.ts` sets `mainRequest` on every main-frame navigation request but updates `mainResponse` only when that request gets a response. If the latest navigation fails (connection refused/DNS/TLS, or a navigation aborted by the read-only policy), `mainResponse` still holds the **previous** document's response. The final observation then pairs the old status and headers with the Chrome error page actually shown. `changed()` does not detect this when the failure has already settled before readiness ends: `mainResponse === response` and `framenavigated` to the error page has already fired.

Reproduced (`runs/review-A-recheck/results.json`):

```text
unreachable: 200 page, setTimeout(() => location.replace('http://127.0.0.1:<closed port>/gone'), 100)
  -> state "captured", health.status 200, finalUrl "chrome-error://chromewebdata/", findings []
autopost:    200 page auto-submits a POST form (aborted by the read-only policy)
  -> state "captured", health.status 200, finalUrl "chrome-error://chromewebdata/", findings [], warning only
```

A browser error page is screenshotted and reported health-clean. `baseline`/`approve` can store it as the accepted state, and a later identical failure then compares clean. This breaks the B-F1 repair expectation ("reconcile final status/headers/document identity with the page actually captured"), plan D4 ("a page that cannot navigate at all … is `blocked`"; missing main-document response always fails), and the new README sentence ("it reads the current document's status … before taking the screenshot"), which is false here.

Expected: when the current main request has no response (`mainResponse?.request() !== mainRequest`), or the final document is a browser error page, do not report the earlier status. Report `status: null` and classify the capture as blocked (navigation failed) with no usable image. Add a real-browser regression for a delayed navigation to a refused port. A policy-aborted POST navigation should also not yield a clean `captured` result.

## Nits

- **Nit A-N1.** `navigating` is set on every main-frame navigation request and cleared only by `framenavigated`. A main-frame request that never commits (for example 204 or a download) could leave it `true`, so every capture of that page reports "main document changed during capture". Speculative; the A-F1 repair will likely touch the same state.
- **Nit A-N2.** Playwright emits `framenavigated` for same-document history updates. A slider or scrollspy calling `history.replaceState` while the screenshot is taken would bump `navigationVersion` and give a blocked "retry" result on every run for such a page. Not reproduced; noted for awareness.
- Earlier Nits 1–4 unchanged.

## Verdict

`fix`: A-F1, B-F1 not fully repaired.

---

# Re-check A after check.fix (round 2)

- Repair diff: `2aa4e09bb15feb8046aefdbf7181c4e8cb4b1263..9140cdd9647d14e91ebd0565b5f1ef1ee55fff07` (`README.md`, `src/capture.ts`, `tests/capture.test.ts`); worktree clean.
- Finding under repair: A-F1.

## Verification

- A's probe rerun (`runs/review-A-recheck/probe.ts`, `results.json`, `probe-round2.log`):
  - `unreachable` → `blocked`, `navigation failed: net::ERR_CONNECTION_REFUSED`, status `null`, finalUrl `chrome-error://chromewebdata/`, 1 failure finding.
  - `autopost` → `blocked`, `navigation failed: net::ERR_BLOCKED_BY_CLIENT`, status `null`, 1 failure finding.
  - `plain` control → `captured`, 200, 0 findings.
- B's probes: `runs/review-B-navigation/probe.ts` exit 0; `runs/review-B-websocket/probe.ts` exit 0.
- `bun --no-env-file test`: **99 pass, 0 fail**, 802 expect() calls. `bun run typecheck`: pass.
- Real selftests not rerun by A. B's round-2 logs (`implementation/repair-2-{store,visual}-selftest.log`) show both passing with empty cleanup, and the change is local to capture classification.

## Confirmations

- **A-F1 — confirmed fixed.** Every main-frame request now resets `mainResponse`. Only a response belonging to the current `mainRequest` is used. A missing response or a `chrome-error:` document returns `blocked` with status `null` and no image, before any screenshot. The regressions are real Chromium tests (closed port, and a POST aborted by the policy), with zero server writes and a following normal page still captured. The README sentence now matches the behavior.
- **B-F1, B-F2 — remain fixed** (probes and suite above).
- The repair introduced no new defect.

## Nits

- A-N1 still stands (it came in with round 1, not this repair): a main-frame request that never commits, such as a 204 response or a download, leaves `navigating` true. That page would then report "main document changed during capture; retry" on every run. Not a correctness failure: the capture is reported as blocked, never as clean.
- A-N2 and earlier Nits 1–4 unchanged.

## Verdict

`nits`

---

# Merge A

- Fetched `origin`; `origin/main` = `0663984e0d80887123298bd43d6768e1cc2cbbf9`, already an ancestor of the reviewed head `9140cdd9647d14e91ebd0565b5f1ef1ee55fff07`. No rebase and no conflicts; the head is unchanged.
- Configured `checks`: `{}` (none); `advisory`: `[]`. Code and integration are unchanged since A's round-2 re-check on this exact head: `bun --no-env-file test` 99 pass / 0 fail, typecheck pass. That run is reused.
- No held Nit is a reusable lesson. No learnings added.
