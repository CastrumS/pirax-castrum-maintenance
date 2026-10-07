# Worker 5 — review repair, round 1

Worktree: `issues/worktrees/helper-self-update-u5`. Parent is the pure-rebase head `db2cba17bed1ecccab0f433a055ff8d4b7d5a405`. The scoped repair commit is **`086e95a`** ("fix: keep the signing seed from archive children and correct awaiting-audit docs"), 9 files, and the worktree is clean. There was no remote mutation, no lifecycle or phase action, and no `.env` file was opened, printed or edited.

Findings closed:
- A-F1: the awaiting-audit docs.
- A-F2 / B-F1: archive children inherited the seed.
- B-F2: the env dump in `updates.test.ts`.
- B-F3: the "memory-only" release test keys.

## Evidence (`implementation/evidence-u5/`)

| File | What it shows |
|---|---|
| `red-artifacts.log` | New `artifacts.test.ts` on unchanged `artifacts.ts` at `db2cba1`: **0 pass, 1 fail, EXIT=1**. All four archive children (`unzip`, `unzip`, `zip`, `unzip`) logged `true` for the synthetic seed. The scan and scrub counts were already correct, which shows real zip/unzip ran and that zero content hits alone prove nothing. |
| `green-artifacts.log` | The same test after the fix: **1 pass, 0 fail, EXIT=0**. Also `bun run typecheck` EXIT=0. |
| `ac2-matcher-probe.ts`, `.log` | AC2 demonstration, synthetic only (details below). |
| `build-plugin.log` | `bun run build:plugin` (11 files, `build-exit=0`), run before the changed command. |
| `changed-runner.sh`, `changed.log`, `changed.exit` | The configured changed command, run under `setsid` (details below). |
| `changed-release-2026-10-05T22-35-09-616Z/` | The release suite's retained artifacts from inside that run. |
| `secret-scan.ts`, `secret-scan.json` | The privacy scan (details below). |

### AC2 probe

- Each shape runs in a fresh `bun --no-env-file test` child. The child's whole environment is `PATH`, `HOME` and a generated `FORM_TEST_TOKEN` canary.
- A regressed strip is simulated by replacing `withoutSigningKey` with identity.
- The new shape is the line read verbatim from the committed `updates.test.ts`.

| Shape | Exit | Failed | Canary printed | Matcher received |
|---|---|---|---|---|
| Old (env dump, baseline) | 1 | yes | **true** | environment dump |
| New (presence only) | 1 | yes | **false** | `"present"` only |

Bun's code frame shows the seed literal from the test source in both shapes. That literal is source, not environment output.

### Changed command

The runner command:

```sh
PIRAX_HELPER_SIGNING_KEY= AKROGON_BASE=2689aaa3bd69a9a46cc77788fdc5219354cc923a sh -c ': "${AKROGON_BASE:?AKROGON_BASE is required}" && bun test'
```

- **Why the seed is set empty.** The worktree `.env` is a symlink to the registered `.env`, and Bun auto-loads it. A synthetic probe showed that an *unset* variable is restored from that file, while an *empty* one is kept. An empty seed is treated as absent everywhere: `build-plugin` filters truthy names, `findSecret` drops empty needles, and `core.test.ts` uses `?? ""`. Bun loads every other prerequisite from the file.
- **Marker:** `exit=0 commit=086e95a finished=2026-10-06T00:42:41+02:00`.
- **Result:** **286 pass, 0 fail, 4328 expects, 28 files, 2714.75 s**.
- Discovery is 28 `*.test.ts` files outside `issues/`, including `test/plugin/artifacts.test.ts`.

### Privacy scan

The scan ran with `bun --env-file=<registered>/.env`. The parent loaded the values only to scan for them, and it prints names, paths and counts only.

- **Scope:** all of `evidence-u5/` plus every `artifacts/plugin/*` and `runs/*` directory this run created (19 directories).
- **Values checked:** FORM_TEST_TOKEN, GRAVITY_FORMS_ZIP, FLUENT_FORMS_PRO_ZIP, PIRAX_HELPER_SIGNING_KEY (base64, hex and base64url), IMAP_USER, IMAP_PASSWORD, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY and GPLVAULT_LICENSE_KEY. All were present.
- **Result:** `hits: []`. `redact()` made 0 replacements in `changed.log`.
- **Fallback:** one directory holds two 11-byte `home.trace.zip` placeholders, which `test/forms/report.test.ts:209,262` writes with the text "local trace" on purpose. That directory was scanned as raw bytes, plus a full `findSecret` of each valid ZIP in it. Both stubs are listed in `fallback`.

## Report

