# Design: form-helper-plugin

## Binding decisions, verbatim
### Destination (chart fork `destination`)
2026-09-25 operator: "1-B". A separate checks repo with its own site list, not the wp-fleet repo. Reason: operator choice. Foreclosed: reusing wp-fleet sites.yaml/SSH/WP-CLI; the Tamdoma framework as home.

### Forms (chart fork `forms`)
2026-09-25 operator: "5-A". Real submission with a marker test email, plus a small helper plugin on each site that keeps test submissions away from clients and removes the test entry, rolled out one site, then a group, then all, with go-ahead. Foreclosed: no-submit only, letting test mail reach clients. Reshaped by 1-B: without the wp-fleet SSH/WP-CLI path, how the helper plugin reaches sites and how delivery is verified are new questions (forks/form-helper.md).

### Form helper (chart fork `forms-helper`)
2026-09-25 operator: "3 - A". A regular plugin zip uploaded via wp-admin, one site, then a group, then all. Marked test submissions (secret token) are redirected to an operator-owned mailbox through the site's real mail path, and the checker confirms arrival over IMAP. Sites without the plugin get fill-without-submit, reported as "delivery not verified". Foreclosed: silently dropping test mail (B), paid test inbox (C).

### CAPTCHA forms (chart fork `captcha`)
2026-09-25 operator: "2 - A". The helper plugin skips CAPTCHA only when the secret token is present: Gravity Forms via `gform_field_validation`; Fluent Forms only if a clean hook exists in its code, otherwise those forms are reported "delivery not verified". The token lives in .env and the plugin settings, never in code. Foreclosed: never bypassing.

### Form plugins in use (chart fork `form-plugins`)
2026-09-25 operator: "Fluent Forms and Gravity Forms, some have recaptcha, there could be more anti spam I'm not aware of, probably honeypot". The checker and helper support Fluent Forms and Gravity Forms. Any other form or unexplained rejection is reported as "unsupported/rejected" rather than guessed at.

### Test mailbox (chart fork `mailbox`)
Q1, 2026-09-25 operator: "I don't feel like giving access to my or my colleague's email. We'll set up a new one." A new dedicated mailbox is the only one the checker logs in to. Foreclosed: the operator's and colleague's personal Gmail accounts. Human-only prerequisite, owner operator: create the mailbox, enable IMAP (and an app password if it's Gmail), add the label/folder filter.
Q2, 2026-09-25 operator: "2 - A". Tests go to a plus-address (or alias) of that mailbox; a filter files them into one label/folder. The checker reads only that folder and only messages carrying the secret token, never deletes or moves anything, and flags messages found in Spam. Foreclosed: moving confirmed tests to Trash.

Not applicable to this leaf: `approach`, `baseline`, `pages`, `repo-and-sites`, `report`, `viewports`, `updates-and-report`.

## Standing design
/home/rudi/.claude/skills/chart-issues/assets/standing-design.md

- Never mock auth / server-side authorization: the plugin settings page checks `manage_options` and a nonce; the checker holds no auth surface.
- Real mutations: tests use a real Playground WordPress, real R2 (under `test/`) and a real mailbox; only outgoing mail from the Playground site is logged instead of sent, because that sandbox cannot send mail.
- No hardcoded secrets: everything comes from the gitignored `.env`, and `.env.example` lists names only.
- No vanity tests; negative and edge cases are listed in the done-criteria.
- User-visible flows are verified with Playwright (headless Chromium, trace on, no video), keeping the report or trace path as the artifact.
- Operator-physical steps (creating the repo, R2 bucket, mailbox; installing the plugin on live sites) are outside the leaf.

## Leaf architecture
Owned surfaces: `plugin/pirax-form-test/**` (PHP), `scripts/build-plugin.ts`, `test/plugin/**` (Playground blueprint, test mu-plugin, Playwright specs), `package.json` scripts and dev dependencies for these (`@wp-playground/cli`, and `playwright` if absent).

Literal interfaces (shared with form-check):
- The submitted marker is `<FORM_TEST_TOKEN>-<id>`, with `<id>` matching `[a-z0-9]{6,32}`.
- Outgoing test mail: subject prefix `[pirax-test <id>] `, header `X-Pirax-Form-Test: <id>`, sole recipient the configured redirect address.
- Rejection message when integrations can't be suppressed: `Pirax test blocked: integrations could not be suppressed`.
- Options: `pirax_form_test_token`, `pirax_form_test_redirect` (autoload off). Uninstall removes both.

Exclusions: no other form plugins; no change to Wordfence or any security plugin; no REST endpoint; the plugin never sends mail on its own; installing on live sites is an operator step after merge (one site, then a group, then all).
