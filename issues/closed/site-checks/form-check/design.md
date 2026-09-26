# Design: form-check

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

### Report and running (chart fork `report`)
2026-09-25 operator: "1 - A". Baselines and reports in Cloudflare R2 through Bun's S3Client, with a local copy only during a run; keep the last 10 reports and prune older ones. Foreclosed: local-only storage, git-committed screenshots. Running stays on the operator's machine, with baseline/check/approve commands per site or all (from the Q4-A recommendation that R2 extends; not contested).

### Repo and site list (chart fork `repo-and-sites`)
Q1, 2026-09-25 operator: "1 - B - /Work/Privatni/Pirax-Castrum-Maintenance I'll need to set up the GitHub repo later". Repo at ~/Work/Privatni/Pirax-Castrum-Maintenance (doesn't exist yet). Human-only prerequisites, owner operator: create the repo and register it with akrogon (/init-issues) before handoff; add a GitHub `origin` before any leaf reaches merge (akrogon config `remote: origin`). Foreclosed: ~/Work/Tamdoma/wp-site-checks.
Q2, 2026-09-25 operator: "2 - B I can provide a list". The operator lists each site's pages by hand in the site list; no sitemap discovery. Foreclosed: auto-discovery from sitemaps.

### Pages (chart fork `pages`)
2026-09-25 operator: "4-A". Automatic per-site sample (home, one per template/post type, every page with a form) saved to an editable file. Foreclosed: full sitemap crawl.

Correction 2026-09-25 (repo-and-sites Q2): "2 - B I can provide a list". The operator supplies each site's page list; the tool does not auto-pick pages. Binding over the 4-A auto-sample for how pages enter the list. The representative-sample principle stays as guidance for the operator.
Correction 2026-09-25 (repo-and-sites Q2): "2 - B I can provide a list". The operator supplies each site's page list; the tool does not auto-pick pages. Binding over the 4-A auto-sample for how pages enter the list. The representative-sample principle stays as guidance for the operator.

Not applicable to this leaf: `approach`, `baseline`, `viewports`, `updates-and-report`.

## Standing design
/home/rudi/.claude/skills/chart-issues/assets/standing-design.md

- Never mock auth / server-side authorization: the plugin settings page checks `manage_options` and a nonce; the checker holds no auth surface.
- Real mutations: tests use a real Playground WordPress, real R2 (under `test/`) and a real mailbox; only outgoing mail from the Playground site is logged instead of sent, because that sandbox cannot send mail.
- No hardcoded secrets: everything comes from the gitignored `.env`, and `.env.example` lists names only.
- No vanity tests; negative and edge cases are listed in the done-criteria.
- User-visible flows are verified with Playwright (headless Chromium, trace on, no video), keeping the report or trace path as the artifact.
- Operator-physical steps (creating the repo, R2 bucket, mailbox; installing the plugin on live sites) are outside the leaf.

## Leaf architecture
Owned surfaces: `src/forms/` (detect, fill, submit), `src/mail/imap.ts`, the forms wiring in `src/commands/check.ts` and the new `src/commands/forms.ts`, tests and fixtures under `test/forms/`, dev dependency for an IMAP client (e.g. `imapflow`) and SMTP sender for tests only (e.g. `nodemailer`).

Literal interfaces: consumes `FormResult`/`PageResult.forms` from visual-health-check's `src/report/model.ts`, and the marker, subject prefix and header contract from form-helper-plugin. `<id>` is 12 lowercase alphanumeric characters generated per submission.

Mailbox decision interpretation: "only messages carrying the secret token" is implemented as only messages whose subject carries the per-submission tag `[pirax-test <id>]` that the plugin adds to token-marked submissions. The raw token itself is never placed in mail headers.

Hard rules: the IMAP session is read-only and touches only the two named folders; the token is redacted (`<token>`) everywhere it could be printed or stored.

Exclusions: no CAPTCHA solving; no plugin code (owned by form-helper-plugin); no screenshot/compare changes beyond adding the forms column data.
