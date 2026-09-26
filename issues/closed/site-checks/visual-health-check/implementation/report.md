# Implementation report — visual-health-check

## Result and revision

Implemented and committed on `visual-health-check`.

- Base: `0663984e0d80887123298bd43d6768e1cc2cbbf9`
- Committed head: `f2abb31c4f4e58eeed25188ad121031e0d30b9bc`
- Commit: `Add visual and health checks with R2 reports and approval`
- Working tree clean after commit. No file under `issues/` is in this commit; briefs, returns and this report are in the authoritative leaf outside the worktree.
- Effective config had `implement: subagents`, no configured checks/advisories, and the above AKROGON_BASE. B nevertheless ran all four plan/design verification commands, with the documented compatible Node runtime for Playground.
- All six brief done-criteria are exercised by passing automated verification. Extended plan coverage and remaining limitations are distinguished below; this is not a claim that artificial R2 network faults were induced.

## Changed files and reasons

- `package.json` — baseline/check/approve/visual:selftest scripts and browser/image/Playground dependencies.
- `bun.lock` — resolved dependencies, including exact Playground 3.1.55 packages.
- `tsconfig.json` — DOM types and fixture TypeScript included, strictness retained.
- `src/capture.ts` — fixed viewports, full-page Chromium screenshots, bounded lazy loading/readiness, CSS masks, GET-only request policy, blocked classification, raw health observation and traces.
- `src/health.ts` — validated raw health snapshots and baseline-relative warning/failure evaluation.
- `src/compare.ts` — threshold-0.1 pixelmatch, strict ratio allowance and dimension-change padded diffs.
- `src/report/model.ts` — RunReport/SiteResult/PageResult/ViewportResult and exact optional FormResult contract.
- `src/report/html.ts` — escaped self-contained report with baseline/actual/diff, health/dimensions and optional Forms column; no forms execution.
- `src/report/manifest.ts` — runtime manifest, canonical artifact identity and all-pair approval validation.
- `src/report/writer.ts` — local artifacts, typed R2 uploads, manifest-last completion, retention and 604800-second presign.
- `src/commands/common.ts` — usage/config preflight, injected real Store seam, sequential capture and 0/1/2 mapping.
- `src/commands/baseline.ts` — explicit complete PNG/raw-health baseline writes; blocked/incomplete captures preserve old pairs.
- `src/commands/check.ts` — actual/baseline comparison, independent findings, missing/corrupt baseline handling and failing-run publication.
- `src/commands/approve.ts` — latest completed remote site-check selection, no stale fallback/recapture, exact PNG/health promotion after whole-selection preflight.
- `tests/health.test.ts` — raw schema/deduplication, known/new/removed findings and unconditional failures.
- `tests/compare.test.ts` — tolerance boundaries, fixed threshold, dimension changes and corrupt PNGs.
- `tests/capture.test.ts` — real Chromium local fixtures, masks, resource/JS/transport health, GET-only policy, blocked/timeout/TLS/mixed-content and trace evidence.
- `tests/report.test.ts` — safe report/model/manifest/approval behavior, overflow regression and real local report rendering.
- `tests/commands.test.ts` — usage/config/import/selection/approval preflight without remote side effects.
- `scripts/visual-selftest.ts` — real WordPress/R2 command scenarios, subprocess dispatch, private HTML rendering, retention and finally cleanup.
- `test/wp/blueprint.json` — WordPress 6.8.3/PHP 8.3/WP-CLI 2.12.0 deterministic fixture bootstrap.
- `test/wp/playground.ts` — Node same-instance Playground/WP-CLI bridge, verified plugin installation and bounded harness-controlled teardown.
- `test/wp/fixture-plugin.php` — actual WP content rendering and isolated health/random-number/dimension/block/read-only cases. B added numeric text to the already-tested large random-color regions to match the brief's literal random-number fixture; final real selftest includes that change.
- `test/fixtures/https.ts` — disposable self-signed Bun HTTPS plus HTTP-resource mixed-content case.
- `test/fixtures/cli.ts` — test-only subprocess adapter using production dispatch and a validated real test-scoped Store.
- `README.md` — current setup, commands, health/approval/report semantics, selftests, runtime selection and real limitations.
- `learnings/LESSONS.md` — one active factual lesson link.
- `learnings/history/2026-09-25-visual-health-check.md` — evidenced Playground bridge fixture-installation failure and semantic readback/served-marker learning.

