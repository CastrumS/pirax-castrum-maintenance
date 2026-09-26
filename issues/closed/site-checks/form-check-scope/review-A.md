# Review A: form-check-scope (check.review, initial, blind)

- Base: `0a7ddf98806ede20a331cd2d68e073e89741648e`
- Reviewed head: `2abc3458f796da5501ce82fe83d810f0cc766dcd` (branch `form-check-scope`, worktree clean)
- Diff: 16 files, +572/−116; no `issues/`, plugin, capture/health, mail transport or storage files touched.
- Inputs read: `akrogon config`, `brief.md`, `design.md` (+ standing design pointer), `plan.md`, `implementation/report.md`, the full base→head diff, and unchanged callers/readers (`src/forms/detect.ts`, `src/commands/{forms,check,common,approve}.ts`, `src/report/manifest.ts`). `debate: "no"`, so no positions/rebuttal artifacts exist (expected).

## Verdict: `nits`

No Fix. Every plan criterion (AC1–AC7) is met by the code and backed by behavioral evidence. The three Nits below are non-blocking.

## Behavior traced against the plan

- **D1/AC1 schema** (`src/sites.ts:146-155`): absent stays absent (`...(test_form ? {test_form} : {})`). There is a strict key allowlist. `page` must exactly equal a listed normalized path. Plugin must be gravity or fluent, and id must be a safe integer with no string coercion. Every error names the slug and a `test_form[.member]` field without echoing the value. A probe against the real loader showed `1.5` and `'4'` are rejected, while `4.0`, `1e0`, `0x4` and `+4` normalize to integers. `0` and `-3` load, per D1 (no positive-only restriction), and at runtime produce the explicit `test form not found`.
- **D2/AC2 one attempt** (`src/forms/runner.ts:54-60`): `target` is set only when `test_form.page === listedPage.path`. `selected` is the first `findIndex` match on plugin plus `String(id)`, taken from discovery before any per-form `visit`. Every other index is pushed as `skipped` and hits `continue` before any context, `readFormConfig`/`readImapConfig`, inspection or typing. The whole codebase has exactly one path that fills forms (`scanPageForms`, called only from `populateForms`, called once each by `runForms` and `executeCheck`). Listed paths are unique per site, so at most one descriptor per site per invocation is ever processed. Failed, rejected, unsupported or identity-changed selections push their own result, and the loop only skips afterwards, so there is no fallback.
- **D3/AC3 missing** (`runner.ts:88-89`): the synthetic `failed` / `test form not found` is added only after the loop, and only when `target && selected < 0`. It can only follow a successful discovery, because discovery failure returns `[scanFailure]` at line 51 and an outer failure lands in the catch. So a challenge or navigation failure is never reported as absence.
- **D4/AC5 skipped**: model union, shared `formsOk` whitelist (both modes), `formStatus` → pass, a literal outcome cell with a neutral class, and a footer note in both renderers. `schemaVersion` is unchanged. Old manifests stay valid and unknown outcomes still reject. `validateApproval` never reads forms, so approval selection is unchanged. Exit codes: forms-only uses `reportStatus === 'failure'` and check uses `failure|blocked`. Skips alone give 0, and a missing designation gives 1.
- **D5/AC7 config**: all 12 `# test_form:` lines are uncommented verbatim (base 12 commented → head 12 real; only the header comment still says `# test_form`). downstairs has none, helper flags are unchanged (0 true), and instrukcijezasve is on `/kontakt/` GF #4.
- **D6/D7 tests**: see the evidence below. Retained gate tests still reach the selected-form code (`/ambiguous-ff` is fluent id 2 → inspection `unsupported`; `/upload` and `/constrained` → inspection; `/plain` → IMAP preflight throw before POST). Nothing now passes merely because omission skips everything. No mock replaces the scanner, filler, submitter, store or auth. `watched()` only attaches a console listener to real contexts of a dedicated browser.

## Documentation

