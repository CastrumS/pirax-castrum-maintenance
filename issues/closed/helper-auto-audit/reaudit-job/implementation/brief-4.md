# Unit 4: integrate the daily audit and signed publication

## 1. Goal

Complete plan D6–D12 in detached worktree `/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/worktrees/reaudit-job-u4`, after units1–3 and their repairs have landed. Reuse their interfaces, not parallel implementations. Baseline pins/helper0.3.0 stay unchanged; the real main workflow later audits and bumps them.

## 2. Numbered acceptance criteria

1. Strict decision/candidate contracts: failed, unchanged or audited-candidate; missing gates never authorize publishing. Candidate has schema/run identity, exact40hex audited base, complete old/new pins, five package versions/digests (no paths/URLs), next helper patch, deterministic intended-source-change digest and explicit native/final/privacy/cleanup successes. Fixtures cover unchanged, detection/download/GPL/suite/cleanup failure, corrupt candidate, tag exists and main advancing.
2. Audit acquires selected packages, temporarily changes pins, runs ALL `bun test test/plugin` with random per-run FORM_TEST_TOKEN and those ZIPs, and verifies native manifests used selected versions/digests. Preserve hook/suppression tests. Only after native success prepare helper patch/doc bump and run typecheck plus core/release tests on final candidate. No callback inventory expansion, retries or skipped tests to accept a vendor. Private scratch is always removed; confirmed deactivation gates success. Cancel/drain in-flight acquisition writes before deleting scratch: a Promise.race signal rejection alone leaves a paid download capable of recreating the directory after finally. Add a delayed-download interruption regression.
3. Publisher consumes ONLY this successful main run's strict candidate, reconstructs allowlisted changes with trusted checked-in code, checks base still equals remote main and target tag/release absent, commits and pushes normally, then invokes existing release CLI (atomic ref claim retained). Never checkout a ref supplied by a candidate/job output or interpolate its fields into shell code; use trusted event/main code and validate data. Independently verify remote signature with shipping public key, ZIP hash, pins and tag commit. Never force/clobber/delete/retry uncertain publication. Safe failure summary includes intended commit/tag and uncertainty. An unchanged run detects an incomplete current release rather than silently declaring it healthy; no new pins/tag/release on unchanged.
4. Daily UTC cron plus workflow_dispatch, main/fixed-repo only, repository-wide concurrency cancel-in-progress:false. Separate read-only audit from write-capable publisher; no signing seed/vendor PHP together. Failure notice job with always() covers setup/audit/publish/heartbeat failures with fixed fallback if summary missing. Final independent >=30day heartbeat runs even after audit failure, using fresh main and scoped write credentials. Separate daily/manual watchdog has actions:read and Gmail credentials only. Audit budget >=90minutes with cleanup reserve. Node24, Bun1.4.2, frozen install, native tools and Chromium are explicit; no cloud R2/checker credentials.
5. Scope env by child/step; capture, sanitize AND scan output before logging, and scan retained native logs/trace contents and final assets with findSecret, using synthetic secrets in negative matcher tests. Never upload paid/decrypted ZIPs or raw vendor replies/URLs. Bun children must not silently reload a local .env and defeat filtering. Also fix unit2 lifecycle flags at the shared boundary: absent/malformed data.activated must not become false; truthy malformed activate/deactivate flags must not count as receipts (including the status-unreachable fallback). An already-active initial status must fail before activate/deactivate, preserving a pre-existing seat. Add fail-first native stand-in and lifecycle coverage; accept only explicit recognized flag values.
6. Deterministic bump edits only unique AUDITED_VERSIONS, paired helper header/constant and marked current-doc sections. Test two successive bumps and drift refusal. Preserve historical callback evidence/limitations, no blanket version replacement. Update all four named guides. Full configured changed check and typecheck pass; no real publication/main push from this worker.

## 3. Read-first list

Read `/home/rudi/.pi/agent/skills/implement-issue/ponytail.md`, leaf plan.md D6–D12/implementation notes, design.md, report-u1.md/report-u2.md/report-u3.md (actual APIs), integration-findings.md and coordination-state.md. Read scripts/plugin-source.ts, scripts/release-plugin.ts, scripts/build-plugin.ts, existing scripts/reaudit modules, test/plugin/{harness,artifacts}.ts, test/plugin/release.test.ts. Existing publication test pattern: real read-only gh authentication with mutations intercepted at one strict boundary. Read README.md and the plugin/native/forms guides before updating them.

## 4. Change list and needed interfaces