Unchanged: existing site/env/Store implementations, production site lists, bunfig discovery exclusion, gitignore, lifecycle configuration and all env files. No live WordPress site, production baseline/report prefix, form/mail/update or schedule was mutated by verification.

## Delegation and red/green evidence

Workers ran sequentially in this worktree; individual briefs/returns are in this directory.

1. `brief-1.md`: capture/health/compare/contracts. The first provider reached its weekly quota before a return. Its landed edits were retained, not discarded or rerun wholesale. `worker-1-process.json` records the provider failure.
2. `brief-2.md` / `worker-2.md`: remainder only. B's targeted validation found an exact-membership test with random-port ordering: **23 pass, 1 fail** (`unit-1-validation.log`). The expected list is now URL-sorted without changing production normalization; **24 pass, 0 fail**, typecheck pass. Debug timing output removed.
3. `brief-3.md` / `worker-3.md`: commands and private report. Tests were written first; red was missing implementation imports (**0 pass, 2 fail, 2 errors**, `unit-3-red.log`). Green **16 pass**, typecheck, real local Chromium report/trace with all six images decoded and no external requests. This is honest missing-module red evidence, not claimed pre-existing behavioral regression evidence.
4. `brief-4.md` / `worker-4.md`: real integration and concrete overflow repair. Fail-first PNG regression showed the validator wrongly required the screenshot width to equal viewport width. **16 pass, 1 fail** -> **17 pass**, retaining validation against actual recorded dimensions. Real overflowing WordPress capture/approval/check passed. Integration failures exposed Node 26 native compatibility, WP-CLI download/stdout issues and malformed Buffer-transferred plugin bytes; deterministic installation/readback/served-marker assertions repaired the fixture rather than weakening health expectations. Every failed real run cleaned its isolated R2 root.
5. `brief-5.md` / `worker-5.md`: documentation and evidenced lesson. **8 targeted command tests pass**, docs/script/path audit and diff whitespace pass. No fabricated red test for documentation.

All worker returns contain changed paths/reasons, executed tests, artifact paths, limitations and unverified criteria. B inspected relevant production surfaces and the actual changed-alpha/stable-beta rendered report before final validation.

## B's final checks — actual results

No code repair followed these successful checks, and the full suite was not needlessly repeated. Full logs are retained alongside this report.

### Full suite

Command: `bun test`

```text
 89 pass
 0 fail
 737 expect() calls
Ran 89 tests across 9 files. [19.25s]
Full suite exit: 0
```

Log: `final-tests.log`. Includes the original 48 foundation tests, actual browser fixtures, Forms/hostile-text report rendering and the worktree-discovery exclusion regression.

### Typecheck

Command: `bun run typecheck`

```text
$ tsc --noEmit
Typecheck exit: 0
```

Log: `final-typecheck.log`.

### Real storage selftest

Command: `bun run store:selftest`

```text
ok   binary roundtrip {"bytes":64}
ok   file roundtrip {"bytes":256}
ok   list {"keys":2}
ok   signed GET {"status":200,"invalidExpiriesRejected":5}
ok   missing get rejects
ok   service honours small page size {"objects":46,"pageSize":5,"minPages":10}
ok   invalid keep rejects and deletes nothing {"invalidKeepsRejected":4,"objects":46}
ok   prune 12 runs to 10 {"runs":10,"objects":40}
ok   no-op when count <= keep {"objects":40}
ok   default keep is 10 {"runs":10,"objects":40}
ok   keep 0 removes all recognized runs {"runs":0,"objects":10}
ok   cleanup test/2026-09-25T17-13-06.803Z-4f215dcc/ (deleted 10)
PASS artifact runs/store-selftest-2026-09-25T17-13-06.803Z.json
Storage selftest exit: 0
```

