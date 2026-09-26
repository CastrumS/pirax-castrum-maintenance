# Plan: visual-health-check

## Basis and readiness

Direct slot-B synthesis: `state.yaml` has `debate: "no"`; there are no positions or rebuttals to integrate. The locked design governs. Its page-list correction supersedes historical automatic sampling: consume the existing operator-supplied list only. No other brief/design conflict was found.

Live checkout: `0663984` contains the completed checker foundation (`sites`, `env`, `store`, retention and discovery regression tests). The ordering dependency on **checker-foundation is satisfied**; there is no dependency on the forms leaves. No new origin/repository/operator setup is needed for implementation; origin is a later merge prerequisite.

Grounding gaps: repo configuration says `grounding: none`, so no grounding index or linked AREA files exist in the configured resources. `README.md` is the local API/operating guide. `learnings/LESSONS.md` contains only its heading; there is no lesson/history evidence to apply.

Readiness evidence from this pass:

- The mandated `bun --env-file=.env -e ...` presence check reported **present** for `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_ENDPOINT`, `S3_BUCKET`. A separate invocation of `readR2Config()` confirmed that all four are nonblank without printing values. This establishes configuration presence, not bucket authorization; real R2 verification remains mandatory.
- `bun test`: **48 pass, 0 fail**, 505 assertions.
- `bun run typecheck`: could not execute because `tsc` is not installed in this worktree. Run `bun install` during implementation; this is an agent-owned dependency setup, not a human blocker.
- Node and OpenSSL are installed. Public registry inspection found `@wp-playground/cli` 3.1.55. Its upstream README documents Node >=20.18, explicit `server` mode, Blueprints and programmatic `runCLI`; use Node, not Bun, for its runtime. Confirm the pinned installed package's API/types before building the harness.

No human-only blocker is currently known. If real R2 access exposes a bucket/token prerequisite that the implementer cannot obtain, record the precise operator remedy and stop through the lifecycle instead of substituting fake storage.

## Read first

1. This leaf's `brief.md` and `design.md` (authoritative leaf folder, not a worktree copy).
2. `/home/rudi/.claude/skills/chart-issues/assets/standing-design.md` — real mutations, no auth mocks, Playwright artifacts. The planning skill's prohibition on opening env files remains controlling.
3. `README.md` — loader, storage contract, retention caveats and safe selftest pattern.
4. `src/sites.ts`, `src/env.ts`, `src/store.ts` — reuse literal interfaces and page keys; do not duplicate their validators.
5. `scripts/store-selftest.ts`, `tests/store.test.ts`, `tests/discovery.test.ts`, `bunfig.toml` — isolated real-bucket testing and worktree discovery guard.
6. `package.json`, `tsconfig.json`, `.gitignore`, `learnings/LESSONS.md`.
7. Playground CLI reference inspected during planning: `https://github.com/WordPress/wordpress-playground/blob/trunk/packages/playground/cli/README.md`; installed CLI types/help are authoritative for the pinned version. In particular, a CLI command literally named `wp-cli` must not be invented: invoke WordPress WP-CLI through the running Playground API/Blueprint `wp-cli` facility.

Never open or rewrite `.env` or `.env.*` in this pass's downstream work. Existing credential names suffice; load values through Bun's `--env-file=.env` only and never emit them.

## Stable decisions

### D1 — Scope and operator commands

Implement exactly `bun run baseline <slug|all>`, `bun run check <slug|all>` and `bun run approve <slug> [pagePath]`. `approve all` is not supported. Default to `loadSites()` and the existing unscoped `store`; retain site/page order. An optional `--sites <file>` selects an explicit fixture/operator list without altering committed `sites.yaml`; otherwise there are no new production configuration knobs.

Shared CLI parsing lives in `src/commands/common.ts`; thin entrypoints call exported command functions. Exported functions accept a loaded site selection and a `Store`, plus explicit run-directory/browser test options; the real-R2 harness injects `createStore({ root: "test/<unique>/" })`. Do not add a production switch that disables R2 or a mock-storage fallback. Test-only HTTPS tolerance stays internal, never a default CLI TLS relaxation.

