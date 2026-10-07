# Implementation report: reaudit-job

Slot B · 2026-10-06–07 · phase implement

**Initial implementation outcome:** implementation complete and ready for review. Repair round1 is recorded below and in [../report.md](../report.md). All chunks are committed; B lane verification and B final full suite each passed516/0, final blocking typecheck passed, retained evidence scan found0 secrets. Every worker worktree was removed normally before the final suite. Main-only operational proof remains explicitly post-merge.

- Base: `4e929fca0a8c793f2189454091fb5c0fcf74a1da`
- Initial implementation head: `6e10d6c95ca27d2765fb2a8b41ff5c36a3263ed4` (subsequent repair head below)
- Lane: `/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/worktrees/reaudit-job`
- Authoritative artifacts: this `implementation/` directory, outside the code branch.
- Registered main advanced independently to2689aaa; merge owns the rebase. No unreviewed main push, workflow dispatch, actual tag/release or client-site change occurred.

## Delivered implementation and changed files

49 files changed from the base (5780 insertions/211 deletions), including the final documentation-only lesson commit. Detailed per-unit file/interface reports: [report-u1.md](report-u1.md), [report-u2.md](report-u2.md), [report-u3.md](report-u3.md), [report-u4.md](report-u4.md).

| Paths | Reason |
| --- | --- |
| `scripts/plugin-source.ts`, `scripts/release-plugin.ts` | One strict synchronous pin/helper authority from production PHP; release uses it. Pure paired-header/constant parsing supports independent ZIP verification. |
| `scripts/reaudit/detect.ts`, `fetch.ts`, `gplvault-playground.ts` | Five-plugin discovery, strict version comparison, official GPL Vault updater in disposable Playground, validated packages/digests, explicit activation/deactivation receipts, refusal of pre-existing active instances, bounded cleanup and drained interrupted downloads. |
| `scripts/reaudit/setup.ts`, `.github/audit/gplvault-updater.zip.gpg` | Explicit one-time coordinated encrypted-updater/secret provisioning, verified roundtrip, preserved signing secret. Ciphertext only in git. |
| `scripts/reaudit/decide.ts`, `run.ts` | Closed failed/unchanged/audited-candidate decisions; actual native gate before helper bump, manifest/package identity checks, final core/release/typecheck gate, privacy/cleanup requirements. Candidate binds exact base, run AND attempt, pins/digests, helper patch and deterministic change digest. |
| `scripts/reaudit/bump.ts`, `publish.ts` | Reconstruct only allowlisted pin/helper/generated-doc edits from trusted checked-in code. Guard base/main/tag/release state, validate created commit, ordinary fast-forward push, existing atomic tag claim, independent signature/hash/paired version/pins/tag-commit verification. No uncertain retries, rollback, overwrite or force. |
| `scripts/reaudit/privacy.ts`, `test/plugin/artifacts.ts`, `scripts/build-plugin.ts` | Scoped children, disabled implicit dotenv reload, sanitized captured output, known-secret scans/withholding. Scanner and build archive tools receive only PATH/TMPDIR/LANG/LC_ALL, never signing/vendor/mail/GitHub credentials. |
| `scripts/reaudit/notify.ts`, `heartbeat.ts`, `watchdog.ts` | Fixed-recipient safe failure mail, current-attempt-only summary selection, independently due30-day fresh-main heartbeat, separate >48h/missing/disabled workflow watchdog. Nonpersisted scoped Git auth. |
| `.github/workflows/reaudit.yml`, `reaudit-watchdog.yml`, `.github/audit/heartbeat.txt` | Main-only daily/manual workflows, fixed concurrency/no cancellation, read-only vendor job separated from write/signing, always-path notification and independent heartbeat, attempt-isolated artifacts, pinned actions/Node24/Bun1.4.2/native prerequisites. |
| `test/forms/harness.ts`, `test/plugin/{harness,version-fixtures}.ts` | Derive prerequisites from canonical pins; dynamic wrong-version fixtures; checked unique backups avoid observed Playground reused-filename restoration failure. |
| `test/plugin/{compatibility,core,harness,release,safety,stack-harness,updates,artifacts}.test.ts` | Preserve native assertions while deriving fixtures; repeated/nested original-byte restoration regression; archive child scoping checks. |
| `tests/plugin-source.test.ts`, `tests/reaudit-{detect,fetch,setup,operations,decide,bump,privacy,publish,workflow}.test.ts` | Strict parsing, protocol failures, cleanups/signals, safe diagnostics, thresholds, two successive synthetic bumps, orchestration/command boundaries, signed-package negatives, attempt-stale evidence and pre-push commit-read regressions. |
| `README.md`, `plugin/pirax-form-test/README.md`, `test/plugin/README.md`, `test/forms/README.md` | Setup/dispatch/recovery and limitations, generated current-version facts versus historical audit evidence, current pin authority and rerun behavior. |
| `learnings/LESSONS.md`, `learnings/history/2026-10-{05-helper-self-update-publication,06-playground-reused-file-names,07-workflow-attempt-artifacts}.md` | Record the observed Playground filename and attempt-stale artifact mechanisms. Date application of the existing atomic publication lesson and remove its active index line without rewriting its historical case. |