Log: `final-store-selftest.log`.

### Real visual/health end-to-end selftest

Command: `mise exec node@24 -- bun run visual:selftest`

This selects installed Node 24.21.0 for the Node-only Playground fixture without altering global Node; the package script remains `bun --env-file=.env scripts/visual-selftest.ts`. The runtime constraint is recorded in plan Implementation notes and README. Production commands do not require Node.

```text
ok   R2 credentials available by required names
ok   real Node Playground boots and seeds WordPress via same-instance WP-CLI
ok   baseline both widths and exact real R2 PNG/health bytes
ok   same-instance WP-CLI update changes exactly alpha at both widths
ok   page approval preserves beta; new check and CLI pass
ok   remote-only whole-site approval ignores newer unrelated and partial runs
ok   approval negative preflight leaves all real baselines unchanged
ok   isolated WordPress health failures and baseline-relative warnings
ok   site/page mask union stabilizes large random regions; no mask fails
ok   height and horizontal overflow preserve dimensions and approve correctly
ok   blocked unreachable/403/challenge sites continue to normal site
ok   GET-only browser policy prevents POST and beacon reaching WordPress
ok   self-signed HTTPS blocked by default; internal fixture reports mixed content
ok   CLI configuration errors and missing baseline leave baseline bytes intact
ok   real check prunes more than ten report runs; baselines unchanged
visual:selftest PASS; cleanup empty
Visual selftest exit: 0
```

Log: `final-visual-selftest.log`. Final run: **15 scenarios, 44 command invocations**; expected inner failures are asserted, not overall failures. Real GET-only request counters and HTTP HTML/MIME/image decoding checks are included. Every normal storage mutation/authentication uses the actual bucket; the put-count instrumentation forwards real operations unchanged.

B verified summary success and all recorded artifacts exist: **21 reports, 116 capture traces**. Cleanup:

```json
{"remote":true,"remaining":0,"deleted":198,"wordpress":true,"https":true,"errors":[]}
```

`git diff --check` passed, no fixture processes remained, and the committed worktree is clean.

## Retained artifacts

All paths below are relative to the worktree `/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/worktrees/visual-health-check` and remain gitignored.

- Final selftest summary: `runs/visual-selftest-2026-09-25T17-13-50.363Z/summary.json`
- B's summary/artifact existence audit: `runs/visual-selftest-2026-09-25T17-13-50.363Z/b-artifact-verification.json`
- Exact changed-alpha/stable-beta report: `runs/visual-selftest-2026-09-25T17-13-50.363Z/commands/2026-09-25T17-14-13.507Z/index.html`
- Its desktop trace: `runs/visual-selftest-2026-09-25T17-13-50.363Z/commands/2026-09-25T17-14-13.507Z/traces/wordpress/desktop/alpha.trace.zip`
- Its mobile trace: `runs/visual-selftest-2026-09-25T17-13-50.363Z/commands/2026-09-25T17-14-13.507Z/traces/wordpress/mobile/alpha.trace.zip`
- Its real-presigned-response rendering evidence: sibling `remote-report.png`, `remote-report.trace.zip`, `remote-render.json` (HTTP response body rendered; signed URL never navigated/traced).
- Retention and GET-only evidence: `runs/visual-selftest-2026-09-25T17-13-50.363Z/retention.json` and `get-only-counts.json`.
- Storage summary: `runs/store-selftest-2026-09-25T17-13-06.803Z.json`.
- Final full-suite Forms/hostile-content report: `runs/2026-09-25T17-12-59.405Z/index.html` and its `report-browser.trace.zip`.

Other scenario-specific report/trace paths are enumerated in the final summary. No signed bearer links or credentials are reproduced here. Four design-named credentials were checked by name and were present/nonblank; no env file was opened, printed or modified.

