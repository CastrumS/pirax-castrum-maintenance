# Plan: form-check-scope

## Context and grounding

Slot B, direct `plan.synthesis` (`state.yaml` has `debate: "no"`); no positions or rebuttals exist or are required. Authoritative brief/design/state are in this leaf; implementation belongs only in `issues/worktrees/form-check-scope`.

`akrogon config` was read. Configured blocking checks are `bun run typecheck` and `bun test`; implementation is subagents. Grounding is `none`: there is no configured index/AREA resource. Use the repository README and its linked forms/plugin test guides instead; this is a grounding gap, not an invented index. `learnings/LESSONS.md` was read as case-derived background; no history was needed to establish a new claim. The design's installed standing-design file exists and was read. Its permission to read secrets does not override this seat's prohibition on opening environment files.

The dependency **form-check is already present** at checkout `0a7ddf9` (including its review repairs). No further issue ordering is required. Relevant live facts:
- `scanPageForms` currently revisits/fills every recognized descriptor; `populateForms` scans each listed page exactly once for both commands.
- Discovery supplies plugin plus string `pluginId`, recognizes positive native IDs, and does not duplicate overlapping selectors. Separate instances with the same plugin/id can still exist.
- `formStatus` currently treats every non-delivered/non-failure outcome as a warning. `formsOk` in `src/report/manifest.ts` has an explicit outcome whitelist; changing only the type/renderer would break approval/publication readers.
- Native fixtures currently put GF + FF on the primary page and tests expect both to submit. The CLI test waits two real five-minute deadlines. Those assumptions must change without dropping adapter/negative coverage.
- There are 12 commented designations among 13 committed sites; downstairs has none. All helper flags are false. instrukcijezasve selects contact GF #4, not its listed login/registration page.

### Read first

- This leaf's `brief.md` and `design.md`.
- `/home/rudi/.claude/skills/chart-issues/assets/standing-design.md`.
- `README.md`: Site list, Form checks, private reports, configuration and limitations.
- `test/forms/README.md` and `test/plugin/README.md`: real harness, mail observer, runtime, evidence/privacy and cleanup.
- `learnings/LESSONS.md`.
- `src/sites.ts`; `src/forms/{detect,runner,fill,submit}.ts`.
- `src/report/{model,manifest,html}.ts`; `src/commands/{check,forms}.ts`.
- `tests/{sites,report}.test.ts`; `test/forms/{browser,playground,report}.test.ts`; `test/forms/{harness.ts,fixtures.php}`.
- `sites.yaml` and `sites.example.yaml`.

## Acceptance criteria (fixed before deriving tests)

**AC1 — configuration.** Optional `test_form` is a strict mapping with exactly required `page`, `plugin`, `id`. Page must exactly equal a normalized listed page path; plugin must be gravity or fluent; id must be a numeric integer. Omission is valid. Invalid page/plugin/noninteger/nested unknown key and malformed/missing members throw `SitesConfigError` naming the site and relevant field. Valid string-page and object-page entries load.

**AC2 — one authorized attempt.** In either production command, each site can fill/attempt only its designated plugin/id on its designated listed page, once. The same form on other pages, other recognized forms on that page, and duplicate matching instances are never filled/submitted. Failure/rejection/unsupported designation does not authorize a fallback or retry. Independent sites and independent invocations are not deduplicated against one another.

**AC3 — no designation/missing designation.** With no `test_form`, every discovered form is `skipped`, with zero checker fill events/submissions. With a configured identity missing on the designated page, discovered forms are skipped and one explicit `failed` result has detail exactly `test form not found`. Finding that identity elsewhere does not satisfy the designation. Discovery/navigation failure stays an explicit operational failure, not fabricated evidence that a form was absent.

**AC4 — helper false and existing safety.** A supported designated form with helper false is filled/validated, returns `not-verified`, and never submits; all other forms are untouched. Existing unsupported/password/upload/CAPTCHA, identity, marker, request-policy, IMAP-preflight and redaction gates remain intact. Skipped forms require no form/mail credentials and do not reach inspection/fill/submission. Login/registration forms on the committed excluded page remain untouched.

