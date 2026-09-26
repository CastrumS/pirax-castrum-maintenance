# Pirax Form Test

A WordPress plugin for testing contact forms on a client site without involving the client. When a form value contains the operator's secret marker, the plugin:

- redirects that submission's notification mail to the operator's test mailbox;
- suppresses its CRM and other integrations;
- deletes the entry once the mail has been handed to WordPress.

Submissions without the marker are not changed.

It does not send mail itself. Mail still goes through the site's own `wp_mail()` path and configured transport. It adds no REST endpoint, custom table or JavaScript.

## Install

1. Build `dist/pirax-form-test.zip` with `bun run build:plugin` from the repository root.
2. In wp-admin, go to Plugins → Add New → Upload Plugin, choose the ZIP, then Install and Activate.
3. Go to Settings → Pirax Form Test and set both values:
   - **Marker token**: the shared secret, 16–255 characters from `[A-Za-z0-9._~+/=-]`. Other characters are rejected, not changed, because form plugins could otherwise rewrite the token when sanitizing input. The field is a password input and the saved token is never displayed.
     - Leaving it blank keeps the stored token.
     - Ticking **Clear the token** disables test handling for **new** submissions.
   - **Redirect address**: exactly one email address. Lists, whitespace and CR/LF are rejected. It is required while a token is set.

Only users with `manage_options` can view or save the settings. Saving also requires the WordPress nonce. Missing or invalid nonces and non-admin requests change nothing.

Both options (`pirax_form_test_token`, `pirax_form_test_redirect`) are stored with autoload off. Do not put the token in source code or plugin files. It belongs only in this setting and in the checker's private configuration.

## Marker and mail contract

The marker is `<token>-<id>`, where `id` is `[a-z0-9]{6,32}`, for example `<token>-abc123`. It may be followed by an email domain, as in `<token>-abc123@example.test`.

Only submitted field values are searched, including nested and multi-value fields. Field names, cookies and query strings are ignored.

| Submission | Result |
|---|---|
| No token, or a different token | Ordinary: nothing changes. |
| Empty configured token | Ordinary (test handling is off). |
| Valid marker (the same id may repeat) | Marked: handled as below. |
| Token without a valid `-<id>` (uppercase, too short, bare token), or two different ids | Rejected: `Pirax test blocked: invalid test marker` |
| Token set but redirect missing or invalid | Rejected: `Pirax test blocked: test configuration is invalid` |
| Integrations that cannot be suppressed (see below) | Rejected: `Pirax test blocked: integrations could not be suppressed` |

Rejected submissions create no entry and send no mail, and no feeds run.

For each `wp_mail()` call made during a marked submission, or by that submission's queued notification job:

- `to` is replaced by the redirect address alone;
- `To`, `Cc`, `Bcc`, `Resent-To`, `Resent-Cc` and `Resent-Bcc` headers are removed, including folded continuation lines and names padded with whitespace or control characters that `wp_mail()` itself trims;
- exactly one `X-Pirax-Form-Test: <id>` header is set;
- the subject is prefixed `[pirax-test <id>] ` once;
- body, attachments, `From`, `Reply-To` and other headers are kept.

Other mail sent in the same request is redirected too.

If the redirect is unusable, or a later filter undoes the change, marked mail **fails**. `wp_mail()` returns false. The mail is never sent to the original recipients.

## Supported versions and behaviour

Marked submissions are accepted only on the exact audited versions: **Gravity Forms 3.1.2** and **Fluent Forms 6.2.14** (free). Any other version, including a later patch release, rejects marked submissions with the "integrations could not be suppressed" message until the new version is re-audited. Ordinary submissions still work with other versions. The plugin also loads without either form plugin; each adapter is simply inactive.

Tested only on a single WordPress 7.1.2 / PHP 8.3 site. The plugin header declares WordPress 6.4+ and PHP 7.4+, but those are untested. Multisite is untested.

**Gravity Forms**
- **CAPTCHA:** only GF's built-in CAPTCHA field is bypassed; its server check still runs, but the result is overridden. The field's other types (invisible, math/simple) share this path; only reCAPTCHA v2 (checkbox) was tested. All other field validation, the honeypot and spam checks still apply.
- **Feeds and notifications:** add-on feeds are emptied. Notifications are sent synchronously in the submission request, even when background notifications are enabled.
- **Cleanup:** the entry is deleted with `GFAPI::delete_entry` at the end of `gform_after_submission`.

**Fluent Forms**
- **CAPTCHA:** only the `recaptcha` check is skipped, through `fluentform/disable_captcha`. FF uses that check for reCAPTCHA v2 and v3, so both are bypassed, but only v2 was tested. hCaptcha and Turnstile are not bypassed, so marked submissions to forms using them fail like any other submission and delivery is not verified for them. Honeypot, token and field rules still apply.
- **Feeds:** only the email notification feed is dispatched. The feed-type filter is moved to the end of its hook right before dispatch, so a filter registered earlier at `PHP_INT_MAX` cannot add other feeds back.
- **Queued email:** FF's native email queue is supported. At submission time the entry gets meta `_pirax_form_test = <id>` (the id only, never the token), and the same id is stored under that key in each queued notification job. Each job runs under the id stored in the job, not the runner request's data, so it stays redirected even if the entry and its meta are deleted after the runner loaded them. Jobs queued without the key fall back to the entry meta. Marked jobs report success or failure through FF's native result action, and failed jobs are retried by FF's cron.
- **Cleanup:** the entry is deleted with FF's native `deleteEntries()` at the end of a request once no job is pending, processing or still retryable (fewer than 4 attempts). If a marked job throws inside Action Scheduler, its context is unwound before the next action runs and the job is reported failed, so FF retries it.