## Acceptance coverage and remaining limitations

- Brief 1–6: real WP-CLI content mutation; exactly one changed page at both widths; stable controls; each specified health condition; known diagnostic warnings; masks; height/blocked continuation; exact approve then pass; real last-ten retention/cleanup; exits and regression/typecheck all pass.
- Plan A1–A6, A8–A11: covered across targeted pure/helper tests, real local Chromium fixtures and real R2/WordPress scenarios. CLI integration uses a subprocess adapter to the same production dispatch with a real scoped Store; deliberately no production bucket/site-list invocation just to prove a script alias.
- Plan A7: actual private HTML 200/MIME, inline image decoding, escaped/Forms rendering, manifest completion selection, retention and cleanup are verified. **Deliberately induced R2 upload/list/prune/network outages and partial-write recovery are not verified**; exception handling was inspected but is not claimed as remote fault-injection evidence. Baseline/approval and retention remain nontransactional, single-operator operations.
- The capture suite verifies bounded never-idle/infinite-scroll behavior and corrupt/ratio/dimension cases locally; the integration harness does not redundantly run every pure negative against WordPress/R2.
- Dynamic content, fonts/browser drift and unsupported challenge vendors can still yield differences/blocked captures; no bypass/authentication flow is implemented. Mixed-content fallback does not statically scan every CSS/import/script construction.
- Full-page images, embedded HTML and whole-set approval consume memory. Local reports/traces retain potentially sensitive content and have no automatic local cleanup. GET-only HTTP routing cannot prevent side effects from a remote GET endpoint.
- Global last-ten retention may prune a quiet site's approval source and invalidate a signed report before seven days. Fresh check then explicit approval is required; no stale-source fallback.
- Playground fixtures need compatible Node 24 plus external pinned WordPress/WP-CLI/dependency downloads. Upstream initially binds all interfaces; the bridge immediately rebinds to loopback before readiness, with a short upstream startup interval remaining. No live production-site or broader-version/token-scope claim is made.
- No forms execution/mail/updates/scheduling is implemented; the report extension slot only is provided as locked scope requires.

No human-only blocker remains. Ready for independent A and B review of the committed head.

## Repair round 1 — 2026-09-26

- Before / reviewed head: `f2abb31c4f4e58eeed25188ad121031e0d30b9bc`
- After / repaired head: `2aa4e09bb15feb8046aefdbf7181c4e8cb4b1263`
- Commit: `Fix final navigation health and block WebSocket writes`
- Blocking inputs: **B-F1** and **B-F2** from `review-B.md`. A reported no Fix; unrelated optional A nits were deliberately not folded into this repair.
- Execution: sequential delegated `brief-6.md` / `worker-6.md`, in configured repair round 1 of 3. Plan Implementation notes record the two defects and their scope. No locked criterion was weakened.

### Changes and finding resolution

Only three tracked files changed:

- `src/capture.ts`: track main-document request/response identity through HTTP and client-side navigation. Read final response headers, URL, critical-error text and challenge evidence after readiness. Iframe/asset responses cannot overwrite main status; asynchronous headers are read from the selected response, not assigned out of order by a listener. A navigation race during final observation/screenshot discards usable pixels. Snapshot URL is not reread after trace shutdown. Install native context WebSocket interception before page creation; close locally without connecting to the remote server, with a policy warning. Both baseline and check use this shared path.
- `tests/capture.test.ts`: durable real-server/Chromium regressions for delayed final 404, 500/critical error, 403, HTML challenge, header-only challenge; direct redirect and scrolling-triggered navigation; continuation with a normal page whose failing iframe/asset must not corrupt main status; real WebSocket connection/message counters. Existing masks, readiness, HTTP POST/beacon and service-worker tests remain passing.
- `README.md`: accurate final-document tracking, conservative navigation-race outcomes and WebSocket policy description. B made one final wording correction so destroyed-execution-context capture errors are not falsely promised to be classified blocked.

