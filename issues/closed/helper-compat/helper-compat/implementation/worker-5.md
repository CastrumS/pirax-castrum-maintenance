# Worker 5 — repair round 1 (A-F1, B-F1, A nits N2–N4)

- Before-head: `aac43d6516b3cbb8f2187f1b98b49c36ac6ecef6` (clean worktree). Nothing committed; the working tree holds the repair.
- Base for the changed-tests command: `e2075daad1c5b0dd2438ff61d71e606c47819a39`.
- Plugin version is still 0.2.0. No new production file, no allowlist change, no `src/**`, sites, scripts, dependency or `.env*` change. No `.env*` file was opened. Credentials reached processes only through `bun --env-file=<registered>/.env`, and scans print counts only.
- The B checkpoint added to §8 mid-run is handled below: dynamically added GF field, and a generic binding moved before priority 9.

## Per-finding outcomes

### A-F1 (fixed): a marked GF modern-AJAX submission leaked the token to CleanTalk's generic check

**Root cause.** On `admin-ajax.php` with `action=gform_submit_form`, CleanTalk 6.88 adds `ct_ajax_hook` to `plugins_loaded` at priority 10 (`cleantalk.php:777-787`, the add is at `:786`). That callback posts the whole `$_POST` to CleanTalk. The helper only classified at `gform_pre_validation`, which is far too late.

**Fix.** `gf_ajax_guard()` in `includes/gravity-forms.php` is registered on `plugins_loaded` at `PHP_INT_MIN`. It acts only when all of these hold:
- it is GF's modern AJAX route (`wp_doing_ajax()` and `$_REQUEST['action'] === 'gform_submit_form'`, the value admin-ajax dispatches on);
- GF is loaded;
- CleanTalk is active;
- a token is configured.

It then:
- reads the posted form's stored field ids (`form_id` via `absint( rgpost() )`, exactly as GF's handler reads it);
- classifies the values of the `input_<id>[_<sub>]` POST keys with the unchanged `parse()`;
- **for a token-bearing request** (valid or malformed marker) with GF 3.1.2 and CleanTalk 6.88: `suppress_cleantalk_ajax_check()` (`includes/compatibility.php`) removes exactly `ct_ajax_hook` at priority 10 and verifies that `has_action` is false afterwards. The normal `gf_detect()` preflight then decides, unchanged (marker, config, versions, callbacks, suppression).
- **otherwise it refuses in place**, before any CleanTalk callback, with GF's own AJAX error response (`GFCommon::send_json_error`, falling back to `wp_send_json_error`). The message follows the late order: invalid marker → marker message, config error → config message, else the blocked message. It refuses when:
  - GF or CleanTalk is at a non-audited or unknown version;
  - a `ct_ajax_hook` binding sits at any other priority;
  - CleanTalk's own condition says it binds the check here, but its audited binding is absent (wrapped or changed). `cleantalk_ajax_check_expected()` mirrors `cleantalk.php:745-787`: the POSTed action, CleanTalk's cookie-only `apbct_is_user_logged_in()` plus `data__protect_logged_in`, and `$_cleantalk_hooked_actions` / `$_cleantalk_ajax_actions_to_check`;
  - (B checkpoint) the token is in a GF-shaped `input_<n>` whose field id is not in the stored form, such as a field added by a form filter or an arbitrary `input_99`.
- **Ordinary requests** (no token in any GF field input) are untouched, and CleanTalk's generic check runs as before.

**B checkpoint.**
- The first landed version ran at priority 9 and had a late `gf_detect()` fallback that only rejected after CleanTalk might already have had the token.
- Both are replaced. The guard now runs at `PHP_INT_MIN`, and unmatched token-bearing GF-shaped inputs are refused early. The late fallback and its state were removed, so `gf_detect()` and `parse()` are unchanged from the reviewed head.
- Unrelated non-GF POST names, keys, query strings and cookies are still not classified.

