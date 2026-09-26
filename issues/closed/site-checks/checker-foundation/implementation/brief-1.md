# Unit 1: bootstrap, site configuration and environment reader

## 1. Goal

Implement plan D1–D4 and the configuration part of D8 in `/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/worktrees/checker-foundation`. This is one delegated unit, not the B lifecycle seat. Build the minimum Bun/TypeScript project and deterministic site/env helpers; no prior app exists.

## 2. Numbered acceptance criteria

1. Targeted Bun tests pass without R2 credentials. Literal site YAML normalizes page strings/objects, preserves order, defaults masks to `[]` and ratio to `0.01`, and preserves explicit `form_helper` booleans.
2. Duplicate slug, missing URL, trailing-slash URL, empty pages, unknown keys and malformed masks each throw `SitesConfigError` naming site and field; cover root/page unknown keys, wrong types, ratio bounds, bad page paths, duplicate paths/key collisions, YAML/read errors too.
3. Synchronous `loadSites(path = "sites.yaml"): Site[]`, `pageKey(path): string`, public types and lazy `readR2Config` are exported. Keys satisfy `/` → `home`, `/a/b/` → `a-b`, are deterministic and filename safe. No eager credential access on import.
4. Environment reader accepts an optional supplied env map (default `process.env`), names all missing/blank required variables without values, returns typed R2 client configuration for explicit accessKeyId/secretAccessKey/endpoint/bucket and region `auto`. Tests use synthetic maps, never actual secrets.
5. Minimal scripts/dependencies/strict no-emit config exist; preserve ignores and add `runs/`. Example site YAML uses an example domain and both page forms. Operator-owned `.env.example` remains untouched.

## 3. Read-first list

- Authoritative `../checker-foundation/design.md` and `plan.md`, resolved within `/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/open/site-checks/` (not worktree issue copies).
- `/home/rudi/.pi/agent/skills/implement-issue/ponytail.md`.
- Worktree `.gitignore`: existing pattern to preserve. No app pattern/index/README exists; Bun 1.4.2 is installed.

## 4. Change list and needed interfaces

Create `package.json`, `tsconfig.json`, `bun.lock`, `src/sites.ts`, `src/env.ts`, `sites.example.yaml`, `tests/sites.test.ts`, `tests/env.test.ts`; edit `.gitignore` only to preserve entries and ignore runs. Scripts: test=`bun test`, typecheck=`tsc --noEmit`, store:selftest=`bun --env-file=.env scripts/store-selftest.ts` (script is next unit). Use Bun YAML parser, Node synchronous UTF-8 read, TypeScript and Bun types as minimal dev dependencies; no external YAML validator.

Normalize Site to `{slug,url,form_helper,mask:string[],max_diff_pixel_ratio:number,pages:Page[]}` and Page to `{path,mask:string[]}`. Slug is lowercase alphanumeric with single internal hyphens and unique. URL absolute HTTP(S), no trailing slash; reject credentials/query/fragment for an unambiguous base. `form_helper` is required boolean; ratio finite 0–1; pages nonempty. Root has only `sites`, which may be empty. Page object has only path/mask. Masks must be arrays of nonblank strings (CSS syntax/matches require a browser, out of scope). Page path begins with one `/`, without query/fragment/traversal; preserve trailing slash. Unknown keys rejected at each schema level. Report slug+field; fallback site[index] or <root> if unavailable. Wrap parse/read errors with context without echoing whole file contents.

Compute page key by trimming boundary slashes and joining segments with `-`, deterministically encoding unsafe filename characters. Detect/reject duplicate paths and key collisions within each site (including `/` vs `/home/`, `/a/b/` vs `/a-b/`) before future storage overwrites.

## 5. Do-not, reasons and exceptions

- Do not open, print, append or write `.env` or `.env.*` using any tool; these contain or resemble sensitive configuration. `.env.example` has been supplied by the operator and B validated its four empty entries with Bun's loader; preserve it. No exception for reading the template.
- No browser/Playwright/forms/mail/WP, R2 mutations, AWS SDK or unnecessary framework: leaf and unit boundaries are locked. No commits or lifecycle commands: B owns those.
- Do not change plan/interfaces/scope to resolve a mismatch. Return evidence plus smallest correction; only a revised brief from B authorizes a change.

The exclusions protect credentials, locked scope and B's lifecycle ownership; the only scope/interface exception is an explicit revised brief, never an implicit workaround.

## 6. Ordered steps

1. Bootstrap package/types/ignores for criterion 5; install dev dependencies.
2. Derive `tests/sites.test.ts` and `tests/env.test.ts` from criteria 1–4 before implementing helpers. Capture an actual failing targeted run.
3. Implement `src/sites.ts` and `src/env.ts`; create `sites.example.yaml`; make targeted tests green and verify the shipped site example.
4. Write the report below, including exact new env interface for unit 2. Do not implement storage or README yet.

Advisory size: about 9 files, under 45 turns; clearly greater scope returns a mismatch with evidence rather than silently expanding.

## 7. Commands

Resolved test_changed (no changed-test runner exists):

```sh
AKROGON_BASE=93cf3b7f6b99f3a34be7f69c004345c439fa6a76 bun test tests/sites.test.ts tests/env.test.ts
```

Run this for red then green. B runs the full suite/typecheck after the final unit; do not substitute the full suite.

## 8. Done-when, evidence and report

All unit criteria implemented with test output; save report at `/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/open/site-checks/checker-foundation/implementation/worker-1.md`, outside worktree. Include red/green command results, exported interfaces, and intentional limitations. Return its path and summary. Missing report/evidence is unfinished work. Never echo credentials.

Changed files and reasons: <paths and why>
Tests run: <commands and results, including red and green>
Known limitations: <limitations or none known>
Unverified criteria: <criterion and why, or none>