Preflight argument count, command target, page membership, site configuration and R2 configuration before browser launch or storage writes. Unknown slug, missing/extra arguments, `approve all`, invalid page/config/env give exit **2**. An empty valid site list with target `all` is a no-op **0**, not a bogus empty baseline/check. No config or command mutation of the operator's list.

### D2 — Dependencies and execution boundaries

Use `playwright` with headless Chromium, `pixelmatch`, and `pngjs` (plus needed type declarations). Install Playwright as a consumer-repo dev dependency as required. Install/pin `@wp-playground/cli` and the matching Playground Blueprint package only if needed for the WP-CLI bridge; keep the resolved versions in `bun.lock`. Tests use the library browser, not a parallel screenshot implementation. Add DOM typings to the existing TypeScript `lib` if browser evaluation requires them, and include `test/` fixture TypeScript in typechecking.

Use a sequential site/page/viewport loop initially. It is easier to make bounded and reproducible, and avoids concurrent report pruning. Share a browser process, but create an isolated context for each page/viewport. Set device scale factor 1, fixed locale/timezone/color scheme and reduced motion, without mobile-device emulation: `mobile` here means the locked **390×844** viewport, `desktop` **1440×900**. Both are full-page captures.

### D3 — Bounded capture and read-only browsing

`src/capture.ts` owns browser/context lifecycle and exposes the same capture path to baseline/check/tests. Install health listeners before navigation. Start tracing with screenshots/snapshots/sources, no video, and save a trace for each attempted capture even on failure; close contexts/browser in `finally`.

Navigate with a finite timeout (30 seconds), wait for load and then network idle with its own **15-second cap**. An idle timeout on an otherwise loaded page is a reported readiness warning, not automatically a blocked site. Scroll incrementally to the bottom and back to the top to trigger lazy loading, with a finite time/iteration limit (15 seconds); then wait boundedly for fonts/images to settle. Infinite scroll/never-settling resources must not hang a run. Surface readiness-limit warnings rather than claiming a fully settled capture.

Disable CSS animations, transitions, smooth scrolling and caret, and use screenshot animation disabling. Combine site and page masks and pass locators through Playwright's `mask` option. Enforce CSS selector syntax (not arbitrary Playwright selector engines); invalid syntax is configuration exit 2. A valid selector matching nothing is a warning, not a fake mask success. Capture returns PNG dimensions and raw health; never infer screenshot height from the viewport.

For the locked read-only scope, block service workers and abort page-originated non-GET HTTP requests (including POST/beacon); never click forms or invoke update/admin flows. Record policy-aborted requests distinctly in capture warnings so they are not mistaken for server-side asset failures. Ordinary browser asset GETs remain allowed, including cross-origin assets. No TLS bypass on real sites. Test-only WP-CLI mutations occur outside the checker browser, on the disposable local WordPress only. GET-only navigation cannot guarantee a poorly designed remote GET endpoint has no side effects; document that limitation rather than promise more.

### D4 — Raw health and baseline-relative findings

Export the locked health file shape from `src/health.ts` without adding comparison state to persisted raw health:

```ts
type HealthSnapshot = {
  status: number | null; // final main-document response, null if unavailable
  finalUrl: string;
  criticalError: boolean;
  consoleErrors: string[];
  failedRequests: { url: string; status: number | null }[];
  mixedContent: string[];
};
```

Use `null` for transport failures with no HTTP status. Collect console `error` events and uncaught `pageerror`; detect subresource HTTP >=400 through response events (HTTP errors are not Playwright `requestfailed` events), and transport failures through `requestfailed`. Keep failed main-document navigation separate from the subresource failure list. Deduplicate and deterministically sort comparable messages/URL-status pairs without stripping query parameters or normalizing away distinct failures.

