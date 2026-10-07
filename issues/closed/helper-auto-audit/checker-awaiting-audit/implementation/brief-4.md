## 1. Goal
Repair round 1 of checker-awaiting-audit at reviewed head `5250748af9f96d3d8c35eef78a4f8b602f81b3f8`: A F1 (truthful helper-dependent docs), B B1 / A N1 (owned mailbox oracle), plus A N2/N3 (reuse slug rule, disclose scan-error clearing). Worktree `/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/worktrees/checker-awaiting-audit-u4`. Do not reimplement the leaf.

## 2. Numbered acceptance criteria
1. README describes checker recognition conditional on a helper that emits `Pirax test blocked: awaiting audit of <Plugin label> <version>`. Explicitly state in-tree helper 0.2.4 still uses `Pirax test blocked: integrations could not be suppressed` for version mismatches, which remains rejected/exit 1 until an emitting helper is installed. Remove misleading old/older block terminology in both root and forms-test guides. No helper-code change or artificial sibling dependency.
2. Scanner mailbox test must count only activity belonging to the installed ImapFlow client. Retain real listener and confirmed-submission positive control, at most one authorized POST/no traps, awaiting outcome/version assertions, and zero actual checker mailbox connections for GF/FF awaiting scans. Add a deliberately unrelated real TCP probe during the awaiting interval; it must neither satisfy the positive control nor fail the no-polling assertions. Restore any observer/probe/listener in finally. No mocked auth/transport/poll result.
3. Retain fail-first evidence: B already reproduced the current failure with a real external process (expected connections16, received29, writes1, traps0). Derive an in-test negative-control case that fails before the oracle repair and passes afterward; retain the external repro green too.
4. Reuse the exact existing site slug regexp rather than copying it in state module, with unchanged validation behavior. Existing site/state tests must pass.
5. Docs explicitly state completed navigation/challenge/browser-launch scan failures clear the clock and can postpone continuous-audit aging, while those failing runs themselves still exit1. Config-error interruption/unvisited sites stay unchanged.
6. Configured changed-tests and targeted negative-control verification pass on committed repair; meaningful assertions are not weakened.

## 3. Read-first list
Authoritative `review-A.md`, `review-B.md`, `plan.md` repair notes; `README.md` awaiting section/limitations, `test/forms/README.md`; `test/forms/browser.test.ts:305–323`, `test/forms/awaiting-audit-commands.test.ts` owned connection observation, `test/forms/imap.test.ts` real unrelated probe pattern; `src/sites.ts`, `src/forms/awaiting-audit.ts`, `tests/sites.test.ts`, `tests/awaiting-audit.test.ts`; `/home/rudi/.pi/agent/skills/implement-issue/ponytail.md`. B reproducer is authoritative leaf `review-B-evidence/probe.py` and logs. Read helper version/message constants only to verify docs, no vendor/helper edit.

## 4. Change list and needed interfaces
Prerequisites landed: entire leaf at reviewed HEAD. Own `README.md`, `test/forms/README.md`, `test/forms/browser.test.ts`, `src/sites.ts`, `src/forms/awaiting-audit.ts`; modify `tests/awaiting-audit.test.ts` only if needed to prove shared boundary. Simplest N2: export existing `SLUG` from sites and import it in state module (no behavioral change). Mailbox observer must call real ImapFlow.connect unchanged, associate its local socket with peer remotePort, and preserve return. Use existing patterns, not a new framework. No other worker active; B waits for this committed repair.

## 5. Do-not, reasons and exceptions
No helper/production submission/state-semantics change, no dependency update, no relaxed assertions/deadlines, no fake auth, no live-site or unscoped R2 mutation. Never open/print/copy/write `.env`/`.env.*`; Bun loads privately. Never log credentials/bearer URLs; use synthetic assertion subjects. Do not touch registered-root lesson files A left for the operator, issue phase/state, or sibling worktree. Return mismatch with evidence instead of changing scope/interfaces; exception requires B's revised brief. Reasons: locked behavior and ownership remain valid; repair fixes evidence/docs, not the design. Only revised brief authorizes exceptions.

## 6. Ordered steps
1. Install dependencies frozen, select installed Node24 bin process-locally, install Chromium if needed, build helper ZIP for native tests.
2. Derive regression for unrelated probe before changing scanner oracle; capture red. B's external script can be run against current test process as documented in review-B.
3. Repair owned-connection oracle and cleanup, retain positive/negative tests. Update docs truthfully and reuse SLUG. Green targeted tests including external probe (same command with real unrelated socket traffic now passes).
4. Run exact configured changed-tests once; wait for real completion, then commit owned paths and fill `implementation/worker-4.md`. The print-mode harness will NOT auto-resume after a final response, so no unfinished background-test promises.
Advisory: 5–6 files, under 32 turns plus waits. Evidence/interface mismatch is a report to B, not silent incomplete return.

## 7. Commands
Configured changed-test command:
`AKROGON_BASE=2689aaa3bd69a9a46cc77788fdc5219354cc923a bash -c ': "${AKROGON_BASE:?AKROGON_BASE is required}" && bun test'`.
With Node `/home/rudi/.local/share/mise/installs/node/24.21.0/bin` first on PATH and AKROGON_BASE exported, load values via `bun --env-file=/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/.env -e 'const p=Bun.spawn(["bash","-c",": \"${AKROGON_BASE:?AKROGON_BASE is required}\" && bun test"],{stdout:"inherit",stderr:"inherit"});process.exit(await p.exited)'`. This configured changed command unfortunately IS the full suite; it must not be replaced with only filtered tests. Targeted red/green development tests are allowed. B runs final lane gates separately; no lifecycle commands by worker.

## 8. Done-when, evidence and report

Verification update from B at 20:53: the machine repeatedly suspended/resumed every ~30 seconds during the first configured run. `worker-4-evidence/suspend-journal.log` is direct systemd-suspend evidence; the run reports Chromium ERR_NETWORK_IO_SUSPENDED. B has now acquired a temporary process-scoped sleep+idle block inhibitor (no desktop configuration or timeout changes), released after final lane verification. Let the affected suite finish/cleanup, keep its failure evidence, then rerun the exact configured command with fresh browser processes under the inhibitor. Do not patch unrelated production code or weaken timeouts to accommodate suspension. Ensure all transient diagnostics in runner.ts are reverted (your committed diff already excludes them). Finish with actual successful retry evidence, or report a concrete remaining failure, never claim the interrupted run passed.
Committed repair plus authoritative `implementation/worker-4.md` with commit, each finding's resolution, pasted red/green/configured results and retained artifacts. Record actual exit, not merely command launch. Keep existing concurrent R2/first-observation/unreleased-helper limitations. No new native delivered-email claim.
Changed files and reasons: <paths and why>
Tests run: <commands/results and evidence>
Known limitations: <limitations or none>
Unverified criteria: <criterion/reason or none>