Production PHP, public key and callback inventory remain unchanged. Current pins remain **GF3.1.2 / FF6.2.14 / FFPro6.2.15 / CleanTalk6.88 / FluentSMTP2.4.1**, helper **0.3.0**. No newly observed plugin version is claimed as an accepted production audit.

## Integration lineage and repairs

- Foundationb120086→0d32481; fixture repair00c743c→f9067d1; reusable lessoncd2ecc6; verified ciphertext468fc9b.
- Acquisitionfe5d0a3→c9896f2; operationsb827770→16bffef.
- Integration unit originally2ac17e5, then repaired68b9bc7, finally **03612df→5d7abd8**. Worker4 returned a complete report and terminal configured result.
- Documentation-only **6e10d6c** records attempt-bound handoffs and the applied publication lesson, after lane verification/worker removal and before B's final suite.
- B's permitted **two-line** sibling repair **df7504e** scopes both archive calls in build-plugin.ts. `withoutSigningKey` remains available for authenticated GitHub children. Red synthetic probe: zipInherited=true/unzipInherited=true; same probe after repair: bothfalse, exit0. Evidence: `evidence/u4-build-env.log`, `u4-build-env-green.log`; runnable `probe-u4-build-env.ts` now targets the lane. The worker's green result predates this fix; B's lane/final checks cover it.

Concrete integration defects repaired, not waived: missing acquisition subdirectory (ENOENT before decrypt), credentials reaching unzip, persisted publisher/heartbeat checkout credentials, lost lifecycle/site evidence, ZIP header/constant disagreement, attempt-stale candidates/cleanup summaries, and unchecked post-commit hash. Synthetic red/green evidence is in `evidence-u4/`; B's initial boundary probe is `evidence/u4-boundaries.log`.

## Commands and results

Resolved configured changed command:

```sh
AKROGON_BASE=4e929fca0a8c793f2189454091fb5c0fcf74a1da
: "${AKROGON_BASE:?AKROGON_BASE is required}" && bun test
```

It happens to discover the full suite. Each invocation builds first, loads real prerequisites only through Bun `--env-file`, and serializes broad native execution with `native-check.lock`. Native gh2.101.0 and Node24.21.0 are first on PATH; Bun1.4.2. Every check below is separately evidenced, not inferred from a focused test.

| Check | Recorded result | Evidence |
| --- | --- | --- |
| Unit1 fixture repair configured | 297pass,0fail, exit0 | `evidence-u1-fixture-repair/`, report-u1 |
| B lane after fixture repair | 297pass,0fail, exit0 | `evidence/lane-after-u1-repair.{log,exit}` |
| Unit2 configured | 357pass,0fail, exit0 | `evidence-u2/`, report-u2 |
| B lane after unit2 | 368pass,0fail, exit0 | `evidence/lane-after-u2.{log,exit}` |
| Unit3 repaired configured | 324pass,0fail, exit0 | `evidence-u3/repair-changed-tests.log`, report-u3 |
| B lane after unit3 | 406pass,0fail, exit0 | `evidence/lane-after-u3.{log,exit}` |
| Unit4 final focused | 186pass,0fail, exit0 | `evidence-u4/attempt-green.log` |
| Unit4 typecheck | exit0 | `evidence-u4/attempt-typecheck.log` |
| Unit4 configured on03612df | **516pass,0fail, no skip/todo,5673expect calls,38files,2952.96s, exit0** | `evidence-u4/configured-check.{log,exit}`; finished20:09:32Z |
| B two-line archive scope probe | both inheritance flagsfalse, exit0 | `evidence/u4-build-env-green.log` |
| B typecheck after archive repair | exit0 | `evidence/lane-typecheck-after-u4.log` |
| B lane after unit4+archive repair | **516pass,0fail,5673expect calls,38files,3431.74s, exit0** at2026-10-07T09:13:12Z ondf7504e | `evidence/lane-after-u4.{log,exit}` |
| B final full suite, after worker removal | **516pass,0fail, no skip/todo,5673expect calls,38files,3129.16s, exit0** on6e10d6c;2026-10-07T09:14:14Z–10:06:24Z | `evidence/final-full.{log,exit}` |
| B final blocking typecheck | **exit0 on6e10d6c** | `evidence/final-typecheck.{log,exit}` |

