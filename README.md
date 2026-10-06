# Pirax Castrum Maintenance

Visual, health and form checks for a hand-maintained list of WordPress sites, run from the operator's machine.

The checker captures full-page desktop/mobile screenshots, compares them with accepted R2 baselines, and reports visual changes and browser health findings. Baseline creation and approval are explicit operator actions. `check` also fills each site's one designated `test_form` and, **on helper-opted-in sites, submits it at most once per run**; every other form is reported `skipped`. `forms` runs that pass without screenshots. It does not discover pages, update WordPress or schedule runs. See [Form checks](#form-checks) before enabling submission.

## Pirax Form Test plugin

**Pirax Form Test** is a small WordPress plugin that lets an operator submit real test entries through a client's Gravity Forms or Fluent Forms forms. The notifications from those entries go to the operator's test mailbox, never to the client.

- Plugin behaviour, settings, supported versions and rollout: [`plugin/pirax-form-test/README.md`](plugin/pirax-form-test/README.md)
- Local test harness, credentials and evidence: [`test/plugin/README.md`](test/plugin/README.md)

From 0.3.0 the helper updates itself through WordPress's normal plugin updates, from signed GitHub releases of this repository. Sites on 0.2.4 or older need one manual upload first. Only the helper updates itself: the checker never updates WordPress or client plugins. See [Updates](plugin/pirax-form-test/README.md#updates) for verification, limits and key recovery. A marked submission blocked only by plugin versions that are not audited yet is rejected with `Pirax test blocked: awaiting audit of <plugin> <version>`; other compatibility blocks keep `Pirax test blocked: integrations could not be suppressed`. Marker and configuration errors retain their own messages. Helper 0.3.0 and newer emit this diagnosis; sites still on 0.2.4 or older keep the generic message, which the checker reports as `rejected`. The checker reports the awaiting message as an `awaiting-audit` warning (exit 0) and as `failed` (exit 1) once the site has been awaiting audit for more than 72 hours; see [Awaiting-audit refusals](#awaiting-audit-refusals). Releases come from the daily [automatic re-audit](#automatic-re-audit); the updater only consumes them.

Building and testing it additionally requires Node, `zip`/`unzip`, and a C++ toolchain for one native dev dependency (see the test README).

```sh
bun run build:plugin           # → dist/pirax-form-test.zip, the uploadable plugin (allowlisted files only)
bunx playwright install chromium
bun run test:plugin            # real WordPress + Gravity Forms + Fluent Forms suites, plus the full stack; needs credentials
bun --no-env-file test test/plugin/release.test.ts   # release CLI with generated test keys; needs network and an authenticated gh
```

