# Unit 4 report: daily audit decision, signed publication and workflows

Worktree `issues/worktrees/reaudit-job-u4` (detached). Before the remainder: **`2ac17e5`** on `16bffef`. After the remainder (`brief-4-remainder.md`), the unlanded unit commit was amended into one chunk: **`68b9bc7`** (`feat: daily re-audit decision, signed publication and workflows`), parent `16bffef`, 26 files.
After the final remainder (`brief-4-finish.md`: run-attempt isolation, the commit-read guard and the configured check), it was amended again into one chunk: **`03612df`** (same subject), parent `16bffef`, 26 files. The host reboot interrupted the previous launcher before any of these edits; `68b9bc7` was the clean starting point. Changes in this pass are marked *(Finish)*.
Briefs: `brief-4.md`, then `brief-4-remainder.md`, then `brief-4-finish.md` (with `u4-attempt-finding.md`). Evidence: `implementation/evidence-u4/`.

The first worker died during the operator's internet outage (API `EAI_AGAIN`) before its configured check finished and before this report was complete. Its check log is kept as `evidence-u4/configured-check-outage-interrupted.log`. It is **interrupted and red**: 13 failures from network, Playground and GitHub calls during the outage, and no terminal exit line or exit file. It is not counted as a result. The remainder below repaired five boundary defects B found, then reran verification.

Baseline pins (GF 3.1.2, FF 6.2.14, FF Pro 6.2.15, CleanTalk 6.88, FluentSMTP 2.4.1), helper 0.3.0, `UPDATE_PUBLIC_KEY` and the callback inventories are unchanged. Nothing was pushed, published or dispatched, and no mail was sent. No environment file was opened. Real credentials reached only the configured check (through `bun --env-file`) and the evidence scan, whose values are never printed.

## Exact interfaces

### `scripts/reaudit/decide.ts` (pure, no IO)
- `CANDIDATE_SCHEMA = 1`, `REPOSITORY = "CastrumS/pirax-castrum-maintenance"`.
- `RUN_ID = /^[1-9][0-9]{0,19}$/` and *(Finish)* `RUN_ATTEMPT = /^[1-9][0-9]{0,3}$/` are exported (run.ts uses them).
- `type Candidate = { schema: 1; repository; runId: string; runAttempt: string /*(Finish)*/; base: string /*40 hex*/; oldPins; newPins; packages: Record<PinKey,{version, sha256}>; helper: {from, to}; changes: {digest /*64 hex*/}; gates: {cleanup:"confirmed", native:"passed", manifests:"verified", final:"passed", privacy:"passed"} }`. No paths, URLs or patches.
- `parseCandidate(value, {runId, runAttempt}): Candidate`. Every level must have exactly its keys. `runId` must equal the expected run's ID. *(Finish)* `runAttempt` must be a string matching `RUN_ATTEMPT` and equal the expected attempt (`candidate: runAttempt` otherwise), so attempt 2 of a run refuses attempt 1's candidate. `base` must be lowercase 40 hex. Both pin maps need exactly the five stable versions, and `newPins` must be a changed, non-downgraded matrix. Every `packages[k].version` must equal `newPins[k]` with a 64-hex digest. `helper.to` must be `nextHelperPatch(from)`. Gates must be the literal values above. Any failure throws `CandidateError("candidate: <field>")` with a fixed field name; values and keys are never echoed.
- `type AuditFacts = { runId; runAttempt /*(Finish)*/; base; helper; oldPins; acquisition?: {status:"unchanged",versions} | {status:"changed",versions,packages} | {status:"failed",error}; cleanup?; currentRelease?: "verified"|"missing"|"incomplete"|"unknown"; native?; manifests?; final?; privacy?; changes?: {to, digest}; runUrl? }`.
- `decideAudit(facts): {outcome:"failed", summary: FailureSummary} | {outcome:"unchanged", versions} | {outcome:"audited-candidate", candidate}`. Every gate is compared with its literal value, so a missing or truthy-but-wrong value fails. Unchanged additionally needs identical versions, clean evidence and `currentRelease === "verified"`; otherwise it fails as `publication` / `current-release-<state>` / `release-incomplete` with tag `v<helper>`. A `ReauditError` becomes a stage plus a reason built only from a fixed vocabulary, so a data-bearing field is dropped. Any other error becomes `unknown` / `unexpected-error`.
- `decidePublication({candidate, head, sourcePins, sourceHelper, digest, remoteMain, tag}) → {proceed:true} | {proceed:false, reason}`. Reasons, in check order: `checkout-not-audited-base`, `source-drift`, `reconstruction-mismatch`, `main-unreadable`, `main-advanced`, `tag-exists`, `tag-lookup-failed`.
- `verifyManifests(manifests, packages): "verified"|"failed"`. Every manifest's GF/FF versions and ZIP digests must equal the selections. Full-stack manifests must also match Pro, CleanTalk and FluentSMTP. At least one full-stack manifest is required.
- `parseTestCounts(output) → {pass, fail, skip, todo, ran} | null`.

