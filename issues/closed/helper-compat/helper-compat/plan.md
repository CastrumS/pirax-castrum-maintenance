# Plan: helper-compat

## Basis, prerequisites and scope

- Seat B, `plan.synthesis`, 2026-09-28. `state.yaml` says `debate: no`; this is direct synthesis of `brief.md`, the locked `design.md`, and the live worktree. There are no positions/rebuttals to integrate.
- Worktree: `/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/worktrees/helper-compat`. Pass artifacts belong in this leaf, not the checkout's issue snapshot.
- `akrogon config`: `grounding: none`; there is no configured grounding index/AREA graph. README and its linked plugin/test guides supply grounding; `learnings/LESSONS.md` was read. No agent instruction document was found on the inspected surface.
- Presence-only check through `bun --env-file=.env` returned `present` for `GRAVITY_FORMS_ZIP`, `FLUENT_FORMS_PRO_ZIP`, and the existing harness prerequisite `FORM_TEST_TOKEN`. Both licensed ZIPs could be extracted for local inspection; inspected versions are GF 3.1.2 and FF Pro 6.2.14. No values were printed. No credential/operator blocker is known.
- Public CleanTalk 6.88 and FluentSMTP 2.4.0 ZIPs were downloaded and inspected. Ignored local sources are under `.cache/helper-compat-audit/`; do not commit or package these sources or licensed ZIPs. This was source inspection, not an integration-test pass.
- Owned changes: existing production PHP files in `plugin/pirax-form-test/`, plugin docs, `test/plugin/**`, and the root README's plugin/test prerequisites. Do not change `src/**`, `sites.yaml`, deployment state, or real sites.
- Design precedence: the brief's “FluentSMTP 2.4.x” is not a wildcard audit. The locked design requires exact versions for every audited plugin. Audit/pin **2.4.0**, the reported live version; other patches need their own audit. Note this explicitly in review/docs.
- `.env.example` is operator-owned for this pass: seats must not open or edit any `.env*`. Report the requested action **add the variable name `FLUENT_FORMS_PRO_ZIP` with an empty value to `.env.example` if not already listed**. The real variable is already present, so this documentation-template action is not an implementation blocker; use the README credential table now.

## Read first

1. This leaf's `brief.md` and `design.md`.
2. `README.md`: “Pirax Form Test plugin”, test commands/prerequisites, and the helper's delivery/rollout boundaries.
3. `plugin/pirax-form-test/README.md`: compatibility, mail, queue/cleanup, and limitations.
4. `test/plugin/README.md`: native Playground boundary, observers, traces, credentials and suite timeouts.
5. `learnings/LESSONS.md`: stored queue classification, effective Cc/Bcc parsing, fixture readback and edited-paragraph doc drift are relevant mechanisms, not additional scope. No history was needed to verify a disputed claim.
6. `plugin/pirax-form-test/includes/{compatibility,settings,gravity-forms,fluent-forms,mail}.php`, plus `pirax-form-test.php` and existing cleanup/marker contracts when touching their callers.
7. `test/plugin/{harness.ts,playground.ts,mu-plugin.php,fixtures.php,artifacts.ts}`, then `core.test.ts`, `adapters.test.ts`, `safety.test.ts`, `review-regressions.test.ts` and `harness.test.ts`.
8. `scripts/build-plugin.ts` (read-only): ten-file allowlist; use existing production files so it need not change.
9. Exact vendor ZIP sources, recreated in ignored storage when necessary:
   - CleanTalk: `inc/cleantalk-integrations-by-hook.php`, `lib/Cleantalk/Antispam/Integrations.php`, `lib/Cleantalk/Antispam/Integrations/FluentForm.php`, `inc/cleantalk-public.php`, `inc/cleantalk-public-integrations.php`, `inc/cleantalk-common.php`, and `lib/Cleantalk/ApbctWP/HTTP/Request.php`.
   - FF Pro: `fluentformpro.php`, `src/classes/{DoubleOptin,DraftSubmissionsManager}.php`, `src/classes/AdminApproval/AdminApproval.php`, and `src/Integrations/WebHook/{Bootstrap,Client,NotifyTrait}.php`. Follow registrations for optional modules before classifying their callbacks.
   - FluentSMTP: `fluent-smtp.php`, `app/Functions/helpers.php`, `app/Services/Mailer/FluentPHPMailer.php`, and `app/Services/Mailer/Providers/Simulator/Handler.php`.

