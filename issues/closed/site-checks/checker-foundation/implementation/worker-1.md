# Worker 1 report: bootstrap, site configuration and environment reader

Worktree: `/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/worktrees/checker-foundation`. Base `93cf3b7`. Nothing committed and no lifecycle commands run. `.env`, `.env.*` and `.env.example` were not opened, printed or written. `.env.example` mtime is still `2026-09-25 15:41:19`, size 64. Child processes started by the tests use `--no-env-file` and a temp cwd, so a local `.env` cannot leak into them.

## Changed files and reasons

- `package.json`: private ESM Bun project. Scripts are `test` = `bun test`, `typecheck` = `tsc --noEmit` and `store:selftest` = `bun --env-file=.env scripts/store-selftest.ts`. The selftest script belongs to unit 2 and does not exist yet. Dev dependencies are `typescript@^7.0.2` and `@types/bun@^1.4.2` only (criterion 5).
- `bun.lock`: lockfile from `bun add -d typescript @types/bun` (criterion 5).
- `tsconfig.json`: `strict`, `noEmit`, `noUncheckedIndexedAccess`, bundler resolution, `types: ["bun"]`, and `include: ["src", "scripts", "tests"]` (criterion 5).
- `.gitignore`: kept all existing entries (`issues/worktrees/`, `issues/seeds/`, `.lock`, `.env`, `node_modules/`) and appended `runs/` (criterion 5).
- `src/sites.ts`: `Site`, `Page`, `SitesConfigError`, `loadSites` and `pageKey` (criteria 1–3).
- `src/env.ts`: `R2Config`, `EnvError` and the lazy `readR2Config` (criteria 3–4).
- `sites.example.yaml`: the design's literal schema on the `acme.example.com` example domain, with both string and object page forms (criterion 5).
- `tests/sites.test.ts` and `tests/env.test.ts`: tests for criteria 1–4, using temp YAML fixtures and synthetic env maps only.

## Exported interfaces

`src/sites.ts`:
```ts
export type Page = { path: string; mask: string[] };
export type Site = { slug: string; url: string; form_helper: boolean; mask: string[]; max_diff_pixel_ratio: number; pages: Page[] };
export class SitesConfigError extends Error { readonly site: string; readonly field: string }
// message: "<file>: <site>: <field>: <detail>", e.g. "sites.yaml: acme: url: must not end with \"/\""
export function loadSites(path = "sites.yaml"): Site[];   // synchronous, UTF-8, Bun.YAML
export function pageKey(path: string): string;            // "/" → "home", "/a/b/" → "a-b"
```
- `site` is the slug when it is valid. It falls back to `site[<index>]` when the slug is missing or invalid, and to `<root>` for errors about the file as a whole.
- `field` names the part that failed: `url`, `mask[1]`, `pages[2].path`, `pages[0].mask[0]`, the unknown key's name (`colour`, `pages[0].wait`), `<site>` when an entry is not a mapping, `<file>` for a read error, or `<yaml>` for a parse error.
- Read errors report only the errno code. Parse errors report Bun's parser message, which I checked contains no source text. File contents are never echoed.
- `pageKey` removes leading and trailing slashes and joins path segments with `-`. Any character outside `[A-Za-z0-9._-]`, including `%`, becomes uppercase `%XX` UTF-8 bytes, so each segment's encoding is reversible.
- Within a site, duplicate paths and page-key collisions are rejected with field `pages[i].path`. Collisions are compared case-insensitively, which covers `/` vs `/home/`, `/a/b/` vs `/a-b/`, `/a` vs `/a/` and `/About/` vs `/about/`.

`src/env.ts`: this is the env interface for unit 2.
```ts
export type R2Config = { accessKeyId: string; secretAccessKey: string; endpoint: string; bucket: string; region: "auto" };
export class EnvError extends Error { readonly missing: string[] }  // message: "Missing or blank environment variables: A, B"
export function readR2Config(env: Record<string, string | undefined> = process.env): R2Config;
```
- It reads `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_ENDPOINT` and `S3_BUCKET`, in that order. It reports every missing or whitespace-only name at once and never includes values.
- Values are returned untrimmed. The returned object's field names match Bun `S3Client` options, so unit 2 can use `new S3Client(readR2Config())`. Unit 2 still needs to confirm that against the installed types, since this unit does not import `S3Client`.
- Nothing reads the environment at import time. The test checks this by importing both modules in a child process with an empty env and getting exit 0.