### `scripts/reaudit/bump.ts`
- `BUMP_FILES = [plugin/pirax-form-test/includes/compatibility.php, plugin/pirax-form-test/pirax-form-test.php, plugin/pirax-form-test/README.md]`. `BumpPlan = {oldPins, newPins, from, to}`.
- `nextHelperPatch(v)`: numeric (`0.3.9 → 0.3.10`).
- `planBump(old, new, from)` refuses unchanged, downgrade, ambiguous or malformed pins.
- `renderCurrentVersions(pins, version)`: the plugin guide's section between `<!-- pirax:current-versions:start -->` and `:end -->`. It holds the version line, the table and the patch-release paragraph.
- `bumpSources(sources, plan, {pinsOnly?})`: pure. It rewrites the five unique `AUDITED_VERSIONS` lines (key padding kept), the paired header and `VERSION`, and the marked section. First it requires each input to equal the plan's old facts: one table, one header, one constant, one section, and that section equal to `render(old)`. If any check fails, nothing is rewritten.
- `changesDigest(files)`: SHA-256 of the sorted `[path, sha256(content)]` pairs.
- `readBumpSources(root)`; `applyBump(root, plan, opts) → {paths, digest}` computes every rewrite first, then writes each file atomically.

### `scripts/reaudit/privacy.ts`
- `SECRET_NAMES` (GPL Vault ×3, IMAP_USER/PASSWORD, signing key, FORM_TEST_TOKEN, both ZIP paths, GH_TOKEN, GITHUB_TOKEN).
- `secretValues(env, extra?)`: the public recipient address is not counted as a secret.
- `scopedEnv(env, names, extra?)`: base allowlist plus the named variables, which must be set.
- `bunCommand(...args)`: `[bun, "--no-env-file", ...]`.
- `sanitizeLine(line, secrets)`: redacts raw, URL-encoded and JSON-escaped forms, strips URL userinfo, query and fragment, then rescans; a line that still matches is withheld.
- `runChild(cmd, {cwd, env, secrets, log, timeoutMs, echo?}) → {code, timedOut, output}`: every line is sanitized and rescanned before it is echoed or logged. On timeout it sends SIGTERM, then SIGKILL.
- `scanEvidence(dir, secrets)`: `findSecret` over files and ZIP entries; files with a hit are deleted (withheld). (Remainder:) its `unzip` child, like every `zip`/`unzip` child of `test/plugin/artifacts.ts` `run()`, now gets only `PATH`, `TMPDIR`, `LANG` and `LC_ALL`.