`criticalError` recognizes the WordPress phrase “There has been a critical error on this website” case-insensitively in rendered document text. Final HTTP >=400, a critical error, and mixed content are unconditional failures; their presence in a baseline never waives them. On a check, identical baseline console messages and failed-request `{url,status}` pairs are **warnings**, new ones **failures**. Removed findings disappear. Warnings alone keep exit 0. Persist the complete raw snapshot, not only the new failures.

Mixed content means attempted/included HTTP subresources on the **final HTTPS document**, not ordinary HTTP hyperlinks. Combine request observation, browser mixed-content diagnostics and a DOM resource-attribute sweep (`src`, resource `href`, `srcset`, frames/media/objects) so Chromium blocking/upgrading an HTTP resource before an observable failed request does not silently pass. Test an actual HTTP asset reference on the Bun HTTPS fixture; don't equate any console error with mixed content. No active mixed-content weakening browser flags.

A page that cannot navigate at all (DNS/refused connection/TLS/navigation timeout), a 403, or a positively identified challenge/interstitial is `blocked`, carries the reason, counts as failure and does not terminate the remaining pages/sites. Detect challenge responses using explicit known challenge markers/headers and interstitial structure, not every page containing the words “Cloudflare” or “captcha”; a normal form CAPTCHA is not a blocked site. A 404 is a health failure, not “blocked.” Missing Chromium/browser crashes are operational failures, not fabricated site bot-blocking findings.

### D5 — Baseline creation and missing-baseline semantics

Use the existing keys verbatim:

```text
baselines/<slug>/<desktop|mobile>/<pageKey>.png
baselines/<slug>/<desktop|mobile>/<pageKey>.health.json
```

`baseline` captures each selected page/viewport and replaces each pair only once both local files are ready. Never replace an existing pair with a blocked or incomplete capture. Preserve local artifacts and continue other captures on site failures. Usable captures can contain health findings: store the actual health rather than hiding it. With no comparison reference, baseline reports its raw health failures as failures (exit 1); subsequent checks can downgrade the specifically baselined console/request issues to warnings under D4. A successful storage write must not make a failing health result report success.

`check` never implicitly creates/updates a baseline. Missing either baseline object is an actionable `missing-baseline` failure with actual evidence and “run baseline” guidance. Invalid health JSON/PNG is an explicit baseline error. Distinguish genuine object absence from R2 authorization/network failures; do not reinterpret every rejected `get` as a missing baseline. A real listing of the selected baseline prefix can establish presence without relying on undocumented S3 exception messages.

### D6 — Image comparison and dimension changes

`src/compare.ts` decodes PNGs and, for equal dimensions, runs pixelmatch at **threshold 0.1**. Changed means `diffPixels / (width * height) > site.max_diff_pixel_ratio`; equality passes. Keep pixelmatch's other defaults explicit and stable. Report the measured ratio and configured allowance.

Different width or height is always changed, regardless of tolerance. Report both `{width,height}` pairs. Produce a labeled dimension-change diff image on a padded common canvas (with a distinct padding fill), or equivalent clearly labeled visual difference; never call equal-size-only pixelmatch on differently sized arrays. The dimension-change decision does not depend on a padded-image ratio. A failed decode becomes an explained comparison failure, not a process crash. Capture failure/missing baseline are not claimed to be “visual changed.”

### D7 — Shared report interfaces, including future forms

Export `RunReport { runId: string; sites: SiteResult[] }`, `SiteResult`, `PageResult`, viewport result types and exactly this future-facing form type from `src/report/model.ts`:

```ts
type FormResult = {
  selector: string;
  plugin: 'gravity' | 'fluent' | 'unknown';
  outcome: 'delivered' | 'delivered-spam' | 'not-verified' |
           'rejected' | 'unsupported' | 'failed';
  detail: string;
};
```

