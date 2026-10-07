# Design: reaudit-job

## Binding decisions, verbatim

### release-approval
Question: Q1. When the scheduled re-audit passes for a new plugin version, does the job publish the helper release that sites auto-install immediately, or hold it until the operator approves?

Answer: Operator 2026-10-02, verbatim: "1. automatically"
Reason: operator cannot keep doing manual steps; a failing gate never publishes. Foreclosed: per-release operator approval (1b).

### audit-depth
Question: Q1. What must pass before a new plugin version is accepted: the native test suites plus the hook-inventory comparison only, or also an automated code-diff review?

Answer: Operator 2026-10-02, verbatim: "3. automated tests and the hook comparison"
Reason: operator choice. Foreclosed: an automated LLM/code-diff review step. Residual risk accepted: behaviour changes inside an already-audited callback or outside audited hooks that the suites do not exercise.

### operator-notice
Question: Q1. How is the operator told about a failed re-audit or other job failure?

Answer: Operator 2026-10-02, verbatim: "6. Send an email to pirax castrum email"
Reason: operator choice. Foreclosed: Discord, desktop notifications. Recipient piraxcastrum@gmail.com.

### job-host
Question: Q1. Which cloud runner runs the daily re-audit?
Q2. Cloud means the job's secrets (GPL Vault license key and product ID, the helper signing key, the Gmail app password, a GitHub token to publish releases) are stored with that runner, off this machine. The standing design says every secret lives only in the repo's gitignored .env. Is that exception accepted?

Answer: Operator 2026-10-02, verbatim: "1a\n2a"
Q1: GitHub Actions scheduled workflow on CastrumS/pirax-castrum-maintenance, with a keep-alive against the 60-day inactivity disable and an email if the schedule stops. Foreclosed: rented server, Claude cloud agent.
Q2: Standing-design exception accepted for this job: GPLVAULT_LICENSE_KEY, GPLVAULT_PRODUCT_ID, the Gmail app password (IMAP_USER/IMAP_PASSWORD reused for SMTP) and the Ed25519 helper signing key are stored as GitHub repository secrets; .env stays authoritative locally. Foreclosed: local-only secrets.

### paid-source
Question: Q1. Does the job fetch Fluent Forms Pro and Gravity Forms through the GPL Vault API, activated as one site on the operator's license, and may A run the required live probe (activate, list, download, deactivate)?

Answer: Operator 2026-10-02, verbatim: "1s" then "1a"
Q1: fetch Fluent Forms Pro and Gravity Forms through GPL Vault by running GPL Vault's official updater plugin inside the job's throwaway WordPress, activated per run and deactivated at the end of every run (also on failure). How the job obtains the updater ZIP itself is a separate fork: [updater-source](updater-source.md). Probe permission granted and executed. Foreclosed: vendor licenses; reimplementing the GPL Vault REST protocol.

### updater-source
Question: Q1. The cloud job needs GPL Vault's official updater plugin ZIP (495 KB, version 5.3.9, GPL-licensed, downloaded by the operator from the GPL Vault account). Where does the job get it?

Answer: Operator 2026-10-02, verbatim: "1a"
The official updater ZIP is committed GPG-encrypted (symmetric) in the repository; its passphrase is a GitHub repository secret; each run decrypts it, activates it, and lets it update itself to GPL Vault's current client before fetching packages. Foreclosed: plain ZIP in the public repo; R2 storage.

### ff-6215
Question: Q1. Is free Fluent Forms 6.2.15 audited by the new job's first run, or as its own leaf now?

Answer: Operator 2026-10-02, verbatim: "1a"
Free Fluent Forms 6.2.15 is audited by the new job's first run, with no separate leaf; spok-ing stays blocked until then. Foreclosed: a manual/separate audit leaf.

### update-channel
Question: Q1. How does the helper update itself on client sites, and how does a site know the package is genuine?

