# Job host

## Question
Q1. Which cloud runner runs the daily re-audit?
Q2. Cloud means the job's secrets (GPL Vault license key and product ID, the helper signing key, the Gmail app password, a GitHub token to publish releases) are stored with that runner, off this machine. The standing design says every secret lives only in the repo's gitignored .env. Is that exception accepted?

### Carries
- Operator 2026-10-02, verbatim: "2. cloud"
- update-channel: GitHub Releases on the public repo.
- Standing design: "Every secret including production lives in the consumer repo's gitignored .env ... No secret vault, broker, or off-machine credential pile exists."

## Findings
- better-than-training · GitHub Docs, disable and enable workflows (https://docs.github.com/en/actions/how-tos/manage-workflow-runs/disable-and-enable-workflows, read 2026-10-02): in a public repository, scheduled workflows are disabled automatically after 60 days without repository activity, silently (corroborated by https://dev.to/gautamkrishnar/how-to-prevent-github-from-suspending-your-cronjob-based-triggers-knf). Changed: the recommendation must include a keep-alive (the job's own pin commits count only when versions change).
- Live surface: native suites need Node 24 + Bun + Playwright Chromium and ~28 min (test/plugin/README.md); a GitHub-hosted ubuntu runner provides these; the update channel is already GitHub Releases on this repo, so GitHub Actions publishes with its built-in GITHUB_TOKEN (no extra GitHub secret).
- Alternatives: a Claude cloud scheduled agent (needs the same secrets plus repo push access, and runs an LLM session for a deterministic job); a rented VPS (always-on, secrets in its .env, but a server to maintain).

## Taken
Operator 2026-10-02, verbatim: "1a\n2a"
Q1: GitHub Actions scheduled workflow on CastrumS/pirax-castrum-maintenance, with a keep-alive against the 60-day inactivity disable and an email if the schedule stops. Foreclosed: rented server, Claude cloud agent.
Q2: Standing-design exception accepted for this job: GPLVAULT_LICENSE_KEY, GPLVAULT_PRODUCT_ID, the Gmail app password (IMAP_USER/IMAP_PASSWORD reused for SMTP) and the Ed25519 helper signing key are stored as GitHub repository secrets; .env stays authoritative locally. Foreclosed: local-only secrets.

## Operation proofs (2026-10-02)
- wordpress.org plugin info: `GET https://api.wordpress.org/plugins/info/1.0/<slug>.json`, no identity → fluentform 6.2.15, fluent-smtp 2.4.1, cleantalk-spam-protect 6.88 with `download_link`. (The 1.2 query form returned non-JSON; use 1.0.) Limit: read-only, this PC.
- Gmail SMTP notice: `curl smtps://smtp.gmail.com:465` with IMAP_USER/IMAP_PASSWORD (app password) via a temporary netrc file (removed), From/To piraxcastrum@gmail.com, Subject "[pirax-audit probe] SMTP send check 2026-10-02" → 250; IMAP search in [Gmail]/All Mail found 1. Limit: sent from this PC, not a GitHub runner.
- GitHub secrets: `gh secret set PIRAX_PROBE_SECRET` / `gh secret list` / `gh secret delete` on CastrumS/pirax-castrum-maintenance as account CastrumS (scopes repo, workflow) → set 1, deleted, 0 left. Actions enabled, allowed_actions all.
- GitHub release channel: `gh release create probe-release-20261002 --prerelease` with asset probe-manifest.json → public `https://github.com/CastrumS/pirax-castrum-maintenance/releases/download/<tag>/probe-manifest.json` HTTP 200 without credentials; `api.github.com/repos/.../releases/latest` 404 while only a prerelease exists (helper releases must be full releases to use `releases/latest/download/<asset>`); `gh release delete --cleanup-tag` → release and tag gone (ls-remote 0).
- GitHub-hosted runner (2026-10-02, run 37009586970 on temporary branch chart-probe-runner, ubuntu-latest, Node 24, Bun 1.4.2, `bun install --frozen-lockfile`): secrets PIRAX_PROBE_GPG_PASSPHRASE / PIRAX_PROBE_GPLVAULT_LICENSE_KEY / PIRAX_PROBE_GPLVAULT_PRODUCT_ID (set by the operator's script, since the agent's secret-store write was denied by the auto-mode classifier [Secret-Store Writes]); `gpg --batch --pinentry-mode loopback --passphrase-fd 3 -d` of the committed `gplvault-updater.zip.gpg` → 118-file ZIP; @wp-playground/cli runCLI WP 7.1.2/PHP 8.3 with `features.networking: true` and only the official updater 5.3.9 installed; `activate` → 138/150; `schema()` with filter `gplvault_schema_payload` listing fluentformpro 6.2.14 + gravityforms 3.1.2 (no plugins installed) → items 1111130 v6.2.15, 29365 v3.1.2; `download()` → S3 package URLs, HTTP 200, Version headers 6.2.15 and 3.1.2; `deactivate` → 139/150; `git push origin HEAD:<branch>` with GITHUB_TOKEN and `permissions: contents: write` → PUSH_OK. Cleanup: remote branch deleted (ls-remote 0), worktree removed, probe secrets deleted (secret list 0), run deleted. Limits: the scheduled trigger, the 60-day keep-alive and pushing to protected `main` were not exercised; one run from one runner IP.
