# Plan: form-check

## Synthesis basis and readiness

Slot B, `plan.synthesis`, 2026-09-26. The authoritative `state.yaml` has `debate: "no"`; this is direct synthesis of the brief, locked design and live worktree, not a reconstruction of positions/rebuttals. Code inspected at `08fa818` in `issues/worktrees/form-check`. Only this plan is changed by this pass.

`akrogon config` reports `grounding: none`, no configured checks, and sequential subagent implementation. There is no configured grounding index or linked AREA to read; README and its plugin/testing links provide grounding. `learnings/LESSONS.md` was read as experience, not additional policy. Useful mechanisms are explicit PHP bridge result types, fixture readback, and preserving submission-time identity through asynchronous delivery.

Prerequisite implementations are already in this checkout: visual/report interfaces and the helper plugin, including the merged typecheck repair. There is no remaining inter-leaf ordering dependency. Implementation does need the report extension before command publication and the real fixture before end-to-end evidence.

### Credential presence (names only)

Ran the mandated `bun --env-file=.env -e` presence check in the worktree, printing only `present`/`absent`. All of these were **present**:

- `FORM_TEST_TOKEN`, `FORM_TEST_ADDRESS`.
- `IMAP_HOST`, `IMAP_PORT`, `IMAP_USER`, `IMAP_PASSWORD`, `IMAP_FOLDER`, `IMAP_SPAM_FOLDER`.
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`.
- Additional execution prerequisites: `GRAVITY_FORMS_ZIP`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_ENDPOINT`, `S3_BUCKET`.

No environment file was opened, printed or edited. Presence does not establish valid credentials, licensed ZIP version, mailbox folder/filter setup or network reachability; the real tests must establish those. There is no observed human-only blocker. If execution discovers one, record the failed criterion, required variable/action and acquisition source, and stop through the phase command rather than mocking, silently skipping, or asking in chat.

### Live-surface clarifications / review notes

- “Plugin's on-page confirmation” means the **form plugin's** rendered success element. Pirax Form Test deliberately adds no JavaScript, public endpoint or bespoke success marker. GF uses `#gform_confirmation_message_<form-id>`; FF uses a success message associated with the submitted form (`.ff-message-success`). A generic HTTP 200, another form's old message, or disappearance of a form is not confirmation.
- The design's mailbox interpretation wins over the older “messages carrying the secret token” wording: search the complete `[pirax-test <id>]` subject tag; do not search/send the raw token in mail headers.
- CAPTCHA scope follows the locked design and existing audited adapters: no solving or new bypasses. Known unsupported FF CAPTCHA mechanisms are `not-verified`; actual server-side validation/CAPTCHA refusals are `rejected` with a redacted message.
- The local Playground cannot deliver mail. Its redirect log is submission/isolation evidence, **not** `delivered`. Local CLI outcomes can correctly be `failed` after confirmation plus mailbox timeout; the separate real SMTP/IMAP test proves delivery. Do not add a production “logged mail means delivered” path.
- Current capture is deliberately GET-only and saves image/DOM traces. Do not weaken or reuse it for typed-secret submissions. Run forms in a separate desktop context after visual capture.
- The existing Forms column already renders results, but `reportStatus` currently ignores them. Existing `tests/report.test.ts` explicitly expects that old behavior and must change.
- Existing manifests are strictly `command: "check"` with both viewports. Forms-only publication needs a truthful distinct manifest; fabricating successful viewport captures would corrupt approval semantics.

## Read first

Paths below are relative to the worktree unless marked absolute. Do not read environment files.

1. Authoritative leaf `brief.md`, `design.md`, `state.yaml` beside this plan.
2. `README.md` — command exits, read-only capture, report storage/retention, approval selection and scoped real-R2 harness.
3. `plugin/pirax-form-test/README.md` — token/ID/mail contract, exact version gates, CAPTCHA limits and operator rollout.
4. `test/plugin/README.md`; `test/plugin/harness.ts`, `test/plugin/artifacts.ts`, `test/plugin/adapters.test.ts`, `test/plugin/fixtures.php` — reusable real Playground and secret-safe evidence patterns.
5. `learnings/LESSONS.md` — history only if needed to verify a cited lesson's evidence.
6. `src/report/{model,manifest,html,writer}.ts`; `src/commands/{common,check,approve}.ts`; `src/env.ts`; `src/sites.ts`.
7. `src/capture.ts` — desktop settings and read-only boundary (reference, not a mutation target).
8. `plugin/pirax-form-test/includes/{marker,gravity-forms,fluent-forms,mail}.php` — consumer contracts only; no plugin edits.
9. `tests/{commands,report,env,discovery}.test.ts`, `scripts/visual-selftest.ts`, `test/fixtures/cli.ts`, `package.json`, `bunfig.toml`, `tsconfig.json`.
10. `/home/rudi/.claude/skills/chart-issues/assets/standing-design.md` — real mutations/auth, negative tests and browser evidence. This seat's stricter no-environment-file-inspection rule applies.

