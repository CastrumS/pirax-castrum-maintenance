## 1. Goal

Implement production plugin core/settings/marker/mail/build and its targeted real WordPress tests (plan D1–D5, D12; AC1–AC3/AC6/AC8). One unit only; native form adapters/cron entry scanning belong to the next worker.

## 2. Numbered acceptance criteria

1. `bun run build:plugin` generates only the uploadable `dist/pirax-form-test.zip`, rooted at `pirax-form-test/`, from an explicit production allowlist. It installs/activates via real wp-admin browser upload without GF or FF requirements. No tests, credentials, licensed sources or dependencies in ZIP.
2. Settings → Pirax Form Test requires real `manage_options` on render/save and valid nonce for mutation. Admin can save token/one redirect; non-admin, missing/invalid nonce, invalid redirect and CRLF addresses cannot mutate. Both options `pirax_form_test_token` / `pirax_form_test_redirect` autoload off. Clearing token disables behavior. Guarded uninstall removes options and owned event(s).
3. Actual PHP tests in WordPress cover marker parsing on scalar/nested fields, secret literal escaping, id `[a-z0-9]{6,32}` without truncation, email suffix, empty/wrong token ordinary, exact secret malformed/ambiguous IDs unsafe. Define and document APIs for next worker; no request-level scan of arbitrary keys/cookies/query.
4. Actual `wp_mail` through test mu-plugin in marked context redirects every recipient and strips Cc/Bcc including folded continuation/header arrays, prefixes subject exactly once and replaces correlation header. Ordinary context untouched; stacked worker context restores correctly. Bad redirect fails before marking/delivery, never silently falls back. No production mail sender or REST endpoint.
5. Tests derived before code; red/green evidence plus real browser trace for installation/settings. Targeted tests green and no secret retained.

## 3. Read-first list

- `/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/open/site-checks/form-helper-plugin/plan.md` (ACs and D1–D5/D12; implementation notes).
- Same leaf `design.md`.
- Same leaf `implementation/worker-1.md` for current interfaces/evidence.
- `/home/rudi/.pi/agent/skills/implement-issue/ponytail.md`.
- Existing `test/plugin/harness.test.ts`, `harness.ts`, `fixtures.php`, `artifacts.ts`, and `package.json` as native test pattern.

## 4. Change list and needed interfaces

Own `plugin/pirax-form-test/pirax-form-test.php`, `includes/settings.php`, `includes/marker.php`, `includes/mail.php`, `uninstall.php`, `scripts/build-plugin.ts`, `test/plugin/core.test.ts`. Consolidate small files only if it preserves clear adapters APIs; explain. Bootstrap must allow later `includes/gravity-forms.php`, `fluent-forms.php`, `compatibility.php`, `cleanup.php` without requiring absent files in this unit. Add activation/deactivation lifecycle wiring (cron callback implementation next unit). Use namespaced or consistently prefixed symbols.

Need stable parser result (`ordinary|marked(id)|invalid-marker`), settings validation/read access, request marker context and push/pop worker-context APIs, plus adapter registration/lifecycle extension points. Return these in report. No custom schema needed.

Harness `startHarness({run})` provides `h.php<T>(code)` returning PHP return value after wp-load via Playground API; `h.browser(name)`, `h.uploadPlugin(page, zip)`, `h.mail()`, `h.closeBrowser(context)`, `h.saveEvidence()`, `h.stop()`, fixture form IDs/admin/editor/subscriber. GF and FF are installed in existing harness; for clean-install absent-plugin criterion you may deactivate via real WordPress APIs then upload plugin in a fresh site. User credentials are harness fixtures, auth is real. Build ZIP before upload. Avoid concurrent PHP executions with browser mutations; harness serializes direct php calls only.

`package.json` reserves build script already. System zip/unzip exist. Keep all runtime artifacts ignored. Load credentials only with Bun --env-file; do not read/change any env file.

## 5. Do-not, reasons and exceptions

- Do not implement form adapters/integration compatibility/entry sweep logic yet; only core interfaces and lifecycle so work stays sequential. Do not hardcode synthetic FORM_TEST_TOKEN in production, send mail directly, add REST endpoint or edit form/security plugin code.
- No lifecycle commands, commits, full suite or files under worktree `issues/`. Write report only in authoritative leaf below.
- Never open/print/write `.env`/`.env.*`; credential commands load registered repo environment via Bun. Do not leak token or licensed ZIP path in errors/traces. No live sites/mailbox/R2.
- Do not mock auth; use real login/capability/nonces for user-facing tests.
- A conflicting requirement/API/scale needs a mismatch with evidence and smallest correction, not scope/interface change; only a revised brief from B is an exception.

The reasons are safe scoped ownership, secret privacy and native evidence; exceptions require B's revised brief and never authorize auth mocks or secret exposure.

## 6. Ordered steps

1. Derive core.test.ts with build/upload, real settings authorization, parser/context and final wp_mail criteria before implementation; capture red.
2. Implement minimal settings/bootstrap/uninstall and explicit build allowlist, drive install/settings browser flow.
3. Implement parser/context/mail and edge cases through actual WordPress; no mocking WordPress functions.
4. Run targeted test until green; report APIs, commands, retained trace and limitations. Leave integration/entry acceptance for worker 3.

Advisory size: ~8 files under 60 turns; beyond that return scale evidence rather than silently dropping checks.

## 7. Commands

`AKROGON_BASE=93cf3b7f6b99f3a34be7f69c004345c439fa6a76 bun --env-file=/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/.env test test/plugin/core.test.ts --timeout 180000`

Build as needed, but no whole-suite run.

## 8. Done-when, evidence and report

Write `/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/open/site-checks/form-helper-plugin/implementation/worker-2.md` with actual results/red-green, artifact path, exact exported APIs and reasons for consolidation. Code only in `/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/worktrees/form-helper-plugin`.

Changed files and reasons: <paths and why>
Tests run: <commands and results>
Known limitations: <limitations or none known>
Unverified criteria: <criterion and why, or none>
