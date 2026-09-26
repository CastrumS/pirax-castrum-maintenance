# Worker 3 return — production commands and private reports

## Changed files and reasons

Implemented only brief-3's unit in `/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/worktrees/visual-health-check` (10 owned source/test/package files):

- `src/commands/common.ts`: shared argument/selection/configuration preflight, lazy dispatch, sanitised errors, injected real Store/run/browser seam, sequential capture orchestration and exit aggregation. All selected masks are validated before storage work. Browser failures become capture errors; ordinary viewport failures retain evidence and continue.
- `src/commands/baseline.ts`: write complete locally persisted PNG/raw-health pairs to canonical baselines; preserve existing baseline on blocked/incomplete capture; retain health-failure exit even when usable pairs are stored.
- `src/commands/check.ts`: consume existing baselines using listing to distinguish missing objects from failed storage operations; explicit corrupt/missing baseline results, independent capture/visual/health findings, local report and private publication even on expected failed checks.
- `src/commands/approve.ts`: newest completed run containing the requested site; no fallback from selected blocked/missing evidence; validate current URL/pages and all requested PNG/health pairs before any write; promote original bytes; report that unconditional health failures remain. Direct unlisted-page validation returns 2 before touching the Store.
- `src/report/manifest.ts`: runtime manifest/type/path validation; canonical artifact paths; approval selection and actual PNG dimensions/raw-health validators.
- `src/report/html.ts`: escaped, self-contained HTML with inline CSS/data PNGs, per-site/page/viewport status, separate findings, dimensions/ratios, optional exact Forms outcomes. CSP prevents scripts/external assets. Forms are displayed without introducing form execution or health gating.
- `src/report/writer.ts`: local artifacts, local HTML/manifest, explicit publication allowlist excluding traces, typed HTML/JSON/PNG Blobs, manifest uploaded last, then pruneReports(10), then GET presign for 604800 seconds.
- `tests/report.test.ts`: model/HTML/Forms/embedding/status/manifest/path/approval validation and actual local Chromium report verification.
- `tests/commands.test.ts`: arguments/site selection/config/env/import behavior, canonical completed history selection and latest-site/no-fallback approval helper coverage.
- `package.json`: added the three command scripts, preserving prior unit dependency edits.

Preserved all earlier unit-owned changes: capture, health, compare, model, their tests, bun.lock and tsconfig.json. No Store interface changes. README still describes foundation-only status; command documentation refresh remains for the harness/final integration owner rather than expanding this unit's owned list.

Authoritative files added outside the worktree: this report and `unit-3-red.log`, `unit-3-validation.log`, `unit-3-typecheck.log`. No worktree `issues/` edits.

## Tests run

All Bun verification used `--no-env-file`; no environment files were opened, printed or modified.

```sh
AKROGON_BASE=0663984e0d80887123298bd43d6768e1cc2cbbf9 bun --no-env-file test tests/report.test.ts tests/commands.test.ts
bun --no-env-file run typecheck
git diff --check
```

- Red, before any command/report implementation: **0 pass, 2 fail, 2 import errors**, because html.ts and common.ts did not yet exist. Evidence: `implementation/unit-3-red.log`. The targeted tests were written before implementation; this is missing-module red evidence, not a claim of individual behavioral assertions failing in pre-existing code.
- First implementation run: 13 targeted tests passed; typecheck found a test fixture's widened schema literal. Fixed with the explicit Manifest return type.
- Final green after direct approval preflight refinement: **16 pass, 0 fail, 83 expect() calls, 1.76 seconds**, exit 0. Evidence: `implementation/unit-3-validation.log`.
- Final typecheck: `$ tsc --noEmit`, exit 0. Evidence: `implementation/unit-3-typecheck.log`.
- `git diff --check`: exit 0.
- Real local Chromium test: headless, trace screenshots/snapshots/sources enabled, no video. Opened file:// index.html; asserted all **6** embedded PNGs decode, exact Forms outcome and dimensions render, no script element or injected script execution, and **0 external HTTP(S) requests**. Saved screenshot, trace and verification JSON. Inspected the first green screenshot; final fixture also uses the correct null ratio for dimension changes. Final trace archive CRC verified with Python's standard zipfile library.

