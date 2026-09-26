# Worker 2 return — capture/health/compare remainder

## Changed files and reasons

- `tests/capture.test.ts`: sort the four explicitly expected failed-request entries by URL before exact equality. This preserves exact URL/status membership, query distinctions and deterministic order, while removing the assumption that the HTTP fixture port sorts before the closed transport port. Production normalization is unchanged; the dedicated health test still verifies URL/status sorting and deduplication independently.
- `tests/capture.test.ts`: remove the temporary `t0` variable and `shoot`/`validate` console timing output. Selector rejection assertions remain unchanged.
- Authoritative `implementation/worker-2.md`: this complete return, including interfaces and evidence.
- Authoritative `implementation/unit-2-validation.log` and `implementation/unit-2-typecheck.log`: new verification output.
- New ignored local browser evidence under `runs/capture-test-2026-09-25T16-13-41.629Z/`.

The existing uncommitted unit-1 files were preserved: `src/capture.ts` (browser/session capture), `src/health.ts` (raw health/normalization/evaluation), `src/compare.ts` (PNG comparison), `src/report/model.ts` (report/Forms contracts), their three targeted test files, `package.json`/`bun.lock` (Playwright, pixelmatch, pngjs and types), and `tsconfig.json` (DOM libraries and future `test` inclusion). This worker changed no production module, dependency or configuration file. Inspected the landed modules, targeted tests, package/tsconfig diff, README and required ponytail guidance. No further local debugging output or unfinished TODO/FIXME/debugger markers were found in the owned source/tests.

## Tests run

B's preserved red evidence is `implementation/unit-1-validation.log`: **23 pass, 1 fail, 138 assertions**, 24 tests, 18.26 seconds. The health browser test expected asset port 38695 before transport port 36965, contrary to URL sorting. This is pre-existing evidence; worker 2 did not reproduce or reconstruct the interrupted worker's earlier red runs.

New commands from the requested worktree (automatic environment-file loading explicitly disabled to honor secret isolation):

```sh
AKROGON_BASE=0663984e0d80887123298bd43d6768e1cc2cbbf9 bun --no-env-file test tests/health.test.ts tests/compare.test.ts tests/capture.test.ts
bun --no-env-file run typecheck
```

Results:

- Targeted suite: **24 pass, 0 fail, 145 expect() calls**, 24 tests across 3 files, **18.34 seconds**, exit 0. Complete output: `implementation/unit-2-validation.log`.
- Typecheck: `$ tsc --noEmit`, exit 0. Complete output: `implementation/unit-2-typecheck.log`.
- `git diff --check`: exit 0.
- Search for `console.log/debug/time/timeEnd`, `debugger`, `TODO`, `FIXME` and `t0` in the owned production modules and targeted tests: no matches after cleanup.
- Python standard-library verification: all **22 actual trace ZIP archives** passed CRC checks; all **13 captured PNGs** had readable IHDR dimensions. Desktop tall capture is **1440×3721**; mobile is **390×3721**.

The green browser run specifically exercised the former failing order: transport URL `http://127.0.0.1:38731/unreachable.js` precedes the three asset URLs on port `43713`. Exact membership and order passed without changing production behavior. No repeat run was needed.

The targeted coverage demonstrates raw shape/query distinctions, malformed health rejection, baseline warning/new failure behavior, permanent HTTP/critical/mixed failures, threshold and allowance boundaries, different-dimension padded diffs, corrupt PNG errors, both full-page viewports, lazy content, mask composition and stability, CSS-only validation, no-match warnings, console/pageerror/resource/transport health, GET-only policy and service-worker blocking, blocked navigation/403/challenges, bounded readiness warnings, TLS default rejection, and HTTP resource versus plain-link mixed-content behavior.

## Actual retained browser artifacts

Absolute directory:

`/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/worktrees/visual-health-check/runs/capture-test-2026-09-25T16-13-41.629Z/`

These files exist in that directory from the successful run (each basename below has `.png`, `.trace.zip`, and `.result.json`):

- `0-tall-desktop` — full page, 1440×3721.
- `1-tall-mobile` — full page, 390×3721.
- `2-tall-desktop` and `3-tall-desktop` — masked stable captures.
- `4-tall-desktop` and `5-tall-desktop` — unmasked changing captures.
- `6-tall-desktop` — unmatched valid mask warning.
- `11-health-desktop` — exact health, policy warnings and formerly failing port order.
- `12-missing-desktop` and `13-critical-mobile` — HTTP/critical health.
- `18-neveridle-desktop` — bounded readiness, 1440×13500.
- `20-mixed-desktop` and `21-linksonly-desktop` — resource/link distinction.

