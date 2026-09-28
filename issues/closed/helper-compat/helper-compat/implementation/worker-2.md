# Worker 2 report: production compatibility and fail-closed native tests

- **Worktree:** `/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/worktrees/helper-compat` (branch `helper-compat`).
- **Not committed.**
- **Not touched:** `src/**`, sites, deployment, dependencies, docs, `.env*`, and the build allowlist.
- **Unit 1:** all of its landed changes are kept. My only edit to its harness is the `uploadPlugin` notice fix listed below.

## Changed files and reasons

### Production (5 existing files; no new production file; the ten-file build allowlist is unchanged)

`plugin/pirax-form-test/includes/compatibility.php` — D1–D3, shared model.

- **Pins:** `AUDITED_VERSIONS` adds `ff_pro` 6.2.14, `cleantalk` 6.88 and `fluent_smtp` 2.4.0, compared as exact strings.
  - `OPTIONAL_PLUGINS` says which plugins apply: Pro applies to FF only; CleanTalk and FluentSMTP apply to both.
  - `detected_version()` returns the runtime version:
    - `GFForms::$version`, `FLUENTFORM_VERSION`, `FLUENTFORMPRO_VERSION`, `APBCT_VERSION` (read from the plugin header) and `FLUENTMAIL_PLUGIN_VERSION`;
    - `''` when the plugin is demonstrably active but its version is unreadable, which counts as not audited;
    - `null` when the plugin is absent.
- **Suppressed bindings:** `suppressed_callbacks()` lists the audited side-effect bindings as hook → id → [owner, exact priority].
  - A binding counts as suppressible only while its owner is the audited version.
  - For CleanTalk's FF binding, reflection must also show a `Cleantalk\Antispam\Integrations` `$this` and a captured `integration_name === 'FluentForm'`.
- **Collector:** `callback_findings()` is a side-effect-free structured collector returning `unaudited` (hook, priority, id) and `suppress` bindings.
  - `unaudited_callbacks()` keeps its string-list contract; `$plugin` is a new optional parameter.
  - `callback_id()` is unchanged.
- **Hook expansion:** `inspected_hooks($plugin, $form)` covers GF's generic hooks plus the submitted form's `_<id>` variants. For the admin overview (`$form = null`) it covers every registered numeric variant.
- **Unrecognized CleanTalk binding:** `cleantalk_unrecognized()` blocks when CleanTalk 6.88's check is switched on for this request but its binding is not recognized.
  - FF: the check is on when the `forms__contact_forms_test` setting is on.
  - GF: the check is on when `apbct_init` is hooked, which happens on public requests only.
  - A check that is switched off needs no binding.
- **Report:** `compatibility_report($plugin, $form = null)` is side-effect free and returns versions, unaudited callbacks, suppress bindings, reasons and a ready flag.
  - `gf_supported()` and `ff_supported()` keep their payment, non-`form` and GF post-field gates and now use this report.
- **Mutation:** `suppress()` and `restore_suppressed()` are the only functions that change hooks.
  - `suppress()` removes the exact bindings, keeps them for restoring, and verifies that none are left.
  - `prepare_marked_submission()` = supported && suppressed, so a failed removal blocks the submission.

`includes/gravity-forms.php`:
- `gf_detect()` restores earlier removals, then calls `prepare_marked_submission('gf')` where it used to call `gf_supported()`.
- `gf_guard` runs at priority 998 on `gform_entry_is_spam` and `gform_confirmation`, just before CleanTalk's 999. It removes the bindings again for marked work and restores them otherwise.

`includes/fluent-forms.php`:
- `ff_detect()` restores earlier removals, and `ff_verdict()` calls `prepare_marked_submission('ff')`. That still happens at `is_form_renderable`, before CAPTCHA and insert.
- `ff_guard` runs at priority 9 on `before_insert_submission`, `before_form_actions_processing` and `submission_inserted`.
- `ff_guard_completed` runs at priority 9 on `global_notify_completed`. It treats the call as marked if the entry has a stored test id, which covers queue runners, or if the request is marked.
- Feed narrowing, stamping, queue classification and cleanup are unchanged.

`includes/settings.php` — D4:
- `render_compatibility()` is called inside the existing `manage_options`-gated `render_settings()` and after the save form.
- It shows GF and FF sections, each with:
  - version rows ("not active" or "unknown version" where applicable);
  - one `ready` / `blocked: <reasons>` verdict;
  - all unaudited callbacks grouped by hook, with their priority.
