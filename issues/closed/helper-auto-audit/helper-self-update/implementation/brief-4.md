## 1. Goal
Close two concrete release CLI defects after unit3 lands, refining plan D7 without changing locked scope. Own worktree: /home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/worktrees/helper-self-update-u4 (B creates at landed leaf HEAD). No lifecycle calls, real publication or secret writes.

## 2. Numbered acceptance criteria
1. Source-parse diagnostics never expose signing material. Reproduced: with a generated test seed placed in both Version header and VERSION constant, --dry-run exits1 but stderr interpolates that seed before build scanning. B's release-source-error-red.json records only the boolean true. Add durable fail-first regression using generated keys and fix the error to name source/field only; no received secret-bearing output in matcher diagnostics.
2. Existing local/remote tags still refuse. A tag appearing between preflight and publication also prevents release creation: after signing/building, atomically create remote refs/tags/vVERSION at intended HEAD using GitHub create-reference POST; its existing-ref/auth/network error must fail before gh release create. Only after successful ref creation run `gh release create ... --verify-tag --latest --target HEAD` with the same three assets. No ref overwrite/delete and no release/asset clobber. Ref-success/release-failure leaves owned tag for explicit recovery, documented honestly.
3. Tests never perform that POST or release write on real GitHub. Strengthen mutation-intercept boundary BEFORE implementing new POST: forward only known read-only API calls to actual gh (authentication stays real), record and synthesize publication operations. Test success argv/order, simulated ref-exists/failed-claim and release-failure cases. No mocked authentication; these are publication-boundary tests, not evidence of remote writes. In no case does this leaf create a real tag/release.
4. Docs show precise native API + --verify-tag sequence and nontransactional recovery; remove false claim that plain gh release create refuses every concurrent tag. Add an explicitly filtered offline release-test command for dry-run/key/local-tag/source/privacy cases; unfiltered release suite still exercises actual GitHub auth. No skip/discovery changes. Keep key policy aligned with locked design: describe GitHub-secret delivery to the publishing job, not a newly authorized permanent operator-local copy (the externally supplied local value is a review note, not a design change). State that updater hooks require the helper active; deactivation removes their protection, just as administrator file replacement can bypass it.

## 3. Read-first list
Authoritative plan D7 and latest implementation notes, unit3 report/interface, scripts/release-plugin.ts, test/plugin/release.test.ts, plugin/pirax-form-test/README.md (Releasing), test/plugin/README.md (release tests), /home/rudi/.pi/agent/skills/implement-issue/ponytail.md. Copy existing disposable real-git checkout/test-key and mutation-recording boundary, not a second release implementation.

## 4. Change list and needed interfaces
Own scripts/release-plugin.ts, test/plugin/release.test.ts, plugin/pirax-form-test/README.md, test/plugin/README.md; root README only if new wording becomes stale. Needed native API: POST repos/CastrumS/pirax-castrum-maintenance/git/refs with ref=refs/tags/vVERSION and sha=HEAD, fail on nonzero; GH operation output contains only public refs/commits but errors must remain sanitized. Seed stripped using existing withoutSigningKey. Existing test gh wrapper currently forwards ALL `gh api` calls: it MUST first become read-only allowlisted, never allow a new write through. Existing remoteTag real GET tests remain. Prerequisite unit3 commit landed; no other worker edits these files.

## 5. Do-not, reasons and exceptions
Never open/read/write .env/.env.*; use Bun --env-file only and no values in logs. No actual GitHub write, test tag, secret set, force-push/ref update/delete, clobber, changed updater/compatibility or weakened acceptance. Mutation interception is explicitly allowed because actual publication belongs to another leaf; auth lookups remain real. Never print private seeded source/error in red evidence: assert/retain boolean leak detection only. Return evidence-backed mismatch rather than changing scope/interface; exceptions only revised brief. Exclusions protect remote repository, private material, fixed channel and independent tested code.

## 6. Ordered steps
1. Add red privacy and concurrent-claim tests with fail-safe write interceptor in place before production code can reach new mutation. Retain sanitized red evidence.
2. Remove value interpolation; implement atomic create-ref then verify-tag release, sanitized exit errors, no rollback or overwrite. Test publication failure residue contract and preserve missing/key/local/remote refusals.
3. Update accurate release/offline verification docs. Run targeted green, prebuild ZIP then configured changed tests in independent setsid group, retain completion marker and durable evidence. Commit/report after outcome, not merely waiting. Advisory 4–5 files under30 turns, not a hard cap.

## 7. Commands
bun install in worker, then bun run build:plugin before broad tests. Resolved changed command uses AKROGON_BASE=2689aaa3bd69a9a46cc77788fdc5219354cc923a and `: "${AKROGON_BASE:?AKROGON_BASE is required}" && bun test`, with registered environment loaded via bun --env-file=/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/.env. Use safe capture/seed stripping, independent setsid group, explicit exit marker. Targeted red/green release tests allowed; B owns final full checks.

## 8. Done-when, evidence and report
Commit and authoritative implementation/worker-4.md with actual command summaries, boolean-only red leak evidence, durable artifacts implementation/evidence-u4/ and limitations. No real write performed or claimed; publication remains boundary-tested until reaudit-job's first release.
Changed files and reasons: <paths and why>
Tests run: <commands and results>
Known limitations: <including tag-left-after-release-failure>
Unverified criteria: <criterion and why, or none>