## Tests run

Red, after writing the tests and before `src/` existed:
```text
$ AKROGON_BASE=93cf3b7f6b99f3a34be7f69c004345c439fa6a76 bun test tests/sites.test.ts tests/env.test.ts
error: Cannot find module '../src/sites.ts' from '.../tests/sites.test.ts'
error: Cannot find module '../src/env.ts' from '.../tests/env.test.ts'
 0 pass
 2 fail
 2 errors
Ran 2 tests across 2 files. [9.00ms]
exit=1
```

Green, final:
```text
$ AKROGON_BASE=93cf3b7f6b99f3a34be7f69c004345c439fa6a76 bun test tests/sites.test.ts tests/env.test.ts
bun test v1.4.2 (744846f84)
 28 pass
 0 fail
 292 expect() calls
Ran 28 tests across 2 files. [53.00ms]
exit=0
```

Extra checks, not a replacement for B's final run: `bunx tsc --noEmit` exited 0, and `git diff --check` exited 0. The shipped `sites.example.yaml` loads in the green run (test "shipped sites.example.yaml loads").

What the tests cover:
- **Criterion 1:** normalization, order, defaults, explicit `form_helper` true/false, and `sites: []`.
- **Criterion 2:** each required negative case, plus:
  - root shape, `sites:` set to null, and unknown root keys
  - site entries that are not mappings
  - slugs that are missing or malformed
  - URL problems: wrong type, scheme, credentials, query, fragment, relative
  - `form_helper` missing or wrong type
  - ratio outside 0–1, NaN, infinite, or a string
  - pages of the wrong type, bad entries, and unknown page keys
  - bad page paths: `a/`, empty, `//`, internal `//`, `?`, `#`, `..`, `.`, `%2e%2e`
  - duplicate paths and key collisions
  - read and YAML errors, including a check that no content leaks
- **Criterion 3:** the `pageKey` examples, determinism, filename safety and encoding cases. The default `sites.yaml` path is tested in a child process with its cwd set to a temp dir. Import is shown to be lazy.
- **Criterion 4:** an explicit mapping plus `region: "auto"`, several missing/blank names reported without values, an empty map, the default `process.env` in a child process with a synthetic env, and a nonzero exit naming `S3_BUCKET` when it is missing.

## Known limitations

- Masks are checked only as nonblank strings. Whether a selector is valid CSS or matches the page needs a browser, which is out of scope.
- The readable key format can collide. Collisions are rejected at load time rather than hashed away, as D3 requires. Keys keep their case, but collisions are detected case-insensitively, so `/About/` and `/about/` together are rejected.
- `%` is allowed in keys as the escape character. It is safe in filenames and R2 keys, but a URL containing such a key must be encoded.
- `sites:` with a null value is rejected, so the operator must write `sites: []`. Missing `sites` is also rejected.
- Page paths are not checked for whitespace or backslashes. Such characters are percent-encoded in keys.
- A URL base may have a path (`https://x.example/sub`) but no trailing slash. Paths are joined to it verbatim by later units.
- README, `src/store.ts`, `tests/store.test.ts` and `scripts/store-selftest.ts` are not implemented, per brief step 4 (unit 2 and later).

## Unverified criteria

- The full `bun test` and `bun run typecheck` are left to B's final verification, per section 7. I ran `tsc --noEmit` only as a sanity check, and it exited 0.
- `.env.example` is only checked by name and mtime; I did not open it, by design. `git check-ignore -v .env runs/x sites.yaml sites.example.yaml .env.example` shows `.env` ignored by line 4 and `runs/` by line 6. `sites.yaml`, `sites.example.yaml` and `.env.example` are not ignored.
- Everything else in criteria 1–5 is verified by the green run above.