## Acceptance criteria (fixed before deriving tests)

**AC1 — Native marked success.** A disposable Playground site has GF 3.1.2, FF free/Pro 6.2.14, CleanTalk 6.88 and FluentSMTP 2.4.0 active together. Submit one marked plain FF form and one marked plain GF form through their real rendered browser flows, with one enabled notification each. Each confirms successfully, produces exactly one FluentSMTP simulator transport record addressed only to the redirect, has empty effective Cc/Bcc, exactly one subject prefix and `X-Pirax-Form-Test` header, produces zero submission-related CleanTalk HTTP attempts, no native Pro webhook execution/queue/hit, and leaves no marked entry or associated work after native queue draining/cleanup.

**AC2 — Ordinary control is meaningful.** On that same stack, ordinary FF and GF submissions keep original notification To/Cc/Bcc and untagged subjects/headers, retain their normal entries, and exercise the real CleanTalk integrations with at least one intercepted moderation request for each plugin. The configured **FF** Pro webhook executes once for the ordinary FF submission (GF has no Pro FF feed); the existing GF ledger feed still executes normally. Run ordinary controls both before and after marked cases. No actual third-party request or SMTP send is permitted.

**AC3 — Fail closed.** Absent optional plugins do not block baseline GF/FF. An active unaudited CleanTalk version blocks both adapters; an active unaudited Pro version blocks FF; under the design's exact-version rule an active unaudited FluentSMTP version blocks both. Existing GF/FF version and unsupported-form gates remain. Unknown callbacks, including GF numeric form-specific hooks, remain blockers. Failure to identify/suppress an expected active CleanTalk integration is a blocker, not success. Rejections use the existing literal blocked message before save/feed/mail, including FF before CAPTCHA. Wrong versions must be exercised through actual submission gates, not only `version_is_audited()` unit calls.

**AC4 — Read-only diagnostics.** Admin settings show separate GF/FF sections with detected core versions, audited/not-audited state, applicable optional-plugin versions, one `ready` or `blocked: <reason>` verdict, and **all** unaudited callbacks grouped by hook with their existing stable callback identities. Version failure must not hide callback findings. Missing plugins are reported as missing, not version zero. The panel neither removes callbacks nor runs form submissions, sends mail, persists compatibility results, or displays settings/credentials. Editor/subscriber/anonymous users get no panel. Every dynamic hook/version/identity/reason is escaped, including a real closure whose filename contains `<script>`.

**AC5 — Pro isolation beyond the feed filter.** Baseline Pro registration must not block the plain form, but audited direct Pro side-effect callbacks are suppressed for marked submissions before they can run. In particular, opt-in/approval code must not replace the notification flow, draft cleanup must not mutate unrelated draft state, and Pro auto-delete must not race the helper's queued notification cleanup. A configured native Pro webhook is not enqueued for marked submissions. Optional Pro modules not positively audited stay blocked; no namespace/directory blanket allowlist.

**AC6 — Preserve existing behavior.** All existing marker, settings nonce/capability, CAPTCHA, late-filter, queued/retried/throwing FF mail, token-rotation, native cleanup and sweep regressions continue passing. Keep stored test IDs and native queue semantics, not token reclassification at execution time. FluentSMTP integration evidence reaches its simulator/transport boundary rather than stopping at `pre_wp_mail`.

