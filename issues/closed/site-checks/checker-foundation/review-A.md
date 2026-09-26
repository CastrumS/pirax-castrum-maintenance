# Review A: checker-foundation

Slot A, phase `check.review` (initial, blind), 2026-09-25.

- Base: `93cf3b7f6b99f3a34be7f69c004345c439fa6a76` (AKROGON_BASE, merge-base of HEAD)
- Reviewed head: `fb5e37975905d708e58ee2b5a2d86ee4965979e3` (branch `checker-foundation`, one commit ahead of base, `git status --short` empty)
- Inputs: `brief.md`, `design.md`, `plan.md` including both implementation notes, `implementation/report.md`, check-issue `ponytail.md`. The leaf has `debate: "no"`, so there are no positions or rebuttals. I did not read the peer review.
- Diff: 14 files, +1265 lines. I read every file except `.env.example`, which I checked only through Bun's env loader (see E8).

## Verdict: `fix`

There is one Fix (F1) and five Nits (N1–N5). The site loader, env reader, store and real-R2 selftest match D1–D8, AC1–AC7 and done-criteria 1–4 at this head. The one exception is that the repository's test command is not scoped to the project (F1).

## Findings

### F1 (Fix): `bun test` is unscoped and runs every nested leaf worktree's tests in the primary checkout

- Where: `package.json:6` (`"test": "bun test"`), with no `bunfig.toml`. Also the README row for `bun test` (`README.md:38`).
- Cites: done-criterion 1 (`bun test` passes) and AC1, plus the reproducible defect below.
- Scenario: the registered layout (`worktree_root: issues/worktrees`) puts every active leaf worktree inside the primary checkout at `/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance`. Bun's test discovery does not honour `.gitignore`, so the existing `issues/worktrees/` ignore does not keep those tests out (E12). After merge, bare `bun test` in the primary checkout also runs whatever the in-flight leaves hold. Today that means `issues/worktrees/form-helper-plugin/test/plugin/{harness,core,adapters}.test.ts` and duplicate copies of this leaf's tests (E13).
- Effect: the done-criterion command can fail, or report a different suite, for reasons unrelated to this code. The README's description of what `bun test` runs is then wrong. Typecheck avoids the problem because `tsconfig.json` limits `include` to `src`, `scripts` and `tests`. `bun test` is the only unscoped entrypoint.
- Done when: bare `bun test` from the repository root skips `issues/**`. On Bun 1.4.2, `bunfig.toml` with `[test]` / `pathIgnorePatterns = ["issues/**"]` works (E12). Prefer it over `root = "tests"`, because the form-check-scope design plans tests under `test/forms/`. The repair evidence should rerun the nested-failing-test scenario and show only the project's 44 tests run and pass.

### Nits

