# Unit 2 report: official package discovery, acquisition and provisioning

Worktree `issues/worktrees/reaudit-job-u2`, detached from base `4e929fc`. Commit: **`fe5d0a3`** (`feat: re-audit discovery, official GPL Vault acquisition and setup`). Code only. Nothing written under worker `issues/`, no docs, pins, harness or release edits. No new dependency.

## Public interfaces (for B / orchestration)

### `scripts/reaudit/detect.ts` (pure, import-safe)
- `PIN_KEYS = ["gf","ff","ff_pro","cleantalk","fluent_smtp"] as const`, `type PinKey`, `type AuditedVersions = Record<PinKey,string>`. This is structurally identical to unit 1's `scripts/plugin-source.ts`.
- `PLUGINS: Record<PinKey,{source:"gplvault"|"wordpress.org"; slug; main}>` holds the plan D3 table. Also exported: `FREE_KEYS` (ff, cleantalk, fluent_smtp) and `PAID_KEYS` (gf, ff_pro).
- `class ReauditError extends Error { stage; field; reason; lifecycle?: unknown }`. Its message is always `"<stage>: <field> <reason>"` and never contains a value.
- `compareVersions(a: string, b: string): -1|0|1`. Works only on stable dotted numerals (`^(0|[1-9]\d*)(\.(0|[1-9]\d*))*$`). Components are compared as digit strings, with no float or integer coercion. A missing trailing component counts as 0.
- `validateVersions(record: unknown, stage: string): AuditedVersions` requires exactly the five keys, each a stable string.
- `assembleLatest(observations: {key: string; version: unknown}[]): AuditedVersions` rejects unknown, duplicate, missing and malformed observations.
- `compareMatrix(pins, latest): {status:"unchanged"|"changed"; changed: PinKey[]}`. A pin is unchanged only when its string is exactly equal. It throws `discovery: <key> downgrade` and `discovery: <key> ambiguous` (numerically equal but spelled differently, e.g. `6.88` vs `6.88.0`).
- `parseWordpressOrgInfo(key, body): {version, url}` reads the design's `plugins/info/1.0` `version`/`download_link`. The link must be exactly `https://downloads.wordpress.org/plugin/<slug>.<version>.zip`.
- `parseCatalog(entries: unknown): Record<"gf"|"ff_pro",{version, item}>` reads the reduced official `schema()` entries `{main, product_id, version}`. It rejects missing, duplicate and malformed products and item ids, and ignores unrelated products.

### `scripts/reaudit/fetch.ts`
- `acquirePackages({ pins, directory, env?, cache?, fetch?, openVault? }): Promise<Acquisition>`
  - `pins: AuditedVersions`. `directory` is private scratch: it holds the decrypted updater (deleted once the child has booted) and the paid ZIPs. Never use an artifact directory for it.
  - `env` defaults to `process.env` and needs `GPLVAULT_LICENSE_KEY` and `GPLVAULT_PRODUCT_ID`. The official vault also needs `GPLVAULT_UPDATER_PASSPHRASE`.
  - `cache` defaults to `<root>/.cache/plugin-test`. `fetch` and `openVault` are fixture seams only; production uses the defaults.
  - The result is a discriminated union:
    - `{status:"unchanged", versions, packages:null, lifecycle}`
    - `{status:"changed", versions, changed: PinKey[], packages: Record<PinKey,{version, sha256, path}>, lifecycle}`
  - Free package paths are `<cache>/<slug>.<version>.zip`, which is the harness's existing slot. Paid package paths are `<directory>/<slug>.<version>.zip`, and the orchestrator hands them to the suites as `GRAVITY_FORMS_ZIP` and `FLUENT_FORMS_PRO_ZIP`. No URL appears anywhere in the result.
  - `Lifecycle = { activationAttempted, activationConfirmed, deactivationAttempted, deactivationConfirmed, remainingBefore: number|null, remainingAfter: number|null, updater: {before, after}|null }`. The two counts are the official `status()` `activations_remaining` before activation and after deactivation.
  - Every failure throws `ReauditError` with `.lifecycle` attached and returns nothing partial. Paid files are removed on failure.
