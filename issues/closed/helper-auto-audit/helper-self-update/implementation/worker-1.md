# Worker 1 — native authenticated helper updates (unit 1)

Commit: `ea92a0e` (detached HEAD in retained worktree `issues/worktrees/helper-self-update-u1`, parent `2689aaa`).

Scoped updater criteria are green: native updater 7/7, core 10/10. The configured changed run is **not** all green: 247 passed and 8 failed, and all 8 failures are `tests/capture.test.ts` "browser has been closed" errors outside updater ownership (see Known limitations).

## Interface for the release worker
- `plugin/pirax-form-test/pirax-form-test.php`: `const VERSION = '0.3.0';` (must equal the `Version:` header), `Update URI: https://github.com/CastrumS/pirax-castrum-maintenance`.
- `plugin/pirax-form-test/includes/updates.php`: `UPDATE_RELEASES_ROOT = 'https://github.com/CastrumS/pirax-castrum-maintenance/releases'`, `UPDATE_PUBLIC_KEY = 'D8BfOn8TZC3jD+Hv5Q+p7SGPNGIYISVcMCqQWU0Dh9w='` (raw 32-byte key, base64). Feed: `<root>/latest/download/pirax-form-test-manifest.json` plus `.sig` (base64 of a raw 64-byte detached signature over the exact manifest bytes). Manifest `{version, package, sha256, audited}`; package must be exactly `<root>/download/v<version>/pirax-form-test.zip`.
- `scripts/build-plugin.ts` exports `buildPlugin({ source?, zip? }) -> { zip, entries, sha256 }`, `FILES` (the ZIP allowlist, now including `includes/updates.php`) and `withoutSigningKey(env?)`. The CLI (`bun run build:plugin`) behaves as before. Other `dist/` files are left in place; only the ZIP is rebuilt.

## Criteria outcomes
- AC1 (native listing/details/install/auto-update): met. `browser update: signed 0.3.1` used an authenticated wp-admin session and native WordPress, and the installed version changed from 0.3.0 to 0.3.1 on a fresh request. `plugins_api` answers only this slug, and `auto_update_plugin` opts in only this exact basename while leaving other decisions unchanged.
- AC2 (Ed25519 over exact bytes, canonical package, fail closed): met. 34 refresh cases offer nothing and drop any stale offer. They cover unsigned, bad/short/corrupted signatures, wrong key, altered bytes, equal/older/prerelease/malformed versions, malformed JSON/fields, hostile host/port/userinfo/query/fragment/traversal/lookalike repo/other version/other asset, and HTTP 500, connection resets and 404.
- AC3 (no installed-byte change on refusal, no unchecked fallback): met. All 8 install-time refusals plus the browser hash-mismatch case leave 0.3.0 installed with error `pirax_form_test_update`. These cover hash mismatch, feed moved, re-signed same version, feed unreachable or unsigned, download failure, and an offer edited to a hostile package or another version. Unrelated plugins are preserved.
- AC4 (build/allowlist/header/key/seed stripping): met. The core build test checks the ZIP entries, the 0.3.0 header and constant, the Update URI, the production root and key, and runs `findSecret` on `dist/` including the signing seed. The build scans the parent-visible seed before packaging and strips it from zip/unzip, Playground and Chromium children. No runtime key or root override exists: fixtures rewrite the constants only in a disposable staged copy, and test 1 asserts the shipping source is untouched.

## Durable evidence (sanitized copies; worktree artifacts are gitignored)
`implementation/evidence-u1/`:
- `updates-2026-10-05T15-49-05-278Z/`: green updater run (summary `update-summary.json`, ledger `update-requests.jsonl`, traces `updates-listing-install.trace.zip`, `updates-details.trace.zip`, `updates-hash-mismatch.trace.zip`, `manifest.json`).
- `core-2026-10-05T15-52-22-829Z/`: green core regression run (5 traces).
- `updates-2026-10-05T16-45-07-829Z/`, `core-2026-10-05T16-35-16-222Z/`: the same suites inside the configured changed run.
- Secret scan of `evidence-u1/` (trace ZIPs included) with `findSecret`, using PIRAX_HELPER_SIGNING_KEY, FORM_TEST_TOKEN, GRAVITY_FORMS_ZIP and FLUENT_FORMS_PRO_ZIP loaded by `bun --env-file`, returned `[]`. No values were printed. Only `.env`-free harness artifact directories were copied, with no vendor or cache content.