**AC7 — Deliverable and evidence.** Version is 0.2.0. `bun run build:plugin` produces exactly the existing allowlisted production files, without tests, vendor code or credentials. New tests fail on missing requested prerequisites, never skip. Evidence identifies exact versions and ZIP hashes and is scrubbed for token and both licensed ZIP paths. `bun run typecheck`, plugin suites and full `bun test` pass. Docs accurately distinguish simulated transport acceptance from SMTP/IMAP delivery.

## Decisions

### D1 — One compatibility model, separate inspection and mutation

Keep implementation in `includes/compatibility.php`; retain `gf_supported($form)`, `ff_supported($form)`, `callback_id()` and the string-list `unaudited_callbacks()` contract for existing callers/tests. Add a structured callback collector and shared compatibility inspector rather than a second settings-only allowlist. Suggested internal interfaces:

- `compatibility_report($plugin, $form = null)` returns core/optional version facts, structured unaudited callbacks (`hook`, `id`, optionally priority), suppression feasibility and reason codes/text; it is side-effect-free.
- Shared hook expansion supplies GF generic plus submitted-form variants to submission preflight, and all currently registered numeric form variants to the admin overview. FF uses the same audited map in both contexts.
- `prepare_marked_submission($plugin, $form)` uses that inspection, neutralizes the exact audited suppression set, verifies the result, and returns success/failure to the adapter. Private names may follow local conventions, but keep inspection and mutation distinct.

Read actual active runtime identities/versions (`GFForms::$version`, `FLUENTFORM_VERSION`, `FLUENTFORMPRO_VERSION`, `APBCT_VERSION`, and the audited FluentSMTP runtime version source verified from its entrypoint). Missing/undetectable version on a demonstrably active integration is not an audited absence. Extend `AUDITED_VERSIONS` with explicit keys for Pro, CleanTalk and FluentSMTP; compare exact strings, never prefixes or ranges. Only applicable plugins participate: Pro affects FF, CleanTalk/FluentSMTP affect both.

The panel's `ready` means **currently loaded stack/hook compatibility for otherwise supported forms**, not a promise about every form, configured marker, browser CAPTCHA, future request registrations or delivery. Print that boundary adjacent to the verdicts; per-form payment/post exclusions remain authoritative at submission time. Do not run frontend hooks or spoof a frontend request merely to populate wp-admin.

### D2 — Neutralize real CleanTalk callbacks before dispatch, not their results

Source facts:

- FF 6.2.14 uses `fluentform/before_insert_submission`. CleanTalk's registered callback is a **closure in `cleantalk-spam-protect/lib/Cleantalk/Antispam/Integrations.php`**, capturing `integration_name = FluentForm`; it is not `FluentForm::getDataForChecking`. Reflection can inspect origin/captured integration, and removal needs the actual stored closure object and priority.
- GF registers `apbct_form__gravityForms__testSpam` on `gform_entry_is_spam` at 999, and `apbct_form__gravityForms__showResponse` on `gform_confirmation` at 999. The spam callback can call `apbct_base_call`, change spam state, and even delete the entry. Its result must never be merely overridden after execution.
- CleanTalk also has generic public POST paths; GF is explicitly excluded there in the inspected source. Verify native FF AJAX routing exclusions and any request-level path before claiming submission isolation.

In a validated marked submission, locate exact hook/callback bindings, remove only the audited CleanTalk bindings for the relevant adapter, and confirm absence before that submission proceeds. Account for the GF confirmation callback as well as its moderation callback. Inspect exact owner/source and expected FF capture when selecting the removable closure; do not remove all CleanTalk closures or whole hooks. Disabled integration settings may legitimately mean no binding; distinguish a verified disabled integration from an enabled integration whose binding cannot be recognized. Changed/unrecognized binding, wrong version, or failed removal blocks. Keep unknown callbacks visible and blocking.

