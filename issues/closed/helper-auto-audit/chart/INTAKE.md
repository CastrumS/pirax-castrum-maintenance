# Intake: helper-auto-audit

## Scope
Keep plugin auto-updates on across client sites while form tests keep working: the Pirax Form Test helper updates itself through WordPress, and a scheduled job re-audits new releases of the pinned form-stack plugins (Fluent Forms, Fluent Forms Pro, Anti-Spam by CleanTalk, FluentSMTP, Gravity Forms), fetching paid packages through GPL Vault, and releases a helper that accepts versions that pass. One destination: Pirax-Castrum-Maintenance.

## Provenance
- Operator: chat messages, 2026-10-02 (this session)

## Source: operator 2026-10-02 (reply to "stop auto-updates")
I dont get the point of stopping the updates - the point of maintenance is to keep everything up to date so plugins will get updated regularly. I have access to GPL Vault website where all of these can be downloadded from. Find a workaround. I can't manually keep uploading the helpers or plugin files.

## Source: operator 2026-10-02 (GPL Vault access)
there is no GPL Vault API key. there's only the license key. there's also the GPL Vault Subscription - Lifetime plugin offered.

## Source: operator 2026-10-02 (credentials placed)
I downloadef the plugin and sacved the license in the .env

## Source: operator 2026-10-02 (door invocation)
helper auto-update + daily plugin re-audit (see notes in this conversation)

## Agent findings
- Helper pins exact versions in `plugin/pirax-form-test/includes/compatibility.php` (`AUDITED_VERSIONS`); any other version blocks marked submissions ("integrations could not be suppressed"). Since 2026-09-30 four manual re-audits were needed (FluentSMTP 2.4.1, FF Pro 6.2.15, FF form type, redirect confirmations), each needing a manual helper upload per site.
- Manual audit method so far: diff old/new release, list hook registrations on audited hooks, read changed submission/mail paths, then `bun --env-file=.env test test/plugin` (~28 min, 69 tests) against the new version via pins in `test/plugin/harness.ts`.
- Free FF 6.2.15 (2026-09-30) changes SubmissionService, FF's own CleanTalkHandler, hooks files and adds an AgentReady module: not audited; spok-ing already runs it, so its form test is blocked now.
- GPL Vault updater (`~/Downloads/gplvault-updater.zip`, inspected 2026-10-02): WooCommerce API Manager protocol at https://www.gplvault.com/ — `wc-api=wc-am-api` activate/status with `api_key`, `product_id`, `instance`, `object`=domain; then `wp-json/gvsam/v2/schema` (POST installed plugins+versions), `download` (returns `package` URL), `resource/<id>`. Needs license key and product ID; activation registers one "site". `GPLVAULT_LICENSE_KEY` and `GPLVAULT_PRODUCT_ID` are set in `.env` (values not read).
- GitHub repo CastrumS/pirax-castrum-maintenance is PUBLIC (gh, 2026-10-02): a release asset is fetchable by WordPress without credentials.
- `DISCORD_WEBHOOK_URL` absent from `.env`.
- Background runs on this PC have been killed by a memory reaper; ~28-min suites ran fine as background tasks on 2026-09-30/10-01.