Answer: Operator 2026-10-02, verbatim: "4. whichever you think works better"
Agent choice under that delegation: GitHub Releases on the public repo carry the helper ZIP plus a manifest (version, audited plugin versions, ZIP sha256) signed with an Ed25519 key; the helper embeds the public key, offers an update to WordPress only from a manifest whose signature verifies, and refuses a downloaded package whose hash differs. The private signing key lives only with the publishing job. Foreclosed: R2 hosting; unsigned update feed.

Excluded here (owned by another leaf): blocked-reporting (helper-self-update and checker-awaiting-audit)

/home/rudi/.claude/skills/chart-issues/assets/standing-design.md
Interpretation for this leaf: no auth is mocked — the real job runs once against real GPL Vault, wordpress.org, GitHub and Gmail; decision logic gets fixture tests with mandatory negative cases (no change, download failure, GPL Vault refusal, suite failure, tag exists); the job-host exception moves the listed secrets into GitHub repository secrets while `.env` stays authoritative locally; the end-to-end artifact is the workflow run log plus the published release or failure email.

## Leaf architecture
- Owned: `.github/workflows/reaudit.yml`, `.github/audit/gplvault-updater.zip.gpg`, `scripts/reaudit/*.ts` (detect, fetch, bump, decide, notify), the single pin source and the test refactor to use it, `test/plugin/harness.ts` pin constants, README section.
- Versions: free plugins via `GET https://api.wordpress.org/plugins/info/1.0/<slug>.json` (`version`, `download_link`; proven 2026-10-02). Paid via Playground (@wp-playground/cli runCLI, WP 7.1.2, PHP 8.3, `features.networking: true`) with only the decrypted official updater installed: `gv_api_manager()->set_api_key()->set_product_id()->activate()`, `gv_settings_manager()->save_api_settings()` + `enable_activation_status()`, let the updater update itself first (WordPress plugin update of `gplvault-updater`), then `schema()` with filter `gplvault_schema_payload` listing `fluentformpro/fluentformpro.php` and `gravityforms/gravityforms.php` at the pinned versions → item ids and latest versions; `download(['product_id'=>item])` → package URL; check each ZIP's Version header; `deactivate()` in a finally block. Proven 2026-10-02 from this PC and from a GitHub-hosted runner (chart fork job-host / paid-source, Operation proofs).
- Decrypt: `gpg --batch --pinentry-mode loopback --passphrase-fd 3 -d` with `GPLVAULT_UPDATER_PASSPHRASE` (proven on a runner). The implementer generates the passphrase, encrypts `~/Downloads/gplvault-updater.zip` (operator's file, version 5.3.9) and sets the secret.
- Audit gate (audit-depth): set `GRAVITY_FORMS_ZIP`/`FLUENT_FORMS_PRO_ZIP` to the downloaded files, a per-run random `FORM_TEST_TOKEN`, bump pins in the working tree, run `bun test test/plugin` (Node 24, Bun 1.4.2, Playwright Chromium, ~30 min). The suites' full-stack panel/unaudited-callback assertions are the hook comparison. Pass → bump helper patch version, commit pins to main with `GITHUB_TOKEN` (`permissions: contents: write`; push proven on a runner; main is unprotected), run `scripts/release-plugin.ts` (from helper-self-update) with `PIRAX_HELPER_SIGNING_KEY`.
- Notice: SMTP `smtps://smtp.gmail.com:465` with `IMAP_USER`/`IMAP_PASSWORD` to piraxcastrum@gmail.com (proven 2026-10-02 from this PC); subject `[pirax-audit] …`, body names versions and the failing step, no secrets.
- Keep-alive: if the last commit on main is older than 30 days, commit a heartbeat file. Limits recorded at the chart: the scheduled trigger itself and keep-alive were not exercised before handoff.
- Prerequisite: helper-self-update (release script, signing key secret, update manifest format).
- Excluded: helper update client and message (helper-self-update); checker reporting (checker-awaiting-audit). One-time manual install of helper 0.3.x on each site is an operator step after the first release, not this leaf.
