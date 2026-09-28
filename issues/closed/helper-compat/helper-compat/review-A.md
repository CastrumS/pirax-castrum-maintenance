# Review A — helper-compat (check.review, initial)

- Seat A, 2026-09-28. `debate: no`: there are no positions/rebuttal artifacts, as expected.
- Base: `e2075daad1c5b0dd2438ff61d71e606c47819a39`. Reviewed head: `aac43d6516b3cbb8f2187f1b98b49c36ac6ecef6` (19 files, +1797/−99). Worktree clean.
- Read: brief, design, plan (including the dated implementation notes), `implementation/report.md` and worker returns where cited, ponytail, the full diff, the affected docs, and the exact vendor sources in `.cache/helper-compat-audit/` (CleanTalk 6.88, FF Pro 6.2.14, FluentSMTP 2.4.0, GF 3.1.2), plus FF 6.2.14 from `.cache/plugin-test/`.
- Blindness: while checking the registered checkout's `learnings/LESSONS.md` for duplicates before recording my lesson, I saw one uncommitted line that seat B added. I did not open `review-B.md`, `review-B-evidence.json` or B's history file, and I did not pursue that line. Nothing below derives from it.

## Verdict: `fix`

One blocking finding (F1) and four nits.

## Verification evidence

| Check | Result |
|---|---|
| `bun run typecheck` (rerun at head) | exit 0 |
| `git diff --check e2075da..HEAD` | exit 0 |
| Excluded surfaces (`src/`, `sites.yaml`, `scripts/`, `.env.example`) | no diff |
| `AREA.md` files in the diff (`git diff --name-only … \| grep -c 'AREA.md$'`) | 0, so no path listing applies (`grounding: none`) |
| Recorded blocking checks | `implementation/final-full-suite.log`: 239 pass, 0 fail, exit 0, finished 20:11:19. Commit at 20:13:55 with a clean tree. Build, typecheck, diff-check and privacy logs present. I did not rerun the full suite because there is no code change since and the evidence is complete. |
| Version/ZIP/allowlist | Header 0.2.0. `scripts/build-plugin.ts` unchanged. `core.test.ts` asserts the ten-file allowlist and the 0.2.0 header natively. |
| Native reproduction of F1 | `review-A-repro-gf-modern-ajax.ts` and `.log` in this folder: the real full stack via the worktree harness, a disposable Playground site, output limited to booleans, counts and hook names. `findSecret` over its artifacts (`artifacts/plugin/review-a-gf-true-ajax-2026-09-28T18-26-16-256Z/`) and its log: 0 hits. |

What I confirmed from source and diff:

- **CleanTalk FF binding.** It is a closure from `Integrations::__construct`, captures `integration_name`, sits at priority 10 and is bound only when `forms__contact_forms_test` is on (`inc/cleantalk-integrations-by-hook.php:542-552`, `lib/Cleantalk/Antispam/Integrations.php`). `is_suppressible()` and `cleantalk_unrecognized('ff')` match this.
- **CleanTalk skips FF in its generic AJAX check.** `fluentform_submit` is in `$_cleantalk_hooked_actions` (`inc/cleantalk-ajax.php:119`), unconditionally.
- **FF Pro callbacks on unaudited submission hooks are read-only.** `fluentform/submission_message_parse`, `fluentform/submission_confirmation`, `fluentform/validation_errors` (`fluentformpro.php:434,447,462`) are read-only transforms. Payment and user-registration callbacks land on audited hooks and block. Only one Pro closure is on `fluentform/global_notify_completed` (`:155`).
- **Suppression and restore.** Guards run at 9/998 and restore puts bindings back for ordinary work. The one-request test covers it, including restoring while the same hook is being dispatched.
- **Panel.** It sits inside the existing `manage_options` gate. Every dynamic value is escaped. The render probe shows identical hooks and no option writes around rendering.
- **FluentSMTP.** Its `wp_mail` replacement applies `wp_mail` then `pre_wp_mail`, so the helper's filter and guard run. Envelope and Simulator evidence reach the transport boundary.
- **Audit table references.** All vendor `file:line` references in `test/plugin/README.md` match the sources.
- **Documented mismatches accepted as boundaries.** CleanTalk bypasses `pre_http_request` (it calls `$requests_class::request`, `lib/Cleantalk/ApbctWP/HTTP/Request.php:67-77`), so the Requests-transport evidence is the stronger boundary. The FluentSMTP pin is 2.4.0 exactly, per the design's exact-version rule.
- **In-diff lesson.** The new `LESSONS.md` line and its history file match the evidence in `implementation/worker-1.md`, "Privacy verification".

