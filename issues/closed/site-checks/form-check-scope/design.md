# Design: form-check-scope

## Binding decisions, verbatim
### Form scope (new intake after handoff, 2026-09-25) (chart fork `form-scope`)
2026-09-25 operator: "1. Site-wide forms would be submitted once per page. -> yes, and make it so that we make 1 submission per maintenance cycle. test on one most important form" and "2. don't test the login/registration form". Each site gets exactly one designated test form, submitted at most once per check run (one maintenance cycle); no other form is filled or submitted, and login/registration forms are never tested. Implemented as a follow-up leaf `form-check-scope` blocked by form-check, because the emitted contract stays unchanged. Foreclosed: submitting every form on every page; only removing the registration page from the list.

Operator correction on builders (2026-09-25, informational): suntos, stolarijabanek, spok-ing, instrukcijezasve = Bricks; tara.garden, baterije-akumulatori = Oxygen; epamalgradnja, alu-kon, laris-tcb = Beaver Builder; no site uses Divi.

### Forms (chart fork `forms`)
2026-09-25 operator: "5-A". Real submission with a marker test email, plus a small helper plugin on each site that keeps test submissions away from clients and removes the test entry, rolled out one site, then a group, then all, with go-ahead. Foreclosed: no-submit only, letting test mail reach clients. Reshaped by 1-B: without the wp-fleet SSH/WP-CLI path, how the helper plugin reaches sites and how delivery is verified are new questions (forks/form-helper.md).

### Form helper (chart fork `forms-helper`)
2026-09-25 operator: "3 - A". A regular plugin zip uploaded via wp-admin, one site, then a group, then all. Marked test submissions (secret token) are redirected to an operator-owned mailbox through the site's real mail path, and the checker confirms arrival over IMAP. Sites without the plugin get fill-without-submit, reported as "delivery not verified". Foreclosed: silently dropping test mail (B), paid test inbox (C).

### CAPTCHA forms (chart fork `captcha`)
2026-09-25 operator: "2 - A". The helper plugin skips CAPTCHA only when the secret token is present: Gravity Forms via `gform_field_validation`; Fluent Forms only if a clean hook exists in its code, otherwise those forms are reported "delivery not verified". The token lives in .env and the plugin settings, never in code. Foreclosed: never bypassing.

### Test mailbox (chart fork `mailbox`)
Q1, 2026-09-25 operator: "I don't feel like giving access to my or my colleague's email. We'll set up a new one." A new dedicated mailbox is the only one the checker logs in to. Foreclosed: the operator's and colleague's personal Gmail accounts. Human-only prerequisite, owner operator: create the mailbox, enable IMAP (and an app password if it's Gmail), add the label/folder filter.
Q2, 2026-09-25 operator: "2 - A". Tests go to a plus-address (or alias) of that mailbox; a filter files them into one label/folder. The checker reads only that folder and only messages carrying the secret token, never deletes or moves anything, and flags messages found in Spam. Foreclosed: moving confirmed tests to Trash.

Not applicable to this leaf: `destination`, `approach`, `baseline`, `pages`, `repo-and-sites`, `form-plugins`, `report`, `viewports`, `updates-and-report` (their effects already live in the merged code this leaf builds on).

## Standing design
/home/rudi/.claude/skills/chart-issues/assets/standing-design.md

- Real mutations: tests use the real Playground WordPress with the built helper plugin; only outgoing mail from that sandbox is logged instead of sent.
- No hardcoded secrets; values come from the gitignored `.env`.
- Negative and edge cases are in the done-criteria; the user-visible flow is verified with Playwright (headless Chromium, trace on, no video) and keeps an artifact.

## Leaf architecture
Owned surfaces: `src/sites.ts` (schema: add `test_form`), `src/forms/**` (selection logic), the `FormResult` outcome union in `src/report/model.ts` plus its rendering (adds `'skipped'`), `sites.yaml` (convert comments to fields), tests under `test/forms/` and the sites tests.

Literal interface:
```yaml
test_form:
  page: /kontakt/        # must be listed in this site's pages
  plugin: gravity        # gravity | fluent
  id: 4                  # form id as rendered (gform_wrapper_4 / data-form_id="4")
```
"Once per run" means once per site per invocation of `check` or `forms`, however many listed pages contain that form.

Dependency: form-check (its detection, fill, submit and IMAP code). Exclusions: no plugin changes; no change to screenshots or health checks.
