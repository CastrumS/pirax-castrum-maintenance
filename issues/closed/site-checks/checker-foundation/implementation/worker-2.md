# Worker 2 report: R2 store, real selftest and operator documentation

Worktree: `/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/worktrees/checker-foundation`. Base `93cf3b7`. Nothing was committed and no lifecycle commands were run.

`.env`, `.env.*` and `.env.example` were not opened, printed or written. `.env.example` still has mtime `2026-09-25 15:41:19` and size 64. Credentials were used only through `bun --env-file=.env …` processes, which printed booleans, counts and names, never values.

## Changed files and reasons

All four files are new. No existing file was modified: unit 1's package script, tsconfig include list and `runs/` ignore already covered this unit.

- `src/store.ts`: `Store`, `StoreOptions`, `StoreError`, `createStore`, the lazy `store`, and the pure helpers `isRunId` and `expiredReportKeys` (criteria 1–2).
- `tests/store.test.ts`: criteria 1, 2 and 4, with no backend. Requests go to a synthetic config whose endpoint is a closed local port (`127.0.0.1:9`), so a `StoreError` proves validation ran before any request. CLI children use `--no-env-file`, a temp cwd, and the four variables explicitly blank.
- `scripts/store-selftest.ts`: the real-R2 selftest with `finally` cleanup and a sanitised artifact (criteria 3–5).
- `README.md`: setup, commands, schema, errors, page keys, storage layout, API, retention, selftest mutation and cleanup, artifact, and limitations. It makes no claims about baseline, check or approve commands (criterion 5).

## API (`src/store.ts`)

```ts
export class StoreError extends Error {}
export type Store = {
  put(key: string, data: Uint8Array | Blob): Promise<void>;
  get(key: string): Promise<Uint8Array>;          // S3Error (NoSuchKey) rejection when missing
  list(prefix: string): Promise<string[]>;        // follows continuation tokens; sorted; relative to root
  presign(key: string, seconds: number): string;  // GET; integer 1–604800
  delete(key: string): Promise<void>;
  pruneReports(keep?: number): Promise<void>;     // default 10
};
export type StoreOptions = { config?: R2Config; root?: string; pageSize?: number };
export function createStore(options?: StoreOptions): Store;
export const store: Store;                        // = createStore(): whole bucket, env read on first use
export function isRunId(id: string): boolean;     // canonical toISOString().replaceAll(":", "-") only
export function expiredReportKeys(keys: string[], keep = 10): string[];  // pure retention selection
```

Validation:

- `createStore` synchronously checks `root` (`""`, or safe segments ending in `/`) and `pageSize` (integer 1–1000).
- Keys must be nonempty, with no empty, `.` or `..` segments, no backslash, no control characters, and root plus key at most 1024 bytes.
- The `list` prefix is `""` or a safe path with an optional trailing `/`.
- `keep` must be an integer ≥ 0.
- All of these throw or reject `StoreError` before any request.

Implementation:

- The client is `new S3Client(config ?? readR2Config())`, created lazily on first use. `R2Config` matches `S3Options` directly, and typecheck confirms it.
- `list` loops `S3Client.list({ prefix: root + prefix, maxKeys: pageSize, continuationToken })` until the response is no longer truncated. It throws if a truncated response has no token, or if a returned key falls outside the root.
- `pruneReports` validates `keep`, lists `reports/` fully, computes `expiredReportKeys`, and deletes each key in order. The first error rejects the call.
- Retention groups keys shaped `reports/<id>/<rest…>` whose `<id>` passes `isRunId`. It sorts distinct IDs and deletes all objects of every ID after the newest `keep`. Direct `reports/` objects, malformed IDs, neighbouring prefixes and baselines are never selected.

## Tests run

Red, with the test file written and `src/store.ts` absent:

```text
$ AKROGON_BASE=93cf3b7f6b99f3a34be7f69c004345c439fa6a76 bun test tests/store.test.ts
error: Cannot find module '../src/store.ts' from '.../tests/store.test.ts'
 0 pass
 1 fail
 1 error
Ran 1 test across 1 file. [4.00ms]
exit=1
```

Red for criterion 4 after `src/store.ts` existed, before the selftest script existed. The store tests passed and the two CLI tests failed:

