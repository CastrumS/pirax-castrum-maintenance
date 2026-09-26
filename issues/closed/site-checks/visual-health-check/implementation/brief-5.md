## 1. Goal

Finish one documentation unit for the implemented visual/health checker (plan checklist step 5). Worktree `/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/worktrees/visual-health-check`; authoritative leaf `/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/open/site-checks/visual-health-check`. No code feature work.

## 2. Numbered acceptance criteria

1. README no longer claims foundation-only/no browser/no commands. Setup correctly distinguishes production Bun+Chromium from integration-only Node 24/OpenSSL/real R2/downloads. Show baseline/check/approve and --sites usage, 0/1/2, before/after manual updates, masks/widths/tolerance, readiness and GET-only limits. Document missing/corrupt baselines, new vs known health findings, unconditional failures, exact latest remote approval semantics and nontransactional writes.
2. Document private self-contained report/MIME/manifest layout, seven-day bearer-link sensitivity versus global last-ten pruning, local runs/traces, optional Forms rendering but no form execution. Keep existing loader/storage API and caveats accurate. New selftest instructions accurately describe pinned versions, VISUAL_NODE or mise exec node@24 (do not change global Node), isolated test root and finally cleanup, retained summary/report/trace paths and Playwright trace viewing. Explain no paid plugins/Docker/host PHP/wp required.
3. Record the evidenced reusable Playground bridge incident as one active lesson line plus history: Node Buffer transfer installed malformed plugin bytes; a served-page marker/readback exposed the false fixture. UTF-8 installation with exact readback and a served marker fixed it. State evidence from worker-4 without overgeneralizing all RPC byte APIs. Preserve no-auth-mock/no-env-file safety.
4. Audit documented commands/API against actual files and run only targeted usage tests. Return changed paths/reasons, command results and limitations. Agent docs: none exist or are affected; don't invent an AGENTS/AREA/config file.

## 3. Read-first list

`README.md`; authoritative `plan.md` (including Implementation notes), `implementation/worker-4.md`, `implementation/worker-3.md`; `package.json`; `src/commands/{common,baseline,check,approve}.ts`; `src/report/{model,writer}.ts`; `scripts/visual-selftest.ts`; `test/wp/{playground.ts,blueprint.json}`; `/home/rudi/.pi/agent/skills/implement-issue/ponytail.md`. Existing pattern: README Storage selftest section. Lessons is output here, not pass input; B established its current content is only `# Lessons`.

## 4. Change list and needed interfaces

Own only `README.md`, `learnings/LESSONS.md` (append active line), `learnings/history/2026-09-25-visual-health-check.md`. No source/package/site/env/config edits. Commands: bun run baseline/check slug|all, approve slug [pagePath], --sites optional; visual:selftest invokes bun --env-file=.env scripts/visual-selftest.ts. Compatible runtime examples: `mise exec node@24 -- bun run visual:selftest` or `VISUAL_NODE=/path/to/node24 bun run visual:selftest`. Read final worker evidence for exact pinned versions and current limitation wording.

Lesson case evidence: worker-4's `unit-4-integration-third.log` and failed `runs/visual-selftest-2026-09-25T16-44-41.594Z/summary.json`; authoritative worker report and bridge/plugin source; final successful artifact path from worker-4. Use repo-relative history link from active lesson; distinguish ignored local evidence from committed source.

## 5. Do-not, reasons and exceptions

Never open/print/write `.env` or `.env.*`; documentation may name variables without values, keep existing env setup instructions. No full suite, network integration rerun, source edits, subagents, commits, lifecycle calls, user questions or worktree issue artifacts. Don't claim forced storage-network-failure testing or full production-site reliability; docs must reflect actual evidence/limitations. If source contradicts locked design, report mismatch with evidence rather than quietly patch it; only revised B brief allows scope change. Reasons: documentation accuracy, ownership and private credentials; exceptions only authorized revised scope, not speculative improvements.

## 6. Ordered steps

Read actual surfaces and worker return; update README (criteria 1/2); write factual lesson/history (3); audit scripts/paths and run targeted CLI tests (4); write return. About three files, under 20 turns; no manufactured red test for documentation-only edits. Preserve useful existing API documentation rather than replacing it with marketing text.

## 7. Commands

No changed-test runner configured. `AKROGON_BASE=0663984e0d80887123298bd43d6768e1cc2cbbf9 bun --no-env-file test tests/commands.test.ts`

`git diff --check`; file/path/script audit. B alone runs the final full suite and real selftests.

## 8. Done-when, evidence and report

Save authoritative `implementation/worker-5.md` with command result and documentation changes/reasons. No credentials or signed URLs in documentation/evidence. State code-level limitations are documented, not repaired or newly verified by this unit.

Changed files and reasons: <paths and why>
Tests run: <commands and results>
Known limitations: <limitations or none known>
Unverified criteria: <criterion and why, or none>
