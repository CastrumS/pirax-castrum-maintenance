## 1. Goal

Close concrete safety gaps found during B's inspection of completed adapter unit: FF late feed resurrection, exception context leakage, unsafe-form CAPTCHA rejection precedence, and GF recovery queue cancellation. Refine plan D4/D7–D9, AC3/AC5–AC7. One safety-hardening unit, not docs/full-suite ownership.

## 2. Numbered acceptance criteria

1. A real late `fluentform/global_notification_active_types` filter at PHP_INT_MAX registered after our filter cannot resurrect the native ledger feed on a marked submission. Either ensure final email-only dispatch or preflight reject with the literal blocked message, no entry/mail/feed/queue side effect; ordinary flow unchanged. This current hook is absent from compatibility checks and our filter is registered at plugin load, so same-priority later callbacks can re-add a type.
2. A marked queued FF notification that throws inside native mail processing does not leave a pushed context affecting a subsequent ordinary job in the same Action Scheduler request. Actual native failure handling restores prior context, keeps/reports the failed marked job safely for recovery, and ordinary mail retains original recipients. Worker 3 explicitly reported this unhandled exception leak; derive fail-first regression, don't merely pop after a successful action.
3. Unsupported FF marked form with reCAPTCHA and false siteverify returns the required integrations-blocked message rather than stopping first with a generic CAPTCHA error. Reject before insert/side effects while preserving non-marker CAPTCHA/other errors. Current `validation_errors` rejection occurs after CAPTCHA can throw.
4. GF sweep of an old token entry removes its native queued notifications/feeds (including entry-snapshot payloads), preserves ordinary queued jobs, then deletes entry. Use native public processor APIs (`get_batches`, `update`, `delete`, `is_processing`, `get_identifier`) and conservative handling of active workers. No whole-queue deletion. Public GF notifications task consumes `$item['entry']` even after entry deletion, so deletion alone is insufficient. Real runner after sweep must not send old test snapshot mail or fire test feeds; ordinary queued work runs.
5. Compatibility version gate is exact GF 3.1.2 and FF 6.2.14, not whole 3.1.x/6.2.x families; unsafe future versions reject. No general weakening of existing compatibility checks.
6. Actual WordPress tests fail before repairs and pass afterward, traces/evidence sanitized, existing public interfaces preserved. Record any genuinely unverified scope honestly.

## 3. Read-first list

- Authoritative leaf `/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/open/site-checks/form-helper-plugin/plan.md` AC/D4/D7–D9 and implementation notes (B approved ID-only FF submission meta).
- Same leaf `implementation/worker-3.md` (known limitations/mismatches/native queue evidence), `worker-1.md` (harness API).
- `/home/rudi/.pi/agent/skills/implement-issue/ponytail.md`.
- Existing `test/plugin/adapters.test.ts` for real browser/queue fixture pattern; production `includes/{compatibility,fluent-forms,cleanup,gravity-forms}.php`.
- Native inspected sources `/tmp/pirax-fluentform-plan/fluentform/app/Services/{Form/FormValidationService,WPAsync/FluentFormAsyncRequest}.php`, `/tmp/pirax-gf-plan-KBir8t/gravityforms/includes/async/{class-gf-background-process,class-gf-notifications-processor}.php` and GF feed processor source.

## 4. Change list and needed interfaces

Own `test/plugin/safety.test.ts` (new), targeted changes in `test/plugin/mu-plugin.php`/fixtures/harness as necessary, and the four production modules above. No blanket refactor or new dependencies. Keep test-only toggles off by default. Existing namespace `Pirax\FormTest` parser/state, FF_META, FF native result/cleanup hooks, GF sweep functions are the shared interfaces. Do not change marker/options/mail literals.

Use existing harness `h.php`, `h.browser`, `h.uploadPlugin`, `h.drainQueues`, `h.runCron`, `h.queues`, `h.mail/feeds`, `h.saveEvidence/stop`. Reuse actual installed GF/FF classes, real framework ledger feeds, and native runner requests. Native exception simulation may throw from test-only mail observer for one marked message; Action Scheduler must catch and continue to the ordinary job (real same request). No production testing bypass.

For exception restoration prefer a native scheduler failure hook or a minimal try/finally wrapper around the real native callback rather than duplicating sender code; ensure legacy/synchronous behavior stays safe. For late filter resurrection, reason about priority and registration order, not just a higher numeric priority (PHP_INT_MAX is already used). For CAPTCHA preflight, native ValidationException is acceptable for an unsafe submission; don't globally bypass CAPTCHA on unsupported forms.

## 5. Do-not, reasons and exceptions

- No full suite, commits or lifecycle commands; B owns final full checks and handoff. No files under worktree issues/.
- Never open/print/write `.env`/`.env.*`; use Bun --env-file on registered root and print results only. No live sites/mailbox/R2/vendor-source edits.
- No mocked authorization/form processors, fake queued-mail functions, deleting ordinary queue work, or weakening native safety assertions. Existing tests must remain valid.
- Return mismatch with source/test evidence and smallest correction instead of scope/interface change; only B's revised brief authorizes one.

These constraints protect credentials, real acceptance evidence, ordinary traffic and scope; revised briefs may refine implementation only, never authorize mocks/leaks or dropped safety criteria.

## 6. Ordered steps

1. Write safety.test.ts regressions from criteria 1–4 against native harness before repairs; capture exact failures.
2. Repair FF late filter ordering/preflight, error precedence and exception restoration with minimal native hooks. Change exact version gate and test pure version predicate inside real WordPress.
3. Repair GF native recovery queue pruning with lock/state checks and ordinary-job preservation. Test active-worker deferral and later cleanup when feasible.
4. Build ZIP, run targeted tests green and report changes/source rationale, artifacts and unverified cases. Do not spend extra rounds rerunning already-green whole adapter/core suites; B runs them after final docs.

Advisory ~6 files under 65 turns. Return precise remaining work if this is larger, rather than silently reducing acceptance.

## 7. Commands

`AKROGON_BASE=93cf3b7f6b99f3a34be7f69c004345c439fa6a76 bun --env-file=/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/.env test test/plugin/safety.test.ts --timeout 180000`

Use narrow test-name filters for iterations; no full suite. Build as needed.

## 8. Done-when, evidence and report

Write `/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/open/site-checks/form-helper-plugin/implementation/worker-4.md` with actual red/green output, all criteria disposition, source evidence and trace/log paths. Code only in `/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/worktrees/form-helper-plugin`.

Changed files and reasons: <paths and why>
Tests run: <commands and results>
Known limitations: <limitations or none known>
Unverified criteria: <criterion and why, or none>
