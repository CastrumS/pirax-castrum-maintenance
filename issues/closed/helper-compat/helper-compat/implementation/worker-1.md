# Worker 1 report: optional native stack and contained evidence

Worktree: `/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/worktrees/helper-compat` (branch `helper-compat`, nothing committed). No production PHP, `src/**`, package files, `.env*`, sites or docs were touched.

## Changed files and reasons

- `test/plugin/harness.ts`: this is the opt-in `startHarness({ run, compatibility: true })`.
  - `preflight(env, { compatibility })` requires `FLUENT_FORMS_PRO_ZIP` only in compatibility mode. Its errors name the variable, never the value.
  - ZIP `Version` headers are now read with `unzip -p /dev/stdin <entry>`, with the ZIP passed as the file on stdin. No licensed path (GF or Pro) is ever on a child's argv. This also fixes the old GF `unzip -p <path>`.
  - `wordpressOrgZip()` replaces `fluentFormsZip()`. It downloads and caches the pinned `cleantalk-spam-protect.6.88.zip` and `fluent-smtp.2.4.0.zip` and checks their `Version` headers.
  - The Pro ZIP must contain exactly 6.2.14.
  - The Node child gets `FLUENT_FORMS_PRO_ZIP` through its environment only in compatibility mode. It is stripped otherwise, and the token is never passed.
  - The secret list covers the token and both licensed paths.
  - It adds the `http()`, `envelopes()` and `simulator()` readers.
  - In compatibility mode, browser contexts abort every non-loopback http(s) request.
  - `saveEvidence()` writes `http.jsonl`, `envelopes.jsonl` and `simulator.jsonl` in compatibility mode. The manifest has the Pro, CleanTalk and FluentSMTP versions and the SHA-256 of all 5 ZIPs.
- `test/plugin/playground.ts`: the mu-plugin is now written **before** any plugin install, in both modes, so its safeguards are loaded in every activation request. In compatibility mode it defines `PIRAX_HARNESS_COMPAT` and `FLUENTMAIL_SIMULATE_EMAILS`, then installs and activates FF Pro (from the env path), CleanTalk and FluentSMTP after GF and FF.
- `test/plugin/mu-plugin.php`:
  - An `activations` ledger for `activated_plugin`.
  - The baseline `pre_wp_mail` observer can be switched to observe without short-circuiting (see the interface section). The production guard is untouched.
  - Compatibility only:
    - `Pirax_Harness_Transport` is installed as the **only** `WpOrg\Requests` transport.
    - A `phpmailer_init` envelope ledger.
  - The `pirax_harness_ff_pro_feature()` fixture helper.
- `test/plugin/fixtures.php`, compatibility only:
  - Turns mail passthrough on.
  - Keeps CleanTalk's `wp__use_builtin_http_api=1` and `forms__contact_forms_test=1`.
  - Seeds `cleantalk_server` with `https://moderate.cleantalk.org`, so the first moderation request goes to a known URL instead of a DNS rotation.
  - Consumes CleanTalk's one-shot `ct_plugin_do_activation_redirect`. Otherwise the first visitor admin-ajax request, an FF submission, gets a 302 to CleanTalk's settings. Normally the activating admin's next wp-admin visit consumes it.
  - Adds a real enabled Pro WebHook feed (`fluentform_webhook_feed` meta on `fixtures.ff`, POST JSON with `pirax_entry={submission.id}`) pointing at the loopback capture URL.
  - Enables the `webhook` global module.
  - Returns `fixtures.stack`.