## Acceptance criteria (established before implementation/tests)

**AC1 — selection and safe discovery.** Both `check <slug|all>` and `forms <slug|all> [--sites file]` scan every configured page at desktop 1440×900, once for forms, independent of the visual mobile pass. GF `.gform_wrapper form` and FF `form.frm-fluent-form` are distinguished, multiple forms retain separate identities, and other actual forms are `unsupported` without submission. An empty selected site list needs no browser, credentials or R2 and returns 0. A page without forms gets `forms: []`. Navigation/discovery failure must not masquerade as “no forms”.

**AC2 — deterministic fill and fail-closed preparation.** Fill visible, enabled user controls using deterministic non-client test data; email controls receive `FORM_TEST_ADDRESS`. Put exactly `<FORM_TEST_TOKEN>-<id>` in the first eligible textarea, else first eligible plain text input, with a new cryptographically random `[a-z0-9]{12}` ID per attempted submission. Preserve hidden nonce/form/honeypot controls. File-upload forms, forms without a usable marker field and unsupported field/flow combinations are not submitted and report `unsupported` with a reason. If a length/pattern/read-only constraint cannot carry the entire marker, do not truncate it or submit an unmarked form.

**AC3 — helper false is no-submit.** With `form_helper: false`, supported forms are filled and client-validated, always reported `not-verified` with validation detail, and never clicked/submitted/entered with Enter or posted through a direct request. In real Playground, mail and entry counts remain exactly unchanged. The browser also blocks page-originated submission paths, including GET-form navigation; do not rely only on absence of an explicit click.

**AC4 — helper true and outcomes.** Submit only supported prepared GF/FF forms on opted-in sites, through their actual browser submit controls. Require new form-associated on-page success before mailbox verification. Explicit client/server validation refusals are `rejected` with a useful redacted message; confirmation timeout, browser/transport error and missing delivery are `failed`. No automatic submission retries. One form's failure does not prevent collecting later form/page results. Known unsupported FF CAPTCHA handling is `not-verified`, never a fabricated success or CAPTCHA solution.

**AC5 — real read-only mailbox.** Poll only the two configured folders with a five-minute maximum per submitted ID. Sessions open mailboxes read-only (`EXAMINE`), use UID search for the exact tag and non-seen-marking header fetch (`BODY.PEEK` semantics), and never STORE, MOVE, COPY, APPEND, DELETE, EXPUNGE or create folders. Do not read message bodies or fetch unrelated messages. The SMTP selftest sends one uniquely tagged real message, finds it as `delivered` or `delivered-spam`, and exercises an unsent ID to genuine timeout/`failed`. Snapshot counts and candidate flags after message arrival but before verification, then assert unchanged after successful and timeout polls; retain sanitized evidence of read-only commands. No read-marking or cleanup mutation of mailbox mail.

**AC6 — production report and exits.** Both commands publish private R2 reports with local copies, completion manifest last and existing last-ten pruning. `check` attaches `PageResult.forms` without changing screenshot/compare/capture behavior. `forms` does no visual capture/comparison or baseline access and produces a forms-only report. Any `failed` or `rejected` form makes page/site/run status fail and command exit 1. `delivered-spam`, `not-verified` and `unsupported` are warnings, not false passes or exit-1 conditions on their own. Existing visual/health failures still fail. Usage/missing or invalid credential configuration returns 2; operational/report failures return 1. A newer forms-only run is never approval evidence and does not hide the newest completed check.

**AC7 — privacy.** Token and credentials never appear in retained report HTML/JSON, stdout/stderr, logs, filenames or unpacked trace contents, including encoded/JSON-escaped forms. Token redaction uses the design's literal `<token>` replacement. Form traces are on, video/screenshots/DOM snapshots/sources off, and action traces scrubbed before retention. Error paths are covered, not only successful fills. Traces stay local and are never uploaded with reports.

