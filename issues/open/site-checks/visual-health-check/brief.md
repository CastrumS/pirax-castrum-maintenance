# Brief: visual-health-check

## What
Add `bun run baseline <slug|all>`, `bun run check <slug|all>` and `bun run approve <slug> [pagePath]`. For every listed page at 1440 and 390 wide, the tool loads the page, captures a full-page screenshot with masks applied, and records health. `check` compares against the R2 baseline, writes a static HTML report (baseline/actual/diff side by side per page and viewport, plus health findings), uploads it to R2 under `reports/<runId>/`, prunes to the 10 newest, and prints a 7-day presigned link plus the local path. `approve` promotes the latest check's actual images and health to baseline for that site or page.

Credentials this leaf needs (in `.env`):
- `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`: Cloudflare R2 API token (dashboard → R2 → Manage API tokens → Object Read & Write, scoped to the bucket).
- `S3_ENDPOINT`: `https://<account-id>.r2.cloudflarestorage.com` (account id on the R2 overview page).
- `S3_BUCKET`: the bucket name the operator creates in R2.
This leaf's local WordPress needs no paid plugins.

## Why
Replaces the operator opening and scrolling every page on desktop and mobile after each manual update (intake). Checks run after the operator updates by hand (6-B), against the stored baseline (3-A).

## Done-criteria
1. End-to-end against a local WordPress started with `@wp-playground/cli` (Node, no Docker/PHP): run `baseline local`, change one page's content through the Playground WP-CLI, run `check local`, and assert exit code 1, that the report marks exactly that page as changed at both widths, and that unchanged pages pass. Report path and Playwright trace kept as the artifact.
2. Health failures detected end to end against the same local site, each as its own case: a 404 listed page, a page printing "There has been a critical error on this website", a missing image/CSS asset (4xx), a JS console error, and an http:// asset on an https page (mixed content), served for that case by a local Bun HTTPS fixture server with a self-signed certificate and `ignoreHTTPSErrors`, since Playground serves plain http. Console errors and failed requests already present in the baseline's health file are warnings, not failures.
3. Masks: a page with a changing element (random number rendered by a test plugin) passes when that selector is in `mask` and fails without it.
4. Page-height change reports as changed with both heights shown, not as a crash; an unreachable or bot-blocked site (403/challenge page) is reported as "blocked" and the run continues with the other sites.
5. `approve` then `check` on the changed page passes; R2 report prefix count is ≤ 10 after a run (checked against a `test/` prefix in the real bucket, cleaned up afterwards).
6. Exit codes: 0 all pass, 1 any failure, 2 configuration error; `bun test` and `bun run typecheck` pass.