`SiteResult` identifies slug and source URL and contains ordered `PageResult[]`; `PageResult` identifies path/pageKey, holds results for both named viewports, and has `forms?: FormResult[]`. Each viewport result carries capture state, visual state (`same`, `changed`, `missing-baseline`, `error`, `not-compared`), dimensions/ratio where available, structured health findings with warning/failure severity, readiness warnings and relative artifact paths. Use distinct visual/health/capture fields so a new console error cannot be misreported as a pixel change. Site/page aggregate status is failure if any constituent fails, blocked when captures are blocked, warning if only warnings, otherwise pass. Preserve individual results when aggregating.

Render a Forms column if any page supplies `forms`, escaping and showing every supplied outcome/detail; render no Forms column for this leaf's normal reports. No form execution, mail credentials, helper plugin, or form-health gating is introduced here. Exported command/report functions are the extension seam for the forms leaf.

### D8 — Local and private R2 report layout

All local files, including fixture runtime state and retained traces, live under gitignored `runs/<runId>/`. A check's `index.html` presents per-page, per-viewport baseline/actual/diff side by side, dimensions, visual state, health failures/warnings and blocked explanations. Escape all site-derived text and validate derived paths; no page HTML is executed in the report.

Make `index.html` **self-contained** with inline CSS and embedded PNG data URLs. Relative image URLs cannot authenticate to private R2 just because the HTML is presigned; don't ship that broken design or depend on public bucket access. Embed no signed URLs. Save raw PNG/health files separately for approval and diagnostics.

Remote layout (relative to the injected Store root):

```text
reports/<runId>/index.html
reports/<runId>/manifest.json
reports/<runId>/actual/<slug>/<viewport>/<pageKey>.png
reports/<runId>/actual/<slug>/<viewport>/<pageKey>.health.json
reports/<runId>/baseline/<slug>/<viewport>/<pageKey>.png          # when available
reports/<runId>/baseline/<slug>/<viewport>/<pageKey>.health.json  # when available
reports/<runId>/diff/<slug>/<viewport>/<pageKey>.png              # when available
```

The manifest is versioned (`schemaVersion: 1`, `command: 'check'`, `report: RunReport`) and records capture completeness and source site URL. Upload all report files, then the manifest **last** as the completion marker. Save traces locally and list local trace paths in the local verification artifact; traces need not be uploaded to R2. Upload HTML using a `Blob` typed `text/html; charset=utf-8` through the existing Store API, JSON as JSON, PNG as PNG; verify real HTTP content type and browser rendering.

After successful upload call existing `store.pruneReports(10)`, then print the local HTML path and `store.presign(indexKey, 604800)`. A failed upload/prune yields exit 1, retaining/printing the local report path; don't announce successful publication/pruning if it failed. Expected failing checks still publish reports. The signed URL is an intentionally printed bearer capability; do not copy it into committed output, manifests or implementation evidence. Local output is enough for diagnostics when R2 is unavailable.

### D9 — Approval is remote-backed and exact, not a recapture

Resolve **the latest completed check containing the requested site**, by canonical run ID descending and valid completion manifest, not the newest run for some other site or a local cache. Partial uploads without a manifest are ineligible. Treat invalid manifests as errors, not as a reason to silently choose older evidence. For the newest manifest containing the site, require its source URL to equal the current configured site URL. `approve <slug> [pagePath]` selects the current listed page or every current listed page, respectively.

Promote actual PNG and matching actual health bytes for both viewports from that **one** run into baseline keys. Do not mix different runs, fall back to older versions of a blocked/missing page, rerun the browser, or approve diff/baseline report assets. Derive keys from validated slug, pageKey and viewport rather than trusting arbitrary manifest paths. Validate the manifest, required health/PNG artifacts and dimensions for the entire requested set before any baseline write. Missing latest-check evidence, URL mismatch, blocked/incomplete captures or newly added pages absent from that run cause exit 1 with actionable guidance and no preflight baseline mutation.