**AC8 — real end-to-end evidence.** Use the built ZIP, licensed GF 3.1.2 and FF 6.2.14 in real Playground with real wp-admin authentication/upload/settings. Execute the production `bun run forms local --sites <generated-local-list>` command against at least one form of each plugin; keep confirmation details, sanitized redirected-mail logs, report and trace paths. Independently verify no-helper, upload-field, no-marker, required/server rejection and multiple-form cases. Real R2 tests use a fresh `test/forms-.../` root and clean only that root. `bun test`, `bun run typecheck`, real mailbox selftest and visual regression selftest pass with retained evidence.

## Stable decisions

### D1 — configuration is lazy, validated and secret-safe

Add forms/mail configuration readers in `src/forms/config.ts` and `src/mail/config.ts`, reusing `EnvError` for missing/blank names and a recognized value-free configuration error for invalid formats. Validate the token against the helper's 16–255-character allowed alphabet, one valid redirect email, ports 1–65535 and nonblank literal folder names. Read fill credentials only when a supported fill is required; read IMAP configuration before an opted-in submission. SMTP credentials are needed only by the mailbox test. A no-form visual fixture must retain its existing four-R2-variable behavior. No module-import credential access. Do not trim/transform the actual token or password. CLI and direct-command boundaries sanitize all emitted errors.

Names and acquisition instructions belong in README/test docs. Do not open or modify `.env` or `.env.*` in this work; the existing names-only example remains untouched, and new names are documented in the README table.

### D2 — conservative detection and filling, stable identity

Implement `src/forms/detect.ts` and `fill.ts`. Detection returns a descriptor with safe report selector, plugin and browser locator identity; deduplicate a form matching multiple discovery paths. Unknown forms are never filled. Use stable form IDs when present, otherwise a deterministic document-local ordinal; never use user-entered values in selectors or paths.

Eligibility inspects the whole form before typing: any upload control excludes it, including visually hidden upload widgets. Eligible marker controls are named, visible, enabled, writable textarea/plain text controls; an email-only form has no marker field. Re-read the marker before submission. Fill basic text/email/tel/url/number/date controls and normal select/radio/checkbox groups with safe deterministic values respecting ordinary constraints; do not guess through custom widgets, multi-step forms, payments, passwords or hidden fields. Bound conditional-field stabilization and report unsupported when it cannot safely finish. Do not force CAPTCHA widgets or hidden honeypots. Unsupported is preferable to an unmarked or guessed mutation.

### D3 — isolate forms from visual capture and gate writes

`src/forms/runner.ts` owns a headless Chromium forms session with desktop settings, TLS verification enabled, service workers blocked and no video. Visual capture completes through the unchanged existing path; forms use fresh contexts and no typed-secret screenshots. For multiple forms, reload a fresh context/page per descriptor so the first confirmation/navigation does not erase later forms; ensure the same form identity is still present before filling.

Install browser policy before opening a page. Discovery and no-helper mode allow initial/navigation GET and normal read-only assets but block mutating requests, WebSockets, form submission events and subsequent GET-form navigations/serialization after fill starts. Helper mode permits the audited same-origin GF/FF submission route only during the chosen submit operation, not arbitrary writes from unrelated forms. Reject external form actions as unsupported. Preserve native nonces/serialization; no direct PHP/HTTP shortcut around the browser flow. Policies are defense in depth, not a claim that arbitrary site JavaScript or GET endpoints are side-effect-free.

`form_helper: true` is operator attestation of installed/configured helper and matched token, not something this client can independently prove from public HTML. No new helper API or unaudited plugin probing is added. This residual limitation must be prominent in operator docs.

### D4 — require confirmation, classify once, never auto-resubmit

`src/forms/submit.ts` waits for the specific form's new native confirmation or validation output and returns structured evidence, including its submission ID and sanitized confirmation/rejection detail. GF normal and supported AJAX presentation and FF AJAX confirmation are exercised against the pinned versions. Associate FF messages with the submitted instance rather than a page-global first success. An old success message cannot satisfy a later attempt. Bound navigation, submit and confirmation waits; generic response status is insufficient. Redirect-only confirmations without recognizable on-page evidence fail with an explanation rather than inferring delivery from navigation.

Known FF hCaptcha/Turnstile or another clearly unsupported CAPTCHA path produces `not-verified` before submission. For other attempts, display plugin refusals accurately as `rejected`; unknown controls do not justify CAPTCHA solving. Once confirmation is seen, mailbox polling uses the persisted ID, not a token-derived reclassification. Mail alone cannot turn a rejected/unconfirmed submission into success.

### D5 — narrow IMAP module and deadline

