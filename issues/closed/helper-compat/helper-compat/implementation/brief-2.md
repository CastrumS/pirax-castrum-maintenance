# Unit 2 — production compatibility and fail-closed native tests

## 1. Goal

Implement plan D1–D5/D7 production behavior and acceptance tests in `/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/worktrees/helper-compat`, using unit 1's real opt-in stack. Marked GF/FF succeeds safely with exact Pro/CleanTalk/FluentSMTP versions; admins can diagnose blockers. Preserve existing native queue/marker/cleanup/mail contracts.

## 2. Numbered acceptance criteria

1. All five real plugins active: marked plain GF and FF each confirm, produce exactly one redirected Simulator mail (disable the fixture's second notification), empty effective Cc/Bcc, one prefix/header, zero CleanTalk attempts, zero Pro webhook queue/hits, no marked entry after native draining. Ordinary controls before/after retain original mail/entries/CleanTalk moderation and FF's single Pro webhook; GF's ledger still fires.
2. Exact pins: GF 3.1.2, FF/Pro 6.2.14, CleanTalk 6.88, FluentSMTP 2.4.0. Absent optional plugins work; other versions block marked submissions with existing literal message. Pro affects FF, CleanTalk/SMTP both. Native wrong-version submissions must test actual gates, not only helper comparisons. Keep payment/non-form/GF post-field gates.
3. Exact CleanTalk callbacks are neutralized before execution only for marked submissions; unverifiable/removal-failed/unknown binding blocks. Repair A-F1 extends this explicitly to native GF modern AJAX: action=gform_submit_form triggers ct_ajax_hook at plugins_loaded priority 10, before gform_pre_validation. Classify safely and suppress/refuse at an earlier boundary, including wrong-version refusal before this call. Keep ordinary modern AJAX unchanged. Execute the repair under brief-5.md. No production HTTP interception or fake spam approval. Ordinary requests and panel rendering never alter bindings/settings.
4. Pro direct opt-in/approval/draft-delete/auto-delete callbacks are suppressed for marked submissions, not just allowed because normally dormant. Enabled opt-in/approval still yields only notification; draft state survives; Pro auto-delete cannot race queued mail. Native webhook is excluded before enqueue. Optional unaudited module callbacks still block.
5. Admin-only read-only panel: separate GF/FF version/audit facts, optional versions, ready/blocked reason and all unknown callbacks grouped by hook. Same collector as preflight; include GF numeric variants. Version failure must not hide callback findings. Escaped real closure path containing `<script>` renders as text; no secrets, endpoints, mutation or bypass. Clearly scope ready to currently loaded stack, not all forms/delivery.
6. Existing tests remain green. Meaningful bug tests demonstrate red before implementation and green after. Header becomes 0.2.0; unchanged ten-file build allowlist and no new production files.

## 3. Read-first list

- `/home/rudi/.pi/agent/skills/implement-issue/ponytail.md`.
- Plugin/test READMEs; unit 1's `implementation/worker-1.md` under this authoritative leaf for exact interfaces/evidence.
- `plugin/pirax-form-test/includes/{compatibility,settings,gravity-forms,fluent-forms,mail,marker,cleanup}.php`, entrypoint.
- `test/plugin/{stack-harness.test.ts,harness.ts,mu-plugin.php,fixtures.php,core.test.ts,adapters.test.ts,safety.test.ts,review-regressions.test.ts}`. Copy native browser/queue patterns and envelope assertions.
- Exact vendor sources in ignored `.cache/helper-compat-audit/`. Follow every newly accepted callback's body; Pro's WebHook native type is `fluentform_webhook_feed`.
- Plan's dated Implementation notes: CleanTalk bypasses pre_http_request even in WP API mode; unit 1's Requests transport supplies real moderation evidence. It is not a general raw-socket sandbox. Use the existing containment and synthetic inputs for assertions that could print credential-bearing return values.

## 4. Change list and needed interfaces

Own existing production compatibility/settings/GF/FF/entrypoint files, new `test/plugin/compatibility.test.ts`, relevant core/safety tests, and necessary additive test-only fixtures. `mail.php` changes require observed concrete incompatibility; do not rewrite transport.

Keep `callback_id`, `unaudited_callbacks` string-list API, `gf_supported`/`ff_supported`. Share side-effect-free structured report/collector between panel and preflight; separate marked-only mutation. Audited dispositions identify exact hook+callback+owner/version. Current harness has `startHarness({run, compatibility:true})`, `h.http()`, `h.envelopes()`, `h.simulator()`, `fixtures.stack.webhook/capture`, native queues and `pirax_harness_ff_pro_feature(formId, feature, bool)` for `double_optin`, `admin_approval`, `auto_delete`.

CleanTalk FF binding is a closure in `cleantalk-spam-protect/lib/Cleantalk/Antispam/Integrations.php` capturing `integration_name=FluentForm`, NOT FluentForm::getDataForChecking. Select actual object/priority and verify capture. GF bindings: `apbct_form__gravityForms__testSpam` on `gform_entry_is_spam` and `apbct_form__gravityForms__showResponse` on `gform_confirmation`, both 999. Audit generic POST exclusion before claiming isolation. Verify disabled-vs-unrecognizable bindings, late re-registration and repeated-submission restoration.

Pro direct callbacks: `FluentFormPro\classes\DoubleOptin::processOnSubmission` and `FluentFormPro\classes\AdminApproval\AdminApproval::processOnSubmission` on before_form_actions_processing (10); `FluentFormPro\classes\DraftSubmissionsManager::delete` on submission_inserted (10); auto-delete closure from `fluentformpro/fluentformpro.php` on global_notify_completed (10). All FF hooks use `fluentform/` prefix. Audit exact identities then suppress for marked work before their hooks. Retain helper-owned queue metadata/cleanup. No blanket class/directory trust; optional Inventory/Post/Affiliate/account behavior may stay blocked.

## 5. Do-not, reasons and exceptions

- Never open/read/write/print `.env*`; run credential-dependent scripts via `bun --env-file=.env`, print names/results only. No values in argv/logs/artifacts.
- No `src/**`, sites, deployment, dependencies, commits, lifecycle commands, or issue files in worktree. Docs belong to next unit; report required corrections.
- No version escape hatch, production overrides for tests, namespace blanket allowlist, fake plugin callbacks, real HTTP/SMTP or relaxed acceptance. Wrong-version fixtures may change disposable installed declarations, then restore and reload requests.
- Return mismatch with evidence and smallest correction rather than changing scope/interfaces; only a revised brief from B authorizes exceptions. These exclusions preserve client safety, native evidence and ownership; convenience never creates an exception.

## 6. Ordered steps

1. Derive native fail-first compatibility/panel cases from criteria 1–5; capture red evidence on old production plugin.
2. Implement shared collector/version model and marked preparation in compatibility/adapters, criteria 1–4.
3. Implement escaped read-only panel and tests, criterion 5; preserve settings protections.
4. Exercise adverse versions/bindings, Pro enabled features, queued transport, ordinary controls and existing regressions; bump header, criterion 6.

Advisory size: ~8–10 files, under 100 turns. If larger, return concrete remainder rather than cutting criteria. Keep the diff boring and reuse existing contracts.

## 7. Commands

Configured changed-tests command (it currently selects all tests):

```sh
AKROGON_BASE=e2075daad1c5b0dd2438ff61d71e606c47819a39 bash -c ': "${AKROGON_BASE:?AKROGON_BASE is required}" && bun test'
```

Supply red/green evidence through this runner; B owns final blocking checks after all units. Native fixture probes are allowed to diagnose failures, not substitutes for changed-test evidence. Do not print secrets from failing assertions.

## 8. Done-when, evidence and report

Write `/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/open/helper-compat/helper-compat/implementation/worker-2.md` with acceptance outcomes, exact newly audited callback table, native evidence paths, commands/pasted results, limitations and remaining work. Do not commit. Brief final response points to report.

Changed files and reasons: <paths and why>
Tests run: <commands/results, red and green, native artifacts>
Known limitations: <limitations or none known>
Unverified criteria: <criterion and why, or none>
