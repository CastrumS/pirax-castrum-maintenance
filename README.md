# Pirax Castrum Maintenance

Visual and health checks for a hand-maintained list of WordPress sites, run from the operator's machine.

The checker captures full-page desktop/mobile screenshots, compares them with accepted R2 baselines, and reports visual changes and browser health findings. Baseline creation and approval are explicit operator actions. It does not discover pages, update WordPress, submit forms or schedule runs.

## Pirax Form Test plugin

**Pirax Form Test** is a small WordPress plugin that lets an operator submit real test entries through a client's Gravity Forms or Fluent Forms forms. The notifications from those entries go to the operator's test mailbox, never to the client.

- Plugin behaviour, settings, supported versions and rollout: [`plugin/pirax-form-test/README.md`](plugin/pirax-form-test/README.md)
- Local test harness, credentials and evidence: [`test/plugin/README.md`](test/plugin/README.md)

Building and testing it additionally requires Node, `zip`/`unzip`, and a C++ toolchain for one native dev dependency (see the test README).

```sh
bun run build:plugin           # → dist/pirax-form-test.zip, the uploadable plugin (allowlisted files only)
bunx playwright install chromium
bun run test:plugin            # real WordPress + Gravity Forms + Fluent Forms suites; needs credentials
```

The plugin suites need `GRAVITY_FORMS_ZIP` and `FORM_TEST_TOKEN`. From a worktree, pass the registered repository's environment file with `bun --env-file=<registered-repo>/.env run test:plugin`. `dist/`, `artifacts/` and `.cache/` are generated and ignored by git.

## Setup