### `scripts/reaudit/run.ts`
- CLI: `bun --no-env-file scripts/reaudit/run.ts --out <dir>`. Needs `GITHUB_RUN_ID` (digits), *(Finish)* `GITHUB_RUN_ATTEMPT` (digits, set by Actions; otherwise the fixed `run-error` summary), the three GPL Vault secrets and `GH_TOKEN` (read-only). Exit codes: 0 unchanged or candidate, 1 failed, 2 usage. It appends `outcome=<failed|unchanged|audited-candidate>` to `GITHUB_OUTPUT`.
- Output: `<out>/decision.json`, plus `candidate.json` or `summary.json`, plus `<out>/evidence/{native-suite.log, final-N.log, native/<run>/manifest.json}`. If no decision is reached, it writes the fixed summary `{stage:"unknown", reason:"run-error"}` after scanning `out`.
- `runAudit({root?, out, runId, runAttempt /*(Finish)*/, env?, deps?}) → Decision`, with `RunDeps = {acquire, exec, currentRelease}` (`realDeps` = `acquirePackages`, `runChild`, `verifyRelease`).
- (Remainder) `safeLifecycle(value) → {activationAttempted, activationConfirmed, deactivationAttempted, deactivationConfirmed: boolean|null; remainingBefore, remainingAfter: number|null; updater: {before, after}|null; site: string|null} | null`. Every field is strictly typed or null; nothing is invented. After acquisition, on success or failure, `runAudit` writes it to `<out>/evidence/lifecycle.json` when any lifecycle exists, and sets `facts.site` from a valid loopback site.
- Order of operations:
  1. Preconditions: HEAD is 40 hex and equals `GITHUB_SHA` when that is set; no tracked changes.
  2. Acquisition with the GPL Vault names only, into `RUNNER_TEMP/pirax-reaudit-private-*/packages` (created by the driver, see `fetch.ts`), then `evidence/lifecycle.json`.
  3. Unchanged: `verifyRelease(v<helper>)`.
  4. Changed: pins-only edit, then `bun --no-env-file test test/plugin` with base env + `GH_TOKEN` + random `FORM_TEST_TOKEN` + the paid ZIP paths. It must exit 0, with pass == ran > 0 and 0 fail, skip and todo.
  5. Manifest check over the new artifact directories.
  6. Restore the base sources, then the full bump.
  7. `bun --no-env-file run typecheck` and `bun --no-env-file test test/plugin/core.test.ts test/plugin/release.test.ts tests/plugin-source.test.ts tests/reaudit-bump.test.ts`.
  8. Evidence scan.
  9. `finally`: scratch removed.
- SIGINT/SIGTERM handlers only mark the run as interrupted, so cleanup still runs and the run cannot pass.

### `scripts/reaudit/publish.ts` (dependency-free; runs with `--no-install`)
- CLI: `bun --no-env-file --no-install scripts/reaudit/publish.ts --candidate <file> --summary <file>`. Needs `GITHUB_RUN_ID`, `PIRAX_HELPER_SIGNING_KEY` and gh authentication. Exit 0 prints `{"outcome":"published", base, commit, tag}`. Exit 1 writes a `FailureSummary` to `--summary`. Exit 2 is usage.
- *(Finish)* The CLI also needs `GITHUB_RUN_ATTEMPT`.
- `publish({root?, candidatePath, runId, runAttempt /*(Finish)*/, env?, remoteUrl?, beforePush?})`. Steps:
  1. Read and strictly parse the candidate (64 KiB limit).
  2. Require a clean checkout and HEAD equal to the candidate's base.
  3. Read the source facts and reconstruct the digest with `bump.ts`.
  4. Check remote `main` with `ls-remote`, and the tag with `remoteTag()` from `release-plugin.ts`.
  5. Apply `decidePublication`.
  6. `applyBump`; exactly `M ` on the three files; commit as github-actions[bot] (*(Finish)* message names run and attempt). *(Finish)* The new commit is read back with `rev-parse --verify HEAD`; a nonzero exit or a value that is not 40 lowercase hex stops with `bump` / `commit-unreadable`, publication `not-attempted`, no `commit` field and no push. Before, the unchecked value was assigned, and an empty read made `verifyRelease`'s `commit &&` tag-commit comparison a no-op.
  7. Recheck `main`, then `push <url> HEAD:refs/heads/main` (no force).
  8. `bun --no-env-file scripts/release-plugin.ts`, with the signing key in that child only, through `runChild`.
  9. `verifyRelease`.

  Failures throw `PublishError(summary)` carrying stage, reason, old and candidate versions, intended `tag`, and `commit` once one exists. The publication state is `not-attempted`, `main-pushed`, `tag-claimed` (when the release CLI reports the claimed tag), `release-incomplete` or `unknown`. Nothing is ever retried, deleted, forced or clobbered.