- Sequence. Discovery and the paid downloads happen inside one license lifetime, and cleanup finishes before the function returns:
  1. Discover on wordpress.org (no license needed).
  2. Decrypt the updater and boot the Playground. The `configure` step saves the API settings.
  3. Call `status()`, mark the activation as attempted, then `activate()` + `enable_activation_status()`.
  4. Self-update: `client_schema()` → `save_client_schema()` → set the update transient (the client's own `pre_set_site_transient_update_plugins` offers itself) → `Plugin_Upgrader::upgrade()` when offered. Then a fresh request reactivates the plugin, and another fresh request runs `enable_activation_status()` and reads the loaded Version.
  5. Call `schema()` with the `gplvault_schema_payload` filter set to the two paid main files at their pins, then compare.
  6. Only on a change: `download(['product_id'=>item])` and a bounded fetch for both paid packages.
  7. In `finally`: `deactivate()` then `status()`. Deactivation counts as confirmed only when `status` reports the instance inactive, or, if `status` is unreachable, when `deactivate` itself says so.
  8. Close the child.
  9. Only on a change with confirmed cleanup: the three wordpress.org packages.
- Failure handling:
  - An unconfirmed deactivation fails the run as `cleanup: deactivate unconfirmed[ (after <original failure>)]`, even after an otherwise successful acquisition.
  - SIGINT/SIGTERM reject the pending step so `finally` still deactivates (error `signal: SIGTERM received`). The handlers stay installed through cleanup. The Playground child ignores SIGINT/SIGTERM/SIGHUP and stops only when its stdin closes.
- Bounds: HTTPS only, `redirect: "error"`, status must be exactly 200. Declared and streamed size limits are 2 MiB for JSON and 64 MiB for ZIPs; timeouts are 60 s and 300 s. The main-file `Version` is checked against the selected version and the SHA-256 is taken of the verified bytes, which are then moved into place atomically (`.part` → rename). If a download fails, the old package is never substituted.
- Other exports:
  - `openOfficialVault({directory, env, ciphertext?})`, `interface Vault`, `type OpenVault`.
  - `vaultChildEnv(env, zip)`: the child environment is exactly PATH, HOME, the two license values and `PIRAX_GPLVAULT_UPDATER_ZIP`.
  - `zipVersion(bytes, main)`.
  - `gpg(args, passphrase, stage)`: the passphrase goes on stdin (`--passphrase-fd 0`), in a throwaway GNUPGHOME with `--no-symkey-cache`, and the agent is killed afterwards.
  - `decryptUpdater(ciphertext, out, passphrase)`, and the constants `CACHE` and `CIPHERTEXT`.
- Platform pins come from `test/plugin/harness.ts`'s `WP_VERSION` and `PHP_VERSION`. Importing them is side-effect free but loads the playwright module.

### `scripts/reaudit/gplvault-playground.ts` (Node 24 child)
A runner modelled on `test/plugin/playground.ts`. It uses `runCLI` server mode with WP 7.1.2 / PHP 8.3, `features.networking: true`, the constants `DISABLE_WP_CRON` and `GPLVAULT_DISABLE_LOG`, and has only the decrypted official updater installed. The protocol is the MARK-prefixed stdin/stdout control protocol. License values reach PHP only as the `env` of the `configure` request; argv carries only `{wp, php}`. Child stdout outside MARK lines and all stderr are dropped and never printed.

### `scripts/reaudit/setup.ts`
- Run with `bun --env-file=<root>/.env scripts/reaudit/setup.ts [--source <zip>]`. The default source is `~/Downloads/gplvault-updater.zip`. Importing the module does nothing; `setup({env?, source?, ciphertext?, repo?, log?})` is exported.
- Exports `SECRET_NAMES` = GPLVAULT_UPDATER_PASSPHRASE, GPLVAULT_LICENSE_KEY, GPLVAULT_PRODUCT_ID, IMAP_USER, IMAP_PASSWORD, and `REPO`.
- It refuses when:
  - a name is missing;
  - the passphrase is shorter than 16 characters;
  - the source is not a `gplvault-updater/gplvault-updater.php` ZIP;
  - `PIRAX_HELPER_SIGNING_KEY` is absent from `gh secret list`;
  - an existing ciphertext does not decrypt with the passphrase, or decrypts to a different ZIP. It never rotates.
- When the existing ciphertext matches the source, it keeps it byte-identical. Otherwise it encrypts with AES256 to `.part`, verifies the round-trip digest, then renames.
- After that it sets the five secrets with `gh secret set <NAME> --repo …`, one value per call on stdin. gh runs with an allowlisted environment (PATH, HOME, LANG, XDG_*, DBUS, GH_*/GITHUB_TOKEN) that contains none of the provisioned values.
- It never sets the signing secret, and prints names and results only. It uses the existing `GPLVAULT_UPDATER_PASSPHRASE` (implementation note); it does not generate one.

## Changed files and reasons
- `scripts/reaudit/detect.ts`: AC1, discovery normalization and complete numeric comparison.
- `scripts/reaudit/fetch.ts`: AC2/AC3, bounded acquisition, validation and the parent-owned official lifecycle.
- `scripts/reaudit/gplvault-playground.ts`: AC3, the Node Playground child.
- `scripts/reaudit/setup.ts`: AC4, explicit provisioning.
- `tests/reaudit-detect.test.ts`: AC1 fixtures. Covers multi-digit ordering, the 6.2.14→6.2.15 FF change, missing/duplicate/unknown/malformed values, downgrades, ambiguous spellings, link validation and that no sentinel values leak.
- `tests/reaudit-fetch.test.ts`: AC2/AC3/AC5.
  - Synthetic ZIPs, an in-process fetch double and a scripted `Vault`: no-change downloads nothing, the changed path yields all five packages with digests and cache/private paths, plus call ordering.
  - Failure cases: lost or refused activation, GPL Vault refusal, refused or unconfirmed deactivation, confirmation via status, a failure combined with a failed cleanup, HTTP/size/stream/network/non-ZIP failures, Version mismatch with no substitution, non-HTTPS or empty package URLs, SIGTERM and downgrade.
  - `findSecret` over the serialized result; the child-environment allowlist.
  - One **real Playground child** test against a *synthetic stand-in* exposing the official method names. It exercises every PHP step, the env-only credential channel (activation checks that the license value is absent from later requests), the reduced catalog with no `package` field, deletion of the decrypted ZIP after boot, and child shutdown.
- `tests/reaudit-setup.test.ts` (**added**, an acquisition-only helper test): real gpg with synthetic secrets and a recording fake `gh` on PATH. Covers the round trip, stdin-only values, secrets absent from gh's argv and environment and from the console output, a byte-identical rerun, refusal on a wrong passphrase or a different ZIP, refusal when the signing secret is absent, missing/weak inputs, a non-updater ZIP, and a wrong passphrase on decrypt.

## Tests run
All commands ran with PATH prefixed by `/home/rudi/.local/share/mise/installs/node/24.21.0/bin` (Node v24.21.0, Bun 1.4.2), after `bun install --frozen-lockfile` (289 packages).
- **Red:** `bun --no-env-file test tests/reaudit-detect.test.ts tests/reaudit-fetch.test.ts tests/reaudit-setup.test.ts` → exit 1, 0 pass / 3 fail / 3 errors (the modules did not exist yet). Log: `evidence-u2/red.log`.
- **Green:** the same command → exit 0, **71 pass / 0 fail**, 253 expect() calls, 18.0 s. Log: `evidence-u2/green.log`.
- `bun run typecheck` → exit 0. It first failed on two test-typing errors, which I fixed before the commit.
- `bun run build:plugin` → `dist/pirax-form-test.zip` (11 files, sha256 182f8815…dbca0).
- **Configured changed-test command** (full `bun test` with the registered `.env`, `AKROGON_BASE=4e929fca…`): exit 0, **357 pass / 0 fail**, 4581 expect() calls, 31 files, 3252 s (run on commit `fe5d0a3`; the new reaudit tests are included). Log: `evidence-u2/changed-tests.log`.
- Live public check: `evidence-u2/live-free-discovery.log`, 2026-10-06T06:59:56Z, real wordpress.org parsed by `parseWordpressOrgInfo` with `redirect:"error"`. Upstream is now **ff 6.2.15, cleantalk 6.89, fluent_smtp 2.4.1**. Against the current pins, `compareMatrix` reports `changed: ["ff","cleantalk"]`, so the first real run will audit CleanTalk 6.89 as well as FF 6.2.15. All three info endpoints answered 200 with no redirects.

## Real vs fixture evidence
- **Real:** the wordpress.org discovery parse (public, no credentials); booting and driving the Playground child (WP 7.1.2/PHP 8.3, networking on) through every PHP step; gpg encrypt/decrypt; the child-environment and stdin boundaries.
- **Fixture/synthetic only:** every GPL Vault answer. The stand-in plugin copies the official client's method names and the response shapes I read from the official 5.3.9 source (activate/status `data.activations_remaining`, deactivate `deactivated`, schema `plugins[<file>]` with `product_id`/`version`/`plugin_basename`, `download()` returning `package`) and from the chart's 2026-10-02 probe. It is **not** evidence of GPL Vault authentication, of the real response shapes in the current client, or of self-update behaviour. No real activation, GitHub write or setup run was performed.

## Known limitations
- The self-update *offer* path (`Plugin_Upgrader::upgrade` when GPL Vault offers a newer client, followed by reactivation) has never run. The stand-in offers no update. Only the official 5.3.9 hook (`pre_set_site_transient_update_plugins`) was read.
- I assume `schema()` returns entries for products listed at their *current* pins. The probe listed FF Pro at the older 6.2.14. If the server omits up-to-date items, discovery fails closed (`catalog: <key> missing`); it never accepts the result.
- SIGKILL, runner loss, or an unreachable GPL Vault can strand an activation: `finally` cannot run. On Actions cancellation (SIGINT, then SIGTERM about 7.5 s later, then SIGKILL about 2.5 s after that) cleanup has roughly 10 s, while the client's own request timeout is 10 s per call. The run log carries no license or instance data; recovery means deactivating the stale instance from the GPL Vault account.
- If a signal interrupts an in-flight paid download, the bytes may land in the private `directory` after the failure cleanup has already run. The orchestrator must delete `directory` in its own `finally`.
- The before/after activation counts are reported, not enforced. AC3's "first live proof must establish unchanged activations" is for B to check from `remainingBefore === remainingAfter`.
- `setup` refuses a passphrase shorter than 16 characters. If the operator's existing value is shorter, B gets a name-only refusal.
- Child error detail is deliberately discarded (errors carry stage and field only), so diagnosing a live failure needs a deliberate private rerun.

## Unverified criteria
- AC2/AC3 against live GPL Vault: activation, self-update, schema, download, deactivation and the counts. Deferred to B after integration, as the brief specifies.
- AC4 live: `setup.ts` has not been run. No ciphertext is committed and no repository secrets are set. B provisions after reviewing this code.
- AC5 on real retained evidence: the unit evidence logs were scanned with `findSecret` against the real `.env` values loaded through Bun's env-file support (names only, values never printed): 0 hits across red/green/changed-tests/live-free-discovery logs for all 9 credential names, see `evidence-u2/findsecret.log`. Scanning orchestration artifacts belongs to later units.
