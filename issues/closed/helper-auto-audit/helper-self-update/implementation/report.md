# Implementation — helper-self-update

Slot B · 2026-10-05 · ready for `check.review`

- Base: `2689aaa3bd69a9a46cc77788fdc5219354cc923a`
- Committed head: `f2b79e29775869e0f353824bb4aafe61280833b0`
- Worktree: `/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/worktrees/helper-self-update`
- All four worker worktrees were removed before B's final checks. The unrelated `checker-awaiting-audit` worktree was not changed.
- No remote ref/tag, release or secret was written. No scheduled workflow, checker outcome/escalation logic or client deployment was added.

## Changed files and reasons

| Files | Change |
|---|---|
| `plugin/pirax-form-test/pirax-form-test.php`, `includes/updates.php` | Helper 0.3.0, repository Update URI, embedded real public key, signed native update offer/details, helper-only automatic-update selection, install-time revalidation and downloaded ZIP hash enforcement. |
| `includes/compatibility.php`, `marker.php`, `gravity-forms.php`, `fluent-forms.php` | Structured version-only diagnosis using reflected callback declaring files; precise awaiting-audit rejection; independent blockers remain generic. Existing rejection, marker/config precedence, last-block privacy and early GF no-unaudited-form-read boundary remain intact. |
| `scripts/build-plugin.ts` | Import-safe shared allowlisted builder, updater inclusion, key-format and parent-visible secret checks, signing-seed-free packaging children. |
| `scripts/release-plugin.ts` | Source-derived version/audit matrix, signed dry-run assets, fail-closed key/tag/remote preflight, atomic remote ref claim followed by `gh release create --verify-tag --latest`, and uncertainty-aware recovery errors without rollback. |
| `test/plugin/{update-fixture.ts,updates.test.ts,harness.ts,core.test.ts}` | Real loopback release server, generated test keys only in disposable builds, real WordPress listing/install and negative matrix, production ZIP contract and seed-safe Playground child environment. |
| `test/plugin/{compatibility.test.ts,safety.test.ts,adapters.test.ts}` | Exact new/generic messages, compound blockers and ownership boundaries, unchanged effects and GF early-route safety. |
| `test/plugin/release.test.ts` | Independent signature/hash checks, missing/malformed/mismatched key and tag refusals, source-privacy regression, real authenticated read-only GitHub calls, and strictly intercepted publication mutations. |
| `README.md`, `plugin/pirax-form-test/README.md`, `test/plugin/README.md` | Channel, limits, bootstrap upload, key recovery, release/test commands, messages and honest publication recovery. |
| `learnings/LESSONS.md`, `learnings/history/2026-10-05-helper-self-update-publication.md` | Reusable preflight/ownership and non-transactional remote-failure case, evidence and learning. |

`test/plugin/playground.ts` and `artifacts.ts` needed no code changes; existing startup and `findSecret` helpers were reused. There is no configured grounding index/AREA or AGENTS file to update.

## Landed units and B repairs

| Unit | Worker → lane commit | Evidence |
|---|---|---|
| 1: updater/build/native proof | `ea92a0e` → `5c2c3d0` | `worker-1.md`, `evidence-u1/`; updater 7 passed, core 10 passed. |
| 2: compatibility/messages | `6d6ce16` → `de69a62` | `worker-2.md`, `evidence-u2/`; includes the red/green compound GF mismatch plus wrapped/moved audited CleanTalk regression. |
| 3: release/docs | `1729885` → `a78d04c` | `worker-3.md`, `evidence-u3/`; release 10 passed, configured changed run 267 passed. |
| 4: source privacy/atomic publication | `078b228` → `7475dfc` | `worker-4.md`, `evidence-u4/`; release red 10 pass/4 fail, green 14 pass/0 fail, changed run 271 pass/0 fail. |
| B's small repairs and documentation | `f2b79e2` | Recovery errors cannot assume a failed remote command left no release; matching assertions/docs corrected. Package identity narrowed from the entire releases root to the helper asset basename, preserving other ZIP assets in that repository. |