- **N1: page paths starting with `/\` pass validation and resolve to another origin.** A page `'/\\evil.example/'` loads. `new URL(page.path, site.url)` then gives `https://evil.example/`, the same base-URL resolution Playwright `baseURL` navigation uses. Meanwhile `//evil.example/` is deliberately rejected and tested (`tests/sites.test.ts:165`). String concatenation stays on-site (E11). It is a Nit because the operator owns `sites.yaml` (not a trust boundary), the report discloses it, and no criterion names it. Suggested fix: reject `\` and control/whitespace characters in page paths, or require `new URL(path, url).origin === new URL(url).origin` in `src/sites.ts:112`.
- **N2: README setup would overwrite the real site list after merge.** `README.md:20` says `cp sites.example.yaml sites.yaml`. That is correct at the reviewed base, but `main` (e0ee984) already commits the operator's 13-site `sites.yaml`. Following the setup step after rebase would overwrite it in the working tree. It is a Nit because git can recover it and the text is right at this head. Suggest "only if `sites.yaml` does not exist yet" or `cp -n`.
- **N3: `pruneReports` can get stuck on a listed key it refuses to delete.** A folder-marker object `reports/<old runId>/`, as some S3 tools create, is selected by `expiredReportKeys` (`rest = [""]`, `src/store.ts:55`). `delete` then throws `StoreError unsafe key "reports/2026-01-01T00-00-00.000Z/"` from `full()` (E10). Because keys are sorted, every later prune deletes older runs and then rejects at that key. It is a Nit because only other writers create such keys and the call fails loudly, as D6 requires. Suggest skipping keys with an empty trailing segment in `expiredReportKeys`.
- **N4: unit tests leave temp directories behind.** `mkdtempSync` directories (`sites-test-*`, `sites-cwd-*`, `env-test-*`, `store-test-*`) are never removed. `/tmp` now holds 23 of them. It is a Nit for hygiene, and the report discloses it. Suggest an `afterAll` `rmSync(..., { recursive: true, force: true })`.
- **N5: one assertion can never fail.** `tests/store.test.ts:168` asserts `existsSync(join(cwd, "runs"))` is false, but the selftest writes to `join(import.meta.dir, "..", "runs")`, the repository `runs/`, never the child's cwd. It is a Nit because the stdout assertion on the line above (`not.toContain("runs/")`) still catches an artifact regression. Suggest comparing the repository `runs/` entry count before and after, or dropping the line.

No finding: the selftest root `test/<timestamp>-<random8>/` refines the brief's `test/<timestamp>/` placeholder exactly as plan D7 allows ("unique safe timestamp-based `test/` root").

## Documented behavior

`README.md` (new) is the only doc page for the changed behavior. There is no AREA, index or agent doc, and the diff has no `AREA.md`. Its claims match the code and the live probes: error format, key rules, collisions, R2 layout, retention, selftest steps, exit codes, artifact contents and "never file contents" for YAML errors (E9). The exceptions are the `bun test` scope (F1) and the setup step that goes stale after merge (N2). No other documented behavior changed.

## Verification evidence

Run in the worktree unless noted. Bun 1.4.2, TypeScript 7.0.2. No `S3_*` names were set in the shell. No env file was opened or printed, and no value or signed URL was output.

