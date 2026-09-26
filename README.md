# Pirax Castrum Maintenance

Visual, health and form checks for a hand-maintained list of WordPress sites, run from the operator's machine.

The checker captures full-page desktop/mobile screenshots, compares them with accepted R2 baselines, and reports visual changes and browser health findings. Baseline creation and approval are explicit operator actions. `check` also fills each site's one designated `test_form` and, **on helper-opted-in sites, submits it at most once per run**; every other form is reported `skipped`. `forms` runs that pass without screenshots. It does not discover pages, update WordPress or schedule runs. See [Form checks](#form-checks) before enabling submission.

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
| `bun --env-file=.env test` | Full suite, including native [plugin](test/plugin/README.md) and [forms](test/forms/README.md) integration and scoped real R2; budget 20–30 minutes. Needs licensed GF ZIP, forms/IMAP and R2 configuration. Missing prerequisites fail, never skip. | Yes |
| `bun --env-file=.env run test:forms` | Browser/config/mail helpers, native Playground checker and scoped report tests. | Yes |
| `bun --env-file=.env run mail:selftest` | Independent real SMTP/IMAP proof; sends one message and leaves it in the dedicated mailbox. | No |
| `bun run typecheck` | `tsc --noEmit` over `src`, `scripts`, `tests` and `test` fixtures. | No |
| `bun run store:selftest` | Real-bucket storage test (see [Storage selftest](#storage-selftest)); runs `bun --env-file=.env scripts/store-selftest.ts`. | Yes |
| `bun run visual:selftest` | Real WordPress/Chromium/R2 integration (see [Visual selftest](#visual-selftest)); runs `bun --env-file=.env scripts/visual-selftest.ts`. | Yes |

Use a listed slug (for example `acme`) or `all` for baseline/check/forms. `approve all` is unsupported. `--sites path/to/sites.yaml` selects an alternative list and may appear before or after the positional arguments. The default is `sites.yaml`; no command rewrites it. An empty valid list with target `all` returns 0 without accessing R2 or launching a browser.

Exit codes for baseline/check/forms/approve:

- `0`: pass or warnings only, successful approval, or an empty selection.
- `1`: visual, health, rejected/failed form, missing/corrupt baseline, blocked capture or operational failure, including report upload/pruning and approval failures.
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

Site and page CSS masks are combined without duplicates. Invalid CSS is configuration exit 2; a valid selector matching nothing produces a warning. Masks hide unstable regions in images, not health findings. With equal dimensions, pixelmatch uses threshold `0.1`; a visual failure occurs only when changed pixels divided by total pixels **exceeds** `max_diff_pixel_ratio` (default `0.01`, equality passes). Any width/height change fails regardless of tolerance; the report shows both dimensions and a diff computed on a padded canvas.

Navigation/load has a 30-second timeout, followed by network idle capped at 15 seconds, lazy-load scrolling down/back up capped at 15 seconds, font/image settling capped at 5 seconds, and a 30-second screenshot timeout. Idle/scroll/settling limits produce readiness warnings; they do not promise a fully settled page. Navigation failure, HTTP 403 or an explicit challenge/interstitial is blocked and fails the run, while later pages/sites continue. A normal CAPTCHA or mention of Cloudflare alone is not classified as a challenge. A 404 is a health failure.

Capture tracks main-document responses through HTTP redirects and client-side navigation. After readiness, it reads the current document's status, challenge evidence and rendered critical-error text before taking the screenshot; iframe and asset responses cannot replace that status. A failed later navigation with no current response, including a policy-aborted POST navigation, or a browser error document is blocked with status `null` and no usable image; an earlier HTTP 200 cannot carry forward. If another navigation races with this final read or screenshot, its image is discarded: a detected navigation reports blocked with retry guidance, while a destroyed execution context reports a capture error. The captured URL is retained while the trace is saved.

Health is separate from pixel comparison:

- New console errors, uncaught JavaScript errors and failed subresource `{url, status}` pairs fail. Identical findings already in baseline health are warnings; removed findings disappear. Query strings and statuses remain significant; transport failures have `status: null`.
- Missing main-document response, final HTTP status >=400, the rendered WordPress critical-error phrase, and HTTP resources on a final HTTPS document always fail, even after baseline/approval. HTTP hyperlinks alone are not mixed content.
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
    max_diff_pixel_ratio: 0.01 # optional, 0–1 (default 0.01)
    test_form: { page: /contact/, plugin: gravity, id: 1 }  # optional; omitted = every form skipped
    pages:                     # required, nonempty; order preserved
      - /
      - /services/
      - path: /contact/
        mask: ['.cookie-banner']   # optional, per page
```

`sites: []` is allowed. Unknown keys at any level are rejected.

`test_form` designates the one form per site that the form pass may fill (see [Designated test form](#designated-test-form)). It is a mapping with exactly `page`, `plugin` and `id`: `page` must equal one of this site's listed page paths exactly as written (trailing slash included), `plugin` is `gravity` or `fluent`, and `id` is the form id as a YAML number, as rendered in `gform_<id>` or `data-form_id="<id>"`. A quoted `'4'`, a fraction, a missing or extra member, or a page not in `pages` is a `SitesConfigError`. There is no default: a site without `test_form` has every form skipped.

`loadSites(path = "sites.yaml"): Site[]` reads the file synchronously and returns:

```ts
type Page = { path: string; mask: string[] };
type TestForm = { page: string; plugin: "gravity" | "fluent"; id: number };
type Site = { slug: string; url: string; form_helper: boolean; mask: string[]; max_diff_pixel_ratio: number; pages: Page[]; test_form?: TestForm };
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
```

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

A new, form-associated native confirmation is required before polling. GF postback/modern AJAX and FF AJAX are supported; GF 3.1.2's exact default-path DOMPurify script may load only after its authorized AJAX POST. Relocated/custom chunks and redirect-only or unfamiliar confirmations fail rather than infer success. Client/native server validation refusals are `rejected`; later pages and sites still run, but no other form of that site is tried instead. Per-page navigation and confirmation normally allow 30 seconds each. The one confirmed ID per site then gets **at most five minutes** for real mailbox verification, including connection/command waits; sites run sequentially. Delayed queues can arrive after a failed result. There is no public polling-shortcut flag.

| Outcome | Run effect |
| --- | --- |
| `delivered` | Pass: exact tagged Subject found in configured inbox folder. |
| `delivered-spam` | Warning: spam match wins even if also found in inbox. |
| `not-verified`, `unsupported` | Warning, not proof of delivery. |
| `skipped` | Neutral (counts as pass): not the designated test form, or no `test_form`; never filled or submitted, and not delivery evidence. |
| `rejected`, `failed` | Failure, exit 1 (including missing confirmation, delivery timeout or `test form not found`). |

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
| `GRAVITY_FORMS_ZIP` | Native tests only: absolute licensed **3.1.2** ZIP path from gravityforms.com → account → Downloads. |

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
- Real integration evidence covers normal storage, authentication, cleanup and retention. Deliberate R2 network/list/upload/prune failures and partial replacement caused by a real network failure were not induced; nontransactional failure handling is not a claim of verified fault recovery.
- Playground 3.1.55 initially binds all interfaces; the fixture bridge closes and rebinds to loopback before readiness, leaving a short upstream startup interval. Download availability and other WordPress/theme/plugin versions remain outside the demonstrated fixture coverage.
- The readable page-key format can collide. Collisions are rejected, not resolved.
- Retention is not transactional. Prune only when no report run is in progress.
- A folder-marker object such as `reports/<runId>/`, created outside this library, makes `pruneReports` reject with `StoreError` once its run expires. Bun's S3 client strips the trailing `/`, so it cannot address that exact key and would hit `reports/<runId>` instead. The marker is neither deleted nor skipped. Remove such markers with the tool that created them; this library never creates them.
- `pruneReports` deletes objects one request at a time. This is fine for tens of runs; very large reports will be slow.
- The selftest proves behaviour for the configured bucket and token. It does not check token scope beyond what it exercises, such as whether the token can also reach other buckets.
- If cleanup itself fails (for example the network drops), objects may remain under the printed `test/...` root. Delete that prefix by hand.
