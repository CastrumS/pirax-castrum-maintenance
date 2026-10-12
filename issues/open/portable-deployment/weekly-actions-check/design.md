# Design: weekly-actions-check

## Binding decisions, verbatim
### Deployment shape Q1 (operator 2026-10-12: "1a")
Configurable upstream. One deployment config holds every operator-specific value; a second deployment is a repo copy with its own config and pulls fixes from upstream. Reason: queued fixes (updater, GF confirmation detection) reach both deployments once. Foreclosed: one-time renamed fork.

### Deployment shape Q2 (operator 2026-10-12: "2a")
Visible identity and update channel only (plugin name, author, description, folder/zip slug, Update URI, releases URL, public key, refusal-text prefix). Internal PHP identifiers (namespace, option names, hooks, mail header) stay as today in every build. Foreclosed: full internal rename.
Excluded here: helper identity is owned by deployment-folder.

### Deployment data Q1 (operator 2026-10-12: "1a")
One folder per deployment (deployments/<name>/: config, sites.yaml, audited pins, helper version), selected by a repository variable; each deployment's jobs write only its own folder; the build injects pins and version into the helper ZIP; Pirax's built helper must stay identical. Reason: upstream pulls merge without conflict. Foreclosed: shared files with manual conflict resolution.

### Deployment data Q2 (operator 2026-10-12: "2a")
Per-deployment audited plugin list; MD's list excludes GF; a site with an unaudited plugin keeps refusing marked submissions. Reason: a GF failure never blocks MD releases (intake). Foreclosed: everyone audits all five.
Excluded here: owned by deployment-audited-stack.

### Weekly check host Q1 (operator 2026-10-12: "1a")
Pirax keeps its local timer for now; only MD's deployment runs the weekly check in GitHub Actions. Reason: Pirax works today and avoids re-baselining 13 sites before the runner path is proven; moving later is a small switch. Foreclosed now: moving Pirax to Actions.

## Standing design
/home/rudi/.claude/skills/chart-issues/assets/standing-design.md

Interpretation: the flow is the scheduled check plus its email. Criteria 4-5 are a real SMTP send and a real Actions run, not mocks. Negative tests: disabled flag skips, send failure fails the job, malformed check result sends a fixed fallback and fails. Secrets stay in repository secrets for Actions and in .env locally.
## Credentials and values
- `DEPLOYMENT`: name of the deployment folder to use (`pirax` here). Local runs read it from the gitignored `.env` (operator adds `DEPLOYMENT=pirax`); workflows read the repository variable `vars.DEPLOYMENT` (operator sets `pirax` on CastrumS/pirax-castrum-maintenance before merge). Unset or unknown is a configuration error, never a default.
- Existing secrets are unchanged: `PIRAX_HELPER_SIGNING_KEY`, R2 (`S3_*`), IMAP/SMTP (`IMAP_*`, `FORM_TEST_*`), GPL Vault (`GPLVAULT_*`). Their names are internal identifiers and stay as they are.
- Weekly job secrets (names only): the R2 values (`S3_*`) and the mail values (`IMAP_USER`, `IMAP_PASSWORD`, `IMAP_HOST`, `IMAP_*` folders, `FORM_TEST_*`) the checker already reads. For criterion 5 the implementer adds these from `.env` as repository secrets with `gh secret set` and deletes them after the run.

## Leaf architecture
- Blocked by deployment-folder (config loader, `vars.DEPLOYMENT` selection, recipient in config).
- Owns: new `.github/workflows/weekly-check.yml`, a weekly flag and schedule fields in the deployment config schema, an email summary script under `scripts/` that reuses `scripts/reaudit/notify.ts`'s SMTP transport (shared helper, no duplicate transport), and its tests.
- Scheduling: cron in UTC; Saturday morning Europe/Zagreb. GitHub may start schedules late (observed about 7 hours on reaudit.yml), so the summary states the actual run time.
- Visual baselines for a deployment checked in Actions are approved from Actions runs; the operator PC's baselines are not used there.
- Excluded: moving Pirax's weekly check (operator decision), the operator's systemd timer, docs (deployment-setup-docs), anything under `issues/`.
- Operation proofs (chart fork weekly-check-host, 2026-10-12): runner reach to all 13 Pirax home pages and `vars` reading (run 38257245458); R2 store self-test PASS; SMTP send proven by the reaudit notice self-test. Limits: MD's sites and MD's Workspace account are not proven (step 2).