**B-F1 resolved:** delayed final 404 is captured with HTTP 404 and an unconditional health failure; 403 and both final HTTP-200 challenge forms are blocked without usable images. Critical text/status and later normal capture are verified. No command-specific workaround or health schema change.

**B-F2 resolved:** before repair the real WebSocket fixture received 1 connection and 1 mutation; after repair it receives **0 connections and 0 mutations**, with ordinary GET content captured, an explicit policy warning and no fabricated server failure.

### Fail-first and worker evidence

`unit-6-red.log` preserves actual fail-first results before production edits:

```text
WebSocket fixture: {"mutations":1,"connections":1}
 1 pass
 11 filtered out
 6 fail
 7 expect() calls
Ran 7 tests across 1 file. [6.16s]
```

All five delayed-navigation cases and the WebSocket mutation assertion failed. The direct HTTP redirect control passed. The initial matcher printed PNG bytes; the worker narrowed diagnostic matching to state/detail/health afterward without weakening acceptance.

`AKROGON_BASE=0663984e0d80887123298bd43d6768e1cc2cbbf9 bun --no-env-file test tests/capture.test.ts tests/health.test.ts tests/commands.test.ts` then passed **34 tests**, 197 assertions (`unit-6-green.log`); typecheck passed. Full worker details, focused runs and artifact inventory are in `worker-6.md` and `unit-6-*.log`.

### B's final verification on the repaired code

All four R2 names were checked again via `bun --env-file=.env` and reported present without printing values. B inspected the repair diff and worker return, then ran the full suite once and all required plan verification commands. No source repair followed these successful checks.

`bun test` (`repair-1-tests.log`):

```text
WebSocket fixture: {"mutations":0,"connections":0}
 97 pass
 0 fail
 781 expect() calls
Ran 97 tests across 9 files. [32.20s]
Full suite exit: 0
```

`bun run typecheck` (`repair-1-typecheck.log`):

```text
$ tsc --noEmit
Typecheck exit: 0
```

`bun run store:selftest` (`repair-1-store-selftest.log`): all binary/file/list/signed-GET/missing-key/pagination/retention assertions passed against the real bucket.

```text
ok   cleanup test/2026-09-26T09-00-57.550Z-8242509d/ (deleted 10)
PASS artifact runs/store-selftest-2026-09-26T09-00-57.550Z.json
Storage selftest exit: 0
```

`mise exec node@24 -- bun run visual:selftest` (`repair-1-visual-selftest.log`): all 15 real WordPress/R2 scenarios passed, 44 command invocations, including baseline/check/approve fidelity, health, masks, dimensions, blocked continuation, GET-only HTTP policy, HTTPS mixed content, private report rendering and retention.

```text
ok   real check prunes more than ten report runs; baselines unchanged
visual:selftest PASS; cleanup empty
Visual selftest exit: 0
```

B audited that all recorded report/trace paths exist: **21 reports, 116 capture traces**. Remote cleanup deleted **198** remaining objects, confirmed **0** remaining, and stopped both fixture servers with no cleanup errors. No fixture process remained. `git diff --check` passed; repaired commit has a clean worktree and no issue artifact changes.

### Current repair artifacts

Paths relative to the worktree:

- Full-suite repaired capture evidence: `runs/capture-test-2026-09-26T09-00-10.993Z/`.
- Final 404 trace/result: `0-delayedtomissing-desktop.trace.zip` and sibling `.result.json` in that directory.
- Final 403 trace/result: `4-delayedtoforbidden-desktop.trace.zip` and sibling `.result.json`.
- HTML/header challenge traces: `6-delayedtochallenge-desktop.trace.zip`, `8-delayedtoheaderonlychallenge-desktop.trace.zip`.
- WebSocket trace and counts: `13-socketpage-desktop.trace.zip`, `websocket-counts.json`.
- Full-suite report/Forms rendering: `runs/2026-09-26T09-00-42.025Z/index.html` and `report-browser.trace.zip`.
- Real integration summary: `runs/visual-selftest-2026-09-26T09-01-37.320Z/summary.json`.
- B's current artifact/cleanup audit: `runs/visual-selftest-2026-09-26T09-01-37.320Z/repair-1-artifact-verification.json`.
- Changed-alpha/stable-beta report: `runs/visual-selftest-2026-09-26T09-01-37.320Z/commands/2026-09-26T09-02-01.089Z/index.html`; its sibling remote-render evidence and `traces/wordpress/{desktop,mobile}/alpha.trace.zip` are retained.
- Real storage artifact: `runs/store-selftest-2026-09-26T09-00-57.550Z.json`.

