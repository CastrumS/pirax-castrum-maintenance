# Unit 5 — repair reviewed automation boundaries (round 1)

## 1. Goal

Repair A-F1/A-F2 and B-F1/B-F2 at reviewed6e10d6c95ca27d2765fb2a8b41ff5c36a3263ed4, preserving plan D6–D10. Worktree: `/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/worktrees/reaudit-job-u5`. Leaf: `/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/open/helper-auto-audit/reaudit-job`. Artifacts: leaf `implementation/evidence-u5/`; complete report: `implementation/report-u5.md`. One cohesive repair unit owns all four findings because their workflow/tests/docs overlap. All prior implementation is already landed. You do not run lifecycle commands or create other workers.

## 2. Numbered acceptance criteria

1. A-F1: pinned download-artifact v8.0.1 extracts a single pattern match flat, not beneath artifact name. Align actual download destinations with readSummaries. Prefer two explicit attempt-bound named downloads (audit/publish) into their own per-job paths, each allowed to be missing. Test the action's actual single-match/named extraction rule against workflow-selected paths and the real loader/CLI. Preserve stage/reason, old/candidate versions, cleanup/site and partial-publication commit/tag/state. Absent current summary never inherits older evidence.
2. A-F2: document that failed-publish-only reruns cannot consume an earlier candidate, but a failed audit and its downstream reruns can create and publish a new current-attempt candidate. Correct stale blanket claims in affected guides/comments/history; do not change safe code to enforce the false old sentence.
3. B-F1: scan exact final manifest/signature/ZIP entries with the existing encoded-known-secret mechanism BEFORE remote tag/release mutation. Keep atomic tag ownership, immutable checked bytes, child environment scoping and independent post-publish checks. Regression: encoded synthetic signing seed in disposable source must yield zero tag/release mutations; clean control still publishes/verifies at intercepted boundaries. Do not merely inspect after upload or rebuild unscanned assets later.
4. B-F2: watchdog ignores non-main dispatches when determining main audit liveness. Main older than48h + recent skipped non-main dispatch remains overdue; failed recent main audit remains alive. Constrain query/accepted facts as appropriate; test actual requested branch selection as well as the decision.
5. Preserve baseline production PHP, pins, helper0.3.0, key and callbacks. Configured changed check passes with no skips; blocking typecheck passes. Updated documentation matches the repaired flow. No actual GitHub mutation or SMTP is needed for these repairs.

## 3. Read-first list

Read leaf review-A.md/review-B.md, plan repair notes/design, implementation/report.md. Then root README Automatic re-audit/Limitations; plugin/pirax-form-test/README.md Releasing; test/plugin/README.md Re-audit gate/release fixtures; test/forms/README.md prerequisites (unchanged scope). Skill `/home/rudi/.pi/agent/skills/implement-issue/ponytail.md` and worker-protocol.md. Inspect workflow, notify/watchdog/publish/privacy, release/build, artifact scanner and their tests. Copy existing disposable publication fixture/local bare remote and mutation interception, not a new auth fake. B reproductions: leaf review-evidence-B/{prepublication.test.ts,watchdog-branch.ts} and logs. Check pinned action destination code/docs read-only; review-A quotes its exact rule. Do not read environment files or use the lessons index as pass input.

## 4. Change list and needed interfaces

Own `.github/workflows/reaudit.yml`; necessary `scripts/{release-plugin,build-plugin}.ts`, `scripts/reaudit/{privacy,publish,notify,watchdog}.ts`; affected `tests/reaudit-{workflow,decide,operations,publish,privacy}.test.ts`, `test/plugin/release.test.ts` and fixture-copy lists (including dependency-free workflow fixture). Change only necessary files. Reuse scanEvidence/findSecret/secretValues rather than a second redactor. New release imports must remain dependency-free and present in all disposable fixture copies. Own root/plugin/native-test guides and correction to `learnings/history/2026-10-07-workflow-attempt-artifacts.md` if needed; preserve historical case while adding dated clarification. Other guides need changes only if made stale. Optional review-A Nits are deferred. No parallel worker; broad checks share `implementation/native-check.lock` with B.

## 5. Do-not, reasons and exceptions

- Never open, print, copy, edit or create `.env`/`.env.*`; load credentials only via Bun's env-file loader at registered repo path. Scoped Bun children use --no-env-file. Do not expose real values in output/assertions.
- No real main push, tag/release, workflow dispatch, secret rotation, live mail, paid acquisition or client changes: existing live acquisition/mail proof is enough. Intercept every GitHub mutation in publication tests; read-only authenticated queries remain real.
- Do not weaken assertions, invent authentication/operational proof, widen callbacks or change production pins/key/version. Keep original reports/evidence intact; use new evidence paths.
- Do not modify source or HEAD during a broad check. Wait for terminal exit before reporting success; never return a final 'waiting' message. Launch long checks in a separate setsid/nohup session with exit capture, then poll until complete.
- No root-checkout edits, worker removal, lifecycle calls or scope expansion. Return a concrete mismatch and smallest correction if necessary; only B's revised brief authorizes the exception. These boundaries protect credentials, remote state and verification attribution, not just style.

## 6. Ordered steps

1. Install dependencies with frozen lockfile; derive regressions from section2, show red before changing code. Retain safe red logs.
2. Repair workflow/summary extraction and rerun docs; repair release pre-mutation scan and fixture dependencies; repair watchdog branch observation. Keep changes minimal and reuse existing interfaces.
3. Run focused green checks and typecheck; inspect docs/history claims. Assert booleans rather than private values. Then run the configured changed command below under the shared lock on immutable source/HEAD.
4. Preserve/scan new native/forms evidence before returning, refusing environment files/symlinks. Exact11-byte `local trace` fixture placeholders may be omitted with counts, not genuine traces. Commit only this chunk once checks pass; report actual tested tree and commit, including any doc-only difference. Advisory ~15 files/~65 turns; report an evidenced mismatch if larger, not a premature completion.

## 7. Commands

Use Node24.21.0 and native gh2.101.0 first on PATH (avoid ~/.local/bin/gh):
`/home/rudi/.local/share/mise/installs/node/24.21.0/bin:/home/rudi/.local/share/mise/installs/gh/latest/gh_2.101.0_linux_amd64/bin`.

Configured changed command (not a substitute focused subset):
```sh
export AKROGON_BASE=4e929fca0a8c793f2189454091fb5c0fcf74a1da
: "${AKROGON_BASE:?AKROGON_BASE is required}" && bun test
```
Build first. Load prerequisites through `bun --env-file=/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/.env` spawning the command with inherited loaded environment. It currently discovers the whole suite (~50min), but B still owns final suite separately. Hold `implementation/native-check.lock` for broad checks, capture log AND terminal exit. Install/build logs need no private environment. Required typecheck: bun run typecheck. Focused fail-first/green commands are additional, not replacements.

## 8. Done-when, evidence and report

All four Fixes addressed, clean committed worker tree, actual configured terminal result, typecheck result, safe red/green artifacts and retained privacy scan. Report before/after commit IDs, files/reasons, exact commands/counts/exits, evidence paths, limitations and deferred Nits. Post-merge workflow/release/mail/elapsed proofs remain unverified. Publication probe output is synthetic interception evidence, never real publication. Do not return until the report and check exit files actually exist.

Changed files and reasons: <paths and why>
Tests run: <commands and results>
Known limitations: <limitations or none known>
Unverified criteria: <criterion and why, or none>
