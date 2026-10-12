# Brief: deployment-setup-docs

## What
Write the guide for creating a new deployment: copy the repo, add `deployments/<name>/` (config, audited list, sites.yaml, weekly flag), generate a signing key, set `DEPLOYMENT` (repository variable and `.env`), add secrets, create the R2 bucket and test mailbox (Google Workspace app password), build and upload the first helper by hand, then the only allowed opt-in path: configure token, check Compatibility ready, opt in one site, confirm delivery. Also how to pull upstream fixes.

## Why
MD Consulting NY's team sets up and runs their copy themselves. The 2026-10-07 incident (sites opted in before the token was set sent marked tests to clients) must not repeat.

## Done-criteria
1. One guide in the README (or a doc it links), each step naming the exact command, file, variable or secret that exists in the code at merge time (checked by a test that every name the guide cites exists in the repo or workflows).
2. The opt-in section allows only the order token, Compatibility ready, one site, confirmed delivery.
3. A dry run of the guide's repo-side steps on a scratch copy with a synthetic deployment builds a helper and runs `check` for one site (commands and artifact recorded).
4. `bun run typecheck` and `bun test` pass.