For the package-scope bug, the existing native unrelated-download assertion was changed to another ZIP under the same release root **before** the PHP change. `package-scope-red.log` shows the unexpected helper `WP_Error` instead of `/tmp/other.zip` (1 fail). `package-scope-green.log` then shows all 7 updater tests passing. Signature, URL, context and hash refusals were not weakened. `gh-release-create-help.txt` independently documents the draft/upload/publish calls underlying the recovery wording correction.

## Final checks — pasted results

The final code was frozen before these broad checks and then committed without further code changes. The JSON markers identify pre-commit HEAD `7475dfc`; the tested remaining diff is commit `f2b79e2`.

B loaded the registered repository's environment through Bun, omitted `PIRAX_HELPER_SIGNING_KEY` from test children, and supplied:

```text
AKROGON_BASE=2689aaa3bd69a9a46cc77788fdc5219354cc923a
bun run typecheck && : "${AKROGON_BASE:?AKROGON_BASE is required}" && bun test

271 pass
0 fail
3586 expect() calls
Ran 271 tests across 24 files. [2671.07s]
```

Typecheck and the resolved full/changed checks exited **0**. Evidence: `final-checks.log`, `final-checks.json`; 19:58:39–20:43:10 UTC.

The standalone native plugin gate used the same loaded environment (seed omitted), running `bun --no-env-file test test/plugin`:

```text
92 pass
0 fail
1583 expect() calls
Ran 92 tests across 9 files. [1979.05s]
```

Evidence: `final-plugin.log`, `final-plugin.json`; 20:43:10–21:16:09 UTC. This is the registered-env equivalent of the brief's `bun --env-file=.env test test/plugin`, not a prerequisite skip.

Other checks:

| Command/check | Result | Evidence |
|---|---|---|
| `bun --no-env-file test tests` | 114 pass, 0 fail; 985 expects | `final-unit.log` |
| `bun --no-env-file test test/plugin/release.test.ts` | 14 pass, 0 fail; 200 expects | `final-release.log`; also rerun inside final broad/plugin gates |
| `unshare -rn bun --no-env-file test test/plugin/release.test.ts -t '^offline:'` | 8 pass, 6 explicitly filtered out, 0 fail; 139 expects; isolated network namespace | `final-offline-release.log` |
| Native updater after package-scope repair | 7 pass, 0 fail; 153 expects | `package-scope-green.log` |
| `bun run build:plugin` | 11 allowlisted files; successful build before broad tests | Build output and core tests; final ZIP included in privacy scan |
| `git diff --check`, staged diff check | Clean | B command output |

No full-suite tests were skipped or weakened. Bare **credential-free** `bun test` remains a pre-existing brief/live-discovery mismatch: it discovers credentialed native/forms/R2 suites. The plan records this explicitly; the credential-free subset and full credentialed gates both passed. Test discovery was not changed.

Earlier worker broad runs had Chromium-closed failures outside their owned changes, and B's first lane attempt lacked the prebuilt ZIP. Those are not represented as green evidence. Building first and the subsequent lane runs superseded them: `lane-after-u2` exited 0 (257 tests), `lane-after-u3` exited 0 (267), and `lane-before-package-scope-fix` exited 0 (271). The final checks above were rerun after the last functional repair.

## Acceptance evidence

Durable copies from the final broad run are under `implementation/evidence-final/`:

