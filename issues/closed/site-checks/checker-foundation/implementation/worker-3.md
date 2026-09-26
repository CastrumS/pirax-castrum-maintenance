# Worker 3 report: repair round 1

- Worktree: `/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/worktrees/checker-foundation`
- Base under review: `fb5e37975905d708e58ee2b5a2d86ee4965979e3`. Changes are uncommitted. Nothing was committed and no akrogon command was run.
- Runtime: Bun 1.4.2. No `.env`/`.env.*` file was opened, printed or edited. Credentials were used only through `bun --env-file=.env <script>`, and output was limited to keys relative to a unique `test/` root, status codes and error class/code.

## Summary

- **Criteria 1, 2, 4 and 5 are done.** Fail-first and targeted-green evidence is below.
- **Criterion 3 is done only in part.** The quadratic grouping copy is fixed. The folder-marker half cannot be done as briefed: Bun 1.4.2's `S3Client` cannot address an R2 key that ends in `/`, for create or delete, by any route I tried. I built the marker repair, proved it unsafe, and reverted it. That half is a **scope mismatch for B**, with evidence and a proposed correction below. `src/store.ts` key validation is unchanged from the reviewed head.

## Findings and how each was resolved

| Finding | Resolution |
| --- | --- |
| A F1 (`bun test` runs nested worktree tests) | New `bunfig.toml`: `[test] pathIgnorePatterns = ["issues/**"]`. New regression test `tests/discovery.test.ts` (see the discovery section). |
| B F1 / A N1 (paths that URL normalization moves off-site or into traversal) | `src/sites.ts`: the shared page-path validator now rejects `[\u0000- \u007f\\]` (backslash, space, TAB/CR/LF, other C0 controls, DEL) as `SitesConfigError` on `pages[i].path`. This covers both the string and object page forms. |
| A N2 (README setup overwrites `sites.yaml`) | README now says `cp -n sites.example.yaml sites.yaml`. |
| A N3 (a folder marker blocks prune) | **Not resolved: mismatch** (see below). The fail-loud behaviour from the reviewed head is kept. |
| B N2 (quadratic grouping copy) | `expiredReportKeys` now appends to the existing run array instead of copying it. |
| A N4 / B N1 (temp fixtures left behind) | `afterAll(rmSync(..., {recursive, force}))` in `tests/{sites,env,store}.test.ts`. The `sites-cwd-*` directory is now created inside the `sites-test-*` directory. `tests/discovery.test.ts` removes its sandbox in `finally`. |
| A N5 (artifact assertion could never fail) | The missing-config test now compares the entries of the repository's `runs/` (`join(import.meta.dir, "..", "runs")`, the selftest's real artifact destination) before and after the run. |

## Changed files and why

- `bunfig.toml` (new): excludes `issues/**` from Bun test discovery. `tests/` and `test/` are still discovered (A F1, criterion 1).
- `src/sites.ts`: adds one validator line with a comment, rejecting backslash, whitespace and control characters (B F1, criterion 2).
- `src/store.ts`: appends run-group keys instead of copying the array (B N2). No other change.
- `tests/sites.test.ts`: normalization-bypass regressions in both page forms, a valid percent-encoded case, and teardown.
- `tests/env.test.ts`: teardown.
- `tests/store.test.ts`: teardown, and the artifact assertion now checks the real `runs/` directory with a before/after comparison.
- `tests/discovery.test.ts` (new): a sandboxed test-discovery regression.
- `README.md`: `bun test` row (exclusion), the page-path rule, and `cp -n`.
- `scripts/store-selftest.ts`: **unchanged** in the final diff. The marker additions were reverted; see the mismatch section.

## Tests run

### Discovery red/green (scratch sandbox, minimal fixtures only)

The sandbox had `tests/ok.test.ts` and `test/ok.test.ts` (both passing), a failing `issues/worktrees/other/tests/nested.test.ts`, and a copy of `.gitignore` (`git check-ignore` confirms the nested file is ignored). The project suite was not copied or run.

- Without `bunfig.toml`: `2 pass, 1 fail, Ran 3 tests across 3 files`, exit 1. The nested test ran even though `.gitignore` ignores it.
- With `[test] pathIgnorePatterns = ["issues/**"]`: `2 pass, 0 fail, Ran 2 tests across 2 files`, exit 0.

`tests/discovery.test.ts` repeats this scenario against the repository's real `bunfig.toml` (copied, `--no-env-file`, `env: {}`). It asserts "Ran 2 tests across 2 files", no `nested` in the output, and exit 0.

### Fail-first on the old implementation

Command: `AKROGON_BASE=93cf3b7f6b99f3a34be7f69c004345c439fa6a76 bun test tests/sites.test.ts tests/env.test.ts tests/store.test.ts tests/discovery.test.ts`. The new tests were in place; `src/` and `bunfig.toml` were as reviewed.

- `(fail) loadSites broader validation > paths that URL resolution would normalize off-site or into traversal` (expected `SitesConfigError`, the load succeeded).
- `(fail) bare bun test skips issues/** ...` (no `bunfig.toml` at that head: ENOENT. The sandbox run above shows the behavioural red).
- A third test, for marker delete, also failed. It was later dropped along with the marker change.
- Result: 46 pass, 3 fail, exit 1.