For example, the exact primary PNG/trace paths are:

```text
/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/worktrees/visual-health-check/runs/capture-test-2026-09-25T16-13-41.629Z/0-tall-desktop.png
/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/worktrees/visual-health-check/runs/capture-test-2026-09-25T16-13-41.629Z/0-tall-desktop.trace.zip
/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/worktrees/visual-health-check/runs/capture-test-2026-09-25T16-13-41.629Z/1-tall-mobile.png
/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/worktrees/visual-health-check/runs/capture-test-2026-09-25T16-13-41.629Z/1-tall-mobile.trace.zip
/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/worktrees/visual-health-check/runs/capture-test-2026-09-25T16-13-41.629Z/11-health-desktop.result.json
```

Invalid-selector attempts retain traces only; blocked captures retain traces/results without PNGs. These are real local Bun fixtures captured by headless Chromium, not mocked screenshots. They are local evidence, not uploaded reports.

## Export signatures for the commands worker

The following describe existing landed exports, unchanged by worker 2. Imports do not launch a browser or load environment configuration.

### `src/capture.ts`

```ts
const VIEWPORTS: {
  readonly desktop: { readonly width: 1440; readonly height: 900 };
  readonly mobile: { readonly width: 390; readonly height: 844 };
};
type ViewportName = keyof typeof VIEWPORTS;
const TIMEOUTS: {
  navigation: number; networkIdle: number; lazyScroll: number;
  settle: number; screenshot: number;
}; // Defaults: 30000, 15000, 15000, 5000, 30000 ms.
type Timeouts = typeof TIMEOUTS;
const MASK_COLOR = "#FF00FF";
type CaptureState = "captured" | "blocked" | "error";
type CaptureRequest = {
  url: string; viewport: ViewportName; masks: string[]; tracePath: string;
};
type CaptureResult = {
  state: CaptureState;
  detail: string | null;
  health: HealthSnapshot;
  image: { png: Uint8Array; width: number; height: number } | null;
  warnings: string[];
  tracePath: string | null;
};
type SessionOptions = {
  timeouts?: Partial<Timeouts>;
  ignoreHTTPSErrors?: boolean; // Internal self-signed fixtures only; default false.
};
type CaptureSession = {
  validateMasks(selectors: string[]): Promise<void>;
  capture(request: CaptureRequest): Promise<CaptureResult>;
  close(): Promise<void>;
};
class MaskSelectorError extends Error {
  readonly selector: string;
  constructor(selector: string);
}
function openCaptureSession(options?: SessionOptions): Promise<CaptureSession>;
function combineMasks(site: Site, page: SitePage): string[];
function challengeReason(headers: Record<string, string>, html: string): string | null;
```

`Site` and `SitePage` are the existing `Site` and `Page` types from `src/sites.ts`. Combine site/page masks, optionally validate all masks before work, open one session, perform sequential captures with caller-provided trace paths, and close in `finally`. Every capture uses a fresh context, scale 1, service workers blocked, trace recording and no video. Non-GET routed requests are aborted as policy warnings. Invalid CSS throws `MaskSelectorError`; valid unmatched selectors warn. The caller persists returned image and normalized raw health and converts local paths to report-relative artifact paths.

### `src/health.ts`

```ts
type HealthSnapshot = {
  status: number | null;
  finalUrl: string;
  criticalError: boolean;
  consoleErrors: string[];
  failedRequests: { url: string; status: number | null }[];
  mixedContent: string[];
};
type Severity = "warning" | "failure";
type HealthFinding = {
  severity: Severity;
  kind: "status" | "critical-error" | "console-error" | "failed-request" | "mixed-content";
  detail: string;
};
class HealthFormatError extends Error {
  constructor(field: string, detail: string);
}
const CRITICAL_ERROR_PHRASE = "There has been a critical error on this website";
function normalizeHealth(h: HealthSnapshot): HealthSnapshot;
function parseHealth(value: unknown): HealthSnapshot;
function evaluateHealth(actual: HealthSnapshot, baseline: HealthSnapshot | null): HealthFinding[];
```

Persist exactly the raw snapshot, not findings. `parseHealth` accepts already-parsed JSON and validates/normalizes it. Normalization sorts and deduplicates while keeping URL queries and distinct statuses. Existing baseline console messages and failed URL/status pairs warn; new ones fail. Main status >=400 (or absent response), critical errors and mixed content always fail.