A complete captured health failure can be explicitly promoted along with its image; approval is not a waiver of D4's unconditional failures. Success after approve is promised for accepted image changes and the baseline-relative console/request findings, not for persistent 404/critical/mixed-content conditions. Report this clearly. Storage writes remain nontransactional; stop and explain a write error rather than report success. No latest-pointer object outside retention is necessary.

### D10 — Exit/result contract

- **0:** all selected results pass or have warnings only; successful approval/no-op selection.
- **1:** visual/health/missing-baseline/blocked/operational failure, or publication/pruning/approval failure.
- **2:** usage, loaded-site configuration, CSS selector configuration or missing/blank credential configuration error.

A run containing configuration errors returns 2 even if other failures also occurred; validate selectors as early as the browser permits. Other site failures do not short-circuit remaining work. Imported modules have no credential reads, browser starts or process exits; only entrypoints set exit codes. Catch/sanitize operational storage errors without dumping R2 config, endpoints, bucket names or raw S3 error text. Page health messages are untrusted report text and are HTML-escaped.

### D11 — Real end-to-end harness; no mocked acceptance

Add `bun run visual:selftest` -> `bun --env-file=.env scripts/visual-selftest.ts`. It owns a unique `test/visual-<timestamp>-<random>/` Store root and local run workspace and exercises exported production commands, plus subprocess CLI argument/exit behavior. It must never read/modify production baselines, reports, or `sites.yaml`. Regular `bun test` remains credential-free; the separately invoked selftest must fail, not silently skip, if its prerequisites are missing.

Start a real disposable WordPress with Node running `@wp-playground/cli` in `server` mode using the local Blueprint/plugin in `test/wp/`. Prefer a Node bridge around `runCLI` so the harness can execute Playground's WP-CLI facility against the **same live instance**, await mutation completion and shut down deterministically. Do not assume two unrelated Playground invocations share an in-memory database. Seed and update real WordPress posts through WP-CLI; no fake HTML page may stand in for the WordPress content-change criterion. Fix theme/content/assets/fonts and disable fixture timestamps/remote noise to make unchanged pages deterministic. Keep mutations in a local control bridge, not a public unauthenticated write endpoint.

Use a small fixture plugin to provide isolated critical-error, missing-asset, console-error, random-element, tall-page and challenge cases through actual WordPress routes. Keep controls (e.g. local fixture state read by the plugin) separate from browser actions. Provide baseline/after fixtures that change only the intended condition. The Bun HTTPS fixture with a freshly generated self-signed certificate is only for the mixed-content case; `ignoreHTTPSErrors` is enabled for its test context alone. Use request interception/browser diagnostics plus an explicit HTTP resource reference so loopback trustworthy-origin exceptions or automatic upgrades do not accidentally invalidate the case.

The harness writes a JSON summary with case assertions, command results, local report/trace paths and cleanup outcome, even on failure. No credentials or signed links in that summary. In `finally`, close browsers, stop/await Node/Bun servers, delete only the unique real-R2 test root and confirm it lists empty. Keep local reports/traces as evidence. Cleanup failure is an overall failure with the exact test prefix for manual cleanup, never a false pass.

## Acceptance criteria (fixed before test implementation)

**A1 — Changed page and stable controls.** In real Playground, seed at least two stable listed pages. `baseline local`; use Playground WP-CLI to change only one page's sufficiently large visible content; `check local` returns 1. Machine model and rendered HTML mark exactly that page changed at desktop and mobile; unchanged pages pass at both widths. Keep report and traces. A browser opens the local HTML and verifies all three image panels where available.

**A2 — Individual health failures.** Independent cases on the same real WordPress: listed 404, visible critical-error phrase, missing image and missing CSS (4xx), console error/uncaught JS error. With a clean relevant baseline, each check returns 1 and identifies the correct reason rather than just a screenshot change. Independently run the real Bun HTTPS/HTTP-resource case and assert mixed-content failure. Always inspect both viewports.