Use `imapflow` with TLS (implicit TLS for 993; required STARTTLS on other supported ports), certificate validation on and raw library logging disabled. `src/mail/imap.ts` exposes polling by validated ID and configuration, with a 300,000 ms production deadline and bounded connection/command waits that cannot outlive it. A shorter explicit API deadline is permitted for targeted tests, not a new public CLI/env delivery shortcut. Poll at a modest interval, serializing read-only mailbox locks, and always release locks/close clients in finally, including errors/timeouts.

Open only exact configured folder names; deduplicate equal names and treat a match in the configured spam folder conservatively as spam. Search using the entire subject tag, then recheck fetched Subject for that exact ID/tag because IMAP SUBJECT is a substring search. Fetch only needed header metadata using the library's verified PEEK behavior, never full source/body. Inspect both folders within a polling round; if the same ID is in both, report `delivered-spam`. No match until deadline is `failed`; auth/folder/connection errors are explicit sanitized `failed`, not “no mail”. No mailbox discovery/listing, fallback INBOX, folder creation or write cleanup. Confirm the installed client API/wire semantics rather than assuming a read-only flag implies PEEK.

### D6 — one consumer result and explicit trace privacy

The external form outcome remains the existing `FormResult` union (`selector`, `plugin`, `outcome`, `detail`). Internally retain `{id, confirmation, result}` for orchestration/evidence. Only sanitized strings cross into report/log objects. Operational page-discovery failures use an explicit failed result with safe page-scan selector/detail, not an empty array.

Add production `src/forms/evidence.ts`; do not import `test/plugin/artifacts.ts` into production. Adapt its verified action-trace scrubbing mechanism, with `<token>` instead of `[REDACTED]` for the marker secret, and sanitization for all supplied secrets and their encoded variants. `zip`/`unzip` become documented forms-runtime prerequisites unless an equivalently verified in-process ZIP implementation is selected during implementation. Keep trace names derived only from run/site/page/form identity. Save raw trace only in a private transient location, scrub/verify before publishing its local path, and remove raw/temp files in finally. If sanitizing fails, fail the operation and remove the unsanitized trace rather than retaining it. No screenshot/DOM/network-body recording in forms contexts; recorded action arguments still need scrubbing. Test the scrubber by deliberately putting the token into typed text, error text and an encoded URL on a local fixture.

### D7 — truthful forms-only reports, preserve check interfaces

Keep existing `RunReport`, `PageResult` and check `Manifest` interfaces strict, including both visual viewports. Add separate `FormsRunReport` (explicit `mode: "forms"`, `runId`, sites with slug/url and pages with path/pageKey/forms) and `FormsManifest` (`schemaVersion: 1`, `command: "forms"`, report). Share `FormResult`; do not invent placeholder capture successes or change image-comparison semantics.

Keep `parseManifest` as strict check-manifest parser for existing callers. Add `parsePublishedManifest` returning the validated check/forms discriminated union, sharing form/site/page identity validators. Writers/renderers accept check or explicitly discriminated forms report, derive the correct envelope, and preserve the existing check rendering/publishing path. Forms-only rendering shows page Forms data without fictitious image panels. Both use the same `reports/<runId>/` layout, private HTML, manifest-last and global last-ten retention; traces remain outside the asset allowlist.

Add a shared form/page aggregation helper so check and forms reports include form failures/warnings consistently at page/site/run levels. `newestSiteCheck` validates published manifests then skips valid `command: "forms"` runs before selecting a check. Malformed manifests remain errors; a new forms run must not make approval fail merely because it lacks screenshots. `validateApproval` still accepts check manifests only and retains exact-byte rules.

### D8 — command wiring with no screenshot refactor

Extend `Command`/argument parsing/dispatch with `forms` and add `src/commands/forms.ts` plus the package script. Keep normal slug/all/--sites and exit conventions. Add a separate `FormsCommandResult` rather than weakening all existing `CommandResult.report` consumers to an unstructured object.

`runCheck` runs existing capture/comparison, attaches the forms pass to matching page results before publication, then recomputes report status while preserving previously observed operational failure. `runForms` builds the forms-only report directly with no call to captureSelection, no baseline list/get and no mobile pass. Share scan orchestration rather than clone detection/mail logic. Preserve local evidence and publish expected failure reports, continue after per-form operational failures, and ensure early configuration failures occur before affected form submissions. Empty selection remains an early return. Test fixtures may provide a real scoped Store and a shorter explicit polling deadline through internal options; no fake-mail acceptance hook or production skip-submission flag.

### D9 — separate submission proof from real-mail proof

