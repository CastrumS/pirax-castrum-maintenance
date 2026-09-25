# Brief: form-helper-plugin

## What
Build the WordPress plugin `pirax-form-test` under `plugin/pirax-form-test/` and `bun run build:plugin` producing `dist/pirax-form-test.zip`, uploadable via wp-admin → Plugins → Add New → Upload. Settings page (Settings → Pirax Form Test, `manage_options` only, nonce-protected): secret token and redirect address. With an empty token the plugin does nothing. When a Gravity Forms or Fluent Forms submission contains the token in any field value, the plugin marks that request and:
1. passes CAPTCHA validation for that submission (Gravity Forms: `gform_field_validation` on captcha fields; Fluent Forms: only through a clean hook found in its source, otherwise it leaves CAPTCHA on and documents that in the README);
2. suppresses add-on feeds and integrations (Gravity Forms: `gform_addon_pre_process_feeds` returns none; Fluent Forms: its integration/feeds hook; if a form's integrations can't be suppressed, the submission is rejected with the message "Pirax test blocked: integrations could not be suppressed");
3. rewrites every mail that request sends through the `wp_mail` filter: `to` becomes the redirect address, Cc/Bcc headers are removed, the subject gets the prefix `[pirax-test <id>]`, and the header `X-Pirax-Form-Test: <id>` is added, where `<id>` is the text after `<token>-` in the submitted value;
4. deletes the entry after notifications are sent (Gravity Forms: `gform_after_submission` late priority → `GFAPI::delete_entry`; Fluent Forms: after its notifications, including async/queued ones), plus an hourly wp-cron sweep deleting any entry containing the token that is older than one hour.

Credentials this leaf needs (in `.env`):
- `GRAVITY_FORMS_ZIP`: absolute path to a licensed Gravity Forms plugin zip (gravityforms.com → account → Downloads), used only to load Gravity Forms into the local test WordPress.

## Why
Real test submissions (5-A) must never reach clients (inboxes, CRMs) or leave entries behind, and CAPTCHA would otherwise block them (captcha 2-A). A plugin uploaded through wp-admin is the only delivery path, since this repo has no SSH (1-B, 3-A).

## Done-criteria
1. End-to-end in a local WordPress started with `@wp-playground/cli` with Gravity Forms (from `GRAVITY_FORMS_ZIP`), Fluent Forms (wordpress.org), this plugin and a test-only mu-plugin that logs final `wp_mail` arguments via `pre_wp_mail` and short-circuits sending. For each form plugin, a Playwright submission containing `<token>-abc123` produces a logged mail to the redirect address only, with no Cc/Bcc, subject prefix `[pirax-test abc123]` and header `X-Pirax-Form-Test: abc123`; the entry no longer exists afterwards; the configured feed/integration did not fire. Trace and mail log kept as artifacts.
2. Negative cases: the same submission without the token mails the original recipient and keeps the entry; a wrong token has no effect; with an empty token setting nothing changes; the settings page rejects non-admins and missing nonces.
3. CAPTCHA: on a Gravity Forms form using its built-in CAPTCHA field (reCAPTCHA v2), with the test mu-plugin forcing Google's siteverify response to `{"success":false}` through `pre_http_request` (no outbound network needed), the token submission succeeds and a non-token submission is rejected. Fluent Forms: the same test with its reCAPTCHA field if a clean hook exists; otherwise a test asserting the token submission is still rejected by CAPTCHA, and the README records the limitation.
4. The cron sweep deletes a token entry older than one hour and leaves non-token entries.
5. `dist/pirax-form-test.zip` installs and activates cleanly in a fresh Playground WordPress via the upload path; `bun test` passes.
