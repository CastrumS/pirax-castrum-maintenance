# Unit 2: R2 store, real selftest and operator documentation

## 1. Goal

Implement plan D5–D8 in `/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/worktrees/checker-foundation`, integrating unit 1's lazy environment reader. This is one storage-delivery unit, not the lifecycle B seat. Use Bun's real S3Client, no mocks. Finish README for the full implemented foundation.

## 2. Numbered acceptance criteria

1. Lazy exported `store` and scoped factory support put/get/list/presign/delete/pruneReports with types below. Importing needs no env; missing get rejects. Validate unsafe keys, positive supported presign expiry, keep (finite nonnegative integer) and factory scope/page-size options before any request. Exhaust list continuation tokens, returning sorted keys relative to the scope.
2. Retention keeps newest distinct canonical UTC millisecond ISO report directories (colons replaced by hyphens), removes every object in older directories, and ignores direct reports objects, malformed IDs, neighboring directories and baselines. Default 10; zero removes all recognized reports; count ≤ keep is no-op. Fail on deletion/list errors.
3. `bun run store:selftest` uses a unique timestamp-based test root in real R2 and proves binary/file roundtrip, list, fetched signed GET byte equality, missing get rejection, 12 multi-object report runs pruned to 10 with exact intact survivors, sentinels, default/zero/no-op/invalid keep, and real pagination using a small configured list page size. It cleans its entire remote root and local temp files in finally; cleanup error is failure. No production prefixes may be mutated.
4. Missing/blank named env vars make the selftest command nonzero before mutations, naming all missing variables without values. Tests of this CLI path use a child with the four variables explicitly blank (or no-env-file and temp cwd) to defeat automatic dotenv loading.
5. Selftest writes sanitized machine-readable evidence under ignored `runs/` (root, checks/counts, pass/fail, cleanup) and prints its path. Never print raw errors, signed URLs, credentials or bucket/account identifiers. README explains runnable setup, schema, API/layout, selftest mutation/cleanup, artifacts and real limitations, not unimplemented browser/check/approve commands.

## 3. Read-first list

- `/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/open/site-checks/checker-foundation/{plan.md,design.md,implementation/worker-1.md}`.
- `/home/rudi/.pi/agent/skills/implement-issue/ponytail.md`.
- Worktree `src/env.ts`, `src/sites.ts`, `package.json`, `tests/env.test.ts` (copy child isolation pattern), installed `node_modules/bun-types` S3 declarations for actual API.

## 4. Change list and needed interfaces

Create `src/store.ts`, `tests/store.test.ts`, `scripts/store-selftest.ts`, `README.md`. Update existing files only for a concrete integration requirement, report it; do not alter site behavior. Unit 1 already supplies package scripts and strict TS config. B repaired explicit-null ratio acceptance with a red/green test; targeted sites/env tests now show 28 pass, 296 assertions.

`readR2Config(env?: Record<string,string|undefined>): R2Config` returns `{accessKeyId,secretAccessKey,endpoint,bucket,region:"auto"}` and throws `EnvError` with `.missing` and safe name-only `.message`. `Site={slug,url,form_helper,mask:string[],max_diff_pixel_ratio:number,pages:{path,mask:string[]}[]}`. `loadSites` is synchronous; `pageKey('/')='home'`, `pageKey('/a/b/')='a-b'`.

Store methods: `put(key:string,data:Uint8Array|Blob):Promise<void>` (BunFile is Blob), `get(key:string):Promise<Uint8Array>`, `list(prefix:string):Promise<string[]>`, `presign(key:string,seconds:number):string` for GET, `delete(key:string):Promise<void>`, `pruneReports(keep?:number):Promise<void>`. Export `store` with empty scope and `createStore` with optional R2 config, root and list page size; choose a clear typed signature and document it. Root includes a trailing boundary slash; keys are relative. A supported small page size must exercise exactly the same listing/retention implementation in selftest as production. Do not inject fake backend responses.

Fixed layout: `baselines/<slug>/<viewport>/<pageKey>.png` and `.health.json`, `reports/<runId>/...`; run IDs from `new Date().toISOString().replaceAll(':','-')`. Unrecognized IDs are left alone. Local run artifacts only under runs/, no baseline screenshots committed.

## 5. Do-not, reasons and exceptions

- Never open, print, write or append `.env`/`.env.*`, even the example. Run credential-dependent scripts as `bun --env-file=.env <script>`; print results, never values. All four names reported present; if permission/setup fails, return only safe evidence/blocker to B, never raw SDK errors that might expose signed URLs.
- No auth/backend mocks, browser/Playwright/WP/forms/mail, AWS SDK, production report pruning or mutations outside this invocation's unique test scope: locked scope and real-mutation safety. No exception for debugging against production objects.
- No commits, phase calls, full suite runs or scope/interface changes. Return a mismatch with evidence and smallest brief correction; only a revised B brief authorizes changed scope/interfaces.

These exclusions protect credentials, production data and locked scope; only explicit revised scope authorization is an exception, never credential exposure or unsafe mutation.

## 6. Ordered steps

1. Derive `tests/store.test.ts` from criteria 1–2 and 4 (pure validation/grouping and child CLI behavior, no fake backend). Demonstrate red before `src/store.ts` exists.
2. Implement `src/store.ts` with actual Bun S3 APIs and safe scoping (criteria 1–2).
3. Implement `scripts/store-selftest.ts`, integrating criterion 4 tests. Ensure top-level safe error handling, finally cleanup, and sanitized artifact even on failure. Run targeted checks red then green, and real selftest once safe (criteria 3–5).
4. Write `README.md` against actual interfaces and verified command behavior (criterion 5); include no fictitious completed flows.
5. Report exact evidence, limitations, API and artifact path.

Advisory size: about 4 files, under 40 turns; clearly greater scope returns a mismatch, not silent expansion.

## 7. Commands

No changed-test runner exists. Resolved test_changed for this unit:

```sh
AKROGON_BASE=93cf3b7f6b99f3a34be7f69c004345c439fa6a76 bun test tests/store.test.ts
```

Required unit end-to-end invocation: `bun --env-file=.env scripts/store-selftest.ts` (same as package store:selftest). B owns final full suite and blocking checks.

## 8. Done-when, evidence and report

Criteria implemented, targeted red/green outputs and real invocation/cleanup evidenced. Write `/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/open/site-checks/checker-foundation/implementation/worker-2.md` outside worktree with API, sanitized artifact path and pasted outputs. Return report path plus summary. No secrets or signed URLs in outputs/artifacts.

Changed files and reasons: <paths and why>
Tests run: <commands and results, including red and green and real selftest>
Known limitations: <limitations or none known>
Unverified criteria: <criterion and why, or none>