**AC5 — reports.** Both manifest modes accept/render `skipped`. It is a neutral intentional exclusion (pass for aggregation, not delivery success), produces no warning/failure by itself, and is explicitly explained as not filled/submitted. Existing warning/failure outcomes and approval selection remain unchanged. Missing designation yields failure/exit 1; skips alone yield exit 0 when publication succeeds.

**AC6 — native end-to-end evidence.** Two real Playground pages each render the same two distinct Gravity forms and one Fluent form. A scoped `bun run forms local --sites <generated-list>` designating one form produces one native submission, with the five other form occurrences skipped. Assert exactly one fresh submission ID in the redirected mail delta (the existing fixture has TWO notifications per submission, not one), expected recipient/header isolation, and before/after native entry counts/rows unchanged after helper cleanup, with feeds unchanged. No-designation and missing-ID runs produce no new mail/entries/feeds; helper-false produces none either. Keep report/manifest, sanitized headless Playwright traces and summary. Playground logs rather than transports mail, so the designated confirmed submission truthfully becomes `failed` after the production 300-second IMAP deadline; the CLI exits 1 and the test succeeds by asserting this, never by inventing delivery. Exercise the same selection through `check` while preserving both visual widths.

**AC7 — operator list and checks.** All 12 commented assignments become exactly those real fields, downstairs has none, all existing pages/helper flags remain unchanged, and committed configuration loads offline. `bun run typecheck` and full `bun test` pass, with the pre-existing safety/adapter coverage still substantive.

## Decisions

**D1 — literal schema, no discovery-based choice.** Export `TestForm = { page: string; plugin: 'gravity' | 'fluent'; id: number }` from `src/sites.ts` and add `test_form?: TestForm` to `Site`. Validate the strict nested shape after pages normalize, preserving an absent optional field rather than inserting a default designation. Use a numeric integer check (no string coercion); the brief does not mandate a positive-only schema restriction. Match `String(test_form.id)` against the detector's canonical ID; IDs the detector cannot recognize simply cannot designate a detected form. Do not broaden native detection to make GF #0 eligible. No guessed contact form, first-form default, URL-title heuristic or CLI override.

**D2 — gate before any per-form work.** Keep existing exported scanner/populator interfaces. After successful discovery, find the first descriptor in discovery order whose plugin/id matches the configured tuple, only if `listedPage.path === test_form.page`. Process that descriptor at most once; every other descriptor returns `skipped` directly from discovery, without an extra context, preflight inspection, credential read, submission ID or typing. This includes unknown/ambiguous nonselected forms: omission means all found forms are skipped, not unsupported warnings. The designated descriptor retains all current preflight/fill/submit behavior. Consume selection by descriptor index before work, not after success; duplicate instances never become retries.

Validated site pages/slugs are unique and `populateForms` already visits each once, so exact designated-page gating plus one selected index provides the per-site/per-invocation bound without global state, persistent deduplication, new options or coordination. A second invocation starts fresh. Do not remove pages or suppress discovery to enforce scope; every occurrence remains reportable.

**D3 — precise missing result.** After successful discovery on the designated page only, if no descriptor matches, append a synthetic `FormResult` with configured plugin, a safe identity-bearing selector such as `test-form:<plugin>:<id>`, outcome `failed`, and exact detail `test form not found`. This also applies to an empty designated page and a plugin mismatch with the same numeric ID. Keep skipped discoveries in their original order. Do not add this result to other pages or conflate an inaccessible/challenged page with verified absence. If the selected form disappears/changes in its fresh context, keep the existing identity-changed failure and never fall back.

**D4 — skipped is neutral, not verified.** Extend the type and shared manifest whitelist with `skipped` without bumping schemaVersion or adding required fields to existing report records. `formStatus` maps it to pass for aggregation, but render the literal outcome and a clear reason (`No test form configured; not filled or submitted.` or `Not the designated test form on this page; not filled or submitted.`). Explain the neutral mapping in report help/operator docs; it is not a claim that delivery passed. Keep unknown outcome rejection and backward compatibility of old manifests.