Releases are signed and published with `scripts/release-plugin.ts`, which reads the signing seed only from `PIRAX_HELPER_SIGNING_KEY` in its environment. `--dry-run` only builds and signs into `dist/` and never contacts GitHub; it is for inspection and tests. Without it the script publishes `v<version>` on GitHub after its refusal checks. See [Releasing](plugin/pirax-form-test/README.md#releasing).

The plugin suites need `GRAVITY_FORMS_ZIP`, `FLUENT_FORMS_PRO_ZIP` and `FORM_TEST_TOKEN`. Two of them (`stack-harness`, `compatibility`) run the full audited stack: Gravity Forms, Fluent Forms free and Pro, CleanTalk and FluentSMTP (simulated sending only), each at the exact version pinned in the helper's `AUDITED_VERSIONS` (`plugin/pirax-form-test/includes/compatibility.php`, listed under [Supported versions](plugin/pirax-form-test/README.md#supported-versions-and-behaviour)). That table is the only pin source: the harness, native tests and release manifest read it, and both licensed ZIPs must declare their pinned version. From a worktree, pass the registered repository's environment file with `bun --env-file=<registered-repo>/.env run test:plugin`. `dist/`, `artifacts/` and `.cache/` are generated and ignored by git.

### Automatic re-audit

`.github/workflows/reaudit.yml` keeps the five vendor pins current without operator steps. It runs daily at 03:17 UTC and on manual dispatch, only on `main` of `CastrumS/pirax-castrum-maintenance`, in one repository-wide concurrency group that never cancels a running audit. A passing audit publishes a new helper release automatically; a failing or incomplete gate publishes nothing. The gate is the native test suites plus their hook-inventory assertions. There is no code-diff review, no retry, no skipped test and no automatic widening of the callback inventory.

| Job | Token | Secrets (on one step only) | Does |
|---|---|---|---|
| `audit` | `contents: read`, checkout credentials not persisted | `GPLVAULT_LICENSE_KEY`, `GPLVAULT_PRODUCT_ID`, `GPLVAULT_UPDATER_PASSPHRASE` | `scripts/reaudit/run.ts`: discovery, acquisition, native gate, helper bump checks (below) |
| `publish` | `contents: write`, checkout credentials not persisted | `PIRAX_HELPER_SIGNING_KEY` | `scripts/reaudit/publish.ts`, only after this run's audit succeeded with an audited candidate. Installs nothing and runs no vendor code. |
| `heartbeat` | `contents: write`, checkout credentials not persisted | none | `scripts/reaudit/heartbeat.ts --run` on fresh `main`, even after a failed audit |
| `notify` | `contents: read` | `IMAP_USER`, `IMAP_PASSWORD` | One email when any other job failed or was cancelled |

**Audit.** The job runs on Ubuntu 24.04 with Node 24, Bun 1.4.2, a frozen dependency install, a native toolchain (`build-essential`, `python3`, `gnupg`, `zip`, `unzip`) and Playwright Chromium. Its budget is 150 minutes, of which the native suite may use 105. `run.ts`:

1. Resolves all five upstream versions: Fluent Forms, CleanTalk and FluentSMTP from wordpress.org, Gravity Forms and Fluent Forms Pro through GPL Vault's official updater. The updater is decrypted from `.github/audit/gplvault-updater.zip.gpg` into private scratch and runs in a throwaway Playground. It is activated on the license for this run only. Its own update runs first, and deactivation must be confirmed before the run can succeed. An instance that is already active at start is refused without activating or deactivating it, so a seat this run did not take is never released.
2. **Unchanged** (every version exactly equal to its pin): no suite, commit, tag or release. The run independently verifies the current helper release `v<version>` (read-only, the same checks as after publication). A missing or incomplete release fails the run, so a partial earlier publication is not reported as healthy.
3. **Changed:** acquires all five selected packages and checks each ZIP's main-file `Version` and SHA-256. It then writes only the candidate pins into `AUDITED_VERSIONS` and runs the whole `bun test test/plugin`. That run gets a random per-run `FORM_TEST_TOKEN`, the selected paid ZIPs as `GRAVITY_FORMS_ZIP`/`FLUENT_FORMS_PRO_ZIP`, and the selected free ZIPs in the harness cache. Any failure, skip or todo fails the gate. Every new native `manifest.json` must report exactly the selected versions and ZIP digests, with at least one full-stack run. Only then does `scripts/reaudit/bump.ts` raise the helper patch version and regenerate the plugin guide's current-version section. Typecheck and the core, release, pin-source and bump tests then run on that final source.
4. Scans the retained native evidence (trace ZIP entries included) and its own output for every known secret, and withholds any file with a hit. Private scratch (decrypted updater, paid ZIPs) is always deleted.

On success and failure alike, `evidence/lifecycle.json` keeps the license lifecycle: whether activation and deactivation were attempted and confirmed, the remaining activations before and after, the updater version before and after its own update, and the throwaway site's loopback URL (`http://127.0.0.1:<port>`). A value the client did not report is `null`, never a guess, so unchanged counts (for example 139 and 139) stay distinct from unknown ones.

The result is `decision.json` plus either `summary.json` (failure) or `candidate.json`. The candidate is data, not a patch. It holds the run ID and run attempt, the exact audited `main` commit, old and new pins, package versions and digests (no paths or URLs), the next helper version, a digest of the intended source change and the explicit gate results.

**Publish.** `publish.ts` checks out the triggering commit (never a ref taken from the candidate). It accepts only this run attempt's strictly valid candidate and rebuilds the change with checked-in `bump.ts`; the digest must match. It requires remote `main` to still be the audited commit and `v<next>` to have no tag or release. It then commits exactly the three bump files and pushes them to `main` normally (no force). The release itself comes from the existing [release CLI](plugin/pirax-form-test/README.md#releasing), whose atomic tag claim stays authoritative. Afterwards the release is verified independently: published and latest, exactly three assets, the manifest signature against the shipped `UPDATE_PUBLIC_KEY`, the ZIP hash and contents, the main file's `Version` header and `VERSION` constant, the manifest and embedded pins, the tag's commit, and no known secret in any asset. If `main` advanced since the audit, nothing is published and the next run audits the new commit; a tested candidate is never rebased.

**Notice.** On any failure, `scripts/reaudit/notify.ts --jobs` sends exactly one email to piraxcastrum@gmail.com through Gmail SMTP. The subject is `[pirax-audit] re-audit failed at <stage>: <reason>`. The body names the stage, the old and candidate versions, the cleanup state (with the throwaway site's loopback URL when deactivation was not confirmed), the publication state (with the intended commit and tag once a remote change may exist) and the run URL. It never contains credentials, URLs from GPL Vault, vendor responses or exception text. When a job left no summary in this run attempt (for example a failed install), a fixed summary for that job is sent. A failed send leaves the notice job failed with a safe error, and it is not retried.

**Heartbeat and watchdog.** When `main`'s last commit is at least 30 days old, the heartbeat job commits only `.github/audit/heartbeat.txt` and pushes it to `main`, with no tag or release. This keeps GitHub from disabling the schedule after 60 days without activity. The separate `.github/workflows/reaudit-watchdog.yml` runs daily at 15:43 UTC with `actions: read` and the two mail secrets. It emails when `reaudit.yml` is disabled or missing, or when it has not started for more than 48 hours. A failed audit still counts as alive; failed audits are reported by `reaudit.yml` itself.

**Secrets.** Six repository secrets, provisioned once from the local `.env`: `GPLVAULT_LICENSE_KEY`, `GPLVAULT_PRODUCT_ID`, `GPLVAULT_UPDATER_PASSPHRASE`, `IMAP_USER`, `IMAP_PASSWORD` and `PIRAX_HELPER_SIGNING_KEY`. `bun --env-file=.env scripts/reaudit/setup.ts` sets the first five and refuses to rotate an existing ciphertext or passphrase. `gh secret list --repo CastrumS/pirax-castrum-maintenance` shows names only. GitHub tokens are each job's own `github.token`, so no personal token is stored. No checkout persists it: the publish and heartbeat steps get it as `GH_TOKEN`, and their git pushes ask `gh` for it as a credential helper (`GIT_AUTH` in `scripts/reaudit/heartbeat.ts`), so it is never on a command line or written to disk. No R2 or checker credentials are used.

**Running it by hand.**

```sh
gh workflow run reaudit.yml --ref main --repo CastrumS/pirax-castrum-maintenance
gh workflow run reaudit-watchdog.yml --ref main --repo CastrumS/pirax-castrum-maintenance
bun --env-file=.env scripts/reaudit/notify.ts --selftest   # one labelled harmless notice, to check mail delivery
```

Run `scripts/reaudit/run.ts` locally only in a disposable checkout: it rewrites the pins and helper version, and it needs `GITHUB_RUN_ID` and `GITHUB_RUN_ATTEMPT` (Actions sets both). The workflow's artifacts are `reaudit-evidence-<attempt>` (decision, summary, candidate, lifecycle facts, sanitized suite logs and native manifests; never ZIPs, traces or vendor responses), `reaudit-candidate-<attempt>` and `reaudit-summary-<attempt>-<job>`.

**Reruns.** A GitHub rerun keeps the run ID and the earlier attempts' artifacts. Every artifact name therefore carries the run attempt, and the publisher and notice read only the current attempt's. A rerun never publishes an earlier attempt's candidate, and an earlier summary (for example one with confirmed cleanup) never describes a rerun that failed before writing its own; the notice then sends the fixed fallback with cleanup `unknown`. Rerunning failed jobs cannot publish: a rerun publish job finds no candidate of its attempt and fails. To audit and publish again, dispatch a fresh run on `main` (above).

**After a failed publication.** Pushing to `main` and creating the release are separate operations. If publication fails after the push, the email gives the intended commit and tag and a publication state of `main-pushed`, `tag-claimed`, `release-incomplete` or `unknown`. Inspect remote `main`, the tag's commit and the release assets, then recover as described in [Releasing](plugin/pirax-form-test/README.md#releasing). Never delete a tag, overwrite assets or rerun blindly. Until `v<version>` exists and verifies, every unchanged run fails with `current-release-missing` or `current-release-incomplete`.

**Not yet shown.** The workflow first runs after this change reaches `main`. A real run, release or failure email, a scheduled trigger, and an elapsed-time heartbeat are evidence still to collect, not results of the local tests. See [Limitations](#limitations) for what the job cannot guarantee.

## Setup

Production commands require [Bun](https://bun.sh) 1.4 or newer, Playwright Chromium with its system libraries, and private Cloudflare R2 access. The forms pass additionally requires `zip`/`unzip` for private trace sanitation. Node 24, OpenSSL and WordPress downloads are additional integration-selftest requirements only; see [Visual selftest](#visual-selftest).

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
| `bun run check <slug\|all> [--sites file]` | Capture/compare, then check forms; publish a private report, including expected failures. Never changes baselines. | Yes |
| `bun run forms <slug\|all> [--sites file]` | Desktop forms-only check; no visual capture/comparison or baseline access. | Yes |
| `bun run approve <slug> [pagePath] [--sites file]` | Promote exact actual PNG/health bytes from the latest completed remote check containing that site. | Yes |
| `bun --no-env-file test tests` | Credential-free unit/helper, CLI and local browser tests; browser cases require installed Chromium. `bunfig.toml` excludes `issues/**` worktrees from discovery. | No |
| `bun --env-file=.env test` | Full suite, including native [plugin](test/plugin/README.md) and [forms](test/forms/README.md) integration and scoped real R2; budget about 55 minutes. The release CLI tests in it also need network and an authenticated `gh`. Needs licensed GF and Fluent Forms Pro ZIPs, forms/IMAP and R2 configuration. On a clean checkout run `bun run build:plugin` first: the forms suite uploads the existing `dist/pirax-form-test.zip` and can run before a plugin suite builds it. Missing prerequisites fail, never skip. | Yes |
| `bun --env-file=.env run test:forms` | Browser/config/mail helpers, native Playground checker, scoped report tests and awaiting-audit state/command tests. | Yes |
| `bun --env-file=.env run mail:selftest` | Independent real SMTP/IMAP proof; sends one message and leaves it in the dedicated mailbox. | No |
| `bun run typecheck` | `tsc --noEmit` over `src`, `scripts`, `tests` and `test` fixtures. | No |
| `bun run store:selftest` | Real-bucket storage test (see [Storage selftest](#storage-selftest)); runs `bun --env-file=.env scripts/store-selftest.ts`. | Yes |
| `bun run visual:selftest` | Real WordPress/Chromium/R2 integration (see [Visual selftest](#visual-selftest)); runs `bun --env-file=.env scripts/visual-selftest.ts`. | Yes |

Use a listed slug (for example `acme`) or `all` for baseline/check/forms. `approve all` is unsupported. `--sites path/to/sites.yaml` selects an alternative list and may appear before or after the positional arguments. The default is `sites.yaml`; no command rewrites it. An empty valid list with target `all` returns 0 without accessing R2 or launching a browser.

Exit codes for baseline/check/forms/approve:

- `0`: pass or warnings only (including an `awaiting-audit` form for at most 72 hours), successful approval, or an empty selection.
- `1`: visual, health, rejected/failed form (including an awaiting-audit refusal that has lasted longer than 72 hours), missing/corrupt baseline, blocked capture or operational failure, including report upload/pruning and approval failures.
- `2`: usage, site-list, CSS-selector or missing/blank/invalid credential configuration error.

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

Approval reads R2, without recapture or a local-cache requirement. It scans canonical run IDs newest first, skipping runs without a completion manifest, valid forms-only runs and valid checks for other sites. An invalid manifest encountered during selection is an error. From the newest completed check containing the site, it requires the same configured source URL and complete actual PNG/health evidence for every requested current page at both widths. All selected PNGs, recorded dimensions and health snapshots are validated before any baseline write. A newly listed page absent from that run, blocked/incomplete capture or missing/corrupt evidence fails preflight without writes. It never falls back to an older run or mixes runs; create a fresh check when evidence is unsuitable or pruned.

Baseline and approval writes are **nontransactional**: a write failure can leave partial replacement after successful preflight. Approval stops on that failure. Resolve the cause and rerun the explicit baseline/approve command; recheck afterward. Successful approval returns 0 for byte promotion, even when the promoted capture contains health failures that will still fail the next check.

### Capture, masks and health

Each page gets a fresh browser context at desktop **1440×900** and mobile **390×844**, device scale 1, fixed en-US/UTC/light settings and reduced motion. Mobile means a narrow viewport, not device emulation. Screenshots are full-page, so captured dimensions can exceed the viewport. Animations, transitions, caret and smooth scrolling are disabled for screenshots.

Site and page CSS masks are combined without duplicates. Optional `hide` selectors (site and page, combined the same way) are set to `display: none` for the screenshot, so they also leave the full-page height: use them for pop-ups, rotating sliders and randomly ordered blocks that would otherwise change the page size. Unmatched hides warn and invalid ones are configuration errors, like masks. Invalid CSS is configuration exit 2; a valid selector matching nothing produces a warning. Masks hide unstable regions in images, not health findings. With equal dimensions, pixelmatch uses threshold `0.1`; a visual failure occurs only when changed pixels divided by total pixels **exceeds** `max_diff_pixel_ratio` (default `0.01`, equality passes). Any width/height change fails regardless of tolerance; the report shows both dimensions and a diff computed on a padded canvas.

Navigation/load has a 30-second timeout, followed by network idle capped at 15 seconds, lazy-load scrolling down/back up capped at 15 seconds, font/image settling capped at 5 seconds, and a 30-second screenshot timeout. Idle/scroll/settling limits produce readiness warnings; they do not promise a fully settled page. Navigation failure, HTTP 403 or an explicit challenge/interstitial is blocked and fails the run, while later pages/sites continue. A normal CAPTCHA or mention of Cloudflare alone is not classified as a challenge. A 404 is a health failure.

Capture tracks main-document responses through HTTP redirects and client-side navigation. After readiness, it reads the current document's status, challenge evidence and rendered critical-error text before taking the screenshot; iframe and asset responses cannot replace that status. A failed later navigation with no current response, including a policy-aborted POST navigation, or a browser error document is blocked with status `null` and no usable image; an earlier HTTP 200 cannot carry forward. If another navigation races with this final read or screenshot, its image is discarded: a detected navigation reports blocked with retry guidance, while a destroyed execution context reports a capture error. The captured URL is retained while the trace is saved.

Health is separate from pixel comparison:

- New console errors, uncaught JavaScript errors and failed subresource `{url, status}` pairs fail. Identical findings already in baseline health are warnings; removed findings disappear. Query strings and statuses remain significant; transport failures have `status: null`.
- Missing main-document response, final HTTP status >=400, the rendered WordPress critical-error phrase, and HTTP resources on a final HTTPS document always fail, even after baseline/approval. HTTP hyperlinks alone are not mixed content.
- Benign third-party noise is not reported: `requestStorageAccess: Permission denied`, report-only Content Security Policy messages, Google Maps `<gmp-…>` component and embed-script errors, Facebook pixel error reports, and failed requests to ad/analytics hosts (`ad.doubleclick.net`, `stats.g.doubleclick.net`, `www.google-analytics.com`, `analytics.google.com`). See `BENIGN_CONSOLE` and `BENIGN_REQUEST_HOSTS` in `src/health.ts`.
- Warnings alone return 0. Raw health snapshots retain all observations, not just new findings.

The **visual capture** browser blocks service workers, page-originated non-GET HTTP requests (including POST/beacon), and WebSocket connections/messages. WebSocket interception is installed for the entire browser context before any page is opened, with no connection to the remote peer. HTTP and WebSocket policy blocks produce read-only-policy warnings, not server asset failures. It does not click forms or admin/update flows. Normal asset GETs are allowed; a remote GET endpoint can itself have side effects, so this policy cannot guarantee an arbitrary site is side-effect-free. Real-site TLS validation stays enabled.

## Site list

`sites.yaml` is operator-owned and committed; it holds no secrets. The tool never discovers pages: you list each page you want checked. A useful sample is the home page, one page per template or post type, and every page with a form.

```yaml
sites:
  - slug: acme                 # lowercase letters/digits, single internal hyphens, unique
    url: https://acme.example.com  # http(s), absolute, no trailing slash
    form_helper: false         # fill only; true authorizes submitting the designated test_form
    mask: ['#hero-slider']     # optional, CSS selectors masked on every page (default [])
    hide: ['.newsletter-popup'] # optional, CSS selectors removed before every screenshot
    max_diff_pixel_ratio: 0.01 # optional, 0–1 (default 0.01)
    test_form: { page: /contact/, plugin: gravity, id: 1 }  # optional; omitted = every form skipped
    pages:                     # required, nonempty; order preserved
      - /
      - /services/
      - path: /contact/
        mask: ['.cookie-banner']   # optional, per page
        hide: ['.related-posts']   # optional, per page
```

`sites: []` is allowed. Unknown keys at any level are rejected.

`test_form` designates the one form per site that the form pass may fill (see [Designated test form](#designated-test-form)). It is a mapping with exactly `page`, `plugin` and `id`: `page` must equal one of this site's listed page paths exactly as written (trailing slash included), `plugin` is `gravity` or `fluent`, and `id` is the form id as a YAML number, as rendered in `gform_<id>` or `data-form_id="<id>"`. A quoted `'4'`, a fraction, a missing or extra member, or a page not in `pages` is a `SitesConfigError`. There is no default: a site without `test_form` has every form skipped.

`loadSites(path = "sites.yaml"): Site[]` reads the file synchronously and returns:

```ts
type Page = { path: string; mask: string[]; hide?: string[] };
type TestForm = { page: string; plugin: "gravity" | "fluent"; id: number };
type Site = { slug: string; url: string; form_helper: boolean; mask: string[]; hide?: string[]; max_diff_pixel_ratio: number; pages: Page[]; test_form?: TestForm };
```

Site and page masks stay separate in the loader; capture combines them. The loader checks nonblank strings; browser preflight checks CSS syntax.

### Errors

Any problem throws `SitesConfigError` with `.site` and `.field`, and a message `"<file>: <site>: <field>: <detail>"`, for example:

```text
sites.yaml: acme: url: must not end with "/"
```

`site` is the slug, or `site[<index>]` when the slug is missing or invalid, or `<root>` for file-level problems. `field` is the failing part, such as `url`, `mask[1]`, `pages[2].path`, `pages[0].mask[0]`, `test_form` or `test_form.page`. Read errors report only the error code, and YAML errors report only the parser message, never file contents.

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
state/awaiting-audit/<slug>.json                                   # per-site awaiting-audit clock
```

`state/` sits outside `reports/`, so report pruning never removes it. Baseline and approve never read or write it. See [awaiting-audit refusals](#awaiting-audit-refusals).

`runId` is `new Date().toISOString().replaceAll(":", "-")`, for example `2026-09-25T13-45-07.123Z`, so names sort chronologically.

### Private reports and local evidence

Each check saves `runs/<runId>/index.html`, `manifest.json` and the same relative actual/baseline/diff paths shown above. The HTML contains inline CSS and embedded PNGs, so a single private signed GET renders all available panels without public or unsigned asset requests. Site-derived text is escaped and scripts/external assets are disallowed. HTML uploads use `text/html; charset=utf-8`, JSON `application/json`, and PNGs `image/png`.

The manifest is `{schemaVersion: 1, command: "check", report: RunReport}` from `src/report/model.ts`, recording site URL, page identity, capture/visual/health results and artifact paths. It uploads **last** as the completion marker. Publication then prunes to ten run directories. The CLI prints the local report path and confirms private publication, but withholds the bearer URL from logs: it contains credential identifiers that the privacy boundary would otherwise replace, producing an unusable link. Programmatic `runCheck`/`runForms` results retain `url`, the valid private link signed for **604800 seconds (seven days)**. Expected failed checks also publish reports. Upload/prune/presign errors return 1; an already-written local report survives. A local filesystem failure can prevent HTML creation in the first place.

The API-returned URL is a **bearer capability**: anyone holding it can read the report. Do not paste it into issues, committed files or retained implementation logs. Seven days is signature expiry, not guaranteed retention: global last-ten pruning across all sites can remove it sooner, including a quiet site's latest approval source. Run a fresh check if that source has gone.

Capture traces are local only: `runs/<runId>/traces/<slug>/<viewport>/<pageKey>.trace.zip` when saving succeeds. They include screenshots, snapshots and sources, without video; publication explicitly excludes traces even though manifest metadata may name their paths. Baseline commands retain raw `actual/` files and traces, but do not publish a check report. `runs/` is gitignored and has no automatic local pruning. Reports and traces can contain private site content; review before sharing and remove locally when no longer needed.

Open `runs/<runId>/index.html` in a browser. View a retained trace with the installed Playwright CLI (replace the placeholders):

```sh
bunx playwright show-trace runs/<runId>/traces/<slug>/desktop/<pageKey>.trace.zip
```

`check` attaches `PageResult.forms` after visual capture; a successfully scanned page without forms is `[]`, except the `test_form` page, which gets one `failed` result with detail `test form not found`; discovery failures (including positively identified HTTP-200 challenge/interstitial pages) are explicit failed results. Every discovered form is listed, including `skipped` ones with their reason. Form outcomes participate in page/site/run status (see below). `forms` writes `{schemaVersion: 1, command: "forms", report: FormsRunReport}` with `mode: "forms"`, no viewports or fictitious images. Forms-only uploads are HTML then manifest, with the same global last-ten pruning; they never become approval evidence. A malformed manifest still fails selection rather than being skipped.

## Form checks

**`form_helper: true` is operator attestation, not proof of installation, matching token or audited versions.** Verify the built helper ZIP, settings, notification path and integrations before opting in. A missing/mismatched helper can process a marker as ordinary data and involve clients. Keep unverified sites false. Roll out one site, then a group, then all, with explicit operator go-ahead at every stage; tests do not authorize a rollout. Follow the [helper install/rollout guide](plugin/pirax-form-test/README.md#rollout).

Both commands scan each listed page once for forms at desktop 1440×900, separately from visual desktop/mobile contexts. Only the site's [designated test form](#designated-test-form) is ever filled. If it is a supported Gravity Forms or Fluent Forms form, it gets deterministic test data, `FORM_TEST_ADDRESS` in email fields, and an intact `<FORM_TEST_TOKEN>-<id>` in the first usable textarea or plain text input. Each attempt has a fresh cryptographic 12-character lowercase alphanumeric ID. Hidden nonces/honeypots are preserved. Required checkbox groups use native GF/FF markers (`aria-required` and GF required-field containers): one usable choice per group, plus every individually HTML-required checkbox; optional groups are left unchanged. A designated form with uploads (even hidden), missing/constrained marker fields, external actions, custom/multistep/payment/password flows or GF drafts is unsupported. Unknown or unnumbered forms (such as a GF `gform_0`) cannot match a designation and are always skipped. FF hCaptcha/Turnstile is not verified; no CAPTCHA solving is attempted. Invisible/reCAPTCHA v3 browser flows remain unverified: their client-side execution may be blocked by the frozen request policy and time out as `failed`, even when the helper bypasses server CAPTCHA validation. Specialized GF phone formats/widgets (US Standard and International formatted) are also unverified and may falsely reject fixed test data; do not infer support from basic telephone-input filling.

With helper false, a supported designated form is filled/client-validated but never submitted (`not-verified`). With helper true, the checker permits one selected, marker-bearing native GF/FF browser submission on its audited same-origin route. No direct submission API or automatic retry is used. Initial GET/assets are allowed; requests during filling and unrelated submissions/WebSockets are blocked. This cannot prove arbitrary site JavaScript or GET endpoints side-effect-free. Discovery has a bounded initialization window; indefinitely delayed forms/custom widgets are not covered.

A new, form-associated native confirmation is required before polling. GF postback/modern AJAX and FF AJAX are supported; GF 3.1.2's exact default-path DOMPurify script may load only after its authorized AJAX POST (that hashed chunk name was observed in GF 3.1.2 only; a later GF pin can need this allowance updated). An FF "redirect to a page/URL" confirmation counts only when the authorized POST's own HTTP 200 reply is FF's JSON success with an entry id and a `redirectUrl`; the report keeps only the target's path, and the navigation itself stays blocked. Relocated/custom chunks, GF redirect-only and other unfamiliar confirmations fail rather than infer success. Client/native server validation refusals are `rejected`, except an exact helper [awaiting-audit refusal](#awaiting-audit-refusals), which is a time-limited warning; later pages and sites still run, but no other form of that site is tried instead. Per-page navigation and confirmation normally allow 30 seconds each. The one confirmed ID per site then gets **at most five minutes** for real mailbox verification, including connection/command waits; sites run sequentially. Delayed queues can arrive after a failed result. There is no public polling-shortcut flag.

| Outcome | Run effect |
| --- | --- |
| `delivered` | Pass: exact tagged Subject found in configured inbox folder. |
| `delivered-spam` | Warning: spam match wins even if also found in inbox. |
| `not-verified`, `unsupported` | Warning, not proof of delivery. |
| `awaiting-audit` | Warning while the site has been awaiting a helper audit for at most 72 hours. After that the form is reported `failed` (exit 1). Never a confirmation or delivery evidence. |
| `skipped` | Neutral (counts as pass): not the designated test form, or no `test_form`; never filled or submitted, and not delivery evidence. |
| `rejected`, `failed` | Failure, exit 1 (including missing confirmation, delivery timeout or `test form not found`). |

### Awaiting-audit refusals

The checker recognizes a refusal from a helper that blocks test submissions while installed plugin versions are not yet audited and names them as `Pirax test blocked: awaiting audit of <Plugin label> <version>`, with further `<label> <version>` items joined by `, `. Pirax Form Test 0.3.0 and newer emit this message when only plugin versions block a test. Sites still on 0.2.4 or older answer a version mismatch with the generic `Pirax test blocked: integrations could not be suppressed`, which stays `rejected` (exit 1) until the helper is upgraded. The checker does not keep its own list of plugins or versions. The selected form's result is `awaiting-audit` only when every fresh, visible refusal message of that form matches this text exactly: case-sensitive, at the start of the message, and with a nonempty label and version in each item. GF's native summary heading around the helper paragraph is framing, not a separate refusal. Everything else stays `rejected`:

- the generic `Pirax test blocked: integrations could not be suppressed`;
- near matches, such as a different case, a blank payload, a missing version or the text in the middle of a sentence;
- an awaiting message next to a field error or any other refusal;
- an awaiting message while the selected form is also natively invalid.

Stale messages, another form's messages and messages outside the selected instance are ignored: they cannot establish this attempt's result. Without another fresh, form-associated result the attempt times out as `failed`. An awaiting-audit refusal is never a confirmation: no mailbox polling, no retry and no other form.

Each site slug has one clock, stored as `{"firstSeen": "<canonical UTC ISO timestamp>"}` at `state/awaiting-audit/<slug>.json` in the command's Store. It holds no submitted values, message text or credentials. The clock works as follows:

- **Start.** The first completed `check` or `forms` pass of a site that has an awaiting-audit result records the time.
- **Keep.** Later sightings in either command keep that time, even when the form, plugin or versions in the message change.
- **Warn, then fail.** While at most exactly 72 hours have passed, the result is a warning, and its detail gives the first-seen time and the elapsed duration. Once strictly more than 72 hours have passed, the form becomes `failed`. Its detail keeps the version message and adds the elapsed duration and the 72-hour threshold. Repeated failed sightings do not restart the clock.
- **Clear.** A completed pass of that site with no awaiting-audit result deletes the clock. That covers any other designated-form outcome, helper false, no designation, a designation that is not found, and pages without forms. It also covers page-scan failures: a navigation error, a challenge or interstitial page, or a browser launch failure. Such a run still exits 1. The next sighting then starts a new clock.
- **Not cleared.** Alongside a current awaiting-audit result, skipped forms, duplicate instances and other pages in the same pass do not clear the clock, and page order does not matter. Skipped rows alone keep nothing: a completed pass whose forms are all skipped clears it. A site that is not selected, or whose pass stops on a configuration error, keeps its clock.

The clock is updated before the report is published, so a later upload failure does not undo it. Storage problems never crash the run or escalate on their own:

- Missing state starts a clock.
- Invalid, noncanonical or future-dated state, or a failed read, counts as a first sighting, and the checker attempts to replace it with the current time.
- A failed save is disclosed in the awaiting-audit form's detail and in the command log as `Awaiting-audit state: <slug>: …`. A failed clear is added to the detail of the site's first form row when one exists, otherwise it appears only in the command log. A failed clear is retried on the next pass without an awaiting-audit result.

### Designated test form

Each site submits at most one form per `check` or `forms` invocation: its `test_form`, however many listed pages show that form. After a page's discovery succeeds:

- On the designated page only, the first discovered form in document order whose plugin and rendered id both match is selected, before any per-form browser context, inspection, credential read or typing. Every other discovered form is `skipped`: other GF/FF forms, unknown forms, the same form on other listed pages and further instances of the same plugin/id on that page. Skipped forms are listed with their reason and never filled or submitted.
- A selected form that is unsupported, rejected, changed since discovery or failed is reported as such. There is no retry, and nothing else on the site is filled instead.
- Without `test_form`, every form of that site is `skipped` and no form or mail credentials are read.
- If the designated plugin/id is not on its page after a successful scan, the discovered forms are skipped and one `failed` result (selector `test-form:<plugin>:<id>`) says exactly `test form not found`. The same form on another page does not count. Navigation, discovery or challenge failures stay page-scan failures rather than evidence of absence.
- With `form_helper: false` the designated form is filled but not submitted (`not-verified`).

The limit is per invocation: two separate runs are two attempts, and there is no cross-run lock. A designation names a plugin/id, not a purpose: choose a contact or inquiry form, **never a login/registration or account form**. Password and custom flows stay unsupported if designated, but an ordinary-looking account integration cannot be recognized from the page. Skipped means only that the checker did not fill or submit that form; page scripts and asset GETs during discovery still run.

### Forms/mail configuration

Obtain a **new dedicated mailbox**, not anyone's personal inbox. Enable IMAP/app-password access, create a plus-address or alias, and configure its filter to file tests in a dedicated existing folder. Confirm the provider's exact spam folder name. Add the following names to your private environment; no values belong in the site list or logs. Configuration is lazy: imports/empty selection need none; skipped forms, sites without `test_form`, and unsupported/no-form pages need no forms/mail credentials; filling the designated form needs token/address, and eligible opted-in submission validates IMAP configuration before clicking. Nonempty published commands still need R2. SMTP is only for the independent selftest. A late forms-configuration error during `check` returns 2 after the visual captures: local capture artifacts remain, but no completed HTML/manifest report is written or published.

| Name | Acquisition and format |
| --- | --- |
| `FORM_TEST_TOKEN` | Operator-generated random secret, 16–255 characters `[A-Za-z0-9._~+/=-]`; exactly match helper settings. |
| `FORM_TEST_ADDRESS` | Dedicated mailbox plus-address/alias; one bare address with dotted domain, no display name/list/whitespace. Use it as helper redirect too. |
| `IMAP_HOST`, `IMAP_PORT` | Provider's hostname (no URL) and decimal port 1–65535. Port 993 uses implicit TLS; other ports require STARTTLS. Certificates are verified. |
| `IMAP_USER`, `IMAP_PASSWORD` | Dedicated account login and provider/app password; nonblank, no control characters; not trimmed. |
| `IMAP_FOLDER`, `IMAP_SPAM_FOLDER` | Exact existing provider folder names, no outer whitespace, controls or `*`/`%`; no automatic discovery or creation. Equal names are checked once and treated as spam. |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD` | Selftest only: provider's authenticated sender settings (port 465 implicit TLS, others required STARTTLS), same dedicated account; port 1–65535, nonblank credentials without controls. |
| `GRAVITY_FORMS_ZIP` | Native tests only: absolute path to the licensed Gravity Forms ZIP at the [pinned version](plugin/pirax-form-test/README.md#supported-versions-and-behaviour), from gravityforms.com → account → Downloads. |
| `FLUENT_FORMS_PRO_ZIP` | Native plugin tests only: absolute path to the licensed Fluent Forms Pro ZIP at the [pinned version](plugin/pirax-form-test/README.md#supported-versions-and-behaviour), from fluentforms.com → account → Downloads. |

IMAP uses only the two literal folders with `EXAMINE`, tag-specific UID SEARCH and candidate Subject-only `BODY.PEEK`; no body reads, discovery, flag writes, moves, deletes or mailbox creation. ImapFlow is pinned to **2.0.7**, with the reproducible Bun patch `patches/imapflow@2.0.7.patch` disabling namespace/path rewriting and implicit LIST in opt-in literal-mailbox mode (both runtime builds). Keep the pin/patch and installed-contract tests together when upgrading.

Forms traces are private local action-only ZIPs in `runs/<runId>/traces/forms/`: tracing on, video/screenshots/DOM snapshots/sources off. Action arguments/errors are scrubbed, including encoded variants and JSON UTF-16 surrogate pairs; the token becomes literal `<token>`. Automatic redaction covers account users, passwords, the redirect address and S3 access/secret keys. Hosts, mailbox folder names, S3 endpoints/buckets and the licensed ZIP path are not globally treated as credentials; legitimate site/run paths containing them remain intact. Unsafe trace sanitation fails closed and removes raw files. Traces are never uploaded. Existing visual traces remain separate and unchanged, before typing. Reports can still contain private site information; retain/share carefully.

[Forms test guide](test/forms/README.md) describes native CLI/scoped R2 evidence and the independent real-mail selftest. Playground's logged redirected mail proves submission/isolation/entry cleanup, **not delivery**. SMTP/IMAP proves one independent message's arrival, not a live client's transport. Do not run `forms all` or `check all` against live sites as an integration test.

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

Implementation lessons: [mechanisms and case histories](learnings/LESSONS.md).

## Limitations

- Dynamic content, consent overlays, anti-bot challenges and browser/font changes can prevent stable comparison. Masks and consistent environments help; the checker does not bypass protection or prove reliability for all production sites.
- Mixed-content detection combines observed requests, browser diagnostics and resource attributes. It does not exhaustively scan arbitrary JavaScript or nested CSS/imports.
- Full-page PNGs, embedded report images and whole-site approval hold data in memory; reports/traces can be large. There is no tiled capture or streaming comparison.
- Real integration evidence covers normal storage, authentication, cleanup and retention. Deliberate R2 network/list/upload/prune failures and partial replacement caused by a real network failure were not induced; nontransactional failure handling is not a claim of verified fault recovery. The exception is awaiting-audit state: its list, read, write and delete failures are induced against a closed loopback endpoint, with every other operation on real R2.
- Playground 3.1.55 initially binds all interfaces; the fixture bridge closes and rebinds to loopback before readiness, leaving a short upstream startup interval. Download availability and other WordPress/theme/plugin versions remain outside the demonstrated fixture coverage.
- The readable page-key format can collide. Collisions are rejected, not resolved.
- Retention is not transactional. Prune only when no report run is in progress.
- A folder-marker object such as `reports/<runId>/`, created outside this library, makes `pruneReports` reject with `StoreError` once its run expires. Bun's S3 client strips the trailing `/`, so it cannot address that exact key and would hit `reports/<runId>` instead. The marker is neither deleted nor skipped. Remove such markers with the tool that created them; this library never creates them.
- `pruneReports` deletes objects one request at a time. This is fine for tens of runs; very large reports will be slow.
- The selftest proves behaviour for the configured bucket and token. It does not check token scope beyond what it exercises, such as whether the token can also reach other buckets.
- If cleanup itself fails (for example the network drops), objects may remain under the printed `test/...` root. Delete that prefix by hand.
- The awaiting-audit first-seen time is when the checker first saw the refusal, not when the plugin was updated or an audit was requested.
- R2 has no conditional write or lock. Overlapping runs for one site can race the first write or the clear of its awaiting-audit clock.
- A storage outage or corrupt clock object restarts the clock, which can postpone escalation. So does a completed pass that fails to scan its pages (navigation error, challenge page or browser launch failure): a site that is intermittently unreachable while still blocked can keep postponing escalation, although each such failing run exits 1. A failed clear can leave an old clock in place until a later successful pass.
- Renaming a site leaves its old `state/awaiting-audit/<slug>.json` orphaned. Nothing garbage-collects state for removed slugs.
- **Re-audit depth.** The automatic re-audit accepts a vendor version that passes the native suites and their hook-inventory comparison. A changed callback body, an unexercised module or raw PHP networking outside the tested paths can still change behaviour unseen. This is the accepted audit-depth risk.
- **GPL Vault seat.** Deactivation is attempted and must be confirmed on every catchable path, including SIGINT/SIGTERM. SIGKILL, runner loss or an unreachable GPL Vault can still leave the throwaway site activated; deactivate it from the GPL Vault account. When the run could still report, the failure email and `evidence/lifecycle.json` name that site's loopback URL; after SIGKILL or runner loss there is no report, so look for a `http://127.0.0.1:<port>` activation. The run's log names no license data.
- **Same-host monitoring.** The watchdog runs on the same GitHub Actions scheduler as the audit. It cannot report a platform-wide scheduler outage, or both workflows being disabled, until Actions runs again. Neither email nor SMTP acceptance guarantees delivery.
- **Publication is not transactional.** A pushed pin commit can be followed by a failed or partial release. That is reported as uncertain, never rolled back automatically.
