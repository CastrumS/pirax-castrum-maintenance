# Brief: checker-foundation

## What
Create the checker project in the repo root: Bun + TypeScript, `package.json` scripts, `.gitignore` (ignoring `.env`, `runs/`), `.env.example` listing every variable below with empty values, and `README.md` with setup steps. Implement `src/sites.ts` (load and validate `sites.yaml`, the literal schema below) and `src/store.ts` (Cloudflare R2 through Bun's built-in `S3Client`: put/get/list/presign, plus `pruneReports(keep = 10)`). Ship an example `sites.example.yaml`; the operator writes the real `sites.yaml`.

Credentials this leaf needs (in the gitignored `.env`):
- `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`: Cloudflare R2 API token (dashboard → R2 → Manage API tokens → Object Read & Write, scoped to the bucket).
- `S3_ENDPOINT`: `https://<account-id>.r2.cloudflarestorage.com` (account id on the R2 overview page).
- `S3_BUCKET`: the bucket name the operator creates in R2.

## Why
Every check reads the operator's site list and stores baselines and reports in R2 (report fork). Building these once keeps the visual check and form check from inventing two versions.

## Done-criteria
1. `bun test` passes, including negative cases: duplicate slug, missing url, url with trailing slash, empty pages, unknown key and malformed mask each fail with a message naming the site and field.
2. `bun run store:selftest` uploads, lists, downloads and presigns an object under `test/<timestamp>/` in the real R2 bucket, compares bytes, deletes the prefix and exits 0; it exits non-zero with a clear message when any `S3_*` variable is missing.
3. `pruneReports` test against the real bucket: create 12 report prefixes under `test/<timestamp>/reports/`, prune to 10, assert the two oldest are gone and the rest are intact, then clean up.
4. `bun run typecheck` passes and no secret value appears in any committed file.