**D5 — preserve designation and safety boundaries.** Uncomment the operator's selections verbatim; never enable helpers or visit production sites during verification. The locked design's “exactly one” is an **at-most-one attempt** rule: unsupported/missing/helper-false forms must not be forced into submission. Brief language about filling a designation does not override existing safety preflights. Login/registration forms are excluded by the deliberate contact designation and existing unsupported password/custom-flow gates; do not add site-specific account creation support or plugin changes.

**D6 — adapt tests rather than bypass scope.** Native fixture tests that used to exercise GF and FF in one scan become separate explicitly designated scans/invocations, each still checking its intended adapter/negative result while the other descriptors are skipped. There is no test-only bypass enabling all forms. Retain native required-field, AJAX, client/server rejection, hidden-upload/no-marker, mail isolation, entries/feed cleanup, IMAP preflight and secret sanitation assertions. A rejected selection must leave other forms skipped, with continuation demonstrated by a separate selected site/run rather than by falling through to another form in the same site.

Extend fixture PHP with two dedicated scope pages using existing native form creation/shortcodes, two distinct GF IDs and one FF ID; existing primary/ajax/negative/required pages can stay to minimize unrelated churn. Update fixture type and served/readback checks. Assert mail by unique tagged submission IDs plus exact notification delta and native entry snapshots; zero remaining entries alone cannot count submissions because the helper deletes them. Do not install new entry hooks that could trip the helper's audited integration allowlists, weaken those allowlists, or change the packaged plugin. Existing observer data and native entry queries are sufficient combined evidence.

**D7 — real CLI, isolated remote state.** Reuse the disposable package CLI adapter pointing at production dispatch and `createStore({root})`; never use the unscoped root alias against the live list. Extend CLI evidence layout to give each scope scenario a distinct workspace/subdirectory so its current “exactly one report” assertion stays valid. Selected CLI now waits one default deadline (>=300 seconds, not >=600); short internal deadlines remain allowed for other API cases, never a production timeout override. Every remote mutation is under the fresh test root, cleaned/listed-empty in finally. Keep action-only sanitized forms/admin traces, no video, no signed URL retention, and local artifacts after remote cleanup.

## Interfaces and ordered file/criterion checklist

Implement sequentially; schema/report model must exist before runner/tests consume them. Native verification needs fixture and runner changes, but no external issue is waiting.

1. [ ] `src/sites.ts` — D1 schema/type/normalization/errors (AC1).
2. [ ] `tests/sites.test.ts` — valid/absent mapping; exact path membership (including object page, trailing-slash mismatch), unknown member, malformed/null/array/missing members, bad plugin and noninteger/string IDs; all failures name the slug. Add explicit offline assertions for all 12 committed assignments and downstairs (AC1, AC7).
3. [ ] `src/report/model.ts` — add outcome, no unrelated model changes (AC5).
4. [ ] `src/report/manifest.ts` — allow skipped in both modes, retain strict rejection of unknown outcomes (AC5).
5. [ ] `src/report/html.ts` — neutral skipped aggregation and report explanation (AC5).
6. [ ] `tests/report.test.ts` — check-mode render/parse/status coverage for skipped alongside legacy outcomes (AC5).
7. [ ] `test/forms/report.test.ts` — update exhaustive outcome map; forms/check manifest validation, mixed skipped/warning/failure gating, private browser-rendered skipped report and approval compatibility through existing scoped R2 cases (AC5).
8. [ ] `src/forms/runner.ts` — D2/D3 selection, skip and missing behavior shared by both commands; keep public signatures and safety pipeline unchanged (AC2–4).
9. [ ] `test/forms/browser.test.ts` — select explicitly in old scanner tests whose point is filling/IMAP/preflight; add real local-browser scenarios below. Keep low-level fill/submit security tests (AC2–4).
10. [ ] `test/forms/fixtures.php` — native scope pages with 2 GF + 1 FF each; no packaged-plugin changes (AC6).
11. [ ] `test/forms/harness.ts` — typed scope fixture IDs/pages, explicit designation support in `siteFor` (never silently default an omitted designation), multi-page sites and scenario-isolated CLI workspaces (AC6).
12. [ ] `test/forms/playground.test.ts` — refactor old all-forms expectations into designated cases and add scope CLI/check scenarios with summary/mail/entry evidence and privacy cleanup (AC2–7).
13. [ ] `sites.yaml` — 12 exact uncommented assignments; update introductory scope comment; preserve helper flags and pages (AC7).
14. [ ] `README.md` — affected human/agent grounding doc: introduction, site YAML/type, command behavior, selection/omission/missing/duplicate handling, neutral skipped outcome, lazy credentials, one-attempt timing, helper and account-flow cautions.
15. [ ] `sites.example.yaml` — affected operator-facing example: add an illustrative contact-page designation and explain that omission skips every form; helper false still means no submission.
16. [ ] `test/forms/README.md` — affected human/agent test guide: new native scope scenarios, one default CLI deadline, revised time budget and exact artifacts/oracles, retained adapter cases and safety limitations.
17. [ ] No dedicated agent instruction file is affected (none found); no changes to `test/plugin/README.md`, packaged plugin, screenshots, health checks, mail transport or storage algorithms are planned.
18. [ ] Run verification below and record exact commands/results/artifact paths in implementation evidence; do not commit generated evidence.