The documented behavior changed and the docs were updated. I read against the code: README intro, Commands budget, Site list (YAML, `TestForm`/`Site` types, errors field list), Form checks (fill/unsupported text, helper-false, rejection/no-fallback, one-deadline-per-site timing), outcome table (`skipped` neutral, `test form not found` → exit 1), the new "Designated test form" section, and lazy credentials. I also read `test/forms/README.md` (browser matrix, four CLI scenarios, FF `runForms` case, `check` case, 660,000 ms / one 300,000 ms deadline, evidence layout, exits), `sites.example.yaml` and the `sites.yaml` header. Every claim matches the code or the retained evidence. Named paths all exist: `test/fixtures/cli.ts`, `tests/commands.test.ts`, `plugin/pirax-form-test/README.md`, `test/plugin/README.md`, the `#designated-test-form` / `#form-checks` anchors, and the scenario directories under `cli/<scenario>/runs/<runId>/`. The plugin guides have no stale "every form" claim. No `AREA.md` is in the diff (grounding `none`).

## Verification evidence

Blocking checks (configured `checks`; `advisory` empty):

- `bun run typecheck`: B `implementation/b-typecheck.log` EXIT=0. A reran it on HEAD: `tsc --noEmit`, EXIT=0.
- `bun test` / `test_changed`: B `mise exec node@24.21.0 -- bun --env-file=.env test` gave **212 pass / 0 fail, EXIT=0** (`implementation/b-full-suite.log`, 21:16:56Z–21:37:30Z). The worker's `AKROGON_BASE` run also gave 212/0. Tree identity: all 16 changed files' mtimes predate the run (latest `README.md` 20:53:18Z), the commit is 21:41:43Z, and `git status` is clean. So B's run covered the committed content. I did not rerun the 20-minute native suite: there was no code change after it, the evidence is present, and I had no concern that needed it.
- A's first-hand rerun on HEAD (credential-free): `bun --no-env-file test tests/sites.test.ts tests/report.test.ts test/forms/browser.test.ts` gave **62 pass / 0 fail, EXIT=0** (80.7 s). All six new browser scope tests passed with real Chromium and a loopback server.
- Live configuration surface (offline): `loadSites()` on the committed list gave `{"sites":13,"designated":12,"downstairsHasDesignation":false,"helpersTrue":0}`. No site was visited.
- `git diff --check` is clean, and the added tests contain no `.only`/`.skip`/`.todo`.

Native evidence inspected (`runs/forms-playground-1996ecd0-26c4-4c2e-a9d5-de315f30639f/summary.json` and its files):

| Scenario | Exit | Pages (scopeA / scopeB) | Traces | Mail |
| --- | --- | --- | --- | --- |
| `none` | 0 | 3 skipped / 3 skipped | 2× scan | unchanged |
| `missing` (GF 999999 on B) | 1 | 3 skipped / 3 skipped + `failed` | 2× scan | unchanged |
| `helper-false` | 0 | 3 skipped / not-verified + 2 skipped | scan×2 + form-1 | unchanged |
| `selected` (GF on B) | 1 (305,748 ms) | 3 skipped / failed + 2 skipped | scan×2 + form-1 | 1 ID `ttupisrwaooa`, 2 notifications |

`check` and the FF `runForms` case each show 1 ID with 2 notifications. Entries and feeds are unchanged (0/0 before and after helper cleanup). Cleanup `{ok:true, deleted:42, remaining:0}`, privacy `{files:109, archives:46, unsafe:0}`. The fetched `remote-index.html` is byte-identical to the local `index.html` (`selected`). The published HTML shows `local — pass` plus the skipped note (none), `test-form:gravity:999999 … test form not found` with `local — failure` (missing), and 5 skipped cells plus 1 failed (selected). Mail-delta oracle: every message in the delta must carry an expected tag, two per ID. Any extra submission of a skipped form, tagged or untagged, would therefore fail it, which makes it a sound count oracle given that the helper deletes entries.

## Findings

### Nit 1: unreachable unknown-plugin guard (`src/forms/runner.ts:61`)
After the new gate at line 60, the only descriptor that reaches line 61 is `selected`. `designated()` guarantees its plugin is gravity or fluent and its `pluginId === String(target.id)`, a nonempty string. So `descriptor.plugin === 'unknown' || !descriptor.pluginId` can never be true. The dead branch suggests unknown forms can still be reported `unsupported`, while README now says they are "always skipped". Delete it. `fillForm` keeps the same guard (`src/forms/fill.ts:115`), so no safety is lost. Nit, not Fix: there is no behavior difference.