## Report
Changed files and reasons:
- `plugin/pirax-form-test/includes/updates.php` (new): verifies the signed feed, adds the native update offer, `plugins_api` details, own-basename auto-update, and an `upgrader_pre_download` boundary that hands the upgrader only a verified temporary ZIP and unlinks it on failure.
- `plugin/pirax-form-test/pirax-form-test.php`: version 0.3.0, `VERSION` constant, `Update URI`, requires `updates.php`.
- `scripts/build-plugin.ts`: import-safe `buildPlugin`/`FILES`/`withoutSigningKey`, `updates.php` in the allowlist, PIRAX_HELPER_SIGNING_KEY in the secret scan, trust-root shape check, seed stripped from zip/unzip children.
- `test/plugin/core.test.ts`: build contract for 0.3.0, Update URI, production constants, allowed release assets in `dist/`, and a seed scan.
- `test/plugin/harness.ts`: seed stripped from unzip, Playground and Chromium children, plus `clearstatcache(true)` before `wp-load`. Without it, reused Playground PHP workers saw a stale `.maintenance` after a native upgrade.
- `test/plugin/update-fixture.ts` (new): disposable staged helper with test keys, a loopback release server and a sanitized request ledger.
- `test/plugin/updates.test.ts` (new): 7 native positive and negative updater tests plus retained evidence.

Tests run:
- Red: `bun --env-file=… test test/plugin/updates.test.ts` gave 0 pass, 1 fail. The stage found no `VERSION` constant because the updater was missing (`worker-1-red.txt`).
- The pre-reboot green run was killed by the reboot and is not counted as evidence.
- Green updater: `bun --env-file=… test test/plugin/updates.test.ts` gave **7 pass, 0 fail**, 153 expects, 192.33s (`worker-1-green.txt`).
- Core regression: `bun --env-file=… test test/plugin/core.test.ts` gave **10 pass, 0 fail**, 170 expects, 167.19s (`worker-1-core.txt`).
- Configured changed command (`AKROGON_BASE=2689aaa… bun --env-file=… -e '…bun test'`) gave **247 pass, 8 fail**, 255 tests across 23 files, 3183.70s (`worker-1-changed.txt`). All 8 failures are in `tests/capture.test.ts`, each `browser.newContext: Target page, context or browser has been closed`. The updater and core suites passed inside this run (artifact dirs above).
- Isolated check at `ea92a0e`: `bun --env-file=… test tests/capture.test.ts` gave **22 pass, 0 fail**, 41.92s (`worker-1-capture-isolated.txt`).
- `git diff --check` is clean. No code changed after the green, core or changed runs, so none were repeated.

Known limitations:
- The configured broad run is not green: 8 `tests/capture.test.ts` failures (listed above). They fall outside updater ownership (`src/capture.ts` and `tests/capture.test.ts` are untouched). Evidence that the cause is environmental rather than this change:
  - the same file passes 22/22 in isolation at this commit;
  - B's unit lane, which includes capture.test.ts, passes 114/114 after the reboot (`baseline-unit-after-reboot.log`, `baseline-unit-with-env.log`);
  - unit 2's overlapping changed run hit the same browser-closed failure in 13 capture tests (`worker-2-u2-changed.log`).

  The likely cause is a Chromium instance that closed during the ~53-minute concurrent run. This was not repaired because it is out of scope; B owns final full checks.
- The commit is on a detached HEAD; integration is left to B.
- `findSecret` scanning covers the env-loaded string form of the seed and its encoding variants; the real seed was never handled by this worker.

Unverified criteria:
- An all-green configured changed run is unverified, because of the 8 capture.test.ts failures above.
- No real GitHub release feed was exercised; production fetches are covered only by the loopback channel, by design (unit 3 and the release worker own publishing).
- All other unit 1 criteria are verified.