## Concrete verification

### Browser regression matrix

Use the existing real loopback server and headless Chromium, no authentication mocks. Instrument browser events/DOM observations without replacing scanner/filler/submission behavior. Retain sanitized traces.

- Three recognized forms on two pages, target the second listed page: first page all skipped; only chosen plugin/id on second page is filled/submitted. Reverse page order as a second case. Include same-number GF/FF IDs so plugin is material.
- Omitted designation with helper true and with helper false, form/mail environment absent: all detected forms (including unknown/search and a password/login fixture) skipped, no fill/change events or POSTs, no configuration exception.
- Explicit supported designation with helper false: selected not-verified, other forms retain untouched/default fields and zero events, no POST. Browser observation must establish no nonselected typing, not just absence of mail.
- Missing ID, wrong plugin, identity present only on another listed page, and empty designated page: one exact missing failure on target page, zero fills/submissions. Discovery challenge/navigation failures remain scan failures.
- Duplicate same plugin/id instances: first selected descriptor is the only attempted instance; every other is skipped. Rejected/unsupported/identity-changed selected form never falls through to its duplicate or another form.
- Distinct sites with the same form ID each remain eligible, and a second invocation remains eligible; no module-global suppression.
- Selected login/password/custom flow stays unsupported by existing inspection, never filled/submitted; nonselected account forms always skip. Keep the committed instrukcijezasve assignment assertion independent of live network access.
- Existing selected-form request policy and IMAP-before-click checks still reach their intended code; tests must not accidentally pass because omission now skips everything.

### Native scenario matrix

Use the two repeated scope pages and fixture identifiers, no live sites. For a selected GF CLI run require six report records: one truthful confirmation-plus-mailbox-timeout failure and five skipped. Validate exactly one tagged mail identity, expected two notifications, unchanged entries/feeds after cleanup, and private published HTML/manifest equality. Native FF selection is separately exercised with a short internal API deadline and the same selection/count oracle, preserving FF adapter coverage without another five-minute CLI wait.

Run separate CLI scenarios for no designation (six skipped, exit 0), missing ID (six skipped plus missing failure, exit 1), and helper false (one not-verified plus five skipped, exit 0). Each has zero mail/entry/feed delta and its own report/trace paths. For `check`, establish local Playground baselines for the two scope pages and run the designated selection through production `runCheck`: both widths remain captured/same and forms still yield one submission/five skips. Existing helper/negative/AJAX cases use explicit separate designations, not broadened authorization.

Render the retained report in Playwright and assert visible skipped labels/detail and truthful selected failure. Trace is on, headless Chromium, no video. Summary links `runs/forms-playground-<uuid>/.../index.html`, manifests, forms/report traces and sanitized `artifacts/plugin/forms-checker-<stamp>/` mail/entries/feed ledgers; assert cleanup zero and privacy scans pass. Record actual generated paths, not these placeholders.

### Commands