- **AC1/AC2:** `updates-2026-10-05T20-15-22-373Z/update-summary.json`, `update-requests.jsonl`, and `updates-listing-install.trace.zip` show real authenticated native WordPress listing and installation from **0.3.0 to 0.3.1**. Details and hash-failure traces are alongside them. Unsigned, corrupt/wrong-key/stale/malformed feeds, unsafe package URLs, changed install-time identity and hash/download failures either offer nothing or refuse installation while retaining 0.3.0. Auto-update selection and unrelated-plugin preservation pass, including the same-repository different-asset regression.
- **AC3:** `compatibility-2026-10-05T20-24-23-399Z/compatibility-notes.jsonl`, entries/mail/feed/HTTP ledgers and admin/visitor traces show Pro 6.2.16 receiving `Pirax test blocked: awaiting audit of Fluent Forms Pro 6.2.16`, while audited Inventory and independent causes remain `Pirax test blocked: integrations could not be suppressed`. Both reject without entries/mail/feed effects. Final plugin regressions include ordinary submissions, exact pins, compound blockers and GF's early no-read boundary.
- **AC4:** `release-2026-10-05T20-43-03-227Z/release-summary.json`, dry-run manifest/signature and refusal logs show independent signature/hash verification, three assets, no GitHub call in dry-run, and publication refusal/order/error behavior. Real read-only authentication is retained; POST/release mutations are intercepted, never sent.
- **AC5:** `key-proof.json` records the existing real public key and fingerprint, successful pair sign/verify, embedded-key correspondence and GitHub secret-name confirmation. At committed head `f2b79e2`, `findSecret` scanned **554 tracked files**, `dist/` including ZIP contents, all worktree artifacts and the authoritative leaf: **zero hits** across six signing-key representations and ten present credential values. Environment files were excluded, never opened or edited.
- **AC6:** Final checks above and all three updated human guides. The implementation checklist is complete.

## Limitations and review notes

1. **No real publication was attempted.** Tag/ref creation, release upload and remote failure behavior are verified at the strict command boundary, not by writing GitHub state. The scheduled job and first actual release belong to `reaudit-job`.
2. **Provisioning history:** the October 2 attempt stopped at the absent-key/skill-versus-job-only-storage conflict. On the resumed October 5 dispatch, the key and GitHub secret name already existed externally. This pass used that pair, did not generate/rotate/store a production private key, and did not modify an env file. The externally supplied local copy versus locked job-only wording remains an explicit policy mismatch for review, not an undocumented design change. GitHub's inaccessible secret value cannot be read back; name presence is not a claim of remote-value equality.
3. **Privacy execution note:** an earlier B `findSecret` invocation used the existing archive helper without first clearing the parent's signing-key environment, so its `unzip` child inherited that variable. The final scan captured comparison values in memory and removed credentials before any child process. No production private value was printed, written to source/artifacts, or found in retained output. This note does not claim the earlier child-environment handling met the intended isolation rule.
4. Shipping 0.2.4 and older require one manual bootstrap upload. Subsequent automatic updates still require the helper to be active, working WP-Cron/network/filesystem access and globally enabled updates. Administrator file replacement/deactivation and arbitrary equal-privilege PHP remain outside this boundary.
5. Signatures do not guarantee availability/freshness or protect against signing-key compromise. Rotation/loss requires a new pair and manual bootstrap; no transparent rotation was added. Remote ref creation and release publication are not transactional; failed/lost responses require inspecting state before recovery.
6. Checker warning/three-day escalation and scheduled audit/publishing are deliberately excluded. Version-only wording is still a rejection, not evidence that the unknown version is safe.

There are no outstanding functional test failures. Unverified items are the intentionally excluded real remote publication/deployment, opaque GitHub-secret value equality, and the documented storage-policy mismatch; they are not presented as verified outcomes.

## Repair round 1 — started 2026-10-05

The section above records the initial implementation, not a claim that the subsequent review findings were closed. Both reviews requested repair. Before-repair reviewed head: `f2b79e29775869e0f353824bb4aafe61280833b0`.

Rebased onto `origin/main` at `e6bc04490e4a12c20db76fbc704b06e207627498` (merged checker work). **Pure-rebase head before repair edits: `db2cba17bed1ecccab0f433a055ff8d4b7d5a405`.** The only conflict was the root README command table; both the helper's 55-minute/gh row and main's expanded test:forms row were preserved. A's repair re-check should use this pure-rebase head so upstream checker changes are not mistaken for repair changes.

Unit 5 is delegated from that head under `implementation/brief-5.md`, covering A-F1 (all three stale cross-leaf guides), A-F2/B-F1 (shared and direct archive environments), B-F2 (safe failing environment assertion), and B-F3 (temporary generated-seed fixture documentation).

### Repair completed — 2026-10-06