- `verifyRelease({tag, version, pins, publicKey, commit?, env?, secrets?}) → {status:"verified"} | {status:"missing"|"incomplete"|"unknown", reason}`. Read-only `gh api --include` lookups of the release (404 → missing), `releases/latest` and the tag ref (type commit, equal to `commit` when given). Then `gh release download` to a temporary directory and checks:
  - exactly three assets;
  - the manifest has exact keys, version, package URL, SHA-256 of the ZIP and audited pins;
  - an Ed25519 signature that verifies with the checked-in `UPDATE_PUBLIC_KEY`;
  - ZIP entries equal to the build allowlist, embedded `VERSION` and embedded `AUDITED_VERSIONS`;
  - `scanEvidence` over the assets.

  (Remainder) The ZIP's `pirax-form-test.php` must also pass `parseHelperVersion` (unique `Version` header, unique `VERSION`, equal and stable) with the result equal to `version`. Before, only the `VERSION` substring was checked.

  Git: every publisher git child runs as `git ...GIT_AUTH -c core.hooksPath=/dev/null ...` with `ghEnv(env)` plus `GIT_TERMINAL_PROMPT=0`, so the push gets `GH_TOKEN` through gh rather than a persisted checkout credential.

  Reasons: `release-missing`, `release-lookup-failed`, `release-not-published`, `release-assets`, `release-not-latest`, `release-tag-commit`, `release-download-failed`, `release-manifest`, `release-signature`, `release-package`, `release-asset-secret`. `readPublicKey(root)` is exported.

### Changed existing interfaces
- `fetch.ts`:
  - `Vault.status()` now returns `activated: boolean | null`. PHP returns the official boolean only; a missing or non-boolean `data.activated` becomes null.
  - `activate`/`deactivate` count as receipts only for `=== true`, which also covers the status-unreachable fallback.
  - `acquirePackages` refuses an initial status that is not exactly `false` before any activate or deactivate: `activation: status already active` or `activation: status malformed`, with `activationAttempted:false`.
  - Downloads take the signal-linked `AbortSignal`, write nothing once aborted, and are drained before paid-file removal and return.
- `notify.ts`:
  - New `chooseNotice(needs, summaries, runUrl?)`. It sends the first failed or cancelled job's own valid summary, in the order publish, audit, heartbeat; otherwise a fixed fallback per job (`audit` → `setup`/`audit-job-<result>`).
  - New CLI mode `--jobs <dir>`, which reads `REAUDIT_NEEDS` and, *(Finish)* through `readSummaries(dir, process.env.GITHUB_RUN_ATTEMPT)`, only `<dir>/reaudit-summary-<attempt>-<job>/summary.json`.
  - *(Finish)* `readSummaries(dir, attempt) → Partial<Record<job, unknown>>`: an absent or malformed attempt (`""`, `01`, `0`, a path, `*`) reads nothing. A missing current-attempt summary therefore yields the fixed per-job fallback (`audit` → `setup` / `audit-job-<result>`, cleanup `unknown`), even when an earlier attempt's summary with `cleanup: confirmed` sits in the same directory. The run URL regex shares the same attempt pattern.
  - The failure JSON now includes `stage`.
  - Existing modes are unchanged.

- (Remainder) `fetch.ts`:
  - `openOfficialVault` first creates `directory` (`mkdir -p`, mode 0700) before its `mkdtemp`, so the not-yet-existing `packages` path that `run.ts` hands over works.
  - The child's ready message carries `site` (`server.serverUrl`). The driver exposes `Vault.site?: string|null`, validated with `loopbackSite`.
  - `Lifecycle` gains `site: string|null` (null until a vault reports a valid loopback site).
