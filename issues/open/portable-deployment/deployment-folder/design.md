# Design: deployment-folder

## Binding decisions, verbatim
### Deployment shape Q1 (operator 2026-10-12: "1a")
Configurable upstream. One deployment config holds every operator-specific value; a second deployment is a repo copy with its own config and pulls fixes from upstream. Reason: queued fixes (updater, GF confirmation detection) reach both deployments once. Foreclosed: one-time renamed fork.

### Deployment shape Q2 (operator 2026-10-12: "2a")
Visible identity and update channel only (plugin name, author, description, folder/zip slug, Update URI, releases URL, public key, refusal-text prefix). Internal PHP identifiers (namespace, option names, hooks, mail header) stay as today in every build. Foreclosed: full internal rename.

### Deployment data Q1 (operator 2026-10-12: "1a")
One folder per deployment (deployments/<name>/: config, sites.yaml, audited pins, helper version), selected by a repository variable; each deployment's jobs write only its own folder; the build injects pins and version into the helper ZIP; Pirax's built helper must stay identical. Reason: upstream pulls merge without conflict. Foreclosed: shared files with manual conflict resolution.

### Deployment data Q2 (operator 2026-10-12: "2a")
Per-deployment audited plugin list; MD's list excludes GF; a site with an unaudited plugin keeps refusing marked submissions. Reason: a GF failure never blocks MD releases (intake). Foreclosed: everyone audits all five.
Applies here only as far as the folder holds the per-deployment pin map; making the audited list variable (GF optional) is owned by deployment-audited-stack. This leaf keeps the five-key list.

### Weekly check host Q1 (operator 2026-10-12: "1a")
Pirax keeps its local timer for now; only MD's deployment runs the weekly check in GitHub Actions. Reason: Pirax works today and avoids re-baselining 13 sites before the runner path is proven; moving later is a small switch. Foreclosed now: moving Pirax to Actions.
Excluded here: owned by weekly-actions-check.

## Standing design
/home/rudi/.claude/skills/chart-issues/assets/standing-design.md

Interpretation: the end-to-end flows are the helper build and the checker. Criterion 6 is a real `check` run against a live Pirax site; criteria 1-3 are real builds and a Playground update run, not mocked. No secret enters a deployment folder: the folder holds the public key and recipient address only. Negative tests: missing/unknown DEPLOYMENT, invalid config, wrong-key and wrong-URL updates.
## Credentials and values
- `DEPLOYMENT`: name of the deployment folder to use (`pirax` here). Local runs read it from the gitignored `.env` (operator adds `DEPLOYMENT=pirax`); workflows read the repository variable `vars.DEPLOYMENT` (operator sets `pirax` on CastrumS/pirax-castrum-maintenance before merge). Unset or unknown is a configuration error, never a default.
- Existing secrets are unchanged: `PIRAX_HELPER_SIGNING_KEY`, R2 (`S3_*`), IMAP/SMTP (`IMAP_*`, `FORM_TEST_*`), GPL Vault (`GPLVAULT_*`). Their names are internal identifiers and stay as they are.

## Leaf architecture
- Owns: new `deployments/pirax/` (config file plus `sites.yaml` moved from the root, and a pins/version file), one schema-parsed config loader in `src/` used by every consumer, `scripts/build-plugin.ts`, `scripts/plugin-source.ts`, `scripts/release-plugin.ts`, `scripts/reaudit/{bump,publish,notify,fetch,run,setup}.ts` as far as identity, pins and version, `.github/workflows/reaudit*.yml`, `src/forms/{submit,fill}.ts` refusal prefix and filler text, the plugin sources' visible identity and channel constants (replaced by build-time injection), `sites.example.yaml` location, and the tests and fixtures these changes touch.
- Build injection: the plugin source in the repo keeps placeholders or a single generated include for visible identity, channel, public key, pins and version; the ZIP gets literal values. The ZIP folder and entry file use the configured slug. The Pirax build must reproduce today's ZIP exactly (criterion 1), which also keeps installed 0.3.x helpers updating.
- Selection: `DEPLOYMENT` env locally (from `.env`), `vars.DEPLOYMENT` in workflows. No default value.
- The operator's weekly script (~/.config/pirax-maintenance/weekly-check.sh) already loads `.env`, so it needs no change once `DEPLOYMENT=pirax` is in `.env`.
- Excluded: making the audited plugin list per deployment (deployment-audited-stack), the Actions weekly check (weekly-actions-check), setup documentation beyond comments the moved code needs (deployment-setup-docs), renaming internal PHP identifiers or secret names, and anything under `issues/`.
- Operation proofs (chart fork weekly-check-host, 2026-10-12): `vars` readable in a job step (run 38257245458). GitHub release creation and signing are existing, already-proven paths (helper-auto-audit, v0.3.1 and v0.3.2).
