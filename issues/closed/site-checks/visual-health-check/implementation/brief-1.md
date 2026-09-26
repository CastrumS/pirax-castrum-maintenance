## 1. Goal

Implement one unit: typed browser capture, raw/baseline-relative health and PNG comparison (plan D2–D7), with dependency setup and targeted tests. Worktree: `/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/worktrees/visual-health-check`. Authoritative leaf: `/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/open/site-checks/visual-health-check`.

## 2. Numbered acceptance criteria

1. Capture full-page PNGs at desktop 1440x900/mobile 390x844, device scale 1, headless Chromium, trace on/no video. Bound navigation 30s/networkidle 15s/lazy scrolling 15s; scroll down/back, disable animations/transitions/caret. Combine site/page CSS masks. Invalid CSS is configuration error; no match warning. Real fixture verifies masks, height, readiness, and trace artifact.
2. Observe main status/final URL, critical WP phrase, console errors/pageerror, resource >=400 responses and transport failures. Persist exact raw shape below. Existing baseline console/message or failed URL/status pairs become warnings; new ones fail; HTTP >=400/critical/mixed always fail. Report failed connection/403/explicit challenge as blocked and avoid false positives for normal CAPTCHA/Cloudflare text.
3. GET-only browsing: serviceWorkers block, abort nonGET HTTP requests and label policy warnings, not asset server errors. TLS errors not ignored except explicit internal fixture option. Mixed detection combines browser requests/diagnostics/resource attributes; HTTPS HTTP links alone aren't failures.
4. PNG comparison uses pixelmatch threshold .1, site ratio default from loader. Changed iff ratio > allowance for equal dimensions; dimension differences always changed with both dimensions and padded diff, no crash. Corrupt PNG fails explicitly.
5. Export report contracts below for next unit, including optional Forms slot. Meaningful targeted tests demonstrate red then green. A real Bun fixture capture uses Chromium and retains trace/report-like screenshot artifact under runs/.

## 3. Read-first list

- Leaf `plan.md` D2–D7 and A2–A5/A8/A9 (scope context); `design.md`.
- Worktree `README.md`, `src/sites.ts`, `src/env.ts`, `src/store.ts`, `package.json`, `tsconfig.json`, `bunfig.toml`.
- Existing pattern `tests/sites.test.ts` (Bun targeted tests); `tests/discovery.test.ts` exclusion must survive.
- `/home/rudi/.pi/agent/skills/implement-issue/ponytail.md`.

## 4. Change list and needed interfaces

Own `src/capture.ts`, `src/health.ts`, `src/compare.ts`, `src/report/model.ts`, targeted `tests/{health,compare,capture}.test.ts`, `package.json`, `bun.lock`, and `tsconfig.json` setup. Add playwright dev dependency, pixelmatch/pngjs and types; install Chromium. Defer Playground dependencies to later harness unit. Add DOM lib and test/ inclusion if needed, retain strictness.

`HealthSnapshot = {status:number|null, finalUrl:string, criticalError:boolean, consoleErrors:string[], failedRequests:{url:string,status:number|null}[], mixedContent:string[]}`. Deduplicate/sort; do not drop URL query distinctions. Capture returns raw health, image/dimensions when usable, blocked/error state, readiness/policy warnings and local trace path. Export an explicit browser/session/capture interface usable sequentially by command functions with injected artifact directories. Imports must not launch browser/read env.

Report exports `RunReport {runId:string,sites:SiteResult[]}`, site slug/url/ordered pages, page path/pageKey/results for both named viewports plus `forms?:FormResult[]`. FormResult exactly `{selector:string,plugin:'gravity'|'fluent'|'unknown',outcome:'delivered'|'delivered-spam'|'not-verified'|'rejected'|'unsupported'|'failed',detail:string}`. Viewport results carry separate capture state, visual state (`same|changed|missing-baseline|error|not-compared`), dimensions/ratio, health findings with severity, warnings and relative artifact paths. Manifest is versioned `{schemaVersion:1,command:'check',report:RunReport}`. Keep clean concrete types, no speculative framework; document exact exports in return for next worker.

## 5. Do-not, reasons and exceptions

- Never open/print/modify `.env` or `.env.*`; dependencies/tests need no secret values. No production sites or R2 mutations for this unit.
- No forms execution, mail, updates, discovery, lifecycle calls, git commits, whole-suite run or edits under worktree issues/. Reports/sub-briefs belong to authoritative leaf only.
- Do not weaken existing config/storage APIs. Return mismatch with code evidence if plan/interface conflicts; only a revised B brief authorizes scope changes.
- No screenshot or browser mocking as acceptance evidence; pure health/PNG units may use constructed data. Use real local GET fixtures for browser behavior.

Reasons: secrets stay private, workers stay isolated, locked scope and real-browser evidence remain trustworthy. Exceptions only via revised B brief; test-local fixture setup is allowed, live-site mutations are not.

## 6. Ordered steps

1. Derive failing health and PNG tests (criteria 2/4) before implementation and record red results.
2. Set up package/tsconfig and report types (criterion 5).
3. Implement health/comparison modules, rerun targeted tests to green.
4. Derive local-browser tests, implement capture, retain actual trace and verify criteria 1/3.
5. Run targeted tests/typecheck; write report with all four required contents and interface details.

Advisory size: ~10 files, under 60 turns (at least four per file); larger real scope returns evidence/mismatch rather than silently dropping criteria.

## 7. Commands

No configured changed-test runner exists. Base `AKROGON_BASE=0663984e0d80887123298bd43d6768e1cc2cbbf9`.

`AKROGON_BASE=0663984e0d80887123298bd43d6768e1cc2cbbf9 bun test tests/health.test.ts tests/compare.test.ts tests/capture.test.ts`

Dependency/browser setup `bun install`, `bunx playwright install chromium` and affected typecheck `bun run typecheck` are permitted. Do not run bare bun test; B owns the full suite.

## 8. Done-when, evidence and report

All criteria verified or specific mismatch returned. Save your report to authoritative `implementation/worker-1.md`; paste red/green outputs, exact exports, and retained runs/ trace/screenshot paths. Do not just claim done. No delegation, commits, phase calls or user questions.

Changed files and reasons: <paths and why>
Tests run: <commands and results>
Known limitations: <limitations or none known>
Unverified criteria: <criterion and why, or none>