No full suite, store:selftest, visual:selftest, production browser capture, production-R2 mutation, or fake-Store command acceptance was run. Tests use pure data/helper seams and one actual local report browser. The one real lazy Store constructed in a test is never accessed: invalid page preflight returns before the first list/get/write.

## Retained artifacts

Final successful report browser directory:

`/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/worktrees/visual-health-check/runs/2026-09-25T16-27-46.263Z/`

- `index.html` — actual self-contained local report, both widths, baseline/actual/diff panels, hostile text and Forms fixture.
- `manifest.json` — validated version 1 report model.
- `report-browser.png` — full-page Chromium screenshot.
- `report-browser.trace.zip` — real Playwright trace, CRC valid.
- `browser-verification.json` — image count, zero external requests, Forms value, no injected script, local artifact names.
- `actual/acme/{desktop,mobile}/home.{png,health.json}` and `baseline/acme/{desktop,mobile}/home.png`, `diff/acme/{desktop,mobile}/home.png` — local rendering fixtures, not remote check acceptance evidence.

Earlier successful local report browser artifacts also remain at `runs/2026-09-25T16-26-29.345Z/`. No signed URLs or credentials are in the evidence/report.

## Exact CLI and harness interfaces

Production scripts added:

```json
"baseline": "bun src/commands/baseline.ts",
"check": "bun src/commands/check.ts",
"approve": "bun src/commands/approve.ts"
```

Operator invocation:

```sh
bun run baseline <slug|all> [--sites file]
bun run check <slug|all> [--sites file]
bun run approve <slug> [pagePath] [--sites file]
```

`--sites` can appear before/after positionals; duplicate/unknown flags, wrong arity, unknown slug, approve all, unlisted requested page and invalid loaded configuration return 2. Empty valid all is a no-op 0 before environment/browser/storage access. For nonempty production selection, readR2Config runs before browser/storage activity. Only entrypoints assign process.exitCode; imports perform no credential reads, browser launch or process exit.

From `src/commands/common.ts`:

```ts
type Command = "baseline" | "check" | "approve";
type ExitCode = 0 | 1 | 2;
type RunOptions = {
  runsDir?: string;        // Parent workspace, default "runs"; command adds canonical runId.
  runId?: string;          // Default new Date().toISOString().replaceAll(":", "-").
  browser?: SessionOptions; // Existing capture options: timeouts, internal fixture-only ignoreHTTPSErrors.
  log?: (message: string) => void; // Default console.log; check intentionally logs bearer presign URL.
};
type CommandResult = {
  exitCode: ExitCode;
  report?: RunReport;
  runDir?: string;
  localPath?: string;
  url?: string;
};
function dispatch(
  command: Command,
  args: string[],
  options?: RunOptions & { store?: Store },
): Promise<ExitCode>;
function parseArgs(command: Command, args: string[]): {
  target: string; pagePath?: string; sitesFile?: string;
};
function selectSites(sites: Site[], target: string): Site[];
```

From respective command modules:

```ts
function runBaseline(sites: Site[], store: Store, options?: RunOptions): Promise<CommandResult>;
function runCheck(sites: Site[], store: Store, options?: RunOptions): Promise<CommandResult>;
function runApprove(
  site: Site,
  store: Store,
  options?: { pagePath?: string; log?: (message: string) => void },
): Promise<CommandResult>;
function completedRunIds(keys: string[]): string[];
function newestSiteCheck(
  runIds: string[], slug: string, read: (runId: string) => Promise<unknown>,
): Promise<Manifest>;
```

Command functions consume loader-validated Site objects. Use **dispatch** for full CLI/config/env behavior and guaranteed exit-code conversion; direct baseline/check can reject configuration or setup errors, including MaskSelectorError and local run-ID collision. Operational per-capture errors and report publication errors are represented by results. Direct approve catches errors and returns 0/1/2. Empty direct baseline/check returns `{exitCode: 0}` without a report.

For the next harness, create a real `createStore({config, root: "test/<unique>/"})`; pass it as `options.store` to dispatch or the required Store parameter to direct commands. `runsDir` is a parent folder, **not** the run folder. Supply distinct canonical `runId`s or omit them; an existing local run folder is rejected to prevent mixed evidence. The Store injection does not add CLI scope/env/TLS switches. A subprocess wrapper may import dispatch and set its own process.exitCode from the returned value. Suppress/sanitize the supplied log for persisted harness evidence so signed URLs stay out of artifacts. `CommandResult.url` is also a bearer capability and should not be saved in the selftest artifact.

