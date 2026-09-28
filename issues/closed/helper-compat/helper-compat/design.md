# Design: helper-compat

## Binding decisions, verbatim
### Forms helper (chart fork `forms-helper`, 2026-09-25)
Operator "3 - A": a regular plugin zip uploaded via wp-admin, one site, then a group, then all. Marked test submissions (secret token) are redirected to an operator-owned mailbox through the site's real mail path; the checker confirms arrival over IMAP.

### Version strictness (2026-09-28, this session)
Operator asked whether form tests stop working after form-plugin updates; Claude explained exact-version pinning fails safe (blocked, reported) and recommended keeping it; operator proceeded without asking to relax it. Keep exact-version pinning for every audited plugin, including the new ones.

### Rollout finding (2026-09-28)
First live marked submission on stolarijabanek.com was rejected ("integrations could not be suppressed"). Operator supplied the site's active plugin list: 301 Redirects Pro 6.19, ACF Pro 6.8.10, All-in-One WP Migration 7.111, Anti-Spam by CleanTalk 6.88, Automatic.css 4.0.1, Bricksforge 4.0.0, Fluent Forms 6.2.14, Fluent Forms Pro Add On Pack 6.2.14, FluentSMTP 2.4.0, GutenBricks 1.1.31, LiteSpeed Cache 7.9.1, Migrate Guru 6.72, Perfmatters 2.6.7, Pirax Form Test 0.1.0, The SEO Framework 5.1.4, Wordfence 9.0.1, WP Umbrella 2.27.3. The operator downloaded the licensed Fluent Forms Pro 6.2.14 ZIP for this work (`FLUENT_FORMS_PRO_ZIP`).

## Standing design
- Fail closed: anything not positively audited keeps rejecting marked submissions. Ordinary submissions are never changed.
- Real mutations in tests: real Playground WordPress with the real plugins; outgoing mail and third-party HTTP are intercepted and logged, never sent.
- No secrets in code, logs, command lines or the settings panel.

## Leaf architecture
Owned surfaces: `plugin/pirax-form-test/**` (compatibility, adapters, settings panel, README, version), `test/plugin/**` (harness: optional extra plugin ZIPs, HTTP interception), `.env.example` (add `FLUENT_FORMS_PRO_ZIP` name only — operator must create it; seats cannot write `.env*`, so if needed report it and continue), `README.md` plugin section.
Exclusions: no change to the checker (`src/**`) or `sites.yaml`; no relaxation of version pinning.