- (Remainder) `notify.ts`:
  - `loopbackSite(value) → string|null` accepts only `http://127.0.0.1|localhost|[::1]:<1..65535>`.
  - `FailureSummary.site?` is strictly validated (otherwise `invalid failure summary: site`). It renders as `Throwaway site: <url>. Its GPL Vault activation may remain: deactivate this site …`.
- (Remainder) `decide.ts`: `AuditFacts.site?`. A failed decision's summary includes `site` only when cleanup is `failed` or `unknown`.
- (Remainder) `heartbeat.ts`: `GIT_AUTH = ["-c", "credential.helper=", "-c", "credential.https://github.com.helper=!gh auth git-credential"]` prefixes every heartbeat git child. `safeChildEnv` already passes `GH_TOKEN`.
- (Remainder) `plugin-source.ts`: `parseHelperVersion(text)`. `readHelperVersion(dir)` now delegates to it, with unchanged behaviour.
- (Remainder) `test/plugin/artifacts.ts`: `run()` no longer uses `withoutSigningKey()` (all of ambient `process.env`); it passes the `ARCHIVE_ENV` allowlist. Callers are `withUnzipped` (`findSecret`, `sanitizeZip`) and `sanitizeZip`'s `zip`. Trace and asset scanning is unchanged.

### Workflows
- `.github/workflows/reaudit.yml`:
  - *(Finish)* Every artifact name carries `${{ github.run_attempt }}`: uploads `reaudit-candidate-<attempt>`, `reaudit-summary-<attempt>-audit`, `reaudit-evidence-<attempt>`, `reaudit-summary-<attempt>-publish`; publish downloads `reaudit-candidate-<attempt>`; notify downloads pattern `reaudit-summary-<attempt>-*`. The scripts read the Actions-provided `GITHUB_RUN_ATTEMPT`; no new secret or env entry. Rerunning failed jobs cannot publish (the rerun publish job finds no candidate of its own attempt and fails, which is notified); a fresh `main` dispatch audits again. Upload names are therefore also unique per attempt, so a full rerun no longer collides with an earlier attempt's fixed name.
  - Triggers: cron `17 3 * * *` and `workflow_dispatch`. `permissions: {}`. Concurrency `pirax-reaudit` with `cancel-in-progress: false`.
  - Every job: `if` the repository is `CastrumS/pirax-castrum-maintenance` and the ref is `refs/heads/main`; Ubuntu 24.04; actions pinned to commit SHAs (looked up read-only).
  - `audit`: `contents: read`, 150 min, `persist-credentials: false`, Node 24, Bun 1.4.2, apt native tools, `bun --no-env-file install --frozen-lockfile`, `bunx playwright install --with-deps chromium`, build. The run step alone gets the GPL Vault secrets and `github.token`. Uploads: candidate only when the outcome is `audited-candidate`, plus summary and sanitized evidence.
  - `publish`: needs `audit` with result `success` and outcome `audited-candidate`; `contents: write`. Checks out `github.sha`, installs nothing, downloads the `reaudit-candidate` artifact by name (this run), and gets the signing key only on the publish step.
  - `heartbeat`: `always()`, `contents: write`, checkout of `main`, `--no-install`.
  - `notify`: `always()` plus any failure or cancellation; `contents: read`; IMAP secrets on the send step only. `REAUDIT_NEEDS: ${{ toJSON(needs) }}` is passed through `env`.
  - No expression appears inside any `run:` block.
- `.github/workflows/reaudit-watchdog.yml`: cron `43 15 * * *` and dispatch. Permissions are `actions: read` and `contents: read`. The second one is for the checkout only; the brief said `actions:read` only, which I read as a limit on credentials. IMAP secrets and `github.token` only, and its own concurrency group.
- `.github/audit/heartbeat.txt`: `2026-10-06T00:00:00.000Z`.
- (Remainder, plan D5) Every checkout in both workflows now has `persist-credentials: false`; before, `publish` and `heartbeat` relied on persisted checkout credentials. The `Publish` step already had `GH_TOKEN: ${{ github.token }}`. The `Heartbeat` step now gets it too, on that step only. Refs are unchanged: the trusted `github.sha` for publish and `main` for heartbeat.

