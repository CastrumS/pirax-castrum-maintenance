# A failure notice must not depend on the install it reports

## Case — 2026-10-07

The re-audit workflow's `notify` job and the separate `reaudit-watchdog` job both run the full `bun --no-env-file install --frozen-lockfile` before their notice script. Sending the mail needs only `nodemailer` and a few repository helpers. The install pulls the whole development toolchain: WordPress Playground, Playwright, `node-gyp`, `imapflow` and the trusted native `fs-ext-extra-prebuilt` package. The audit job runs the same install first.

A package-registry outage, a lockfile problem or a native build failure therefore fails the audit's setup and then fails the notice job at the same step. The operator gets no email for exactly the failure the README offers as its fallback example ("for example a failed install"). The watchdog does not cover it, because a failed audit still counts as a started run.

The same workflow already shows the alternative: the publish and heartbeat jobs install nothing, and a test loads their scripts without `node_modules`.

## Evidence

- `.github/workflows/reaudit.yml` at `87143c7`: line 48 (audit) and line 165 (notify) both run `bun --no-env-file install --frozen-lockfile`; `.github/workflows/reaudit-watchdog.yml:33` does the same.
- `scripts/reaudit/notify.ts:18` imports `nodemailer` at module load; `src/mail/imap.ts`, which it also imports, loads `imapflow`. `package.json` lists both among development dependencies next to `@wp-playground/cli`, `playwright` and `node-gyp`, with `fs-ext-extra-prebuilt` as a trusted dependency.
- `README.md:53` ("Notice."): "When a job left no summary in this run attempt (for example a failed install), a fixed summary for that job is sent."
- `tests/reaudit-workflow.test.ts`: "publish and heartbeat jobs install nothing: their scripts load without node_modules".
- Reaudit-job review A, Nit N1, held through the initial review and the repair re-check on 2026-10-07. It is non-blocking because the plan does not require registry independence, and the repair round deferred it.

## Learning

A notifier exists to report failures, including failures of shared infrastructure such as the package registry, the install step or the toolchain. If it shares that infrastructure with the job it watches, it cannot report the failure class it most needs to report. Give the notice path the fewest dependencies: no install, or a minimal install of only the mail library. Then prove it loads without the full dependency tree, the way dependency-free jobs are already tested.