**A3 — Baseline-relative warnings.** Capture console and failed-resource findings in a baseline, then check the same condition: their severities are warnings and unchanged visuals yield exit 0. Change the console message or failed URL/status and get failure; removed findings are absent. A baselined 404/critical/mixed-content condition still fails. Include response-404 and transport-failure coverage (not only emitted console messages).

**A4 — Masks.** The fixture's visibly changing random element occupies enough pixels to exceed the tolerance without masks. Repeated captures with the configured selector pass; the identical setup without a mask fails. Verify site+page mask union, invalid CSS -> 2 and unmatched valid selector -> warning. Avoid relying on a tiny random text change under the default 1% threshold.

**A5 — Dimensions and continuation.** Increase page height; check returns 1, shows both heights and a usable diff without crashing. Test unreachable connection, 403 and a 200 challenge page with a normal site later in the selection; blocked captures count as failure while the normal site is still checked. Ordinary CAPTCHA/Cloudflare text alone does not classify a normal page as blocked. Readiness waits/scrolling terminate under a never-idle fixture.

**A6 — Approval fidelity and persistence.** Approve the changed page from A1, then check it unchanged -> pass. Assert R2 baseline PNG and health bytes match that run's actual files for both widths and unrelated page baselines are unchanged. Test whole-site approval, newest run belonging to another site, partial report uploads, blocked/incomplete latest capture, missing requested page, source-URL mismatch and no check history. Remove local cached run evidence before one approval to prove it works from R2. Failed preflight makes no writes.

**A7 — Private report usability and retention.** Fetch the real 604800-second presigned report with no bucket/public-access change: HTTP 200, HTML content type, no unsigned asset dependency. Use Playwright to render the fetched report content at its signed URL or with the signed response body; assert embedded images decode and expected page/health/Forms cells render. Keep only artifact paths, not the signed URL. Seed enough canonical test reports for a completed check to cross 10; assert <=10 run prefixes afterward, correct oldest removal and baselines unaffected. Test root is empty after cleanup. Check listing/prune failures cannot report success.

**A8 — Comparison boundaries.** Equal PNGs, below/equal/above allowance, pixelmatch threshold 0.1, width-only and height-only changes and malformed PNG/health are tested concretely. Missing baselines produce an actionable check failure without writing baselines.

**A9 — Scope and exit codes.** CLI subprocesses prove normal pass 0, expected check failure 1 and config error 2 (missing/blank credentials, unknown slug, malformed list, invalid arguments/page). Read-only fixture counters prove checker-triggered POST/beacon writes do not reach the server. No form submission, updates, schedule, page discovery or production-list rewrite.

**A10 — Report extension and hostile content.** A report supplied with typed sample `forms` renders the Forms column/outcomes; ordinary runs omit it. Site text, console messages and form details containing HTML/script remain inert, and page paths cannot redirect approval artifact reads outside the validated report/site prefix.

**A11 — Regression and evidence.** `bun test`, `bun run typecheck`, `bun run store:selftest`, `bun run visual:selftest` all pass after dependencies/browser setup. Existing worktree-exclusion test keeps passing. Implementation report records actual commands/results and retained `runs/...` summary/report/trace paths, not claims inferred from mocks. An expected nonzero inner check case is a successful selftest assertion, not the overall selftest exit.

## Ordered file / criterion checklist

Implementation can be split into sequential workers at these boundaries. Each worker must receive its own eight-section sub-brief per `implement-issue`; this checklist is the controlling integration order, not permission for concurrent conflicting edits.

### 1. Contracts and setup (D1–D2, D7, D10; A8–A11)

- [ ] `package.json` — add the three production commands, `visual:selftest`, browser/PNG/Playground dev dependencies; keep existing scripts.
- [ ] `bun.lock` — lock actual resolved dependency versions via Bun.
- [ ] `tsconfig.json` — include fixture TypeScript in `test/` and needed DOM typings without weakening strictness.
- [ ] `src/report/model.ts` — literal RunReport/FormResult interfaces, orthogonal viewport results and versioned manifest types.
- [ ] `src/commands/common.ts` — shared parser, validated selection/options, runtime/exit/error mapping and test injection; no env/browser side effects at import.