**After-repair committed head: `4e929fca0a8c793f2189454091fb5c0fcf74a1da`.** Worker `086e95aa944052f2dfcbd994d14b6e751050a721` was cherry-picked as `938bf9c029708984f4e14002d576923f7649fed4`. B's final full checks ran on that code. The last commit changes only one sentence of `test/forms/README.md`, synchronizing its stale 20–30-minute full-suite estimate and prerequisites with the root guide (about 55 minutes, network/authenticated gh). No runtime, test, fixture or packaged file changed afterward; `repair-1-final-diff.json` verifies that exact difference. No redundant full rerun was made for this documentation-only follow-up.

Repair re-check range: **`db2cba17bed1ecccab0f433a055ff8d4b7d5a405..4e929fca0a8c793f2189454091fb5c0fcf74a1da`**. This excludes the upstream checker work and separates the requested rebase from the repair.

### Changed files and findings

- **A-F2 / B-F1:** `test/plugin/artifacts.ts` now uses `env: withoutSigningKey()` at its one shared archive runner. Both `findSecret` and `sanitizeZip` retain parent-side comparison material without passing the signing variable to unzip/zip. The three direct calls in `test/plugin/harness.test.ts` and `test/plugin/stack-harness.test.ts` use the same existing helper. No global deletion substitutes for that fix.
- **Regression:** new `test/plugin/artifacts.test.ts` runs real scan/sanitize/scan operations in a fresh synthetic-only child, with presence-observing wrappers delegating to real zip/unzip. It verifies counts 1/1/0, unchanged parent visibility and four seed-free children. Baseline red: **0 pass, 1 fail**, all four children saw the canary. Fixed green: **1 pass, 0 fail**. Evidence: `evidence-u5/{red,green}-artifacts.log`.
- **B-F2:** `test/plugin/updates.test.ts` emits/asserts a presence marker only, never a complete environment. The retained mutation probe takes the new line verbatim from this file: both deliberately failing shapes exit 1, but only the old shape prints an environment-only FORM_TEST_TOKEN canary. B repeated it successfully in `repair-1-targeted.log`. `repair-1-direct-env.json` additionally confirms that the committed shell expression strips a nonempty synthetic parent variable, not just an empty value. An earlier throwaway probe had a template-construction error; it was discarded, not accepted as product evidence.
- **A-F1:** `README.md`, `plugin/pirax-form-test/README.md` and `test/forms/README.md` now agree with the merged checker: helper 0.3.0+ emits version-only awaiting refusals; older deployed helpers keep generic refusals reported as rejected. The checker warns with exit 0 and escalates strictly beyond 72 hours. Synthetic checker fixtures remain distinguished from native helper emission proof. Both command-table edits survive the rebase. The final one-sentence guide follow-up fixes the full-suite timing/prerequisites too.
- **B-F3:** `test/plugin/README.md` describes intentional generated-seed source/git fixtures, disposable-checkout cleanup and non-retention in evidence, while retaining the production-seed prohibition. It also documents the new archive regression. No useful privacy regression was removed.

The repair changes tests/tooling and documentation only, not runtime PHP, checker behavior, release publishing behavior or any safety gate. Unit 5's four-field return is `implementation/worker-5.md`; its scoped worktree was removed before B's final blocking run. No worker worktree remains.

### Checks and durable evidence

| Check | Result / artifact |
|---|---|
| Worker resolved changed command, supplied `AKROGON_BASE=2689aaa3bd69a9a46cc77788fdc5219354cc923a` | **286 pass, 0 fail**, 4328 expects, 28 files, 2714.75 s; `evidence-u5/changed.{log,exit}` |
| B typecheck + `: "${AKROGON_BASE:?AKROGON_BASE is required}" && bun test` | **exit 0; 286 pass, 0 fail**, 4328 expects, 28 files, 2691.86 s; `repair-1-final.{log,json}`. This is both the configured full and changed-test gate. |
| B targeted archive test + safe failure probe after pick | **1 pass, 0 fail**; old matcher prints the synthetic canary, new matcher does not; `repair-1-targeted.log` |
| `bun --no-env-file test tests test/plugin/artifacts.test.ts` | **124 pass, 0 fail**, 1072 expects, 11 files; `repair-1-offline.log` |
| `bun --no-env-file test test/plugin/release.test.ts -t '^offline:'` | **8 pass, 0 fail**, 139 expects, six explicitly filtered cases; `repair-1-offline.log`. All 14 release cases ran in both broad gates. |
| Shipping build after checks | **11 allowlisted files**, SHA-256 `27d090196c8370411976266f860f1ef81384dbf7c5daf3ae0c68901791d509c9`; built with the registered environment loaded explicitly by Bun |
| `git diff --check` and repair-range whitespace check | pass; leaf worktree clean |