**Early-initialization reasoning.**
- At `plugins_loaded` every plugin file is loaded. That means `GFFormsModel`, `GFCommon` and `rgpost` (GF's `gravityforms.php:249-256` requires them at load time), `$wpdb`, pluggable functions, and CleanTalk's globals and `apbct_is_user_logged_in()` are all available.
- GF itself initializes on `init` (`GFForms::init`) and registers its AJAX services on `plugins_loaded` 10. `GFAPI::get_form()` / `GFFormsModel::get_form_meta()` would build `GF_Field` objects, run `gform_form_post_get_meta` before add-ons hook it, and fill `GFFormsModel::$_current_forms`. All of that could change later behaviour.
- `gf_stored_form()` therefore repeats only the raw read: the same `SELECT display_meta … WHERE form_id=%d` against `GFFormsModel::get_meta_table_name()`, then `GFFormsModel::unserialize()`. It returns just the field arrays. It creates no objects, runs no filters and writes no cache.
- `get_meta_table_name()` caches `gf_db_version` in a static, the same value GF reads itself.
- The guard also reads `pirax_form_test_token` (and, only when refusing, the redirect option). It writes nothing.

**Native evidence.**
- Marked modern AJAX confirms with exactly one redirected Simulator mail. There are zero CleanTalk requests and zero token-bearing HTTP records, and no entry or feed is left.
- Ordinary modern AJAX keeps the generic check (`hooks:["plugins_loaded"]`, `action:"gform_submit_form"`), its entry, the ledger feed and the original recipients.
- Postback coverage is unchanged and still passes.

### B-F1 (fixed): the HTTP ledger kept inbound query strings

- `Pirax_Harness_Transport` now sets `request` to the path of the incoming `REQUEST_URI`, with the query cut off (`explode('?', …, 2)[0]`).
- `pirax_harness_log()` keeps a `request` the record already set (`??`), so the HTTP ledger no longer gets the raw URI appended.
- Every other ledger (mail, feeds, siteverify, envelopes, activations, render) behaves as before. The browser `network.jsonl` URL contract is unchanged.
- The HTTP record gained one boolean, `carriesToken`: whether the outgoing URL or body held the configured token, raw, URL-decoded or JSON-unescaped. Only the boolean is kept.
- `harness.ts` `HttpRecord` and `test/plugin/README.md` document both fields.
- Regression (`stack-harness.test.ts`): a synthetic inbound `REQUEST_URI` with `_wpnonce` and a query secret, next to the existing outgoing query/body secrets. It asserts `request === "/wp-admin/admin.php"`, `carriesToken:false`, and that none of the secrets, `_wpnonce` or `?` appear in the record.
- The evidence test also asserts that no retained `http.jsonl` record has a query in `request` or `path`.

### N2 (addressed)

- New `compatibility.test.ts` case sends control-padded (`\v` prefix, `Bcc\v:`) and folded (`\t` and space continuation) Cc/Bcc headers through FluentSMTP 2.4.0's real `wp_mail`, envelope observer and Simulator log. Nothing goes to real SMTP.
- Ordinary mail keeps all four Cc/Bcc recipients, which proves FluentSMTP's parser reads them.
- Marked mail has `to:[redirect]`, empty `cc`/`bcc`, `replyTo` kept, a single tag, and Simulator rows sent to the redirect only.
- Passed on the reviewed code too, as expected: this was a coverage gap, not a defect.

### N3 (documented)

The plugin README's FluentSMTP section now says:
- FluentSMTP logs every email body by default, so the redirected notification's log row keeps the marker and token;
- entry deletion and the sweep do not touch that log;
- there is no automatic log deletion;
- logging, purging and retention policy is the operator's call, with token rotation if such a log may be exposed.

### N4 (fixed)

The `stack-harness.test.ts` header now says CleanTalk and the webhook are answered at the test Requests transport (`Pirax_Harness_Transport`).

### N1 (unchanged)

The browser pre-submit email-check limitation stays as documented. There are no checker (`src/**`) changes.

## Changed files and reasons

- `plugin/pirax-form-test/includes/gravity-forms.php`
  - `gf_ajax_guard()` on `plugins_loaded` `PHP_INT_MIN`, plus `gf_is_ajax_submission()` and `gf_stored_form()`.
  - `gf_posted_values()` gained an `$others` flag, used for unmatched GF field-shaped inputs.
  - Header comment updated. `gf_detect()` is unchanged.
- `plugin/pirax-form-test/includes/compatibility.php`
  - `CLEANTALK_AJAX_CHECK`;
  - `cleantalk_ajax_check_expected()` (read-only mirror of CleanTalk 6.88's own binding condition);
  - `suppress_cleantalk_ajax_check()` (exact removal at 10 plus verification, or false).
- `plugin/pirax-form-test/README.md`
  - fail-closed list;
  - per-route CleanTalk section (FF / GF postback / GF modern AJAX, including early refusal cases and the unsupported dynamic-field boundary);
  - suppression table row for `ct_ajax_hook`;
  - generic-check binding condition;
  - lifecycle limits of the early check and the wrong-version limit;
  - per-route wording of the browser-traffic note;
  - FluentSMTP log-retention caveat (N3);
  - panel boundary sentence.
  - `settings.php` panel text needed no change. It already excludes callbacks that load only in later requests, and `core.test.ts` asserts it verbatim.
- `test/plugin/mu-plugin.php`
  - HTTP ledger: path-only `request` and the `carriesToken` boolean; `pirax_harness_log()` keeps a preset `request`.
  - New option fixtures, all off by default:
    - `pirax_harness_gf_ajax` (`gform_form_args` `submission_method=ajax`);
    - `pirax_harness_gf_dynamic_field` (adds a textarea field id 50 through `gform_form_post_get_meta`);
    - `pirax_harness_ct_ajax_rebind` (`'wrap'` | `'early'`), applied on `plugin_loaded` right after CleanTalk's file loads.
- `test/plugin/harness.ts`: `HttpRecord.carriesToken` and the `request` doc.
- `test/plugin/stack-harness.test.ts`: N4 comment, the inbound-query regression and the no-query evidence assertion.
- `test/plugin/compatibility.test.ts`:
  - `gfAjaxSubmit()` (native browser modern-AJAX submission; optional hidden inputs, query on GF's own `ajaxurl`, cookie), `tokenBearing()` and `genericCheck()`;
  - new tests:
    - marked and ordinary modern AJAX;
    - the early boundary: malformed marker, missing redirect, token in `input_99`, and token only in an unrelated POST name, query and cookie (ordinary, CleanTalk still runs, and its body carries the token as the observer's positive control);
    - generic check wrapped and moved to priority 1;
    - filter-added dynamic field;
    - FluentSMTP control-padded/folded headers;
  - the wrong-version loop now also covers GF modern AJAX;
  - the main marked test asserts no token-bearing HTTP.
- `test/plugin/README.md`: suite table, fixtures, `h.http()` contract (path-only `request`, `carriesToken`, modern-AJAX hooks), callback-audit row for `ct_ajax_hook`, corrected "CleanTalk generic paths" disposition, and duration note.

## Tests run

All logs are in this `implementation/` folder. Artifacts are under the worktree's `artifacts/plugin/`.

### Red (before and against the reviewed production code; only test infrastructure changed)

1. `bun --env-file=<registered>/.env test test/plugin/stack-harness.test.ts -t "query strings|evidence names"` → **exit 1, 0 pass / 2 fail** (`worker-5-red-stack.log`).
   - The record kept `request: "/wp-admin/admin.php?page=pirax-probe&_wpnonce=pirax-inbound-nonce&q=pirax-inbound-secret"` (synthetic values only).
   - The evidence check found a record with a query.
   - Artifacts: `stack-harness-2026-09-28T18-48-54-761Z`.
2. `bun --env-file=… test test/plugin/compatibility.test.ts -t "GF modern AJAX|through FluentSMTP|CleanTalk at another version"` → **exit 1, 1 pass (N2) / 4 fail** (`worker-5-red-compat.log`, artifacts `compatibility-2026-09-28T18-49-38-898Z`).
   - Marked modern AJAX, malformed/config and CleanTalk 6.88.1 each produced `cleantalk-moderation` `check_message` under `plugins_loaded` / `gform_submit_form` with `carriesToken: true`.
   - The wrapped check was accepted (`marked.ok` true).
3. After the B checkpoint, `/tmp/pirax-w5-red2.sh`: temporary `git checkout aac43d6 --` of the two production files, restored right after each run's ZIP build and verified with `cmp` (`restored-ok`).
   - Reviewed code, `-t "early boundary|wrapped|moved to plugins_loaded|a GF form filter adds"` → **exit 1, 0 pass / 4 fail** (`worker-5-red2-reviewed.log`, artifacts `compatibility-2026-09-28T19-03-25-393Z`). The notes show `carriesToken: true` generic-check calls for the refusal cases, wrap, early and the dynamic field, and each marked submission was accepted.
   - Current guard with its priority changed to 9, `-t "moved to plugins_loaded priority 1"` → **exit 1, 0 pass / 1 fail** (`worker-5-red2-priority9.log`, `.variant`, artifacts `compatibility-2026-09-28T19-05-53-322Z`). The submission was refused, but only after the moved priority-1 check had already sent `carriesToken: true`. This is the counterexample that requires `PHP_INT_MIN`.

### Intermediate targeted green (first-landed guard at priority 9 with the late fallback; superseded)

- `worker-5-green-stack.log`: stack-harness 5 pass / 0 fail, exit 0.
- `worker-5-green-compat.log`: 11 pass / 0 fail, exit 0.
- These are diagnostic only. The final evidence is below.

### Final green (final code; changed-tests command, run to completion)

`AKROGON_BASE=e2075daad1c5b0dd2438ff61d71e606c47819a39 bash -c ': "${AKROGON_BASE:?AKROGON_BASE is required}" && bun test`

- Run as the exact child command of a `bun --env-file=<registered>/.env --eval` wrapper that only supplies the environment and prints command, exit and elapsed time.
- Started 21:07:56, finished 21:41:17 (`worker-5-full-suite.start`, `.exit`).
- Result: **Exit 0 — 245 pass / 0 fail, 3074 expect() calls, 245 tests across 22 files, 2001.0 s** (`worker-5-full-suite.log`). That is 239 before, plus 6 new tests.
- Final artifacts: `artifacts/plugin/compatibility-2026-09-28T19-30-58-185Z`, `artifacts/plugin/stack-harness-2026-09-28T19-29-53-685Z`.
- Forms evidence: `runs/forms-browser-5e7fa577-…`, `runs/forms-playground-d20c28aa-…/summary.json`, `runs/forms-report-tests-6e796395-9730-42fb-b58c-2042a75dc8f9/summary.json`.

### Other checks

- `bun run typecheck`: exit 0.
- `git diff --check`: exit 0.

### Privacy scan (counts only, credentials loaded through `--env-file`)

- 3 of 3 credential names present.
- 0 hits of any credential value, raw or URL-encoded, in all 10 `worker-5-*` logs.
- 0 `X-Amz-Signature/Credential` markers.
- `findSecret` found 0 hits in both final artifact dirs.

Final `http.jsonl` counts:

| Suite | Records | `request` with query | nonce | `path` with query | `carriesToken` |
|---|---|---|---|---|---|
| compatibility | 97 | 0 | 0 | 0 | 1 |
| stack-harness | 9 | 0 | 0 | 0 | 0 |

The single `carriesToken` record is the intended ordinary positive control ("GF modern AJAX marker outside fields": token only in an unrelated POST name, so CleanTalk runs normally). Every marked, refused and version-gate step shows 0 token-bearing and 0 moderation records in `compatibility-notes.jsonl`.

## Known limitations

- **Lifecycle.**
  - The early check runs at `plugins_loaded` `PHP_INT_MIN`.
  - Anything that runs before it is outside the proof: plugin file loading, `plugin_loaded`, and `plugins_loaded` callbacks registered earlier at `PHP_INT_MIN`, which includes mu-plugins and alphabetically earlier plugins.
  - The CleanTalk 6.88 audit found no submission send there. For other CleanTalk versions the early refusal cannot undo what their bootstrap may do, and the version pin rejects the test without proving nothing was sent. The plugin README says so.
- **Arbitrary PHP.** A wrapper added *alongside* the intact original `ct_ajax_hook` would survive the exact removal, and the expected-binding check then passes. Detecting arbitrary extra callbacks is outside the audited inventory. The wrapped-instead-of-original case is detected and tested.
- **Dynamically added GF fields** holding the token are refused, not marked, on modern AJAX while CleanTalk is active. This is the documented conservative boundary. Postback, and modern AJAX without CleanTalk, are unaffected.
- **Browser pre-submit traffic (N1).** CleanTalk's bot detector, telemetry and `check_email_before_post` still see a test visit before the marked POST exists. No checker change was made.
- **FluentSMTP.** Its logs keep marked bodies, including the token (documented only). Simulator evidence is not real SMTP/IMAP delivery.
- **Panel.** It cannot see the admin-ajax-only generic check. It remains a current-page diagnostic, and the per-request checks decide.

## Unverified criteria

- Criterion 2, "unremovable" generic binding: not forced natively. `remove_action` on a named function at its known priority cannot fail in WordPress 7.1.2, so only the post-removal `has_action` verification guards it. The moved (priority 1), wrapped and wrong-version refusals are verified natively.
- Criterion 2, logged-in visitors: the path where CleanTalk skips its generic check (logged in without `data__protect_logged_in`, so nothing is expected and nothing is removed) was checked against the source only, not tested natively.
- Criterion 2, a non-3.1.2 GF on modern AJAX: refused early by design (`suppress_cleantalk_ajax_check` checks the GF version), not tested natively. Wrong versions of CleanTalk, Pro and FluentSMTP are tested natively.
- Final blocking checks (build, typecheck, full suite, privacy) are B's to run after this return, per §7.