### Nit 2: new tests pin human-readable prose
The following assert full reason or footer sentences:
- `test/forms/browser.test.ts:84,281,303,327,382-383`
- `test/forms/playground.test.ts:257,263,295,311`
- the skipped-note regexes at `tests/report.test.ts:73` and `test/forms/report.test.ts:155,219`

Rewording a reason would fail behavior tests. `test form not found` is a brief-mandated fixed literal and is fine. Nit, not Fix: every acceptance behavior (outcome shapes, zero recorder events, POST/trap deltas, trace counts, mail delta, exits) is asserted independently of the prose. Consider asserting the reason category via a stable prefix, or only once.

### Nit 3: name shadowing in `test/forms/playground.test.ts`
The pre-existing local `const scoped: Store` (line 105, used at 113) now shadows the new module-level `async function scoped(...)` (line 218). It is correct but easy to misread. Rename one of them (for example `noBaselineStore`).

## Observations (no finding)

- The first matching instance in document order is the only one attempted, even if an earlier duplicate is hidden. That follows D2 and is documented in the README.
- The forms pass still performs discovery on every listed page (including undesignated sites), and a discovery failure there still fails the run. That follows D2 ("do not suppress discovery"), and AC3 wants it explicit.
- The worker's earlier one-off `tests/report.test.ts` Chromium render timeout did not recur (B's full suite passed, and my focused rerun passed, 62/62). It is outside this diff.

No reusable lesson was found in this review, so nothing was written to `learnings/`.

---

## Re-check after repair round 1 (2026-09-27)

- Prior reviewed head: `2abc3458f796da5501ce82fe83d810f0cc766dcd`
- Repair head: `24a67fdcc7df668cca4387ed7ea58caa497e136c` ("Clarify missing designated forms in report documentation"). Branch `form-check-scope`, worktree clean, 2 ahead of `origin/main`, not rebased.
- Repair diff: `README.md` only, one line (+1/−1). `git diff --check` is clean. No source, test, config, plugin or `issues/` file changed.
- Inputs read: `state.yaml` (`check.review`, `fix_rounds: 1`), `review-B.md` (readable now that the initial pass is over), the plan's "Implementation notes — 2026-09-26, repair round 1", the report's "Repair round 1" section, `worker-2-report.md` and `worker-2.log`, and the repair-round logs.

### Verdict: `nits`

B's F1 is resolved and the repair adds no defect. My three initial Nits were deliberately deferred and still stand as non-blocking.

### Earlier findings

- **B F1 (Fix): resolved.** `README.md:204` now reads: a successfully scanned page without forms is `[]`, except the `test_form` page, which gets one `failed` result with detail `test form not found`; discovery failures remain explicit failed results. Traced against the code:
  - `populateForms` (`src/forms/runner.ts:105-108`) assigns one `forms` array per listed page, not per viewport, so "one result" holds for `check`.
  - In `scanPageForms`, zero descriptors on the designated page give `selected = -1`. The loop adds nothing, and line 89 adds exactly one `failed` / `test form not found`. Without a `target`, the array stays `[]`.
  - A discovery failure returns `[scanFailure]` at line 51, before either case.
  - Tests cover both halves: `test/forms/browser.test.ts:235` (undesignated `/empty` → `[]`) and `:344` (designated `/empty` → `["gravity:failed"]`).
  - The sentence agrees with `README.md:222` (outcome table) and `:231` (Designated test form).
  - A grep of tracked `*.md`/`*.yaml` finds no other unconditional empty-result claim. The two "no-form pages" statements (`README.md:238`, `test/forms/README.md:62`) concern credential laziness and stay true, because the synthetic result reads no configuration.
- **A Nits 1–3: deferred, still open, non-blocking.** The repair did not touch `src/forms/runner.ts:61`, the prose-pinning assertions or `test/forms/playground.test.ts:105`/`:218`. The plan notes and report record them as deferred, not as resolved.
- **Missed by my initial pass.** The initial diff edited this exact paragraph: it inserted the `skipped` sentence directly after "no forms is `[]`". I checked the inserted sentence and the new section, and wrote that every claim matched. The stale clause next to them was wrong, and B's F1 was a correct Fix.

### Findings introduced by the repair

None. The new sentence is accurate, names no path or link, and changes no behavior.

### Verification evidence

The repair changed no code, so I did not rerun checks. The existing evidence covers the committed tree:

