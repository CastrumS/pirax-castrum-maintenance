# Repair report — reaudit-job

## Round 1 — 2026-10-07: complete

All four Fix findings repaired and verified; ready for A's repair recheck.

- Before/reviewed head: `6e10d6c95ca27d2765fb2a8b41ff5c36a3263ed4`.
- After/committed lane head: `87143c78cce61bbdc4cd99b578d36aea89dc6a50`.
- Worker commit: `1f1b6e63f678247053cd4169e4ce569582e60256`, cherry-picked without conflict. Identical tested/committed tree: `8fbe4b9c6798f0ef6af0296608f97ff21c7e9bf9`.
- Configured base remains `4e929fca0a8c793f2189454091fb5c0fcf74a1da`.
- One delegated unit because workflow/tests/docs overlap: `implementation/brief-5.md`; inspected and accepted return: `implementation/report-u5.md`.
- Worker worktree removed normally after lane verification and retained evidence scan, before B's final suite. No worker trees remain; unrelated leaves untouched. Lane clean; no additional uncommitted code or empty commit.

## Findings and changed files

Repair diff: **11 files,121 insertions/22 deletions**.

| Finding | Repair and files |
| --- | --- |
| A-F1: single-match artifact download flattened away the loader's job directory | `.github/workflows/reaudit.yml` now downloads each optional audit/publish summary by explicit current-attempt name into its own loader-compatible destination. `tests/reaudit-workflow.test.ts` extracts real ZIPs using the pinned action's flat rule into workflow-selected paths, then invokes the production loader/formatter/CLI. It preserves reason/stage/versions/cleanup/site and partial-publication commit/tag/state; absent current evidence does not inherit an earlier attempt. |
| A-F2: blanket claim that failed-job reruns cannot publish | Root `README.md`, workflow comment and a dated clarification in `learnings/history/2026-10-07-workflow-attempt-artifacts.md` distinguish a failed-publish-only rerun from rerunning a failed audit with downstream jobs and a fresh current-attempt candidate. Historical lesson case preserved; safe attempt-binding code unchanged. |
| B-F1: release privacy scan ran after upload | `scripts/release-plugin.ts` reuses `scanEvidence`/`secretValues` on exact final manifest/signature/ZIP entries before tag claim or release creation. A hit or scan error withholds assets. No rebuild follows. `tests/reaudit-publish.test.ts` proves zero intercepted mutations for an encoded synthetic seed and retains a clean publication control. `test/plugin/release.test.ts` and the publication fixture copy the added dependency-free scanner imports. Atomic claim, scoped archive children and independent post-publication verification remain intact. |
| B-F2: non-main dispatch masked overdue main | `scripts/reaudit/watchdog.ts` requests main history and rejects/ignores inappropriate branch facts. `tests/reaudit-operations.test.ts` proves overdue main remains overdue despite a recent skipped non-main dispatch, validates the requested branch, and keeps failed main runs alive. |
| Affected guides | Root `README.md`, `plugin/pirax-form-test/README.md` and `test/plugin/README.md` describe repaired release scanning, reruns, main-only liveness and regression coverage. Forms guide remains accurate and unchanged. No AREA/index grounding file is affected. |

Production PHP, pins, helper0.3.0, public key, callback inventory and encrypted updater are unchanged by repair. No new dependency or credential; optional A N1–N3 are deferred.

## Commands and evidence

All evidence paths below are relative to `implementation/`. Node24.21.0/native gh2.101.0 first on PATH, Bun1.4.2. Real prerequisites loaded only through Bun's env-file loader; no environment file opened, copied or edited.