### `src/compare.ts`

```ts
type Dimensions = { width: number; height: number };
type Comparison =
  | {
      state: "same" | "changed";
      baseline: Dimensions; actual: Dimensions;
      dimensionsChanged: boolean;
      diffPixels: number | null;
      ratio: number | null;
      allowance: number;
      diffPng: Uint8Array;
    }
  | { state: "error"; detail: string };
function comparePng(
  baselinePng: Uint8Array, actualPng: Uint8Array, allowance: number,
): Comparison;
```

Pass `site.max_diff_pixel_ratio` from the site loader (which owns its default/validation). Pixelmatch threshold is fixed at 0.1. Equal dimensions change only when ratio exceeds allowance. Different dimensions always change and return a padded diff with null ratio/count. Decode errors return the error variant.

### `src/report/model.ts`

```ts
type FormResult = {
  selector: string;
  plugin: "gravity" | "fluent" | "unknown";
  outcome: "delivered" | "delivered-spam" | "not-verified" | "rejected" | "unsupported" | "failed";
  detail: string;
};
type VisualState = "same" | "changed" | "missing-baseline" | "error" | "not-compared";
type ViewportResult = {
  viewport: ViewportName;
  capture: { state: CaptureState; detail: string | null };
  visual: {
    state: VisualState; detail: string | null;
    baseline: Dimensions | null; actual: Dimensions | null;
    ratio: number | null; allowance: number;
  };
  health: HealthFinding[];
  warnings: string[];
  artifacts: {
    actualPng?: string; actualHealth?: string;
    baselinePng?: string; baselineHealth?: string;
    diffPng?: string; trace?: string;
  };
};
type PageResult = {
  path: string; pageKey: string;
  viewports: Record<ViewportName, ViewportResult>;
  forms?: FormResult[];
};
type SiteResult = { slug: string; url: string; pages: PageResult[] };
type RunReport = { runId: string; sites: SiteResult[] };
type Manifest = { schemaVersion: 1; command: "check"; report: RunReport };
```

Keep site/page order from configuration and include both named viewport results. Artifact fields are paths relative to the run directory and only present when files exist. Capture, visual outcome and health findings remain independent. Forms is an optional contract for later implementation. The versioned manifest is intended as the final completion marker for a check report.

## Known limitations

- Mixed-content detection combines observed requests, browser diagnostics and selected DOM resource attributes. The DOM fallback does not scan CSS `url()` or arbitrary script-built URLs; if neither network nor diagnostics expose those, coverage is incomplete. `srcset` uses a simple comma split.
- Bot-block detection recognizes 403 and explicit known Cloudflare/Sucuri markers, not every possible vendor challenge. Fixtures exercise those cases and ordinary CAPTCHA text.
- Readiness limits allow capture with warnings. They do not guarantee all asynchronous or infinite content has completed; real dynamic content can still vary and need masks.
- GET-only routing prevents the tested POST/fetch/beacon traffic; it does not guarantee a server treats every GET as side-effect free.
- Browser launch/context/tracing/page setup failures can reject before the capture result-producing try block; command callers should handle infrastructure rejection and always close sessions. Such failures were not fault-injected in this unit.
- Raw health parser validates shape/types, not HTTP status ranges or URL semantics. Comparison expects a loader-validated allowance.
- Report interfaces are compile-time contracts; renderer, manifest persistence and command integration remain later work. README still describes the foundation stage and needs later command-level documentation.

## Unverified criteria

- No outstanding brief-2 remainder criterion: exact-membership/order fix, debug cleanup, all 24 targeted tests, typecheck, export handoff and actual artifact evidence are complete.
- Original unit's strict CSS masks, GET-only policy, raw health shape and Forms/report interfaces remain intact. Animation/transition/caret suppression, return-to-top logic and trace/no-video settings were inspected in source and exercised by the fixture, but no separate assertion measures each of those properties individually.
- No independent initial red evidence for the original health/PNG implementation is available here; only B's preserved 23-pass/1-fail integration run is asserted.
- No live WordPress site, R2, Forms execution, command/report integration, whole-suite, or real-network reliability claim is made. Those belong to subsequent units/lifecycle validation.

Section 8 of brief-2 was reread before writing this report. No environment files were opened, printed or modified; Bun runs used `--no-env-file`. No subagents, commits, lifecycle calls or user questions were made.
