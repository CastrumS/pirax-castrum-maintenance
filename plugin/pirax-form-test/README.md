# Pirax Form Test

A WordPress plugin for testing contact forms on a client site without involving the client. When a form value contains the operator's secret marker, the plugin:

- redirects that submission's notification mail to the operator's test mailbox;
- suppresses its CRM and other integrations;
- deletes the entry once the mail has been handed to WordPress.

Submissions without the marker are not changed.

It does not send mail itself. Mail still goes through the site's own `wp_mail()` path and configured transport. It adds no REST endpoint, custom table or JavaScript.

## Install

1. Build `dist/pirax-form-test.zip` with `bun run build:plugin` from the repository root, or take `pirax-form-test.zip` from a published release of this repository.
2. In wp-admin, go to Plugins → Add New → Upload Plugin, choose the ZIP, then Install and Activate. On a site that already has the helper, choose **Replace current with uploaded**; settings are kept.
3. Go to Settings → Pirax Form Test and set both values:
   - **Marker token**: the shared secret, 16–255 characters from `[A-Za-z0-9._~+/=-]`. Other characters are rejected, not changed, because form plugins could otherwise rewrite the token when sanitizing input. The field is a password input and the saved token is never displayed.
     - Leaving it blank keeps the stored token.
     - Ticking **Clear the token** disables test handling for **new** submissions.
   - **Redirect address**: exactly one email address. Lists, whitespace and CR/LF are rejected. It is required while a token is set.

Only users with `manage_options` can view or save the settings. Saving also requires the WordPress nonce. Missing or invalid nonces and non-admin requests change nothing.

Both options (`pirax_form_test_token`, `pirax_form_test_redirect`) are stored with autoload off. Do not put the token in source code or plugin files. It belongs only in this setting and in the checker's private configuration.

## Updates

From 0.3.0 the helper updates itself through WordPress's normal plugin updates, from the GitHub releases of `CastrumS/pirax-castrum-maintenance`. Only this plugin is affected: the helper and the checker never update WordPress, the form plugins or anything else on a client site.

