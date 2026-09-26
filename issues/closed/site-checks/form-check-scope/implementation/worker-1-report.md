# Worker 1 report: designated-form scope end to end

Worktree: `/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/worktrees/form-check-scope`, base `0a7ddf98806ede20a331cd2d68e073e89741648e`. Nothing is committed. Nothing ran against a live site, no helper was enabled, and no `.env` file was opened or printed. Values were loaded only through `bun --env-file=.env`. Evidence logs are in `<leaf>/implementation/worker-1-evidence/` (leaf = `/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/open/site-checks/form-check-scope`). Generated runs are in the gitignored `runs/` and `artifacts/` directories of the worktree.

**Status: every criterion is implemented. The resolved changed-test command passes: final run exit 0, 212 pass / 0 fail, 1238.19 s.** An earlier full run exited 1 with 211 pass / 1 fail. The single failure was the untouched `tests/report.test.ts` Chromium render stalling on a `file://` navigation, and six reruns passed (details under "Full suite"). `bun run typecheck` exits 0. `loadSites()` offline returns 13 sites, 12 designated, downstairs none.

## Changed files and reasons

| Path | Why |
| --- | --- |
| `src/sites.ts` | D1. Exports `TestForm = {page; plugin: 'gravity'\|'fluent'; id: number}` and optional `Site.test_form`. A strict nested check runs after page normalization. `page` must exactly equal a listed path; `plugin` must be gravity or fluent; `id` must be a numeric safe integer, with no string coercion. Unknown members and non-mapping shapes (null, array, scalar) raise `SitesConfigError` naming the slug and `test_form` or `test_form.<member>`. When `test_form` is absent the key stays absent; no default is inserted. |
| `src/report/model.ts` | Adds `skipped` to the `FormResult` outcome union. No schemaVersion bump and no new required fields. |
| `src/report/manifest.ts` | The shared forms whitelist, used by both manifest modes, accepts `skipped`. Other unknown outcomes still reject. |
| `src/report/html.ts` | D4. `formStatus(skipped)` is `pass`, which is neutral for aggregation. The forms-only table renders the literal `skipped` with a neutral (uncoloured) cell class. Both report modes add the footer "Skipped forms were intentionally not filled or submitted: neutral for status, not delivery evidence." In check mode it appears only when a Forms column exists. |
| `src/forms/runner.ts` | D2/D3 gate in the shared `scanPageForms`, which both `check` and `forms` use through `populateForms`. Signatures are unchanged. After a successful discovery, the gate selects the first descriptor in discovery order where `plugin` matches and `pluginId === String(id)`, and only when `listedPage.path === test_form.page`. Every other descriptor becomes `skipped` straight from discovery: no context, inspection, credential read, submission ID or typing. The reason is "No test form configured", "Not the designated test form on this page" or "Duplicate of the designated test form (only the first is attempted)". The selected descriptor keeps the full existing pipeline. There is no retry or fallback and no global state. If the designated page scans successfully with no match, the gate appends `{selector: 'test-form:<plugin>:<id>', plugin, outcome: 'failed', detail: 'test form not found'}`. Scan/navigation failures are unchanged, and GF detection is not broadened, so `gform_0` stays ineligible. |
| `sites.yaml` | All 12 commented `test_form` lines are uncommented verbatim. The intro comment now explains scope, omission and the account-form caution. downstairs has no designation. Pages and `form_helper: false` flags are unchanged (diff: 15+/14-, comments and uncommenting only). |
| `sites.example.yaml` | Adds an illustrative contact designation, with comments: omission skips every form, helper false never submits, never designate login/registration. |
| `README.md` | Updates the intro, the Site list YAML, the `test_form` rules and TS types, the error field examples, the report listing of skipped forms, and the Form checks text (only the designated form is filled; helper false; one confirmed ID per site; unknown/`gform_0` always skipped). Adds a `skipped` row to the outcome table. Adds a new "Designated test form" subsection covering selection, duplicates, no fallback, omission, the exact missing result, scan failures, the per-invocation limit (no cross-run lock), account-flow caution and what skipped means. Updates the lazy-credentials text. |
| `test/forms/README.md` | Documents the browser scope matrix, the native scope pages, the four CLI scenarios, the FF scope run, check using the same selection, the exact mail-delta oracle, one default CLI deadline with a revised time budget, the evidence layout `cli/<scenario>/…`, and the exits/laziness notes. |
| `tests/sites.test.ts` | AC1/AC7. Covers valid string-page and object-page designations, absence, `id: 0` loading per the schema, exact-path membership (unlisted, missing trailing slash, case, query, number, null, missing), plugin (unknown, case, null, missing), id (fraction, quoted string, null, bool, inf, array, unsafe integer, missing), an unknown member, malformed shapes and a slug other than acme. Also pins the committed 12 assignments exactly (including instrukcijezasve → `/kontakt/` GF #4), downstairs having none, and all helpers false, all offline. The example list must contain a designation. |
| `tests/report.test.ts` | The outcome rendering list includes `skipped`. A new test checks skipped-only is `pass`, the literal and explanation render, check manifest parse and approval accept it, a skipped + not-verified mix is a warning, and unknown `passed` rejects. |
| `test/forms/report.test.ts` | The exhaustive outcome map includes `skipped: "pass"`, and mixed skip gating keeps each other outcome's effect. Both manifest modes accept skipped and reject `skip`/`Skipped`/`passed`/empty. Forms HTML renders skipped with a neutral class and the footer. The local headless Chromium render shows skipped. The real-R2 approval case uses a check with skipped forms, and the published forms run includes skipped. |
| `test/forms/browser.test.ts` | Retained scanner tests now select explicitly: traps, captcha, `/multi` per designation, and upload/ambiguous-FF/constrained/IMAP-preflight. New matrix tests are listed below. |
| `test/forms/fixtures.php` | Adds a second native GF (`ids.scope`, made by the existing `$make`, which clones the base form and its two notifications) and pages `scopeA`/`scopeB`. Each page renders base GF + scope GF + FF through the existing shortcodes. No packaged-plugin change. |
| `test/forms/harness.ts` | Fixture types gain `scope`, `scopeA` and `scopeB`. `siteFor(urls, helper, test_form)` takes an explicit designation, where `undefined` means none, never a default, and supports multi-page sites on one origin. Adds `designate(url, plugin, id)`. `cli(workspace, root, site, scenario)` gives each scenario its own `cli/<scenario>/{package,runs,cli.log}`, which keeps the "exactly one report" assertion. |
| `test/forms/playground.test.ts` | Every native case designates one form, and `only()` asserts all others are skipped. The mail oracle is now exact: the delta must equal two tagged notifications per submission ID and nothing untagged. Covers: helper-false with two sites in one `runForms`; negative as 5 separate designated scans; required and ajax as separate GF/FF designated scans; an FF scope `runForms` over both pages with a short deadline; the CLI scenarios none, missing, helper-false and selected; and `check` over both scope pages at both widths with the CLI's selection. |

## Tests run

All commands ran from the worktree. Setup was `mise exec node@24.21.0 -- bun install` (289 packages), then `bun run build:plugin` (`dist/pirax-form-test.zip`, sha256 `121ff952…dc2dc`); Playwright chromium-1243 was already installed.

### Fail-first (new tests against the unchanged base source)

1. `bun --no-env-file test tests/sites.test.ts tests/report.test.ts test/forms/browser.test.ts`: **exit 1, 48 pass / 14 fail** (`worker-1-evidence/red-1-unit-browser.log`). The 14 red tests fail for the intended reasons. The old loader throws `test_form: unknown key` for every schema case, the committed list and the example. The old `formStatus(skipped)` is `warning`. The old runner filled or submitted every form: the two-page run gave `gravity:failed, gravity:failed, fluent:failed, unknown:unsupported…` on both pages, duplicates were both attempted, and omission gave `not-verified`/`unsupported`. The failing tests were the omitted, second-page, helper-false same-number, missing, duplicates, designated `/multi`, the 5 schema tests, the committed-list and example tests, and the report skipped test. The tests that passed on old code guard preservation or future regression: the unchanged security tests, and independent sites / second invocation.
2. `bun --no-env-file test test/forms/report.test.ts -t "forms-only manifest|form outcome gating"`: **exit 1, 5 pass / 3 fail** (`red-2-forms-report-units.log`).

### Green

3. After the schema and report changes: the same sites/report command gave 40 pass / 2 fail. The 2 were the committed-list and example tests, which waited for step 5. The forms report unit subset gave 8 pass / 0 fail (`green-2-schema-report.log`).
4. After the runner gate: `bun --no-env-file test test/forms/browser.test.ts`: **exit 0, 20 pass / 0 fail** (`green-3-browser.log`, evidence `runs/forms-browser-cc8415d6-a464-4b53-ac7a-9e4199b17aa3`).
5. After `sites.yaml`/example: `bun --no-env-file test tests/sites.test.ts tests/report.test.ts`: **42 pass / 0 fail**.
6. `bun run typecheck`: **exit 0** (clean after two test-typing fixes).
7. `bun --no-env-file -e 'import {loadSites} from "./src/sites.ts"; …'`: `{"sites":13,"designated":12,"downstairsHasDesignation":false}`, offline.
8. Native run 1, before the final check-selection refinement: `mise exec node@24.21.0 -- bash -c 'node --version; bun --env-file=.env test test/forms/playground.test.ts'` gave **exit 0, 7 pass / 0 fail, 485.15 s** (`native-1-playground.log`, `runs/forms-playground-004571e2-e544-4b4c-9604-fa09b440fcdf/summary.json`).
9. **Native run 2 (final test file)**, same command: **exit 0, 8 pass / 0 fail, 195 expect() calls, 496.75 s** (`native-2-playground.log`). Node v24.21.0. Summary: `runs/forms-playground-84962d93-1a36-4e5f-8164-8f54ce23ef80/summary.json`. Scoped root `test/forms-native-2026-09-26T20-21-30.028Z-6b8fd693/`: cleanup `ok`, 42 deleted, 0 remaining. Privacy scan: 109 files, 46 archives unpacked, 0 unsafe. GF 3.1.2 / FF 6.2.14 / WP 7.1.2 / PHP 8.3. Native ledgers: `artifacts/plugin/forms-checker-2026-09-26T20-21-30-030Z/`.
10. The resolved changed-test command, run verbatim from the worktree (Node 24 stays first under `bash -lc`: running `node --version; which node` through the same `mise exec node@24.21.0 -- env … bun -e 'Bun.spawn(["bash","-lc",…])'` structure printed v24.21.0 from the mise Node 24 install):

    ```sh
    mise exec node@24.21.0 -- env AKROGON_BASE=0a7ddf98806ede20a331cd2d68e073e89741648e bun --env-file=.env -e 'const p=Bun.spawn(["bash","-lc",": \"${AKROGON_BASE:?AKROGON_BASE is required}\" && bun test"],{stdout:"inherit",stderr:"inherit",env:process.env}); process.exit(await p.exited)'
    ```

    See "Full suite" below for both runs.

### Full suite

- **Run 1** (`worker-1-evidence/changed-tests-full.log`, 20:29:58Z–20:51:06Z): **exit 1, 211 pass / 1 fail**, 2635 expect() calls, 212 tests across 20 files, 1267.97 s. The one failure was `tests/report.test.ts › local report renders all embedded images and inert hostile text in real Chromium`, which hit its 30 s timeout. This change did not touch that test; its code path changed only by the added check-mode footer string. Its retained trace (`runs/2026-09-26T20-30-34.532Z/report-browser.trace.zip`) shows `page.goto(file://…/index.html)` never reached `load` and was aborted (`net::ERR_ABORTED`) when the test's `finally` closed the context. Just before it, Bun printed `killed 1 dangling process` after the unchanged `tests/capture.test.ts`. Reproduction (`worker-1-evidence/flake-1-report-render.log`): `mise exec node@24.21.0 -- bun --env-file=.env test tests/report.test.ts` passed 3/3 (10 pass each), and `… test tests/capture.test.ts tests/report.test.ts` in suite order passed 3/3 (31 pass each). I made no code change for this.
- **Run 2, final** (`worker-1-evidence/changed-tests-full-2.log`, run after only a README time-budget text change, 20:53:26Z–21:14:04Z): **exit 0, 212 pass / 0 fail**, 2643 expect() calls, 20 files, 1238.19 s. Retained evidence:
  - native `runs/forms-playground-9d67ddb4-b417-4059-b705-11d4cae68b4a/summary.json`: selected CLI exit 1 in **305,544 ms**, 1 ID (`d2w5mlva8jqd`), 2 mails. none/missing/helper-false exit 0/1/0 in 3,082/3,108/4,583 ms. check exit 1. R2 cleanup 42 deleted / 0 remaining. Privacy 109 files, 46 archives, 0 unsafe. Ledgers in `artifacts/plugin/forms-checker-2026-09-26T20-54-04-209Z/`. Selected report `cli/selected/runs/2026-09-26T20-56-30.804Z/index.html`; check report `check/2026-09-26T21-01-50.148Z/index.html`.
  - forms report `runs/forms-report-tests-f94b4e11-e90b-4079-a55e-ef99cd4172d5/summary.json`
  - collision `runs/forms-collision-57259395-af96-4284-99b9-8e403ae65eeb/synthetic-folder-collision/summary.json`
  - browser `runs/forms-browser-3cf39486-48a5-42dd-9e1b-cb692dd5ff0a/`
  - report render `runs/2026-09-26T20-54-02.209Z/index.html`
- Privacy: a value-free scan loaded variables through `bun --env-file=.env` and printed only per-name counts. It found 0 files with any of the 15 credential/configuration values (raw, URL-encoded or JSON-escaped) and 0 signed-URL markers across all 10 files in `worker-1-evidence/`.
- `bun run typecheck` after the final edits: exit 0 (`worker-1-evidence/typecheck.log`).

### Native scenario evidence (focused native run 2, item 9; paths relative to `runs/forms-playground-84962d93-1a36-4e5f-8164-8f54ce23ef80/`)

Each CLI argv is `[/home/rudi/.local/share/mise/installs/bun/1.4.2/bin/bun, run, forms, local, --sites, <ws>/cli/<scenario>/package/sites.json]`, cwd `<ws>/cli/<scenario>/package`. The package script runs `test/fixtures/cli.ts` (production dispatch, scoped `createStore({root})`).

| Scenario | Designation / helper | Exit | Elapsed | Outcomes (scopea / scopeb) | Mail/entries/feeds | Report · manifest · traces |
| --- | --- | --- | --- | --- | --- | --- |
| `none` | none / true | 0 | 3,174 ms | 3 skipped / 3 skipped | unchanged | `cli/none/runs/2026-09-26T20-23-33.921Z/{index.html,manifest.json,report.trace.zip,remote-index.html}`; forms traces: 2 scans only |
| `missing` | `/checker-scopeb/` gravity 999999 / true | 1 | 3,104 ms | 3 skipped / 3 skipped + `test-form:gravity:999999` failed `test form not found` | unchanged | `cli/missing/runs/2026-09-26T20-23-41.598Z/…`; 2 scans only |
| `helper-false` | `/checker-scopeb/` gravity 1 / false | 0 | 4,489 ms | 3 skipped / not-verified, skipped, skipped | unchanged | `cli/helper-false/runs/2026-09-26T20-23-49.274Z/…`; 2 scans + 1 form |
| `selected` | `/checker-scopeb/` gravity 1 (base GF, on both pages) / true | 1 | **305,516 ms** (one default deadline; detail says "within 300 s") | 3 skipped / failed (native GF confirmation + IMAP timeout), skipped, skipped | **1 tagged ID (`x6m77ux8pk9d`), exactly 2 notifications, redirected; entries and feeds unchanged after helper cleanup** | `cli/selected/runs/2026-09-26T20-23-58.310Z/…`; 2 scans + 1 form |

In every scenario, the remote `index.html` bytes equal the local ones, and the scoped keys are exactly `index.html` and `manifest.json` (manifest last). The remote HTML was rendered as local content in headless Chromium (trace on, video off) and checked for the visible outcome sequence, the skipped reasons, `test form not found`, and `local — pass/failure/warning`.

Other native cases, each with the exact mail-delta oracle:
- helper false: two sites in one invocation (`warnings/2026-09-26T20-22-16.327Z/`), giving `gravity:not-verified, fluent:skipped` and `gravity:skipped, fluent:not-verified`. Exit 0, warning. Mail/entries/feeds unchanged. Only index and manifest were put, with no baseline access.
- negative: 5 designated runs, giving unsupported (upload), unsupported (no marker), rejected (client), rejected (server), then FF failed (confirmed) with 1 ID and 2 mails.
- required: GF and FF helper-false fills leave everything unchanged. Helper-true confirmations: 2 IDs, 4 mails.
- ajax: GF AJAX and FF AJAX designated separately, 2 IDs, 4 mails.
- FF scope `runForms` (`fluent-scope/2026-09-26T20-23-23.261Z/`): scopea `skipped, skipped, failed`, scopeb all skipped. 1 ID, 2 mails, exit 1.
- `check` (`check/2026-09-26T20-29-17.662Z/`): both pages captured and `same` at desktop and mobile. Outcomes: scopea all skipped, scopeb `failed, skipped, skipped`. 1 ID, 2 mails, exit 1.

### Browser regression matrix (`test/forms/browser.test.ts`, headless, trace on)

- Omission with helper true and helper false, and no form/mail env: 6 detected forms per page skipped, including unknown search, a GF password form and `gform_0` login. Zero input/change events, no POST, no exception. Traces show only discovery contexts.
- Designation on the second listed page, in both page orders: the first page is all skipped. Only `#gform_2` on `/scope-b` is attempted: exactly 1 POST, confirmed, then a truthful IMAP failure. Traces show 2 scans + 1 form visit.
- Helper false with the same-number GF #2 / FF #2 / GF #1: the selected form is `not-verified`, and the recorder sees typing only in that form. The positive control is non-empty. 0 POST.
- Missing id, wrong plugin, identity present only on another page, GF #0 and an empty page each give exactly one `test form not found` on the designated page and no failure elsewhere. They need no credentials and send 0 POST. Challenge and 404 remain a single `page-scan` failure.
- Duplicates: only the first instance is attempted (1 POST). A rejected first instance never falls through (1 POST). An identity change gives failed with 0 POST. A designated password form is unsupported with 0 POST and no typing.
- Distinct sites and a second invocation: each keeps its own single attempt (2 POST per invocation).

## Known limitations

- The limit is at most one attempt per site per invocation, not exactly-once across invocations or processes. There is no cross-run lock or persistent deduplication (plan scope).
- A designation names a plugin/id/page, not a business purpose. Ordinary-looking account integrations cannot be recognized, so operators must choose contact forms. Existing unsupported gates stay the backstop.
- The browser matrix reaches confirmed submissions through the runner with an **unreachable loopback IMAP port**. `pollDelivery` returns a truthful `IMAP connect failed` without mocking authentication. The real production 300 s mailbox deadline is exercised only by the native `selected` CLI scenario.
- Playground logs mail rather than transporting it. The native evidence proves submission, isolation, entry and feed cleanup, and counting, not delivery. No SMTP selftest ran, as the plan does not require one.
- The browser recorder observes `input`/`change` events, which is what Playwright fill/check/select dispatch. It is not a generic DOM-mutation oracle. Skipped means the checker did not fill or submit the form; page scripts and asset GETs during discovery still run.
- `id` validation uses `Number.isSafeInteger`, stricter than a plain integer check. It rejects integers that YAML cannot represent exactly, such as `9007199254740993`. Zero and negative ids load (the plan puts no positive-only restriction on the schema) but can never match a detected form.

## Unverified criteria

None of the acceptance criteria is unmet. Two things are unverified by design, because live-site runs were forbidden:

- The 12 committed designations were uncommented verbatim from the operator's comments. I did not check that each live page actually renders that plugin/id. If one is wrong, the next real run reports `failed: test form not found` for that site and never falls back to another form. The loader and exact-assignment tests only prove that the list is well formed and matches the operator's lines.
- Delivery of a designated submission to the real mailbox is unverified: Playground logs mail instead of sending it, and the selected CLI truthfully times out. SMTP/IMAP delivery remains covered only by the existing `mail:selftest`, which I did not run.

Fail-first evidence covers the sites, report and browser tests, as brief step 1 requires. I did not run the native Playground scenarios against the old runner, because it would submit all six scope-page form occurrences per run, each followed by its own 5-minute production mailbox deadline.
