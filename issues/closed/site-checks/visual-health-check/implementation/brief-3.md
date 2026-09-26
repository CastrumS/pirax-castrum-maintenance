## 1. Goal

Implement one unit: production baseline/check/approve commands and private static reports (D1, D5, D7–D10). Worktree `/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/worktrees/visual-health-check`; authoritative leaf `/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/open/site-checks/visual-health-check`. Consume unit 1's capture/health/comparison contracts; preserve them.

## 2. Numbered acceptance criteria

1. `bun run baseline <slug|all>`, `check <slug|all>`, `approve <slug> [pagePath]`, optional `--sites <file>`. Preflight arguments/selection/site config/env; config errors 2, failures 1, pass/warnings 0. Empty valid all selection is 0. Export functions with injected real Store/run/browser options for isolated harness; no import-time env/browser/process exits.
2. Baseline stores PNG+raw health pairs at `baselines/<slug>/<viewport>/<pageKey>.{png,health.json}` after complete capture. Blocked/incomplete doesn't overwrite. Raw health failures still fail baseline but usable artifacts persist. Check consumes baseline, never updates it, handles missing/corrupt baseline explicitly, continues other sites/pages and separates capture/visual/health failures.
3. Local `runs/<runId>/index.html` is escaped, self-contained inline CSS/data PNGs, baseline/actual/diff per width, dimensions and warning/failure/blocked details. Forms column only when optional forms supplied, renders exact typed outcomes. No unsigned relative R2 images or embedded signed links. HTML Blob content type is text/html.
4. Check uploads raw actual PNG/health, available baseline/diff assets and index under `reports/<runId>/`; versioned manifest uploaded last as completion marker, then `pruneReports(10)`, 604800s GET presign, print local path and URL. Failed checks still publish; publication/prune errors fail honestly and preserve local report. Traces stay local. Canonical timestamp run IDs.
5. Approve selects newest completed check containing site (not newest unrelated site), ignoring incomplete uploads. Validate manifest, site source URL, requested current page(s), both widths and all actual artifacts before any write. Promote exact actual PNG+health bytes from one run, remote-backed without local cache/recapture. No fallback for latest blocked/missing pages; malformed manifests fail, no history fails. Derive artifact keys safely rather than trust arbitrary manifest paths. Explicit promotion doesn't waive unconditional health failures.
6. Targeted tests prove configuration/selection, model/HTML escaping/Forms, image embedding, comparison/manifest paths and approval validation helpers. Red then green evidence. Real local report is opened with headless Chromium, trace on/no video and artifacts kept. Real R2 command acceptance belongs to next harness unit, not fake-store tests.

## 3. Read-first list

- Leaf `plan.md` D1/D5/D7–D10 and A1/A6–A10; `design.md`; `implementation/worker-2.md` (unit 1 completion after provider interruption).
- `src/{sites,env,store,capture,health,compare}.ts`, `src/report/model.ts`, `README.md`.
- Existing pattern `scripts/store-selftest.ts` for real Store and sanitised errors; `tests/env.test.ts` for no-secret subprocess tests.
- `/home/rudi/.pi/agent/skills/implement-issue/ponytail.md`.

## 4. Change list and needed interfaces

Own `src/commands/{common,baseline,check,approve}.ts`, `src/report/{html,writer,manifest}.ts`, `tests/{report,commands}.test.ts`, command scripts in `package.json`. Small evidence fixture/screenshot assets stay under ignored runs/. Worker 1 owns typed capture/health/compare; read its return for exports.

Existing APIs: `loadSites(path?): Site[]`, `pageKey(path)`, `readR2Config()` lazy, `createStore({config?,root?})`/`store` with put/get/list/presign/delete/pruneReports; roots scoped per harness. No Store changes expected. Use listing to distinguish missing keys from network/auth failure. Existing RunReport is runId/sites, SiteResult slug/url/pages, PageResult path/pageKey/viewports Record<desktop|mobile,ViewportResult>/optional forms; Manifest `{schemaVersion:1,command:'check',report}`. Every viewport has capture state/detail, visual state/detail/dimensions/ratio/allowance, health severity findings, warnings, relative artifact paths.

Expose shared CLI dispatch with dependency injection so harness can run it in a subprocess with a test-scoped real Store without adding production root/env bypass flags. A later tiny test wrapper imports this dispatcher and supplies scoped Store; normal CLI always uses production store. Source URL validation prevents approving another site's history after config URL change.

## 5. Do-not, reasons and exceptions

- Never open/print/write `.env` or `.env.*`. No production-site or production-R2 mutations. This unit may produce local fixtures only; next worker owns real R2 integration.
- No user questions, subagents, commits, lifecycle calls, full-suite runs, edits in worktree issues/, changed locked interfaces, forms/mail/updates/discovery/scheduling.
- Don't treat all S3 errors as missing baselines, trust arbitrary manifest paths, make bucket public, or embed signed URLs. These break safety/private reports.
- Return mismatch with evidence rather than change scope/interfaces; exception only B's revised brief. Tests may exercise pure data/validation, not claim mocked storage as acceptance.

Reasons: isolated ownership, private credentials/artifacts, correct baseline promotion. Exceptions are revised brief and local fixture setup only.

## 6. Ordered steps

1. Derive failing targeted report/command tests before code (criteria 1/3/5/6).
2. Implement report helpers/manifest validation, then shared CLI and three commands using existing module APIs.
3. Green targeted tests and typecheck; create and open actual local HTML in Chromium with trace.
4. Report exports needed by harness, exact CLI scripts, red/green results, artifacts, and limitations.

Advisory ~10 files, under 65 turns; return scope evidence if substantially larger.

## 7. Commands

No configured changed-test runner. `AKROGON_BASE=0663984e0d80887123298bd43d6768e1cc2cbbf9 bun test tests/report.test.ts tests/commands.test.ts`

Also `bun run typecheck`; a targeted real local report-browser check is allowed and required. Do not run bare bun test or store/visual selftests; B/final harness own those.

## 8. Done-when, evidence and report

Save authoritative `implementation/worker-3.md` with outputs/artifact paths and exact exported CLI/command signatures needed by next worker. All unit criteria verified or explicit mismatch. No unsupported claim of real R2 end-to-end acceptance yet.

Changed files and reasons: <paths and why>
Tests run: <commands and results>
Known limitations: <limitations or none known>
Unverified criteria: <criterion and why, or none>
