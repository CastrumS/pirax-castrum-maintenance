# Worker 1 report: Playground test harness

Scope: brief-1 only (harness/tooling). No production plugin files, issue state, lifecycle commands or commits. No `.env`/`.env.*` was opened, printed or edited. Credentials were loaded only through `bun --env-file=/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/.env`. (The worktree already had a `.env` symlink; I left it alone.)

## Result

The harness smoke test passes against real WordPress 7.1.2 / PHP 8.3 in Playground, with licensed **Gravity Forms 3.1.2** (from `GRAVITY_FORMS_ZIP`) and **Fluent Forms 6.2.14** (pinned wordpress.org ZIP). The browser trace and the redacted mail, feed and entry evidence are kept. No retained artifact contains the value of `FORM_TEST_TOKEN` or `GRAVITY_FORMS_ZIP`.

## Changed files and reasons

- `package.json` (new): pinned dev dependencies `@wp-playground/cli@3.1.55`, `playwright@1.63.0` and `node-gyp@13.0.2`. `trustedDependencies: ["fs-ext-extra-prebuilt"]`. Scripts: `test:plugin` = `bun test test/plugin --timeout 600000`, and `build:plugin` = `bun scripts/build-plugin.ts`, reserved for unit 2 (the script doesn't exist yet).
  - Why `node-gyp` and the trusted dependency: Playground's `@php-wasm/node` needs the native `fs-ext` addon, which ships prebuilt binaries only up to Node 25. This machine runs Node 26.8.2, so the addon must be built at install time. The blocked postinstall failed with `spawn node-gyp ENOENT` until `node-gyp` was added. Install therefore needs `g++`, `make` and `python3`.
- `bun.lock` (new): pins the tooling above.
- `.gitignore`: added `artifacts/`, `dist/` and `.cache/`, keeping all existing entries. `.cache/plugin-test/` holds the downloaded FF ZIP.
- `test/plugin/harness.test.ts` (new): smoke test for criteria 1–4, written before the helpers.
- `test/plugin/harness.ts` (new): the harness interface (listed below), preflight, the Node child lifecycle, the PHP bridge, queue driving, browser/trace handling, upload and evidence.
- `test/plugin/playground.ts` (new): **replaces the planned `test/plugin/blueprint.ts`**. It holds the blueprint and runs `runCLI` under **Node**.
  - Why Node: Bun cannot load the native addon (`bun: symbol lookup error: …/fs_ext.node: undefined symbol: _ZNK2v85Int325ValueEv`).
  - Protocol: `harness.ts` sends one JSON line per request on stdin; replies come back as marked JSON lines on stdout. PHP runs through Playground's own `playground.run()` API, so there is no HTTP backdoor.
  - Secrets: `GRAVITY_FORMS_ZIP` is read from the environment, not from argv. The child's environment has `FORM_TEST_TOKEN` removed.
- `test/plugin/mu-plugin.php` (new, test-only, installed through a blueprint `writeFile` step):
  - `pre_wp_mail` at `PHP_INT_MAX` logs the final `to`, `subject`, `message`, `headers` and `attachments`, then short-circuits sending.
  - `pre_http_request` answers Google/recaptcha.net siteverify with `{"success":false}` and logs the call.
  - `gform_notification_enable_cc` is on. This is GF's documented opt-in; without it GF drops notification CC.
  - A ledger feed runs on the real **GF feed add-on framework** (`GFFeedAddOn`, synchronous) and on the real **FF integration manager** (`IntegrationManagerController`; FF queues it as async by default). Each records `feeds.jsonl`.
  - Nothing touches auth, capabilities or validation.
- `test/plugin/fixtures.php` (new): runs once through the PHP bridge and uses native APIs and tables:
  - Users `editor` and `subscriber`.
  - GF form: Name, Email and Message fields; two notifications (To `owner@client.test` / `owner-2@client.test`, Cc `cc@client.test`, Bcc `bcc@client.test`, subject `gf-{form_id} notification A|B`); a message confirmation; one ledger feed via `GFAPI::add_feed`.
  - FF form: cloned from FF's activation demo contact form, with two `notifications` metas of the same shape (subject `ff-<id> …`) and one enabled `pirax_ledger_feeds` meta. The ledger module is enabled and configured.
  - A public page holding both shortcodes (GF non-ajax).
- `test/plugin/artifacts.ts` (new): `redact()`, `sanitizeZip()` (unzip → byte-level scrub → rezip, using system `zip`/`unzip`) and `findSecret()`, which scans files and zip entries, including URL- and JSON-encoded forms.

## Exported harness interface (`test/plugin/harness.ts`)

`preflight(env)` and `startHarness({ run })` return a `Harness` with:

- **Site facts:**
  - `url` (loopback `127.0.0.1`), `token`, `artifactDir`.
  - `versions {gf, ff, wp, php}`.
  - `users {admin (admin/password, Playground default), editor, subscriber}`.
  - `fixtures {gf, ff, page, feeds.gf, async.gf}`.
- **PHP:** `php<T>(code)` runs PHP after `wp-load.php` in a separate Playground request and returns the code's `return` value as JSON. A thrown PHP exception rejects with the class and message; a fatal error rejects with redacted output. Calls are serialized, because Playground's `run()` writes to a fixed `/internal/eval.php` and concurrent calls corrupted each other (observed as a parse error).
- **Logs:** `mail()`, `feeds()` and `siteverify()` read the mu-plugin logs. `entries()` returns GF/FF counts plus id/form/created rows.
- **Queues:**
  - `queues()` reports GF background processors (notifications and feeds; identifiers found by reflection), due pending/running Action Scheduler actions, and FF `ff_scheduled_actions` status counts.
  - `drainQueues(maxRounds=10)` makes a fresh anonymous `admin-ajax.php` request to each native runner: `wp_gf_*_processor`, `as_async_request_queue_runner`, `fluentform_background_process`. Nonces are minted for the logged-out user.
  - It throws with the queue state if work is still pending after `maxRounds`. FF `failed` rows are returned for tests to inspect, not drained.
  - WP-Cron auto-spawn is disabled (`DISABLE_WP_CRON`), so all queue work runs explicitly.
- **Browser:**
  - `browser(name)` gives a headless Chromium context. Tracing has screenshots, snapshots and sources off; video is off by default.
  - `closeBrowser(context)` saves `<name>.trace.zip` in `artifactDir` and scrubs it.
- **Upload:** `uploadPlugin(page, zip)` goes through wp-admin → Plugins → Add New → Upload → Activate and fails loudly if activation isn't confirmed.
- **Evidence and shutdown:**
  - `saveEvidence()` writes redacted `mail.jsonl`, `feeds.jsonl`, `entries.json` and `manifest.json` (versions, fixtures, SHA-256 of both plugin ZIPs, trace path).
  - `stop()` is idempotent. It closes the browser, ends the child and falls back to SIGKILL after 30s.
- **Redaction:** all errors and `playground.log` are redacted for the token value and the GF ZIP path. Errors name the credential variables, never their values.

## Tests run

**Red** (step 1, before any helper existed):

```
$ AKROGON_BASE=93cf3b7f… bun --env-file=/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/.env test test/plugin/harness.test.ts --timeout 180000
error: Cannot find module './harness' from '…/test/plugin/harness.test.ts'
 0 pass
 1 fail
 1 error
```

Intermediate failures, each fixed at its root cause:

- `toHaveCount` is not a Bun matcher. Replaced with `.count()`.
- GF service-provider class is namespaced. Switched to the container keys `notifications_processor` / `feeds_processor`.
- Drain waited on a future-scheduled recurring AS action. It now counts only due actions.
- GF sent no Cc. This is native GF behaviour; the mu-plugin now opts in with `gform_notification_enable_cc`.
- Concurrent `run()` calls caused a PHP parse error. PHP calls are now serialized.

**Green** (final, the brief's exact command):

```
$ AKROGON_BASE=93cf3b7f6b99f3a34be7f69c004345c439fa6a76 bun --env-file=/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/.env test test/plugin/harness.test.ts --timeout 180000
bun test v1.4.2 (744846f84)
 4 pass
 0 fail
 42 expect() calls
Ran 4 tests across 1 file. [56.54s]
```

What the 4 tests assert:

1. **Preflight:** errors name `GRAVITY_FORMS_ZIP`/`FORM_TEST_TOKEN` without including the supplied values.
2. **Site:** loopback host; both plugins active; GF version equals the ZIP header; FF `6.2.14`; real DB (user count, GF tables); mu-plugin loaded; PHP exceptions surface; a real `wp_remote_post` to siteverify returns `success:false` and is logged.
3. **Browser flow:**
   - Real wp-admin login shows the admin bar and Plugins menu.
   - A throwaway plugin ZIP uploads and activates through wp-admin.
   - The GF form submits unmarked, and so does the FF form.
   - After `drainQueues()`: exactly 2 GF and 2 FF mails, each to its original recipient with `Cc: cc@client.test` and `Bcc: bcc@client.test`; +1 entry per plugin; a ledger feed row for each plugin.
   - Trace is saved, and the probe token that was typed and put in the URL was captured then scrubbed (`redacted > 0`). `findSecret(artifactDir, [token])` returns `[]`.
4. **Stop:** after `stop()`, fetching the URL fails.

Evidence from the retained logs:

- GF background notifications are **on by default** (`fixtures.async.gf: true`). Both GF mails were logged from the `/wp-admin/admin-ajax.php?action=wp_gf_notifications_processor…` request, so the cross-request drive is real.
- FF mails were sent synchronously in FF's ajax submit request.
- The FF ledger feed ran in the `as_async_request_queue_runner` request.
- The GF ledger feed ran synchronously in the page submit request.

Manual checks:

- **Secret scan:** a Bun script loading the registered `.env` ran `findSecret` over all of `artifacts/plugin/` for both credential values → `0 []`. Only the count was printed.
- **Readiness failure:** with a fake `node` that exits 3, `startHarness` rejects in about 0.2s with `Playground exited with code 3 before it was ready` plus the redacted log tail. The message contains neither the token nor the ZIP path, and the process exits (timers are unref'd).
- **Cleanup:** no Playground child process remains after the runs.

## Artifact paths

The latest green run is `artifacts/plugin/harness-smoke-2026-09-25T13-33-26-057Z/`, containing `smoke.trace.zip`, `mail.jsonl`, `feeds.jsonl`, `entries.json`, `manifest.json` and `playground.log`. The directory is ignored. Earlier iteration runs sit beside it; they are also scrubbed and passed the same secret scan.

## Known limitations

- **Trace has no network log (conflict with plan D11):** D11 asks for traces with actions and network but *without* DOM snapshots. In Playwright, network recording only happens when `snapshots: true`. With snapshots off as D11 requires, `trace.network` is empty; the trace has 29 action events. Smallest fix if B wants network data: set `snapshots: true` in `harness.browser()` and keep screenshots and sources off. The DOM and network resources are text or bytes that `sanitizeZip` already scrubs and `findSecret` verifies. I didn't change this because it would go against the plan's wording.
- **Node child process:** Playground must run under Node, not Bun (native addon). The addon is compiled at install for the local Node ABI, so switching Node major versions needs a `bun install` or a rebuild.
- **Pinned versions:** WordPress is pinned to 7.1.2 and PHP to 8.3, and the harness doesn't check GF's hook surface. It records the version, and later workers should reject hook surfaces that don't match. The FF ZIP is downloaded once into `.cache/plugin-test/`, and its version header is checked on every run.
- **FF email queueing:** FF email notifications stay synchronous (FF's default). AC5 asks for native FF email queueing; that toggle is not a fixture yet. Later workers can add an option-driven `fluentform/notifying_async_email_notifications` filter to the mu-plugin.

## Unverified criteria

- **Deferred to the adapter/acceptance workers** (brief §4 allows this), with the interfaces they will use:
  - GF reCAPTCHA v2 and FF reCAPTCHA forms: the siteverify interception is in place and verified; the forms need GF captcha key options plus a `captcha` field, and FF `_fluentform_reCaptcha_details`.
  - The unsupported-dispatcher fixture (AC6): add it to `mu-plugin.php` next to the ledger feeds, e.g. a direct `gform_after_submission` / `fluentform/submission_inserted` side-effect recorded in `feeds.jsonl`.
  - Retryable/failed FF jobs and aging fixtures (AC5/AC7): these use `php()` against native tables.
- **Not attempted in this unit:** AC1–AC8 of the production plugin (build, settings, marker behaviour, cleanup). Brief 1 is harness-only.