Production commands require [Bun](https://bun.sh) 1.4 or newer, Playwright Chromium with its system libraries, and private Cloudflare R2 access. Node 24, OpenSSL and WordPress downloads are additional integration-selftest requirements only; see [Visual selftest](#visual-selftest).

```sh
bun install
bunx playwright install chromium
cp -n sites.example.yaml sites.yaml   # only creates sites.yaml if missing; then list your real sites
```

Create `.env` in the repository root with the four names from `.env.example`:

| Variable | Value |
| --- | --- |
| `S3_ACCESS_KEY_ID` | Cloudflare dashboard → R2 → Manage API tokens → create an **Object Read & Write** token scoped to the bucket. |
| `S3_SECRET_ACCESS_KEY` | The secret of that token. |
| `S3_ENDPOINT` | `https://<account-id>.r2.cloudflarestorage.com`, using the account ID from the R2 overview page. |
| `S3_BUCKET` | The exact name of the bucket you created. |

`.env` is gitignored. `.env.example` lists the names with empty values and is committed. Never commit real values or paste them into issues or logs.

## Commands

| Command | What it does | Needs R2 |
| --- | --- | --- |
| `bun run baseline <slug\|all> [--sites file]` | Capture and replace PNG/raw-health baseline pairs at both widths. | Yes |
| `bun run check <slug\|all> [--sites file]` | Compare with baselines and publish a private report, including expected failures. Never changes baselines. | Yes |
| `bun run approve <slug> [pagePath] [--sites file]` | Promote exact actual PNG/health bytes from the latest completed remote check containing that site. | Yes |
| `bun --no-env-file test tests` | Credential-free unit/helper, CLI and local browser tests; browser cases require installed Chromium. `bunfig.toml` excludes `issues/**` worktrees from discovery. | No |
| `bun test` | Everything above plus the Playground-backed [plugin suites](#pirax-form-test-plugin) under `test/plugin/` (about 10 minutes). Those need `GRAVITY_FORMS_ZIP` and `FORM_TEST_TOKEN`, which Bun loads from `.env`, and fail by name when they are missing. | No |
| `bun run typecheck` | `tsc --noEmit` over `src`, `scripts`, `tests` and `test` fixtures. | No |
| `bun run store:selftest` | Real-bucket storage test (see [Storage selftest](#storage-selftest)); runs `bun --env-file=.env scripts/store-selftest.ts`. | Yes |
| `bun run visual:selftest` | Real WordPress/Chromium/R2 integration (see [Visual selftest](#visual-selftest)); runs `bun --env-file=.env scripts/visual-selftest.ts`. | Yes |

Use a listed slug (for example `acme`) or `all` for baseline/check. `approve all` is unsupported. `--sites path/to/sites.yaml` selects an alternative list and may appear before or after the positional arguments. The default is `sites.yaml`; no command rewrites it. An empty valid list with target `all` returns 0 without accessing R2 or launching a browser.

Exit codes for baseline/check/approve:

- `0`: pass or warnings only, successful approval, or an empty selection.
- `1`: visual, health, missing/corrupt baseline, blocked capture or operational failure, including report upload/pruning and approval failures.
- `2`: usage, site-list, CSS-selector or missing/blank credential configuration error.

### Before and after manual updates

For first setup, inspect the site and establish its accepted state:

```sh
bun run baseline acme
bun run check acme
# Alternative list, for example:
bun run check all --sites path/to/sites.yaml
```

Before a maintenance session, run `bun run check acme` and resolve existing unexpected findings. Perform WordPress/plugin/theme updates manually, then run `bun run check acme` again. Review its local or private report at both widths. Repair regressions and recheck; accept intended changes explicitly:

```sh
bun run approve acme /contact/  # only this currently listed page, both widths
# Or: bun run approve acme     # every currently listed page, both widths
bun run check acme
```

`baseline` replaces complete captured pairs directly, including usable captures with health findings; those findings can still make it return 1. Blocked/incomplete captures preserve existing pairs. `check` never creates a baseline: a missing PNG or health object is a `missing-baseline` failure; corrupt PNG/health is an explicit error. Inspect the site, then run `baseline <slug>` to establish or replace those pairs. Storage/authentication failures are operational errors, not evidence that a baseline is absent.

Approval reads R2, without recapture or a local-cache requirement. It scans canonical run IDs newest first, skipping runs without a completion manifest and valid runs for other sites. An invalid manifest encountered during selection is an error. From the newest completed check containing the site, it requires the same configured source URL and complete actual PNG/health evidence for every requested current page at both widths. All selected PNGs, recorded dimensions and health snapshots are validated before any baseline write. A newly listed page absent from that run, blocked/incomplete capture or missing/corrupt evidence fails preflight without writes. It never falls back to an older run or mixes runs; create a fresh check when evidence is unsuitable or pruned.

Baseline and approval writes are **nontransactional**: a write failure can leave partial replacement after successful preflight. Approval stops on that failure. Resolve the cause and rerun the explicit baseline/approve command; recheck afterward. Successful approval returns 0 for byte promotion, even when the promoted capture contains health failures that will still fail the next check.

### Capture, masks and health

Each page gets a fresh browser context at desktop **1440×900** and mobile **390×844**, device scale 1, fixed en-US/UTC/light settings and reduced motion. Mobile means a narrow viewport, not device emulation. Screenshots are full-page, so captured dimensions can exceed the viewport. Animations, transitions, caret and smooth scrolling are disabled for screenshots.

Site and page CSS masks are combined without duplicates. Invalid CSS is configuration exit 2; a valid selector matching nothing produces a warning. Masks hide unstable regions in images, not health findings. With equal dimensions, pixelmatch uses threshold `0.1`; a visual failure occurs only when changed pixels divided by total pixels **exceeds** `max_diff_pixel_ratio` (default `0.01`, equality passes). Any width/height change fails regardless of tolerance; the report shows both dimensions and a diff computed on a padded canvas.

Navigation/load has a 30-second timeout, followed by network idle capped at 15 seconds, lazy-load scrolling down/back up capped at 15 seconds, font/image settling capped at 5 seconds, and a 30-second screenshot timeout. Idle/scroll/settling limits produce readiness warnings; they do not promise a fully settled page. Navigation failure, HTTP 403 or an explicit challenge/interstitial is blocked and fails the run, while later pages/sites continue. A normal CAPTCHA or mention of Cloudflare alone is not classified as a challenge. A 404 is a health failure.

Capture tracks main-document responses through HTTP redirects and client-side navigation. After readiness, it reads the current document's status, challenge evidence and rendered critical-error text before taking the screenshot; iframe and asset responses cannot replace that status. A failed later navigation with no current response, including a policy-aborted POST navigation, or a browser error document is blocked with status `null` and no usable image; an earlier HTTP 200 cannot carry forward. If another navigation races with this final read or screenshot, its image is discarded: a detected navigation reports blocked with retry guidance, while a destroyed execution context reports a capture error. The captured URL is retained while the trace is saved.

Health is separate from pixel comparison:

- New console errors, uncaught JavaScript errors and failed subresource `{url, status}` pairs fail. Identical findings already in baseline health are warnings; removed findings disappear. Query strings and statuses remain significant; transport failures have `status: null`.
- Missing main-document response, final HTTP status >=400, the rendered WordPress critical-error phrase, and HTTP resources on a final HTTPS document always fail, even after baseline/approval. HTTP hyperlinks alone are not mixed content.
- Warnings alone return 0. Raw health snapshots retain all observations, not just new findings.

The browser blocks service workers, page-originated non-GET HTTP requests (including POST/beacon), and WebSocket connections/messages. WebSocket interception is installed for the entire browser context before any page is opened, with no connection to the remote peer. HTTP and WebSocket policy blocks produce read-only-policy warnings, not server asset failures. It does not click forms or admin/update flows. Normal asset GETs are allowed; a remote GET endpoint can itself have side effects, so this policy cannot guarantee an arbitrary site is side-effect-free. Real-site TLS validation stays enabled.

## Site list

`sites.yaml` is operator-owned and committed; it holds no secrets. The tool never discovers pages: you list each page you want checked. A useful sample is the home page, one page per template or post type, and every page with a form.

```yaml
sites:
  - slug: acme                 # lowercase letters/digits, single internal hyphens, unique
    url: https://acme.example.com  # http(s), absolute, no trailing slash
    form_helper: false         # required metadata; visual checks do not execute forms
    mask: ['#hero-slider']     # optional, CSS selectors masked on every page (default [])
    max_diff_pixel_ratio: 0.01 # optional, 0–1 (default 0.01)
    pages:                     # required, nonempty; order preserved
      - /
      - /services/
      - path: /contact/
        mask: ['.cookie-banner']   # optional, per page
```

`sites: []` is allowed. Unknown keys at any level are rejected.

`loadSites(path = "sites.yaml"): Site[]` reads the file synchronously and returns:

```ts
type Page = { path: string; mask: string[] };
type Site = { slug: string; url: string; form_helper: boolean; mask: string[]; max_diff_pixel_ratio: number; pages: Page[] };
```

Site and page masks stay separate in the loader; capture combines them. The loader checks nonblank strings; browser preflight checks CSS syntax.

### Errors

Any problem throws `SitesConfigError` with `.site` and `.field`, and a message `"<file>: <site>: <field>: <detail>"`, for example:

```text
sites.yaml: acme: url: must not end with "/"
```

`site` is the slug, or `site[<index>]` when the slug is missing or invalid, or `<root>` for file-level problems. `field` is the failing part, such as `url`, `mask[1]`, `pages[2].path` or `pages[0].mask[0]`. Read errors report only the error code, and YAML errors report only the parser message, never file contents.

Page paths must start with a single `/` and must not contain a query, fragment, `.`/`..` segments (including `%2e` forms) or empty segments. Backslashes, spaces, tabs, newlines and other ASCII control characters are rejected too, because URL parsing turns `\` into `/` and drops tabs, newlines and trailing spaces, which could hide an off-site `//host` or a `..`. Percent-encode such characters instead, for example `/a%20b/`. A trailing slash is kept as written.

### Page keys and collisions

`pageKey(path)` turns a page path into the filename used in storage: `/` → `home`, `/a/b/` → `a-b`. Leading and trailing slashes are dropped, segments are joined with `-`, and characters outside `A-Z a-z 0-9 . _ -` are written as uppercase `%XX` UTF-8 bytes.

This readable format can map two paths to the same key. Within a site, these are rejected at load time (case-insensitively), rather than letting one baseline overwrite another:

- `/` and `/home/`
- `/a/b/` and `/a-b/`
- `/a` and `/a/`
- `/About/` and `/about/`

Duplicate paths are rejected too. Rename or drop one of the pages to fix it.

## Storage

Baselines and reports live in Cloudflare R2, accessed through Bun's built-in `S3Client`. Fixed layout:

```text
baselines/<slug>/<viewport>/<pageKey>.png
baselines/<slug>/<viewport>/<pageKey>.health.json
reports/<runId>/index.html
reports/<runId>/manifest.json
reports/<runId>/actual/<slug>/<viewport>/<pageKey>.png
reports/<runId>/actual/<slug>/<viewport>/<pageKey>.health.json
reports/<runId>/baseline/<slug>/<viewport>/<pageKey>.png          # when available
reports/<runId>/baseline/<slug>/<viewport>/<pageKey>.health.json  # when available
reports/<runId>/diff/<slug>/<viewport>/<pageKey>.png              # when available
```

`runId` is `new Date().toISOString().replaceAll(":", "-")`, for example `2026-09-25T13-45-07.123Z`, so names sort chronologically.

### Private reports and local evidence

Each check saves `runs/<runId>/index.html`, `manifest.json` and the same relative actual/baseline/diff paths shown above. The HTML contains inline CSS and embedded PNGs, so a single private signed GET renders all available panels without public or unsigned asset requests. Site-derived text is escaped and scripts/external assets are disallowed. HTML uploads use `text/html; charset=utf-8`, JSON `application/json`, and PNGs `image/png`.

The manifest is `{schemaVersion: 1, command: "check", report: RunReport}` from `src/report/model.ts`, recording site URL, page identity, capture/visual/health results and artifact paths. It uploads **last** as the completion marker. Publication then prunes to ten run directories and prints a signed report link valid for up to **604800 seconds (seven days)**. Expected failed checks also publish reports. Upload/prune/presign errors return 1; an already-written local report survives. A local filesystem failure can prevent HTML creation in the first place.

The printed URL is a **bearer capability**: anyone holding it can read the report. Do not paste it into issues, committed files or retained implementation logs. Seven days is signature expiry, not guaranteed retention: global last-ten pruning across all sites can remove it sooner, including a quiet site's latest approval source. Run a fresh check if that source has gone.

Capture traces are local only: `runs/<runId>/traces/<slug>/<viewport>/<pageKey>.trace.zip` when saving succeeds. They include screenshots, snapshots and sources, without video; publication explicitly excludes traces even though manifest metadata may name their paths. Baseline commands retain raw `actual/` files and traces, but do not publish a check report. `runs/` is gitignored and has no automatic local pruning. Reports and traces can contain private site content; review before sharing and remove locally when no longer needed.

Open `runs/<runId>/index.html` in a browser. View a retained trace with the installed Playwright CLI (replace the placeholders):

```sh
bunx playwright show-trace runs/<runId>/traces/<slug>/desktop/<pageKey>.trace.zip
```

The shared `PageResult` supports optional `forms?: FormResult[]`; a supplied value enables a Forms column with plugin, outcome and detail. Outcomes are `delivered`, `delivered-spam`, `not-verified`, `rejected`, `unsupported`, or `failed`. Ordinary visual runs supply no forms. Rendering this data introduces no form submission, email check or form-health gating.

### API

```ts
import { store, createStore, StoreError } from "./src/store.ts";

type Store = {
  put(key: string, data: Uint8Array | Blob): Promise<void>;  // Blob includes Bun.file(...)
  get(key: string): Promise<Uint8Array>;                     // rejects if the object is missing
  list(prefix: string): Promise<string[]>;                   // all pages, sorted, relative to the root
  presign(key: string, seconds: number): string;             // signed GET URL, 1–604800 whole seconds
  delete(key: string): Promise<void>;
  pruneReports(keep?: number): Promise<void>;                // default 10
};

createStore(options?: {
  config?: R2Config;  // default readR2Config(), read on first use
  root?: string;      // "" (default) or a prefix ending in "/"; keys are relative to it
  pageSize?: number;  // keys per list request, 1–1000; default is the service maximum
}): Store;
```

`store` is `createStore()`: the whole bucket, with credentials read on first use. Importing any module needs no environment. On first use, missing or blank variables throw `EnvError`, whose `.missing` and message list every missing name and no values.

Keys and roots are checked before any request. Invalid ones throw `StoreError`: empty keys, leading, trailing or doubled `/`, `.` or `..` segments, backslashes, control characters, or root plus key longer than 1024 bytes. `list` accepts `""` or a safe prefix with an optional trailing `/`. Signed URL expiry, `keep` and `pageSize` are validated the same way.

### Report retention

`pruneReports(keep = 10)` lists everything under `reports/`, groups objects by run directory, keeps the `keep` newest run directories and deletes every object in the older ones. It only touches directories whose name is a canonical run ID. It ignores:

- objects directly under `reports/`,
- directories with malformed or noncanonical names (for example without milliseconds, with colons, or with an impossible date),
- neighbouring prefixes such as `reports-old/`,
- `baselines/`.

`keep` must be a nonnegative integer. `0` removes all recognised report runs. With `keep` runs or fewer, nothing is deleted. Any list or delete error rejects the call, so a partial prune is never reported as success. Run it after a report run has finished: concurrent writers and pruners are not coordinated.

## Storage selftest

`bun run store:selftest` checks `src/store.ts` against the real bucket with the same code production uses. No mocks are involved.

What it writes: everything goes under a fresh root, `test/<timestamp>-<random>/`, which is printed at the start. Nothing outside that root is created, changed or deleted. Real `baselines/` and `reports/` are never touched.

What it checks, in order:

1. Bytes and `Bun.file` uploads round-trip unchanged.
2. `list` returns exactly the uploaded keys.
3. A 60-second signed GET URL, fetched over HTTP, returns the same bytes. Invalid expiries are rejected.
4. `get` of a missing key rejects.
5. With a list page size of 5, the service returns truncated pages. The paged listing of all 46 objects matches the unpaged one.
6. Invalid `keep` values reject and delete nothing.
7. 12 report runs of 3 objects each are pruned to 10. The two oldest runs are gone. Every surviving object keeps its original bytes, and the sentinels survive: baselines, a direct `reports/` object, malformed run directories and neighbouring prefixes.
8. Pruning again, and pruning with `keep` 50, changes nothing.
9. After adding two newer runs, `pruneReports()` keeps 10.
10. `keep` 0 removes every run and leaves the sentinels.

All retention runs use the page-size-5 store, so they cross list page boundaries.

Cleanup: in `finally`, whether or not a check failed, the selftest deletes every object under the test root, confirms the root lists empty, and removes its local temp directory. A cleanup failure makes the command fail and names only the test root.

Exit codes:

- `0`: all checks passed and cleanup succeeded.
- `1`: a check or the cleanup failed.
- `2`: required variables are missing or blank. These are named, no remote access is attempted, and no artifact is written.

Artifact: each run that reaches R2 writes `runs/store-selftest-<timestamp>.json` and prints its path. It records the command, start and finish times, the test root, `result` (`pass`/`fail`), each check with its counts or a sanitised error, and `cleanup` (`ok`, `deleted`, `remaining`, `error`). `runs/` is gitignored.

Output and artifacts never contain credentials, the endpoint, the bucket name, signed URLs or raw error messages. Errors the selftest does not author are reduced to their class and code, for example `S3Error (NoSuchKey)`.

## Visual selftest

`bun run visual:selftest` exercises production commands with real Chromium, disposable WordPress and real R2 authentication/storage. No storage or authentication mocks, paid plugins, Docker, host PHP or host `wp` executable are required. WordPress mutations use WP-CLI against the same live Playground instance over a local stdin/stdout bridge.

Install a compatible **Node 24** for the integration bridge and **OpenSSL** for its disposable HTTPS certificate. Both Playground packages (`@wp-playground/cli` and `@wp-playground/blueprints`) are pinned to **3.1.55**; the fixture pins WordPress **6.8.3**, PHP **8.3** and official WP-CLI **2.12.0**. Network access is required for fixture downloads, including dependency-provided PHP/SQLite assets. The observed working runtime was Node **24.21.0**; Node 26.8.2 on this machine could not load Playground's native dependency. Do not change the global Node selection just for this test:

```sh
mise install node@24
mise exec node@24 -- bun run visual:selftest
# Or use an already installed compatible runtime:
VISUAL_NODE=/path/to/node24 bun run visual:selftest
```

Bun dependencies, installed Chromium and the existing four R2 variables from Setup are also required. The script loads configuration through `bun --env-file=.env`; do not print credential values or inspect/copy environment-file contents into evidence. Its Node child receives only PATH, HOME and a disposable TMPDIR, not R2 variables. The bridge verifies installed fixture-plugin text exactly and the harness checks its served HTML marker before accepting a baseline.

Every remote operation is scoped to a fresh `test/visual-<timestamp>-<random>/` root. Production baselines/reports and the operator site list are untouched. The harness checks changed versus stable WordPress pages at both widths, exact baseline/approval byte fidelity, remote-only page/site approval and negative preflight, new/known health findings, masks, dimension changes, blocked continuation, GET-only enforcement, TLS/mixed content, CLI exits, private HTML rendering/MIME and last-ten retention. It renders fetched report bodies without navigating to the signed URL, so bearer links are not written into traces or summaries.

In `finally`, it stops fixtures, deletes only the test root and confirms that root is empty. Cleanup failure fails the run; the summary names the root for manual cleanup. Local evidence is retained at `runs/visual-selftest-<timestamp>/summary.json`, with scenario results, command exit codes, report/trace paths and cleanup counts. Command reports normally live under `commands/<runId>/index.html`; remote-only approval evidence is moved to a sibling `<runId>-retained/` directory and summary paths are updated. Capture traces use the layout above; browser-reviewed remote reports also retain `remote-report.png`, `remote-report.trace.zip` and `remote-render.json`. Use the summary's exact trace path with `bunx playwright show-trace`.

Exit 0 means all assertions and cleanup passed; exit 1 means a scenario, prerequisite other than missing credentials, or cleanup failed; exit 2 means required R2 variables were missing/blank. Missing prerequisites fail with a retained summary rather than silently skipping. The integration harness does not duplicate every helper/browser test: readiness caps, comparison boundaries, malformed evidence variants and Forms/hostile-text rendering also have targeted coverage in `tests/`.

## Limitations

- Dynamic content, consent overlays, anti-bot challenges and browser/font changes can prevent stable comparison. Masks and consistent environments help; the checker does not bypass protection or prove reliability for all production sites.
- Mixed-content detection combines observed requests, browser diagnostics and resource attributes. It does not exhaustively scan arbitrary JavaScript or nested CSS/imports.
- Full-page PNGs, embedded report images and whole-site approval hold data in memory; reports/traces can be large. There is no tiled capture or streaming comparison.
- Real integration evidence covers normal storage, authentication, cleanup and retention. Deliberate R2 network/list/upload/prune failures and partial replacement caused by a real network failure were not induced; nontransactional failure handling is not a claim of verified fault recovery.
- Playground 3.1.55 initially binds all interfaces; the fixture bridge closes and rebinds to loopback before readiness, leaving a short upstream startup interval. Download availability and other WordPress/theme/plugin versions remain outside the demonstrated fixture coverage.
- The readable page-key format can collide. Collisions are rejected, not resolved.
- Retention is not transactional. Prune only when no report run is in progress.
- A folder-marker object such as `reports/<runId>/`, created outside this library, makes `pruneReports` reject with `StoreError` once its run expires. Bun's S3 client strips the trailing `/`, so it cannot address that exact key and would hit `reports/<runId>` instead. The marker is neither deleted nor skipped. Remove such markers with the tool that created them; this library never creates them.
- `pruneReports` deletes objects one request at a time. This is fine for tens of runs; very large reports will be slow.
- The selftest proves behaviour for the configured bucket and token. It does not check token scope beyond what it exercises, such as whether the token can also reach other buckets.
- If cleanup itself fails (for example the network drops), objects may remain under the printed `test/...` root. Delete that prefix by hand.