## Changed files and reasons

Unit commit **`03612df`** on `16bffef` (26 files, +2941/−53; `git diff --stat 16bffef 03612df`). Issue artifacts (this report, `evidence-u4/`) are not in the code commit.

Workflows and payload
- `.github/workflows/reaudit.yml`: daily audit → publish → heartbeat → notify, least privilege per job, secrets per step, pinned actions, no expression in shell, credential-free checkouts. *(Finish)* every artifact name/pattern bound to `github.run_attempt`, plus a header note on reruns.
- `.github/workflows/reaudit-watchdog.yml`: separate daily/manual schedule watchdog (`actions: read`, `contents: read`).
- `.github/audit/heartbeat.txt`: initial heartbeat instant.

Scripts
- `scripts/reaudit/decide.ts` (new): pure decision state machine, strict candidate, publication guards, manifest and test-count checks. *(Finish)* `runAttempt` in `Candidate`/`AuditFacts`/`parseCandidate`; exported `RUN_ID`/`RUN_ATTEMPT`.
- `scripts/reaudit/bump.ts` (new): deterministic pin/helper/guide rewrite with drift refusal and change digest.
- `scripts/reaudit/run.ts` (new): the audit job driver (acquisition, native gate, manifests, bump, final checks, evidence scan, safe lifecycle evidence). *(Finish)* requires and threads `GITHUB_RUN_ATTEMPT`.
- `scripts/reaudit/publish.ts` (new): candidate-as-data publisher with main/tag guards, normal push, existing release CLI and independent release verification. *(Finish)* attempt-bound candidate; the new commit must read back as 40 hex before any push (`commit-unreadable`).
- `scripts/reaudit/privacy.ts` (new): scoped child environments, `--no-env-file` children, sanitize/rescan, evidence withholding.
- `scripts/reaudit/notify.ts`: `chooseNotice`, `--jobs`, `loopbackSite`, `site` in summaries. *(Finish)* `readSummaries(dir, attempt)`: only this attempt's summaries are read.
- `scripts/reaudit/fetch.ts`, `gplvault-playground.ts`: strict boolean lifecycle facts, refusal of an already-active instance, drained aborted downloads, created private directory, loopback site reporting.
- `scripts/reaudit/heartbeat.ts`: `GIT_AUTH` (gh credential helper, no persisted credentials).
- `scripts/plugin-source.ts`: `parseHelperVersion` (used by release verification).
- `test/plugin/artifacts.ts`: zip/unzip children get only `PATH`/`TMPDIR`/`LANG`/`LC_ALL`.

Tests
- `tests/reaudit-{decide,bump,privacy,publish,workflow}.test.ts` (new), `tests/reaudit-{fetch,operations}.test.ts`, `test/plugin/artifacts.test.ts`. *(Finish)* two-attempt candidate, earlier/missing/malformed attempt refusals, two-attempt notice fallback, attempt-bound artifact names, `notify --jobs` per attempt, publisher refusal of another attempt's candidate, and the unreadable-commit refusal.

Docs
- `README.md`: automatic re-audit, secrets, dispatch, notice, evidence, recovery. *(Finish)* candidate holds the run attempt; artifact names; new **Reruns** paragraph (rerunning failed jobs cannot publish; dispatch a fresh `main` run; missing current-attempt summary → fixed fallback with cleanup `unknown`).
- `plugin/pirax-form-test/README.md`: generated current-versions section and publication gate. `test/plugin/README.md`, `test/forms/README.md`: single pin source and dynamic versions.

Production facts unchanged: pins (GF 3.1.2, FF 6.2.14, FF Pro 6.2.15, CleanTalk 6.88, FluentSMTP 2.4.1), helper 0.3.0, `UPDATE_PUBLIC_KEY` and the callback inventories. `git diff 16bffef 03612df -- plugin/pirax-form-test/includes plugin/pirax-form-test/pirax-form-test.php` is empty.

