# Unit 5 — repair round 1: early GF AJAX isolation and HTTP context privacy

## 1. Goal

Repair A-F1 and B-F1 against reviewed head `aac43d6516b3cbb8f2187f1b98b49c36ac6ecef6`, refining plan D2/D6 without relaxing scope. Worktree: `/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/worktrees/helper-compat`. Also address scoped A nits N2–N4. This is repair 1 of 3; B must use a worker.

## 2. Numbered acceptance criteria

1. Native GF 3.1.2 modern AJAX (`gform_submission_method=ajax`, `action=gform_submit_form`) on the full exact stack succeeds marked, yields the existing redirected Simulator notification/cleanup contract and **zero submission-related CleanTalk requests**. No CleanTalk-bound body carries the marker/token. Ordinary modern AJAX still exercises CleanTalk and preserves mail/entry/feed behavior. Keep postback coverage too.
2. CleanTalk's generic callback is suppressed before it executes: `plugins_loaded` priority 10 is earlier than normal GF validation. Wrong CleanTalk version and unrecognized/unremovable generic binding are refused **before** that callback; no token egress before a later rejection. Include malformed-marker/config and input-scoping checks appropriate to the early boundary. Do not classify cookies/query/field names/unrelated POST values as GF field markers or populate GF's form cache before its initialization in a way that changes behavior.
3. New HTTP ledger context is path-only, including the inbound URI appended by the shared logger. A real harness regression adds a synthetic inbound query/nonce and verifies absence of it and the outgoing query/body values in retained HTTP evidence. Preserve older browser-ledger behavior.
4. Add the plan D5 control-padded/folded recipient-header case through FluentSMTP's actual Simulator/effective-envelope path. No real SMTP.
5. Update plugin/test guides and any affected panel boundary/audit table to state per-route suppression accurately, the wrong-version early refusal and its lifecycle limits. Document that FluentSMTP body logs retain marker/token independently of form entry cleanup; operator logging/retention policy is separate, no automatic log deletion. Correct stack-harness's stale pre_http_request comment. Keep browser pre-check limitation; no checker changes.
6. Demonstrate red tests against the reviewed implementation, then green, with actual native modern-AJAX requests, no plaintext body/token logging, and complete changed-test evidence. No approval based on promises or still-running processes.

## 3. Read-first list

- `/home/rudi/.pi/agent/skills/implement-issue/ponytail.md`.
- Authoritative leaf `/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/open/helper-compat/helper-compat`: `review-A.md`, `review-B.md`, `review-A-repro-gf-modern-ajax.ts`, `implementation/report.md`, plan's repair notes.
- `plugin/pirax-form-test/includes/{compatibility,gravity-forms,marker,settings,mail}.php`, entrypoint and plugin README.
- `test/plugin/{compatibility.test.ts,stack-harness.test.ts,mu-plugin.php,harness.ts,review-regressions.test.ts,README.md}`; copy current native browser/control/envelope patterns and A's safe boolean body observer.
- `.cache/helper-compat-audit/cleantalk-spam-protect/{cleantalk.php,inc/cleantalk-ajax.php}`; GF `gravityforms.php`, `includes/api.php`, `forms_model.php`, `includes/ajax/class-gf-ajax-handler.php`; exact FluentSMTP header parser/simulator as needed.

## 4. Change list and needed interfaces

Own the existing GF/compatibility PHP files and any narrowly necessary entrypoint wiring, relevant test-only fixtures/native tests, plugin/test docs (root README only if made stale). No new production file/allowlist change is needed; keep version 0.2.0 for this unreleased repair.

Source facts: on anonymous admin-ajax `gform_submit_form`, CleanTalk adds `ct_ajax_hook` to `plugins_loaded` at 10; `apbct_init`/GF-specific bindings are absent. Its generic check sends the entire POST before gf_detect. Register an earlier, route-specific guard and verify exact removal for the audited callback/version. Keep normal later GF preflight. Reject unsafe token-bearing requests before generic dispatch, not at gform_pre_validation. Ordinary requests must not lose CleanTalk. GF's actual AJAX handler uses POST `form_id`; GFAPI is included at plugin load, but full form loading constructs fields/caches meta before plugins_loaded initialization—verify/use an appropriately safe early metadata boundary, not an assumption.

The logger appends raw `$_SERVER['REQUEST_URI']` after safe outgoing projection. Prefer an HTTP-specific safe incoming context. Existing `h.http`, `h.envelopes`, `h.simulator`, native queues and compatibility fixtures are available. If observing request bodies, retain **booleans only**, never request bodies/token/id values; marker id can be a fixed synthetic test id.

## 5. Do-not, reasons and exceptions

