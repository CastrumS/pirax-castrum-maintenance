# Brief: weekly-actions-check

## What
Add a GitHub Actions workflow that runs `check all` for the selected deployment every Saturday morning Europe/Zagreb and on manual dispatch, then emails the deployment's recipient a short summary (per-site status and counts) and the 7-day report link the checker already creates. It runs only when the deployment config enables it; Pirax's config leaves it off.

## Why
MD Consulting NY's team has no computer that stays on for a local timer. The check must run on GitHub and deliver results by email, with the same privacy rules as today.

## Done-criteria
1. Workflow with `schedule` and `workflow_dispatch`; a first step reads the deployment config and ends the run as skipped (not failed) when the weekly check is disabled. Pirax's config has it disabled.
2. Secrets reach only the step that needs them through `env:`; no secret, bucket, endpoint or signed URL appears in logs or uploaded artifacts other than the emailed link (privacy test over the workflow file and the email body builder).
3. Email body is built only from the parsed check result: status per site, counts, report link. One send; a failed send fails the job without retry loops. Exit codes follow `check` (0 pass, 1 findings, 2 cannot run), each with its own subject.
4. A local end-to-end run of the email path with a synthetic check result sends one real message to the Pirax notice recipient over the existing SMTP transport and its arrival is confirmed by IMAP subject tag (artifact recorded).
5. A real Actions run on ubuntu-24.04 (a temporary push-triggered branch, since `workflow_dispatch` needs the file on main) completes `check` for one Pirax site with a test config that enables the weekly flag, and sends the summary email (run ID recorded). Afterwards the temporary branch, run record and any repository secrets added only for this run are deleted, and the deletions are checked.
6. `bun run typecheck` and `bun test` pass.
