# Review A: reaudit-job

Slot A · phase check.review (initial, blind) · 2026-10-07

- Base: `4e929fca0a8c793f2189454091fb5c0fcf74a1da`
- Reviewed head: `6e10d6c95ca27d2765fb2a8b41ff5c36a3263ed4` (clean worktree, 9 commits, 49 files)
- Inputs: `brief.md`, `design.md`, `plan.md` (including the 2026-10-06 implementation notes), `implementation/report.md` (with coordination-state, integration-findings, lesson draft), the check-issue ponytail guide, and the whole diff. `debate: "no"`: no position/rebuttal artifacts are expected. `grounding: none`, and the diff contains no `AREA.md`, so there is no area path list to check.

## Verdict: `fix`

One reproducible defect in the failure-notice path breaks done-criterion 3, AC7 and D7. One sentence in the README makes a false claim about reruns. Everything else I checked holds.

## Fix findings

### F1: the failure email never carries the failing job's summary (done-criterion 3, AC7, D4/D7)

`reaudit.yml` notify job (`.github/workflows/reaudit.yml:166-178`) downloads `pattern: reaudit-summary-${{ github.run_attempt }}-*` into `${{ runner.temp }}/summaries`. `notify.ts` `readSummaries()` (`scripts/reaudit/notify.ts:223-231`) reads only `<dir>/reaudit-summary-<attempt>-<job>/summary.json`.

The pinned `actions/download-artifact@3e5f45b…` (v8.0.1, SHA verified against the tag) chooses its destination in `src/download-artifact.ts` as follows:

```ts
path: isSingleArtifactDownload || inputs.mergeMultiple || artifacts.length === 1
  ? resolvedPath
  : path.join(resolvedPath, artifact.name),
```

Its README says the same: "This change also applies to patterns that only match a single artifact."

At most one summary artifact can exist per attempt:
- `run.ts` writes `summary.json` only for a failed decision.
- `publish` runs only after an `audited-candidate`, which writes no summary.
- `heartbeat` uploads none.

So the pattern matches exactly one artifact whenever a summary exists. `upload-artifact` v7.0.1 keeps `archive: true` by default, so the ZIP holds `summary.json` at its root. The file lands at `${runner.temp}/summaries/summary.json`, `readSummaries()` silently finds nothing, and `chooseNotice()` always sends the fixed per-job fallback.

Reproduced with the real CLI, without mail credentials so nothing was sent. Input: one valid `{stage: audit, reason: native-suite-failed, cleanup: confirmed, oldVersions, candidateVersions}` summary, `REAUDIT_NEEDS` with audit failed, `GITHUB_RUN_ATTEMPT=1`:
- **Flat layout (what v8.0.1 writes):** `notify.ts --jobs` reports `"stage":"setup"`. `formatFailure` renders `[pirax-audit] re-audit failed at setup: audit-job-failure`, `Cleanup: unknown`, and old and candidate versions `not available`.
- **Nested layout (what the tests synthesize):** reports `"stage":"audit"`.

Consequences in production:
- **Download/GPL Vault failures:** the email does not name the reason. Done-criterion 3 says "emails the reason".
- **Stage, cleanup and versions:** every audit failure is reported as stage `setup` with cleanup `unknown` and no versions. AC7 requires "naming safe old/candidate versions, failing stage".
- **Unconfirmed GPL Vault deactivation:** the throwaway site's loopback URL never reaches the email (D4).
- **Partial publication:** the intended commit, tag and the `main-pushed`/`tag-claimed`/`release-incomplete` state are lost; the email says publication `unknown` (D7).
- **Docs:** the README "Notice." paragraph and the "GPL Vault seat" limitation ("the failure email … name that site's loopback URL") describe content that never arrives.

The tests encode the wrong contract. `tests/reaudit-decide.test.ts:286-295` and `tests/reaudit-workflow.test.ts:210-228` create `<dir>/reaudit-summary-1-audit/summary.json` by hand. `tests/reaudit-workflow.test.ts:119-131` checks artifact names only.