Build `test/forms/` on `test/plugin/harness.ts` without editing plugin PHP. Add leaf-specific fixture PHP through the existing serialized `php<T>()` bridge with explicit result shapes. Use real wp-admin login/upload/settings to configure the built helper, plus native GF/FF APIs for disposable forms. Any new text fixture installed through the bridge is read back exactly and checked through served markup before assertions.

The production CLI local run must retain an actual submitted GF and FF confirmation and log redirect recipients, exact subject tag/header, and entry cleanup. It will wait for real IMAP timeout because no Playground message was sent; assert that truthful outcome and exit 1. Budget at least two five-minute deadlines plus setup for this explicit CLI scenario. Shorter internal deadlines can keep other negative tests fast. Never transform the local mail observer into a `delivered` provider.

The mailbox test uses nodemailer only in test code, real SMTP TLS/auth and a harmless body with no token, sending exactly one message to FORM_TEST_ADDRESS with a fresh subject tag. Wait for folder arrival before the before-snapshot so the expected SMTP delivery is not mistaken for checker mutation. Record counts in both allowed folders and UID/UIDVALIDITY/flags of the tagged candidate, exercise production poll, then repeat snapshots. Exercise a second fresh unsent ID through timeout. Do not inspect unrelated bodies or mutate/delete the test message. If external delivery changes counts during the interval, retain inconclusive/failure evidence instead of claiming immutability. Capture only safe protocol-operation names/read-only facts, not raw protocol/auth logs. API/helper unit tests can cover deadline and matching logic but do not replace real authenticated proof.

### D10 — no production rollout during tests

All form mutations target generated loopback sites; never run `forms all` or `check all` against the committed live list as verification. Real R2 command verification uses `createStore({root: "test/forms-.../"})` through the existing internal dispatch seam. Follow `test/fixtures/cli.ts`: a test-only process wrapper calls production `dispatch("forms", args, {store, runsDir, log})` with real R2 and a strictly validated test root. For the requested `bun run forms local --sites ...` invocation, generate a disposable harness package whose `forms` script points to that wrapper; its only differences from the root package alias are scoped storage/run paths and sanitized output. Record argv and harness working directory explicitly, and do not claim this tests the root alias's wiring by itself: separately test that `package.json` points to the real `src/commands/forms.ts`, and invoke that root entrypoint for empty-list/usage cases without remote writes. This is real production dispatch/browser/mail/publication, not a storage/auth mock, and needs no production CLI test flags. No signed report URLs in retained summaries. Always clean the scoped R2 root and stop WordPress/browser processes; leave mailbox test mail untouched by design. Summaries identify exact report/trace/root paths and cleanup result.

## Needed interfaces

- `readFormConfig(env?) -> {token, address}`; `readImapConfig(env?) -> TLS connection + two named folders`; test-only SMTP config reader. All value-free errors and import-safe.
- `detectForms(page) -> FormDescriptor[]`; `fillForm(page, descriptor, config, id) -> prepared | unsupported | not-verified`, including validation detail and intact marker proof.
- `submitForm(page, prepared) -> confirmed | rejected | failed`, scoped to one ID/form, never a `delivered` result by itself.
- `pollDelivery({id, config, timeoutMs?}) -> {outcome: delivered | delivered-spam | failed, detail}`; default timeout five minutes, no body retention or write methods.
- `scanPageForms(site, page, options) -> FormResult[]`; `populateForms(sites, report, options)` attaches one desktop result set per listed page. Options carry run directory/evidence and narrowly scoped test timing, not mailbox-success substitutions.
- `FormsRunReport`/`FormsManifest`, `parsePublishedManifest`, forms-aware status/render/publication; preserve old strict check types and approval validation.
- `runForms(sites, store, options) -> FormsCommandResult`; dispatch adds forms without broadening CLI into credential/TLS/test-mode switches.

## Ordered file/criterion checklist

Workers are sequential: first contracts/mail/report, then browser runner/wiring, then real verification/docs. Each worker receives the implementation skill's eight-section brief, the relevant decisions/ACs, boundaries and exact predecessor interface outputs. Do not parallelize competing edits to common/report files.