## Findings

### F1 — Fix: a marked Gravity Forms modern-AJAX submission sends the marker, including the secret token, to CleanTalk and is accepted; the panel says `ready`

**Route.** GF 3.1.2 "modern" AJAX submission:
- `gform_submission_method=ajax`, selected through `gform_form_args` or the `gform/submission/pre_submission` JS filter (`form_display.php:1033-1040`).
- The theme JS posts `FormData(form)` plus `action=gform_submit_form` to `admin-ajax.php`, handled by `wp_ajax_nopriv_gform_submit_form` (`includes/ajax/class-gf-ajax-service-provider.php:68-69`).

The checker supports this route: `README.md:217` ("GF postback/modern AJAX … are supported"), `src/forms/submit.ts:57` (route `gravity-ajax`) and `test/forms/playground.test.ts:171`.

**What CleanTalk 6.88 does on that request.**
- `admin-ajax` takes the admin branch (`cleantalk.php:717`). `gform_submit_form` is not in `$_cleantalk_hooked_actions`, so `ct_ajax_hook` is added on `plugins_loaded` for anonymous visitors (`cleantalk.php:745-787`, the add at `:786`).
- `apbct_is_skip_request(true)` has no GF exclusion.
- `ct_ajax_hook` builds the message from `$_POST` and calls `apbct_base_call()` (`inc/cleantalk-ajax.php` ~:557). `GetFieldsAny::skipExclusionsOnVulnerableFormsData` deliberately keeps GF data.
- The audited GF bindings come from `apbct_init`, which is hooked only on non-admin requests (`cleantalk.php:837`, `inc/cleantalk-public.php:275-280`). So on this route there is nothing for the helper to remove.

**What the helper does.**
- `cleantalk_unrecognized('gf')` expects GF bindings only when `has_action('plugins_loaded', 'apbct_init')`. On `admin-ajax` it expects none, so `compatibility_report('gf')` is ready and `prepare_marked_submission()` accepts.
- Classification happens at `gform_pre_validation`, long after CleanTalk already sent the POST at `plugins_loaded`.

**Reproduced natively** on the audited stack (GF 3.1.2, FF and Pro 6.2.14, CleanTalk 6.88, FluentSMTP 2.4.0). The only change was a mu-plugin setting `submission_method = 'ajax'` on the fixture GF form. Output:

```text
panel GF verdict: ready
rendered gform_submission_method: ajax
admin-ajax gform_submit_form response: 200
marked GF confirmed: true
contained HTTP during marked GF true-AJAX submission: [{"purpose":"cleantalk-moderation","host":"moderate.cleantalk.org","api":"check_message","action":"gform_submit_form","hooks":["plugins_loaded"]},{"purpose":"blocked","host":"api.cleantalk.org","action":null,"hooks":["parse_request"]}]
CleanTalk request bodies (booleans): [{"hooks":["plugins_loaded"],"action":"gform_submit_form","has_marker_id":true,"has_token":true},{"hooks":["parse_request"],"action":null,"has_marker_id":false,"has_token":false}]
wp_mail calls: 2 all to redirect: true tagged subjects: true
GF entries before/after: 0 0
```