Repair direction (B's choice): make the loader and the downloaded layout agree under the action's real rule. One option is to download each job's summary by explicit `name:` into its own `path:` (each `continue-on-error: true`); another is a distinct file name per job. Add a test that models the single-match-is-flat rule instead of a hand-made nested directory. The attempt binding must still hold: an earlier attempt's summary must never be read.

### F2: README claims "Rerunning failed jobs cannot publish", which is false when the audit job failed

The claim is in `README.md` "Reruns." (`README.md:61`). GitHub partial re-runs include "all jobs that are downstream dependencies" (GitHub blog, "Save time with partial re-runs in GitHub Actions").

Scenario: attempt 1's `audit` fails (for example a transient GPL Vault refusal). The operator clicks "Re-run failed jobs". Attempt 2 re-runs `audit`, `publish`, `heartbeat` and `notify`. If the fresh audit passes, it uploads `reaudit-candidate-2`, and `publish` (attempt 2) downloads it and publishes, with every main/tag guard intact. That is safe behaviour, but the README states it cannot happen.

The sentence's own explanation ("a rerun publish job finds no candidate of its attempt") covers only a rerun of a failed `publish` alone. The workflow header comment is accurate ("never publishes an earlier attempt's audit"). Correct the README sentence to match. Doc only; the code is right.

## Nits (no repair required)

- **N1 – notice depends on a full dev install.** The `notify` and `reaudit-watchdog` jobs run a full `bun install --frozen-lockfile` (Playground, Playwright, native `fs-ext-extra-prebuilt`, node-gyp) only to load nodemailer. A registry or install outage that fails the audit's setup also fails the notice job, so the operator gets no email for exactly that setup failure. The plan does not require registry independence, so this is a resilience improvement, not a broken contract.
- **N2 – inconsistent version grammar, triplicated key list.** `scripts/reaudit/detect.ts` `STABLE` accepts 1-component and 5+-component versions; `plugin-source.ts`, `decide.ts` and `notify.ts` allow only 2–4. Such an upstream version passes discovery and download. Then `applyBump` throws inside `runAudit()`, and the summary becomes the fixed `run-error` with cleanup `unknown` even though deactivation was confirmed. It still fails closed. `PIN_KEYS` also exists three times (plugin-source, detect, notify); the plan's note allowed that only "until integration".
- **N3 – heartbeat fallback mentions publication.** The heartbeat fallback summary has `publication: "unknown"`, so a heartbeat-only failure emails "inspect main, tags and releases before any recovery".

## Verification evidence

- **No lane checks rerun.** The head is unchanged since B's final evidence on `6e10d6c`: full `bun test` 516 pass / 0 fail, exit 0 (`implementation/evidence/final-full.{log,exit}`); typecheck exit 0; final privacy scan 0 findings, exit 0. I read those logs.
- **Concrete scenario, the first real bump.** I used a disposable `git archive` copy in my scratchpad. `bump.ts` was applied to the live-observed upstream matrix (GF 3.1.3.1, FF 6.2.15, Pro 6.2.15, CT 6.89, SMTP 2.4.1; helper 0.3.0 → 0.3.1). Results:
  - The diff touches only the three allowlisted files, keeping the 11-space header padding.
  - `bun run typecheck`: exit 0.
  - The credential-free FINAL-gate subset (`tests/plugin-source.test.ts tests/reaudit-bump.test.ts test/plugin/release.test.ts`): 29 pass / 0 fail.
  - None of the new pins appears literally in `test/plugin/*.test.ts`.
- **Native manifest gate.** `verifyManifests` ran over the 9 real `artifacts/plugin` manifests from B's final suite (`evidence-final/native`, excluding the test/forms-only `forms-checker` scope) and returned `verified`. The release scope has no `manifest.json` and is skipped as the code intends.
- **Live, read-only GitHub checks** (native gh 2.101.0):
  - All six repository secret names exist.
  - The repository has no release at all: `releases/latest` returns 404, so `v0.3.0` was never published.
  - Remote `main` = base `4e929fc`.
  - Every pinned action SHA equals its tag's commit (checkout v7.0.1, setup-node v7.0.0, setup-bun v2.2.0, upload-artifact v7.0.1, download-artifact v8.0.1).
  - Because no release exists, the first run must be a changed audit to publish `v0.3.1`. An unchanged run fails with `current-release-missing`, as the README documents.
- **Bun command forms.** `bun --no-env-file install --frozen-lockfile`, `bun --no-env-file run …` and `bun --no-env-file --no-install <script>` all parse under Bun 1.4.2 (empty scratch project).
- **Report and lesson claims.**
  - Setup log: five secrets set, signing secret preserved, round trip verified.
  - The committed ciphertext equals the verified copy and has been untouched since `468fc9b`.
  - Strict live acquisition JSON: counts 139 → 139, deactivation confirmed.
  - `lane-after-u1.log`: 1 of 296 tests failed, on the restored-hash assertion.
  - `attempt-red*.log` and the `red/green` regression logs exist and show the claimed red→green.
  - Both new LESSONS lines are backed by their evidence.

## Documentation check

- **Pages opened:** the root README "Automatic re-audit", Secrets, Limitations and test-prerequisite table; the plugin README Updates/Releasing, Supported versions, Pin authority and historical evidence; `test/plugin/README.md` (pin source, re-audit gate, fixture tests); `test/forms/README.md` prerequisites.
- **Wrong claims:** the README "Notice." paragraph and the "GPL Vault seat" sentence about the email (true only once F1 is fixed), and the "Reruns." sentence (F2).
- **Other claims checked against code** (job/secret table, audit steps, gate, manifests, candidate, publish guards, heartbeat/watchdog, artifacts, generated-section marker, wrong-version fixtures): all match. Every script path named exists.

## Plan coverage (beyond the findings)

- **Requirements that hold:** AC1–AC6, AC8, AC9 and the checked-in part of AC10. Specifically:
  - one strict pin authority and derived fixtures;
  - complete fail-closed discovery;
  - official updater lifecycle with refusal of a pre-existing seat;
  - closed decision state and attempt-bound candidate;
  - trusted-checkout reconstruction, no force push, existing atomic release CLI, independent verification;
  - least-privilege jobs, fixed concurrency, `persist-credentials: false`;
  - 30-day heartbeat and 48-hour watchdog;
  - scoped child environments and evidence scans.
- **AC7:** real SMTP selftest arrival evidence exists, but F1 breaks the audit-run notice content.
- **AC11:** post-merge by design (merge slot dispatch); the report does not claim it.
- **Ponytail:** the implementation is large but follows the plan's explicit interface list. Duplication (N2) is the only reuse concern, and it causes no defect.
- **Debate:** none (`debate: no`).
- **Reusable lesson recorded:** registered checkout `learnings/LESSONS.md` line plus `learnings/history/2026-10-07-reaudit-artifact-download-layout-review-a.md`, uncommitted for the operator.

## Repair re-check, round 1

Slot A · phase check.review (re-check after `check.fix`; repair diff only) · 2026-10-07

- Prior reviewed head: `6e10d6c95ca27d2765fb2a8b41ff5c36a3263ed4`
- Re-checked head: `87143c78cce61bbdc4cd99b578d36aea89dc6a50` (clean worktree, one commit on top). Its tree `8fbe4b9c6798f0ef6af0296608f97ff21c7e9bf9` equals the tested tree B reports.
- Repair diff: 11 files, +121/−22. Production PHP, pins, helper version, public key and ciphertext are untouched.
- Inputs:
  - the round-1 repair report (`report.md`) and `implementation/coordination-state.md`;
  - `review-B.md`: the blind phase is over, and its two Fixes are part of this round;
  - B's repair evidence;
  - the repair diff.

### Verdict: `nits`

All four earlier Fix findings are repaired, and the repair introduces no blocking defect. N1–N3 stay open: B deferred them, which Nits allow. One new Nit (N4) follows.

### Earlier findings: confirmed repaired

- **A-F1 (summary download layout): repaired.**
  - **Workflow:** `reaudit.yml:167-178` now downloads `reaudit-summary-<attempt>-audit` and `-publish` by explicit `name:`. Each goes into its own `${{ runner.temp }}/summaries/reaudit-summary-<attempt>-<job>`, and each step keeps `continue-on-error: true`.
  - **Why the paths line up:** a named download sets `isSingleArtifactDownload`, so v8.0.1 extracts flat into that `path`. Both uploads are single files (`reaudit.yml:75`, `:123`), so each ZIP holds `summary.json` at its root. The file lands exactly where `readSummaries()` reads it: `<SUMMARIES>/reaudit-summary-<attempt>-<job>/summary.json`.
  - **Attempt binding:** each name carries `github.run_attempt`, so an earlier attempt's artifact cannot be downloaded at all.
  - **New test:** `tests/reaudit-workflow.test.ts:232` takes each destination from the workflow YAML, extracts a real ZIP flat, then runs the real loader, formatter and CLI. It covers audit, cleanup with the site URL, and all three partial-publication states with commit and tag. It also checks that attempt 2 reads nothing.
  - **The test guards F1 (my mutation check):** in a disposable `git archive` copy of `87143c7`, `bun --no-env-file test tests/reaudit-workflow.test.ts -t "flat single-match"` passed (1 pass, 65 expects, exit 0). With `6e10d6c`'s `reaudit.yml` restored it failed (exit 1, `expect(received).toEqual(expected)`: the notice fell back). Logs: `review-evidence-A/repair-1/wf-{repaired,reverted}.log`.
  - **Older hand-built tests:** the tests that build `<dir>/reaudit-summary-1-audit/` themselves now match the real layout.
- **A-F2 (rerun claim): repaired.**
  - `README.md:69` now separates the two cases. Rerunning only a failed publish job cannot publish. Rerunning a failed audit also reruns its dependents and can publish a fresh current-attempt candidate.
  - The workflow header (`reaudit.yml:7-8`) agrees.
  - The branch's `learnings/history/2026-10-07-workflow-attempt-artifacts.md` keeps its case and adds a dated clarification. Its `LESSONS.md` line makes no rerun claim.
- **B-F1 (release privacy after upload): repaired.**
  - **Gate:** `scripts/release-plugin.ts:103-110` runs `scanEvidence(DIST, secretValues(process.env))` once the manifest and signature are written. That is before the dry-run return, the tag claim (`:119`) and `gh release create` (`:126`). It covers raw, URL-encoded and JSON-escaped forms, and ZIP entries via `unzip` with only PATH/TMPDIR/LANG/LC_ALL.
  - **Failure handling:** a hit or a scan error deletes all three assets and throws a fixed message. Nothing after the gate rebuilds or edits the assets.
  - **Automatic path:** the release child's environment (`publish.ts:225`) carries the signing key and `GH_TOKEN`, so those are exactly the values scanned.
  - **Truthful state:** `publish.ts:231` classifies the refusal as `main-pushed`, which is accurate. No rollback was added.
  - **Regression:** `tests/reaudit-publish.test.ts:179` asserts zero intercepted mutations and withheld assets. The existing clean publication test is the control.
  - **No false positive on the manual path (my concrete scenario):** the gate also runs in the operator's manual CLI. There Bun loads `.env`, so the scan covers every `SECRET_NAMES` value present. I used a disposable copy of `87143c7`:
    - `bun --env-file=<worktree .env> review-evidence-A/repair-1/names.ts <copy> <out>` (names and booleans only) found 9 of 11 names present (both GitHub token names absent), none hitting the built helper ZIP (`names with a hit: 0`).
    - `release-plugin.ts --dry-run` with the same env file and a generated test seed exited 0 and wrote the three assets.
- **B-F2 (non-main dispatch masks overdue main): repaired.**
  - **Code:** `scripts/reaudit/watchdog.ts:79` queries `runs?branch=main&per_page=50`. Lines 41-42 require a string `head_branch` and skip non-main runs.
  - **Rule kept:** a failed main run still counts as started.
  - **Test:** `tests/reaudit-operations.test.ts:467` covers the overdue main run, the requested `branch` parameter and the failed-main-is-alive rule.
  - **B's original counterexample now:** `healthy:false`, `audit-overdue`, with the main-filtered request (`implementation/evidence/repair-1-watchdog-probe.log`, exit 0).

### Nits (no repair required)

- N1–N3 from the initial review: still open, still non-blocking.
- **N4 – watchdog workflow header predates the main-only rule.** `.github/workflows/reaudit-watchdog.yml:1-2` still says the watchdog emails when the audit workflow "has not started for more than 48 hours". A non-main dispatch does start a workflow run, which the watchdog now deliberately ignores. `README.md:55` and `watchdog.ts:2` say "on `main`"; the comment could too. Comment only; the behaviour is correct.

### Verification evidence

- **B's evidence, read for this head:**
  - **Fail-first:** the worker's red run had 65 pass / 5 fail. The failures were exactly the new regressions: summary extraction, artifact names, encoded seed, and two watchdog tests (`evidence-u5/red.log`).
  - **Full suite:** B's final run (log header `Check head 87143c7…`) was 519 pass / 0 fail, 5749 expects, 38 files, exit 0 at 13:26:25Z. B's lane run was also 519 / 0, exit 0.
  - **Typecheck:** `tsc --noEmit`, exit 0.
  - **Privacy scan:** 18 scopes, 11 values, 0 findings, exit 0.
  - **Handoff:** `moved check.review`.
- **No full-suite rerun:** B's final run is on this exact committed head. I reran only the two targeted concerns above: the F1 mutation check and the manual-path false-positive check.
- **Documentation check:** I reopened the changed paragraphs:
  - root README Publish (`:51`), Heartbeat and watchdog (`:55`), Reruns (`:69`) and the artifact list (`:67`);
  - plugin README Publishing (`:58`) and Automatic releases (`:63`);
  - `test/plugin/README.md` release copies and the `reaudit-publish`/`-workflow`/`-operations` bullets (`:187-191`).

  Each claim matches the code. With A-F1 fixed, the README "Notice." paragraph (`:53`) and the "GPL Vault seat" sentence (`:450`) now describe content that reaches the email. The forms guide is unaffected.
- **No new lesson** from this re-check. The registered-checkout lesson from the initial review stays uncommitted for the operator; the repair applied its "one named download per artifact" remedy.

### Lifecycle

`akrogon phase reaudit-job merge --slot A --verdict nits` returned **`moved merge`** (exit 0); `state.yaml` shows `phase: merge`, `fix_rounds: 1`.

## Merge

Slot A · phase merge · 2026-10-07

### Integration and checks (before push)

- Worktree clean at `87143c78cce61bbdc4cd99b578d36aea89dc6a50`; nothing outstanding to commit.
- `git fetch origin`: `origin/main` = `4e929fca0a8c793f2189454091fb5c0fcf74a1da`. That is the rebase target, the merge base and the configured base.
- `git rebase origin/main`: "Current branch reaudit-job is up to date." The prior reviewed head and the rebased head are both `87143c7`; no conflict, so no range-diff.
- `AKROGON_BASE` refreshed from `akrogon config` after the rebase: `4e929fca0a8c793f2189454091fb5c0fcf74a1da` (unchanged).
- **Checks reused, not rerun.** Neither the code (head `87143c7`, tree `8fbe4b9c6798f0ef6af0296608f97ff21c7e9bf9`) nor the integration (`origin/main` = `AKROGON_BASE`) has changed since B's successful runs in this worktree:
  - `typecheck` (`bun run typecheck`): `tsc --noEmit`, exit 0 (`implementation/evidence/repair-1-typecheck.{log,exit}`).
  - `test` (`bun test`): B's final full suite, log header `Check head 87143c7…`, 519 pass / 0 fail, 5749 expects, 38 files, exit 0 at 2026-10-07T13:26:25Z (`implementation/evidence/repair-1-final.{log,exit}`).
  - `test_changed` (`: "${AKROGON_BASE:?…}" && bun test` with `AKROGON_BASE=4e929fc…`): 519 pass / 0 fail, exit 0 at 12:32:39Z (`implementation/evidence/repair-1-lane.{log,exit}`).
  - `advisory`: none configured.
- **Nit turned into a lesson:** N1 (the notice path shares the failing install) is reusable. It is recorded in the registered checkout as one `learnings/LESSONS.md` line plus `learnings/history/2026-10-07-reaudit-notice-install-dependency-merge-a.md`, uncommitted for the operator. N2–N4 are specific to this leaf and stay Nits only.

### Push

- `git push origin HEAD:main` (fast-forward, no force): `4e929fc..87143c7  HEAD -> main`, exit 0.
- After `git fetch origin`, `origin/main` = `87143c78cce61bbdc4cd99b578d36aea89dc6a50`, and `git merge-base --is-ancestor 87143c7 origin/main` holds.
- Both workflows are registered and active on `main`: `reaudit` (377476223) and `reaudit-watchdog` (377476222).

### Post-merge operational proof (plan "Concrete verification" 6–10, AC11, done-criterion 2)

The plan assigns the main-only dispatch to the merge pass. Everything above is pre-merge evidence; everything below is post-merge.

- **Watchdog (step 10): passed.** `gh workflow run reaudit-watchdog.yml --ref main` started run [37631059628](https://github.com/CastrumS/pirax-castrum-maintenance/actions/runs/37631059628) (workflow_dispatch, `main`, `87143c7`), conclusion `success`. Its Watchdog step printed `{"healthy":true,"reason":"healthy","notice":"not-needed"}`, which confirms real read-only Actions access, and it counted the main audit run started at 13:45:18Z. It was not used to manufacture an outage.
- **Main audit run (step 6):** `gh workflow run reaudit.yml --ref main` at 2026-10-07T13:45:16Z started run [37631030674](https://github.com/CastrumS/pirax-castrum-maintenance/actions/runs/37631030674) (workflow_dispatch, `main`, `87143c7`, attempt 1). Its result is recorded below.

#### Main audit run 37631030674: audited, published and verified (steps 6–7, AC11, done-criterion 2)

- **Jobs:**
  - `audit` success, 13:45:24–14:18:55Z;
  - `publish` success, 14:18:58–14:19:13Z;
  - `heartbeat` success (no keep-alive commit due);
  - `notify` skipped (no failure).
- **Decision:** `audited-candidate` on base `87143c7`. Detected upstream against the old pins:
  - FF 6.2.14 → **6.2.15** (the planned transition);
  - GF 3.1.2 → **3.1.3.1** and CleanTalk 6.88 → **6.89** (upstream had also advanced; reported as actual);
  - FF Pro 6.2.15 and FluentSMTP 2.4.1 unchanged.
  
  Helper 0.3.0 → 0.3.1. Gates: `cleanup: confirmed`, `native: passed`, `manifests: verified`, `final: passed`, `privacy: passed`.
- **Native suite:** 95 pass / 0 fail, 1635 expects, 10 files, 1819.13s (`evidence/native-suite.log`).
- **FINAL gate:** `tsc --noEmit` plus 39 pass / 0 fail, 4 files (`final-1.log`, `final-2.log`).
- **GPL Vault lifecycle:** activation attempted and confirmed, deactivation attempted and confirmed, remaining activations **139 → 139** (unchanged), updater 5.3.9 before and after (`evidence/lifecycle.json`).
- **Publication:**
  - `main` fast-forwarded to `b27a958830a3fe232d7ee856101d998cd88d8a47`, "chore(reaudit): audited pins, helper 0.3.1". Its parent is `87143c7`, and it changes exactly the three bump files.
  - Tag `v0.3.1`; release [v0.3.1](https://github.com/CastrumS/pirax-castrum-maintenance/releases/tag/v0.3.1) published as Latest at 14:19:09Z.
  - The uploaded `reaudit-candidate-1` is byte-identical to the candidate in the evidence artifact.
- **Independent release verification (step 7):** `merge-evidence-A/verify-release.ts` (my script, not the implementation's verifier) downloaded the tag's assets into scratch, not retained. Every check in `merge-evidence-A/release-v0.3.1-verify.json` is true:
  - published, latest, exactly the three assets;
  - tag commit = `main` head `b27a958`, parent = reviewed head;
  - Ed25519 signature over the exact manifest bytes valid against the tag commit's `UPDATE_PUBLIC_KEY`;
  - manifest sha256 = ZIP sha256 `ba4daaa5…7efd87`, and manifest version, package URL and `audited` match the tag commit's `AUDITED_VERSIONS`;
  - ZIP entries exactly the 11 allowlisted files, byte-identical to the tag commit's helper source;
  - header/`VERSION` 0.3.1, and the embedded pins equal the manifest's.
  
  `findSecret` over the downloaded assets with the 8 loaded known values: 0 findings.

#### No-change repeat run 37636004252 (step 8)

- Dispatched at 14:21:25Z on `main` `b27a958`.
- **Jobs:** `audit` success (14:21:31–14:22:42Z, so no gate ran), `publish` skipped, `heartbeat` success, `notify` skipped. The `Candidate` upload step was skipped.
- **Decision:** `{"outcome":"unchanged"}` with versions equal to the new pins. `decideAudit` returns `unchanged` only after confirmed cleanup, passed privacy and `currentRelease === "verified"` (`decide.ts:158-164`), so this run also re-verified `v0.3.1`.
- **Lifecycle:** activation and deactivation confirmed, 139 → 139, updater 5.3.9.
- **Remote state before and after:** `main` = `b27a958`, releases = `v0.3.1`, tags = `v0.3.1`. There was no additional pin commit, tag or release.

#### Evidence retention and scan

- `merge-evidence-A/run-37631030674/` (`reaudit-evidence-1`, `reaudit-candidate-1`) and `merge-evidence-A/run-37636004252/` (`reaudit-evidence-1`) are the workflow's own sanitized artifacts. No ZIPs, traces or vendor responses are retained.
- `merge-evidence-A/scan.ts` (`bun --env-file=<worktree .env>`, `secretValues` + `findSecret`, counts only) found **0 findings** in each run folder, with 8 values loaded.

#### Still outstanding after this merge (cannot be claimed from a manual dispatch)

- The first cron-scheduled `reaudit.yml` run.
- The first scheduled watchdog observation.
- An elapsed 30-day heartbeat commit.

These remain separately dated operational evidence, as the plan says.