1. [ ] `package.json` — add forms, targeted forms tests and mailbox-selftest scripts; IMAP client, test-only SMTP sender/types; AC5/8.
2. [ ] `bun.lock` — resolved dependencies only; AC8.
3. [ ] `src/forms/config.ts` (new) — validated fill config and safe configuration errors; D1, AC2/7.
4. [ ] `src/mail/config.ts` (new) — IMAP configuration/TLS validation without SMTP runtime dependency; D1/5, AC5.
5. [ ] `src/mail/imap.ts` (new) — real read-only tagged-message polling, exact matching, deadlines and cleanup; D5, AC5.
6. [ ] `src/report/model.ts` — additional strict forms-only types, retain existing FormResult/check contracts; D7, AC6.
7. [ ] `src/report/manifest.ts` — forms manifest parser and shared validators, preserve strict check approval; D7, AC6.
8. [ ] `src/report/html.ts` — form status aggregation and forms-only table branch, escaping/CSP unchanged; D7, AC6/7.
9. [ ] `src/report/writer.ts` — correct envelope and asset allowlist for both report modes; D7, AC6.
10. [ ] `src/commands/approve.ts` — skip validated forms-only runs during newest-check selection; D7, AC6.
11. [ ] `src/forms/detect.ts` (new) — adapters, deduplication, unknowns, conservative eligibility; D2, AC1/2.
12. [ ] `src/forms/fill.ts` (new) — constrained visible-control filling, marker generation/integrity, native validation; D2, AC2/3.
13. [ ] `src/forms/submit.ts` (new) — native confirmation/error association, timeout, CAPTCHA classification; D4, AC4.
14. [ ] `src/forms/evidence.ts` (new) — production redaction and fail-closed action-trace retention; D6, AC7.
15. [ ] `src/forms/runner.ts` (new) — isolated desktop sessions, no-submit/write gate, sequential form continuation and polling; D3/4/8, AC1–5.
16. [ ] `src/commands/common.ts` — forms parsing/dispatch, result/options typing and sanitized configuration boundaries; D8, AC1/6.
17. [ ] `src/commands/check.ts` — populate forms before publication and preserve prior failures; D8, AC6.
18. [ ] `src/commands/forms.ts` (new) — forms-only production entrypoint/local and R2 reports; D8, AC6.
19. [ ] `test/forms/config.test.ts` and `test/forms/imap.test.ts` (new) — import-safe config/deadline/tag edge tests, no mocked auth acceptance; AC2/5/7.
20. [ ] `test/forms/browser.test.ts` and `test/forms/evidence.test.ts` (new) — real Chromium local fixtures for filling, no-submit traps, old confirmations, unknown/upload/no-marker, redaction and continuation; AC1–4/7.
21. [ ] `test/forms/fixtures.php` and `test/forms/harness.ts` (new) — real Playground extensions and scoped real-R2 CLI execution, no plugin changes; D9/10, AC8.
22. [ ] `test/forms/playground.test.ts` (new) — production CLI GF/FF submission, native rejection/no-helper/mail/entry evidence and truthful timeout reports; AC3/4/8.
23. [ ] `test/forms/mailbox-selftest.ts` (new) — real SMTP/IMAP positive plus unsent-ID timeout/counts/flags/protocol evidence; D9, AC5/7/8.
24. [ ] `test/forms/report.test.ts` (new) — real scoped R2 forms report, Playwright rendering, traces excluded, form gating and newer-forms/older-check approval regression; AC6–8.
25. [ ] `tests/commands.test.ts` — forms CLI/empty/preflight/manifest-selection regression cases; AC1/6.
26. [ ] `tests/report.test.ts` — replace obsolete non-gating assertion, forms-only parser/render and hostile text cases; AC6/7.
27. [ ] `test/fixtures/cli.ts` — extend the strict test-root allowlist to `test/forms-.../` and support forms dispatch for the disposable harness package; preserve existing visual harness behavior; D10, AC8.
28. [ ] `scripts/visual-selftest.ts` — only compatibility changes if needed; retain prior real-R2 visual acceptance, no skipped forms mode in production; AC8.
29. [ ] `README.md` (human/agent entrypoint) — commands, credential-name/acquisition table, changed check mutation boundary, outcomes/exits, privacy/runtime prerequisites, manifest/approval behavior, scoped tests and rollout warning; AC1–8.
30. [ ] `test/forms/README.md` (new human/agent harness guide) — exact commands, required names, artifact layout, local-vs-delivery distinction, time budgets, mailbox count-race limit and cleanup; AC5/7/8.
31. [ ] `plugin/pirax-form-test/README.md` (human plugin guide) — link forms command/setup from rollout and clarify the helper itself still does not verify delivery; no plugin capability changes; AC4/8.
32. [ ] `test/plugin/README.md` (human/agent test guide) — cross-link checker/real-mail suites without changing claims about existing logged-mail evidence; AC8.

No AGENTS.md or configured agent grounding index exists/needs an update. No changes to plugin PHP, capture/compare algorithms, committed live sites, environment files or unrelated lesson/history files are planned.

