## 1. Goal

Implement the real GF/FF adapters, conservative integration compatibility and native entry/queue cleanup (plan D6–D9, AC2–AC7). One coherent adapter/lifecycle unit consuming the tested core/harness; no documentation/full-suite ownership.

## 2. Numbered acceptance criteria

1. Browser-marked GF and FF submissions `<token>-abc123` send both actual notifications only to redirect, strip Cc/Bcc and tag them, execute/enqueue no native ledger feed, delete entry/related data after mail. GF global async notification option remains enabled but marked mail is synchronous via native filter; unmarked/wrong/empty-token controls retain original recipients/entries and execute feeds.
2. GF built-in CAPTCHA v2 and FF reCAPTCHA with siteverify success:false: marked succeeds, unmarked fails. Supply nonempty dummy response; real plugin validation/server flow, no auth mocks or general validation bypass. Other invalid fields/honeypot remain invalid.
3. FF native email queueing enabled in test: entry retained until every job completes across fresh requests; early job restores marker, late callback restores prior scope; ordinary job in same runner retains original recipient. Failed/retryable/processing jobs cannot falsely signal completion. Synchronous deletion occurs at end of request, after FF writes post-action meta; related records do not reappear.
4. A concrete native-hook dispatcher outside suppressible frameworks causes marked validation rejection with literal `Pirax test blocked: integrations could not be suppressed`, no save/mail/side effects; ordinary submissions unaffected. Same fail-safe for malformed/ambiguous exact marker, invalid redirect (own marker/config message). Conservative audited callbacks/versions, not blanket approval by plugin-directory prefix. Payment/unknown direct side-effect paths rejected.
5. Real hourly event deletes matching token entries strictly older than one hour and associated native pending/retryable jobs using native deletion. Preserve ordinary/young entries; repeated runs, multipage deletion, SQL wildcard token characters, empty token, non-UTC timestamps and boundary verified. Never delete under active notification; leave recoverable and document limitation.
6. Derive real tests first and preserve red→green. All targeted changed tests green with redacted trace/mail/feed/entry artifacts; no fake/skipped native acceptance.

## 3. Read-first list

- Authoritative `/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/open/site-checks/form-helper-plugin/plan.md` in full, especially live sources D6–D9 and acceptance.
- Same leaf `design.md`, `implementation/worker-1.md`, `implementation/worker-2.md`.
- `/home/rudi/.pi/agent/skills/implement-issue/ponytail.md`.
- `plugin/pirax-form-test/includes/{marker,mail,settings}.php`, bootstrap; `scripts/build-plugin.ts` explicit allowlist.
- `test/plugin/harness.test.ts`, `core.test.ts`, `harness.ts`, `fixtures.php`, `mu-plugin.php`: copy real harness pattern.
- Sources at `/tmp/pirax-gf-plan-KBir8t/gravityforms/` (3.1.2), `/tmp/pirax-fluentform-plan/fluentform/` (6.2.14), particularly source files cited in plan. Re-extract/download if needed without exposing ZIP-path env value or vendoring licensed code.

## 4. Change list and needed interfaces

Own `plugin/pirax-form-test/includes/{compatibility,gravity-forms,fluent-forms,cleanup}.php`, `test/plugin/adapters.test.ts`, changes needed in `test/plugin/{fixtures,mu-plugin}.php`, and explicit file-list additions in build script/core.test.ts. Minimal harness updates allowed for actual native async test driving. Existing unrelated core behavior stays intact. Prefer few small procedural prefixed/namespaced hooks over speculative frameworks.

Core namespace `Pirax\FormTest`: `parse($values,$token=null)` => `{state:ordinary|marked|invalid-marker,id,reason}`; caller unslashes exactly once. `mark($id)` => true or WP_Error, validates redirect. `push_context(?id)`, `pop_context()`, `current_id()`, `config_error()`, `token()`, `redirect()`, constants `BLOCKED_MESSAGE`, `MARKER_MESSAGE`, `CONFIG_MESSAGE`, `SWEEP_HOOK`. Bootstrap already optionally loads your four files, schedules hourly SWEEP_HOOK on activation. Adapters must tolerate absent form plugins. `wp_mail` filter/guard already provided; never send mail yourself.

