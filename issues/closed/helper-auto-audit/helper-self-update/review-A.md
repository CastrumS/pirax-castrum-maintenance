# Review A: helper-self-update

Slot A · check.review (initial, blind) · 2026-10-05

- Base: `2689aaa3bd69a9a46cc77788fdc5219354cc923a`
- Reviewed head: `f2b79e29775869e0f353824bb4aafe61280833b0` (worktree clean)
- Live surface: `origin/main` at `e6bc044` (sibling leaf `checker-awaiting-audit` is `merged`)
- Inputs: `brief.md`, `design.md`, `plan.md` with its implementation notes, `implementation/report.md` and its cited evidence, the full 21-file diff, and the live docs/code on `origin/main`. Debate is `no`, so there are no `positions-A.md` or `rebuttal-A.md` files.

## Verdict: `fix`

There are two Fixes and no failing blocking check. The updater, signature/hash boundary, version-only classification and release CLI match the plan's decisions and acceptance criteria. Both Fixes are documentation or child-environment defects with small, local repairs.

## Fixes

### F1: awaiting-audit docs are false against the live surface, and the root README conflicts with main

Basis: done criterion 5 (plugin README documents the new message) and plan AC6/D1 (describe the excluded checker by responsibility, not by status). Reproducible with `git merge-tree --write-tree origin/main f2b79e2`.

- `plugin/pirax-form-test/README.md:109` ends with: "The form checker does not read this message yet: its planned `awaiting-audit` warning and escalation are not implemented, so such a test is still reported like any other blocked submission."
  - `checker-awaiting-audit` is merged. On `origin/main`, `src/forms/submit.ts:113-115,187` classifies exactly this message as the `awaiting-audit` outcome, and `src/forms/awaiting-audit.ts` fails it after 72 hours (`60f463c`, `ccd7747`).
  - The sentence was written on 2026-10-05 (`a78d04c`/`f2b79e2`), after those commits were already on `origin/main`.
- The opposite claims on `origin/main` become false as soon as this leaf makes the in-tree helper 0.3.0 emit the message:
  - `README.md:233` (main): "The in-tree helper (Pirax Form Test 0.2.4) does not emit this message yet: it still answers a version mismatch with `Pirax test blocked: integrations could not be suppressed` …"
  - `test/forms/README.md:41,44` (main): "(the in-tree helper 0.2.4's answer to a version mismatch)" and "the in-tree helper 0.2.4 does not."
- In the trial merge, the root README says both "The helper emits this diagnosis" (line 14, this leaf) and "The in-tree helper (Pirax Form Test 0.2.4) does not emit this message yet" (line 233, main). The same trial merge reports a content conflict in the README.md command table: this leaf's full-suite row (55 minutes, `gh` note) sits next to main's changed `test:forms` row.
- Remedy:
  1. Rebase onto `origin/main` and record the pure-rebase head before adding repair commits, so the re-check diff stays the repair only.
  2. Resolve the table by keeping both rows' edits.
  3. Replace the plugin README sentence with the checker's actual handling, or a pointer to the root README's "Awaiting-audit refusals" section.
  4. Reword main's README and `test/forms/README.md` statements: helper 0.3.0 and newer emits the message; sites still on 0.2.4 or older keep the generic message, which the checker reports as `rejected`. The `test/forms` fixtures stay synthetic checker evidence; native proof of emission is this leaf's `test/plugin/compatibility.test.ts`.

### F2: the plugin test tooling still passes `PIRAX_HELPER_SIGNING_KEY` to `zip`/`unzip` children

Basis: plan D8 ("Strip `PIRAX_HELPER_SIGNING_KEY` from unrelated build/test/Playground child environments") and this diff's own claim in `test/plugin/README.md:42`: "…withholds it from `zip`/`unzip`, the Playground child and Chromium". Reproducible defect.

- `test/plugin/artifacts.ts:48` `run()` spawns without `env`, so its children inherit the full parent environment:
  - `findSecret()` runs `unzip`.
  - `sanitizeZip()` runs `unzip` and `zip`.
- These helpers run in every native plugin suite:
  - `harness.ts:448` sanitizes each trace in `closeBrowser()`.
  - `core.test.ts:98` scans `dist/`; its needle list now includes the seed.
  - `updates.test.ts:445` scans the artifact directory.
