# Chart: Pirax-Castrum-Maintenance

## Destination
Client sites keep plugin auto-updates on. When a pinned form-stack plugin releases a new version, a scheduled job fetches it (paid ones via GPL Vault), re-audits it against the helper, and on success publishes a helper release that WordPress installs on every site automatically; form tests resume without operator uploads. Failures notify the operator.

## Forks taken
- [release-approval](forks/release-approval.md): automatic publish on a passing re-audit
- [audit-depth](forks/audit-depth.md): native test suites + hook-inventory comparison; no code-diff review
- [update-channel](forks/update-channel.md): GitHub Releases on the public repo, Ed25519-signed manifest verified by the helper
- [operator-notice](forks/operator-notice.md): email to piraxcastrum@gmail.com
- [job-host](forks/job-host.md): GitHub Actions schedule with keep-alive; job secrets as GitHub repository secrets (standing-design exception accepted)
- [paid-source](forks/paid-source.md): GPL Vault's official updater inside the job's throwaway WordPress, activated per run; probe passed for FF Pro 6.2.15 and GF 3.1.2
- [updater-source](forks/updater-source.md): GPG-encrypted updater ZIP committed, passphrase as repository secret; updater self-updates each run
- [ff-6215](forks/ff-6215.md): audited by the job's first run; no separate leaf
- [blocked-reporting](forks/blocked-reporting.md): distinct helper message → checker warning `awaiting-audit`, failure after 3 days

## Open forks

## Fog

## Off route
- Stopping plugin auto-updates on client sites: operator rejected 2026-10-02 (maintenance must keep plugins current).
- Removing stale Elastic Email SPF includes: operator declined 2026-10-02.

Handed off 2026-10-02