(The second record is the browser's pre-submit email check; see N1.)

**Why it blocks.**
- Brief "What" item 2: nothing is to be sent to CleanTalk's servers for a marked submission on both FF and GF, and a CleanTalk hook that cannot be neutralised must cause rejection.
- Brief done-criterion 1: a marked GF submission makes zero HTTP requests to CleanTalk hosts.
- Plan AC1: zero submission-related CleanTalk attempts.
- Plan AC3: "Failure to identify/suppress an expected active CleanTalk integration is a blocker, not success."
- Plan D2: "Verify … any request-level path before claiming submission isolation."
- Design: fail closed, and no secrets. Here the shared marker token leaves for a third party.

**Wrong doc claims:**
- `test/plugin/README.md`, "Other dispositions": "GF is checked only through its own binding."
- `plugin/pirax-form-test/README.md`, "Suppressed for marked submissions only" and "CleanTalk browser traffic…": the GF rows ("Effect prevented: Moderation request, spam verdict …") and "Only the marked form POST is covered" imply marked GF POSTs never reach CleanTalk.

**Done when:**
1. On the audited stack, a marked GF modern-AJAX submission makes zero CleanTalk moderation requests, and no CleanTalk-bound request carries the marker or token. CleanTalk's generic check runs at `plugins_loaded` (priority 10), so it must be neutralised before then. One way: the helper removes exactly `ct_ajax_hook` at an earlier `plugins_loaded` priority for token-bearing `gform_submit_form` requests and verifies the removal. The alternative is to refuse such submissions without any CleanTalk call. Rejecting at `gform_pre_validation` is too late.
2. Ordinary modern-AJAX GF submissions keep CleanTalk's generic check.
3. A native full-stack test covers marked and ordinary GF modern-AJAX submissions. The reproduction script is a starting point.
4. Both READMEs, and the panel boundary text if affected, describe the per-route behaviour accurately.
5. The leak happens before the version gate, so a non-6.88 CleanTalk on this route also sends before rejection. The repair should state how that case is handled, at minimum in the docs.

### N1 — Nit: the whole marked browser visit is not CleanTalk-free (the brief's done-criterion 1 is met only per submission)

CleanTalk's pre-submit email check (`/wp-json/cleantalk-antispam/v1/check_email_before_post` → `api.cleantalk.org`) is on by default (`data__email_check_before_post => 1`, `lib/Cleantalk/ApbctWP/State.php:88`). The tests exclude exactly that path.

It carries the checker's configured address, not the marker: `src/forms/fill.ts` fills email controls with `config.address` (:124) and puts the marker only in a text or textarea control (:57, :84).

The helper cannot classify that request server-side without changing ordinary behaviour. The plan notes and plugin README disclose it. Suppressing it would need a checker change (`src/**`, excluded here), for example blocking that request in the checker's browser. That is an operator decision, not repair for this leaf.

### N2 — Nit: plan D5's control-padded/folded header regressions are not repeated on the FluentSMTP path

This is not a behaviour defect. FluentSMTP 2.4.0's `fluentMailSend` header split and parse (`app/Functions/helpers.php:424-459`) and its address handling (`:625-660`) match core line for line. `transform_mail()` emits unfolded single-line headers. So `review-regressions.test.ts` on the default stack exercises the same parse. The gap is coverage only.

### N3 — Nit: FluentSMTP keeps the marked notification in its email log

FluentSMTP logs every email by default (`log_emails => 'yes'`, `app/Services/Mailer/Providers/config.php:297`). The redirected notification's body normally includes the submitted fields, so it includes the marker and therefore the token. That row stays in the client site's `fsmpt_email_logs` and FluentSMTP's log view after the helper deletes the entry. The sweep does not touch it.

This is pre-existing in kind (any mail logger does the same) and outside the done-criteria. The plugin README's FluentSMTP paragraph should say so, so the operator can purge or disable logging for test mail.

### N4 — Nit: stale test comment

`test/plugin/stack-harness.test.ts:1-3` says CleanTalk moderation and the Pro webhook are "answered at pre_http_request". They are answered at the test Requests transport (`Pirax_Harness_Transport`), as `test/plugin/README.md` states.

## Docs

- I opened `plugin/pirax-form-test/README.md`, `test/plugin/README.md`, `README.md` (plugin section, test table, credentials, checker route line 217) and `test/forms/README.md` (GF modern AJAX coverage).
- The version tables, panel semantics, containment limits, simulation-only FluentSMTP claim and audit-table references are accurate.
- The wrong claims are the GF CleanTalk isolation statements listed under F1.

## Operator actions

- Unchanged from the report: add `FLUENT_FORMS_PRO_ZIP=` (empty value) to `.env.example`. Seats do not open `.env*`.
- Commit the lesson from this review, left uncommitted in the registered checkout:
  - one line in `learnings/LESSONS.md`
  - `learnings/history/2026-09-28-helper-compat-submission-routes-review-a.md`

---

## Re-check after repair round 1 — seat A, 2026-09-28

- Prior reviewed head: `aac43d6516b3cbb8f2187f1b98b49c36ac6ecef6`. Repaired head: `d7933c81beae1c8b1457f27b5078595f1f01ac38` (`fix: guard GF AJAX before moderation and sanitize HTTP evidence`; 8 files, +559/−28). The worktree is clean at that head.
- Scope: the repair diff only. I read:
  - the plan's repair-round-1 notes and the report's repair section;
  - `review-B.md` and `review-B-evidence.json`, now that the initial blind review is over, so that B's finding could be confirmed too;
  - the whole repair diff and the affected sections of both READMEs;
  - the CleanTalk 6.88 and GF 3.1.2 sources the new code relies on.

### Verdict: `nits`

Nothing blocks. A-F1 and B-F1 are fixed, and so are N2–N4. The repair introduced no defect. The only open item is N1, which needs an operator decision outside this leaf.

### Earlier findings

| Finding | Status | Evidence |
|---|---|---|
| A-F1 (GF modern AJAX sent the marker and token to CleanTalk) | **fixed** | See below. I reran the original reproduction unchanged on `d7933c8` (`review-A-recheck-gf-modern-ajax.log`, see below). |
| B-F1 (HTTP ledger kept inbound query strings) | **fixed** | The transport now writes a query-free `request`, and `pirax_harness_log()` keeps a record's own `request`. Only the transport and the two new probes set one, so the other ledgers are unchanged. A regression test uses a synthetic inbound query and nonce, and the evidence test asserts that no retained record has a query. My own count-only check of the final ledgers (compatibility: 105 records; stack-harness: 9) found 0 request queries, 0 nonces and 0 path queries. The single `carriesToken: true` record is CleanTalk's generic check (`plugins_loaded`, `gform_submit_form`) in the step noted as "GF modern AJAX marker outside fields", which is the intended ordinary positive control. |
| N1 (browser email pre-check) | open, operator decision | Unchanged by design. The plugin README still states the boundary, now "on each route above". |
| N2 (padded/folded headers via FluentSMTP) | fixed | The new FluentSMTP envelope and Simulator test has an ordinary positive control, and it passed. |
| N3 (FluentSMTP log retention) | fixed | The new plugin README paragraph is accurate for the `log_emails` default and leaves purging to the operator. |
| N4 (stale comment) | fixed | `stack-harness.test.ts:1-4` now names the test Requests transport. |

### A-F1 repair checked against source

**How the guard runs**
- `gf_ajax_guard()` is registered on `plugins_loaded` at `PHP_INT_MIN` when the file loads. The main plugin file requires every module (`pirax-form-test.php:21-27`), so the guard runs before CleanTalk's `ct_ajax_hook`, which CleanTalk binds at the default priority 10 (`cleantalk.php:786`).
- Ordinary requests return after a scan of `input_<n>[_<m>]` values by the plugin's own `parse()`.
- `parse()` reports `ordinary` only when the token appears nowhere (`includes/marker.php:36-64`). So any token occurrence, whether a valid or a malformed marker, takes the guarded path.

**Early reads for a token-bearing request**
- The GF version gate runs before any GF API call.
- The stored-field read uses the same query and unserialize as `GFFormsModel::get_form_meta()` (`forms_model.php:1048-1052`), without GF's cache or filters.
- The GF APIs it uses exist in 3.1.2 and are loaded with GF's main file (`gravityforms.php:250-251`):
  - `GFFormsModel::get_meta_table_name()` (:194)
  - `GFFormsModel::unserialize()` (:1005)
  - `GFCommon::send_json_error()` (`common.php:8465`)
- GF's AJAX handler reads the same `form_id` (`includes/ajax/class-gf-ajax-handler.php:40`).

**Suppression and refusal**
- `suppress_cleantalk_ajax_check()` removes only the priority-10 binding and then checks that it is gone. Any of the following refuses the request before the check can run:
  - a moved or wrapped binding;
  - a binding still present after the removal;
  - a GF or CleanTalk version other than the audited one;
  - the token in a field the stored form lacks.
- `cleantalk_ajax_check_expected()` mirrors CleanTalk's binding condition (`cleantalk.php:778-787`, inside the AJAX branch at :745). It differs in two places: `! empty()` against `== 1` for `data__protect_logged_in`, and it omits the `apbct_is_ajax()` term. Both differences can only cause a refusal, never let a bound check through.

**Done-when items**
1. **No CleanTalk traffic for marked submissions.**
   - The new native tests assert, on the audited stack, no CleanTalk request and no token-bearing HTTP. This covers marked, malformed, invalid-configuration, unknown-field, dynamic-field, wrapped, moved-to-priority-1, wrong-version and logged-in cases.
   - My rerun of the original reproduction confirms it independently.
2. **Ordinary requests keep the check.** Ordinary modern-AJAX requests keep CleanTalk's generic check (`genericCheck ≥ 1`, and exactly 1 in the adversarial cases).
3. **Native tests exist.** There are seven new modern-AJAX tests plus a modern-AJAX leg in the version-gate matrix. With N2's test, that makes 239 → 247 tests. All pass in `repair-1-final-full-suite.log`.
4. **Docs are corrected.**
   - The false "GF is checked only through its own binding" is replaced by per-route text and a new audit row. I checked the new source references against the sources: `cleantalk.php:777-787`/`:786`/`:837`/`:801-808` and `inc/cleantalk-ajax.php:234`.
   - The panel text ("callbacks that only load on public pages or later requests", `settings.php:106`) is still accurate, so it needed no change.
5. **Non-6.88 versions are handled.**
   - A non-6.88 CleanTalk is refused before the generic check.
   - Vendor bootstrap is disclosed as outside the proof. One disclosed path is the Bitrix24 `ct_contact_form_validate()` call at file load, in the admin branch at `cleantalk.php:801-808`, which I verified. It needs `your-phone`, `your-email` and `your-message` fields, names that GF's own inputs never use.

**Reproduction rerun** on `d7933c8`. The script is `review-A-repro-gf-modern-ajax.ts` with only the build step removed and the run renamed. It used the existing `dist/pirax-form-test.zip`, whose ten entries I verified are byte-identical to the committed `plugin/` files. Output:

```text
panel GF verdict: ready
rendered gform_submission_method: ajax
admin-ajax gform_submit_form response: 200
marked GF confirmed: true
contained HTTP during marked GF true-AJAX submission: [{"purpose":"blocked","host":"api.cleantalk.org","action":null,"hooks":["parse_request"]}]
CleanTalk request bodies (booleans): [{"hooks":["parse_request"],"action":null,"has_marker_id":false,"has_token":false}]
wp_mail calls: 2 all to redirect: true tagged subjects: true
GF entries before/after: 0 0
```

Before the repair, this same run produced a `check_message` moderation request at `plugins_loaded` whose body contained the marker id and the token. Now the only CleanTalk-bound request is the browser pre-check (N1), and it carries neither.

### Verification

| Check | Result |
|---|---|
| `bun run typecheck` (rerun at `d7933c8`) | exit 0 |
| `git diff --check aac43d6..HEAD` | exit 0 |
| Excluded surfaces or `AREA.md` in the repair diff | none |
| Uploadable ZIP | SHA-256 `8d2301d8…05acf`, matching the report; 10 entries byte-identical to the committed `plugin/` files |
| Recorded blocking checks | `repair-1-final-full-suite.log`: exit 0, 247 pass / 0 fail, 3135 `expect()` calls, 2071.99 s. Build, typecheck and diff-check exit 0; privacy scan 0 matches. I did not rerun the full suite: the evidence is complete and matches the committed production code. |
| Privacy of this re-check | `findSecret` with the token and both licensed ZIP paths over `artifacts/plugin/review-a-recheck-gf-true-ajax-2026-09-28T21-30-58-748Z/` and the log: 0 hits |

Report accuracy: the repair section's claims match the diff and the evidence. That covers the eight files, the 114 HTTP records, the one positive-control `carriesToken` record, the retained failed and interrupted runs, and the stated boundaries.

### Remaining documented boundaries (not findings)

These match the plan's repair checkpoint and are stated accurately in the plugin README ("Lifecycle limits of the early check") and the report:
- vendor bootstrap and `plugin_loaded` effects, including the Bitrix24 field layout;
- a check pre-registered at `PHP_INT_MIN`, or re-registered after the guard;
- the token outside GF field inputs reaching CleanTalk on ordinary requests;
- no whole-visit pre-check coverage (N1);
- no raw-socket containment;
- Simulator-only delivery;
- FluentSMTP log retention.

### New findings

None.

### Operator actions (re-check)

- Unchanged: add `FLUENT_FORMS_PRO_ZIP=` (empty value) to `.env.example`.
- Commit the review lessons, still uncommitted in the registered checkout:
  - `learnings/LESSONS.md`, which has A's line and B's line;
  - `learnings/history/2026-09-28-helper-compat-submission-routes-review-a.md`;
  - `learnings/history/2026-09-28-helper-compat-http-context-review-b.md`.
  - This re-check adds no new lesson.
- N1: decide whether to open a checker follow-up, for example blocking CleanTalk's pre-submit email check in the checker's browser.
- The earlier helper had the same GF modern-AJAX exposure while CleanTalk was active. If it was ever used on such a live form, consider rotating the token. Whether that happened is not established; the report says the same.

---

## Merge — seat A, 2026-09-28/29

- **Rebase.** Target: `origin/main` = `123b64319a52289e142780cd073e70d68627d61a` (fetched). The old base was `e2075da`.
  - Since the old base, `origin/main` gained `2271a7e` ("Initialize akrogon issue lifecycle") and its revert `123b643`. Both touch only `learnings/LESSONS.md` and cancel out, so the net diff from `e2075da` to `origin/main` is empty.
  - The rebase had no conflict. Prior reviewed head `d7933c8` became `13db6d032081a77e127845b1f1972a3ca2b8a472`, over `aac43d6` → `70927b0`. The tree is identical before and after (`a1a8f074…`), so no range-diff is needed.
  - There were no outstanding changes to commit, and the worktree is clean.
- **Base.** `AKROGON_BASE` refreshed from `akrogon config` after the rebase: `123b64319a52289e142780cd073e70d68627d61a`.
- **How the checks ran.** They ran in the worktree through a scratch wrapper, `bun --env-file=<registered-repo>/.env merge-checks.ts <AKROGON_BASE>`.
  - The wrapper printed only `present` for each of the 10 credential names the harness uses; no values were printed.
  - It redacted those values before keeping each log in this folder.
- **Advisory checks.** None are configured.

| Command (configured `checks`, run literally) | Result | Log |
|---|---|---|
| `bun run build:plugin` (prerequisite: the forms suite needs the ZIP) | exit 0; 10 files | `review-A-merge-build.log` |
| `bun run typecheck` | exit 0 | `review-A-merge-typecheck.log` |
| `: "${AKROGON_BASE:?AKROGON_BASE is required}" && bun test` (`test_changed`; its `bun test` is `test` verbatim, so this one run covers both) | **exit 0; 247 pass / 0 fail; 3135 `expect()` calls; 247 tests across 22 files in 2036.65 s** | `review-A-merge-test.log` |
| `git diff --check 123b643..HEAD` | exit 0 | `review-A-merge-diff-check.log` |
| Configured credential/path scan of `artifacts/plugin`, `dist` and this folder | 0 matches | `review-A-merge-privacy.log` |

- **ZIP.** The suites rebuilt `dist/pirax-form-test.zip`. It is gitignored and not deterministic, so its hash changed. After the checks it is `a59fda0ee996106b8b9dc227a35db300aa9d9e97a1248e3352754c9b060e887f`, with the same ten allowlisted files and header 0.2.0, as `core.test.ts` asserts.
- **Nit held → lesson.** N1 (CleanTalk's pre-submit browser email check) is reusable, so it is recorded in the registered checkout for the operator to commit:
  - one line in `learnings/LESSONS.md`;
  - `learnings/history/2026-09-28-helper-compat-browser-precheck-merge-a.md`.
- **Push.** `git push origin HEAD:main` was a fast-forward, `123b643..13db6d0  HEAD -> main`, and exited 0. A re-fetch then showed `origin/main` = `13db6d032081a77e127845b1f1972a3ca2b8a472`, and `git merge-base --is-ancestor 13db6d0 origin/main` confirmed it landed.
- **Operator notes.**
  - `.env.example`: still add `FLUENT_FORMS_PRO_ZIP=` (empty value).
  - The pushed branch adds one line to `learnings/LESSONS.md`, the implementation's credential-assertions lesson. The registered checkout still holds uncommitted changes to that same file: the review and merge lesson lines, and three new files under `learnings/history/`. Fast-forwarding the checkout's `main` needs those changes committed or set aside first. Keep every line.
  - N1 is still an open decision: whether to have the checker contain CleanTalk's pre-submit check.
  - If an earlier helper build ever ran against a live GF modern-AJAX form with CleanTalk active, consider rotating the token. Whether that happened is not established.