### 2. Browser, health, comparison (D3–D6; A2–A5, A8–A9)

- [ ] `src/health.ts` — raw schema, real browser observation and deterministic baseline-relative evaluation.
- [ ] `src/capture.ts` — viewport constants, read-only contexts, bounded stabilization, mask validation, full-page screenshot, blocked classification and trace cleanup.
- [ ] `src/compare.ts` — pixelmatch comparison and dimension-change artifacts.
- [ ] `tests/health.test.ts` — new/existing/removed finding semantics and unconditional failures.
- [ ] `tests/compare.test.ts` — real generated PNG boundaries, dimensions and decode failures.

### 3. Reports, manifests and commands (D5, D7–D10; A1, A6–A10)

- [ ] `src/report/html.ts` — escaped self-contained static template, image panels, dimensions, health/readiness and optional Forms column.
- [ ] `src/report/writer.ts` — local file layout, typed uploads, manifest completion ordering, prune and 7-day link result.
- [ ] `src/report/manifest.ts` — runtime manifest validation and latest completed site-check selection used by approve; safe derived artifact keys.
- [ ] `src/commands/baseline.ts` — capture/persist both raw baseline artifacts and retain diagnostics.
- [ ] `src/commands/check.ts` — aggregate all captures, fetch baselines, compare/evaluate, publish even failing reports and return correct exit status.
- [ ] `src/commands/approve.ts` — validate complete requested source set before exact PNG/health promotion, no browser/local-cache dependence.
- [ ] `tests/report.test.ts` — HTML escaping, data images, model distinction, optional Forms column, manifest/path validation.
- [ ] `tests/commands.test.ts` — credential-free usage/config subprocess tests, selection and missing-baseline/error classification; no fake R2 acceptance claims.

### 4. Real fixtures and verification (D11; A1–A11)

- [ ] `test/wp/blueprint.json` — real WordPress deterministic seed/plugin setup with explicit versions; no paid plugins or production credentials.
- [ ] `test/wp/fixture-plugin.php` — controlled health/random/height/challenge cases and GET-only guard evidence.
- [ ] `test/wp/playground.ts` — Node-run bridge around pinned Playground server and WP-CLI operations against that same instance; bounded readiness and teardown.
- [ ] `test/fixtures/https.ts` — local Bun HTTPS resource fixture; generated certificates kept in the run directory, not committed.
- [ ] `scripts/visual-selftest.ts` — real isolated R2/WordPress/browser cases, CLI evidence, retained report/trace summary and finally cleanup.

### 5. Documentation and final evidence

- [ ] **Human doc: `README.md`** — replace foundation-only claims; document install/Chromium/Node/OpenSSL setup, commands/`--sites`, masks and waits, health warning rules, missing baselines, approve selection/limits, signed-link sensitivity, storage/manifest paths, cleanup and runnable selftest/trace-viewing instructions. Keep existing storage API caveats accurate.
- [ ] **Agent docs:** none exist or are affected by this leaf; do not create a speculative AGENTS file or modify lifecycle configuration.
- [ ] `learnings/LESSONS.md` — resource only, no planned change; add a lesson/history pair only if implementation uncovers an evidenced reusable incident.
- [ ] Authoritative leaf implementation artifact — record executed checks and actual report/trace/cleanup evidence per implementation skill, without secrets or signed URLs.

Unchanged unless a concrete integration defect requires review: `src/sites.ts`, `src/env.ts`, `src/store.ts`, `sites.yaml`, `sites.example.yaml`, `bunfig.toml`, `.gitignore`, all env files. Existing storage/loader interfaces already supply the needed behavior. Keep discovery exclusion intact; fixtures live in `test/`, not nested worktrees.

## Verification commands and scenario order

