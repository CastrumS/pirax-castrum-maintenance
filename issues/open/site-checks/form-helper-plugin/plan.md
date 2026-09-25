# Plan: form-helper-plugin

Slot B · plan.synthesis · 2026-09-25 · direct synthesis (`debate: no`).

## Grounding and readiness

- Authoritative leaf: `/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/open/site-checks/form-helper-plugin/`. No positions/rebuttals exist or are required.
- Code worktree: `/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/worktrees/form-helper-plugin`, clean at inspection, base `93cf3b7f6b99f3a34be7f69c004345c439fa6a76`.
- The checkout contains issue documents, `.gitignore`, and an empty `learnings/LESSONS.md`; no application, package manifest, plugin, test harness, README, or agent guide exists. `akrogon config` reports `grounding: none`, with no configured index or check commands. These are resource gaps, not assumed documentation or existing test coverage.
- No dependency on checker-foundation: create the minimal plugin tooling here. Preserve unrelated scripts/dependencies if that leaf reaches the branch first; reconcile shared manifest/lock changes without importing its R2/site-loader work.
- No human-only blocker was found. Presence-only checks using Bun reported `GRAVITY_FORMS_ZIP: absent` and `FORM_TEST_TOKEN: absent` from this worktree's `.env`, but **both present** when run from the registered repository with `bun --env-file=.env`. A Bun script loading the registered repository's environment confirmed the licensed ZIP is an accessible absolute file and the token is nonempty. No environment file or credential value was opened or printed. Use `bun --env-file=/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/.env ...` for this worktree's credential-dependent commands; do not copy or edit environment files.
- If credentials cease to be available: the operator obtains the licensed ZIP from gravityforms.com → account → Downloads and adds `GRAVITY_FORMS_ZIP` (its absolute local path) to the registered repository's `.env`; `FORM_TEST_TOKEN` is the operator's private random shared marker token, added there and to plugin settings. Recheck presence without printing values. Do not replace the GF acceptance run with mocks or skip it.

### Read first

1. Authoritative leaf `brief.md` and `design.md` above (design wins).
2. `/home/rudi/.claude/skills/chart-issues/assets/standing-design.md`.
3. `issues/open/site-checks/ISSUE.md` and `issues/open/site-checks/form-check/design.md` (shared marker/mail interfaces and token redaction).
4. `learnings/LESSONS.md` and `.gitignore`.
5. Source references below, using runtime-extracted/downloaded sources outside tracked code; re-extract if temporary paths have disappeared. Do not vendor licensed GF source.

### Live source evidence

Inspected licensed **Gravity Forms 3.1.2**, extracted to `/tmp/pirax-gf-plan-KBir8t/gravityforms/`:

- `form_display.php`: `gform_pre_validation` before field validation; `gform_field_validation` at line 2805; `gform_entry_post_save` before notifications; `gform_after_submission` after submission handling.
- `includes/addon/class-gf-feed-addon.php`: `gform_addon_pre_process_feeds` (line 1170), followed by its form-specific filter, before synchronous processing or enqueueing feeds.
- `includes/async/class-gf-notifications-processor.php`: `gform_is_asynchronous_notifications_enabled($enabled, $event, $notifications, $form, $entry, $data)`. Background notifications are enabled by default on new installs since 2.10.0. Late entry deletion alone would lose queued mail.

Downloaded wordpress.org Fluent Forms latest stable for inspection, **6.2.14**, to `/tmp/pirax-fluentform-plan/fluentform/`:

- `app/Services/Form/FormValidationService.php`: `fluentform/before_form_validation($fields, $formData)` precedes CAPTCHA; `fluentform/disable_captcha($disabled, $form, $type)` is a clean bypass for `recaptcha` (line 595); `fluentform/validation_errors($errors, $formData, $form, $fields)` is the final ordinary validation filter.
- `app/Hooks/Handlers/GlobalNotificationHandler.php`: `fluentform/global_notification_active_types($types, $formId)` selects feed types **before** querying/queueing feeds. Keep `notifications`, not an empty list. `fluentform/notifying_async_email_notifications` selects email queueing.
- `app/Services/FormBuilder/Notifications/EmailNotificationActions.php`: maps `notifications` → `email_notifications`; notification action is `fluentform/integration_notify_notifications($feed, $formData, $entry, $form)`, native sender at priority 10. Email defaults to synchronous through priority-9 filters, but later filters can enable queueing.
- `app/Services/WPAsync/FluentFormAsyncRequest.php`: `process()` calls that notification action in a later request, then `maybeFinished()`. Its `fluentform/global_notify_completed` signal only checks **pending** rows, not processing/failed jobs; it is not sufficient proof that all mail finished. Legacy `processActions()` may also process several entries in one request.
- `app/Services/Form/SubmissionHandlerService.php`: submission metadata is written *after* the `submission_inserted` actions; deleting within nested synchronous notification completion can leave newly recreated metadata. Defer physical cleanup until the submission stack has finished.
- `app/Services/Submission/SubmissionService.php::deleteEntries()` and `app/Models/Submission.php::remove()` provide native related-data deletion; inspect queue cleanup there before implementing retry/sweep handling.