- The direct calls `harness.test.ts:113,169` and `stack-harness.test.ts:149` behave the same way.
- When it bites:
  - The documented commands (`bun --env-file=<registered>/.env test test/plugin`, and brief criterion 5's `bun --env-file=.env test test/plugin`) load the registered `.env`. That file now holds the real seed: its presence and its derivation of `UPDATE_PUBLIC_KEY` were checked name-only, see below.
  - B's final runs removed the seed from the test process itself, so this path was never exercised.
- Repro, with a synthetic value and no env file:
  - PATH-wrapped `unzip` and `zip` record only whether the variable is present.
  - `PIRAX_HELPER_SIGNING_KEY=<synthetic> bun --no-env-file -e '…findSecret(dir, […]); sanitizeZip(zip, […])'` printed `unzip: seed present` twice and `zip: seed present`.
  - `findSecret` still reported zero content hits.
- Remedy: pass `env: withoutSigningKey()` in `artifacts.ts` `run()`. That one shared boundary covers `findSecret` and `sanitizeZip`. Add `.env(withoutSigningKey())` to the three direct calls, or narrow the README sentence to what is actually stripped.

## Nits

- **N1: policy, operator decision.** The real signing seed sits in the registered `.env`. It was supplied outside this pass (plan note of 2026-10-05), while the locked design keeps the private key only in the `PIRAX_HELPER_SIGNING_KEY` repository secret.
  - Outside this leaf's tooling, every `bun --env-file=.env …` command passes the seed to its Chromium and Playground children. That includes checker runs and the forms, R2 and visual suites, which this leaf does not own and does not strip.
  - Decide whether to keep a local copy (and accept that exposure) or remove it. GitHub cannot show the stored secret's value. A mismatch between the two copies would surface only as the release CLI's key-mismatch refusal in `reaudit-job`, which is fail-safe.
- **N2: brief wording, already disclosed.** "`bun test` (credential-free)" does not match test discovery: bare `bun test` finds the credentialed native, forms and R2 suites. The plan and report record this. The credential-free subset and the full credentialed gates were both run. No action for this leaf.

## Verified without finding

- **AC1/AC2 (`includes/updates.php`, `updates.test.ts`)**
  - Exact canonical package binding; strict base64 key and signature; Ed25519 over the exact bytes, with WordPress `sodium_compat` as fallback.
  - Strict key set and types; stable dotted versions; newer-than-installed check against the header on disk.
  - Stale offers are dropped on every refresh, and unrelated transient entries are preserved.
  - The `plugins_api` error stops a wordpress.org fallthrough.
  - `auto_update_plugin` applies to this exact basename only.
  - The download boundary:
    - runs at `PHP_INT_MAX` and refuses pre-populated replies;
    - requires helper context and does a fresh verify-and-compare against the offer (`package`, `new_version`, `sha256`);
    - hashes the actual temp file, deletes it on mismatch, and never returns `false`.
  - This works on the real WordPress paths: `Plugin_Upgrader::upgrade`/`bulk_upgrade` and `WP_Automatic_Updater` all pass `hook_extra['plugin']`.
  - The test matrix covers the brief's unsigned, other-key, not-newer and hash-mismatch cases plus 30 more feed cases, a native browser install from 0.3.0 to 0.3.1, and unchanged bytes after every refusal. The only test accommodation is the fixture port in `http_allowed_safe_ports` for `127.0.0.1`; neither authentication nor update HTTP is mocked.
- **AC3 (`compatibility.php` and adapters)**
  - The `suppress_cleantalk_ajax_check` refactor is equivalent to the base, case by case.
  - `block_message()` requires known versions, at least one mismatch, no other cause or unrecognized binding, and every unaudited callback owned (by reflected realpath, with a directory boundary) by a mismatched plugin.
  - The early GF AJAX guard keeps marker/config precedence, never reads GF form data under an unaudited GF, and now records the last block.
  - Public callback records keep their `(hook, priority, id)` shape. Last-block storage stays autoload-off with no paths.
  - The message format parses with main's checker regex (`src/forms/submit.ts:114-115`), including multi-word labels such as "Anti-Spam by CleanTalk".
- **AC4 (`scripts/release-plugin.ts`)**
  - Version and audited matrix are parsed from source with name-only errors.
  - Order: seed check, key match, then the git dirty, local-tag and remote checks (only a 404 counts as absent), then build and sign, then the atomic ref claim, then `gh release create --verify-tag --latest`.
  - The manifest fields match PHP's `package_url()` and validation exactly.
  - Every child process runs without the seed.
- **AC5**
  - The seed from the registered `.env` derives the committed `UPDATE_PUBLIC_KEY`, and sign/verify passes. The checking script printed booleans only.
  - `gh secret list` shows `PIRAX_HELPER_SIGNING_KEY`. The repository has no releases and no remote tags, so this leaf published nothing.
- **Lesson check.** The claims in `learnings/history/2026-10-05-helper-self-update-publication.md` match `gh-release-create-help.txt` (`--target` is used only for automatic tag creation; `--verify-tag`; draft, upload, then publish) and `evidence-u4/red.log` (10 pass, 4 fail) and `green-release.log` (14 pass, 0 fail).

## Verification evidence

| Check | Result |
|---|---|
| `bun run typecheck` at `f2b79e2` | exit 0 |
| `bun --no-env-file test test/plugin/release.test.ts` at `f2b79e2` | 14 pass, 0 fail (real read-only GitHub lookups; mutations intercepted) |
| `bun --env-file=<registered>/.env <scratch>/key-check.ts` (booleans only) | seed present and canonical; derived key equals committed key; sign/verify true |
| `gh secret list`, release listing, `git ls-remote --tags origin` | secret name present; no releases; no tags |
| `git diff --check base..head`; AREA files in diff | clean; none |
| `git merge-tree --write-tree origin/main HEAD` | `README.md` content conflict; contradictory awaiting-audit claims (F1) |
| Synthetic-seed child-environment repro | seed reached `unzip` twice and `zip` once (F2) |
| B's broad and native gates | Not rerun: no code change since then. Evidence is consistent with the committed head: `evidence-final/release-…/release-summary.json` carries `f2b79e2`'s final error wording, and `package-scope-green.log` shows 7/7 after the package-scope fix. Results: 271/0 configured checks, 92/0 plugin, 114/0 credential-free. |

Docs: documented behavior did change. I checked the plugin README (Updates, Releasing, messages, last block), `test/plugin/README.md` and the root README against the code, plus the live `origin/main` README and `test/forms/README.md`. All named paths and anchors exist. The wrong claims are F1 and F2.

Lessons: none added. F1 repeats the existing sibling-contract lesson (2026-10-02, checker-awaiting-audit review A). For F2, after reproducing it myself, I noticed an uncommitted 2026-10-05 entry about archive children in the registered checkout's `learnings/`. I did not read the peer review it points to.

## Re-check after check.fix (round 1): 2026-10-06

Slot A · check.review (A-only repair re-check)

- Prior reviewed head: `f2b79e29775869e0f353824bb4aafe61280833b0`, base `2689aaa3bd69a9a46cc77788fdc5219354cc923a`
- Rebased onto `origin/main` `e6bc04490e4a12c20db76fbc704b06e207627498`. Recorded pure-rebase head: `db2cba17bed1ecccab0f433a055ff8d4b7d5a405`
- Re-checked head: `4e929fca0a8c793f2189454091fb5c0fcf74a1da` (worktree clean)
- Repair range: `db2cba1..4e929fc` (`938bf9c`, `4e929fc`), 9 files, +67/−14. Inputs: B's repair appendix in `implementation/report.md`, the 2026-10-05/06 plan notes, `review-B.md` (read only now; the initial review has ended), `brief-5.md` evidence and the repair diff.

### Verdict: `nits`

Every Fix from both initial reviews is repaired and verified. The repair introduced no defect. N1 and N2 below carry forward and do not block.

### Rebase is pure

- `git range-diff 2689aaa..f2b79e2 e6bc044..db2cba1`: commits 1, 2 and 4 are identical. Commits 3 and 5 differ only in context lines from upstream: main's expanded `test:forms` table row in `README.md`, and a neighbouring line in `learnings/LESSONS.md`.
- The leaf's context-free patch is byte-identical before and after the rebase. Command: `diff <(git diff -U0 2689aaa f2b79e2 | grep -v '^@@\|^index') <(git diff -U0 e6bc044 db2cba1 | …)`, exit 0.
- `git ls-remote origin refs/heads/main` returns `e6bc044`, the branch's merge base, so the branch now merges into main as a fast-forward. The README conflict from F1 is gone.

### Earlier findings

- **A-F1: fixed.**
  - `README.md:14` and `:238`, `plugin/pirax-form-test/README.md:109`, and `test/forms/README.md:41,44` now say the same thing: 0.3.0 and newer emit the awaiting message; 0.2.4 and older keep the generic message, which the checker reports as `rejected`. The checker warns with exit 0, and the form is `failed` (exit 1) after strictly more than 72 hours.
  - All of this matches main's checker: `README.md:70,232`, the per-site clock at `:247-253`, and `src/forms/awaiting-audit.ts:5`.
  - Both anchors (`#awaiting-audit-refusals` and `../../README.md#awaiting-audit-refusals`) resolve, and the cited native proof `test/plugin/compatibility.test.ts` exists.
  - The command table keeps both edits. `test/forms/README.md:46` now matches the root guide's 55-minute budget and its network/`gh` note.
  - `git grep` over tracked docs finds no remaining "0.2.4 does not emit", "in-tree helper" or "not implemented" claim.
- **A-F2 / B-F1: fixed.**
  - `test/plugin/artifacts.ts:49` passes `env: withoutSigningKey()`. `harness.test.ts:114,170` and `stack-harness.test.ts:150` add `.env(withoutSigningKey())`.
  - Every `zip`/`unzip` call under `test/plugin` and `scripts` now strips the seed, so `test/plugin/README.md:42` is accurate.
  - Re-running my original repro wrappers at `4e929fc`, with a synthetic seed and no env file:
    - all seven archive children reported `seed absent`: `findSecret` ×2, `sanitizeZip` unzip and zip, the scan-archive zip, and the two direct-call shapes;
    - the positive control without `.env()` reported `seed present`;
    - parent-side scanning still works: hits before 1, scrubbed 1, after 0.
  - The new regression `test/plugin/artifacts.test.ts` passes (1/0). In a scratch `git archive` copy with `env` removed from `run()`, it fails (0/1), and all four children record `true`. The test catches the regression.
- **B-F2: fixed.** `updates.test.ts:172-173` checks presence through `sh -c 'echo "${PIRAX_HELPER_SIGNING_KEY+present}"'`. I ran those exact two lines with a regressed `withoutSigningKey` (it strips nothing) and a synthetic `FORM_TEST_TOKEN` canary in a fresh `--no-env-file` process. The test exits 1 with `Received: "present"`, and the canary does not appear in the output.
- **B-F3: fixed.** `test/plugin/README.md:187` matches the code:
  - `source-privacy` uses the generated seed as the version in both header and constant (`release.test.ts:339`);
  - `seed-in-source` appends it to the helper README (`:376`);
  - both are committed to the disposable checkouts (`:53-66`), and `afterAll` deletes them (`:36`);
  - CLI output that contains a generated value is withheld (`:96-108`);
  - `stageHelper` writes only version, root and public key (`update-fixture.ts:125-140`), so "most stay in memory" holds.

### Carried-forward nits

- **N1: still an operator decision.** The real seed remains in the registered `.env`. The leaf now strips it from its own archive, Playground and Chromium children. Unowned `--env-file=.env` commands (checker, forms, R2, visual) still pass it on. Either keep the local copy and accept that exposure, or remove it. The repair changed no env file, key or secret.
- **N2: unchanged and disclosed.** The brief's "bare `bun test` (credential-free)" wording does not match discovery. No action for this leaf.

### Re-check evidence

| Check | Result |
|---|---|
| `git range-diff` and the context-free patch comparison (above) | pure rebase; patch identical (exit 0) |
| `git diff --check db2cba1 4e929fc`; AREA files in repair diff | clean; none |
| `bun --no-env-file run typecheck` at `4e929fc` | exit 0 |
| `bun --no-env-file test test/plugin/artifacts.test.ts` at `4e929fc` | 1 pass, 0 fail |
| Same test, scratch copy with `run()` env removed | 0 pass, 1 fail (`unzip true` ×3, `zip true`) |
| Synthetic-seed PATH-wrapper probe, shared runner plus direct-call shapes | 7/7 children `seed absent`; control `seed present`; counts 1/1/0 |
| Regressed-strip probe of `updates.test.ts:172-173` | exit 1; received `present`; synthetic canary printed: false |
| `git diff --stat 938bf9c 4e929fc` | `test/forms/README.md` only (1 line), as `repair-1-final-diff.json` states |
| B's configured gate at `938bf9c` (`repair-1-final.{log,json}`) | accepted, not rerun: exit 0, 286 pass, 0 fail, 28 files. It includes the artifacts, harness, stack-harness and updates suites, with no fail/skip/todo markers. The tested code equals the head except for one documentation sentence. |

Docs: documented behavior changed only as the repair intended. I checked the root, plugin, forms and test-plugin guides against main's checker and the test code. All named paths and anchors exist, and there are no wrong claims.

Lessons: none added. The repair confirmed existing evidence and produced no new reusable mechanism. B's dotenv-restore observation is already recorded in the plan note of 2026-10-06 and in `repair-1-env-loading.json`.

## Merge (slot A): 2026-10-06

- Rebase target: `origin/main` = `e6bc04490e4a12c20db76fbc704b06e207627498`. It is unchanged since the re-check and again after the checks, confirmed with `git fetch origin`. `git rebase origin/main` reported that the branch is up to date.
- Head pushed: `4e929fca0a8c793f2189454091fb5c0fcf74a1da`, the head approved at re-check, with no conflict and no new commit.
- Refreshed `AKROGON_BASE` (`akrogon config`): `e6bc04490e4a12c20db76fbc704b06e207627498`.
- Outstanding changes: none (worktree clean).

### Checks (worktree, 2026-10-05T23:59:34Z to 2026-10-06T00:44:17Z, log `merge-A-checks.log`)

Bun loaded the worktree `.env` automatically. `PIRAX_HELPER_SIGNING_KEY` was set to an explicit empty value: the tests never need it, and an empty value stops Bun from reloading it (lesson below).

| Command | Result |
|---|---|
| `bun run build:plugin` (documented first step for the full suite) | exit 0 |
| `bun run typecheck` | exit 0 |
| `bun test` and `test_changed`, run once as `: "${AKROGON_BASE:?AKROGON_BASE is required}" && bun test` | exit 0: 286 pass, 0 fail, 4328 `expect()` calls, 28 files, 2681.91 s. No `(fail)` lines or unhandled errors. |
| Advisory | none configured |
| Log privacy: names-only scan, run as `env -i … bun --env-file=<registered .env> log-scan.ts` over the log and the runner output | all 19 loaded names clean, `PIRAX_HELPER_SIGNING_KEY` included |

The configured `test` and `test_changed` commands resolve to the same `bun test` once the `AKROGON_BASE` guard passes, so one guarded run covers both.

### Nits and lessons

- N1 is reusable. Its mechanism is now one active line in the registered checkout's `learnings/LESSONS.md`, with case, evidence and learning in `learnings/history/2026-10-06-helper-self-update-shared-env-merge-a.md`, left for the operator to commit. The mechanism: a secret in the shared `.env` reaches every Bun process in the repository and its worktrees, and omitting it from a Bun child's `env` does not keep it out.
- A names-only probe during the merge confirmed that omission restores the variable (`present`), while an explicit empty value or `--no-env-file` keeps it out (`absent`).
- The operator decision on the local key copy stays open.
- N2: no lesson. The README command table already names the credential-free command (`bun --no-env-file test tests`).

### Push

- `git push origin HEAD:main`: `e6bc044..4e929fc  HEAD -> main`, a fast-forward (exit 0).
- Checked afterwards with `git fetch origin`. `git ls-remote origin refs/heads/main` returns `4e929fca0a8c793f2189454091fb5c0fcf74a1da`, and `git merge-base --is-ancestor 4e929fc origin/main` succeeds.
- No GitHub workflow exists, so the push triggers nothing. No tag, release or secret was written.