## Concrete verification sequence and retained evidence

1. Install dependencies/Chromium as needed; `bun run typecheck`. Check prerequisites by name only, including a licensed ZIP matching GF 3.1.2. Use compatible Node/toolchain for the existing Playground bridge; do not change the global runtime selection unnecessarily.
2. `bun --no-env-file test tests` and credential-free targeted `test/forms` unit/browser/evidence suites. Use explicit paths until integration files exist so missing real credentials cannot be hidden by broad skips. Verify empty selection, import safety, missing/blank names, marker constraints, no-submit GET/POST/JS traps, unrelated success messages and every status mapping.
3. `bun run build:plugin`; `bun --env-file=.env test test/forms/playground.test.ts test/forms/report.test.ts`. New integration suites set their own Bun timeout (existing 180,000 ms per-operation pattern, with a >=900,000 ms explicit timeout for the full two-form CLI case). The harness records the actual `bun run forms local --sites ...` invocation and its expected timeout/exit-1 result alongside positive confirmation and redirected-mail evidence. Use real authenticated wp-admin installation/settings, not stubbed permission checks.
4. `bun --env-file=.env run mail:selftest` (script points to `test/forms/mailbox-selftest.ts`). Retain `runs/mail-selftest-<timestamp>/summary.json` with generated IDs, result/folder category, elapsed times, count/flag comparisons and read-only-operation evidence, but no raw SMTP/IMAP logs, credential values or mail body. The unsent-ID case runs the actual five-minute deadline once; helper tests cover short bounds. SMTP-added mail remains in the dedicated mailbox.
5. `bun --env-file=.env test` and `bun run typecheck`. No silent credential/integration skips. Existing plugin suites remain passing; negative local checker timeout is an asserted expected result, not a failed test suite.
6. `bun --env-file=.env run visual:selftest` with a compatible Node runtime as documented. This protects read-only screenshot, R2, exact approval and retention behavior after report/dispatch edits. Add the newer forms-only manifest/older usable check scenario to real-R2 evidence; never fall back past a malformed check manifest.
7. Open/render locally saved and fetched-private report bodies with headless Chromium, trace on/no video, without navigating to a signed URL. Assert per-page Forms outcomes, escaped hostile error text and failure/warning headings. Record report/trace paths in `artifacts/forms/<run>/summary.json` (or a consistently documented `runs/forms-selftest-.../` root); keep production command reports under the run directories named there.
8. Scan every new retained evidence file and unpacked trace for raw/URL/JSON-encoded token and configured secrets using in-memory values, printing only pass/fail/counts, not matching text. Confirm no forms traces were uploaded. Stop all fixtures, clean only the generated R2 test prefix, verify it is empty, and retain cleanup counts. Record exact command exits and artifact paths in the implementation report, never signed URLs.

## Real remaining limitations

- Opt-in metadata cannot prove the live helper is installed, configured or using the same token. A misconfigured site may process a marker as ordinary data; operator installation/settings verification and staged go-ahead remain required. No production rollout is authorized by this plan.
- Five-minute arrival proves one matching test message reached the dedicated mailbox, not that every notification/recipient/integration path works. Delayed queues can arrive after a failed result. The local Playground proof and independent SMTP/IMAP proof do not prove a real client's transport until an authorized rollout run.
- Unsupported custom widgets, multi-step forms, external actions, redirect-only confirmations and plugin versions outside the helper's audited pair remain explicit limitations, not targets for guessing or new plugin code.
- Read-only IMAP cannot prevent an independent client/provider/filter from changing flags or counts; the real test can establish unchanged observations in a quiet interval, not exclusive mailbox control. Retained mailbox test messages are intentionally not cleaned up.
- Trace privacy requires disabling image/DOM capture; traces show actions and sanitized diagnostics rather than full visual form-state replay. Existing visual traces remain separately useful and unchanged.

## Implementation notes — 2026-09-26

