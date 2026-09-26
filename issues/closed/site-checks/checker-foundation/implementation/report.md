# Implementation report: checker-foundation

## Result and commits

Completed by slot B on 2026-09-25 using two sequential workers in the leaf worktree, followed by B's integration inspection, a two-line validation repair, full checks and commit.

- Worktree: `/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/worktrees/checker-foundation`
- Branch: `checker-foundation`
- Configured base: `93cf3b7f6b99f3a34be7f69c004345c439fa6a76`
- Committed head: `fb5e37975905d708e58ee2b5a2d86ee4965979e3`
- Commit: `Build Bun checker foundation with site validation and R2 storage`
- Final `git status --short`: empty. No changed file under `issues/` is on this branch; all pass artifacts were written to the authoritative leaf, outside the worktree.

Earlier blockers are resolved: all four R2 variable names now report present, and the operator supplied `.env.example`. Neither B nor the workers opened, printed or edited any env file. The template's four empty entries were validated using Bun's env-file loader, printing only validation results; the supplied file was included unchanged in the commit.

## Changed files and reasons

| File | Change / reason |
| --- | --- |
| `package.json` | Private Bun ESM project; `test`, `typecheck`, `store:selftest`; only TypeScript and Bun types as development dependencies. |
| `tsconfig.json` | Strict no-emit TypeScript across source, scripts and tests. |
| `bun.lock` | Locked development dependency graph; frozen install verified. |
| `.gitignore` | Preserved existing ignores, added `runs/`; `.env` remains ignored. |
| `.env.example` | Operator-provided four empty S3 entries, committed unchanged. |
| `sites.example.yaml` | Secret-free example with both string/object page forms and masks. |
| `src/sites.ts` | Synchronous literal-schema loader, normalized types/defaults/order, contextual `SitesConfigError`, shared stable page keys, duplicate/collision rejection. |
| `src/env.ts` | Lazy typed R2 configuration; reports all missing/blank names, never values. |
| `src/store.ts` | Lazy Bun S3Client store; scoped factory; put/get/list/presign/delete; full pagination; canonical run-prefix retention. |
| `scripts/store-selftest.ts` | Real R2 upload/list/download/signed GET/retention/pagination checks, scoped finally cleanup and sanitized artifact. |
| `tests/sites.test.ts` | Positive schema cases and required/broader negative cases, including explicit null ratio rejection. |
| `tests/env.test.ts` | Synthetic-map validation and isolated-process import/default-env checks. |
| `tests/store.test.ts` | Pure run selection, input validation, lazy import, CLI missing/blank configuration; no mock backend. |
| `README.md` | Setup, schema, public APIs, layout, retention, command/artifact instructions and honest limitations. |

Affected human documentation: `README.md`. No existing app agent documentation or AREA/index exists or became stale; none was added.

## Delegation and test derivation

- `implementation/brief-1.md` → `implementation/worker-1.md`: project/config/site/env unit; its tests were written before implementation. Initial missing-module run failed; green result 28 tests passed, 292 assertions. Worker reports contain the exact exported interfaces and targeted results.
- `implementation/brief-2.md` → `implementation/worker-2.md`: storage, real selftest and README. Initial missing-module run failed; after storage existed, CLI tests still failed before the selftest script was implemented (14 pass, 2 fail). Final targeted result: 16 pass, 0 fail, 130 assertions. Two worker real-R2 runs passed and their roots were confirmed empty.
- B found that `raw.max_diff_pixel_ratio ?? 0.01` incorrectly treated explicit YAML null as omitted. Added `null` to the wrong-type regression cases first: **27 pass, 1 fail**, `Expected constructor: SitesConfigError; Received value: undefined`. Changed the default to apply only to `undefined`. The same targeted command then passed **28 tests, 296 assertions**. This two-line repair preserves D2 and AC2 rather than broadening scope.

Resolved changed-test commands (no repo changed-test runner is configured):

```sh
AKROGON_BASE=93cf3b7f6b99f3a34be7f69c004345c439fa6a76 bun test tests/sites.test.ts tests/env.test.ts
AKROGON_BASE=93cf3b7f6b99f3a34be7f69c004345c439fa6a76 bun test tests/store.test.ts
```

Worker output transcripts are `implementation/worker-1-output.txt` and `implementation/worker-2-output.txt`; the structured worker reports are the authoritative unit evidence. Unrelated connector chatter in worker output had no bearing on this implementation and no connector was required.

