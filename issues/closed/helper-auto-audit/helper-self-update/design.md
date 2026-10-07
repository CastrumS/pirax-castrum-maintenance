# Design: helper-self-update

## Binding decisions, verbatim

### update-channel
Question: Q1. How does the helper update itself on client sites, and how does a site know the package is genuine?

Answer: Operator 2026-10-02, verbatim: "4. whichever you think works better"
Agent choice under that delegation: GitHub Releases on the public repo carry the helper ZIP plus a manifest (version, audited plugin versions, ZIP sha256) signed with an Ed25519 key; the helper embeds the public key, offers an update to WordPress only from a manifest whose signature verifies, and refuses a downloaded package whose hash differs. The private signing key lives only with the publishing job. Foreclosed: R2 hosting; unsigned update feed.

### release-approval
Question: Q1. When the scheduled re-audit passes for a new plugin version, does the job publish the helper release that sites auto-install immediately, or hold it until the operator approves?

Answer: Operator 2026-10-02, verbatim: "1. automatically"
Reason: operator cannot keep doing manual steps; a failing gate never publishes. Foreclosed: per-release operator approval (1b).

### blocked-reporting
Question: Q1. When a site runs a plugin version the helper does not accept yet, what does the check report and exit with?

Answer: Operator 2026-10-02, verbatim: "1a"
The helper reports a version-only block with its own message naming the not-yet-accepted plugin and version (e.g. "Pirax test blocked: awaiting audit of Fluent Forms 6.2.16"); every other block keeps "integrations could not be suppressed". The checker maps the version-only message to a new warning outcome `awaiting-audit` (exit 0) and escalates it to `failed` once the same site has been awaiting audit for more than 3 days. Foreclosed: reporting every block as a failure.

### job-host
Question: Q1. Which cloud runner runs the daily re-audit?
Q2. Cloud means the job's secrets (GPL Vault license key and product ID, the helper signing key, the Gmail app password, a GitHub token to publish releases) are stored with that runner, off this machine. The standing design says every secret lives only in the repo's gitignored .env. Is that exception accepted?

Answer: Operator 2026-10-02, verbatim: "1a\n2a"
Q1: GitHub Actions scheduled workflow on CastrumS/pirax-castrum-maintenance, with a keep-alive against the 60-day inactivity disable and an email if the schedule stops. Foreclosed: rented server, Claude cloud agent.
Q2: Standing-design exception accepted for this job: GPLVAULT_LICENSE_KEY, GPLVAULT_PRODUCT_ID, the Gmail app password (IMAP_USER/IMAP_PASSWORD reused for SMTP) and the Ed25519 helper signing key are stored as GitHub repository secrets; .env stays authoritative locally. Foreclosed: local-only secrets.

Excluded here (owned by another leaf): audit-depth (reaudit-job); operator-notice (reaudit-job); paid-source (reaudit-job); updater-source (reaudit-job); ff-6215 (reaudit-job)

/home/rudi/.claude/skills/chart-issues/assets/standing-design.md
Interpretation for this leaf: no auth is mocked — the update path is exercised by real WordPress update requests against a real local HTTP fixture server; negative cases (unsigned, wrong key, stale version, hash mismatch, version-only vs callback blocks) are mandatory; the signing key is never hardcoded: the private key lives only in the GitHub repository secret `PIRAX_HELPER_SIGNING_KEY` (job-host exception) and, for the dry run, a generated test key; the end-to-end artifact is the Playground evidence/trace of the update flow.

## Leaf architecture
- Owned: `plugin/pirax-form-test/` (new `includes/updates.php`, wiring in `pirax-form-test.php`, message change in `includes/marker.php`/adapters/`compatibility.php`, header 0.3.0, README), `scripts/build-plugin.ts` allowlist, new `scripts/release-plugin.ts`, tests under `test/plugin/`.
- Update client: hooks `pre_set_site_transient_update_plugins` and `plugins_api`; fetches `https://github.com/CastrumS/pirax-castrum-maintenance/releases/latest/download/pirax-form-test-manifest.json` and `.sig` (full releases only: probe showed `releases/latest` ignores prereleases), with a base-URL constant overridable only for tests. Manifest JSON: `{"version","package","sha256","audited":{...AUDITED_VERSIONS}}`, `package` must be an https URL under that repository's releases. Signature: Ed25519 detached over the exact manifest bytes, verified with `sodium_crypto_sign_verify_detached` (WordPress bundles sodium_compat); public key constant in the plugin. `upgrader_pre_download` for this plugin downloads the package, checks SHA-256 against the verified manifest and returns a WP_Error on mismatch. `auto_update_plugin` returns true for this plugin only. Network failures fail quietly (no update offered).
- Version-only classification: a block is `awaiting audit` when every compatibility reason is a version mismatch of an optional/core plugin and every unaudited callback belongs to a plugin whose version mismatched (callback source path under that plugin's directory). Message: `Pirax test blocked: awaiting audit of <Plugin label> <version>[, <Plugin label> <version>...]`; other blocks keep `Pirax test blocked: integrations could not be suppressed`. Last-block record (0.2.3) keeps working.
- Release script: builds via `build:plugin`, writes manifest + `.sig` (key from `PIRAX_HELPER_SIGNING_KEY`, base64 32-byte Ed25519 seed), `gh release create v<version> --latest` with the three assets; `--dry-run` skips GitHub. Proven 2026-10-02: `gh release create/delete` and public asset download HTTP 200 (chart fork job-host, Operation proofs).
- Key: generate once (e.g. `bun` WebCrypto Ed25519 or libsodium), commit public key, `gh secret set PIRAX_HELPER_SIGNING_KEY` (proven 2026-10-02 with a throwaway secret). Recovery if lost: new key pair and one manual helper upload per site; document it.
- Excluded: the scheduled job, version detection and auto-publishing (reaudit-job); checker reporting (checker-awaiting-audit). This leaf does not publish a real release; the first real release is made by reaudit-job.
