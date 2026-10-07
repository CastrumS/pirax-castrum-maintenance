# Updater source

## Question
Q1. The cloud job needs GPL Vault's official updater plugin ZIP (495 KB, version 5.3.9, GPL-licensed, downloaded by the operator from the GPL Vault account). Where does the job get it?

### Carries
- paid-source: run the official updater inside the job's throwaway WordPress.
- job-host: GitHub Actions on the PUBLIC repo; secrets as repository secrets.

## Findings
- GitHub Actions secrets are limited to 48 KB each (GitHub Docs, "Using secrets in GitHub Actions"), so the ZIP cannot be a plain secret; GitHub's documented workaround is committing a GPG-encrypted file and storing only the passphrase as a secret.
- The updater must stay current: GPL Vault rejects clients older than a server-side minimum (probe 1: "All versions before 4.2.0 are not supported anymore"). The official updater can update itself through WordPress once activated.

## Taken
Operator 2026-10-02, verbatim: "1a"
The official updater ZIP is committed GPG-encrypted (symmetric) in the repository; its passphrase is a GitHub repository secret; each run decrypts it, activates it, and lets it update itself to GPL Vault's current client before fetching packages. Foreclosed: plain ZIP in the public repo; R2 storage.
