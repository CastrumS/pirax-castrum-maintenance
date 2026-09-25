# Pirax Castrum Maintenance

Visual and health checks for a hand-maintained list of WordPress sites, run from the operator's machine.

This repository currently contains the **foundation** only:

- the site list format and its loader (`src/sites.ts`),
- on-demand R2 configuration (`src/env.ts`),
- the R2 storage layer with report retention (`src/store.ts`),
- a selftest that exercises the storage layer against the real bucket.

There are no baseline, check or approve commands yet, and no browser code. Later work builds those on top of these modules.

## Setup

Requires [Bun](https://bun.sh) 1.4 or newer.

```sh
bun install
cp sites.example.yaml sites.yaml   # then list your real sites
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
| `bun test` | Unit tests for the site loader, env reader, store validation and retention selection, and the selftest's missing-configuration path. | No |
| `bun run typecheck` | `tsc --noEmit` over `src`, `scripts` and `tests`. | No |
| `bun run store:selftest` | Real-bucket storage test (see [Storage selftest](#storage-selftest)). Runs `bun --env-file=.env scripts/store-selftest.ts`. | Yes |

## Site list

`sites.yaml` is operator-owned and committed; it holds no secrets. The tool never discovers pages: you list each page you want checked. A useful sample is the home page, one page per template or post type, and every page with a form.

```yaml
sites:
  - slug: acme                 # lowercase letters/digits, single internal hyphens, unique
    url: https://acme.example.com  # http(s), absolute, no trailing slash
    form_helper: false         # required; true once pirax-form-test is installed and configured on this site
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

Site and page masks stay separate; consumers combine them.

### Errors

Any problem throws `SitesConfigError` with `.site` and `.field`, and a message `"<file>: <site>: <field>: <detail>"`, for example:

```text
sites.yaml: acme: url: must not end with "/"
```

`site` is the slug, or `site[<index>]` when the slug is missing or invalid, or `<root>` for file-level problems. `field` is the failing part, such as `url`, `mask[1]`, `pages[2].path` or `pages[0].mask[0]`. Read errors report only the error code, and YAML errors report only the parser message, never file contents.

Page paths must start with a single `/` and must not contain a query, fragment, `.`/`..` segments or empty segments. A trailing slash is kept as written.

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
reports/<runId>/...
```

`runId` is `new Date().toISOString().replaceAll(":", "-")`, for example `2026-09-25T13-45-07.123Z`, so names sort chronologically.

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

## Limitations

- Masks are checked only as nonblank strings. Whether a selector is valid CSS or matches the page is not checked, because that needs a browser.
- The readable page-key format can collide. Collisions are rejected, not resolved.
- Retention is not transactional. Prune only when no report run is in progress.
- `pruneReports` deletes objects one request at a time. This is fine for tens of runs; very large reports will be slow.
- The selftest proves behaviour for the configured bucket and token. It does not check token scope beyond what it exercises, such as whether the token can also reach other buckets.
- If cleanup itself fails (for example the network drops), objects may remain under the printed `test/...` root. Delete that prefix by hand.