Run preparation at the existing earliest classification boundary: GF pre-validation and FF pre-validation/renderability preflight, before CleanTalk's submission hook. Do not modify CleanTalk options, stored settings, activation, sitewide spam state, or return a fake spam approval in production. Never mutate for ordinary submissions or diagnostics. Removals are confined to the marked request/submission; retain original bindings for restoration if the adapter processes another submission in the same PHP request. Verify sequential ordinary requests are unaffected. Late re-registration on the audited dispatch boundary must not silently re-enable a recognized suppressed callback; recheck there or use an equivalently narrow guarded binding. Do not introduce a global network blocker in production.

### D3 — Audit Pro's direct callbacks, then suppress its effects

`ff_email_feed_only()` already narrows `fluentform/global_notification_active_types` immediately before dispatch; retain this and native feed stamping/queue classification. Pro's webhook type is `fluentform_webhook_feed`, registered by its real WebHook module and dispatched at `fluentform/integration_notify_fluentform_webhook_feed`. It must disappear from the selected types before jobs are created, not be canceled after HTTP begins.

Feed narrowing alone is insufficient. The inspected Pro version registers:

- `FluentFormPro\classes\DoubleOptin::processOnSubmission` at `fluentform/before_form_actions_processing` (10): can send opt-in mail, mutate status and terminate the normal flow.
- `FluentFormPro\classes\AdminApproval\AdminApproval::processOnSubmission` on that same hook (10): can send approval mail and terminate before the helper's priority-max callback.
- `FluentFormPro\classes\DraftSubmissionsManager::delete` on `fluentform/submission_inserted` (10): deletes cookie/form-associated drafts.
- A closure in `fluentformpro/fluentformpro.php` on `fluentform/global_notify_completed` (10): can immediately delete entries.

Positively audit these bodies/call paths and identify exact bindings; **suppress these callbacks on marked requests**, not merely allow them to run because they are usually inactive. Preserve ordinary execution. The helper retains responsibility for marked cleanup after notification jobs are terminal. Store suppression identities alongside audit disposition so diagnostics recognize callbacks that can be safely neutralized without actually removing them during rendering.

Inspect the loaded native hook inventory after Pro activation and webhook enablement. Record each newly accepted `(hook, callback, exact version)` and whether safe or suppressed in the test guide's audit notes, with vendor source references. Additional optional modules such as Inventory, Post/CPT, AffiliateWP and user/account integrations must not get blanket approval. Leave their unaudited direct callbacks blocked unless this implementation supplies a concrete safe/suppressed audit and acceptance evidence; expanding support for those forms is not required. Keep `has_payment`, non-`form` type and GF post-field rejection unchanged.

### D4 — Settings consume the inspection model

Append a semantic, read-only compatibility section in `render_settings()` inside the existing `manage_options` gate, separate from the settings-save form. Two headings, version rows, one verdict each, and hook-grouped lists are sufficient; no JavaScript, endpoints, secrets, toggles or bypass button. Include CleanTalk/Pro/FluentSMTP version failures in the appropriate section's reasons. Render every finding even if a core plugin/version already blocks. Escape at output, including callback file names. GET/rendering must leave the callback inventory/options identical before and after.

### D5 — Test the real FluentSMTP 2.4.0 path

No new production mail sender. The inspected replacement `wp_mail()` applies `wp_mail` and `pre_wp_mail`, then parses headers into PHPMailer and delegates to `FluentPHPMailer`, which hands it to the selected provider. Simulation is selected by `FLUENTMAIL_SIMULATE_EMAILS` or its documented setting.

In the compatibility suite enable simulation **before any mail can be sent** and retain the helper's `guard_mail`. Make only the harness's successful `pre_wp_mail` observer switchable into observe-without-short-circuit mode. Its current unconditional `true` would otherwise prove nothing about FluentSMTP. Record effective PHPMailer To/Cc/Bcc/custom headers/subject without throwing, and assert the actual FluentSMTP Simulator log/provider record too. The simulator log alone does not expose effective Cc/Bcc, so keep the envelope observer. Configure logging and assert simulator routing exists; never fall through to default PHP mail/SMTP. Cover control-padded/folded header regressions and one queued FF notification with Pro active. Production `mail.php` should remain unchanged unless this real path exposes a concrete incompatibility.

