# Worker 5 report: documentation, network ledger and evidence manifest (D10–D12, AC8)

Scope: brief-5 only. All code is in `/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/worktrees/form-helper-plugin`.

- No commits, lifecycle commands or full suite were run, and nothing under the worktree's `issues/` was touched.
- No `.env`/`.env.*` file was opened, printed or edited. Credentials were loaded only through `bun --env-file=/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/.env`, and the scans printed only hit counts.
- There is no new plugin behaviour, no new dependency, and no live-site, mailbox or R2 work.

## Changed files and reasons

**Evidence (test-only)**

- `test/plugin/harness.ts`
  - **Network ledger.** `browser(name)` attaches synchronous Playwright `response` and `requestfailed` listeners to each context. Each event appends `{context, method, url, type, status | null, failure?}` to an in-memory ledger. No headers, cookies or bodies are recorded. Because the listeners never await, nothing can still be pending when `closeBrowser` closes the context.
  - **Written by `saveEvidence()`.** The ledger goes to `network.jsonl` through the existing `redact()` (raw, URL-encoded and JSON-escaped forms of the token and the GF ZIP path). Traces are unchanged: screenshots, snapshots and sources stay off, and `sanitizeZip` still scrubs them.
  - **Upload digests.** `uploadPlugin(page, zip)` records `{file, sha256}` for the uploaded ZIP. `file` is repo-relative (e.g. `dist/pirax-form-test.zip`) or a basename for temp files.
  - **Manifest.** It now holds `suite` (the run name), `scenarios` (the browser context names), `versions`, `fixtures`, both form-plugin ZIP digests, `uploads`, and `artifacts: {mail, feeds, entries, network, traces[]}`, with paths relative to the run directory. This replaces the old absolute `trace` path and `files` list. No test read those manifest fields, and the return value of `saveEvidence()` (`trace`, `redacted`, `files`) is unchanged apart from gaining `network.jsonl`.
- `test/plugin/harness.test.ts`, written first, before the fix (red evidence below). The smoke test now asserts:
  - the trace has no image or video entries;
  - every ledger line has only the allowed keys and belongs to the `smoke` context;
  - the ledger holds the login POST, the upload-plugin POST, an FF `admin-ajax.php` POST with status 200, and the probe document GET as `?probe=[REDACTED]` (the token is put in the URL on purpose);
  - the manifest has the suite, scenarios, versions, relative artifact paths including `network.jsonl` and `smoke.trace.zip`, and the exact SHA-256 of the uploaded probe ZIP.

  The existing `findSecret` check over the whole run directory now also covers `network.jsonl`.

**Build and packaging**

- `scripts/build-plugin.ts`: `README.md` was added to the explicit `FILES` allowlist. The existing secret-value check therefore also scans it. The ZIP now has 10 files.
- `test/plugin/core.test.ts`:
  - `pirax-form-test/README.md` was added to `PRODUCTION_FILES`.
  - The "code only" forbidden-pattern scan (`register_rest_route|rest_api_init|wp_mail(|PHPMailer|PIRAX_FORM_TEST_HARNESS`) now reads `unzip -p $ZIP '*.php'` instead of every entry. The README names `wp_mail()` as documentation. All 9 PHP files are still scanned, so the assertion itself is not weakened.

**Docs** (all new, based on the current code and the worker 3/4 reports; worker 4 takes precedence where they differ)

- `README.md` (root): what the repository contains, the `bun install` / `build:plugin` / `playwright install chromium` / `test:plugin` entry points, the `--env-file` invocation from a worktree, and links to the two other READMEs. No checker, R2 or IMAP commands are described.
- `plugin/pirax-form-test/README.md` (packaged in the ZIP), covering:
  - install by wp-admin upload;
  - settings: `manage_options` plus nonce; the token pattern `[A-Za-z0-9._~+/=-]{16,255}`; blank keeps the stored token; the clear checkbox disables handling for **new** submissions; a single redirect mailbox; autoload off;
  - the marker `<token>-<id>` with id `[a-z0-9]{6,32}`, and the three literal rejection messages;
  - the exact mail transformation (recipient, removed headers, `X-Pirax-Form-Test`, `[pirax-test <id>] ` subject prefix), and that marked mail fails closed;
  - the exact versions **GF 3.1.2 / FF 6.2.14**, and that other versions reject marked submissions;
  - CAPTCHA scope: GF built-in field, where only reCAPTCHA v2 checkbox was tested; FF `recaptcha` only, while hCaptcha, Turnstile and v3 are not bypassed and not verified;
  - fail-closed paths: unaudited callbacks, GF post fields, FF payment or non-`form` forms;
  - FF queued jobs using the stored id, their retry, and unwinding when a job throws;
  - the sweep: strictly older than 1 h, paging, native deletion, GF/FF queued-work removal and deferral, empty-token no-op, and WP-Cron being traffic-driven;
  - token rotation (clear pending tests first), disabling, deactivation and uninstall;
  - rollout: one site → group → all, each step needing an explicit go-ahead;
  - the residual limitations that remain after worker 4.

  It does not claim that the local mail log verifies delivery.