- `test/plugin/harness.test.ts`: covers compatibility preflight (missing/invalid Pro ZIP named, value absent). Also checks that the default stack has `compatibility: false`, exact default `versions` without optional keys, only GF and FF active, and manifest `zips` with only `gravityforms` and `fluentform`.
- `test/plugin/stack-harness.test.ts` (new; `setDefaultTimeout(180_000)`, 600 s startup): runs the full stack.
  - Checks exact runtime versions and that `wp_mail` comes from `fluent-smtp.php`, plus the simulate constant, CleanTalk HTTP mode and webhook module.
  - Checks that every optional plugin was activated with the mu-plugin loaded.
  - Checks that third-party HTTP is blocked and logged without query or body.
  - Checks that the Pro feature fixtures are read back through Pro's own getters.
  - Runs ordinary FF and GF browser controls through CleanTalk moderation, the Pro webhook, FluentSMTP's Simulator and the effective envelope.
  - Checks evidence: the manifest, 0 secrets in retained files, traces without images, and browser egress aborted.

`artifacts.ts` is unchanged; `redact()`/`findSecret()` already handle any number of secrets.

## Findings that shaped the design (with vendor evidence)

1. **CleanTalk 6.88's "WordPress HTTP API" mode skips `pre_http_request`.** `lib/Cleantalk/ApbctWP/HTTP/Request.php::requestSingle()` calls `\WpOrg\Requests\Requests::request()` directly, not `wp_remote_*`. A `pre_http_request` interceptor would record a false zero, and the request would leave the machine (in Playground, PHP networking always goes through the Node WS→TCP proxy, `@php-wasm/node` `withNetworking`).
   - I therefore contain HTTP at the **Requests transport**. That layer also sits under `wp_remote_*` (after `pre_http_request`, so the existing siteverify double still answers first).
   - Loopback goes to the real Curl/Fsockopen transport. Everything else is answered or blocked there.
   - This is still transport-level interception of CleanTalk's real `apbct_base_call` → `Cleantalk::isAllowMessage` → `sendRequest`. Nothing in CleanTalk is patched.
2. **Direct-transport fallback.** Only `Cleantalk::rotateModerateAndUseIP()` sets `wp__use_builtin_http_api=false`, and only after `cURL error 28` / `getaddrinfo` errors. The contained moderation answer is a successful `{allow:1,…}`, so that path is never reached. The suite asserts the setting is still `1` after the controls.
3. **Browser egress was real before containment.** The first green-path attempt showed Chromium loading `fd.cleantalk.org/ct-bot-detector*.js` and POSTing `fd-api.cleantalk.org/frontend_data/v2` with HTTP 200. Compatibility contexts now abort them, and they are ledgered with `status: null` and `net::ERR_BLOCKED_BY_CLIENT`.
4. **FluentSMTP send path.** With no connection and no simulation, `FluentPHPMailer::send()` falls through to `$phpMailer->send()` (PHP mail). `FLUENTMAIL_SIMULATE_EMAILS` is a blueprint constant, so it is set before any request. Passthrough is additionally gated on that constant and on `wp_mail` being FluentSMTP's. Otherwise the observer short-circuits, so there is no route to core/PHP mail.
5. **Pro webhook dispatch.** In FF 6.2.14 the webhook is queued and runs from the Action Scheduler runner: the capture's hooks are `action_scheduler_run_queue` → `fluentform/schedule_feed` → `fluentform/integration_notify_fluentform_webhook_feed`. Nothing is captured before `drainQueues()`, and exactly one capture happens after.

## Interfaces for the next unit

`startHarness({ run, compatibility: true })` → `Harness`. Everything new is additive, and the `MailRecord`, `FeedRecord`, `QueueState`, `drainQueues`, `runCron`, `browser`/`closeBrowser`/`uploadPlugin` contracts are unchanged.

