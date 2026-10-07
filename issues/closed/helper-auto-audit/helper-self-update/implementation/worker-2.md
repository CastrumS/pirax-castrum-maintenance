# Worker 2: version-only awaiting-audit rejection (unit 2)

Commit: `6d6ce16` (detached HEAD in retained worktree `issues/worktrees/helper-self-update-u2`, parent `2689aaa`).

The scoped helper criteria are green natively. Every `test/plugin/*` suite passed inside the configured changed run. That run is **not** all green, though: 237 passed and 13 failed. All 13 failures are `tests/capture.test.ts` "browser has been closed" errors, which fall outside unit 2 ownership (see Known limitations).

## Criteria outcomes
- **AC1 (exact native messages, no effects): met.**
  - With the installed Pro file altered to 6.2.16, FF returns HTTP 423 with `Pirax test blocked: awaiting audit of Fluent Forms Pro 6.2.16` (`version gate: Fluent Forms Pro`), with `added: []` and `feeds: []`.
  - CleanTalk 6.88.1 and FluentSMTP 2.4.2 give the same pattern with their own labels.
  - Pro plus SMTP gives `…awaiting audit of Fluent Forms Pro 6.2.16, FluentSMTP 2.4.2` in report order.
  - Audited Pro with Inventory on keeps the exact generic `integrations could not be suppressed` message. That test passed inside the changed run.
  - Ordinary controls before and after still create entries.
- **AC2 (reflection ownership, generic otherwise): met.** `callback_owner()` uses `ReflectionFunction`/`ReflectionMethod` to find each callback's declaring file and checks it against the exact `PLUGIN_DIRS`. Names are never used. The following all stay generic: unknown or missing versions, unattributed or mu callbacks, unsupported forms, a rebound CleanTalk wrapper next to a Pro mismatch (`version-only classification: pro with rebound CleanTalk`, 423 generic), removal failures and mixed causes. Everything stays blocked.
- **AC3 (GF early guard): met.** The compound GF 3.1.3 case is fixed, with a fail-first test first:
  - Red: GF 3.1.3 plus a wrapped or moved CleanTalk generic AJAX check returned `awaiting audit of Gravity Forms 3.1.3` (2 failures).
  - Green: both now return generic `integrations could not be suppressed`. The recorded reasons are `["Gravity Forms 3.1.3 is not the audited 3.1.2", "CleanTalk's generic AJAX check could not be removed"]` with `added: []`.
  - `GF modern AJAX early reads: GF 3.1.3` records 0 stored-form reads for the marked request.
  - Marker and config errors still take precedence: malformed markers, invalid config and unknown fields are refused generically, before CleanTalk runs.
  - Ordinary and exact-version paths are unchanged.
- **AC4 (last-block record, public shapes): met.** The `safety.test.ts` last-block test (option autoload off, no token, value, absolute path or callable stored, hook/priority/id callback shape) passed in the changed run. The early refusal record has no token and no marker value.
- **Closeout AC3, B's unit lane after the reboot:** 114/114 (`baseline-unit-after-reboot.log`). This was not rerun by this worker.

## Durable evidence (sanitized copies; worktree `artifacts/` and `runs/` are gitignored)
`implementation/evidence-u2/`:
- `compatibility-2026-10-05T15-53-28-960Z/`: red compound early-guard run.
- `compatibility-2026-10-05T15-57-03-643Z/`: first green run of the targeted compatibility subset. This run contains the one test-assertion failure described below.
- `compatibility-2026-10-05T16-05-07-359Z/`: green rerun of the early-boundary test after the assertion fix.
- `compatibility-2026-10-05T16-39-12-814Z/`: the full compatibility suite inside the changed run. `compatibility-notes.jsonl` holds every message, last-block and effect note cited above.
- `safety-…16-34-15-064Z/`, `adapters-…16-19-47-402Z/`, `core-…`, `forms-checker-…`, `harness-smoke-…`, `review-regressions-…`, `stack-harness-…`: the other plugin suites inside the changed run.
- `capture-test-2026-10-05T16-07-35.291Z/`: capture artifacts from the changed run, where the failures happened.

