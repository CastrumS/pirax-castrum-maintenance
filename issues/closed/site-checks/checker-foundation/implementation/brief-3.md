# Unit 3: repair review findings (round 1)

## 1. Goal

Repair review A F1 and review B F1, plus the bounded nits below, at reviewed head `fb5e37975905d708e58ee2b5a2d86ee4965979e3`. Work only in `/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/worktrees/checker-foundation`. Enforce D1/AC1 test isolation, D2/AC2 page validation and D6 retention without weakening criteria. This is a worker, not the lifecycle B seat.

## 2. Numbered acceptance criteria

1. Bare `bun test` skips `issues/**` even when it contains a deliberately failing nested-worktree test; project discovery still supports both `tests/` and `test/`. Reproduce the failure then fix through `bunfig.toml` `[test] pathIgnorePatterns = ["issues/**"]`. Existing `.gitignore` alone fails to exclude the nested tests.
2. Both page string and object forms reject backslashes and ASCII whitespace/control characters (including TAB/CR/LF, DEL, trailing space disguising `..`) as `SitesConfigError` naming site and `pages[i].path`. Regressions include `/\\elsewhere.example/`, `/a/..\\outside/`, `/a/\t../outside/`, `/a/.. `. The ordinary examples and percent-encoded non-traversal paths remain valid.
3. Deletion/pruning supports a safe trailing-slash folder-marker object in an expired canonical report run, without accepting unsafe roots, traversal, empty/absolute keys or broadening put/get/presign. A real test proves an old marker is deleted with its run while a retained run marker remains until its turn, then all objects are cleaned. Keep fail-loud behavior and root isolation. Append into report-group arrays rather than quadratic copies.
4. All unit-created temporary fixture directories are removed after tests, even failures. Missing-config tests inspect the actual repository `runs/` artifact destination, not their child cwd; compare before/after entries (no vacuous check).
5. README describes test exclusion and refined path/delete behavior, matches selftest counts/markers, and never overwrites operator sites during setup (`cp -n` or existence guard). No unrelated app features.

## 3. Read-first list

- `/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/open/site-checks/checker-foundation/{review-A.md,review-B.md,plan.md}` including dated repair notes; review findings give actual reproduction evidence.
- `/home/rudi/.pi/agent/skills/implement-issue/ponytail.md`.
- Worktree `src/sites.ts`, `src/store.ts`, `scripts/store-selftest.ts`, `tests/{sites,env,store}.test.ts`, `README.md`, `package.json`. Copy the existing isolated child-process and real scoped selftest patterns.

## 4. Change list and needed interfaces

New `bunfig.toml`; modify `src/sites.ts`, `src/store.ts`, three existing test files, `scripts/store-selftest.ts`, `README.md`. If warranted, add a small test-discovery regression file using a sandbox with a trivial root passing test and nested failing test, the real Bun process and copied non-env configuration. It must not recursively invoke the project suite.

Keep public `loadSites(path="sites.yaml"):Site[]`, `pageKey(path):string`, `createStore({config?,root?,pageSize?})` and Store method signatures unchanged. For marker deletion, refine internal key validation to allow a single trailing slash only for delete/prune; all prior root/boundary/dot/length checks still apply. Add markers with a real Bun S3Client call strictly under the selftest's unique root (put intentionally rejects folder markers). No skipping an old marker as if it had been deleted.

Existing selftest uses 12 report runs × 3 objects plus probes/sentinels (46 objects), compares complete expected key sets and bytes, exercises page-size-5 listings, and cleans in finally. Integrate markers into those exact-survivor assertions and counts; no production data mutations. Read actual Bun types if needed.

## 5. Do-not, reasons and exceptions

- Do not open, print, append or write `.env` or `.env.*`, including the operator-owned example. Never copy/archive all HEAD files into a sandbox because that includes the env template; copy only named required non-env files. Real credentials only via `bun --env-file=.env <script>`, with results not values printed.
- No backend/auth mocks, production-prefix mutation, browser installs, commits, lifecycle calls or whole-suite execution in the worktree. B owns final full checks. Exception: bare `bun test` in the minimal isolated discovery sandbox is the behavior specifically under test.
- Do not edit leaf contracts/reviews or change scope/interfaces/criteria. Return mismatch evidence plus smallest correction; only a revised brief from B authorizes changes.

These exclusions protect credentials, production state, acceptance strength and B's lifecycle ownership. Only the sandbox bare-test invocation and an explicit revised scope brief are the stated exceptions; neither permits secret exposure or unsafe R2 access.

## 6. Ordered steps

1. Add regression tests first for path forms, marker selection/deletion validation, and actual artifact destination; demonstrate red on the old implementation. Capture nested-test discovery red evidence in a scratch non-env sandbox.
2. Add `bunfig.toml` and make `src/sites.ts` path guard reject normalization bypasses; show targeted green and discovery green.
3. Refine deletion validation in `src/store.ts`, preserve all other invalid-key tests and remove quadratic grouping copies; add real markers to `scripts/store-selftest.ts` and survivor assertions.
4. Add teardown to the three test files; correct artifact assertion; update README.
5. Run the targeted command and real selftest safely; record exact red/green results and artifact path in the worker report.

Advisory size: 8–9 files, under 50 turns. Clearly greater scope returns evidence/mismatch, not silent expansion.

## 7. Commands

Resolved test_changed (no repo changed-test runner):

```sh
AKROGON_BASE=93cf3b7f6b99f3a34be7f69c004345c439fa6a76 bun test tests/sites.test.ts tests/env.test.ts tests/store.test.ts
```

If you add a discovery test file, append its exact path to this targeted command and report it. Isolated discovery scenario runs real `bun test` only on minimal sandbox fixtures. Required end-to-end repair verification: `bun --env-file=.env scripts/store-selftest.ts`. B runs the worktree full suite/typecheck/final checks afterward.

## 8. Done-when, evidence and report

All criteria covered, original behavior preserved except the reviewed defects. Write `/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/open/site-checks/checker-foundation/implementation/worker-3.md` outside worktree. Include finding-by-finding resolution, red/green output, discovery scenario and root-cleanup evidence, any unverified failure path, and real artifact path. Return its path plus summary.

Changed files and reasons: <paths and why>
Tests run: <commands and results, including fail-first and targeted green>
Known limitations: <limitations or none known>
Unverified criteria: <criterion and why, or none>