- `h.compatibility: boolean`
- `h.versions`: `{ gf, ff, wp, php, ffPro?, cleantalk?, fluentSmtp? }`. The optional keys are set only in compatibility mode. Pins are exported: `FF_PRO_VERSION`, `CLEANTALK_VERSION`, `FLUENT_SMTP_VERSION`.
- `h.fixtures.stack?`: `{ webhook: <fluentform_form_meta id>, capture: "<home>/pirax-harness/capture/webhook" }`. The feed sits on `h.fixtures.ff` only; GF has none.
- `h.http(): HttpRecord[]`. The file is `wp-content/pirax-harness/http.jsonl`, append-only, so slice by the length before a step.
  - Fields: `{ purpose: "cleantalk-moderation"|"webhook-capture"|"blocked", method, host, path, hooks: string[], action: string|null, api?, entry?, request, time }`. There is no query, header or body.
  - **Separate submission traffic from activation/background traffic by `hooks`:**
    - FF moderation: `["wp_ajax_nopriv_fluentform_submit","fluentform/before_insert_submission"]`, `action: "fluentform_submit"`.
    - GF moderation: `["wp","gform_entry_is_spam"]`, `request` = the page path.
    - Webhook: hooks include `fluentform/integration_notify_fluentform_webhook_feed`, and `entry` is the FF entry id.
    - Activation: `activate_<plugin>` and `gform_post_install`, purpose `blocked`.
    - CleanTalk's REST email pre-check `/wp-json/cleantalk-antispam/v1/check_email_before_post`: `parse_request`, purpose `blocked` (host `api.cleantalk.org`).
  - Only `check_message` / `check_newuser` bodies to `*.cleantalk.org` are answered as moderation. Every other third-party request is `blocked`. WordPress callers see `WP_Error('http_request_failed', 'Pirax harness: third-party HTTP is contained')`.
- `h.envelopes(): EnvelopeRecord[]`: the effective PHPMailer envelope at `phpmailer_init`, which is what FluentSMTP hands to its provider. Fields: `{ to, cc, bcc, replyTo, from, subject, headers: ["Name: value"], mailer: "fluent-smtp.php", transport: "fluentsmtp-simulator"|"other", request, time }`.
- `h.simulator(): SimulatorRecord[]`: FluentSMTP `fsmpt_email_logs` rows, oldest first. Fields: `{ id, to: string[], from, subject, headers: ["Name: value", "content-type: text/html"], provider: "Simulator", status: "sent", created }`. The Simulator log has no Cc/Bcc, so use `envelopes()` for those.
- `h.mail()` still records the final `wp_mail()` arguments. In compatibility mode it now observes and passes through.
- Fixture options and functions, all set through `h.php()`:
  - `pirax_harness_mail_passthrough` (option): on by default in compatibility mode. Set it `false` to restore the baseline short-circuit. It has no effect on the default stack.
  - `pirax_harness_ff_pro_feature($form_id, 'double_optin'|'admin_approval'|'auto_delete', bool)` writes native settings:
    - `double_optin`: form `double_optin_settings` with `status` yes/no, `email_field` `email`, and `skip_if_logged_in` no.
    - `admin_approval`: global module `admin_approval` plus form `admin_approval_settings` with `status` and `skip_if_logged_in` no.
    - `auto_delete`: `formSettings.delete_entry_on_submission` yes/no.

    The test verifies it with `DoubleOptin::getDoubleOptinSettings(...,'public')`, `AdminApproval::isEnabled()` and `Helper::isEntryAutoDeleteEnabled()`.
  - Native queues: use the unchanged `h.queues()` / `h.drainQueues()`. Pro webhook jobs sit in Action Scheduler (pending) and FF's `ff_scheduled_actions`.
- The `activations.jsonl` ledger (`wp-content/pirax-harness/`) lists every activated plugin, which proves the mu-plugin was loaded during activation.

## Tests run

Canonical command from the brief:

```sh
AKROGON_BASE=e2075daad1c5b0dd2438ff61d71e606c47819a39 bash -c ': "${AKROGON_BASE:?AKROGON_BASE is required}" && bun test'
```

**Red** (new tests in place, before implementation): `208 pass, 8 fail, Ran 216 tests across 21 files [807.12s]`, exit 1. The log, now redacted, is at `/tmp/hc-evidence/red.log`.
- Failing, as intended:
  - harness.test: the compatibility preflight did not throw (the Pro variable was not required); `h.compatibility` was `undefined`.
  - All 5 stack-harness tests: `compatibility` and `versions.ffPro` were undefined; `Class "FluentFormPro\classes\DoubleOptin" not found`; the other 2 tests (FF/GF controls, evidence) also failed.
