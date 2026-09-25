# Brief: form-check

## What
Extend `check <slug|all>` (and add `bun run forms <slug|all>` for forms only) so every listed page is scanned at desktop width for Gravity Forms (`.gform_wrapper form`) and Fluent Forms (`form.frm-fluent-form`) forms. For each form: fill visible fields with test data, putting `FORM_TEST_ADDRESS` in email fields and `<FORM_TEST_TOKEN>-<id>` in the first textarea (else the first text field). Then:
- when the site has `form_helper: true`, submit, require the plugin's on-page confirmation, and poll the mailbox read-only (IMAP `EXAMINE`/`BODY.PEEK`, only `IMAP_FOLDER` and `IMAP_SPAM_FOLDER`, only messages whose subject carries `[pirax-test <id>]`) for up to 5 minutes. The outcome is `delivered`, `delivered-spam`, or `failed`;
- when it has `form_helper: false`, fill and validate but never submit: `not-verified`.
File-upload fields, other form plugins and forms without a text field are `unsupported`; server-side validation or CAPTCHA errors are `rejected` with the message. Results fill `PageResult.forms` in the run report.

Credentials this leaf needs (in `.env`):
- `FORM_TEST_TOKEN`: long random secret, e.g. `openssl rand -hex 32`; the same value goes into each site's plugin settings.
- `FORM_TEST_ADDRESS`: the plus-address/alias of the new dedicated mailbox that the plugin redirects test mail to and the checker types into email fields.
- `IMAP_HOST`, `IMAP_PORT`, `IMAP_USER`, `IMAP_PASSWORD`: login for the new dedicated mailbox (Gmail: imap.gmail.com, 993, app password from Google Account → Security → App passwords).
- `IMAP_FOLDER`: the label/folder the mailbox filter files test mail into; `IMAP_SPAM_FOLDER`: its spam folder (Gmail: `[Gmail]/Spam`).
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`: sending login for the same mailbox, used only by the IMAP module's end-to-end test (Gmail: smtp.gmail.com, 465, same app password).

## Why
The operator's manual routine included confirming forms can be submitted (intake). A form can look fine while mail never arrives, so arrival in the dedicated mailbox is the proof (5-A, 3-A, mailbox).

## Done-criteria
1. End-to-end against a local `@wp-playground/cli` WordPress with Gravity Forms (`GRAVITY_FORMS_ZIP`), Fluent Forms and the built `dist/pirax-form-test.zip`: `bun run forms local` submits one form of each plugin, receives the on-page confirmation, and records the plugin's logged redirected mail (the Playground site cannot send real mail). Trace and report kept as artifacts.
2. IMAP end to end with the real dedicated mailbox: the test sends a message via `SMTP_*` to `FORM_TEST_ADDRESS` with subject `[pirax-test <id>] …`; the checker finds it in `IMAP_FOLDER` (or `IMAP_SPAM_FOLDER`, reported as `delivered-spam`), and a second run for an id that was never sent times out as `failed`. The test asserts the mailbox message count and flags are unchanged afterwards (nothing read-marked, moved or deleted).
3. Negative cases: a site with `form_helper: false` is never submitted (asserted from the Playground mail log and entry count); a file-upload form is `unsupported`; a required-field rejection is reported as `rejected` with the message; the token never appears in the report, logs or trace names.
4. The report shows the Forms column with outcomes per page; exit code is 1 when any form is `failed` or `rejected`; `bun test` and `bun run typecheck` pass.