## Acceptance criteria (fixed before deriving tests)

**AC1 — Install/settings.** `bun run build:plugin` produces `dist/pirax-form-test.zip`, rooted at `pirax-form-test/`, with no test code, licensed plugins, secrets, or dependencies. Playwright uploads and activates it through wp-admin on a fresh Playground. Settings → Pirax Form Test reads/saves only for `manage_options`, using real WordPress sessions and nonces; missing/invalid nonce and non-admin direct requests cause no mutation. Both named options have autoload disabled; uninstall removes them and owned scheduled events.

**AC2 — Real marked submission, both plugins.** Submit `<token>-abc123` through the actual rendered form in headless Chromium. Every captured final `wp_mail` call has only the configured redirect recipient, no Cc/Bcc, subject beginning `[pirax-test abc123] ` and exactly one `X-Pirax-Form-Test: abc123`. Multiple notifications and unrelated mail within the marked submission request receive the same protection. Native feeds are not executed or queued. Notifications finish before entry/related-data deletion. Keep a redacted trace and mail log.

**AC3 — Noninterference.** No marker, wrong token, and empty configured token leave recipients, headers, validation, native integration behavior, and entries unchanged. Include a positive unmarked feed execution control so a zero marked feed count is meaningful. Separate requests and separate queued jobs must not inherit another submission's marker. Deactivating either supported form plugin does not cause a fatal error.

**AC4 — CAPTCHA.** For GF's built-in reCAPTCHA v2 field, the test mu-plugin forces Google's siteverify to return `{"success":false}` using `pre_http_request`; marked submission succeeds and otherwise identical unmarked submission fails. Do the same for Fluent Forms using its verified clean hook. Supply a nonempty dummy CAPTCHA response so the negative test actually reaches server-side verification; do not mock WordPress auth or form validation. Other validation/honeypot/security failures stay failures. If another FF version lacks this hook, CAPTCHA stays enabled and documentation says delivery is not verified for it.

**AC5 — Async and failure isolation.** GF with background notifications globally enabled still sends marked notifications before late entry deletion. FF with native email queueing enabled retains the marked entry until **all** notifications finish; process native jobs in a separate PHP/HTTP request and prove redirection then deletion. Two notifications, a failed/retryable notification, and an unmarked job in the same runner batch exercise lifecycle/context handling. Failed/processing rows cannot be mistaken for completion.

**AC6 — Fail closed.** A recognized test submission whose integrations cannot be safely suppressed is rejected before entries, notifications, feed queueing, or side effects, with exactly `Pirax test blocked: integrations could not be suppressed`. Exercise a concrete unsupported callback/integration path, not merely a stubbed capability boolean. Missing/invalid redirect, ambiguous marker IDs, or malformed IDs containing the exact configured secret also reject safely, with a configuration/marker error rather than delivering to original recipients. Ordinary wrong-token submissions remain ordinary.

**AC7 — Sweep.** The hourly WordPress event deletes entries containing the configured nonempty token that are strictly older than one hour, using native deletion APIs and removing associated pending/retryable test jobs. It leaves younger entries and non-token entries, handles more than one page of records without skipping during deletion, and is safe to repeat. Test timestamp boundary, escaped SQL wildcard characters in a token, empty-token no-op, and non-UTC site timezone. Deactivation/uninstall unschedules the event.

**AC8 — Evidence/build discipline.** `bun test` passes real Playground-backed assertions and fails for missing prerequisites, readiness failure, or incomplete job processing (not silent skips). Keep sanitized mail/feed/entry assertions plus browser trace under `artifacts/plugin/<run>/`. The production plugin never sends mail itself or adds a REST endpoint. Verify the generated ZIP in a fresh site, not only a source mount. No live-site installation, SMTP/IMAP/R2 work, or security-plugin changes occur in this leaf.