Pasted final worker check result:

```text
516 pass
0 fail
5673 expect() calls
Ran 516 tests across 38 files. [2952.96s]
Result exit=0 at 2026-10-06T20:09:32Z
```

B's final full-suite result, after all worker trees were removed and the final documentation commit was made:

```text
516 pass
0 fail
5673 expect() calls
Ran 516 tests across 38 files. [3129.16s]
Result exit=0 at 2026-10-07T10:06:24Z
```

Native publication fixtures use local bare remotes and intercept EVERY GitHub mutation. Their real release CLI prints `published`/`tag claimed`, but those lines **are not actual publication evidence**. Read-only GitHub calls are real. GPL protocol negatives use synthetic stand-ins, not fake credentials passed off as successful real authentication.

### Historical failures and interruptions

Retained, never called green: initial foundation294/3 with lost exit; B lane295/1 (concrete original-byte restoration defect); original operations316/1 (updater maintenance failure; standalone then repaired configured checks green); wrong-gh-wrapper and host-reboot interruptions; unit4 outage log with13 failures/no terminal exit; unit4 premature print-mode return that killed its check wrapper. B stopped only the identified owned orphan. Later worker check used its own setsid/nohup session and captured its actual exit. B's2026-10-06 lane-after-u4 check was also cut off by a host restart before its terminal summary/exit; it is retained as `evidence/lane-after-u4-interrupted-2026-10-06.log/.note`, not green. The unchanged-head rerun on2026-10-07 completed516/0 with actual exit0. See reports and `evidence-u4/configured-check-*-interrupted*` / `configured-check-interrupted-worker-exit.*`.

## Real, nonpublishing operational evidence

1. **Provisioning:** all six credential names present; existing supplied passphrase reused, official updater5.3.9 encrypted, decrypt roundtrip verified. Five repository secrets set via stdin; signing secret preserved. `evidence/setup.{log,exit}`, exit0. Source operator ZIP unchanged; no environment file opened/copied/edited and no plaintext ZIP committed. Original missing-passphrase blocker was resolved by the operator before implementation resumed; it is not a current blocker.
2. **Initial real acquisition:** official updater plus wordpress.org validated all five ZIP headers/digests, activation/deactivation confirmed, counts139→139. `evidence/live-acquisition.{json,log,exit}`, exit0. Observed GF3.1.3.1, FF6.2.15, Pro6.2.15, CleanTalk6.89, FluentSMTP2.4.1.
3. **Unchanged acquisition:** supplied that observed matrix as input ONLY; no production pin edits. No form-package downloads, confirmed cleanup/counts139→139. `evidence/live-acquisition-unchanged.{json,log,exit}`, exit0. This is not a post-release workflow repeat.
4. **Strict-boundary acquisition on final landed code:** `bun --env-file=<registered .env> implementation/live-acquisition.ts --strict-boundary-proof`, exit0,20:14:51–20:15:20Z. Same observed versions; all five headers/digests valid; activationAttempted/Confirmed and deactivationAttempted/Confirmed alltrue; counts139→139, safe loopback site recorded; updater5.3.9→5.3.9. `evidence/live-acquisition-strict.{json,log,exit}`. Paid/decrypted scratch removed. No accepted pin update/publication follows from this acquisition-only proof.
5. **Actual email:** one tagged harmless SMTP selftest sent, exact message independently confirmed using read-only IMAP. `evidence-u3/selftest.log`, `arrival.log`. No repeat send to manufacture more proof.
6. **Repository capability read-only preflight:** main unprotected, Actions enabled/all actions allowed, rulesetCount0. `evidence/repository-actions-preflight.log`. This does not prove a future Actions token's successful push.

GITHUB_TOKEN and GITHUB_RUN_ATTEMPT are Actions-provided, not missing local credentials. No new operator credential is required.

## Privacy and evidence retention