| Check | Observed result | Evidence |
| --- | --- | --- |
| Worker fail-first tests | 65pass/5fail, exit1: summary extraction, encoded-seed mutation, main-branch liveness and associated contracts | `evidence-u5/red.{log,exit}` |
| Worker focused green | 150pass/0fail,1051expects,6files,20.78s, exit0 | `evidence-u5/green.{log,exit}` |
| Worker typecheck | exit0 | `evidence-u5/typecheck.{log,exit}` |
| Worker configured changed check | 519pass/0fail,5749expects,38files,3246.38s, exit0 at11:32:39Z | `evidence-u5/configured-check.{log,exit}` |
| Worker retention/scan | 19native/forms scopes,11loaded values,0findings, exit0 | `evidence-u5/{privacy.log,privacy.exit,retention.json,native/}` |
| B lane changed check on87143c7 | 519pass/0fail,5749expects,38files,3245.90s, exit0 at12:32:39Z | `evidence/repair-1-lane.{log,exit}` |
| B final blocking typecheck | `bun --no-env-file run typecheck`, exit0 | `evidence/repair-1-typecheck.{log,exit}` |
| B separate final full suite, worker already removed | 519pass/0fail, no skips/todos,5749expects,38files,3153.05s, exit0 at13:26:25Z | `evidence/repair-1-final.{log,exit}` |
| Original B watchdog counterexample on landed repair | `healthy:false`, `audit-overdue`, main-filtered request; exit0 | `evidence/repair-1-watchdog-probe.{log,exit}` |
| B final evidence retention/privacy | 18new native/forms scopes,3scan roots,11loaded values,0findings, exit0 | `evidence/repair-1-privacy.{log,exit}`, `evidence-repair-1-final/{retention.json,native/}` |

Configured changed command was resolved literally as:

```sh
export AKROGON_BASE=4e929fca0a8c793f2189454091fb5c0fcf74a1da
: "${AKROGON_BASE:?AKROGON_BASE is required}" && bun test
```

It currently discovers the full suite. Each broad check built the plugin first and held `native-check.lock`; source/HEAD remained immutable during it. B's final run was separate, on the committed repair after worker removal, not inferred from worker or lane success:

```text
519 pass
0 fail
5749 expect() calls
Ran 519 tests across 38 files. [3153.05s]
Result exit=0 at 2026-10-07T13:26:25Z
```

`repair-evidence.ts --before repair-1` recorded the pre-final scope names. `--retain repair-1` retained only newly produced scopes and scanned final evidence, lane evidence and worker evidence. Both retention passes rejected environment files/symlinks and omitted only2 exact11-byte `local trace` synthetic non-ZIP placeholders, not actual traces. Original successful evidence was not overwritten. The pinned action's public source/docs are retained under evidence-u5 and support the extraction rule used by the regression.

## Limitations and unverified criteria

- No real GitHub mutation, workflow dispatch, paid acquisition, mail repeat or client-site change was performed. Publication fixtures use local bare remotes and intercepted mutations; output saying `published` is not remote publication proof. Original live acquisition/deactivation and SMTP/arrival evidence remains in implementation/report.md.
- Main is pushed before the release CLI. An asset rejection may therefore leave `main-pushed`; the negative regression asserts that truthful state, not rollback. It proves no tag/release mutation for the unsafe asset.
- Known-secret scanning is not proof against every possible private value or encoding. Same-host Actions/SMTP outage, hard-kill license cleanup and accepted native audit-depth limitations are unchanged.
- Real post-merge Actions extraction/reruns, complete workflow/release-or-mail proof, no-change repeat, installed watchdog observation and elapsed schedule/heartbeat evidence remain outstanding, as planned.
- Deferred Nits: notice's full dependency install (N1), version grammar/key-list duplication (N2), heartbeat fallback publication wording (N3).
- A's separate artifact-layout lesson in the registered checkout is operator-owned/uncommitted; this pass did not modify the root checkout.

## Handoff

`akrogon phase reaudit-job check.review --slot B` returned **`moved check.review`**. Repair recheck belongs to A only. Output: `implementation/evidence/repair-1-handoff.log`. Final guards confirmed clean committed head, unchanged shipping PHP/ciphertext, no issue artifacts on the branch and no retained worker worktrees.