**Artifact assertion is not vacuous (mutation check).** I temporarily made `scripts/store-selftest.ts` write `runs/mutation-probe.json` before exiting with code 2. `bun test tests/store.test.ts -t "all blank"` then failed with `+ "mutation-probe.json"` (Received +1). The old `existsSync(join(cwd,"runs"))` assertion would have passed, because the script writes to the repository `runs/`, not the child's cwd. The script was restored byte-for-byte (`git diff --stat scripts/` empty) and the probe file removed.

### Targeted green (final)

Same command (includes `tests/discovery.test.ts`): **47 pass, 0 fail, 502 `expect()` calls, 4 files, exit 0.**

Also run:
- `bun run typecheck`: exit 0.
- `git diff --check`: clean.
- The operator's real `sites.yaml` from `main` (written to a temp file with `git show main:sites.yaml`, counts printed only) still loads: 13 sites, 120 pages.

### Temp-directory cleanup

`/tmp` entries matching `sites-test-|sites-cwd-|env-test-|store-test-|discovery-test-` were 35 before and 35 after the targeted run. The run leaves nothing new behind. The 35 pre-existing directories come from earlier runs at the reviewed head. I did not delete them.

### Real R2 selftest (final code)

`bun --env-file=.env scripts/store-selftest.ts` gave **PASS, exit 0**:

- root `test/2026-09-25T15-22-29.070Z-84d4071d/`
- all 11 checks ok: page size 5 across ≥10 pages over 46 objects; 12→10 prune leaving 40 objects; no-op; default keep; keep 0 leaving 10
- cleanup `deleted 10`, remaining 0

Artifact: `runs/store-selftest-2026-09-25T15-22-29.070Z.json`.

An earlier attempt with markers in the selftest failed as intended at `folder markers: folder markers not listed`. Its cleanup was ok (`deleted 4`, remaining 0). Artifact: `runs/store-selftest-2026-09-25T15-20-29.208Z.json` (result `fail`).

## Mismatch for B: criterion 3, folder markers

The brief asks me to create markers "with a real Bun S3Client call strictly under the selftest's unique root" and prove that prune deletes them. With Bun 1.4.2 against R2 this is impossible. Evidence (every probe used its own fresh `test/<ts>-probe*/` root, and each root listed empty afterwards):

1. `client.write(root+"a/", ...)`, `client.write(root+"b/", "")` and `client.file(root+"c/").write(...)` stored the keys `a`, `b` and `c`. Bun strips the trailing `/`.
2. `client.presign(root+"a/", {method:"PUT"})`: the signed pathname does not end in `/a/`. A presigned PUT stored `a`.
3. Local capture server with synthetic credentials: `delete("r/a/")` and `delete("r/a//")` both sent `DELETE /b/r/a`. `delete("r/a/.")` and `delete("r/a/./")` sent `DELETE /b/r/a/`, because Bun resolves dot segments. `%2F` is double-encoded (`%252F`).
4. On real R2, the dot-segment route `client.write(root+"a/.")` failed with `S3Error (SignatureDoesNotMatch)`. Presigned PUT and DELETE for `a/.` returned 403. Bun's signed path does not match the path it sends.

**Consequence.** Letting `delete`/`pruneReports` accept `…/` keys (which I built first) is unsafe with Bun. `delete("reports/<id>/")` really sends `DELETE reports/<id>`, gets a 204, and so:
- leaves a real marker in place while the prune reports success (the silent skip the brief forbids);
- or deletes a *different* object named exactly `reports/<id>` if one exists.

I reverted that change. The reviewed fail-loud behaviour is kept: the marker is selected, and `delete` rejects with `StoreError unsafe key`. A real marker also cannot be created for the selftest without new code that bypasses `S3Client`.

**Smallest corrections, for B to choose from:**

- **(a) Recommended, smallest.** Keep the reviewed fail-loud behaviour (StoreError naming the marker key; older runs are already deleted because keys are sorted). Add a README limitation line: "`pruneReports` rejects on a folder-marker object such as `reports/<runId>/`, which Bun's S3 client cannot address; delete it with the tool that created it." Drop the real-marker selftest requirement and keep A N3 as a documented limitation. Optionally add a unit test asserting `expiredReportKeys` selects the marker and `delete("reports/<id>/")` rejects with `StoreError` before any request.
- **(b)** Skip trailing-slash keys in `expiredReportKeys`. This is A's suggestion, but the brief forbids it ("no skipping an old marker as if it had been deleted"), and markers would stay forever.
- **(c)** Hand-roll a SigV4-signed `fetch` DELETE (and PUT, for the selftest) for marker keys: roughly 40+ lines of new signing code outside `S3Client`. This is a new abstraction the plan does not include.

## Known limitations

- Folder-marker objects under `reports/<runId>/` still make `pruneReports` reject, as at the reviewed head (see the mismatch).
- Spaces are now rejected in page paths. Operators must write `%20`. The real 13-site list is unaffected.
- The `runs/` before/after comparison could fail spuriously if another selftest writes an artifact while the unit test is running.

## Unverified criteria

- **Criterion 3, marker half:** no real test proves marker deletion, because it is impossible with Bun 1.4.2 `S3Client` on R2 (evidence above). It needs a revised brief from B.
- The criterion 3 wording also requires README to describe "refined delete behaviour". Delete behaviour did not change, so the README says nothing new about it until B picks a correction.
- Full `bun test` in the worktree was not run (B owns it). Typecheck was run and exited 0.