## Decisions and needed interfaces

### D1 — Deliver a small standalone PHP plugin

Use a prefixed/namespaced bootstrap, settings module, marker/request context, mail filter, separate GF/FF adapters, and cleanup module. Conditional adapter registration tolerates absent form plugins. No Composer/runtime JavaScript dependency, custom DB schema, or REST/admin test backdoor. Activate options with autoload false and one idempotent hourly event; deactivate clears events; guarded `uninstall.php` removes owned options and cron state.

### D2 — Strict shared marker; classify unsafe markers separately

Public contract: `<FORM_TEST_TOKEN>-<id>` where `id` matches `[a-z0-9]{6,32}`. Find it within **submitted field values**, including nested/multivalue fields, rather than keys, cookies, arbitrary query parameters, or an entire serialized HTTP envelope. Use the form plugin's parsed field data/known GF input names, WordPress unslashing once, literal escaped token matching, and a boundary check that cannot accept the first 32 characters of a longer ID. Permit an email plus-address suffix such as `@example.test`. Multiple occurrences of the same ID are fine; different IDs reject as ambiguous. An empty configured token disables all submission behavior and the sweep.

Internal parser result: `ordinary | marked(id) | invalid-marker`; adapter preflight result: `supported | blocked(reason)`. Correct secret with missing/invalid ID is not a license to bypass CAPTCHA and not an ordinary submission that could leak to clients. The design's ID grammar narrows the brief's looser “contains the token” wording; this is a review note, not a scope reopening. The recovery sweep deliberately follows the brief's broader “contains the token” predicate to recover old malformed test entries too.

### D3 — Validate settings and retain the site's real mail path

Use `pirax_form_test_token` and `pirax_form_test_redirect` exactly. Capability checks on render **and** save, nonce validation before mutation, escaped output, a password-style token control, no secret in notices/logs, and validation of a single redirect mailbox (no address list or CR/LF). Do not silently truncate/change the token. Permit disabling by clearing it. If options become inconsistent through external changes, reject marked submissions before processing; never fall back to original recipients. Mail is redirected, not silently dropped.

### D4 — Request context plus scoped worker context

Initial supported form submission establishes the marker before CAPTCHA/feeds/mail and keeps protection until request end, including late callbacks. FF async notification callbacks restore context from that entry's saved response before the native email action, then restore prior context after the action; never leave a static global set across an unmarked job. Keep context stack-based/idempotent for nested callbacks. Use stored field data for queued work, not the runner request's POST. No permanent raw-token metadata is needed in addition to the actual form entry.

### D5 — Mail transformation at late `wp_mail`

Replace `to` completely with the one configured redirect; normalize string/array headers and case-insensitively remove all Cc/Bcc headers **including folded continuations**, replace any existing test correlation header, and prepend the subject exactly once. Preserve body, attachments, From, Reply-To and unrelated headers. ID validation prevents header injection. Test recipient arrays, mixed header casing, CRLF strings, multiple headers and repeated filtering. Keep production delivery on WordPress/the site's configured mail transport. A test-only `pre_wp_mail` observer records post-filter arguments and returns success instead of sending.

### D6 — Gravity Forms interception and synchronous marked mail

Detect context in `gform_pre_validation`; `gform_field_validation` only overrides the captcha field's validation result for a valid marked, supported submission. Never set global form validation to true. Add pre-save rejection via `gform_validation` for unsafe integrations/configuration while preserving all existing errors. Return `[]` at late `gform_addon_pre_process_feeds` and its form-specific counterpart so neither sync nor background add-on feeds run.

Return false from `gform_is_asynchronous_notifications_enabled` **only for the marked entry/submission**, leaving ordinary notification settings unchanged. This resolves the real default-background-notification hazard without inventing a second GF mail worker. Delete the marked entry via `GFAPI::delete_entry` at late `gform_after_submission`, after native notifications. Test both global and form-specific filters and with native background notifications enabled globally.

### D7 — Fluent Forms interception and native async support

Establish context from parsed `$formData` on `fluentform/before_form_validation`. On `fluentform/disable_captcha`, return true only for marked, supported reCAPTCHA (`$type === 'recaptcha'`), preserving the incoming result for everything else. Apply pre-insert validation errors through `fluentform/validation_errors`.