### Remaining limitations / unverified permutations

No requested repair criterion remains outstanding. Late navigation is conservatively rejected rather than automatically retried; destroyed execution contexts can yield an operational capture error. The exact screenshot-window race and artificially reordered header completions were inspected, not deterministically fault-injected; real timer-driven and scroll-driven navigation are exercised. WebSocket-dependent site content may be absent under the required read-only policy. Existing GET-side-effect, mixed-content coverage, nontransactional storage and forced-R2-outage-testing limitations remain unchanged. Optional A nits remain intentionally untouched.

No environment file was opened/printed/modified, no production site or production R2 prefix was mutated, and no human-only blocker remains. Ready for **A-only repair review** of `f2abb31..2aa4e09`.

## Repair round 2 — 2026-09-26

- Before / reviewed head: `2aa4e09bb15feb8046aefdbf7181c4e8cb4b1263`
- After / repaired head: `9140cdd9647d14e91ebd0565b5f1ef1ee55fff07`
- Commit: `Reject stale responses after failed final navigation`
- Finding: **A-F1** in A's first repair re-check. The previous fix handled final HTTP responses but incorrectly reused an earlier response when the later request failed.
- Delegation: `brief-7.md` / `worker-7.md`, sequential worker in round 2 of the configured 3. Plan Implementation notes updated before coding. Optional nits remain outside this narrow repair; acceptance was not weakened.

### Changed files and resolution

- `src/capture.ts`: clear prior main-response state when the current main request changes; select only a response belonging to that request. Reject missing current responses and Chromium browser-error documents before screenshot success, returning blocked, null status, navigation-failure detail and no usable image. The previous page's 200/headers cannot carry forward. No health schema, command-specific workaround or dependency change.
- `tests/capture.test.ts`: real-browser fail-first regressions for delayed navigation to a closed local port and delayed auto-submitted POST navigation aborted by the read-only policy. Assert zero server writes, retained POST warning/trace, blocked/null/no-image result, unconditional missing-response failure even against the same baseline snapshot, and subsequent normal-page capture in the same session.
- `README.md`: explicitly document failed-final-navigation and browser-error behavior without overstating earlier-response validity.

**A-F1 resolved:** both actual Chromium error pages are blocked with `status: null` and no image. Refused navigation explains `net::ERR_CONNECTION_REFUSED`; policy-aborted POST explains `net::ERR_BLOCKED_BY_CLIENT`. Existing B-F1 final-response/challenge cases and B-F2 WebSocket guard remain passing. Blocked/image-null results use the existing baseline skip guard, so no browser-error screenshot is promoted by baseline capture.

### Fail-first and worker return

Before production edits, `bun --no-env-file test tests/capture.test.ts --test-name-pattern 'failed later main-document'` failed both new cases with captured/status-200/image-present instead of blocked/null/no-image:

```text
 0 pass
 19 filtered out
 2 fail
 15 expect() calls
Ran 2 tests across 1 file. [3.61s]
```

Exact red evidence: `unit-7-red.log`. Focused green: **2 pass, 0 fail, 21 assertions** (`unit-7-green-focused.log`). Required changed-test command with original AKROGON_BASE passed **36 tests, 218 assertions**, and typecheck passed (`unit-7-green.log`, `unit-7-typecheck.log`). Complete changed paths/reasons, traces and limitations are in `worker-7.md`. Original A/B review evidence was preserved rather than overwritten.