**Fail closed (both).** A marked submission is rejected before anything is saved or dispatched (for FF, before CAPTCHA) when any of these is true:

- a callback outside the small audited inventory is hooked on the submission side-effect, feed-dispatch or notification hooks (in `includes/compatibility.php`). Examples: FF Pro, GF payment or user-registration add-ons, or custom `gform_after_submission` code;
- the GF form has post-creation fields;
- the FF form is a payment form (`has_payment`) or not of type `form`.

One such callback blocks marked submissions on every form of that site.

## Scheduled recovery sweep

Activation schedules one hourly WP-Cron event, `pirax_form_test_sweep`. It deletes entries whose submitted field values contain the configured token and that are **strictly older than one hour**. This also catches old malformed markers.

- **Selection:** candidates are read in pages of 50 with an escaped `LIKE` and a stable id cursor; the decoded field values decide what is deleted. FF values are read from the stored submission as it was saved, so renaming or removing a form field later does not strand old test entries. Younger entries, entries without the token, and matches found only in metadata or the source URL are kept. GF times are compared in UTC and FF times in site-local time.
- **Deletion:** entries are deleted with the native APIs only (GFAPI or FF `deleteEntries`), after removing the entry's queued work:
  - FF: pending jobs and their Action Scheduler actions;
  - GF: background notification and feed tasks, including tasks that only carry a copy of the entry. Other tasks are kept.
- **Deferral:** an FF entry whose job is `processing` and was touched within the hour is left for a later run. A GF entry is left for a later run while a GF processor holding its task is running.
- **Empty token:** the sweep does nothing.

WP-Cron runs only when the site gets traffic, so one hour is a recovery deadline, not an exact wall-clock guarantee and not proof of delivery. An entry removed by the sweep whose mail never finished shows up as missing delivery in the external checker.

## Token rotation, disabling and uninstall

- **Rotation:** clear pending tests before changing the token. The sweep finds entries only by the **current** token, so entries holding only the old token are never swept. Already-queued FF test jobs stay marked through their stored id and keep going to the redirect. If the token is cleared, they fail closed instead of reaching clients.
- **Disabling:** clear the token. New submissions are ordinary and the sweep stops.
- **Deactivation** removes the scheduled event and keeps the options.
- **Deleting** the plugin in wp-admin runs `uninstall.php`, which removes both options and the event.

## Rollout

Install on **one site** first, verify the token/redirect and audited versions/integrations, then use the [checker setup and commands](../../README.md#form-checks) (`bun run forms <slug>` or `bun run check <slug>`). `form_helper: true` authorizes real submissions: it is operator attestation, **not** public proof that this plugin is installed or its token matches. Keep it false until verified; a missing/mismatched helper can process tests as ordinary client submissions.

Extend to a small group, then to all sites. Each step needs the operator's explicit go-ahead after the previous step's results are reviewed. Local tests do not authorize rollout. The checker verifies arrival independently over read-only IMAP; this helper still only hands mail to WordPress. See the [native checker and real-mail test guide](../../test/forms/README.md) for the distinction between logged Playground mail and delivered mail.

A site whose form-plugin versions or integrations differ from the audited set rejects marked submissions. Treat it as not rollout-ready until it is re-audited, rather than working around the rejection.

## Known limitations

- **After `wp_mail`:** anything that changes recipients after `wp_mail` (for example in `phpmailer_init` or an SMTP plugin's transport), or arbitrary PHP outside the audited hooks, is out of reach. This includes a callback that registers a new FF feed-type filter after the pre-dispatch move. No plugin can prove safety against all other code.
- **Checker browser limits:** invisible/reCAPTCHA v3 client flows are unverified and may time out under the checker's frozen request policy despite this helper's server-side bypass. Specialized GF phone formats/widgets are also unverified by the checker and may reject its fixed data; basic telephone filling is not proof of support.
- **Delivery is not verified here:** the local tests log `wp_mail()` arguments; they do not verify SMTP delivery or mailbox arrival.
- **GF save and continue** (`gform_save`) skips validation, so a marker in a saved draft is not detected.
- **GF prune race:** a GF worker that starts between the sweep's `is_processing()` check and its batch update can write a removed task back. GF has no compare-and-set batch API.
- **Crashed FF job:** a job left `processing` by a crashed worker delays cleanup until it has been untouched for an hour.
- **DST:** during a fall-back hour, the FF site-local one-hour comparison can be off by up to an hour.
- **Unwinding covers Action Scheduler only.** Other runners that catch exceptions and continue in the same request are not covered. FF 6.2.14's legacy and WP-Cron runners end the request on an exception; this was checked in the source but not tested.
- **Nested scopes stay marked:** an unmarked scope nested inside a marked request stays marked, so that mail is redirected, not leaked.
