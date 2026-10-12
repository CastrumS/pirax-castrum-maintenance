# Design: deployment-setup-docs

## Binding decisions, verbatim
### Deployment shape Q1 (operator 2026-10-12: "1a")
Configurable upstream. One deployment config holds every operator-specific value; a second deployment is a repo copy with its own config and pulls fixes from upstream. Reason: queued fixes (updater, GF confirmation detection) reach both deployments once. Foreclosed: one-time renamed fork.

### Deployment shape Q2 (operator 2026-10-12: "2a")
Visible identity and update channel only (plugin name, author, description, folder/zip slug, Update URI, releases URL, public key, refusal-text prefix). Internal PHP identifiers (namespace, option names, hooks, mail header) stay as today in every build. Foreclosed: full internal rename.

### Deployment data Q1 (operator 2026-10-12: "1a")
One folder per deployment (deployments/<name>/: config, sites.yaml, audited pins, helper version), selected by a repository variable; each deployment's jobs write only its own folder; the build injects pins and version into the helper ZIP; Pirax's built helper must stay identical. Reason: upstream pulls merge without conflict. Foreclosed: shared files with manual conflict resolution.

### Deployment data Q2 (operator 2026-10-12: "2a")
Per-deployment audited plugin list; MD's list excludes GF; a site with an unaudited plugin keeps refusing marked submissions. Reason: a GF failure never blocks MD releases (intake). Foreclosed: everyone audits all five.

### Weekly check host Q1 (operator 2026-10-12: "1a")
Pirax keeps its local timer for now; only MD's deployment runs the weekly check in GitHub Actions. Reason: Pirax works today and avoids re-baselining 13 sites before the runner path is proven; moving later is a small switch. Foreclosed now: moving Pirax to Actions.

## Standing design
/home/rudi/.claude/skills/chart-issues/assets/standing-design.md

Interpretation: the flow is following the guide. Criterion 3 runs the guide's commands for real on a scratch copy. No secret values appear in the guide, only names and where to obtain them.
## Credentials and values
- `DEPLOYMENT`: name of the deployment folder to use (`pirax` here). Local runs read it from the gitignored `.env` (operator adds `DEPLOYMENT=pirax`); workflows read the repository variable `vars.DEPLOYMENT` (operator sets `pirax` on CastrumS/pirax-castrum-maintenance before merge). Unset or unknown is a configuration error, never a default.
- Existing secrets are unchanged: `PIRAX_HELPER_SIGNING_KEY`, R2 (`S3_*`), IMAP/SMTP (`IMAP_*`, `FORM_TEST_*`), GPL Vault (`GPLVAULT_*`). Their names are internal identifiers and stay as they are.

## Leaf architecture
- Blocked by deployment-audited-stack and weekly-actions-check (and through them deployment-folder); documents their merged behavior only.
- Owns: README sections on deployments and setup, `sites.example.yaml` comments, and the doc-names test.
- Excluded: code changes beyond that test, anything under `issues/`.
- No new external operation.