## B's final checks: actual results

### Full suite and typecheck

```text
$ bun test
bun test v1.4.2 (744846f84)
 44 pass
 0 fail
 426 expect() calls
Ran 44 tests across 3 files. [96.00ms]

$ bun run typecheck
$ tsc --noEmit

$ git diff --check
[no output]

Final checks: tests=0 typecheck=0 diff=0
```

These ran after the final code change. No additional checks or advisory commands are configured in `akrogon config`. The full suite was not redundantly rerun after an unchanged successful run.

### Real R2 end-to-end invocation

```text
$ bun run store:selftest
$ bun --env-file=.env scripts/store-selftest.ts
store:selftest root test/2026-09-25T13-56-04.489Z-83f6a514/
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
ok   cleanup test/2026-09-25T13-56-04.489Z-83f6a514/ (deleted 10)
PASS artifact runs/store-selftest-2026-09-25T13-56-04.489Z.json
exit=0
```

Final artifact (local and intentionally uncommitted):
`/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/worktrees/checker-foundation/runs/store-selftest-2026-09-25T13-56-04.489Z.json`.

Every mutation was under the unique printed test root. The test compares complete key sets and downloads every surviving object's bytes after retention; this proves both oldest runs are absent and all remaining objects/sentinels intact. The page-size-5 store is used for retention and cleanup, and an actual truncated R2 response proves pagination was exercised. Cleanup confirmed zero remote objects remain and removed the local temporary upload directory.

### Real command's missing-variable failure

The following overrides values in the child environment without reading or editing `.env`:

```text
$ S3_ACCESS_KEY_ID= S3_SECRET_ACCESS_KEY= S3_ENDPOINT= S3_BUCKET= bun run store:selftest
$ bun --env-file=.env scripts/store-selftest.ts
store:selftest: Missing or blank environment variables: S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_ENDPOINT, S3_BUCKET. No remote access attempted.
Missing-variable check: exit=2 (expected nonzero)
```

Unit tests also cover a single blank name, no eager configuration on import, and absence of values in diagnostics.

### Dependency, template, ignore and secret checks

```text
$ bun install --frozen-lockfile
bun install v1.4.2 (744846f84)
Checked 6 installs across 26 packages (no changes) [2.00ms]
exit=0

$ git check-ignore -v .env runs/store-selftest-2026-09-25T13-56-04.489Z.json
.gitignore:4:.env    .env
.gitignore:6:runs/  runs/store-selftest-2026-09-25T13-56-04.489Z.json

Template validation via bun --env-file=.env.example:
S3_ACCESS_KEY_ID: empty (valid template)
S3_SECRET_ACCESS_KEY: empty (valid template)
S3_ENDPOINT: empty (valid template)
S3_BUCKET: empty (valid template)
exit=0

Credential-value scan via bun --env-file=.env (values used internally, never printed):
secret scan: PASS (13 staged non-env files and final selftest artifact; template validated separately)
exit=0
```

The scan compared all four configured values against the 13 staged non-env files and the final selftest artifact, and rejected signed-URL query markers in the artifact. `.env.example` was not opened by a tool; its four added lines and four empty loaded entries were validated separately. Staged whitespace checks (excluding env-file contents) and the check for changed `issues/` paths produced no output. No credential value was committed.

## Acceptance mapping

- **AC1 / AC2:** full suite proves normalization/order/defaults, literal schema example, all six required negative cases with site/field context, and broader malformed-input cases.
- **AC3:** typecheck passes; public interfaces and mandated page-key examples are tested, imports are credential-free.
- **AC4:** real byte/file and fetched presigned GET roundtrip passed with clean remote/local teardown; actual package command fails clearly with exit 2 on missing configuration.
- **AC5:** real 12-to-10 retention with three objects per report, exact surviving keys/bytes, unrelated sentinels, invalid/default/zero/no-op keep scenarios all passed.
- **AC6:** real truncated listing and page-size-5 retention/cleanup passed.
- **AC7:** all required files are committed, template entries empty, local env and runs ignored, secret-value check passed, final artifact path recorded above.

## Known limitations and unverified behavior