### B's final verification on the repaired code

B inspected the three-file repair and complete worker return, then ran the full suite once and both real selftests. No source repair followed these successes.

`bun test` (`repair-2-tests.log`):

```text
Failed navigation fixture: /delayed-unreachable -> blocked, status null, hasImage false, writes 0
Failed navigation fixture: /delayed-post -> blocked, status null, hasImage false, writes 0
WebSocket fixture: {"mutations":0,"connections":0}
 99 pass
 0 fail
 802 expect() calls
Ran 99 tests across 9 files. [35.26s]
Full suite exit: 0
```

The first two lines summarize the full JSON fixture records retained in that log. The suite includes prior delayed successful/error HTTP responses, challenges, scrolling navigation, normal continuation, masks, readiness, health and command/report regressions.

`bun run typecheck` (`repair-2-typecheck.log`): `$ tsc --noEmit`, exit **0**.

`bun run store:selftest` (`repair-2-store-selftest.log`): all real-bucket roundtrip, signing, pagination, validation and retention checks passed.

```text
ok   cleanup test/2026-09-26T09-19-59.935Z-2ab74d25/ (deleted 10)
PASS artifact runs/store-selftest-2026-09-26T09-19-59.935Z.json
Storage selftest exit: 0
```

`mise exec node@24 -- bun run visual:selftest` (`repair-2-visual-selftest.log`): all **15 real WordPress/R2 scenarios**, **44 command invocations**, passed.

```text
ok   real check prunes more than ten report runs; baselines unchanged
visual:selftest PASS; cleanup empty
Visual selftest exit: 0
```

B checked every recorded artifact path: **21 reports**, **116 capture traces**, all exist. Cleanup removed **198** remaining remote test objects, listed **0** remaining, and stopped WordPress/HTTPS with no errors. Process inspection confirmed no fixture process remains. `git diff --check` passed; the repaired commit has a clean worktree and no issue artifacts.

### Current artifacts

Paths relative to the worktree:

- Final full-suite capture evidence: `runs/capture-test-2026-09-26T09-19-11.094Z/`.
- Refused-navigation trace/result: `0-delayedunreachable-desktop.trace.zip` and sibling `.result.json` in that directory.
- Policy-aborted POST trace/result: `2-delayedpost-desktop.trace.zip` and sibling `.result.json`.
- Normal continuation: `1-plain-desktop.trace.zip`, `3-plain-desktop.trace.zip`; mutation counters are `delayed-unreachable-counts.json` and `delayed-post-counts.json`.
- WebSocket evidence: `17-socketpage-desktop.trace.zip`, `websocket-counts.json`.
- Final report rendering: `runs/2026-09-26T09-19-45.200Z/index.html` and `report-browser.trace.zip`.
- Real integration summary/audit: `runs/visual-selftest-2026-09-26T09-20-41.217Z/summary.json`, `repair-2-artifact-verification.json`.
- Changed-alpha/stable-beta report: `runs/visual-selftest-2026-09-26T09-20-41.217Z/commands/2026-09-26T09-21-05.131Z/index.html`; sibling remote-render evidence and `traces/wordpress/{desktop,mobile}/alpha.trace.zip` are retained.
- Storage summary: `runs/store-selftest-2026-09-26T09-19-59.935Z.json`.

### Limitations and unverified permutations

No requested A-F1 criterion remains unverified. Separate delayed DNS/TLS failure permutations were not injected; connection refusal and policy abort exercise the missing-response path, and direct TLS failure tests remain passing. Existing conservative handling of screenshot-window navigation, destroyed contexts and no automatic retries is unchanged. Optional 204/download/history-update nits are not claimed fixed. Other previously stated GET-side-effect, mixed-content, nontransactional-storage and uninduced-R2-outage limits remain.

No environment file was opened/printed/modified and no production site or production R2 prefix was mutated. Real credentials were loaded only through the selftest commands and not printed. No human-only blocker remains. Ready for **A-only repair review** of `2aa4e09..9140cdd`.
