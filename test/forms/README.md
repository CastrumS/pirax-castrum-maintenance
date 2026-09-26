# Form checker tests

See [operator setup, credential formats and rollout warning](../../README.md#form-checks) first. Never run integration verification against the committed live site list. `form_helper: true` is operator attestation, not proof of helper installation/token agreement; live rollout requires explicit go-ahead, one site → group → all.

## Prerequisites and commands

- Bun 1.4+, installed Playwright Chromium, `zip`/`unzip` (also production forms-runtime requirements).
- Compatible Node **24** first on PATH for the native [plugin harness](../plugin/README.md). Observed version: 24.21.0. Playground/blueprints 3.1.55, WordPress 7.1.2, PHP 8.3, licensed Gravity Forms **3.1.2** and downloaded Fluent Forms **6.2.14**. Network/download access and the native addon/compiler prerequisites apply.
- Private environment: `FORM_TEST_TOKEN`, `FORM_TEST_ADDRESS`, `IMAP_HOST`, `IMAP_PORT`, `IMAP_USER`, `IMAP_PASSWORD`, `IMAP_FOLDER`, `IMAP_SPAM_FOLDER`; native integration also needs `GRAVITY_FORMS_ZIP` and the four `S3_*` names in root Setup. `mail:selftest` alone additionally needs `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`.
- Acquire the licensed ZIP from the Gravity Forms account Downloads page. Create a **new dedicated mailbox**, enable IMAP/app-password access, and configure its plus-address/alias filter and exact existing inbox/spam folder names with the provider. Root README documents accepted formats and R2 token acquisition. No personal mailbox access, folder discovery or folder creation.

Load values through Bun; never inspect, print, copy or edit an environment file as part of test diagnosis. Missing/invalid configuration fails by name, never silently skips.

```sh
export VISUAL_NODE=/path/to/node24
export PATH="$(dirname "$VISUAL_NODE"):$PATH"
bun run build:plugin
bun --env-file=.env test test/forms/playground.test.ts
bun --env-file=.env test test/forms/report.test.ts
bun --env-file=.env run test:forms
# Independent real delivery proof; intentionally sends one message:
bun --env-file=.env run mail:selftest
# Full changed/full test suite and visual regression:
bun --env-file=.env test
bun run typecheck
bun --env-file=.env run visual:selftest
```

From a worktree without its environment-file link, use `--env-file=<registered-repo>/.env`. Config/browser helper tests can run credential-free with explicit paths:

```sh
bun --no-env-file test test/forms/config.test.ts test/forms/imap.test.ts test/forms/browser.test.ts test/forms/evidence.test.ts
```

Each integration file sets its own timeout (Bun 1.4 scopes it per file). Budget roughly 13–18 minutes for native checker integration: the primary CLI test alone allows 900,000 ms and intentionally waits **two real default 300,000 ms mailbox deadlines**. Negative cases use short internal API deadlines, not CLI flags or fake delivery. Full suite including existing plugin integration normally needs 25–35 minutes. Real mail selftest adds at least five minutes for its unsent ID; visual selftest is separate and can take several more minutes.

## What is real

- `harness.ts` reuses `test/plugin/harness.ts` and its serialized `php<T>()` bridge. A unique disposable administrator password is set through the native WordPress user API, then real wp-admin login, ZIP upload/activation and the nonce-protected settings form configure the helper. Fixture PHP is installed/read back byte-for-byte and its served `native-v1` marker is checked. Native GF form APIs and FF's existing native fixtures supply actual forms, notifications, validation and entry cleanup. No plugin PHP is modified.
- `playground.test.ts` verifies helper-false mail/entry/feed immutability; hidden upload/no marker exclusion; client required-field and native server required-field rejection with later-form continuation; native required GF checkbox/consent and FF checkbox/terms positive confirmations (audited native required markers, not added HTML `required`); GF modern AJAX (including its audited lazy confirmation-sanitizer script) and FF AJAX association; distinct submissions; redirect recipients/exact Subject tag/header and native cleanup. The client required fixture hides an enabled required input; the server fixture renders its native required checkbox as optional without changing the server rule.
- A disposable package invokes **`bun run forms local --sites <generated-list>`**. Its script points to `test/fixtures/cli.ts`, which calls production dispatch with a real `Store` restricted to `test/forms-.../` and suppresses signed-link output. This is not the unscoped root alias: the summary records exact argv/cwd; `tests/commands.test.ts` independently checks the root alias and actual empty-list/usage exits.
- `check` also runs real visual capture/baseline comparison at both widths before attaching native form results. Existing screenshot algorithms and their visual selftest are unchanged.
- Real scoped R2 verifies warning/failure publication and status, forms-only no-baseline access, manifest-last/no trace uploads, private HTML rendering, and cleanup. `report.test.ts` separately proves newer forms manifests do not hide the latest check from approval and malformed manifests still fail. A production `runForms` regression also uses a synthetic nonsecret mailbox folder name in both the run directory and listed page path, asserting intact local-path logging, real scoped publication and cleanup. No R2 or authentication mocks.

**Playground cannot send mail.** Its final `wp_mail` observer logs redirected arguments and returns success without transport. A native browser confirmation plus this log is submission/isolation evidence only. Production IMAP must therefore return `failed` after each default deadline and the primary CLI must exit **1**. The test suite passes by asserting that truthful failure, never by inventing `delivered`.

`mailbox-selftest.ts` independently authenticates real SMTP and IMAP, sends exactly one harmless uniquely tagged message (no token/body retention), verifies production `delivered`/`delivered-spam`, and checks an unsent ID for the full five-minute timeout. It records EXAMINE/UID SEARCH/candidate Subject PEEK command facts and before/after counts, UID metadata and flags. No unrelated bodies, mailbox writes, moves, deletes, or cleanup of that message. The message stays in the dedicated mailbox intentionally. Unchanged counts/flags prove a quiet observed interval, not exclusive mailbox control: concurrent mail/filter/client changes make the comparison fail or inconclusive. Positive SMTP proof does not establish a live client's transport, every notification path, or real spam-folder arrival.

The ImapFlow **2.0.7** Bun patch is part of the contract: opt-in literal names suppress startup NAMESPACE/LIST, metadata LIST and namespace/INBOX rewriting in both shipped runtime builds. Installed-code tests check default/literal behavior, encoding and Subject-only PEEK; these are compiler/command diagnostics, not simulated authentication. TCP tests enforce deadline/TLS-downgrade/cleanup against real peers. They observe the installed client's actual local endpoint and close event (without changing transport/auth/results), so unrelated desktop service probes are not mistaken for its leak. The zero-owned-peer/client-open assertion and deadline remain strict; an intentional unrelated idle connection reproduces the interference deterministically.

## Evidence, privacy and cleanup

Native evidence: `runs/forms-playground-<uuid>/summary.json`, including versions, exact CLI argv/cwd, outcome/details, report/trace paths and root cleanup counts. Reports live under `cli/<runId>/`, `warnings/<runId>/` and `check/<runId>/`. The summary links `artifacts/plugin/forms-checker-<stamp>/` for sanitized native mail/feed/entry/network ledgers and upload digests. Other suites retain `runs/forms-browser-<uuid>/`, `runs/forms-report-tests-<uuid>/summary.json` and `runs/mail-selftest-<stamp>/summary.json`. Nothing belongs in git.

Forms/admin/report-render contexts use headless Chromium with tracing on and **video, screenshots, DOM snapshots and sources off**. Action arguments still require scrubbing. The encoded-credential regression sanitizes an actual archive and parses its retained JSON independently to check astral UTF-16 surrogate pairs and mixed literal/escaped values; redactor idempotence alone is not the privacy oracle. The wrapper adds production redaction of credentials, addresses and encoded forms to the older plugin harness's token/ZIP-only sanitation, using literal `<token>` for the token. Raw trace files are transient and removed; failed sanitation deletes unsafe evidence. Retained traces are unpacked and scanned, as are reports/logs/summaries. Visual captures are separate pre-fill contexts; their normal image/DOM traces remain unchanged. No form traces are uploaded. Render fetched private HTML via local content, never navigate a signed bearer URL or retain one in logs.

Every remote mutation uses a fresh `test/forms-.../` root. In `finally`, stop browsers/WordPress, delete only that root, then list it and require zero remaining objects. Summary records deleted/remaining counts. A cleanup failure is a test failure and identifies the prefix for manual cleanup; never broaden deletion to production reports/baselines. Local evidence is intentionally retained (no automatic local pruning); review before sharing and remove when no longer needed.

Production exits: 0 pass/warnings/empty selection, 1 failed/rejected/operational failure, 2 usage or missing/invalid configuration. Warnings (`not-verified`, `unsupported`, `delivered-spam`) do not prove delivery. Unsupported custom/multistep/payment/password/upload/draft/external flows, redirect-only confirmations, initialization delays, token mismatch, arbitrary site code and post-`wp_mail` transport changes remain safety limits, not reasons to bypass gates. Imports/no-form pages are lazy about forms/mail credentials; IMAP configuration is checked before any eligible opted-in click. Invisible/v3 CAPTCHA and specialized GF phone flows remain unverified and can time out or falsely reject; see root limitations, not a runtime bypass. A late forms-config error during `check` exits 2 after capture, retaining capture artifacts but no completed HTML/manifest report or publication. Forms-only manifests have no visual evidence and are excluded from approval while sharing global last-ten retention.
