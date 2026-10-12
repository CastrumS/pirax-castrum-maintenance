# Weekly check host

## Question
Q1. MD's weekly check runs in GitHub Actions (intake). Does Pirax's weekly check move there too, or keep the local systemd timer?

### Carries
- deployment-shape (taken 2026-10-12): configurable upstream, visible identity only.
- deployment-data (taken 2026-10-12): per-deployment folder selected by a repository variable; per-deployment audited list.
- Intake: weekly check in GitHub Actions, scheduled plus manual dispatch, results emailed; no secrets in logs or artifacts; their team runs it so no personal computer has to be on.

## Findings
- Mail transport (former open fork, dissolved by evidence): mdconsultingny.com MX is Google (aspmx.l.google.com, DNS-over-HTTPS query 2026-10-12), SPF includes Elastic Email for site mail. IMAP host/port/user/password are already env values (src/mail/config.ts:23-31). The failure notice sends over Gmail SMTP (scripts/reaudit/notify.ts) which also serves Workspace; only RECIPIENT and REPO (notify.ts:22-23) are hard-coded and move to deployment config. Step-2 prerequisite: a Workspace account with 2-Step Verification and an app password allowed by their admin.
- Report delivery: check already uploads the report to R2 and returns a 7-day presigned link (src/report/writer.ts:43, src/store.ts:34). Latest local run folder is 413 MB, so the email carries the link and summary, never the report.
- Pitfall: visual baselines are pixel-compared (src/compare.ts). Baselines captured on the operator's PC differ in fonts and rendering from an Ubuntu runner, so moving Pirax means one full re-baseline on the runner.
- Pitfall: GitHub-hosted runners use datacenter IPs; sites behind Cloudflare bot protection or a WAF may serve challenge pages to them. Unproven either way until a probe runs from a runner.
- Today's Pirax path: ~/.config/pirax-maintenance/weekly-check.sh plus pirax-weekly-check.timer, Saturday 09:00 Europe/Zagreb, desktop notification.
- Research tier: better-than-training (inspected repo code, live DNS, and the operation proofs below, which replaced the model-knowledge runner-IP concern).
- Operation proof 2026-10-12, runner capture and repository variable: temporary branch probe/runner-capture with a push-triggered workflow on ubuntu-24.04 (checkout v7.0.1, setup-bun v2.2.0 bun 1.4.2, bun install --frozen-lockfile, playwright 1.63.0 chromium --with-deps), identity GITHUB_TOKEN contents:read in CastrumS/pirax-castrum-maintenance, run 38257245458. Result: success; all 13 sites.yaml home pages returned HTTP 200 with their real titles and no challenge text; `${{ vars.DEPLOYMENT_PROBE }}` (set with `gh variable set`, gh as castrumstudio) read back as "probe-value". Cleanup: remote branch deleted (ls-remote empty), worktree and local branch removed, variable deleted (list shows none), run record deleted. Limits: proves runner reach to Pirax's 13 home pages once, not MD's sites, not every page, and not stability over time; proves `vars` is readable in a job step env.
- Operation proof 2026-10-12, R2 store: `bun run store:selftest` (local, R2 credentials from .env, src/store.ts) PASS, artifact runs/store-selftest-2026-10-12T13-41-18.599Z.json, test root deleted (10 objects). Limits: run from the operator PC, not a runner; the runner probe showed general outbound HTTPS works. MD's own bucket not proven (step 2).
- Gmail SMTP send (scripts/reaudit/notify.ts) is already proven by the helper-auto-audit notice self-test (issues/closed/helper-auto-audit). Limit: MD's Workspace app password is a step-2 value and not proven.

## Taken
Operator 2026-10-12: "1a"
- Q1: Pirax keeps its local timer for now; only MD's deployment runs the weekly check in GitHub Actions. Reason: Pirax works today and avoids re-baselining 13 sites before the runner path is proven; moving later is a small switch. Foreclosed now: moving Pirax to Actions.
