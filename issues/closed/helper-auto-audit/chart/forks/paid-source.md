# Paid source

## Question
Q1. Does the job fetch Fluent Forms Pro and Gravity Forms through the GPL Vault API, activated as one site on the operator's license, and may A run the required live probe (activate, list, download, deactivate)?

### Carries
- INTAKE agent findings on the GPL Vault protocol.

## Findings
- Probe 1 (2026-10-02, this PC, Bun fetch with honest UA `pirax-audit/0.1`, identity GPLVAULT_LICENSE_KEY + GPLVAULT_PRODUCT_ID from .env): `?wc-api=wc-am-api&wc_am_action=activate|status|deactivate` → HTTP 200 each (activate: 138/150 remaining; deactivate restored 139/150). `POST wp-json/gvsam/v2/schema/` → HTTP 401 `gv_api_client_not_supported` (errorCode 7106): the REST API serves only the official GPLVault Update Manager client 4.2.0+. Changed: the job must run GPL Vault's own plugin, not reimplement the protocol (no client impersonation).
- Probe 2 (2026-10-02, this PC): throwaway WordPress Playground (@wp-playground/cli runCLI, WP 7.1.2, PHP 8.3, blueprint `features.networking: true`) with GPL Vault's official `gplvault-updater` 5.3.9 (operator's ZIP, ~/Downloads/gplvault-updater.zip), Fluent Forms 6.2.14, Fluent Forms Pro 6.2.14 and Gravity Forms 3.1.2 installed. Via the plugin's own API objects: `gv_api_manager()->set_api_key()->set_product_id()->status()/activate()`, `gv_settings_manager()->save_api_settings()`, `gv_api_manager()->set_initials()->schema()` → plugins map with GPL Vault item ids and latest versions: fluentformpro 6.2.15 (item 1111130), gravityforms 3.1.2 (item 29365). `->download(['product_id'=>item])` → package URL on gplvault.s3.us-west-2.amazonaws.com; fetched HTTP 200: fluentformpro 3,603,832 bytes, Version header 6.2.15; gravityforms 5,358,820 bytes, Version 3.1.2. Cleanup: `->deactivate()` → deactivated, 139/150 remaining (state before the probe). Script: .cache/gv-probe.mts (gitignored scratch).
- Limits: run from this PC's IP, not a GitHub-hosted runner (GPL Vault's plugin text warns its firewall may block server IPs); package integrity beyond the Version header and ZIP readability is not verified; a lifetime subscription with 150 activations, 11 used.
- Consequence: Gravity Forms is also available through GPL Vault, so the expired Gravity Forms license is not needed for the job.

## Taken
Operator 2026-10-02, verbatim: "1s" then "1a"
Q1: fetch Fluent Forms Pro and Gravity Forms through GPL Vault by running GPL Vault's official updater plugin inside the job's throwaway WordPress, activated per run and deactivated at the end of every run (also on failure). How the job obtains the updater ZIP itself is a separate fork: [updater-source](updater-source.md). Probe permission granted and executed. Foreclosed: vendor licenses; reimplementing the GPL Vault REST protocol.

