# Unit 1: designated-form scope end to end

## 1. Goal

Implement the single vertical feature in plan decisions D1–D7: per invocation and site, only one designated plugin/id on one listed page may be filled/attempted; every other discovered form is skipped. Worktree: `/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/worktrees/form-check-scope`. Authoritative leaf: `/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/open/site-checks/form-check-scope`. Base: `0a7ddf98806ede20a331cd2d68e073e89741648e`.

## 2. Numbered acceptance criteria

1. Strict optional `test_form: {page, plugin: gravity|fluent, id: integer}` schema. Page exactly matches a listed normalized path. Bad shape/missing/unknown members, unlisted page, wrong plugin and noninteger fail with slug/field. Absence stays valid.
2. Both commands attempt at most one selected descriptor on its designated page. Select first matching descriptor in discovery order; duplicates/other pages/plugins/forms skip before inspection, credentials or input. No fallback after failure. Unknown nonselected forms also skip. Independent sites/invocations remain independent.
3. No designation means all skipped/no typing/no submissions/no form-mail credentials. Missing designated identity after successful scan means discovered forms skipped plus one failed result with exact `test form not found`; navigation failure remains scan failure. Supported helper-false designation fills/validates but returns not-verified without submission.
4. `skipped` is neutral/pass aggregation, explicitly not delivery evidence; both manifest modes accept/render it, unknown outcomes still reject. Existing safety preflights and outcomes remain intact.
5. Native Playground: two pages each hold same two distinct GF and one FF forms. Selected CLI run yields one native submission/five skips; absent/missing/helper-false CLI variants yield zero submissions. Count one unique tagged mail ID with TWO fixture notifications, assert native entries and feeds unchanged after cleanup. Selected CLI truthfully fails after one real 300-second IMAP deadline because sandbox mail is logged, not transported. Scoped production check preserves both widths and same selection.
6. Preserve adapter/negative/AJAX/required-field/IMAP/request-policy/privacy tests by selecting explicit identities in separate scans, not bypassing scope. All 12 committed designations uncomment verbatim, downstairs none, helper flags/pages unchanged. Affected docs updated. Changed-test command passes with retained report/trace/summary and fail-first evidence.

## 3. Read-first list

Read the leaf `plan.md` and `design.md`, and `/home/rudi/.pi/agent/skills/implement-issue/ponytail.md`. Read README Site list/Form checks/report sections and `test/forms/README.md`, `test/plugin/README.md`. Inspect `src/sites.ts`, `src/forms/{detect,runner,fill,submit}.ts`, `src/report/{model,manifest,html}.ts`, `src/commands/{forms,check}.ts`, `tests/{sites,report}.test.ts`, `test/forms/{browser,playground,report}.test.ts`, `test/forms/{harness.ts,fixtures.php}`, `sites.yaml`, `sites.example.yaml`. Copy existing `SitesConfigError` validation and `scanPageForms` result/trace patterns; reuse scoped native harness. Open an index only on a gap (no grounding index configured).

## 4. Change list and needed interfaces

In plan checklist order: schema/tests; report type/parser/status/tests; runner/browser tests; native fixtures/harness/tests; site assignments and docs. Add exported `TestForm` and `Site.test_form?: TestForm`; keep scanner/populator public signatures. Compare descriptor pluginId to `String(id)`, no detection broadening for GF #0. Synthetic missing result identifies configured plugin/id safely. Helpers must not silently default an omitted designation. CLI helper needs per-scenario evidence directories to retain exactly-one-report assertions. Update README, sites.example.yaml, test/forms/README.md. About 16 files plus any tightly necessary test edits, no new dependency.

## 5. Do-not, reasons and exceptions

- Never open/print/append/write `.env` or `.env.*`. Run scripts needing values with `bun --env-file=.env`; only presence-by-name checks may print status. No secret values in logs/evidence. All inherited credential names were present at synthesis; if absent now, report exact missing names/action to B, not a request for pasted values.
- No live-site checks/rollout/helper enabling; only real disposable Playground and scoped R2. No auth mocks, plugin changes, allowlist weakening, new entry-observer hooks that violate audited integrations, screenshot/health changes or scope bypass. Mail identity delta plus existing native entry snapshots is the count oracle.
- No commits, lifecycle calls, changes to plan/locked design, or files under worktree `issues/`. Artifacts go in authoritative leaf implementation or gitignored runs/artifacts. Do not read/edit other issue worktrees.
- Return mismatch with actual evidence and smallest brief correction instead of changing scope/interfaces; only B's revised brief can authorize that. These exclusions preserve safety, test truthfulness and phase ownership; exceptions require that revised brief, not convenience.

## 6. Ordered steps

1. Derive focused AC1/AC2/AC4 regression assertions first in sites/browser/report tests; demonstrate the old runner/schema fails, retaining red output.
2. Implement schema and report pieces; demonstrate green for those assertions.
3. Implement minimal shared runner gate and missing result; browser coverage includes two-page repetition, plugin mismatch/same numeric IDs, omitted credentials, untouched nonselected fields/events, duplicate IDs/no fallback, independent sites and second invocation. Preserve low-level security tests.
4. Adapt native fixture types/pages and explicit designated scans, preserving each existing meaningful adapter/rejection assertion. Add four scoped CLI variants and production check; keep privacy scans/cleanup. Do not mistake zero remaining entries for zero submissions.
5. Update 12 assignments and the three affected docs; assert real list loads offline. Explain neutral skips, missing failure, at-most-once semantics and one CLI deadline. Repair-round clarification (2026-09-26, review B F1; execution belongs to brief-2): the README report-format paragraph must qualify `[]` for no-form pages with the designated-page missing-form failure exception. Do not change the correct runtime/test behavior.
6. Run the resolved changed-test command; repair within scope; write evidence report with actual artifact paths, pasted results, known limitations/unverified criteria. Tests use headless Chromium, trace on, video off.

Advisory: ~16 files, under 100 turns (at least four per file); if substantially beyond, return evidence-backed mismatch, not a hard stop or silent omissions.

## 7. Commands

Resolved configured changed-tests command (it currently resolves to `bun test`, not a narrower runner):

`mise exec node@24.21.0 -- env AKROGON_BASE=0a7ddf98806ede20a331cd2d68e073e89741648e bun --env-file=.env -e 'const p=Bun.spawn(["bash","-lc",": \"${AKROGON_BASE:?AKROGON_BASE is required}\" && bun test"],{stdout:"inherit",stderr:"inherit",env:process.env}); process.exit(await p.exited)'`

Ensure Node 24 stays first on PATH in test children (avoid login-shell resetting PATH: use `bash -c` rather than `-lc` if necessary without changing the resolved command). Setup if needed: use installed mise Node 24.21.0 for bun install/native addons, install Playwright Chromium, build plugin. Focused fail-first/green commands may select affected files/test names from this same Bun runner to establish regression evidence. B independently runs the full suite and all blocking checks after this unit; do not substitute a worker typecheck-only result for changed tests.

## 8. Done-when, evidence and report

All criteria implemented and meaningful regressions red then green, changed-test command recorded, no secret-bearing/raw evidence. Write `<leaf>/implementation/worker-1-report.md` before returning. Include exact commands/exit/results, native argv/cwd and actual summary/report/trace paths; list any unmet criterion honestly. If cut off, leave edits and report remaining work; do not reset them.

Changed files and reasons: <paths and why>
Tests run: <commands and results>
Known limitations: <limitations or none known>
Unverified criteria: <criterion and why, or none>
