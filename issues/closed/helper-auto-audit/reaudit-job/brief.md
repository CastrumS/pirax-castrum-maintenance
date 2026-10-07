# Brief: reaudit-job

## What
A GitHub Actions workflow on CastrumS/pirax-castrum-maintenance runs daily (and on manual dispatch): it finds new versions of Fluent Forms, Fluent Forms Pro, Anti-Spam by CleanTalk, FluentSMTP and Gravity Forms, downloads them (paid ones through GPL Vault's official updater in a throwaway Playground WordPress), runs the native plugin suites against them, and when everything passes commits the new pins and publishes a signed helper release with the release script; on any failure it emails piraxcastrum@gmail.com. Its first run audits free Fluent Forms 6.2.15.

## Why
Plugins on client sites update automatically several times a month; without this job every update pauses form tests until someone audits it by hand.

## Done-criteria
1. All pinned versions live in one place read by the plugin (`AUDITED_VERSIONS`) and the test harness/tests (no hardcoded version literals left in `test/plugin/*.test.ts` except deliberate wrong-version fixtures derived from the pins); `bun --env-file=.env test test/plugin` passes unchanged.
2. A manual `workflow_dispatch` run on main, with secrets set, audits the current upstream versions end to end: detects free Fluent Forms 6.2.15 as new, downloads all packages (GPL Vault activated then deactivated — activations unchanged afterwards), runs the suites, and either publishes release `v0.3.x` (manifest + signature + ZIP, verifiable by the helper's public key) with the pin commit on main, or emails the failure summary; the run log and the release/email are the evidence.
3. A run with no new versions makes no commit and no release; a run where downloads or GPL Vault fail emails the reason and publishes nothing; tests cover the version-detection and decision logic with fixtures.
4. Schedule keep-alive: a commit at most every 30 days when nothing else changed, so GitHub's 60-day inactivity rule never disables the schedule; the workflow uses a concurrency group so two runs never publish at once.
5. Repository secrets `GPLVAULT_LICENSE_KEY`, `GPLVAULT_PRODUCT_ID`, `GPLVAULT_UPDATER_PASSPHRASE`, `IMAP_USER`, `IMAP_PASSWORD` exist (set from `.env` with `gh secret set`, values never printed); the encrypted updater ZIP is committed; logs and artifacts contain no secret (`findSecret`).
6. `bun run typecheck` and `bun test` pass; README documents the job, its secrets, the failure email and how to run it manually.