- E1: `bun test` gave 44 pass, 0 fail, 426 `expect()` calls across 3 files.
- E2: `bun run typecheck` (`tsc --noEmit`) exited 0.
- E3: `git diff --check <base>..HEAD` was clean. `bun install --frozen-lockfile` reported no changes.
- E4 (done-criterion 2, negative path): a `git archive HEAD` copy with no `.env` ran `bun run store:selftest` and printed `store:selftest: Missing or blank environment variables: S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_ENDPOINT, S3_BUCKET. No remote access attempted.` It exited 2 and created no `runs/`. Bun tolerates the missing `--env-file`.
- E5 (AC1): `bun test` in a credential-free copy (no `.env`) gave 44 pass, 0 fail.
- E6 (live surface): the operator's real `sites.yaml` from `main` (e0ee984) loads with this loader: 13 sites, 120 pages, and no page key needs `%` encoding.
- E7 (local capture server, not R2): Bun `S3Client` sends the `pageKey("/café/")` key as `caf%25C3%25A9.png` for PUT, GET and presign, so the key is stored literally. It infers the content type from the key extension (`image/png`, `text/html;charset=utf-8`). No defect.
- E8 (AC7, done-criterion 4): loading `.env.example` with `bun --env-file` from a scratch directory adds exactly `S3_ACCESS_KEY_ID`, `S3_BUCKET`, `S3_ENDPOINT` and `S3_SECRET_ACCESS_KEY`, all empty. `git check-ignore` ignores `.env` and `runs/` but not `sites.yaml` or `.env.example`. `.env.example` is the only tracked env file.
- E9 (done-criterion 4): a value-free scan (`bun --env-file=.env`, printing names only) covered 28 tracked non-env files at HEAD and 3 `runs/` artifacts. It found no occurrence of any of the four values, the endpoint host or signed-URL markers: PASS. I also probed YAML errors (unclosed flow and quote, bad indent, tab indent, unresolved alias, multi-document, duplicate key, merge anchor). Each raised `SitesConfigError` without echoing content.
- E10: a pure probe gives `expiredReportKeys(["reports/<id0>/", "reports/<id0>/a.png", "reports/<id1>/a.png"], 1)`, which includes the marker key. `delete` of that key rejects with `StoreError` (N3).
- E11: the loader accepts `'/\\evil.example/'`. `new URL(path, "https://acme.example")` gives `https://evil.example/`, while concatenation gives `https://acme.example///evil.example/` (N1).
- E12 (F1): I archived HEAD into a scratch git repo with this `.gitignore` and added one failing `issues/worktrees/other/tests/nested.test.ts`, which `git check-ignore` confirms is ignored. `bun test` then reported "44 pass, 1 fail, Ran 45 tests across 4 files" and exited 1. With `bunfig.toml` `[test] pathIgnorePatterns = ["issues/**"]` it reported 44 pass, 0 fail, exit 0. `root = "tests"` also gave 44 pass, exit 0.
- E13 (F1, live): the primary checkout's `issues/worktrees/` holds `form-helper-plugin/test/plugin/{harness,core,adapters}.test.ts` and `checker-foundation/tests/{sites,env,store}.test.ts`.
- Real R2 was not rerun, because the code has not changed since B's run. The final artifact `runs/store-selftest-2026-09-25T13-56-04.489Z.json` shows `pass`, 11/11 checks, cleanup `{"ok":true,"deleted":10,"remaining":0}`, finished at 13:56:53Z. The commit is at 13:57:56Z, and `src`, `scripts`, `tests` and `package.json` have no later changes. The two earlier worker artifacts also show `pass` with clean roots.

## Plan compliance summary

- Checklist items 1–16 are present. Item 15 correctly adds no agent docs.
- D2/AC2: all six required negatives fail as `SitesConfigError` with the site and field named. The broader cases (root and page unknown keys, types, ratio bounds and null, paths, duplicates, collisions including `/` vs `/home/` and `/a/b/` vs `/a-b/`, read and YAML errors) are tested.
- D4/AC3: imports need no credentials, and diagnostics carry names only.
- D5–D7/AC4–AC6: scoped keys, complete pagination (a real truncated page at size 5), canonical run-prefix retention with sentinels, invalid, zero, default and no-op keep, the signed GET fetch and `finally` cleanup are implemented and evidenced against real R2.
- Tests do not mock the unit under test. The closed-port config only proves validation happens before any request.
- Ponytail: no unrequested abstractions. `pageSize` exists for AC6, and the sequential deletes carry a `ponytail:` ceiling note.

## Lesson

Recorded as one line in the registered checkout's `learnings/LESSONS.md`, with the history file `learnings/history/2026-09-25-bun-test-nested-worktrees.md`. Both are left uncommitted for the operator.

## Re-check after `check.fix` round 1

Slot A, re-check, 2026-09-25.

- Prior reviewed head: `fb5e37975905d708e58ee2b5a2d86ee4965979e3`
- Repaired head: `f40e7c943dbe5f6379e6a9a4ce2aa569af6cea3a` (`Fix checker test discovery and page path validation`), one commit on `fb5e379`. Base is still `93cf3b7`, and `git status --short` is empty.
- Scope: only the repair diff `fb5e379..f40e7c9`, which touches 8 files (+83/−12): `bunfig.toml`, `src/sites.ts`, `src/store.ts`, `README.md` and the four test files. Inputs were the repair section of `implementation/report.md`, the plan's repair-round note and checklist item 1a, and `review-B.md`. I read the peer review now that the blind phase is over, so B's findings could be confirmed too.

### Verdict: `ready`