```text
(fail) store:selftest missing configuration > all blank: nonzero, names all four, no artifact
(fail) store:selftest missing configuration > one blank: names only it and prints no values
 14 pass
 2 fail
 121 expect() calls
Ran 16 tests across 1 file. [37.00ms]
```

Green, final:

```text
$ AKROGON_BASE=93cf3b7f6b99f3a34be7f69c004345c439fa6a76 bun test tests/store.test.ts
bun test v1.4.2 (744846f84)
 16 pass
 0 fail
 130 expect() calls
Ran 16 tests across 1 file. [48.00ms]
exit=0
```

Sanity checks only; B owns the final run: `bunx tsc --noEmit` exited 0 and `git diff --check` exited 0.

Real selftest, final run through the package script:

```text
$ bun run store:selftest
$ bun --env-file=.env scripts/store-selftest.ts
store:selftest root test/2026-09-25T13-53-34.850Z-1968a7df/
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
ok   cleanup test/2026-09-25T13-53-34.850Z-1968a7df/ (deleted 10)
PASS artifact runs/store-selftest-2026-09-25T13-53-34.850Z.json
exit=0
```

An earlier run, `bun --env-file=.env scripts/store-selftest.ts`, used root `test/2026-09-25T13-51-45.602Z-7d3cc4ee/` and produced the same checks and exit 0. Its artifact is `runs/store-selftest-2026-09-25T13-51-45.602Z.json`. After it, I made one cosmetic change so the artifact's `startedAt` is canonical ISO rather than the hyphenated stamp, then re-ran.

Post-run verification, read-only:

```text
test/2026-09-25T13-51-45.602Z-7d3cc4ee/ remaining=0
test/2026-09-25T13-53-34.850Z-1968a7df/ remaining=0
values in artifact: false, X-Amz: false
.gitignore:6:runs/	runs/store-selftest-2026-09-25T13-51-45.602Z.json
```

A read-only `get` of a nonexistent key under `test/nonexistent-probe/` printed `name=S3Error code=NoSuchKey`. That is the only error form the README quotes.

What each selftest check proves:

- **Criterion 3, pagination.** A raw `S3Client.list` at `maxKeys: 5` returned at most 5 keys with `isTruncated: true`, so R2 honours the small page size. The page-size-5 store's full listing of 46 objects equals the unpaged listing. All prune, verify and cleanup listings use the page-size-5 store, so retention and cleanup cross page boundaries.
- **Criterion 3, retention exactness.** After each prune, `expectExactly` compares the complete root listing with the expected key set and re-downloads every expected object to compare bytes. This covers the probes, 8 sentinels and the surviving runs.
- **Criterion 3, sentinels.** The sentinels are baseline png/health, a direct `reports/index.html`, `reports/not-a-run/`, a run ID without milliseconds, an impossible date (Feb 30), `reports-old/<id>/` and `other/reports/<id>/`.
- **Criterion 4.** With all four variables blank, the command exits nonzero, names all four and creates no `runs/`. With only `S3_BUCKET` blank, it names only that variable and prints none of the synthetic values or the endpoint. Both run in a child with no env file. The script exits 2 before building any client.

## Known limitations

- **Failure paths not exercised against real R2.** A failed check, or a failed cleanup, should still write a `fail` artifact and exit 1. No fault injection was built, per the no-mocks rule, and neither real run failed. That path is verified by code reading only.
- **Retention is not transactional.** Deletes are sequential, one per object, and marked with a `ponytail:` comment. A prune that fails mid-way rejects, but objects already deleted stay deleted. Concurrent writers and pruners are not coordinated, as the README documents.
- **Sort order.** `list` sorts keys by JavaScript's default UTF-16 order. For the ASCII keys this layout produces, that equals S3's byte order.
- **Page size is not tunable in production.** `pageSize` is exposed on `createStore`, and the production `store` uses the service default of 1000.
- **The artifact does not record the pagination proof itself.** It keeps only the check's pass/fail and counts. The raw first page's `isTruncated` is asserted inside the check but not stored separately.
- **No artifact on missing configuration.** The exit-2 path deliberately writes none, as documented in the README.

## Unverified criteria

- **Criterion 3, the cleanup-failure branch** ("cleanup error is failure"): implemented but not triggered against real R2, for the reason above. Successful cleanup was verified, with `remaining=0` for both roots.
- **Full suite and `bun run typecheck`:** left to B's final verification, per section 7.
- **Everything else in criteria 1–5:** verified by the outputs above.
