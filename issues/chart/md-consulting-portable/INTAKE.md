# Intake: md-consulting-portable

## Scope
Make this setup reusable so MD Consulting NY can run its own independent copy (own repo, key, releases, reports, mailbox). Step 1 only: code and docs in this repo. Step 2 (creating their repo, secrets, helper installs) is operator work after step 1 merges.

## Provenance
- Operator: ~/.config/pirax-maintenance/intake-portable-setup.md (2026-10-08), chart requested 2026-10-12

## Source: operator intake-portable-setup.md
# Intake: make the maintenance setup reusable for a second, independent operator

Operator note, 2026-10-08.

## Why

A second company, **MD Consulting NY**, maintains its own WordPress sites and wants this same setup — checker, form-test helper with signed self-updates, daily re-audit — run by **their own team** in **their own GitHub organisation and Cloudflare account**, fully separate from Pirax Castrum (own reports, own test mailbox, own token, own signing key, own releases). The operator updates their plugins every Friday, as for Pirax.

Today the repository is hard-wired to Pirax in ~30 files, for example:
- `plugin/pirax-form-test/includes/updates.php`: `UPDATE_RELEASES_ROOT` (`https://github.com/CastrumS/pirax-castrum-maintenance/releases`) and the embedded `UPDATE_PUBLIC_KEY`;
- the plugin name/slug/text ("Pirax Form Test", `pirax-form-test`, ~81 mentions in plugin PHP) and the `Pirax test blocked: …` refusal texts the checker matches;
- `scripts/reaudit/*` and `.github/workflows/reaudit*.yml`: failure-notice recipient (piraxcastrum@gmail.com), repository identity, release naming;
- `scripts/release-plugin.ts`, tests and fixtures.

## Wanted

1. **One configuration source per deployment** for everything operator-specific: product/plugin display name and slug, release repository, signing public key, failure-notice recipient, refusal-text prefix, report/bucket naming. A second deployment is created by copying the repository and changing configuration only — no code edits. Pirax's existing deployment, installed helpers (0.3.1, slug `pirax-form-test`) and its update channel must keep working unchanged.
2. **Configurable audited stack.** A deployment chooses which vendor plugins it audits and pins. MD Consulting NY uses Fluent Forms + Fluent Forms Pro + CleanTalk + FluentSMTP (Elastic Email transport); it does not need Gravity Forms. The daily re-audit and test suites must not require GF when a deployment excludes it.
3. **Weekly check in GitHub Actions** (scheduled, e.g. Saturday morning Europe/Zagreb, plus manual dispatch) running `check all` with results **emailed** to the deployment's recipient, as an alternative to a local timer. Their team runs it, so no personal computer should have to be on. Private report storage and form-test mailbox credentials come from repository secrets; the same privacy guarantees as today (no secrets in logs/artifacts).
4. Documentation: how to create a new deployment (new repo, new signing key, secrets, bucket, mailbox, first helper upload, one-site-at-a-time opt-in).

## Known constraints

- Fluent Forms Pro packages for MD Consulting NY's audit come from the same GPL Vault source as Pirax.
- Elementor forms on a few of their sites are out of scope (visual/health checks only).
- Lesson from 2026-10-07: opting sites in before the helper token is configured sent marked tests to clients as ordinary enquiries; setup docs must make "configure token, check Compatibility ready, opt in one site, confirm delivery" the only path.

## Agent findings
- Pirax is named in ~45 tracked non-issue files. Product code: plugin PHP (Plugin Name, namespace Pirax\FormTest, option names pirax_form_test_*, Update URI, UPDATE_RELEASES_ROOT and public key in includes/updates.php:20-25), scripts/build-plugin.ts, scripts/release-plugin.ts, scripts/reaudit/{publish,bump,fetch,notify,setup}.ts, .github/workflows/reaudit*.yml (repository guard CastrumS/pirax-castrum-maintenance on 4 jobs), src/forms/submit.ts (refusal text).
- Failure notice is Gmail-only: scripts/reaudit/notify.ts:22-23 hard-codes RECIPIENT and REPO and sends over Gmail implicit TLS with IMAP_USER/IMAP_PASSWORD.
- Audited stack is a fixed 5-key map: notify.ts:27 PIN_KEYS gf, ff, ff_pro, cleantalk, fluent_smtp. GF appears in 15 product files (plugin, reaudit, src/forms, src/report, src/sites.ts).
- The weekly check today is a local systemd timer (~/.config/systemd/user/pirax-weekly-check.timer).