**Handoff (B, brief §8 at 19:30Z).** B will apply the permitted two-line sibling archive-environment repair in `scripts/build-plugin.ts` after this return and before B's lane checks. B's synthetic `probe-u4-build-env.ts` / `evidence/u4-build-env.log` show that build-time zip/unzip still inherit `GH_TOKEN`. That repair and its green proof are pending with B and are **not** covered by this configured result. I made no change to `build-plugin.ts` and did not restart the running check for it.

## Tests run

PATH prefix for all of them: node 24.21.0 and the native gh 2.101.0 (`command -v gh` → the mise gh path, recorded in the check log). Logs are in `implementation/evidence-u4/`.

Finish pass (this session, from clean `68b9bc7`)
1. **Red**, unchanged source with the new tests: `bun --no-env-file test tests/reaudit-decide.test.ts tests/reaudit-workflow.test.ts tests/reaudit-publish.test.ts` → exit 1, 20 pass / 7 fail (`attempt-red.log`, `attempt-red.head`). `reaudit-decide.test.ts` failed to load because `readSummaries` did not exist yet. Failing cases:
   - publish against the synthetic remote: an earlier attempt's candidate published, and an unreadable new commit still pushed and "published", whose tag-commit check was then skipped;
   - workflow: fixed artifact names;
   - `notify --jobs`: attempt-bound reads.