### D6 — Opt-in harness extras, explicit transport containment

Extend `startHarness` with a typed optional compatibility-stack selection (for example `{run, compatibility: true}`); defaults remain GF+FF for existing plugin/checker callers. This selection requires `FLUENT_FORMS_PRO_ZIP`, downloads pinned `cleantalk-spam-protect.6.88.zip` and `fluent-smtp.2.4.0.zip`, checks ZIP headers and includes all versions/hashes in its manifest. Validate licensed ZIP existence with name-only errors. Node receives licensed paths only in environment/internal protocol, never argv/logs; pass no token to Node. Do not expose actual licensed-path values to extraction subprocess command lines when adding version checks (use a fixed ignored staged name or a reader taking the path internally).

Install the mu-plugin HTTP/mail safeguards before activating extras: the current blueprint writes it **after** the form installs, which is too late for optional-plugin activation traffic. Keep plugin startup code/validation real. Intercept third-party WordPress HTTP before egress, recording safe method/host/path/purpose only (no submitted bodies, credentials or token-bearing URLs). Provide bounded deterministic success responses for CleanTalk moderation and the configured local webhook capture URL; block/log other external calls rather than allowing silent network escape. Separate submission-window counts from activation/update/background activity. Browser requests to CleanTalk external scripts/telemetry must also be contained.

CleanTalk's default WordPress HTTP API setting is on, but it can use a direct transport and switch to it on failures. Fixtures explicitly keep the built-in HTTP mode, return successful moderation responses, and use test-environment egress containment so `pre_http_request` cannot give a false zero. Do not patch CleanTalk's submission callback or manufacture a fake call to the hook: the ordinary control must reach the intercepted moderation HTTP itself, without a real API key. Use anonymous visitors with contact-form checking enabled and no skip/exclusion path. A zero ordinary control is a failing test, not evidence of suppression.

Expose additive harness readers for HTTP/capture and effective transport records. Retain privacy through `saveEvidence()` and `findSecret()` using token and **both** licensed paths; no vendor source or raw configuration in evidence. Prefer plain structured counts/identities. Existing GF/FF-only tests must not acquire a new Pro prerequisite.

### D7 — Native fixtures, adversarial cases and release boundaries

Seed the real Pro WebHook module/feed using its actual option/meta schema with one enabled feed pointing to a loopback capture URL observed at `pre_http_request`. Assert actual native notifier/HTTP activity and queued state, not a stand-in Pro ledger. Control capture success is one hit after native queue draining; marked submission is zero hits and zero queued Pro jobs before and after draining. This is transport interception at the local capture URL, not a mocked integration dispatcher.

Keep baseline one-notification forms to make exactly-one-mail meaningful. Add option-driven fixtures for direct Pro suppression and unknown callbacks only in the test mu-plugin. Include double-opt-in/admin-approval enabled cases proving only the notification path survives, plus preserved draft state and helper-owned delayed cleanup with Pro auto-delete enabled. An unaudited optional-module callback remains an explicit blocked case.

For mismatched constants, change only the disposable installed vendor fixture's version declaration/header and issue fresh PHP/browser requests (then restore), or use equivalent isolated fixture bootstraps. Do not add a production override/filter to weaken version enforcement. Verify wrong-version rejection and panel findings against the runtime gates. Preserve redacted hashes identifying any altered test fixture.

Bump the plugin header to 0.2.0; no new production files or build allowlist change. Do not deploy or use real mail/real site forms as a test.

## Ordered file/criterion checklist

Ordering is local execution dependency, not a dependency on another leaf: containment/harness must exist before activating extras and running live fixture tests; callback inventory must be audited before accepting callbacks; docs/release assertions follow the implemented behavior.