B's fresh native artifacts are retained under `implementation/evidence-repair-1/`:
- `updates-2026-10-05T23-31-03-213Z/`: native update summary/request ledger and UI/install/refusal traces.
- `compatibility-2026-10-05T23-10-50-106Z/`: native version-only/generic/compound-cause evidence and effect ledgers.
- `release-2026-10-05T23-28-47-311Z/`: signed generated-key dry-run assets, command-boundary/refusal evidence and release summary.

The earlier standalone plugin result (92/0) remains historical; this repair's full run executes all current plugin suites. Authentication, update HTTP, native installation and read-only GitHub lookups remain real. Remote publication mutations remain intercepted, never actually executed.

### Environment correction and privacy

B loaded prerequisites via Bun's explicit registered `--env-file` loader. `repair-1-env-loading.json` establishes an important correction to the initial report: omitting a variable from a Bun child's supplied environment does **not** establish its absence after bootstrap, because existing worktree dotenv symlinks can restore it. The old wrapper metadata proves input omission only; its stronger runtime-isolation inference is withdrawn. This does not invalidate the recorded passing behavioral/content checks.

For this repair the literal configured `bun test` command receives an **empty** signing variable, proven to prevent automatic restoration. Owned non-signing children then remove the variable entirely. Canary probes use fresh `--no-env-file` children with synthetic-only inputs. The full run therefore does not exercise the core scanner with the real seed in its test environment; the separate real-key scan below supplies that comparison without distributing the seed to test children.

`repair-1-private-scan.ts` / `.json` verify the unchanged public key against the existing local pair and a non-manifest sign/verify challenge. Public fingerprint remains `246341d08d0b2704733dcd4bda087bb72881af1f25b803d0878dd5366b164b5d`. The parent retains comparison material while clearing all but PATH/HOME/temp/locale variables before any child. Six private representations and ten credential values produced **zero hits** across 559 tracked non-env files, the shipping ZIP, all worktree artifacts/runs and the authoritative leaf. ZIP entries were scanned. Twelve known 11-byte `local trace` test placeholders were verified byte-for-byte and scanned as raw text; no arbitrary corrupt ZIP was silently skipped. Environment files were excluded, never opened or modified with file tools.

### Limitations and handoff

- Review A's N1 remains an operator policy decision: the externally supplied local key copy conflicts with locked job-only storage; unowned forms/R2/visual/checker invocations are not globally hardened by this leaf. Nothing here edits that copy, rotates a key or reads back the GitHub secret value. Earlier name-only GitHub evidence remains applicable, not proof of opaque value equality.
- Review A's N2 remains disclosed: bare credential-free `bun test` discovers credentialed suites. Explicit offline and fully provisioned checks are kept distinct; no prerequisite skip/discovery workaround was added.
- The three direct archive sites are inspected and exercised natively; the automated presence regression targets the shared runner, with B's separate shell-boundary proof. The unsafe-matcher mutation demonstration is retained evidence, not a new committed test framework.
- Actual publication/deployment and GitHub-secret value equality remain intentionally unverified; no release, remote tag or secret was mutated. No new unresolved repair criterion remains.
- The registered-checkout archive-environment lesson was dated as applied in its history file and its active index line removed. That review-created history file remains for the operator to commit, separate from this leaf's code.

Ready for **A-only repair re-check** at `check.review`. The command owns the phase transition and counters.