**First upgrade from 0.2.4 or older.** Those versions have no updater and never see a release. Upload a 0.3.0 or newer ZIP once on every existing site, as in [Install](#install) step 2. From then on, new releases arrive on their own.

**Channel.** WordPress's regular update check fetches `releases/latest/download/pirax-form-test-manifest.json` and its `.sig` from the latest full release (drafts and prereleases are never "latest"). The manifest is `{"version", "package", "sha256", "audited"}`; the `.sig` is the base64 of a 64-byte Ed25519 signature over the exact manifest bytes. The plugin header's `Update URI` keeps WordPress from matching a same-named wordpress.org plugin.

**Verification.** An update is offered only when the signature verifies against the public key built into the helper (`UPDATE_PUBLIC_KEY` in `includes/updates.php`), the manifest is well formed, its version is a stable dotted number newer than the installed header, and `package` is exactly that release's `…/releases/download/v<version>/pirax-form-test.zip`. At install time the helper fetches and verifies the manifest again, requires it to match the offer, downloads the package itself and hands it to WordPress only if its SHA-256 matches the manifest. A network failure, bad or missing signature, malformed or changed manifest, other package URL or hash mismatch offers or installs nothing, never falls back to WordPress's unchecked download, and leaves the installed helper unchanged. A failed check also withdraws an earlier offer. The manifest's `audited` map records which versions that release was audited for; the installed helper's own exact-version table (below) still decides what it accepts.

**Automatic updates.** The helper opts only itself into WordPress auto-updates; an administrator can also update it from Plugins or Dashboard → Updates. It cannot override automatic updates that are disabled site-wide, a plugin directory WordPress cannot write, a site that cannot reach GitHub, or WP-Cron not running because the site gets no traffic. Those sites stay on their version until someone updates them.

**Limits.** The signature proves who built a release and that it was not altered, not that it is current: there is no expiry, so a site that cannot fetch the feed, or a feed that is withheld, silently keeps the installed version. Only WordPress's update path is restricted to signed releases, and only while the helper is active: its update hooks run only then, so deactivating it removes that protection, just as an administrator, or other code with the same privileges, can still replace the plugin's files or remove its hooks. Anyone holding the private signing key can publish updates that every site installs; signatures cannot protect against a leaked key.

**Releases.** A release is made with `scripts/release-plugin.ts` (see [Releasing](#releasing)). The daily [automatic re-audit](../../README.md#automatic-re-audit) runs that CLI after a passing audit. The updater consumes published releases; it neither re-audits plugins nor schedules publication.

**Key recovery.** The private key is held as the GitHub repository secret `PIRAX_HELPER_SIGNING_KEY`, which GitHub delivers to the publishing job, and GitHub secrets cannot be read back. If the key is lost or may be compromised, generate a new pair, replace `UPDATE_PUBLIC_KEY` and the secret, and upload the resulting helper manually on every site: sites that still have the old key reject releases signed by the new one. There is no in-band key rotation.

### Releasing

```sh
bun scripts/release-plugin.ts --dry-run   # build and sign only; never contacts GitHub
bun scripts/release-plugin.ts             # build, sign and publish v<version>
```

Both read the signing key only from the environment variable `PIRAX_HELPER_SIGNING_KEY`: the base64 of a raw 32-byte Ed25519 seed, not PEM and not a 64-byte expanded key. The publishing job receives it from the repository secret of that name; never pass it as an argument or write it to a file. Errors name the variable, never its value, and child processes (`zip`, `git`, `gh`) do not receive it.

The version comes from the plugin header, which must equal the `VERSION` constant and be a stable dotted number; the `audited` map comes from `AUDITED_VERSIONS` in `includes/compatibility.php`. Both are read by `scripts/plugin-source.ts`. A missing, duplicated or non-literal declaration, a missing or unknown plugin key, or an audited version that is not a stable dotted number fails the release instead of falling back to another list. The ZIP is built exactly as by `bun run build:plugin`. `dist/` then holds `pirax-form-test.zip`, `pirax-form-test-manifest.json` and `pirax-form-test-manifest.json.sig`.

**`--dry-run`** accepts any key, so tests sign with a freshly generated one. Its output is for inspection and tests only: a release signed with a test key does not change the helper's built-in public key, and shipping helpers would reject it.

**Publishing** first checks, in order, that the key matches `UPDATE_PUBLIC_KEY`; that `plugin/pirax-form-test/` has no uncommitted changes; that no local tag `v<version>` exists; and, read-only on GitHub, that neither a tag nor a release (drafts included) named `v<version>` exists. Only a "not found" answer counts as absent: an authentication, network or rate-limit failure stops the release. It then builds and signs, scans the exact final manifest, signature and ZIP entries for raw, URL-encoded and JSON-escaped known secrets using `scanEvidence`/`secretValues`, and withholds the assets if scanning fails. Archive children receive no credentials. The checked files are not rebuilt or edited before publication (the same scan also gates `--dry-run`). It publishes in two steps:

1. `gh api --method POST repos/CastrumS/pirax-castrum-maintenance/git/refs -f ref=refs/tags/v<version> -f sha=<HEAD commit>` creates the tag on GitHub. This is the atomic claim: GitHub refuses a ref that already exists, so a tag created by someone else since the read-only check stops the release here (HTTP 422), as does an authentication or network failure. No release command is attempted; after a network failure, inspect whether the tag was created before retrying.
2. `gh release create v<version> --repo CastrumS/pirax-castrum-maintenance --verify-tag --latest --target <HEAD commit>` with exactly the three files. `--verify-tag` requires the claimed tag to still exist. The atomic claim in step 1 prevents reusing someone else's concurrently created tag; the read-only preflight alone could not do that.

**Automatic releases.** The re-audit's publish job (`scripts/reaudit/publish.ts`) runs this CLI, including its pre-publication privacy gate, with the signing key in that child's environment only. It runs only after it has committed the audited pins, the next patch version and the regenerated [current-version section](#supported-versions-and-behaviour) to `main` with a normal push. It then verifies the published release independently: it must be the latest full release with exactly the three assets; the manifest must verify against `UPDATE_PUBLIC_KEY` and match the ZIP's SHA-256, the version and the audited pins; the ZIP entries, the embedded pins and the main file's `Version` header and `VERSION` constant must match; and the tag must point at the pushed commit. A run with no vendor change verifies the current version's release the same way. A missing or incomplete release fails that run instead of passing silently.

It never overwrites or deletes a tag and never replaces a release or asset (no `--clobber`). The two steps are not one transaction. A failed command or lost response can leave a tag, a draft or partially uploaded release, or even a completed release. Inspect the remote tag's commit and the release/assets before recovery. Only if no release exists and the tag matches the intended commit should you rerun `gh release create v<version> --verify-tag …` with the verified `dist/` files. Do not delete a tag or overwrite assets blindly; rerunning this CLI refuses an existing tag. Publishing needs an authenticated `gh` with write access, and HEAD must already be on GitHub.

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
| Only plugin versions that are not audited yet block it (see below) | Rejected: `Pirax test blocked: awaiting audit of <plugin> <version>[, <plugin> <version>…]` |

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

<!-- Generated by scripts/reaudit/bump.ts from AUDITED_VERSIONS and the helper version: change those, never this section by hand. -->
<!-- pirax:current-versions:start -->
Version 0.3.0. Marked submissions are accepted only on these exact audited versions, compared as exact strings:

| Plugin | Audited version | Applies to |
|---|---|---|
| Gravity Forms | 3.1.2 | GF |
| Fluent Forms (free) | 6.2.14 | FF |
| Fluent Forms Pro | 6.2.15 | FF, when active |
| Anti-Spam by CleanTalk | 6.88 | GF and FF, when active |
| FluentSMTP | 2.4.1 | GF and FF, when active |

Pro, CleanTalk and FluentSMTP are optional: a site without them is checked against the core rows only. When one is active at any other version, marked submissions of the adapters it applies to are rejected. This includes later patch releases such as FluentSMTP 2.4.2 or CleanTalk 6.88.1: 2.4.1 is the only audited FluentSMTP release, not 2.4.x. An active plugin whose version cannot be read counts as not audited. A new version is supported only after it is re-audited. Ordinary submissions still work with any version. The plugin also loads without either form plugin; each adapter is simply inactive.
<!-- pirax:current-versions:end -->

**Pin authority.** This table mirrors `AUDITED_VERSIONS` in [`includes/compatibility.php`](includes/compatibility.php), the only executable source of these five pins; if the two ever disagree, that file is what the plugin enforces. The marked section above is generated by `scripts/reaudit/bump.ts` from that table and the helper version. The automatic re-audit rewrites it together with the five pin lines and the paired Version header and `VERSION` constant, and nothing else. A test fails if the section drifts from the source. The release manifest, the native test harness, its wrong-version fixtures and the form checker's native suite all read it through `scripts/plugin-source.ts` rather than keeping their own list.

**Awaiting audit or generic.** When the only reason for a block is plugins at known versions that are not audited yet, the rejection names them, for example `Pirax test blocked: awaiting audit of Fluent Forms Pro 6.2.16`. Several are listed in the panel's order (core plugins, then optional ones). Unaudited callbacks do not change that only if each one is declared in a file inside one of those mismatched plugins' own directories, which the helper checks by reflecting the callback's source file, not by its name. Any other cause, alone or together with a version mismatch, keeps `Pirax test blocked: integrations could not be suppressed`: a version that cannot be read, a callback from any other plugin or custom code, an unsupported form, an unrecognized CleanTalk binding, or a removal failure. At the audited Pro version, Pro's Inventory module still gets the generic message. Both messages reject the submission before anything is saved, mailed or dispatched. The awaiting-audit message means the site is waiting for a re-audit; it does not promise that the new version, or its modules, will be accepted. The form checker reports this message as an `awaiting-audit` warning (exit 0), and as `failed` (exit 1) once the site has been awaiting audit for more than 72 hours; the generic message stays `rejected`. See [Awaiting-audit refusals](../../README.md#awaiting-audit-refusals).

Tested only on a single WordPress 7.1.2 / PHP 8.3 site. The plugin header declares WordPress 6.4+ and PHP 7.4+, but those are untested. Multisite is untested.

**Gravity Forms**
- **CAPTCHA:** only GF's built-in CAPTCHA field is bypassed; its server check still runs, but the result is overridden. The field's other types (invisible, math/simple) share this path; only reCAPTCHA v2 (checkbox) was tested. Other field validation, the honeypot and spam checks still apply, except for the explicitly suppressed CleanTalk integration described below.
- **Feeds and notifications:** add-on feeds are emptied. Notifications are sent synchronously in the submission request, even when background notifications are enabled.
- **Cleanup:** the entry is deleted with `GFAPI::delete_entry` at the end of `gform_after_submission`.

**Fluent Forms**
- **CAPTCHA:** only the `recaptcha` check is skipped, through `fluentform/disable_captcha`. FF uses that check for reCAPTCHA v2 and v3, so both are bypassed, but only v2 was tested. hCaptcha and Turnstile are not bypassed, so marked submissions to forms using them fail like any other submission and delivery is not verified for them. Honeypot, token and field rules still apply.
- **Feeds:** only the email notification feed is dispatched. The feed-type filter is moved to the end of its hook right before dispatch, so a filter registered earlier at `PHP_INT_MAX` cannot add other feeds back.
- **Queued email:** FF's native email queue is supported. At submission time the entry gets meta `_pirax_form_test = <id>` (the id only, never the token), and the same id is stored under that key in each queued notification job. Each job runs under the id stored in the job, not the runner request's data, so it stays redirected even if the entry and its meta are deleted after the runner loaded them. Jobs queued without the key fall back to the entry meta. Marked jobs report success or failure through FF's native result action, and failed jobs are retried by FF's cron.
- **Cleanup:** the entry is deleted with FF's native `deleteEntries()` at the end of a request once no job is pending, processing or still retryable (fewer than 4 attempts). If a marked job throws inside Action Scheduler, its context is unwound before the next action runs and the job is reported failed, so FF retries it.

**Fail closed (both).** A marked submission is rejected before anything is saved or dispatched (for FF, before CAPTCHA) when any of these is true:

- a core or active optional plugin is not at its audited version (table above);
- a callback outside the small audited inventory is hooked on the submission side-effect, feed-dispatch or notification hooks, including GF's form-specific `<hook>_<form id>` variants (in `includes/compatibility.php`). Examples: FF Pro modules not listed below (such as Inventory, Post/CPT, payments, user registration or AffiliateWP), GF payment or user-registration add-ons, or custom `gform_after_submission` code;
- CleanTalk's check is switched on for the submission but its audited binding cannot be recognized or removed (see below). For a GF modern AJAX submission this is decided, and the request refused, before CleanTalk's generic AJAX check can run;
- the GF form has post-creation fields;
- the FF form is a payment form (`has_payment`) or not an ordinary form: its type must be `form` or empty (FF stores its own activation demo form, often reused as the contact form, with an empty type); `post` and other types are rejected.

An unaudited generic callback blocks that form plugin's marked submissions site-wide; a GF form-specific callback blocks that form. FF Pro itself does not block; only its callbacks outside the audited list do. Custom forms and optional Pro modules that were not audited stay unsupported.

**Suppressed for marked submissions only.** Some audited callbacks have side effects that a test must not trigger. For a marked submission the plugin removes exactly these bindings, by callback identity and exact priority, before they can run, and checks that they are gone; if removal fails the submission is rejected. It removes these form-level bindings again just before dispatch (GF priority 998, FF priority 9) in case they were re-registered, and restores them for the next ordinary submission in the same PHP request. CleanTalk's generic AJAX check for GF modern AJAX (below) is not among them: it is removed once, early in that request, and neither removed again nor restored. Ordinary submissions are unchanged: they still get CleanTalk moderation and Pro's features.

Which CleanTalk check applies depends on the submission route:

- **FF** (AJAX, `admin-ajax.php` `action=fluentform_submit`): CleanTalk's `FluentForm` integration closure. CleanTalk's generic AJAX check skips this action.
- **GF postback** (the form posts to its page): CleanTalk's GF bindings, which it registers on public requests only.
- **GF modern AJAX** (`gform_submission_method=ajax`: `admin-ajax.php` `action=gform_submit_form`): CleanTalk's GF bindings are not registered on admin-ajax. Instead, its generic AJAX check (`ct_ajax_hook`) sends the whole POST to CleanTalk on `plugins_loaded` at priority 10, before GF has even loaded the form. While CleanTalk is active, the plugin therefore checks these requests first on `plugins_loaded` (priority `PHP_INT_MIN`), so a check moved to an earlier priority is caught too (unless it was itself registered at `PHP_INT_MIN` before the plugin's check). Only GF field-shaped inputs (`input_<n>` and `input_<n>_<m>`) count; other POST names, query strings and cookies do not. The plugin first scans all of them with its own code: without the token, the request is ordinary and left alone, and no GF API is called. With the token (a valid marker or a malformed one), GF must be the audited version before the plugin reads the fields of the posted `form_id` straight from GF's stored form, without GF's form cache or filters, which must not run before GF initializes. When the token is only in the stored form's fields, it removes exactly `ct_ajax_hook` at priority 10 and checks that it is gone; GF's normal preflight then decides as for a postback. The request is instead refused right there, with GF's AJAX error response and the rejection message and before CleanTalk sees it, when:
  - GF is missing or not at its audited version (decided before any GF form API is called), or CleanTalk is not at its audited version;
  - CleanTalk would run this check but it is not its audited binding (moved to another priority, changed or wrapped), or a binding of it remains after the removal;
  - the token is in a field input the stored form does not have, such as a field that only a form filter (`gform_form_post_get_meta`, `gform_pre_render`, …) adds. Such dynamically added fields are unsupported for marked modern AJAX submissions while CleanTalk is active: the early check cannot know them without loading the form before GF initializes.

  A refusal caused only by a known GF or CleanTalk version that is not audited gets the awaiting-audit message; every other early refusal is generic. The early check never reads GF's stored form just to choose the wording.

  Ordinary modern AJAX submissions keep CleanTalk's generic check. Without CleanTalk, modern AJAX submissions are checked only by the normal preflight.

**Historical audit evidence.** The owner versions in the table below, and in the lifecycle note, FluentSMTP note and [Known limitations](#known-limitations) that follow, name the releases whose source was reviewed by hand: CleanTalk 6.88, FF Pro 6.2.15, FluentSMTP 2.4.1 and FF 6.2.14. A later pin is accepted only by the [automatic re-audit](../../README.md#automatic-re-audit), which requires the complete native suites to pass at that pin. Their hook-inventory assertions compare the loaded callbacks with this list. That is a test gate, not a new manual review of callback bodies, so these notes are not proof about any later version, and the re-audit never edits them.

| Owner | Hook (priority) | Callback | Effect prevented |
|---|---|---|---|
| CleanTalk 6.88 | `fluentform/before_insert_submission` (10) | CleanTalk's closure from `lib/Cleantalk/Antispam/Integrations.php`, bound to its `FluentForm` integration | Moderation request and spam verdict |
| CleanTalk 6.88 | `gform_entry_is_spam` (999) | `apbct_form__gravityForms__testSpam` | Moderation request, spam verdict and entry deletion |
| CleanTalk 6.88 | `gform_confirmation` (999) | `apbct_form__gravityForms__showResponse` | CleanTalk's spam text replacing the confirmation |
| CleanTalk 6.88 | `plugins_loaded` (10), GF modern AJAX only | `ct_ajax_hook` | Moderation request with the whole POST, token included, before GF validates |
| FF Pro 6.2.15 | `fluentform/before_form_actions_processing` (10) | `DoubleOptin::processOnSubmission` | Opt-in mail to the visitor, `unconfirmed` status, early response instead of notifications |
| FF Pro 6.2.15 | `fluentform/before_form_actions_processing` (10) | `AdminApproval::processOnSubmission` | Approval mail, `unapproved` status, early response |
| FF Pro 6.2.15 | `fluentform/submission_inserted` (10) | `DraftSubmissionsManager::delete` | Deleting the visitor's saved and step-form drafts |
| FF Pro 6.2.15 | `fluentform/global_notify_completed` (10) | Pro's closure in `fluentformpro.php` | "Delete entry on submission" racing the helper's own cleanup |

CleanTalk's FF check is recognized only if it is CleanTalk's closure with its `FluentForm` integration. For FF, if CleanTalk's contact-form check is switched off, there is no binding to remove and the submission proceeds. If the check is on but its binding was changed or wrapped, the submission is rejected. CleanTalk registers its GF bindings only on public requests, and its generic AJAX check only on admin-ajax requests from visitors it treats as logged out (or from everyone when it protects logged-in users). CleanTalk's options, spam state and moderation results are never changed, and no spam approval is faked.

**Lifecycle limits of the early check.** It runs after every plugin file has loaded. Whatever CleanTalk or another plugin does while its file loads or on `plugin_loaded`, and any `plugins_loaded` callback registered earlier at `PHP_INT_MIN`, runs before it and is outside its reach. One such path is known in CleanTalk 6.88: on admin requests, admin-ajax included, `cleantalk.php` calls `ct_contact_form_validate()`, which can send the POST for moderation, while its file loads, when its `forms__general_contact_forms_test` setting is on and the POST has non-empty `your-phone`, `your-email` and `your-message` fields (a Bitrix24 form layout). GF's native field inputs never have these names, and the native tests of GF's field layout saw no CleanTalk request before the early check. A GF request that also carries those names, for example from custom markup, would reach CleanTalk before the early check, token included; that is not supported. Nothing else about CleanTalk's bootstrap is proven. For any other CleanTalk version it is unverified, and the refusal cannot undo what that version may already have done while loading. The exact-version pin rejects such a test; it does not prove that nothing was sent. Keep CleanTalk at the audited version on sites where tests run. The early check also runs once: a callback that code running after it adds back (for example a later `plugins_loaded` callback that binds the check again at a later priority) is not rechecked.

Pro's WebHook feeds (`fluentform_webhook_feed`) are removed before they are queued by the existing email-feed-only narrowing, so a marked submission creates no webhook job or request.

**CleanTalk browser traffic is not suppressed.** Only the marked form POST is covered, on each route above. Before that POST exists, CleanTalk's frontend JavaScript runs in the visitor's browser: its bot detector, telemetry and a pre-submit email check (`/wp-json/cleantalk-antispam/v1/check_email_before_post`, which calls `api.cleantalk.org`). The plugin cannot tell that a visit is a test at that point, so on a live site CleanTalk still receives those signals and the checker's email address. The checker puts the marker in a text or textarea field, never an email field, so these earlier checks do not carry the marker. That is the checker's behaviour, not a guarantee: a marker typed by hand into an email field could reach CleanTalk through the pre-check.

**FluentSMTP 2.4.1** has no callbacks on the audited hooks, so only its version is checked. The helper's mail changes run inside FluentSMTP's replacement `wp_mail()` before FluentSMTP hands the message to its provider.

**FluentSMTP's email log keeps test mail.** FluentSMTP logs every email by default (`log_emails`), body included. The redirected notification of a marked submission normally lists the submitted fields, so its log row holds the marker and therefore the token. Deleting the entry does not touch that log, and neither does the sweep; the row stays in `fsmpt_email_logs` and FluentSMTP's log view. Other mail loggers behave the same. The plugin never deletes client logs automatically. Deciding whether to turn off logging, purge test rows or shorten log retention on sites that run tests is the operator's policy. Rotate the token if a log holding it may have been exposed.

## Compatibility panel

Settings → Pirax Form Test shows a read-only **Compatibility** section below the settings form, for users with `manage_options` only. It has a Gravity Forms and a Fluent Forms section, each with:

- one row per core plugin and each active optional plugin that applies, with the detected version ("not active" or "unknown version" where that applies) and whether it is audited;
- one verdict: `ready`, or `blocked: <reasons>`;
- every unaudited callback, grouped by hook, with its callback identity and priority. A version failure does not hide these.

All values are escaped. The panel has no JavaScript, endpoint, toggle or bypass. It stores nothing, removes no callbacks and submits nothing.

**Last blocked test submission.** When a marked submission is rejected with the generic or the awaiting-audit message, including by the early GF modern AJAX check, the helper stores why in the option `pirax_form_test_last_block` (autoload off, replaced by the next block, removed on uninstall): the time, form plugin, form id, the reasons, the unaudited callbacks seen in that request, by hook, callback identity and priority, and the rejection message. It never stores submitted values, the marker or the token. The panel shows the time, form, reasons and callbacks below both sections; the stored message itself is not displayed. This matters because the submission request can load callbacks that the admin page does not, so the panel can say `ready` while a real test is still blocked.

`ready` covers only the plugins, versions and callbacks loaded for that admin page. It does not cover every form (payment, non-`form` and GF post-field forms are still rejected at submission), the marker, CAPTCHA, callbacks that only load on public pages or in later requests (such as CleanTalk's GF bindings on public pages and its generic check on GF modern AJAX requests), or mail delivery. Each marked submission is checked again when it arrives, and that check decides.

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

Install on **one site** first, verify the token/redirect and audited versions/integrations (the [compatibility panel](#compatibility-panel) shows the admin-visible part; it is not a rollout approval), then use the [checker setup and commands](../../README.md#form-checks) (`bun run forms <slug>` or `bun run check <slug>`). `form_helper: true` authorizes real submissions: it is operator attestation, **not** public proof that this plugin is installed or its token matches. Keep it false until verified; a missing/mismatched helper can process tests as ordinary client submissions.

Extend to a small group, then to all sites. Each step needs the operator's explicit go-ahead after the previous step's results are reviewed. Local tests do not authorize rollout. The checker verifies arrival independently over read-only IMAP; this helper still only hands mail to WordPress. See the [native checker and real-mail test guide](../../test/forms/README.md) for the distinction between logged Playground mail and delivered mail.

A site whose form-plugin, Pro, CleanTalk or FluentSMTP versions or integrations differ from the audited set rejects marked submissions (with the awaiting-audit message when versions alone differ). Treat it as not rollout-ready until it is re-audited, rather than working around the rejection.

## Known limitations

- **After `wp_mail`:** anything that changes recipients after `wp_mail` (for example in `phpmailer_init` or an SMTP plugin's transport), or arbitrary PHP outside the audited hooks, is out of reach. For the pinned FluentSMTP release only (hand-audited at 2.4.1), the tests check the effective PHPMailer envelope and the entry in FluentSMTP's Simulator log. They do not cover other versions, its real providers or SMTP/IMAP delivery. This also includes a callback that registers a new FF feed-type filter after the pre-dispatch move. No plugin can prove safety against all other code.
- **Late re-registration:** a suppressed callback re-registered after the guard (GF priority 998, FF priority 9) in the same dispatch, or registered on another hook later in the request, is not caught. Restored bindings go to the end of their priority; the order among callbacks at the same priority is preserved for the audited stack only.
- **Checker browser limits:** invisible/reCAPTCHA v3 client flows are unverified and may time out under the checker's frozen request policy despite this helper's server-side bypass. Specialized GF phone formats/widgets are also unverified by the checker and may reject its fixed data; basic telephone filling is not proof of support.
- **Delivery is not verified here:** the local tests log `wp_mail()` arguments, and on the full stack FluentSMTP's simulated send. They do not verify SMTP delivery or mailbox arrival.
- **GF save and continue** (`gform_save`) skips validation, so a marker in a saved draft is not detected.
- **GF prune race:** a GF worker that starts between the sweep's `is_processing()` check and its batch update can write a removed task back. GF has no compare-and-set batch API.
- **Crashed FF job:** a job left `processing` by a crashed worker delays cleanup until it has been untouched for an hour.
- **DST:** during a fall-back hour, the FF site-local one-hour comparison can be off by up to an hour.
- **Unwinding covers Action Scheduler only.** Other runners that catch exceptions and continue in the same request are not covered. FF 6.2.14's legacy and WP-Cron runners end the request on an exception; this was checked in the source but not tested.
- **Nested scopes stay marked:** an unmarked scope nested inside a marked request stays marked, so that mail is redirected, not leaked.