- **D1/readiness refinement:** the mandated synthesis presence check tests `undefined`, not blank values. Unit 1's real selftest preflight and B's names-only nonblank check found `FORM_TEST_ADDRESS`, `IMAP_USER`, `IMAP_PASSWORD`, `SMTP_USER`, `SMTP_PASSWORD` defined but blank. These are absent usable credentials, a human-only blocker. Implementation stops; see `implementation/report.md` for exact operator actions. Future readiness checks must also reject blank strings, without printing values.
- **D5 implementation mismatch, not an approved scope change:** unit 1 found ImapFlow performs exact-name LIST before EXAMINE and automatically normalizes namespace prefixes. Its landed code uses ENVELOPE metadata (non-seen-marking) rather than the specified BODY.PEEK header path. These choices are reported in `implementation/worker-1.md`; literal-folder enforcement and adherence to the planned PEEK/no-list contract remain to be resolved on resume before declaring AC5 complete. No real-mail verification has occurred.
- **AC8 evidence gap:** unit 1's passing real-R2/report browser test removes its report/trace directory in afterAll. Retained end-to-end artifact evidence remains owed; passing assertions alone do not satisfy the retention criterion. No implementation acceptance criterion is waived.
- **Resume readiness/check command, 2026-09-26 16:03 +02:00:** a new names-only nonblank check found all 17 prerequisite names present, including the five previously blank mailbox values; network/auth/folder validity remains unverified. Resume delegates only the first unit's remaining mailbox-contract and retained-evidence work. Current effective config supplies blocking `bun run typecheck`, `bun test`, and changed tests `: "${AKROGON_BASE:?AKROGON_BASE is required}" && bun test`, superseding the synthesis/old brief's no-configured-checks observation. Base remains `08fa818b7517dad3c2c0bfd0c2bef290d97db148`.
- **D5 implementation mechanism, 2026-09-26:** worker-2's installed-source/API evidence confirms ImapFlow 2.0.7 has no public no-discovery/literal-folder option and can issue a connection-time LIST fallback as well as select-time LIST. Authorize an exact-version-pinned, reproducible Bun dependency patch adding an opt-in literal/no-discovery mode to startup/select/types (both runtime builds), enabled only in checker and snapshot sessions. This preserves the locked two-folder/EXAMINE/PEEK/no-discovery contract rather than waiving it. Subject-only PEEK and the installed MIME decoder replace ENVELOPE. Patch/API regressions and real wire evidence are required; see `implementation/worker-2.md` and revised `brief-2.md`.
- **D3/D4 native GF refinement, 2026-09-26:** native GF 3.1.2 uses the named `gform_submission_method` field and lazily loads its exact same-origin default-path DOMPurify script after modern AJAX. Permit that one script resource only after the authorized POST (no query, fetch, image or arbitrary GET allowance). Native red/green and forbidden-serialization evidence are in worker-4's report.
- **D6/D8 publication-log refinement, 2026-09-26:** B's in-memory presign diagnostic proves the new privacy redactor corrupts printed signed URLs because they contain configured credential identifiers. Replace the two URL log lines with publication confirmation/local-report guidance, never emit a misleading redacted bearer link. Keep the valid signed URL in existing programmatic result.url and preserve private R2 publication/retention. Root README documents the CLI log change; no token/credential logging exception is introduced.

## Repair notes — 2026-09-26, check.fix round 1

Reviewed head: `83509cba10299f554b087d6392f0d28b7649d767`. Address A F1/F2 and B Fix 1/2 without weakening acceptance:

- **D2 / A F1:** native required checkboxes use `aria-required="true"` (GF consent/FF checkables and terms) or GF `.gfield_contains_required`, not necessarily HTML `required`. Detect audited native group requirements and select one usable choice per required group, preserving individual native required constraints and leaving optional groups untouched. Add positive native GF/FF confirmation coverage; keep the intentionally optional-rendered native server-rejection case red/rejected.
- **D6/D8 / A F2:** the mandatory redaction set is the marker token and actual credentials/private identifiers (passwords, account users, redirect address, S3 secret/access key). Host/folder/bucket/endpoint names and a licensed ZIP path are not credentials; matching them within a legitimate site identity/run path must not create exit 2 or corrupt report pointers. Test an ordinary nonsecret value colliding with both site and run paths, while preserving real credential redaction. Keep bearer-link withholding documented.
- **D3/D6 / B Fix 1:** explicit HTTP-200 challenge/interstitial pages are failed discovery, never successful empty results. Reuse the existing narrow detector before accepting discovery; ordinary no-form pages and normal CAPTCHA mentions remain unchanged.
- **D6 / B Fix 2:** JSON uses UTF-16 code units, including surrogate pairs for astral characters. Cover these valid credential encodings and verify decoded retained JSON with an independent test oracle; do not rely solely on applying the same redactor twice.
- **Review nits:** consolidate the new socket lesson into the canonical `learnings/LESSONS.md` index (index maintenance only, not additional pass input), removing the redundant ACTIVE index. Document unverified invisible/v3 CAPTCHA and specialized GF phone flows and the current config-error/visual-report limitation rather than introducing unverified runtime workarounds. These notes do not waive any blocking criterion.