- A boundary sentence says `ready` covers only this admin page's loaded plugins and hooks, not every form, the marker, CAPTCHA, public-only or later callbacks, or delivery.
- Everything is escaped at output. The page has no JavaScript, endpoint, toggle, persistence or secrets.

`pirax-form-test.php`: header `Version: 0.2.0`.

`mail.php` is unchanged: the real FluentSMTP path showed no incompatibility.

### Tests (test-only)

- `test/plugin/compatibility.test.ts` (new, 14 tests; full stack; `setDefaultTimeout(180_000)`, 600 s startup): criteria 1–5 natively. The case list is below.
- `test/plugin/core.test.ts`:
  - The built header must be `0.2.0`.
  - New panel test (default stack):
    - exact core rows, and absent optional plugins are not listed;
    - boundary text;
    - a **real mu-plugin file named `pirax-<script>alert(document.domain)<script>.php`**, read back by exact name and sha256, whose closures and named callbacks sit on GF, FF and GF `gform_after_submission_<id>`: all 4 are listed by hook, escaped, with no script element or dialog and no token in the page;
    - the preflight uses the same collector;
    - render snapshots are identical before and after, with no option writes;
    - editor and subscriber get 403 and no panel; anonymous gets a 302;
    - after cleanup, both are ready again.
- `test/plugin/safety.test.ts`: exact-string matrix for the new pins, and default-stack reports that are ready and show core versions only.
- `test/plugin/mu-plugin.php` (option-driven, off by default):
  - `pirax_harness_ct_rebind` wraps CleanTalk's FF closure, so it still runs but is unrecognizable.
  - `pirax_harness_ct_late` re-registers CleanTalk's real checks between classification and dispatch, on unaudited hooks (`fluentform/filter_insert_data`, `gform_field_validation`).
  - `pirax_harness_render_probe` snapshots every GF/FF hook binding (hook, priority, WP unique key) and counts option writes around `settings_page_pirax-form-test`.
- `test/plugin/harness.ts`: `uploadPlugin` now accepts an "activated" notice anywhere among the notices. Before, only the first notice was read, and on the full stack FluentSMTP's "no connection" notice comes first. This is a test-harness fix.

## Newly audited callbacks (exact identities, all on exact owner versions)

| Hook | Callback identity (`callback_id`) | Prio | Owner | Disposition | Source (vendor ZIP) | Why suppressed |
|---|---|---|---|---|---|---|
| `fluentform/before_insert_submission` | `closure:cleantalk-spam-protect/lib/Cleantalk/Antispam/Integrations.php`, with `$this` an `Integrations` instance and captured `integration_name=FluentForm` | 10 | CleanTalk 6.88 | suppressed (marked only) | `Integrations.php` `__construct` (closure) → `checkSpam`; bound at `plugins_loaded` in `inc/cleantalk-integrations-by-hook.php:542-552`, only when `forms__contact_forms_test` is on | `apbct_base_call` → moderation HTTP and spam verdict |
| `gform_entry_is_spam` | `apbct_form__gravityForms__testSpam` | 999 | CleanTalk 6.88 | suppressed | `inc/cleantalk-public.php:278` (`apbct_init`, public requests only); body `inc/cleantalk-public-integrations.php:2131` | moderation HTTP, spam verdict, `GFFormsModel::delete_lead` |
| `gform_confirmation` (not an audited hook) | `apbct_form__gravityForms__showResponse` | 999 | CleanTalk 6.88 | suppressed | `cleantalk-public.php:279`; body `…-integrations.php:2308` | replaces the confirmation with CleanTalk's spam text |
| `fluentform/before_form_actions_processing` | `FluentFormPro\classes\DoubleOptin::processOnSubmission` | 10 | FF Pro 6.2.14 | suppressed | `src/classes/DoubleOptin.php:48`, body `:148` | status `unconfirmed`, `wp_mail` to the submitter, early JSON response instead of notifications |
| `fluentform/before_form_actions_processing` | `FluentFormPro\classes\AdminApproval\AdminApproval::processOnSubmission` (registered only while the `admin_approval` module is on) | 10 | FF Pro 6.2.14 | suppressed | `src/classes/AdminApproval/AdminApproval.php:44`, body `:104` | admin mail, status `unapproved`, early response |
| `fluentform/submission_inserted` | `FluentFormPro\classes\DraftSubmissionsManager::delete` | 10 | FF Pro 6.2.14 | suppressed | `src/classes/DraftSubmissionsManager.php:32`, body `:556` (`deleteSavedStateDraft` `:937`, `deleteStepFormDraft` `:974`) | deletes the visitor's saved-state and step drafts |
| `fluentform/global_notify_completed` | `closure:fluentformpro/fluentformpro.php` | 10 | FF Pro 6.2.14 | suppressed | `fluentformpro.php:155` | `deleteEntries` when `delete_entry_on_submission` is on |

