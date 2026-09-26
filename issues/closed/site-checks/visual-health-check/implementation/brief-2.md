## 1. Goal

Complete only the remainder of capture/health/compare unit after its worker hit provider quota before reporting. Worktree `/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/worktrees/visual-health-check`; leaf `/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/open/site-checks/visual-health-check`. Preserve landed implementation; do not restart unit. D2–D7.

## 2. Numbered acceptance criteria

1. Fix observed targeted suite failure: health fixture compares URL-sorted failedRequests against a fixed order, but ephemeral port ordering varies. Preserve exact membership and deterministic normalization, remove test-only port order assumption. Red evidence exists in `implementation/unit-1-validation.log`: 23 pass/1 fail, missing asset vs transport URL order.
2. Remove leftover debugging console output (`shoot`/`validate` selector timing) from capture tests. Verify all 24 targeted tests and typecheck. Inspect remaining source for unfinished local debugging changes.
3. Return complete unit evidence including changed files/reasons, tests/results, actual trace/PNG artifact paths, limitations and unverified criteria. Raw health shape, named report/Forms interfaces, browser GET-only behavior and strict masks remain intact. Summarize exports for next worker.

## 3. Read-first list

- `implementation/brief-1.md` for original unit contract only; `implementation/unit-1-validation.log` for actual remaining defect.
- `src/{capture,health,compare}.ts`, `src/report/model.ts`, `tests/{capture,health,compare}.test.ts`, package/tsconfig diff.
- `README.md` existing patterns; `/home/rudi/.pi/agent/skills/implement-issue/ponytail.md`.

## 4. Change list and needed interfaces

Existing uncommitted files are landed unit 1 implementation, not yours to discard. Expected fix in `tests/capture.test.ts`, only change production modules if concrete defect discovered. capture exports VIEWPORTS/openCaptureSession/combineMasks/MaskSelectorError; health normalizeHealth/parseHealth/evaluateHealth; compare comparePng; report typed RunReport and Manifest. Dependencies and Chromium already installed.

## 5. Do-not, reasons and exceptions

Never open/print/write `.env` or `.env.*`. No live site/R2 use, no whole suite, no commits/lifecycle calls/user questions/subagents. No weakening acceptance to hide defects, no changed health sorting contract just to match random ports. Return mismatch with evidence if interface/scope change needed; only B revised brief allows it. Reasons: preserve secret isolation, original scope and meaningful verification; exception only authorized revision, not opportunistic rewrite.

## 6. Ordered steps

Read landed files/log; fix exact order-dependent expectation and debug output (criteria 1/2); run targeted tests/typecheck; write complete return (criterion 3). Expected ~1–3 code files and report, under 20 turns. No need to reconstruct inaccessible red outputs from the interrupted worker: explicitly distinguish B's preserved red log from new green verification.

## 7. Commands

`AKROGON_BASE=0663984e0d80887123298bd43d6768e1cc2cbbf9 bun test tests/health.test.ts tests/compare.test.ts tests/capture.test.ts`

`bun run typecheck` is permitted; no bare bun test. Repeat targeted capture tests if needed to demonstrate nondeterministic-port defect fixed.

## 8. Done-when, evidence and report

Save full return to authoritative `implementation/worker-2.md`, including export signatures for commands worker. Keep trace/screenshot paths from successful actual browser tests. State all unit-level remaining limitations/unverified claims honestly; WordPress and R2 are later units.

Changed files and reasons: <paths and why>
Tests run: <commands and results>
Known limitations: <limitations or none known>
Unverified criteria: <criterion and why, or none>