At late `fluentform/global_notification_active_types`, retain only the original `notifications` mapping; never suppress that mail feed along with CRM feeds. Do not modify saved form settings or globally disable email queueing. Wrap `fluentform/integration_notify_notifications` before/after native notification processing for worker context; support both synchronous and native queued modes.

Treat `fluentform/global_notify_completed` as a **candidate** cleanup signal. Confirm the entry is marked and no pending, processing, or retryable failed notification job remains; do not trust its upstream pending-only check. Re-evaluate after actual notification actions too, including legacy batch execution. Schedule physical deletion for the end of the current request, recheck state then, and call `SubmissionService::deleteEntries([$id], $formId)`. This prevents synchronous completion from deleting ahead of subsequent submission metadata writes. Zero enabled notifications still allow cleanup after the submission stack. Keep multiple entries/jobs isolated.

### D8 — Suppression is a demonstrated capability, not a claim about all PHP

Support the inspected native GF feed framework and FF global feed dispatch. Audit registered callbacks on the relevant pre-save/submission, feed-dispatch, and notification actions/filters (including deprecated aliases and form-specific hooks) against the inspected core paths; detect additional direct side-effect dispatchers rather than assuming every integration uses a feed. Use a small explicit compatibility inventory of audited callback paths and hook signatures, not blanket approval of all callbacks merely because their file lives inside a plugin. An unrecognized integration callback or competing post-filter reintroduction that cannot be controlled makes the marked form fail preflight with the literal blocked message. Exercise this by installing a local integration fixture on a path outside the suppressible feed mechanism. Ordinary submissions are untouched.

Payment/post-registration workflows outside the audited dispatch paths must be classified unsupported and rejected, not submitted optimistically. Document the tested version matrix and unsupported paths. Do not try to strip all WordPress actions, guess third-party vendor APIs, or modify security plugins. Arbitrary code bypassing these hook surfaces or rewriting recipients after `wp_mail` is an explicit limitation; no portable plugin can prove safety against all other PHP. Treat unverified site combinations as not rollout-ready.

### D9 — Cleanup is native, bounded, and recoverable

For the hourly recovery event, paginate old candidates by a stable cursor; match literal token in actual GF field values / decoded FF response values, not metadata keys. Normalize GF UTC and FF site-local timestamps correctly. Prepared, escaped candidate queries can narrow results, but decoded matching is authoritative. Use GFAPI/native FF deletion, not parent-row-only SQL. Remove/cancel entry-owned queued work before deleting an expired entry, and verify the native deletion's associated-table behavior. Never delete unmarked entries or cancel their jobs. Cleanup errors leave entries recoverable by a later sweep and do not log field/token contents.

The one-hour sweep is a recovery deadline, not proof of delivery: if notifications still cannot complete by then, cancel remaining work and remove the stale test entry; the external checker will report missing delivery. Already executing concurrent jobs are a race requiring a final state check; do not delete underneath an actively processing notification and claim successful delivery. Document that a busy/crashed worker may delay final cleanup, and test the eventual retry/sweep path. Token rotation prevents token-based recovery of old unmatched entries: document clearing pending tests before rotation.

### D10 — Reproducible local harness, real authorization

Use pinned `@wp-playground/cli`, `playwright` as a consumer dev dependency, Bun's test runner, and a generated Playground blueprint/runtime setup under `test/plugin/`. Pin the inspected FF version from wordpress.org; record the GF ZIP version in test evidence and reject incompatible hook surfaces rather than silently using latest. Start a disposable loopback WordPress, install both real form plugins and the test mu-plugin, seed real users/forms/native notification settings and feed records, then drive rendered forms/settings/upload with Playwright. Use the CLI's supported local PHP execution/control mechanism for setup and DB assertions; no production endpoint or mocked admin capability.

Test-only feed fixtures register through the real GF add-on / FF integration framework and record execution to a local ledger. Include an unsupported dispatcher fixture for fail-closed testing. The mu-plugin also intercepts siteverify and logs final mail. Browser CAPTCHA widget bootstrapping can be made deterministic locally, but browser/auth/submission processing remains real and a supplied response still fails the server verifier. Drive native Action Scheduler/FF jobs across requests; do not directly call plugin helper functions as evidence of async acceptance. Bound waits and fail with diagnostics; clean up processes/sites on success and failure.

### D11 — Artifact privacy and build isolation

