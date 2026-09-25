# Design: visual-health-check

## Binding decisions, verbatim
### Destination (chart fork `destination`)
2026-09-25 operator: "1-B". A separate checks repo with its own site list, not the wp-fleet repo. Reason: operator choice. Foreclosed: reusing wp-fleet sites.yaml/SSH/WP-CLI; the Tamdoma framework as home.

### Approach (chart fork `approach`)
2026-09-25 operator: "2-A (what maintenance does the Playwright need?)". Self-built Playwright suite. Reason: covers screenshots and forms in one tool, no per-site SaaS cost. Foreclosed: Diffy/ManageWP/Checkly/WP Engine SPM. The operator question was answered in chat (maintenance = approving new baselines, masks, form selectors, periodic Playwright bumps).

### Baseline (chart fork `baseline`)
2026-09-25 operator: "3-A". Before/after comparison on the live site around an update, plus a stored known-good baseline for scheduled runs. Foreclosed: staging copies. Reshaped by updates-and-report 6-B: the tool does not run updates, so "before/after" means the operator runs a baseline capture before updating by hand and a compare afterwards.

### Pages (chart fork `pages`)
2026-09-25 operator: "4-A". Automatic per-site sample (home, one per template/post type, every page with a form) saved to an editable file. Foreclosed: full sitemap crawl.

Correction 2026-09-25 (repo-and-sites Q2): "2 - B I can provide a list". The operator supplies each site's page list; the tool does not auto-pick pages. Binding over the 4-A auto-sample for how pages enter the list. The representative-sample principle stays as guidance for the operator.
Correction 2026-09-25 (repo-and-sites Q2): "2 - B I can provide a list". The operator supplies each site's page list; the tool does not auto-pick pages. Binding over the 4-A auto-sample for how pages enter the list. The representative-sample principle stays as guidance for the operator.

### Report and running (chart fork `report`)
2026-09-25 operator: "1 - A". Baselines and reports in Cloudflare R2 through Bun's S3Client, with a local copy only during a run; keep the last 10 reports and prune older ones. Foreclosed: local-only storage, git-committed screenshots. Running stays on the operator's machine, with baseline/check/approve commands per site or all (from the Q4-A recommendation that R2 extends; not contested).

### Viewports (chart fork `viewports`)
2026-09-25 operator: "4 - A". Desktop 1440 wide and mobile 390 wide, full-page capture. Foreclosed: tablet 768.

### Updates and report (chart fork `updates-and-report`)
2026-09-25 operator: "6-B". Checks only; the operator keeps updating by hand and runs checks afterwards. Foreclosed: an update wrapper, automatic rollback. The report destination was not settled by this answer, so it moves to forks/report.md.

### Repo and site list (chart fork `repo-and-sites`)
Q1, 2026-09-25 operator: "1 - B - /Work/Privatni/Pirax-Castrum-Maintenance I'll need to set up the GitHub repo later". Repo at ~/Work/Privatni/Pirax-Castrum-Maintenance (doesn't exist yet). Human-only prerequisites, owner operator: create the repo and register it with akrogon (/init-issues) before handoff; add a GitHub `origin` before any leaf reaches merge (akrogon config `remote: origin`). Foreclosed: ~/Work/Tamdoma/wp-site-checks.
Q2, 2026-09-25 operator: "2 - B I can provide a list". The operator lists each site's pages by hand in the site list; no sitemap discovery. Foreclosed: auto-discovery from sitemaps.

Not applicable to this leaf: `forms`, `forms-helper`, `form-plugins`, `captcha`, `mailbox`.

## Standing design
/home/rudi/.claude/skills/chart-issues/assets/standing-design.md

- Never mock auth / server-side authorization: the plugin settings page checks `manage_options` and a nonce; the checker holds no auth surface.
- Real mutations: tests use a real Playground WordPress, real R2 (under `test/`) and a real mailbox; only outgoing mail from the Playground site is logged instead of sent, because that sandbox cannot send mail.
- No hardcoded secrets: everything comes from the gitignored `.env`, and `.env.example` lists names only.
- No vanity tests; negative and edge cases are listed in the done-criteria.
- User-visible flows are verified with Playwright (headless Chromium, trace on, no video), keeping the report or trace path as the artifact.
- Operator-physical steps (creating the repo, R2 bucket, mailbox; installing the plugin on live sites) are outside the leaf.

## Leaf architecture
Owned surfaces: `src/capture.ts`, `src/health.ts`, `src/compare.ts`, `src/report/` (HTML template and writer), `src/commands/{baseline,check,approve}.ts`, `package.json` scripts and dev dependencies for these, tests and test fixtures (`test/wp/` Playground blueprint and test plugins).

Literal interfaces:
- Viewports: `desktop` 1440×900 and `mobile` 390×844, full-page capture, Chromium headless via the `playwright` library (installed as a dev dependency here if absent, with trace on and no video).
- Before capture: wait for load plus network idle (15 s cap), scroll to the bottom and back to trigger lazy loading, inject CSS disabling animations, transitions and caret, and apply masks through Playwright's `mask` option.
- Compare: pixelmatch with threshold 0.1 and `max_diff_pixel_ratio` from sites.yaml (default 0.01); differing dimensions count as changed.
- Health file `<pageKey>.health.json`: `{ status, finalUrl, criticalError, consoleErrors: string[], failedRequests: {url,status}[], mixedContent: string[] }`.
- Report model exported from `src/report/model.ts` as `RunReport { runId, sites: SiteResult[] }`, with `PageResult` holding a `forms?: FormResult[]` slot the form-check leaf fills (`FormResult` type declared here: `{ selector, plugin: 'gravity'|'fluent'|'unknown', outcome: 'delivered'|'delivered-spam'|'not-verified'|'rejected'|'unsupported'|'failed', detail }`), rendered as a Forms column when present.
- Local working files under gitignored `runs/<runId>/`.

Exclusions: no form filling or mail; no updates to sites, and nothing that writes to a live site (read-only GETs only); no scheduling.