1. [ ] `test/plugin/harness.ts` — optional stack/preflight/cache/version+hash facts, safe child inputs, additive HTTP/transport readers, redacted evidence; AC1–3, AC6–7.
2. [ ] `test/plugin/playground.ts` — install transport containment before extras, fixed exact optional installs and simulation setup, preserve default setup and internal PHP bridge; AC1–2, AC6–7.
3. [ ] `test/plugin/mu-plugin.php` — contained HTTP capture/clean response fixtures, optional non-short-circuit mail observer plus effective envelope ledger, unknown-binding and Pro feature fixtures; AC1–6.
4. [ ] `test/plugin/fixtures.php` — real enabled Pro webhook feed/local capture target and native Pro feature fixture configuration only when extras are present; AC1–2, AC5.
5. [ ] `test/plugin/harness.test.ts` — extra-stack missing-name/version checks, default-stack compatibility, manifests and both-path privacy tests; AC7. Reuse `artifacts.ts`; edit it only if a concrete additional sanitization need appears.
6. [ ] `plugin/pirax-form-test/includes/compatibility.php` — shared report/collector, exact optional pins, audited Pro dispositions, exact CleanTalk binding preparation/removal verification, unchanged public compatibility contracts; AC3–5.
7. [ ] `plugin/pirax-form-test/includes/gravity-forms.php` — marked-only preparation before CleanTalk dispatch and existing rejection path; AC1–3, AC6.
8. [ ] `plugin/pirax-form-test/includes/fluent-forms.php` — marked-only preparation before direct Pro/CleanTalk callbacks; preserve feed narrowing, queued-ID contract and cleanup ordering; AC1–3, AC5–6.
9. [ ] `plugin/pirax-form-test/includes/settings.php` — read-only report rendering under existing capability gate, fully escaped and non-mutating; AC4.
10. [ ] `test/plugin/compatibility.test.ts` (new) — full-stack native controls/marked/unknown binding/version failures/Pro side effects/queue and transport evidence; set `setDefaultTimeout(180_000)` and explicit long startup timeout; AC1–3, AC5–7.
11. [ ] `test/plugin/core.test.ts` — admin/non-admin panel behavior, real hostile closure file, complete callback display and no render mutations, version/ZIP assertions and privacy; AC4, AC7. `safety.test.ts` may hold extended exact-version helper assertions, but they do not replace native mismatch cases.
12. [ ] `plugin/pirax-form-test/pirax-form-test.php` — header version 0.2.0, no new module/allowlist; AC7.
13. [ ] `plugin/pirax-form-test/README.md` (human/plugin doc) — exact versions, panel semantics, marked-only CleanTalk suppression, audited Pro support and remaining exclusions, simulated FluentSMTP evidence and actual delivery limitation; remove stale “FF Pro always blocks” wording and narrow the old transport limitation accurately.
14. [ ] `test/plugin/README.md` (human/test-agent resource) — extra-stack credentials/acquisition, public pins, named new suite, real callback audit/disposition table, containment/capture/simulator evidence, extra manifest fields, both-path privacy, and honest test budget.
15. [ ] `README.md` (human entrypoint) — plugin section/new suite prerequisites and exact tested stack; update linked test prerequisite statements affected by the new full suite, without changing checker behavior claims.
16. [ ] Agent docs: no standalone agent instruction doc is affected; shared human/test resources above are the read-first documentation changes. `.env.example` is not to be read/edited by a seat; carry forward the explicit operator action stated above.
17. [ ] Build/verification: run the commands below, retain redacted evidence and summarize AC coverage plus remaining limitation in the implementation artifact.

## Concrete verification

Run from the worktree; use the environment loader, never inspect `.env*` or print credential values:

```sh
bun install
bunx playwright install chromium
bun run typecheck
bun --env-file=.env test test/plugin/harness.test.ts
bun --env-file=.env test test/plugin/compatibility.test.ts
bun --env-file=.env test test/plugin/core.test.ts
bun --env-file=.env run test:plugin
bun --env-file=.env run build:plugin
bun --env-file=.env test
```