```sh
bun install
bunx playwright install chromium
bun test
bun run typecheck
bun run store:selftest
bun run visual:selftest
```

The implementer installs available missing browser prerequisites; a genuinely privileged installation it cannot perform is an explicit operator blocker, not permission to skip browser evidence. `visual:selftest` orchestrates baseline -> WP-CLI update -> check -> page approve -> passing check, then isolated health/mask/height/blocked cases and retention, using the same command functions as the CLI. Check actual CLI entrypoints with a temporary list and isolated exported command invocation/root, never the production site list/bucket prefixes just to get an exit-code assertion. The credential-free CLI tests cover configuration failure before remote access.

Review the generated report with headless Chromium (trace on); verify the changed page at both widths, stable controls, image decoding, health text and optional forms rendering. Inspect the selftest cleanup summary and real empty test prefix. Print local artifact paths in the implementation report. Manual live-site updates and approval of real production differences are not acceptance prerequisites.

## Implementation notes

2026-09-25 — **D2/D11 runtime constraint:** The installed Playground dependency `fs-ext-extra-prebuilt` 2.2.7 has binaries through Node 25 but none for this machine's Node 26.8.2; the first real fixture startup failed before WordPress boot with that exact native-module error. Use a compatible Node 24 runtime for the fixture (an agent-installable prerequisite), without changing the operator's global Node selection or replacing Playground. Document how to select it for `visual:selftest`; final verification must name the actual runtime-selection command. This refines dependency setup, not the locked Node/WordPress/no-Docker architecture.

2026-09-26 — **Review repair, D3/D4:** B-F1 reproduced delayed client-side navigation from HTTP 200 to final 404/403 while capture retained status 200 and no health findings. Track the current main-document response and classify the final page after readiness, preserving the shared baseline/check contract. B-F2 reproduced an outbound WebSocket mutation bypassing HTTP-only routing. Intercept page-originated WebSockets before navigation and report policy warnings, preserving the locked read-only scope rather than documenting a new exception. Add real-browser fail-first regressions for both; existing criteria are not weakened. This is repair round 1 of the configured 3, so the repair uses a sequential worker.

2026-09-26 — **Repair round 2, A-F1 (D3/D4):** The first repair corrected final responses but retained an earlier response when a later main navigation failed. The re-check reproduced both refused-connection and policy-aborted POST navigation as captured Chrome error pages with status 200. Correlate response ownership with the current main request, reject browser error documents, and report missing final response as status null / blocked with no usable image. Add durable real-browser regressions for both failures and preserve successful redirects, continuation and WebSocket blocking. Optional noncommitting-navigation/history-update nits are not new locked criteria; no acceptance is weakened.

## Real limitations retained

- Anti-bot challenges, consent overlays, dynamic pages and browser/font/version drift can still prevent reliable comparison; masks and consistent environments help but do not bypass authentication/challenges. This leaf reports blocked rather than defeating protection.
- Mixed-content observation covers browser events, diagnostics and explicit resource attributes, not exhaustive static analysis of arbitrary JavaScript or every nested CSS/import construction. Add observed cases rather than claim complete detection of all latent resource references.
- Full-page PNGs, embedded report images and traces can be large. Runs are sequential, scroll/waits bounded; this leaf does not add tiled screenshots, streaming diffing or a new storage service.
- R2 has no multi-object transaction here. Approval/baseline writes can partially succeed after preflight if the network fails. Retention and publication assume one operator run at a time. Document recovery (rerun the explicit command) and preserve honest failures.
- Global last-10 retention can remove a quiet site's most recent check and invalidates a pruned report even before its signed URL's seven-day expiry. Approval then requires a fresh check. A seven-day signature is not a seven-day retention guarantee.
- Local reports/traces are retained for evidence and may contain site content. They remain gitignored, have no automatic local pruning in this leaf, and should not be shared as if public. GET-only browsing cannot neutralize side effects implemented by a remote site on GET endpoints.