- Unit4 worker scanned its evidence plus18 newly generated native/forms directories: zero findings. Old interrupted/truncated traces were not relabeled as complete evidence.
- B preserved those18 scanned scopes under `evidence-u4/native/` before worker removal. Retention refuses environment files and symlinks. Only the report fixture's two exact11-byte `local trace` non-ZIP placeholders were omitted, not real traces. Re-scan result/exit: `evidence/u4-retention-privacy.{log,exit}` (exit0). Scripts and details: `preserve-u4.ts`, `evidence-u4/native/retention.json`, `evidence/u4-retention.log`.
- Unit3 real-mail/repair evidence also scanned with zero findings. Known-secret scans are evidence for the loaded values, not proof of every possible undiscovered private field.
- B final evidence retained under `evidence-final/native/`:18 newly created native/forms scopes, only the two exact `local trace` placeholders omitted. `final-evidence.ts` recorded pre-run directory names and retained only new final-run scopes. Scan covered evidence-final/, evidence/, and evidence-u4/, adding S3/SMTP authentication values to the audit credentials: **11 loaded values,0 findings, exit0**. Result: `evidence/final-privacy.{log,exit}`; scope manifest: `evidence-final/retention.json`.

## Known limitations and unverified criteria

- **Post-merge only:** real main workflow dispatch, full native gate against the observed new versions, actual pin/helper commit and signed release, independent verification of that new remote release, subsequent unchanged workflow, notice delivery from Actions, healthy installed watchdog query, and actual artifact behavior across reruns. These cannot be manufactured by an unreviewed main push; merge owns reviewed installation and dispatch.
- **Elapsed evidence:** first scheduled trigger and30-day keep-alive need dated operation, not a unit fixture or manual run.
- **Same-host outage:** the separate watchdog can detect a disabled/missed audit while its own scheduler works. Total Actions silence, both workflows disabled, or Gmail outage cannot guarantee an email. Mail failure stays failure, without recursive sends.
- **GPL cleanup:** confirmed when reachable; SIGKILL/runner loss/unreachable deactivation can strand a seat. Safe lifecycle/site evidence and manual recovery guidance are retained when available. A pre-existing active instance is never automatically released by this run.
- **Native audit depth:** tests plus callback inventory do not inspect all callback-body behavior, unexercised modules or raw PHP networking. No automatic callback-inventory widening or new manual source-body audit is claimed.
- **Current updater:** actual offered upgrade to a newer GPL Vault updater was not available; real probes show5.3.9 already current.
- **Publication is not transactional:** a main commit may precede failed tag/release/assets. Do not revert/delete/clobber/retry blindly; unchanged discovery detects an incomplete current release.
- **Reruns:** failed-job-only reruns cannot publish an earlier attempt's candidate. Use a fresh main dispatch/new audit; current missing summaries never inherit old cleanup confirmations.
- All local implementation blocking checks are complete. The remaining unverified items above concern post-merge operation or explicit design limitations, not missing local test results.

## Initial handoff

**Ready for `check.review`** on committed6e10d6c95ca27d2765fb2a8b41ff5c36a3263ed4. Lane check passed and retainedu4 was removed normally at2026-10-07T09:13Z; all worker trees are gone. Final suite, blocking typecheck and retained evidence scan passed. Git status is clean, production PHP equals the base byte-for-byte, and the branch contains no files under issues/. Unrelated leaf worktrees are untouched. Request: `akrogon phase reaudit-job check.review --slot B`; its observed result is recorded by the lifecycle state/log and the final response.

## Repair round 1 — 2026-10-07

All four review Fixes (A-F1/A-F2/B-F1/B-F2) repaired. Before6e10d6c95ca27d2765fb2a8b41ff5c36a3263ed4 → after **87143c78cce61bbdc4cd99b578d36aea89dc6a50**; worker1f1b6e6,11files/121insertions/22deletions. Correct summary download destinations, accurate rerun docs, pre-mutation final-asset privacy gate and main-only watchdog history. Full details/commands/limitations: [../report.md](../report.md); complete worker return: [report-u5.md](report-u5.md).

Worker configured check and B lane check each519pass/0fail. Worker removed normally before B's separate final suite: **519pass/0fail,5749expects,38files,3153.05s, exit0 at2026-10-07T13:26:25Z** on the committed repair. Blocking typecheck0. Final retained evidence:18new scopes,3roots,11loaded values,0findings, exit0; only2exact synthetic non-ZIP placeholders omitted. Evidence: `evidence/repair-1-{lane,final,typecheck,privacy}.{log,exit}`, `evidence-repair-1-final/` and `evidence-u5/`. Lane clean, no worker trees remain; shipping PHP/pins/helper/key/callbacks unchanged. Repair recheck routes to A only; no post-merge operational proof is claimed.
