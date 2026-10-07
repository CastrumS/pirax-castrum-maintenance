# Unit4: integration repairs and interrupted verification remainder

## 1. Goal

Resume retained `/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/worktrees/reaudit-job-u4` at clean committed2ac17e5 (parent16bffef). The worker died with API EAI_AGAIN during the operator's internet outage. B confirmed connectivity restored at14:57Z and no owned checker survived. Preserve the implemented chunk and evidence; do NOT redo brief4.

## 2. Numbered acceptance criteria

1. Fix the actual private-directory contract failure. runAudit creates scratch then calls acquire with join(scratch,"packages"), which does not exist. openOfficialVault immediately mkdtemp's its child and fails ENOENT before decrypting. B's synthetic probe proves it in evidence/u4-boundaries.log: nestedDirectoryExists:false, driverFailsBeforeDecryptWithENOENT:true. Create the directory at the owning boundary; fail-first regression must exercise the orchestrator's real directory handoff, not a fake acquire that silently ignores it.
2. Fix archive-child environment scoping once at the shared function. privacy.scanEvidence→findSecret→test/plugin/artifacts.ts run() uses withoutSigningKey() on ambient process.env, passing GPL/Gmail/GitHub credentials to unzip. B's synthetic wrapper proves syntheticLicenseInherited:true with artifactHits:0. Scope ZIP/unzip children to needed noncredential env only; grep all callers and retain trace/asset scanning. Add the sentinel wrapper test so a zero-hit scan cannot conceal inheritance.
3. Follow plan D5's disabled persisted checkout credentials in EVERY job, including publish/heartbeat. Explicitly supply scoped Git authentication for ordinary fast-forward pushes without storing credentials, printing values or putting them on argv (e.g. standard gh credential helper with GH_TOKEN scoped to git/gh). Existing publisher currently relies on checkout persistence and gitEnv omits GH_TOKEN; heartbeat step has no token env. Wire both coherently, preserve trusted checkout refs, test child env/command behavior and workflow configuration. No remote push to prove this.
4. Retain the safe lifecycle evidence that runAudit currently discards: attempted/confirmed flags, counts and updater versions, including failure paths when available. Plan D4 also requires a safe throwaway-site identifier for recovery: expose and validate the loopback site URL from the child, never license data, private downloads or raw replies. Carry it in safe lifecycle evidence and cleanup-failure guidance/notice as appropriate. Keep first-live unchanged counts distinguishable from unknown counts; do not invent values or change acceptance of an explicit deactivation receipt.
5. Complete independent ZIP version verification: verifyRelease currently checks only a const VERSION substring. Refuse a signed, hash-consistent ZIP whose plugin Version header disagrees with the manifest/constant, preserving exact pins/allowlist/signature checks. Use a synthetic signed-package negative case, not a real release.
6. Finish broad verification and the incomplete report. The prior configured-check.log has actual network/Playground/GitHub failures during the outage and no captured terminal exit; preserve it as interrupted/red, never green. Run targeted red/green for repairs, typecheck, then the exact configured command with native gh first under shared flock. Update all affected docs and complete report-u4.md with actual outputs and limitations. Amend the UNLANDED unit4 commit into one final chunk on16bffef, then return.

## 3. Read-first list

Read `/home/rudi/.pi/agent/skills/implement-issue/ponytail.md`, brief-4.md, incomplete report-u4.md, worktree diff16bffef..2ac17e5, and B's implementation/probe-u4-boundaries.ts plus evidence/u4-boundaries.log. Read plan.md D4/D5/D7/D10. Follow run.ts→fetch.ts→gplvault-playground.ts and privacy.ts→test/plugin/artifacts.ts; inspect publish/heartbeat environments and workflow checkout steps. Source has already been implemented; focus on these precise remaining defects.

## 4. Change list and interfaces

Own the existing unit4 chunk and necessary shared archive helper/heartbeat adjustments, related tests and affected guides. All other worker trees have been removed; B lane remains clean16bffef and its lane-after-u3 check passed406/0. Do not modify the lane. Keep production pins/helper0.3.0/key/callback inventories unchanged. Update actual APIs in report if lifecycle/site metadata or helper signatures change. No new dependencies or separate framework.

## 5. Do-not, reasons and exceptions

No main push, publication, workflow dispatch, real email or real GPL activation from this worker. B owns one controlled live acquisition after the stricter flag boundary is landed. Never open/print/copy/write .env/.env.*; load through Bun env-file only. No real-secret matcher subjects. Do not loosen tests/timeouts or call outage failures green. Preserve atomic tag claim/no retries/no force behavior and trusted-code checkout. Return concrete mismatch rather than expanding scope; only B's revised brief permits an exception. These exclusions preserve privacy, proof and the reviewed publication boundary.

## 6. Ordered steps

1. Preserve the outage check log under a distinct name and inspect current committed tree. No owned old process is still running.
2. Add focused fail-first cases for criteria1–5; make minimal shared fixes and update workflow/docs.
3. Run focused green/typecheck and evidence scan with synthetic test diagnostics; actual secret scan uses only booleans/counts.
4. Run configured check once on final code, collect exit/counts, finish the report's four required contents, amend commit and return. Stay active until done, not a final waiting-for-notification message.

Advisory existing20-file chunk plus at most a few shared-helper/test adjustments, under70 editing turns plus native wait. This is a remainder, not a new whole-leaf implementation.

## 7. Commands

Use PATH prefix `/home/rudi/.local/share/mise/installs/node/24.21.0/bin:/home/rudi/.local/share/mise/installs/gh/latest/gh_2.101.0_linux_amd64/bin`; verify command -v gh. Never prepend ~/.local/bin afterwards or reset with bash -l.

Resolved changed command `: "${AKROGON_BASE:?AKROGON_BASE is required}" && bun test`, AKROGON_BASE=4e929fca0a8c793f2189454091fb5c0fcf74a1da, via Bun --env-file=/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/.env wrapper. Existing evidence-u4/configured-check.sh is the runner; preserve old log before reuse. Serialize under implementation/native-check.lock. B owns final full suite after your tree is removed.

## 8. Done-when, evidence and report

B addendum after dispatch: before final verification/return, also address `implementation/u4-attempt-finding.md`. Fixed artifact names let a rerun (same run_id, new run_attempt) reuse an old cleanup-confirmed summary after the current attempt fails before writing one. Bind candidate/summary/evidence artifact names and loaders to the trusted attempt, validate candidate attempt, and test prior-summary/current-missing fallback plus mismatched candidate refusal. Validate the post-commit40hex hash before push too. These are within your existing run/publish/workflow scope; no new live operations are authorized. If already testing when this is read, preserve that result, then check the repaired tree rather than claim it was tested.

Complete authoritative implementation/report-u4.md (it currently stops before changed-files/test-results sections). Record before2ac17e5, amended commit, meaningful red/green, configured exit/counts, source facts vs synthetic fixtures and unresolved post-merge operational proof. Retain evidence under evidence-u4; no issue artifacts in the code commit. Real main workflow dispatch remains post-merge, not claimed here. Return final commit and complete report.

Changed files and reasons: <paths and why>
Tests run: <commands and results>
Known limitations: <limitations or none known>
Unverified criteria: <criterion and why, or none>