- Full-suite setup includes existing forms/R2 integration prerequisites outside this leaf. If a command identifies an absent required credential/permission, report only its name and exact operator action; fail the lifecycle seat with that blocker rather than skip or claim the full suite passed. Do not call live-site `forms`/`check` commands to compensate.
- Baseline comparison: native ordinary FF → one Pro capture + original mail + retained entry; native marked FF → no capture/queue/CleanTalk attempt + one simulator redirected envelope + no entry; repeat for GF with its normal GF ledger and no FF webhook expectation. Drain queues before asserting final cleanup and re-run an ordinary control afterward.
- Snapshot callback identities/priorities/options around panel rendering; equality proves read-only behavior. Inject multiple unknown callbacks on different hooks and a GF numeric variant; assert all names remain listed even with an unrelated version failure. Serve an actual PHP closure fixture under a `<script>` filename; verify exact fixture readback and escaped text/no injected element.
- Version matrix includes absent optional plugin, exact match, later patch, shorter/longer lookalike, and prerelease string. Native rejection at least for each new plugin's wrong-version gate, plus FF/GF unknown/unneutralizable callback cases. Never leave test-modified vendor versions in the next scenario.
- The full-stack transport check must identify FluentSMTP's replacement `wp_mail` implementation and Simulator provider/log, not simply observe the helper's `wp_mail` arguments. Assert effective To/Cc/Bcc and header/prefix counts; preserve body/attachments/From/Reply-To regressions.
- Verify ZIP entry equality against the unchanged ten-file allowlist and assert 0.2.0 from the built header. Run `findSecret` on retained artifacts/build with the token and both licensed ZIP paths without logging their values. Check `git diff --check` and no changes under excluded surfaces or `.env*`.

## Implementation notes — 2026-09-28

- **D6 transport constraint (unit 1 source/runtime evidence):** CleanTalk 6.88's `lib/Cleantalk/ApbctWP/HTTP/Request.php::requestSingle()` calls `WpOrg\\Requests\\Requests::request()` directly even with `wp__use_builtin_http_api=1`; it does not fire `pre_http_request`. The ordinary control must therefore be captured at the Requests transport as well as any WordPress filter-level observations. Unit 1 installed a test-only Requests transport that answers moderation/capture requests and blocks external HTTP, while native loopback requests continue. This refines the interception implementation, not the locked native-plugin/no-egress requirement. **Review mismatch:** a literal `pre_http_request`-only proof requested in the brief is impossible for this vendor path; do not claim that filter observed CleanTalk. Report actual Requests-boundary evidence instead.
- **D6 containment ceiling:** raw PHP sockets/cURL can bypass Requests. The inspected CleanTalk direct fallback is triggered by network failure; fixtures set built-in mode, use a seeded moderation URL and return successful moderation responses, and assert mode remains enabled. Browser third-party requests are aborted. Evidence is for this exact configured native stack, not arbitrary third-party PHP. Carry that ceiling into docs/report; do not present it as a general network sandbox. Unit 1's early exploratory browser run made external CleanTalk asset/telemetry requests before containment was fixed; subsequent verified runs are contained. Retain this fact in the report rather than retrospectively claiming every exploratory run was isolated.
- **D6 privacy fixture constraint:** a failed assertion against a credential-bearing preflight result can print its returned ZIP path. Unit 1 replaced its real-path input with a temporary stand-in and scrubbed the local red logs. New failure tests must use synthetic inputs when matcher diagnostics could print values.
- **D2/AC1 browser boundary (unit 2 native evidence):** CleanTalk also issues a pre-submit REST email check at `/wp-json/cleantalk-antispam/v1/check_email_before_post`, which calls `api.cleantalk.org` before the marked form POST exists. Server-side marked-submission suppression cannot classify or cancel that earlier request without changing unrelated browser behavior. Tests contain it but exclude only that exact REST path from the submission-attempt assertion; every CleanTalk request during the native marked submission remains forbidden. **Review mismatch/unverified broader claim:** this implementation does not make an entire marked browser visit CleanTalk-free. Docs/report must state the boundary, not silently reinterpret a whole-visit zero-HTTP criterion. The checker uses a separate synthetic email and marker-bearing text field; this is not a blanket guarantee for manually entering a marker into an email field.
- **D7 existing full-suite ordering constraint:** the forms suite assumes `dist/pirax-form-test.zip` already exists, so a clean full-suite run needs the planned build first. Unit 1's initial red run exposed this existing ordering failure; B's final verification will build before full-suite execution. No checker change is authorized.