Use ignored `artifacts/plugin/`, runtime/download directories and `dist/`; never include GF sources/ZIP, environment files, test mu-plugin or test logs in the distributable. Do not publish raw browser traces containing the secret: disable screenshot/snapshot/source capture for secret-bearing tracing, scrub trace event/network resources and logs before retention, and verify the configured token is absent from retained artifacts without printing it. Retain usable action/network traces and sanitized final-mail/entry/feed evidence. Trace settings page mutation without retaining a visible token. Errors/child-process logs must not echo credentials or environment contents.

### D12 — Tooling and scope

Create minimal `package.json`/`bun.lock` if absent; scripts include `build:plugin` and `test:plugin`. `bun test` discovers a Bun suite that starts/uses the real harness rather than accidentally running Playwright-runner specs as Bun tests. Use Playwright's library API from Bun tests to avoid a second test runner. Packaging may use the available system `zip`; check prerequisites and archive contents with actionable errors. Do not make mailbox, R2, site lists, or other leaves dependencies for this local plugin test. Keep those systems out of the plugin ZIP and this implementation.

## Ordered file/criterion checklist

Sequential implementation groups; each consumes the previous group's interfaces. Split workers accordingly, with reviewable file ownership and acceptance evidence.

1. **Harness and compatibility evidence**
   - [ ] `package.json` — minimal dev dependencies/scripts, preserve any concurrent leaf's existing tooling (AC8).
   - [ ] `bun.lock` — pin installed tooling (AC8).
   - [ ] `.gitignore` — ignore distribution, artifacts and test runtimes/downloads; preserve existing exclusions (AC8).
   - [ ] `test/plugin/blueprint.ts` — reproducible real plugins/users/site fixture, no embedded credentials (AC1–AC8).
   - [ ] `test/plugin/harness.ts` — environment/preflight, Playground process lifecycle, real PHP setup/assertion bridge, browser trace handling and native queue driving (AC1–AC8).
   - [ ] `test/plugin/fixtures.php` — actual forms, multiple notification/feed records, users, aging/queue fixtures; fixture observations use DB/native APIs (AC2–AC7).
   - [ ] `test/plugin/mu-plugin.php` — final mail logging, false siteverify and real feed/unsupported dispatcher fixtures; excluded from production ZIP (AC2–AC6).
   - [ ] Record supported source/hook/version inventory and verify the harness can install/submit each real plugin before writing a broad adapter.
2. **Core plugin and packaging**
   - [ ] `plugin/pirax-form-test/pirax-form-test.php` — metadata, guarded loading, lifecycle wiring (AC1, AC3).
   - [ ] `plugin/pirax-form-test/includes/settings.php` — options, capability/nonce protected settings flow (AC1, AC6).
   - [ ] `plugin/pirax-form-test/includes/marker.php` — parser, request/worker context and unsafe classification (AC2, AC3, AC6).
   - [ ] `plugin/pirax-form-test/includes/mail.php` — late idempotent recipient/header/subject transformation (AC2, AC3, AC5).
   - [ ] `plugin/pirax-form-test/uninstall.php` — guarded removal of owned options/cron (AC1).
   - [ ] `scripts/build-plugin.ts` — clean allowlisted uploadable ZIP and archive-content checks (AC1, AC8).
3. **Adapters and cleanup**
   - [ ] `plugin/pirax-form-test/includes/compatibility.php` — audited native-path inventory and preflight rejection of unsafe dispatchers (AC6).
   - [ ] `plugin/pirax-form-test/includes/gravity-forms.php` — detection, field-only CAPTCHA bypass, feed suppression, sync marked notifications and late deletion (AC2–AC6).
   - [ ] `plugin/pirax-form-test/includes/fluent-forms.php` — clean reCAPTCHA hook, email-only feed selection, per-job context and verified deferred cleanup (AC2–AC6).
   - [ ] `plugin/pirax-form-test/includes/cleanup.php` — hourly recovery with stable paging, native cascade/job cleanup and lifecycle unscheduling (AC7).
4. **Acceptance suites and retained evidence**
   - [ ] `test/plugin/plugin.test.ts` — real upload/settings/auth, marked/unmarked/wrong/empty-token, multi-notification/feed, CAPTCHA, unsupported integration, sync/async/retry cases (AC1–AC6, AC8).
   - [ ] `test/plugin/edge-cases.test.ts` — PHP behavior in actual WordPress: marker boundaries/nesting/ambiguity, headers, invalid settings, cleanup boundaries/paging/timezone, disabled dependencies and uninstall (AC1, AC3, AC6, AC7).
   - [ ] `test/plugin/artifacts.ts` — sanitization, secret-absence validation, trace/mail/entry/feed result manifest (AC8).