GF detect before CAPTCHA in gform_pre_validation; captcha-only gform_field_validation; rejection gform_validation; suppress global AND form-specific gform_addon_pre_process_feeds; gform_is_asynchronous_notifications_enabled returns false only marked; GFAPI::delete_entry late gform_after_submission.

FF before_form_validation parsed data; disable_captcha only type recaptcha; validation_errors pre-insert; global_notification_active_types retains notifications mapping only. Wrap integration_notify_notifications before/after native priority10 callback; queued stored response determines marker, not POST. global_notify_completed only checks pending upstream, so inspect pending/processing/retryable-failed states yourself and defer physical delete until shutdown. Native SubmissionService::deleteEntries includes related data/queue cleanup. No forced sync for FF; acceptance requires its real native queued path.

Harness `startHarness`, `h.php`, `h.browser`, `h.uploadPlugin`, `h.mail/feeds/entries/queues/drainQueues`, `h.saveEvidence/stop`. GF ledger is native GFFeedAddOn; FF ledger native IntegrationManagerController. Default GF async on, FF email sync. Add option-driven FF async/failure/unsupported fixtures as test-only code. Browser data must be scrubbed by harness on closure. Build before upload; update both strict archive allowlists when adding files.

## 5. Do-not, reasons and exceptions

- No commits/lifecycle commands/full suite; B owns final acceptance. Code only current worktree, report authoritative leaf.
- Never read/open/print/write `.env`/`.env.*` or secret values. Use Bun --env-file registered root; inspect presence only by name. No live sites/IMAP/R2/security-plugin edits or vendor code changes.
- No mocked auth, replacement form-processing stubs, broad all-validation bypass, global disabling of queues or production test hooks. Native queues/forms are required proof; test-only mu-plugin is the allowed observation boundary.
- Do not approve arbitrary hooks merely by file prefix, drop all FF feeds including mail, delete FF entry in nested synchronous completion before metadata writes, or trust pending-only completion. These are known observed pitfalls.
- Return mismatch with concrete requirement/source/interface evidence and smallest correction instead of changing scope/interfaces. Only B's revised brief is an exception.

Reasons remain safe isolation, actual native acceptance and no client side effects; revised briefs may refine implementation but not weaken those guarantees or credential rules.

## 6. Ordered steps

1. Derive adapters.test.ts from criteria 1–5; use native fixture settings/queue records and browser submission; capture meaningful red against current core-only plugin.
2. Implement compatibility + GF detection/validation/feed/notification/deletion, green targeted GF cases.
3. Implement FF sync and native async lifecycle/context; test multiple jobs/retries/ordinary batch and metadata cleanup.
4. Implement recovery sweep using native APIs with stable pagination/timezone matching and queue checks; test boundary/repeat/multipage/wildcards.
5. Rebuild explicit ZIP, run changed tests, retain artifacts, report exact supported/blocked surfaces and limitations for documentation worker.

Advisory size ~8 changed files, under 110 turns. If work clearly exceeds this, return a precise remainder/mismatch and evidence, not unsupported completion claims.

## 7. Commands

`AKROGON_BASE=93cf3b7f6b99f3a34be7f69c004345c439fa6a76 bun --env-file=/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/.env test test/plugin/core.test.ts test/plugin/adapters.test.ts --timeout 180000`

Narrow test-name filtering during iterations allowed. No full suite.

## 8. Done-when, evidence and report

Report `/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/open/site-checks/form-helper-plugin/implementation/worker-3.md`. Include actual command output, red/green, hook compatibility rationale, native queue states before/after, retained artifacts, and clearly enumerate unverified cases. All code only `/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/worktrees/form-helper-plugin`.

Changed files and reasons: <paths and why>
Tests run: <commands and results>
Known limitations: <limitations or none known>
Unverified criteria: <criterion and why, or none>