Report helper exports:

```ts
// report/manifest.ts
class ReportError extends Error {}
const viewportNames: readonly ["desktop", "mobile"];
type ArtifactKind = "actual" | "baseline" | "diff" | "traces";
function artifactPath(kind: ArtifactKind, slug: string, viewport: ViewportName,
  key: string, extension: "png" | "health.json" | "trace.zip"): string;
function parseManifest(value: unknown, expectedRunId?: string): Manifest;
function validateApproval(manifest: Manifest, site: Site, pagePath?: string): PageResult[];
function validateActualPair(viewport: ViewportResult, png: Uint8Array,
  healthBytes: Uint8Array): HealthSnapshot;
// report/html.ts
function renderHtml(report: RunReport, images: ReadonlyMap<string, Uint8Array>): string;
function escapeHtml(value: unknown): string;
type ResultStatus = "pass" | "warning" | "failure" | "blocked";
function viewportStatus(v: ViewportResult): ResultStatus;
function aggregateStatus(states: ResultStatus[]): ResultStatus;
function reportStatus(report: RunReport): ResultStatus;
// report/writer.ts
function saveArtifact(runDir: string, path: string, data: Uint8Array | string): Promise<void>;
function reportAssets(report: RunReport): string[]; // Explicit remote allowlist, excludes traces.
function writeLocalReport(report: RunReport, runDir: string): Promise<string>; // index path; also saves manifest.
function publishReport(report: RunReport, runDir: string, store: Store): Promise<string>; // Signed URL.
```

Check capture traces are saved at `traces/<slug>/<viewport>/<pageKey>.trace.zip` under the run directory and named by `ViewportResult.artifacts.trace`; publication excludes them. Actual/baseline/diff paths follow the locked layout. Baseline command raw files use the same local actual layout. Check never writes baseline keys.

## Known limitations

- Baseline pairs and approval writes are nontransactional in the existing Store API. Validation precedes writes, but a write failure may leave partial remote replacement. Approval stops and explicitly reports this; baseline reports failure and continues remaining captures.
- Runs/retention remain sequential and are not coordinated across concurrent processes. Canonical millisecond run IDs are used; local collisions are rejected. Do not run concurrent publication/pruning against the same store root.
- Self-contained HTML and whole-set approval keep image bytes in memory. No streaming/size-limit architecture was introduced.
- Missing/corrupt baselines and operational storage errors are implemented and separated; storage/network fault behavior has not been exercised against R2 in this unit.
- Approval of complete HTTP/critical/mixed-content failures is permitted as explicit byte promotion and returns successful promotion 0, with an explicit message that these remain health failures on check. It does not waive them.
- Check report generation cannot preserve an index that could not be written due to a local filesystem failure. Once local HTML exists, later publication/prune/presign failures leave it intact and return failure.
- Existing capture/health limitations from worker 2 remain unchanged.

## Unverified criteria / next harness work

No scope/interface mismatch required a design change. Local/helper portions of criteria 1/3/5/6 were verified; production code for criteria 2/4/5 is implemented and inspected. **Real R2 end-to-end acceptance remains explicitly unverified and belongs to the next harness unit**, as brief-3 requires. In particular:

- Real baseline/check command state transitions, persisted pair fidelity, missing/corrupt objects and operational storage faults, continuation across sites/pages, CLI pass/failure/selector-error cases.
- Actual R2 HTML content type and GET presign rendering; manifest-last completion behavior; retention crossing 10; publication/prune failures preserving the local report.
- Remote-only exact approval after deleting local cache, all-page preflight before mutation, whole-site/subset effects, unrelated newest/incomplete runs and other negative cases against real storage.
- Playground mutation/read-only integration, full-suite/regression/selftests and operator documentation are outside this unit.

Pure selection/validation tests are not substituted for those acceptance checks. Section 8 of brief-3 was reread before this report. No subagents, commits, lifecycle calls, user questions, environment-file access, production-site mutations or production-R2 mutations occurred.