5. **Every affected human/agent document**
   - [ ] `README.md` — new root build/test entry points and plugin README link; keep independent of unimplemented checker commands.
   - [ ] `plugin/pirax-form-test/README.md` — install/settings, marker/options/mail contract, tested versions/hooks, CAPTCHA behavior, rejected integrations, async/recovery limitations, cron/rotation, uninstall, operator rollout one site → group → all with explicit go-ahead.
   - [ ] `test/plugin/README.md` — local prerequisites, credential **names** and acquisition, root-environment invocation from a worktree, real harness/fixtures, queue controls, artifact paths/privacy and verification commands.
   - [ ] No existing agent document is affected or invented; `learnings/LESSONS.md` remains unchanged unless implementation establishes a reusable evidenced lesson. No `.env` or `.env.*` file is opened or edited by this pass/implementation workflow.

## Concrete verification

From the code worktree, after implementation (these commands are planned, not yet executed):

```sh
bun install
bunx playwright install chromium
bun run build:plugin
bun --env-file=/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/.env run test:plugin
bun --env-file=/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/.env test
```

`test:plugin` must run the Bun plugin suites with adequate per-test timeouts. Each run writes `artifacts/plugin/<run>/manifest.json`, redacted `mail.jsonl`, `feeds.jsonl`, `entries.json`, and `trace.zip`; the manifest records versions, tested cases, ZIP digest and artifact paths without values from the environment. Report these paths in the implementation report. Verify retained artifacts and ZIP do not contain the configured token, licensed sources or test-only PHP.

Concrete scenario: configure two notifications with different To/Cc/Bcc recipients and one enabled native integration. Submit `<token>-abc123`: both mails are redirected/tagged, the integration does not execute or enqueue, and the entry disappears only after notifications. Repeat with an ordinary value: original recipients and integration remain active and the entry survives. For FF, enable native email queueing, make the second notification retryable, and process an ordinary job between the marked jobs: the marked entry survives until the retry finishes, the ordinary job keeps its original recipients, and final marked cleanup leaves no related submission rows. Separately age a blocked/stale test beyond one hour and run the real scheduled sweep, preserving an equally old ordinary entry.

## Open limitations and review notes

- Local `pre_wp_mail` logging verifies recipient transformation, **not** delivery by a live SMTP plugin or IMAP arrival. That belongs to form-check and the operator-approved rollout.
- Native dispatch compatibility is demonstrated for the inspected versions, not every GF/FF add-on, payment path, custom PHP callback, or later mail transport. Unsupported combinations must be rejected, not silently treated as safe.
- WP-Cron is traffic-driven, so hourly scheduling is not an exact wall-clock cleanup guarantee. Active/stuck workers and token rotation affect recovery as described in D9; preserve those limitations in documentation instead of claiming all entries vanish exactly at one hour.
- The FF source supports the clean reCAPTCHA bypass, so choosing the brief's “no clean hook” fallback for the pinned version would be incorrect. Other anti-spam/security mechanisms are deliberately unchanged.
- No implementation tests have run in this planning pass. Evidence here is file/source inspection, tool availability and credential-presence/access checks only.

## Implementation notes — 2026-09-25

- D10/D12: Playground's native fs-ext module cannot load under Bun on this machine; the Bun harness launches `runCLI` under Node through a stdin/stdout PHP-control protocol (no HTTP backdoor). Node 26 needs the native dependency built with node-gyp and normal compiler prerequisites. `test/plugin/playground.ts` holds the blueprint in place of a redundant `blueprint.ts`.
- D11: Playwright omits network recording when snapshots are disabled. Keep screenshots/snapshots/sources disabled as planned and supplement the action trace with a separately sanitized Playwright request/response ledger; do not enable DOM snapshots merely to obtain network evidence. Add the ledger in the acceptance/evidence unit.
- The resolved changed-test checks are targeted `bun test test/plugin/<unit>.test.ts --timeout 180000` invocations with the configured base and registered repository environment; no existing changed-test runner or configured blocking checks exist. B still owns the final full `bun test` run.