2. **Red, decide file**, after only `readSummaries` was added: `bun --no-env-file test tests/reaudit-decide.test.ts` → exit 1, 52 pass / 6 fail (`attempt-red-decide.log`). The failures are the candidate shape, the two-attempt case and the four attempt refusals. The two-attempt notice test already passed at this point.
3. **Typecheck**: `bun --no-env-file run typecheck` → exit 0 (`attempt-typecheck.log`, final source).
4. **Focused green**, final source: `bun --no-env-file test tests/reaudit-decide.test.ts tests/reaudit-workflow.test.ts tests/reaudit-publish.test.ts tests/reaudit-operations.test.ts tests/reaudit-bump.test.ts tests/reaudit-privacy.test.ts tests/reaudit-detect.test.ts tests/plugin-source.test.ts` → exit 0, 186 pass / 0 fail (`attempt-green.log`). `git diff --check` was clean.
5. **Configured check**, on committed `03612df` with a clean tree:
   - Launch: `setsid nohup bash evidence-u4/configured-check.sh </dev/null > evidence-u4/configured-check-launch.log 2>&1 &`. The check ran in its own session (SID 33830, reparented, distinct from the tool shell's session) and held `native-check.lock` (a concurrent `flock -n` was refused).
   - What it ran: `bun run build:plugin` (dist ZIP sha256 `144641541835…`), then `AKROGON_BASE=4e929fca0a8c793f2189454091fb5c0fcf74a1da bun --env-file=<registered .env> … bash -c ': "${AKROGON_BASE:?AKROGON_BASE is required}" && bun test'`.
   - Result (`configured-check.log`, `configured-check.exit` = `0`): queued and lock acquired 2026-10-06T19:20:19Z, head `03612dff38eb361ce978a916f7a523dc1b49a70b`. **516 pass, 0 fail, no skip/todo, 5673 expect() calls, 38 files, 2952.96 s; `Result exit=0 at 2026-10-06T20:09:32Z`.** I polled `configured-check.exit` in bounded synchronous loops until it existed.
6. **Evidence scan**: `bun --env-file=<registered .env> evidence-u4/scan-evidence-u4.ts …` → `{"scopes":19,"configuredNames":9,"valuesLoaded":8,"findings":0}`, exit 0 (`scan-evidence-final.log`).
   - Scopes: `evidence-u4/` plus the 18 `runs/` and `artifacts/plugin/` directories this check created (`scan-evidence-final.scopes`).
   - `forms-report-tests-*` was scanned as a copy without its two 11-byte `.zip` files. The report test writes those as literal `"local trace"` placeholders, which unzip cannot open; their exact content was verified with `cmp`.
   - The first, unscoped attempt aborted on a truncated trace ZIP from the earlier interrupted 14:51Z run. That ZIP is outside this result.
   - Values were never printed.

Earlier passes (kept; not re-run except as part of 5)
- Initial unit: `red-new-modules.log`, `red-fetch.log` (red); `green-focused.log` (210 pass / 0 fail, 10 files); `green-typecheck.log`.
- First remainder (`brief-4-remainder.md` repairs): `remainder-red.log` (102/9), `remainder-red-publish.log`, `remainder-green.log` (167/1; the one failure was repaired), `remainder-green-2.log` (168 tests, exit 0), `remainder-fetch-repeat.log` (34/0 ×3), `remainder-docs-typecheck.log` (typecheck plus 29/0), `remainder-probe-u4-boundaries.log` (B's probe now reports the created parent and no archive-child inheritance).
- **Interrupted, not results:**
  - `configured-check-outage-interrupted.log`: internet outage, 13 network failures, no exit.
  - `configured-check-interrupted-worker-exit.log` / `.note`: the worker exit killed the wrapper and B stopped orphan Bun 1007703. No exit file.
  - Neither counts as a pass.

Synthetic vs real
- Every publish test uses a local bare git remote and a gh wrapper that intercepts every mutation (ref claim, release create). The release CLI therefore prints `published v0.3.1 on CastrumS/pirax-castrum-maintenance` and `tag v0.3.1 was claimed … at <sha>` in these logs, but **no real tag, release or main commit was created**. Only exact read-only gh lookups reached GitHub.
- Decide, workflow and operations tests use synthetic facts, doubles and parsed YAML.
- The configured suite's existing native, Playground and live-acquisition tests used the registered credentials only through `bun --env-file`.
- Nothing was pushed, dispatched, released or mailed (the notify CLI tests stop before SMTP with `smtpAttempts: 0`). No environment file was opened, printed, copied or written.

## Known limitations

- Rerunning failed jobs cannot complete a publication: the rerun publish job finds no candidate of its own attempt and fails, which sends the publish-job notice. This is deliberate (no inheritance of an earlier attempt, no uncertain retry). Recovery is a fresh `main` dispatch, as documented in README **Reruns**.
- Attempt binding relies on Actions' `github.run_attempt` / `GITHUB_RUN_ATTEMPT` and on artifact names; the summary JSON itself carries no attempt field. The loader reads only `reaudit-summary-<attempt>-<job>`, and the download pattern is attempt-specific.
- The notice's run URL names the attempt only from attempt 2 on (`/attempts/<n>`); attempt 1 uses the plain run URL. This is unchanged behaviour.
- The build-time archive environment (`scripts/build-plugin.ts`) still passes `GH_TOKEN` to zip/unzip until B's pending two-line repair (see the handoff above).
- The earlier D12 limitations still apply: historical audits are not re-proven; vendor acquisition depends on GPL Vault availability; Playground timing variance.
- `runs/` keeps an old truncated trace ZIP from the 14:51Z interrupted run; a whole-`runs/` `findSecret` aborts on it.

## Unverified criteria

- Main-only workflow behaviour: Actions permission enforcement, artifact upload/download naming across real reruns, the real publish → release, and notice delivery from Actions. These need the reviewed workflow on `main` and the post-merge dispatch (`gh workflow run reaudit.yml --ref main …`). That is the merge slot's job; it is not claimed here.
- Real release verification of a newly published helper, and the no-change repeat run: post-merge.
- Watchdog on `main`, the first scheduled run, and elapsed heartbeat timing: post-merge, dated evidence.
- B's strict-boundary live acquisition after landing: B owns it.
- The `scripts/build-plugin.ts` archive-environment repair and its proof: pending with B, outside this configured result.
- B's final full suite after worker removal: B owns it.