**Pro webhook.** The Pro WebHook feed type `fluentform_webhook_feed` is still excluded before enqueue by the existing `ff_email_feed_only` narrowing. Native evidence: zero `ff_scheduled_actions` or Action Scheduler jobs for marked submissions, and zero capture hits.

**FluentSMTP 2.4.0.** Version pin only. Its active stack has no callbacks on the audited hooks. Its replacement `wp_mail` hands the redirected envelope to the Simulator (envelopes and Simulator rows are asserted).

**Checked and still blocking** (not accepted, not needed for the plain form):
- Inventory: `InventoryController::insertGlobalInventory` on `submission_inserted` 10, and `closure:fluentformpro/src/classes/Inventory/InventoryController.php` on `before_insert_submission` 10. A native test covers this.
- Post `Components\Post\Bootstrap` (`before_form_actions_processing`).
- `PaymentHandler::maybeHandlePayment` (`before_insert_payment_form`).
- UserRegistration `captureUpdateTarget` (`notify_on_form_submit` 9).
- `AffiliateWPFF::addPendingReferral` (`submission_inserted` 99).

**CleanTalk generic paths audited.**
- FF: `fluentform_submit` is in CleanTalk's `$_cleantalk_hooked_actions` (`inc/cleantalk-ajax.php:119`), so its generic AJAX check skips FF submissions.
- GF: runs only through its own binding.
- Native evidence: zero moderation for marked submissions.

## Acceptance outcomes