- `test/plugin/README.md`:
  - pinned versions, and why Playground runs as a Node child process;
  - prerequisites: Bun, Node, `g++`/`make`/`python3` for node-gyp, `zip`/`unzip`, Chromium and first-run network access;
  - no auth mocks; the `pre_wp_mail` observer and the `siteverify` answer are the only test doubles;
  - credential **names** and how to get them (GF account → Downloads; `FORM_TEST_TOKEN` is the operator's private generated shared token);
  - the `bun --env-file=<registered-repo>/.env …` form, and plain `bun test` when the environment is already set;
  - the suite table, the harness, fixtures and mu-plugin controls;
  - the artifact table and privacy, including why network data is kept outside the trace.
- `learnings/LESSONS.md`: one active line, "persist the async classification with the item at submission time; never re-derive it against mutable settings or credentials", with the date and history link.
- `learnings/history/2026-09-25-form-helper-plugin.md`: worker 3's observed regression (an ordinary entry deleted after the token changed while its job was queued, and the corresponding rotation/clear leak risk), the native evidence paths (`artifacts/plugin/adapters-2026-09-25T14-59-26-211Z/`, the regression test in `adapters.test.ts`, the worker-3 report), the `_pirax_form_test` id-only meta repair, and the general lesson. It contains no secrets, and no failure was invented.

The plan's implementation notes already explain why network data cannot be in the trace without snapshots (D11 note, `plan.md`). This worker did not edit the plan.

## Tests run

**Red** (step 1: harness test assertions added, no harness change yet):

```
$ AKROGON_BASE=93cf3b7f6b99f3a34be7f69c004345c439fa6a76 bun --env-file=/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/.env test test/plugin/harness.test.ts --timeout 180000
ENOENT: no such file or directory, open '…/artifacts/plugin/harness-smoke-2026-09-25T15-26-35-351Z/network.jsonl'
      at … test/plugin/harness.test.ts:145:69
(fail) browser logs in to real wp-admin and submits unmarked forms for both plugins [26992.25ms]
 3 pass
 1 fail
 43 expect() calls
Ran 4 tests across 1 file. [50.27s]
```

**Green** (harness only, after the ledger and manifest change; artifacts `artifacts/plugin/harness-smoke-2026-09-25T15-27-40-948Z/`):

```
 4 pass
 0 fail
 51 expect() calls
Ran 4 tests across 1 file. [52.92s]
```

**Final**: the brief's exact command, after the docs and the README allowlist:

```
$ AKROGON_BASE=93cf3b7f6b99f3a34be7f69c004345c439fa6a76 bun --env-file=/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/.env test test/plugin/harness.test.ts test/plugin/core.test.ts --timeout 180000
bun test v1.4.2 (744846f84)
 13 pass
 0 fail
 190 expect() calls
Ran 13 tests across 2 files. [154.13s]
```

**Build.** `bun run build:plugin` gives `dist/pirax-form-test.zip (10 files …)` with the 9 PHP files plus `pirax-form-test/README.md`, all rooted at `pirax-form-test/`. The core suite rebuilt it, then uploaded and activated it through wp-admin. The current digest is sha256 `c9230f734429224b80250ac9130d42755c7c96225659ebddb25229a810dd4a36`, which matches `uploads[0].sha256` in the core manifest. The digest changes on every build because the ZIP embeds timestamps.

**Artifacts** from the final run:

- `artifacts/plugin/harness-smoke-2026-09-25T15-30-35-688Z/`
- `artifacts/plugin/core-2026-09-25T15-31-25-572Z/`

Each holds `manifest.json`, `mail.jsonl`, `feeds.jsonl`, `entries.json`, `network.jsonl` (1052 lines for core), `*.trace.zip` and `playground.log`.

**Secret scan.** A Bun `findSecret` for `FORM_TEST_TOKEN` and `GRAVITY_FORMS_ZIP` (raw, URL-encoded and JSON-escaped) found **0** hits in:

- all four new artifact directories;
- `dist/`, `plugin/`, `test/plugin/` and `learnings/`;
- the root `README.md`.

Only counts were printed. In the red run's directory, `network.jsonl` was never written.

## Known limitations

- **Scenario granularity.** `scenarios` lists browser context names, not Bun test names. Bun offers no current-test-name API; the context names are chosen per scenario in each suite.
- **Upload names for temp files.** An uploaded ZIP outside the repository, such as the harness probe, is recorded by basename only.
- **URL redaction.** URLs are redacted in raw, `encodeURIComponent` and JSON-escaped forms, the same as every other artifact. A token encoded some other way, such as lowercase percent-hex or `%7E` for `~`, would not be recognized. Chromium kept the harness's encoding as-is in the test.
- **Adapters and safety suites not rerun.** They use the same `saveEvidence`/`uploadPlugin`, so their manifests gain the same fields, but this was not observed in this unit. B's full suite covers it.
- The plugin limitations documented in the plugin README (after `wp_mail`, arbitrary PHP, GF save and continue, GF prune race, crashed FF job, DST hour, Action-Scheduler-only unwinding, untested multisite and other versions) are unchanged from worker 4 and were not re-tested here.

## Unverified criteria

- **AC4 of this brief:** "targeted upload/settings + harness evidence tests pass" is verified (harness + core). The adapters and safety suites, which also upload the new 10-file ZIP, were not run per the brief; B owns the full suite.
- **Docs accuracy** comes from reading the current code and the worker reports. Claims that the reports mark as source-only are labelled as such in the plugin README: the legacy and WP-Cron runners ending the request on an exception, and the untested CAPTCHA variants.