- The real cleanup-failure branch was not induced. Successful finally cleanup is verified against R2; behavior on a network/permission outage is implemented and inspected but not experimentally established. A failure may leave objects under the printed test root requiring operator cleanup.
- Retention is nontransactional and sequential, with no coordination between concurrent writers/pruners; prune after a completed report run. Noncanonical run IDs are deliberately retained.
- Mask validation checks arrays of nonblank strings, not browser CSS validity or matches. No browser code or Playwright was installed.
- Readable page keys can collide; collisions are rejected within a site, including case-only collisions for filesystem safety. URL consumers must encode percent-escaped keys correctly.
- Site paths are not a complete browser URL-policy layer; backslashes/whitespace are not independently rejected by the loader (as noted in worker 1's report). Future navigation code must resolve and validate destinations appropriately.
- Unit test fixture directories currently remain under the OS temporary directory; the real selftest cleans its temporary upload directory.
- Template content was operator-provided and checked through Bun's env loader, not opened by agents. All four required loaded values are empty; the file has four added lines.
- There is no current runtime test of token scope beyond the accesses exercised; no production report/baseline was touched. No browser, live-site or mailbox verification applies to this leaf.

## Repair round 1 — 2026-09-25

### Before / after

- Reviewed/before commit: `fb5e37975905d708e58ee2b5a2d86ee4965979e3`.
- Repaired/after commit: `f40e7c943dbe5f6379e6a9a4ce2aa569af6cea3a`.
- Commit: `Fix checker test discovery and page path validation`.
- `git status --short` after commit: empty; no issue artifacts were added to the worktree branch.
- This section supersedes the earlier limitations concerning unvalidated backslashes/whitespace and leaked unit-test temporary directories. Existing implementation and review evidence is preserved above.

### Findings, files and decisions

- **A F1 fixed:** added `bunfig.toml` to exclude `issues/**` from bare Bun test discovery without restricting future `test/` discovery. New `tests/discovery.test.ts` invokes real Bun in a minimal scratch project with both legitimate test directories and a deliberately failing nested-worktree test. README documents the scope.
- **B F1 / A N1 fixed:** `src/sites.ts` rejects backslashes and ASCII whitespace/control characters in the common string/object page validator. `tests/sites.test.ts` exercises both forms, including off-site backslash paths, hidden traversal with TAB/CR/LF/trailing spaces, NUL/DEL, and valid percent-encoded non-traversal paths. Site/field error assertions are retained. README states the refined contract.
- **A N2 fixed:** README setup uses `cp -n`, preserving an existing operator site list.
- **A N4 / B N1 fixed:** the three existing test files now remove their owned temporary fixture directories; the default-path fixture lives inside its parent suite directory. Worker measured 35 matching pre-existing temp directories before and after a run, with no new leftovers; unrelated/pre-existing directories were not deleted.
- **A N5 fixed:** the missing-config artifact check now compares actual repository `runs/` entries before/after, not the child cwd. Worker temporarily inserted an artifact write and proved the assertion failed; the mutation was reverted and its artifact removed.
- **B N2 fixed:** `src/store.ts` appends each report key into its run array rather than copying the entire group on each insertion.
- **A N3 remains a documented nonblocking limitation:** real probes established that Bun 1.4.2 strips trailing slashes in S3 object write/delete/presign paths. Relaxing our deletion validator would leave a marker behind or address the different slash-trimmed neighbor. Dot-segment workarounds failed real R2 signature verification. The attempted relaxation was reverted. Keep the original fail-loud `StoreError`, document external markers in README, and add a named invariant regression in `tests/store.test.ts`. Do not silently skip markers or introduce custom SigV4 outside the locked Bun S3Client architecture. `scripts/store-selftest.ts` is unchanged in the committed repair.

Plan implementation notes and checklist were refined before delegation. `implementation/brief-3.md` covered the review repair; `implementation/worker-3.md` returned the SDK mismatch with concrete real/local evidence. B resolved it through remainder-only `implementation/brief-4.md`; `implementation/worker-4.md` completed its documentation and invariant test. Both workers ran sequentially in this worktree, without commits or lifecycle commands. No env file was opened, printed or edited.

### Fail-first and targeted evidence

From worker 3:

```text
Discovery sandbox without bunfig: 2 pass, 1 fail, 3 files; exit=1
Discovery sandbox with bunfig:    2 pass, 0 fail, 2 files; exit=0

New path regression on old implementation: FAIL (load succeeded; expected SitesConfigError)
New discovery regression on old implementation: FAIL (bunfig absent)
Targeted final unit-3 run: 47 pass, 0 fail, 502 expect() calls, 4 files; exit=0
Artifact assertion mutation probe: FAIL, Received +1 "mutation-probe.json"
Mutation reverted; selftest script unchanged.
```

Worker 4's unchanged-behavior marker guard needed no manufactured red run:

```text
$ AKROGON_BASE=93cf3b7f6b99f3a34be7f69c004345c439fa6a76 bun test tests/store.test.ts
17 pass, 0 fail, 133 expect() calls; exit=0
```

Worker 3 also loaded the operator's `sites.yaml` from main using a temporary non-env fixture: 13 sites / 120 pages remain accepted. Exact commands and evidence are in the worker reports. Configured base remains `93cf3b7f6b99f3a34be7f69c004345c439fa6a76`.

### B's final repair checks

```text
$ bun test
48 pass
0 fail
505 expect() calls
Ran 48 tests across 4 files. [113.00ms]

$ bun run typecheck
$ tsc --noEmit

$ git diff --check
[no output]
Repair checks: tests=0 typecheck=0 diff=0
```

To match A's full-repository discovery scenario rather than relying only on a trivial fixture, B copied explicit non-env project paths (`src`, `scripts`, `tests`, `package.json`, `tsconfig.json`, `bunfig.toml`, `sites.example.yaml`, `.gitignore`) into an isolated temporary directory, added one deliberately failing `issues/worktrees/other/tests/must-not-run.test.ts`, and invoked bare Bun test discovery there with `--no-env-file` and an empty environment. No env file was copied. The entire scratch directory was removed in `finally`:

```text
48 pass
0 fail
505 expect() calls
Ran 48 tests across 4 files. [126.00ms]
full-project nested-worktree isolation: PASS; child exit=0
```

This also verifies the repaired full suite needs no R2 credentials. The extra run is specific evidence for A F1, not an unchanged full-suite rerun without cause.

### B's real-R2 check after the retention grouping change

All four S3 variable names reported present via the required value-free check. Then:

```text
$ bun run store:selftest
$ bun --env-file=.env scripts/store-selftest.ts
store:selftest root test/2026-09-25T15-28-01.304Z-968c54e7/
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
ok   cleanup test/2026-09-25T15-28-01.304Z-968c54e7/ (deleted 10)
PASS artifact runs/store-selftest-2026-09-25T15-28-01.304Z.json
exit=0
```

Final repair artifact:
`/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/worktrees/checker-foundation/runs/store-selftest-2026-09-25T15-28-01.304Z.json`.

Worker 3's final real run also passed (`runs/store-selftest-2026-09-25T15-22-29.070Z.json`). The earlier attempted marker selftest intentionally failed (`runs/store-selftest-2026-09-25T15-20-29.208Z.json`) and still cleaned its entire root (`deleted: 4`, `remaining: 0`). Thus check-failure followed by successful cleanup now has real evidence; cleanup failure itself remains uninduced. Worker marker probes all reported their unique roots empty afterward.

A value-free scan run through `bun --env-file=.env` checked all eight staged repair files plus all six local selftest artifacts:

```text
repair secret scan: PASS (8 staged files; 6 selftest artifacts)
```

No env-file change, issue-path change or unstaged code change was present. Staged whitespace checks passed. No additional blocking/advisory checks are configured.

### Lesson bookkeeping and remaining limitations

Applied A's cited discovery lesson after verifying its history evidence: removed its active line from the registered checkout's `learnings/LESSONS.md` and appended an applied date and repair evidence to `learnings/history/2026-09-25-bun-test-nested-worktrees.md`, preserving the original case. These pre-existing review-created learning records remain outside the leaf branch for the operator to commit, as requested by review A.

Both blocking findings are fixed and verified without weakening their criteria. A N3 is deliberately not claimed fixed; external markers require removal with another tool, and pruning still fails rather than silently addressing another key. Concurrent modification of the repository `runs/` during its before/after assertion could cause a test-only false failure. Nontransactional/sequential retention, unverified cleanup-outage behavior, browser-free mask validation, and readable-key collision rejection remain as previously documented. All other listed review nits are resolved.

Requested next pass: slot A re-check of only `fb5e379..f40e7c9`, using the two original review files and this repair evidence.