The whole folder, trace ZIPs included, was scanned with `findSecret` using PIRAX_HELPER_SIGNING_KEY, FORM_TEST_TOKEN, GRAVITY_FORMS_ZIP and FLUENT_FORMS_PRO_ZIP loaded by `bun --env-file`. It returned `[]`. No values were printed, and no `.env`, vendor or cache content was copied.

## Report
Changed files and reasons:
- `plugin/pirax-form-test/includes/compatibility.php`:
  - reflection-based `callback_owner()` with `PLUGIN_DIRS`;
  - `compatibility_facts()`, shared by the normal and early paths;
  - `block_message()`, which picks the version-only message only when no independent cause exists;
  - a non-removing `cleantalk_ajax_check_removable()`, so the early GF guard sees a wrapped or moved CleanTalk binding;
  - `public_callbacks()`, which keeps the hook/priority/id shape;
  - a private `write_block()` for the last-block option, which also covers the early GF refusal.
- `plugin/pirax-form-test/includes/marker.php`: `AWAITING_MESSAGE_PREFIX` beside `BLOCKED_MESSAGE`.
- `plugin/pirax-form-test/includes/gravity-forms.php`: GF postback and the early AJAX guard use the shared facts and message. The early guard reads no stored forms when GF is unaudited, and marker/config precedence is kept.
- `plugin/pirax-form-test/includes/fluent-forms.php`: the FF native gate returns the classified message.
- `test/plugin/compatibility.test.ts`: covers
  - native version-only cases for each audited plugin;
  - Inventory staying generic;
  - mixed-cause, multiple-label and rebound-wrapper cases;
  - reflection ownership;
  - the compound GF 3.1.3 plus wrapped/moved CleanTalk case;
  - early-refusal last-block privacy.
- `test/plugin/safety.test.ts`: last-block option privacy, autoload and shape for the new messages.
- `test/plugin/adapters.test.ts`: one added assertion that the adapter block's last-block record keeps the generic `BLOCKED` message.

Tests run (all with `bun --env-file=…/.env`, signing seed removed from children):
- Red: `bun test test/plugin/compatibility.test.ts -t <compound generic check>` gave **0 pass, 2 fail** (wrap and early both showed `awaiting audit of Gravity Forms 3.1.3`) (`worker-2-u2-red.log`).
- Green targeted: 7 compatibility tests gave **6 pass, 1 fail** (`worker-2-u2-green.log`).
  - The failure was a test defect: the privacy assertion checked that the block JSON did not contain `"Pirax"`, but that word is part of the block message itself.
  - The assertion was changed to check the posted marker value.
- Green boundary rerun: **1 pass, 0 fail** (`worker-2-u2-green-boundary.log`).
- Configured changed command (`AKROGON_BASE=2689aaa3bd69a9a46cc77788fdc5219354cc923a`, `: "${AKROGON_BASE:?…}" && bun test`) gave **237 pass, 13 fail**, 250 tests across 22 files, 2962.66s (`worker-2-u2-changed.log`).
  - All 13 failures are in `tests/capture.test.ts`. The first was a `/header-only-challenge` detail mismatch caused by `evaluate: Target page, context or browser has been closed`. The other 12 were `browser.newContext: Target page, context or browser has been closed`.
  - It started at 18:07:34, after the last code edit (18:05:00), so it covers the committed code.
- Isolated check at the committed code: `bun test tests/capture.test.ts` gave **22 pass, 0 fail**, 42.09s, exit 0 (`worker-2-u2-capture-isolated.log`).
- `git diff --check` is clean. No code changed after the changed run, so nothing was repeated.

Known limitations:
- The configured broad run is not green: 13 `tests/capture.test.ts` browser-closed failures. They are outside unit 2 ownership (`src/capture.ts` and `tests/capture.test.ts` are untouched) and were not patched. They look environmental:
  - the file passes 22/22 in isolation;
  - B's unit lane passes 114/114 after the reboot;
  - unit 1's overlapping changed run hit the same error (8 failures).
- An early GF request that arrives before the plugin loads is still subject to the documented early-guard limitation. That limitation is unchanged.
- The commit is on a detached HEAD; integration is left to B.

Unverified criteria:
- An all-green configured changed run is unverified, because of the 13 capture.test.ts failures above.
- B's lane subset was not rerun by this worker; it relies on B's `baseline-unit-after-reboot.log` (114/114).
- All other unit 2 criteria are verified natively.