1. **AC1 met.**
   - Marked FF and GF each confirm (FF's own message; "Pirax GF thanks"), with only notification A enabled per form (B disabled in `beforeAll`).
   - Each produces exactly one envelope: `to=[redirect]`, `cc=[]`, `bcc=[]`, one `X-Pirax-Form-Test`, one prefix, FluentSMTP `wp_mail`, and the Simulator transport. Each also produces exactly one Simulator `sent` row to the redirect.
   - Zero CleanTalk attempts: no moderation, and no other CleanTalk-host call except the browser's pre-submit email check (see limitations).
   - Zero Pro webhook FF/Action Scheduler jobs before draining and zero capture hits after; no feed; no entry after draining.
   - Ordinary controls run before and after: CleanTalk moderation ≥1 each for FF and GF, FF's webhook job then exactly one capture for its entry, the FF and GF ledgers, original To/Cc/Bcc and untagged mail, and retained entries.
   - CleanTalk stays in builtin-HTTP mode.
2. **AC2 met.**
   - Exact pins, with a helper matrix (later patch, shorter, longer, prerelease, empty) and default-stack reports.
   - **Native gates:** the installed vendor declaration is edited in place, fresh requests are made, then the file is restored. The restored hash is asserted; original and altered hashes are in `compatibility-notes.jsonl`.
     - CleanTalk 6.88.1: FF and GF both rejected with the literal message.
     - Pro 6.2.15: FF rejected, GF succeeds redirected.
     - FluentSMTP 2.4.1: both rejected.
   - With a wrong version, nothing is saved or mailed and no moderation happens.
   - Absent optional plugins: the existing default-stack suites (adapters, safety, review-regressions, core, forms) pass on the new code.
   - The payment, non-form and GF post-field gates are unchanged, and the existing tests for them pass.
3. **AC3 met.**
   - Removal happens before execution and for marked submissions only.
   - Contact-form check switched off: no binding is needed and the marked submission is accepted. The ordinary control shows zero moderation, which proves the check was really off.
   - Rebound (unrecognizable) closure: marked FF is rejected, the panel names it and gives the reason, and the ordinary submission is still moderated once.
   - Late re-registration: a real new `Integrations` closure and testSpam are registered between classification and dispatch. Zero moderation for marked FF and GF; ordinary submissions are still moderated.
   - One-request restoration: the marked completion removes exactly the 4 FF bindings, the next ordinary completion restores them, and the inventory ends identical, including closure object keys.
   - There is no production HTTP interception or fake approval.
   - Panel render: hooks and options are identical before and after.
4. **AC4 (brief criterion 4) met.**
   - Ordinary double opt-in: status `unconfirmed`, opt-in mail to the visitor, no notification. Marked: FF's message, one redirected notification, no entry.
   - Admin approval: the same shape, with status `unapproved` and an admin mail.
   - Drafts: Pro deletes the ordinary visitor's draft (via `__fluent_state_hash`); the marked draft survives.
   - Auto-delete with queued mail failing once, the race:
     - Pro deletes the ordinary entry, and its retryable job, as soon as FF's pending-only completion fires.
     - The marked entry survives with its job failed/1.
     - FF's WP-Cron retry delivers one redirected mail, and then the helper removes the entry.
   - The webhook is excluded before enqueue. Inventory still blocks.
5. **AC5 met** on both stacks.
   - Default stack: `core.test.ts`.
   - Full stack: exact rows (GF: GF, CleanTalk, FluentSMTP; FF: FF, Pro, CleanTalk, FluentSMTP) and `ready`.
   - A wrong CleanTalk version shows the version reason **and** still lists CleanTalk's closure under FF.
6. **AC6 met.**
   - All existing tests are green, and the red → green evidence is below.
   - Header is 0.2.0; the ZIP still contains exactly the ten allowlisted files.

## Tests run

Configured command, exactly as in the brief (Bun loads the worktree `.env` itself; values were never printed):

```sh
AKROGON_BASE=e2075daad1c5b0dd2438ff61d71e606c47819a39 bash -c ': "${AKROGON_BASE:?AKROGON_BASE is required}" && bun test'
```

**Red** — new tests with the HEAD production plugin, my production files set aside in `/tmp` and restored afterwards (the restore was verified with `diff -rq`): `225 pass, 14 fail, Ran 239 tests across 22 files [1900.93s]`, exit 1. Log (scrubbed, 0 secret hits): `/tmp/hc-evidence-2-red.log`. The 14 failures are exactly the new criterion tests:
- core: `build:plugin` (header is not 0.2.0) and the panel test;
- safety: the pin matrix;
- compatibility, 11 tests: every marked full-stack case (old plugin: `423` blocked), Pro features, auto-delete, one-request restoration, CleanTalk off/rebound, late re-registration, full-stack panel, the three version gates (panel missing), and Inventory (panel missing).

The 3 full-stack ordinary-control, other and evidence tests passed on the old plugin, as expected.

**Green** — same command, with the new production files restored: `239 pass, 0 fail, Ran 239 tests across 22 files [1953.63s]`, exit 0. Log (scrubbed, 0 secret hits): `/tmp/hc-evidence-2-green.log`.
- All existing suites pass: forms, core, adapters, safety, review-regressions, harness and unit 1's stack-harness.
- The build ran inside the suites. `dist/pirax-form-test.zip` has the ten allowlisted files and header 0.2.0; the core test asserts both.
- Privacy: `findSecret` with the token and both licensed paths over the 32 plugin artifact dirs from this session found **0 hits**. The suites assert the same for their own runs. Only counts were printed.

**Debugging runs** (not evidence):
- `bun --env-file=.env test test/plugin/compatibility.test.ts`:
  - first run: 12/14. Both failures were test-side: Pro's deletion cascades the ordinary job, and the first late fixture sat on an audited hook, where the preflight correctly blocked it.
  - second run: 14/14 [520 s].
- `bun --env-file=.env test test/plugin/core.test.ts test/plugin/safety.test.ts`: 18/18.
- `bun run typecheck`: clean. `git diff --check`: clean.
- **Dev probe:** a long-lived stack at `/tmp/hc-probe/`, outside the worktree, used for the live hook inventory and the red observation. Its `artifacts/plugin/probe-*` dirs are gitignored.
  - Live hook inventory, captured inside real FF and GF submission requests, matches the table above.
  - Red observation on the old plugin: both marked full-stack submissions were rejected with the blocked message.

## Native evidence paths

All under `artifacts/plugin/` in the worktree (gitignored).

- **Green full stack:** `compatibility-2026-09-28T15-34-44-877Z/`
  - `compatibility-notes.jsonl`: ordinary-control ids, HTTP and jobs (before and after); the marked window; Pro feature states; the auto-delete runner state (ordinary 8 deleted with its job, marked 9 kept with job failed/1); version-gate outcomes (CleanTalk FF 423 / GF rejected; Pro FF 423 / GF ok; FluentSMTP FF 423 / GF rejected); and the original and altered vendor-file sha256s.
  - `http.jsonl`, `envelopes.jsonl`, `simulator.jsonl`, `mail.jsonl`, `feeds.jsonl`, `entries.json`, `network.jsonl`, `manifest.json` (versions and the five ZIP hashes), and the admin and visitor traces.
- **Green default stack:** `core-2026-09-28T15-26-49-181Z/`, `safety-2026-09-28T15-30-58-252Z/`, `adapters-2026-09-28T15-21-01-478Z/`, `review-regressions-2026-09-28T15-30-03-630Z/`, `harness-smoke-2026-09-28T15-29-04-368Z/`, `stack-harness-2026-09-28T15-33-29-074Z/`.
- **Red full stack** (old plugin): `compatibility-2026-09-28T15-03-00-371Z/`.

## Known limitations

- **CleanTalk browser-side traffic is not suppressible by this plugin and is not "the submission".**
  - What it is: CleanTalk's frontend JavaScript (bot detector, telemetry, and the REST pre-submit email check `/wp-json/cleantalk-antispam/v1/check_email_before_post`, which calls `api.cleantalk.org`) runs from the visitor's browser before any marker is submitted.
  - In tests: it is contained (browser aborts; the PHP call is blocked) and excluded from the attempt count only by that exact REST path.
  - On a live site: CleanTalk would receive the checker's synthetic email address and browser signals, but not the marker. The checker places the marker in a text/textarea field, never an email field (`src/forms/fill.ts`).
  - Docs must state this.
- **Bindings CleanTalk registers only on public requests are not visible to the panel.** CleanTalk's GF bindings exist only there (`apbct_init`), so wp-admin cannot see them. The boundary text says so, and the submission-time preflight is authoritative.
- **A re-registration between the guard (priority 9/998) and the binding priority in the same dispatch is not caught.** The same applies to registrations on other hooks after dispatch. The late-registration test covers re-registration before the guard.
- **Restoring re-adds bindings at the end of their priority.** Relative order among same-priority callbacks is preserved in the audited stack, and the inventory-equality test proves it there. It is not guaranteed for arbitrary third-party callbacks added meanwhile.
- **Containment ceiling from unit 1 still applies.** It covers Requests-level PHP HTTP only; the evidence is for this exact configured stack.
- **FluentSMTP evidence is simulated.** It shows 2.4.0 simulation transport inputs, not real SMTP/IMAP delivery.
- **Wrong-version cases alter one declaration per plugin, one lookalike version each** (6.88.1, 6.2.15, 2.4.1). Other lookalikes are covered at helper level only.

## Documentation corrections required (next unit; not edited here)

- **`plugin/pirax-form-test/README.md`:**
  - exact versions (GF 3.1.2, FF 6.2.14, FF Pro 6.2.14, CleanTalk 6.88, FluentSMTP 2.4.0; 2.4.x is not a wildcard);
  - the panel and its "ready" boundary;
  - marked-only CleanTalk removal (FF closure; GF testSpam and showResponse), including the disabled vs unrecognizable rule;
  - the Pro suppression list, and that Pro modules still block;
  - remove "FF Pro" as a blocking example in the fail-closed list;
  - narrow the "After wp_mail" limitation to the simulated FluentSMTP evidence;
  - CleanTalk browser-side traffic;
  - version 0.2.0.
- **`test/plugin/README.md`:**
  - the new `compatibility.test.ts` suite and its budget (~9 min standalone);
  - the fixture options `pirax_harness_ct_rebind`, `pirax_harness_ct_late` and `pirax_harness_render_probe`;
  - the audit table above;
  - `compatibility-notes.jsonl`;
  - how altered-version fixtures are restored and hashed.
- **Root `README.md`:** plugin section and the tested stack.
- **Operator action carried from the plan:** add the name `FLUENT_FORMS_PRO_ZIP` (empty value) to `.env.example` if it is missing. Not read or edited here.

## Unverified criteria

- **Brief criterion 1, "zero CleanTalk attempts", holds only for the submission.** The browser's pre-submit email check (REST → `api.cleantalk.org`) still occurs for marked visits. It is contained in tests, and it is excluded by its exact request path rather than suppressed; it carries no marker. See Known limitations; the reviewer should decide whether the docs wording suffices.
- **Socket-level egress for PHP code that bypasses Requests is verified by construction only.** This is unit 1's ceiling.
- **Docs, `.env.example` and root README** are out of scope for this unit; the corrections are listed above.
- Nothing else is known to be unverified. The final lifecycle checks, including the build and typecheck, belong to B.