Both blocking findings are fixed, and each fix has a test that failed before it. Every Nit is fixed except A N3, which is now an accurate, documented limitation with a regression test. The repair introduces no defect.

### Earlier findings

- **A F1 (Fix), fixed.** `bunfig.toml:3` sets `[test] pathIgnorePatterns = ["issues/**"]`, and the README row for `bun test` (`README.md:38`) says so. The nested failing-test scenario now runs only the project's 48 tests and exits 0. Removing the pattern makes the new `tests/discovery.test.ts` fail (R2). That test also proves `tests/` and `test/` are both still discovered, so the `test/forms/` directory that form-check-scope plans stays in scope.
- **B F1 (Fix) and A N1, fixed.** `src/sites.ts:115` rejects backslashes, ASCII space and control characters (U+0000–U+0020 and U+007F) in page paths, for both page forms, and names the site and field. B's three reproductions and five further normalization bypasses are rejected. Percent-encoded and non-ASCII paths still load and resolve on the site (R3, R4). The operator's real site list still loads (R5). `README.md:81` states the refined rule.
- **A N2, fixed.** `README.md:20` uses `cp -n`, which keeps an existing `sites.yaml` (R6).
- **A N3, accepted as a documented limitation.** B's claim is correct: Bun 1.4.2's `S3Client` strips a trailing `/` on write, delete, exists and presign (R7). The library therefore cannot address a folder-marker key and could only hit the key without the slash. Keeping the loud `StoreError` honours D6. `README.md:182` documents this accurately, and `tests/store.test.ts:142` pins the rejection. Nothing remains to do here.
- **A N4 and B N1, fixed.** Each test file removes its temp fixtures in `afterAll`, and a full run adds no directories (R8).
- **A N5, fixed.** `tests/store.test.ts:176` now compares the repository's `runs/` entries before and after the missing-config run. The report records worker 3's mutation probe: an inserted artifact write made the assertion fail. I did not repeat that probe for a Nit.
- **B N2, fixed.** `src/store.ts:56–58` appends to the run's array instead of copying it. The unchanged `expiredReportKeys` unit tests pass, and B's real-R2 run covered the committed store code (R9).

Two observations that are not findings. The discovery test matches Bun's summary line only for its counts, and its exit-code and `nested` assertions catch the regression on their own. The `runs/` before/after check can fail spuriously only if a real selftest writes an artifact at the same moment, which the report discloses.

### Documented behavior

`README.md` is still the only doc for this behavior. Its four changed passages match the code and R2–R7: setup, the `bun test` row, the page path rules and the folder-marker limitation. No other documented behavior changed. The repair diff has no `AREA.md`.

### Re-check evidence

Run in the worktree unless noted, on Bun 1.4.2. No env file was opened or printed, and no value or signed URL was output.