### Repair round 1 — 2026-09-28 (reviewed head `aac43d6516b3cbb8f2187f1b98b49c36ac6ecef6`)

- **D2 / A-F1:** GF's modern AJAX `action=gform_submit_form` goes through CleanTalk's generic `ct_ajax_hook` on `plugins_loaded` priority 10, not the public GF spam binding. Add an earlier route-specific guard, using only actual submitted GF field values, before that generic callback can see the token. Preserve successful marked modern-AJAX submission on the audited stack by removing exactly the audited generic binding and verifying removal; retain the normal later GF preflight for all other compatibility/form rules. Ordinary modern-AJAX requests must keep CleanTalk unchanged. Do not classify from query strings, cookies, field names or unrelated POST values, or initialize/cache GF forms prematurely merely to scan fields. Verify the safe early metadata/API boundary against the real vendor code. On unsupported CleanTalk/core versions, unrecognized/removal-failed bindings or other unsafe token-bearing modern requests, reject with the appropriate existing message **before** the generic callback; later validation is too late. Tests must cover this route and the postback route separately, with body-presence booleans only (never token/body values). Actual plugin-bootstrap side effects before the helper can execute remain outside the proof and must not be hidden by a version-pinning claim. Repair checkpoint: a late rejection for a field added by a form filter is still too late for privacy. Conservatively refuse before generic dispatch when token-bearing GF-shaped POST inputs cannot be reconciled with stored field metadata; this is an early safety refusal, not marker classification/redirection of unrelated data. Document this unsupported/ambiguous-input boundary, keep unrelated non-GF POST names/query/cookies ignored, and test a native dynamically-added field. The early guard must also precede a generic binding moved to priority 1 (not merely the audited priority 10); test that counterexample. Normal later marker parsing is unchanged. Ordinary GF-shaped values must return before any new metadata lookup, and token-bearing candidates must pass the GF version gate before using version-specific metadata APIs. The known CleanTalk bootstrap Bitrix-like-field branch is outside the native GF field layout and must be disclosed instead of claiming the audited plugin has no bootstrap submission path.
- **D6 / B-F1:** outgoing URL projection does not sanitize incoming `REQUEST_URI` appended by the shared logger. The new HTTP ledger must serialize a path-only incoming context too, and a regression must use a synthetic inbound query as well as the existing outgoing-query/body case. This does not change the older browser network-ledger URL contract.
- **D5/D7 / scoped nits:** add the planned control-padded/folded header case through FluentSMTP simulation (N2); document that FluentSMTP's own body logs can retain the marker/token after helper entry deletion and require separate operator retention/logging policy (N3); correct the stale `pre_http_request` test comment (N4). Preserve the existing browser pre-check limitation (N1), with no checker edits or automatic client-log purge.

## Open limitation / review notes

A static admin request cannot know every callback a future frontend/AJAX request will register or certify every form. The panel is a current-stack diagnostic, and submission-time preflight remains authoritative. Exact-version/source auditing also cannot prove arbitrary PHP or post-guard transport modifications harmless. FluentSMTP **2.4.0 simulation** establishes this version's transport inputs, not all 2.4.x releases and not real SMTP/IMAP delivery. Optional unaudited Pro modules, payment/post/account/custom forms and existing checker CAPTCHA limits remain rejected or unverified as documented. These are retained boundaries, not reasons to relax the allowlist or authorize rollout.