Prerequisites are landed: worktree starts at16bffef, including unit1+fixture repair, unit2c9896f2, unit3 16bffef and ciphertext468fc9b. B's lane check after unit2 passed368/0; lane-after-u3 is currently running on this same committed head. Do not change the lane; work only in your detached u4.

Own new scripts/reaudit/{decide,bump,run,publish,privacy}.ts (combine a tiny helper if clearer), .github/workflows/{reaudit,reaudit-watchdog}.yml, .github/audit/heartbeat.txt, tests/reaudit-{decide,bump,privacy,workflow}.test.ts; minimal fetch/status and fetch-test repair; necessary existing helper integration adjustments; README.md, plugin/pirax-form-test/README.md, test/plugin/README.md, test/forms/README.md. Do not change existing source pins/helper version, public key or callback inventories.

Existing APIs: synchronous readAuditedVersions/readHelperVersion; acquirePackages({pins,directory,env?,cache?})→unchanged or changed with packages/lifecycle; compareMatrix/validateVersions from detect.ts; FailureSummary/sendFailure + notify CLI accepting summary JSON, optional validated commit/tag; heartbeat CLI --run; watchdog CLI --no-notify optional. Reports give exact signatures. Existing release CLI reads seed from env and requires HEAD on GitHub/clean plugin source.

Keep run/publish import-safe and document their actual CLI/return schema in the report. Candidate handoff is data, never an executable patch. Unit4 owns interface reconciliation, not merely shell placeholders. Baseline full checks require current licensed local ZIPs; latest-GF acquisition cannot replace local pins without a real passing audit.

## 5. Do-not, reasons and exceptions

Do not push main, publish, dispatch remote workflows, disable schedules or send more live selftest email. B already proved real GPL acquisition/deactivation and real mail arrival; use that evidence, not repeated live mutations. No auth mocked as real proof; decision/command fixtures stay labeled synthetic. Never open/print/copy/write .env/.env.*; load only via Bun env-file. Do not print raw errors, credential-bearing objects or private vendor data. No changes to client sites, checker policy, update client, key or callback allowlist. These limits preserve reviewed publication, privacy and locked scope; only B's revised brief permits an exception. Return mismatch with concrete evidence instead of changing scope/interfaces silently.

## 6. Ordered steps

1. Derive candidate/decision/bump/privacy/workflow tests from criteria; record meaningful red before implementation. Add missing-status cleanup regression against unit2's real Playground stand-in.
2. Implement strict pure contracts and deterministic pin/helper/doc transformations; preserve baseline versions.
3. Wire acquisition, exact native gate, final checks, evidence sanitation and safe summaries in run.ts; no success on partial/missing results.
4. Implement publisher/verification with real read-only lookup tests and mutation interception; cover races/partial remote state without remote writes.
5. Wire least-privilege workflows, always-failure notice, fresh-main heartbeat and watchdog. Validate YAML/guards and documented commands with tests, not only grep.
6. Update guides/generated sections; run targeted green/typecheck and serialized configured check; commit/report.

Advisory about18–22 files, under110 turns. If scale forces a stop, preserve work and report exactly what remains rather than dropping criteria.

## 7. Commands

Install dependencies in this worktree; Node24 and native gh binary first on PATH (paths in coordination-state). Verify command -v gh, never prepend ~/.local/bin later or reset PATH with a login shell. Build plugin before broad tests. Resolved changed command: `: "${AKROGON_BASE:?AKROGON_BASE is required}" && bun test`, base4e929fca0a8c793f2189454091fb5c0fcf74a1da. Run under shared `flock <leaf>/implementation/native-check.lock` via:

```sh
AKROGON_BASE=4e929fca0a8c793f2189454091fb5c0fcf74a1da bun --env-file=/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/.env -e 'const p=Bun.spawn(["bash","-c",": \"${AKROGON_BASE:?AKROGON_BASE is required}\" && bun test"],{env:process.env,stdout:"inherit",stderr:"inherit"});process.exit(await p.exited)'
```

Derive focused red/green from owned tests. B owns final full suite after all worker trees are removed.

## 8. Done-when, evidence and report

Commit only this chunk; report to authoritative implementation/report-u4.md with commit, exact interfaces/CLI, paths/reasons, pasted results/exit/counts and evidence-u4 paths. Preserve real-versus-fixture distinction. Main-only end-to-end dispatch is explicitly post-merge: do not pretend a local fixture is a released helper. Same-host total scheduler outage, hard-kill cleanup and callback-body coverage limits remain explicit. Stay active until report/commit or a concrete mismatch, not a final “waiting for background notification”.

Changed files and reasons: <paths and why>
Tests run: <commands and results>
Known limitations: <limitations or none known>
Unverified criteria: <criterion and why, or none>