- R1: `bun test` gave 48 pass, 0 fail, 505 `expect()` calls across 4 files, exit 0. `bun run typecheck` exited 0. `git diff --check fb5e379 f40e7c9` was clean.
- R2 (A F1): I made a `git archive f40e7c9` copy with no `.env` and added one failing `issues/worktrees/other/tests/nested.test.ts`. Bare `bun test` there reported "48 pass, 0 fail, Ran 48 tests across 4 files" and exited 0. With `bunfig.toml` reduced to `[test]`, it gave 47 pass and 2 fail (the nested test and `tests/discovery.test.ts`), exit 1.
- R3 (B F1): the pre-repair `src/sites.ts` run against the repaired tests gave 25 pass, 1 fail. Only the new test "paths that URL resolution would normalize off-site or into traversal" failed.
- R4 (B F1, A N1): the real loader rejected these as `SitesConfigError` on `acme` / `pages[1].path`: `/\elsewhere.example/`, `/a/..\outside/`, `/a/<TAB>../outside/`, `/<TAB>/elsewhere.example/`, `/a/<LF>../outside/`, `/a/<VT>../outside/`, `/a/..<NUL>` and `/a/..<space>`. It accepted `/%5Celsewhere.example/`, `/a/..%09/`, `/café/`, paths containing NBSP and U+3000, and `/a/%2e%2e%2e/`, and all of them resolve on `https://acme.example`.
- R5 (live surface): the operator's `sites.yaml` on `main` (e0ee984) loads with the repaired validator: 13 sites, 120 pages.
- R6 (A N2): with GNU coreutils 9.11, `cp -n sites.example.yaml sites.yaml` over an existing `sites.yaml` exits 0 and leaves the file unchanged.
- R7 (A N3): I used a local capture server with fake credentials, not R2. `write`, `delete` and `exists` of `reports/2026-01-01T00-00-00.000Z/` went out as PUT, DELETE and HEAD requests to `/bkt/reports/2026-01-01T00-00-00.000Z`. `presign` signs the same path without the slash. A control key kept its full path.
- R8 (A N4, B N1): `/tmp` held 35 matching fixture directories both before and after a full `bun test` run. All of them were left by earlier runs.
- R9 (B N2): B's real-R2 artifact from after the change, `runs/store-selftest-2026-09-25T15-28-01.304Z.json`, shows `pass`, 11/11 checks and cleanup `{"ok":true,"deleted":10,"remaining":0}`, from 15:28:01Z to 15:28:44Z. `src/store.ts` and `scripts/store-selftest.ts` were last modified at 15:22:15Z and the commit is at 15:29:38Z, so the run covered the committed code. I did not rerun R2.
- R10 (done-criterion 4): a value-free scan of the 30 tracked non-env files at `f40e7c9` and the 6 `runs/` artifacts found 0 hits (PASS).

No new lesson came out of the re-check.

## Merge

Slot A, `merge`, 2026-09-25.

- Remote `origin`, default branch `main`. There were no outstanding worktree changes to commit (`git status --short` was empty, and `runs/` is ignored).
- Rebase target: fetched `origin/main` at `e0ee984d9d0d796fe88310b79be566af34ece98d`. Main's two new commits, `1ca27f4` and `e0ee984`, add the 13-site `sites.yaml` and issue-tracking files.
- Prior reviewed head: `f40e7c943dbe5f6379e6a9a4ce2aa569af6cea3a`. Rebased head: `0663984e0d80887123298bd43d6768e1cc2cbbf9`. The rebase was clean because no file is changed on both sides.
- `AKROGON_BASE` refreshed from `akrogon config` after the rebase: `93cf3b7f6b99f3a34be7f69c004345c439fa6a76` → `e0ee984d9d0d796fe88310b79be566af34ece98d`.
- `git range-diff 93cf3b7..f40e7c9 e0ee984..HEAD` marks both commits `=`, so the patches are unchanged. `git diff --stat f40e7c9 HEAD` lists only main's 15 files.

### Checks

`akrogon config` has `checks: {}` and `advisory: []`, so no configured command exists. Because the rebase changed the integration, I ran the project's own commands on the rebased head:

- M1: `bun test` gave 48 pass, 0 fail, 505 `expect()` calls across 4 files, exit 0.
- M2: `bun run typecheck` exited 0. `git diff --check e0ee984 HEAD` was clean.
- M3 (live surface): `loadSites()` with its default path reads the now-committed `sites.yaml` and returns 13 sites and 120 pages.
- I did not rerun real R2. The rebase brought in only `sites.yaml` and issue files, which neither the store nor the selftest reads, and the patches are identical to the reviewed ones that R9 covers.

A holds no Nits, so no lesson was added.

### Push

- `git push origin HEAD:main` printed `e0ee984..0663984  HEAD -> main`, a fast-forward, and exited 0.
- After `git fetch origin`, `origin/main` is `0663984e0d80887123298bd43d6768e1cc2cbbf9`, and `git merge-base --is-ancestor 0663984 origin/main` succeeds.