- `README.md` mtime is 21:56:29Z. The worker's `test_changed` run (`AKROGON_BASE=0a7ddf9`) gave 212 pass / 0 fail, exit 0, over 1243.67 s ending 22:17:17Z, so it started after the edit. B's full suite, `mise exec node@24.21.0 -- bun --env-file=.env test`, gave 212 pass / 0 fail, EXIT=0, from 22:19:12Z to 22:39:51Z (`implementation/b-repair-1-full-suite.log`). That run has its own run IDs and timings, distinct from the initial log. B's typecheck `tsc --noEmit` gave EXIT=0 (`implementation/b-repair-1-typecheck.log`). The commit is at 22:41:29Z.
- No test reads the root `README.md`; the only README path in the tests is the plugin's `pirax-form-test/README.md`. So this prose cannot change a test result.
- B's repair-round native summary (`runs/forms-playground-55d3beb7-c1aa-4889-844a-85c69279f694/summary.json`) matches the report:
  - cleanup `{ok:true, deleted:42, remaining:0}`, privacy `{files:109, archives:46, unsafe:0}`
  - CLI exits: none 0, missing 1, helper-false 0, selected 1 (305,523 ms)
  - selected: one ID with 2 mails, and entries and feeds unchanged

  This is a regression of unchanged runtime, not new delivery evidence.

### Lesson

Recorded in the registered checkout and left uncommitted for the operator. `learnings/LESSONS.md` gets one line and `learnings/history/2026-09-27-form-check-scope-edited-paragraph.md` holds the case. When a diff edits a doc paragraph and adds a result for an edge input, re-check every clause of the paragraph and grep for the old edge-case wording, not only the inserted text.

---

## Merge (A, 2026-09-27)

- Remote/branch from `akrogon config`: `origin`/`main`. After `git fetch origin`, `origin/main` = `0a7ddf98806ede20a331cd2d68e073e89741648e`, unchanged since the leaf base.
- Rebase target: `0a7ddf98806ede20a331cd2d68e073e89741648e`. `git rebase origin/main` printed "Current branch form-check-scope is up to date." The head stays at the re-checked repair head `24a67fdcc7df668cca4387ed7ea58caa497e136c`. No conflict, so no range-diff.
- `AKROGON_BASE` refreshed after rebase: `0a7ddf98806ede20a331cd2d68e073e89741648e`, unchanged.
- Outstanding changes: none. The worktree is clean, and issue artifacts stay in the leaf, not on the branch.
- Nits turned into lessons: none. The dead guard and the name shadowing are local. Prose-pinning assertions are already a standing review rule. This leaf's one lesson was recorded at re-check.

### Checks (configured `checks`; `advisory` empty)

Neither code nor integration changed since the repair-round runs:

- The rebase was a no-op, and `origin/main` and `AKROGON_BASE` are unchanged.
- The newest tracked-file mtime is `README.md` at 21:56:29Z. Every other tracked file is at or before 20:17:29Z.
- Both runs below started after that edit, and the commit adds only that README line.

So the successful runs are reused as permitted:

- `test_changed`: `mise exec node@24.21.0 -- env AKROGON_BASE=0a7ddf98806ede20a331cd2d68e073e89741648e bun --env-file=.env -e '… ": \"${AKROGON_BASE:?AKROGON_BASE is required}\" && bun test" …'` gave **212 pass / 0 fail, exit 0**, 1243.67 s ending 22:17:17Z (`implementation/worker-2-evidence/changed-tests.{log,exit}`).
- `test`: `mise exec node@24.21.0 -- bun --env-file=.env test` gave **212 pass / 0 fail, EXIT=0**, 22:19:12Z–22:39:51Z (`implementation/b-repair-1-full-suite.{log,exit}`).
- `typecheck`: rerun first-hand on HEAD `24a67fd` at 22:48:53Z with `bun --no-env-file run typecheck` → `tsc --noEmit`, **EXIT=0** (`merge-A-typecheck.log`).

### Push

`git push origin HEAD:main` gave `0a7ddf9..24a67fd  HEAD -> main`, exit 0, as a fast-forward with no rejection. After `git fetch origin`, `origin/main` = `24a67fdcc7df668cca4387ed7ea58caa497e136c`, and `git merge-base --is-ancestor 24a67fd origin/main` succeeds.