- 1 pre-existing, order-dependent failure: `test/forms/playground.test.ts` hit `ENOENT dist/pirax-form-test.zip` because it ran before any suite built the plugin. It passed in the green run once the ZIP existed. This is outside this unit.

**Green**: `223 pass, 0 fail, Ran 223 tests across 21 files [1373.69s]`, exit 0 (`/tmp/hc-evidence/green.log`).
- Default suites are compatible: core, adapters, safety, review-regressions, harness and the forms suites all pass.
- Evidence dirs:
  - `artifacts/plugin/stack-harness-2026-09-28T13-53-11-477Z/` (`manifest.json`, `http.jsonl`, `envelopes.jsonl`, `simulator.jsonl`, `mail.jsonl`, `feeds.jsonl`, `entries.json`, `network.jsonl`, `stack-controls.trace.zip`, `playground.log`)
  - `artifacts/plugin/harness-smoke-2026-09-28T13-48-54-379Z/`

`bun run typecheck` is clean. `git diff --check` is clean.

Debugging runs used the single file `bun test test/plugin/stack-harness.test.ts` (last: 5 pass). These are not evidence.

After the green run I changed one test input only: the compatibility preflight test now uses a temporary stand-in GF file instead of `process.env.GRAVITY_FORMS_ZIP` (see Privacy). I verified that change with `bun test test/plugin/harness.test.ts -t "compatibility preflight|preflight names"`: 2 pass, 0 fail. I did not re-run the full canonical command after it.

## Privacy verification

- `findSecret` with the token and both licensed paths over the 11 plugin artifact directories created this session found **0 hits**. The suite itself asserts the same for its run. Only names and presence were printed.
- **Incident, contained:** in the red run, the new preflight test's failing `toThrow` made Bun print preflight's return value. That value contained the real `GRAVITY_FORMS_ZIP` path, once, in the local `/tmp` red log.
  - It was never in retained artifacts, the worktree, or any output I displayed.
  - I redacted the `/tmp` logs in place with the harness's `redact()` (1 replacement each in the two copies of the red log). The green log is clean.
  - Root cause, fixed: the test now uses a stand-in file, so a failing assertion cannot print a licensed path.

## Known limitations

- **Containment covers PHP HTTP at the Requests layer only.** Raw PHP `curl_*`/sockets bypass it. That covers CleanTalk's non-WP transport, which is reached only if `wp__use_builtin_http_api` is turned off, and any plugin using raw sockets.
  - Playground 3.1.55's v1 worker enables PHP networking unconditionally, and there is no blueprint php.ini step to disable `curl_exec`/`fsockopen`.
  - Mitigation: the fixtures keep the built-in mode, the successful moderation answer avoids the only fallback trigger, and the suite asserts the setting is still `1`.
- The CleanTalk activation redirect is consumed by deleting its one-shot option. The redirect's side calls (`ct_account_status_check`, SFW update init) therefore do not run. They would only have made blocked HTTP calls anyway.
- `saveEvidence()` on the default stack now does 3 extra `php()` reads (`http`, `envelopes`, `simulator`); they return empty lists and nothing extra is written.
- `test/plugin/README.md` and the root README do not yet describe `FLUENT_FORMS_PRO_ZIP`, the stack suite, containment or the new evidence files. Docs were outside this unit's file list (plan checklist items 14–15).
- Plan-level operator action carried forward: add the variable name `FLUENT_FORMS_PRO_ZIP` (empty value) to `.env.example` if missing. I did not read or edit it.

## Unverified criteria

- **Criterion 4, marked-case parts:** not in this unit. The harness supports zero-hit and zero-queue assertions for marked submissions, but those need the production changes in the next unit.
- **Criterion 3, "no real third-party request" at the socket level** for PHP code that bypasses Requests: I could only verify it by construction and the settings assertion (see Known limitations).
- The Pro opt-in, approval and auto-delete fixtures are verified only by reading settings back through Pro's getters. No submission has run with them enabled.
- No full canonical re-run after the final test-input-only fix (targeted run passed).