- Never open/read/write/print `.env*`; credential scripts use `bun --env-file=.env` with result/name-only output. No credential/ZIP values on argv/logs. Use synthetic matcher inputs/booleans so red diagnostics cannot print secrets.
- No `src/**`, sites, deployment, dependencies, production transport bypass, global CleanTalk disable, client mail-log purge, commits or lifecycle commands. No issue artifacts inside the worktree. Registered-checkout review lessons belong to the operator; do not edit those files.
- Do not make modern AJAX or unknown versions silently succeed with CleanTalk still active. Do not replace the real plugin/form logic with mocks or weaken assertions. Tests intercept only outgoing transport.
- Return mismatch with concrete interface/source/scale evidence and the smallest brief correction instead of inventing broader scope. Only B's revised brief is an exception. These exclusions protect marker secrecy, ordinary behavior, client state and native evidence; convenience creates no exception.

## 6. Ordered steps

1. Derive native red regressions for A-F1/B-F1, using A's reproduction and synthetic context query; capture safe evidence before production edits (criteria 1–3,6).
2. Implement the early route boundary plus exact callback neutralization/refusal and request-context sanitization (criteria 1–3).
3. Add the SMTP header regression, update all affected per-route/audit/privacy docs and the logging-retention caveat (criteria 4–5).
4. Run changed tests to completion, sanitize evidence, report all outcomes and limits (criterion 6).

Advisory size: ~7 files, under 90 turns excluding waits. Return a concrete remainder if scale expands; do not drop criteria. Poll/wait through tools until long tests actually finish; never end a worker session with a promise to complete later.

## 7. Commands

Resolved changed-tests command only (it selects the full suite in this repo):

```sh
AKROGON_BASE=e2075daad1c5b0dd2438ff61d71e606c47819a39 bash -c ': "${AKROGON_BASE:?AKROGON_BASE is required}" && bun test'
```

Targeted native diagnostic probes are allowed, not substitutes for this evidence. B runs final blocking checks after your return.

## 8. Done-when, evidence and report

**B checkpoint after inspecting the first landed guard:** do not finish with `gf_detect()` merely refusing after CleanTalk may already have seen a token in a field added by a GF form filter. That repeats A-F1's ordering defect. Add a native dynamically-added GF field case (marker only there) and prevent its generic API call before dispatch. A conservative early **refusal**, not marking or redirection, is permitted when token-bearing GF-shaped POST inputs cannot be reconciled with the stored schema; document this narrow unsupported/ambiguous-input boundary. Unrelated non-GF POST names, keys, queries and cookies remain outside classification. Treat the normal marker parser/late detection as unchanged. If this cannot be reconciled with the brief, return a concrete mismatch rather than claiming the late rejection is safe. Also run the guard early enough to reject a generic binding moved **before priority 9**; priority 9 cannot stop a moved priority-1 binding. Test that counterexample with body-presence booleans. Arbitrary code before the guard/bootstrap remains explicitly outside the proof. These cases belong to criteria 1–2, not a new feature.

**Final wording checkpoint:** keep claims narrower than code. `suppress_cleantalk_ajax_check()` may remove the priority-10 binding then return false for another remaining binding, so its “False (and nothing removed)” comment is too strong. “Wherever it was moved” likewise excludes an earlier-registered same-PHP_INT_MIN callback; your lifecycle paragraph correctly names that limit. Most importantly, avoid the broad claim that the CleanTalk 6.88 audit found no submission request during plugin loading: `cleantalk.php`'s admin branch immediately invokes `ct_contact_form_validate()` when the unrelated Bitrix-like `your-phone`/`your-email`/`your-message` POST fields and setting are present. State only the observed/audited native GF field-layout boundary and disclose that known bootstrap path rather than claiming the whole plugin has none. Also scope the common README's “removed again before dispatch / restored for the next ordinary submission” paragraph to the existing form-level bindings: the new one-shot `plugins_loaded` removal is not in that restoration registry. Preserve the acknowledged arbitrary-after-guard-registration limit explicitly for this new earliest guard; do not imply it rechecks every later bootstrap callback. No checker/site change or new transport bypass is requested.

**Vendor-boundary checkpoint:** the new guard currently calls `GFFormsModel::get_meta_table_name()`/`unserialize()` before testing GF's version, even for ordinary requests. First cheaply check the GF-shaped values using helper code and return for ordinary input; for a token-bearing candidate, reject an unaudited/missing GF core before invoking version-specific metadata APIs. Otherwise a changed/missing API in an unsupported GF can break ordinary submissions or bypass the intended refusal. Keep this narrow and add/retain the native modern-AJAX GF version gate case; do not promise compatibility with arbitrary future field encodings.

If the full changed-test run finishes before the late B checkpoints are applied, preserve that completed result with its actual source boundary, finish targeted native regression checks of the final changes, and explicitly report the latest-full-suite gap rather than mislabelling old evidence. B will close that gap with its own required final blocking run; do not launch a duplicate full suite solely to anticipate B's final run. No test process may remain pending on return.

Write `/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/open/helper-compat/helper-compat/implementation/worker-5.md` with before-head, exact changes, per-finding outcomes, early initialization reasoning, completed red/green command summaries and native artifact paths, remaining limits/unverified criteria. No placeholders or pending test processes. Do not commit.

Changed files and reasons: <paths and why>
Tests run: <exact commands, actual exits, red/green summaries, evidence>
Known limitations: <especially lifecycle and pre-submit browser boundaries>
Unverified criteria: <criterion/reason or none>