Changed files and reasons:
- `test/plugin/artifacts.ts` (AC1): the shared `run()` spawns with `env: withoutSigningKey()`, so the unzip/zip children of both `findSecret` and `sanitizeZip` no longer get the seed. The parent keeps it, and `process.env` is not mutated.
- `test/plugin/harness.test.ts` (AC1): the probe `zip` and the trace `unzip -Z1` calls (review lines 113/169) now use `.env(withoutSigningKey())`.
- `test/plugin/stack-harness.test.ts` (AC1): the trace `unzip -Z1` call (review line 149) now uses `.env(withoutSigningKey())`.
- `test/plugin/artifacts.test.ts` (new, AC1): a credential-free, fail-first boundary regression.
  - It starts a fresh Bun child with a synthetic seed. Its `PATH` begins with zip/unzip wrappers that log only a presence boolean, then `exec` the real tools.
  - The child calls the real `findSecret`, `sanitizeZip` and `findSecret` again.
  - It asserts counts `{before: 1, scrubbed: 1, after: 0, parentKept: true}` and that all four children logged `false`. Its assertions see only counts and booleans.
- `test/plugin/updates.test.ts` (AC2): the `env` dump and string matcher are replaced with `sh -c 'echo "${PIRAX_HELPER_SIGNING_KEY+present}"'`, asserted to be `""`. The absence check is the same, but a failure can print only `present`.
- `README.md` (AC3), two places: the introduction and "Awaiting-audit refusals" now say helper 0.3.0 and newer emit the awaiting refusal. Sites on 0.2.4 or older keep the generic refusal, which is reported `rejected`. The checker warns with exit 0 and reports `failed` (exit 1) after more than 72 hours (`elapsed > AWAITING_AUDIT_LIMIT_MS`). Both command-table rows from the rebase are kept.
- `plugin/pirax-form-test/README.md` (AC3): the "checker does not read this message yet / not implemented" sentence is replaced with the checker's actual handling and a link to the root section.
- `test/forms/README.md` (AC3): "in-tree helper 0.2.4" now reads "helper 0.2.4 and older". The fixtures are described as synthetic checker evidence, and `test/plugin/compatibility.test.ts` is named as native emission evidence.
- `test/plugin/README.md`:
  - AC4: "Private test keys stay in memory" is replaced. The source-privacy and seed-in-source cases intentionally write a generated seed into their disposable, committed checkout, which `afterAll` deletes. No production seed is ever written, and private values are never retained.
  - New suite-table row for `artifacts.test.ts`.

Tests run:
- Red: `env -u PIRAX_HELPER_SIGNING_KEY bun --no-env-file test test/plugin/artifacts.test.ts` at `db2cba1` plus the new test gave **1 fail, EXIT=1**, with all four children seeing the seed.
- Green: the same command after the fix gave **1 pass, EXIT=0**.
- `bun run typecheck`: EXIT=0. `git diff --check`: clean.
- AC2 probe: the old shape printed the canary; the new shape failed without printing it (exit 1 both).
- `bun run build:plugin`: build-exit=0.
- Configured changed command, run detached under `setsid` with a completion marker: **exit=0, 286 pass, 0 fail**, 28 files, 2714.75 s, commit `086e95a`. This includes the native `updates`, `harness`, `stack-harness`, `core` and `compatibility` suites with real archives.
- Privacy scan: 19 directories, `hits: []`, 0 log redactions.

Known limitations:
- **Direct archive calls have no presence regression.** The three direct calls in `harness.test.ts` and `stack-harness.test.ts` are covered by inspection and by the green native run. The presence regression covers the shared `run()` boundary only, because those calls need a credentialed Playground.
- **The AC2 failure demonstration is a retained probe, not a committed test.** Its new shape is read verbatim from `updates.test.ts`. That suite needs the native harness, so the failing path was shown in a synthetic fresh child instead.
- **The broad run had no seed.** It ran with the seed empty, as the brief requires, so the native suites' seed-present branch (for example `core.test.ts` scanning `dist/` for the real seed) did not run with the real value. The boundary itself is proven with a synthetic seed.
- **Unchanged: review A's N1.** Suites this leaf does not own (forms, R2, visual and checker children) still inherit the seed under `bun --env-file=.env …`, or under Bun's auto-load of a worktree `.env` symlink.
- **The scan fallback covers two placeholder stubs.** The two 11-byte placeholder `.zip` files from `report.test.ts` cannot be unzipped. They and their directory were scanned as raw bytes instead.

Unverified criteria: none. AC1–AC5 are each backed by the red/green, probe, changed-run and scan evidence above. B owns the final blocking checks separately.