Current Bun is 1.4.2. Default Node is 26.8.2, while compatible Node 24.21.0 is already installed via mise; do not change the global Node version. Dependencies are not yet installed in this fresh worktree. Run setup under the compatible runtime, e.g. `mise exec node@24.21.0 -- bun install`, then `bunx playwright install chromium` if needed and `bun run build:plugin`. No environment file is opened/copied/edited.

1. `bun --no-env-file test tests/sites.test.ts tests/report.test.ts test/forms/browser.test.ts`
2. `mise exec node@24.21.0 -- bun --env-file=.env test test/forms/playground.test.ts`
3. `bun --env-file=.env test test/forms/report.test.ts`
4. `bun run typecheck`
5. `mise exec node@24.21.0 -- bun --env-file=.env test` (the full configured `bun test` suite, explicitly loading private values). Budget the full native suites; do not shorten deadlines to make them pass.
6. `bun --no-env-file -e 'import {loadSites} from "./src/sites.ts"; const sites=loadSites(); console.log(JSON.stringify({sites:sites.length,designated:sites.filter(s=>s.test_form).length,downstairsHasDesignation:!!sites.find(s=>s.slug==="downstairs")?.test_form}))'` — expect 13/12/false, no site visits.

A separate SMTP selftest is not required by this leaf: no transport implementation changes. Full credential names are nevertheless checked below. Existing plugin suites remain blocking in the full test run.

## Credential preflight and blockers

On 2026-09-26, ran Bun from this worktree with `--env-file=.env`, checking only `process.env[name] === undefined` and printing name plus present/absent. All were **present**:

`FORM_TEST_TOKEN`, `FORM_TEST_ADDRESS`, `IMAP_HOST`, `IMAP_PORT`, `IMAP_USER`, `IMAP_PASSWORD`, `IMAP_FOLDER`, `IMAP_SPAM_FOLDER`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `GRAVITY_FORMS_ZIP`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_ENDPOINT`, `S3_BUCKET`.

This expands the brief's inherited IMAP/SMTP/S3 groups using the existing guides; the locked design adds no new credential. No values or environment-file contents were inspected or retained. Presence is not validation, licensed-ZIP existence, connectivity or authentication proof; existing harness preflight and real tests establish those. No human-only blocker found. If a required prerequisite is unavailable during execution, record the exact operator action and fail the phase rather than skipping tests or inventing a delivered result.

## Open limitations and scope notes

- At-most-one checker attempt per invocation is not exactly-once delivery across multiple independent invocations/processes. There is no cross-run lock or persistent deduplication in this leaf.
- A designation identifies plugin/id/page, not an audited business purpose. Operators must select contact/inquiry forms, never account flows; ordinary-looking custom account-creation integrations cannot be inferred safely from arbitrary DOM. Existing unsupported gates and helper attestation/rollout restrictions remain necessary, and this leaf does not certify previously unaudited integrations.
- Discovery still permits initial GET assets and bounded initialization. Unrelated arbitrary site JavaScript/GET side effects, delayed forms, unsupported CAPTCHA/phone widgets and a missing/misconfigured live helper remain existing safety/coverage limits. Skipped means the checker did not fill/submit that descriptor, not proof the whole page has no side effects.
- Playground's mail observer proves isolation and native processing/cleanup, not transport delivery. One attempt can generate multiple notifications; unique IDs plus exact mail delta and native entry snapshots are the combined count oracle.
- No locked-scope disagreement is reopened. Interpret “exactly one” as the design's at-most-once authorization, preserve failure/unsupported outcomes, and keep the inherited plugin/mailbox architecture unchanged.

## Implementation notes — 2026-09-26, repair round 1

- Review B F1 refines D3/AC3 and checklist item 14 only: the README's report-format paragraph must say an empty successful scan is `[]` only on a page without the site's designation; an empty designated page produces `failed: test form not found`. Preserve the correct scanner, outcomes and existing regression assertions. This is documentation repair, not a changed locked decision.
- Review A has no Fix. Its three optional Nits (unreachable runner guard, prose-sensitive assertions and test helper name shadowing) are deferred to avoid unrelated runtime/test churn in a one-paragraph documentation repair; they have no demonstrated behavior defect. `implementation/brief-2.md` owns the repair and verification; the original brief's README step is clarified accordingly.
