# Worker 7: review round 1 repair (A F1, B F1, B F2, A N1, A N2)

- Worktree: `/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/worktrees/form-helper-plugin`, from head `2e2105c37b199065a311b16ffc5797799fc50253`. Nothing committed. No lifecycle commands, no full suite.
- Credentials were loaded only with `bun --env-file=<registered-root>/.env`. No `.env` file was opened, printed or edited. Captured logs were redacted for the token before being read, and every artifact directory below scans 0 hits for the token and the GF ZIP path.

## Finding dispositions

### A F1: plain `bun test` timed out (fixed)

- **Red.** I reused A's recorded red: the plain core command failed with 3 tests at 5000 ms plus the closeBrowser cascade, 5 pass / 4 fail. I then reproduced the same red with the literal targeted command.
- **Mismatch with the brief's suggestion.** The brief suggests a root `bunfig.toml` `[test] timeout = 180000`. Bun 1.4.2 ignores that key. I tried it and got the same 5000 ms failures. I then tried a bunfig `[test] preload` that calls `setDefaultTimeout(180_000)`. Probes in a temp directory showed that Bun 1.4.2 applies `setDefaultTimeout` only to the file that calls it: a preload or shared module covered one file of two/three, and a per-file call covered all of them. I used the literal targeted command against both bunfig variants:
  ```text
  (fail) wp_mail in marked context is redirected, stripped and tagged; ordinary mail is untouched [5000.12ms]
    ^ this test timed out after 5000ms.
  (fail) a bad redirect fails before marking and marked mail is never delivered to original recipients [5000.00ms]
  (fail) the core never marks a request from query strings, cookies or arbitrary POST data [5000.00ms]
  error: stop: Target page, context or browser has been closed   (core.test.ts:427 cascade)
   7 pass
   4 fail
  Ran 11 tests across 2 files. [136.47s]
  ```
- **Fix, the brief's allowed "equivalent".** Each of the 5 suites (`harness`, `core`, `adapters`, `safety`, `review-regressions`) calls `setDefaultTimeout(180_000)` at module scope. The explicit longer hook/test timeouts are unchanged. I removed the bunfig/preload attempt, so there is no `bunfig.toml`.
  - `package.json` `test:plugin` is now plain `bun test test/plugin`; it previously had `--timeout 600000`. Every hook/test that needs more than 180 s already has an explicit timeout.
  - I removed `--timeout 180000` from the suite header comments and from `test/plugin/README.md`. The README's plain-`bun test` claim is now true, and it explains the per-file default and that a new suite must set it too.
- **Green.** Final green below, with no timeout flag.

### B F1: control-padded Cc/Bcc survived into the native envelope (fixed)

- **Root cause.** `transform_mail()` matched raw lines with `^(?:resent-)?(?:to|cc|bcc)\s*:`. `wp_mail()` reads a header name as `trim(explode(':', trim($header), 2)[0])`, and PHP `trim` strips `\0` and `\x0B`.
- **Fix.** In the shared `transform_mail()`, the recipient/correlation filter now computes the name exactly that way and drops `to|cc|bcc|resent-*|x-pirax-form-test` names.
  - `guard_mail()` re-runs the same function, so the production PHP_INT_MIN guard now also refuses a later filter that appends a padded Bcc.
  - Folded-line unfolding and idempotence are unchanged. Lines that are kept stay byte-identical, and body/attachments are untouched.
- **Regression.** `review-regressions.test.ts` test 1. It removes only the harness PHP_INT_MAX `pre_wp_mail` observer, asserts that the production guard is still registered at PHP_INT_MIN, and records `getTo/Cc/BccAddresses`, From, Reply-To, Subject and custom header names in `phpmailer_init`. The observer then throws `PHPMailer\Exception`, which the test catches around `wp_mail`, so nothing reaches a transport. Cases covered:
  - an ordinary control that keeps padded Cc/Bcc;
  - marked array headers and marked string headers, each with `chr(11)Cc`, `chr(0)Bcc`, `Cc chr(11):`, `chr(11)To` and `\r\nBcc`, plus From/Reply-To/X-Keep;
  - idempotence, with a single tag even after `chr(11)X-Pirax-Form-Test: evil`;
  - a later PHP_INT_MAX `wp_mail` filter that appends `chr(11)Bcc`. Expected: `sent: false`, `wp_mail_failed` `pirax_form_test_mail`, no envelope.
- **Red** (before the fix, redacted):
  ```text
  error: expect(received).toMatchObject(expected)        review-regressions.test.ts:85 (marked array headers)
  -     "bcc": [],
  -     "cc": [],
  +     "bcc": [ "bcc@client.test" ],
  +     "cc": [ "cc@client.test" ],
        "headers": [
  +       "To",
  (fail) marked wp_mail: control-prefixed Cc/Bcc header names never reach the native envelope; ordinary mail keeps them [1702.78ms]
  ```
  That run also showed that `array_keys(getReplyToAddresses())` returns `[0]` on this PHPMailer. That was an observer defect in my test, not in the product, so the test now reads addresses from the entries.

### B F2: the FF sweep depended on the current form schema (fixed)

- **Root cause.** `sweep_ff()` intersected the stored `response` with `FormFieldsParser::getInputs()` of the *current* form, and it skipped rows whose form no longer exists.
- **FF 6.2.14 source.** `SubmissionHandlerService::prepareHandler` stores `array_intersect_key($formData, fields + Helper::getWhiteListedFields($formId))`. So the stored response is the historical field values plus FF's whitelisted request metadata: `_wp_http_referer`, nonce, CAPTCHA responses, embed post id, payment/CleanTalk tokens.
- **Fix.**
  - The sweep decodes the stored response and removes only `Helper::getWhiteListedFields(form_id)` keys, which is metadata and independent of form edits. It then matches values literally with `values_contain`.
  - Malformed JSON matches nothing and the cursor moves on.
  - The form lookup is gone, and `ff_expire()` (queue protections, native `deleteEntries`) is unchanged.
  - `ff_field_values()` had exactly one caller (grep), so I deleted it from `fluent-forms.php`. `ff_detect` never used it.
- **Regression.** `review-regressions.test.ts` test 2. It seeds FF rows natively, 2 h old unless noted, then renames the `message` field to `renamed_message` and removes the `email` field. It asserts through `FormFieldsParser::getInputs` that the schema really changed, then runs the real `pirax_form_test_sweep` through `wp-cron.php`. Expected results:
  - Deleted: `renamedOld` (with a pending queued job), `removedOld`, `nestedRenamedOld`. Their meta rows cascade, their FF job rows are gone, and the AS pending count drops by 1.
  - Kept: `malformedOld`, `activeRenamedOld` (processing job touched now), `renamedYoung` (30 min), `ordinaryOld` (pending job kept), `metadataOnlyOld` (token only in `_wp_http_referer`, `__fluent_form_embded_post_id` and `source_url`), `keyOnlyOld` (token only as a key).
  - A repeated sweep is a no-op, and the artifact scan has no token.
- **Red** (before the fix):
  ```text
  error: expect(received).toEqual(expected)               review-regressions.test.ts:164
  +   "nestedRenamedOld",
  +   "removedOld",
  +   "renamedOld",
  (fail) hourly sweep deletes old FF test entries whose marker field was later renamed or removed; controls stay [5785.03ms]
   0 pass
   2 fail
  Ran 2 tests across 1 file. [38.83s]
  ```

### A N1: conditional module loading (fixed)

`pirax-form-test.php` now does a plain `require_once` for `compatibility`, `gravity-forms`, `fluent-forms` and `cleanup`. The `is_readable` loop and its header comment are replaced by a note that a damaged package fails loudly. The core test "generated ZIP uploads and activates … without Gravity Forms or Fluent Forms" still passes, so the adapters' own absent-plugin guards hold.

### A N2: history case outdated / evidence not durable (fixed)

The original case in `learnings/history/2026-09-25-form-helper-plugin.md` is unchanged. I appended a dated "Follow-up — 2026-09-26" section covering:
- the job-payload id stamping (read first) and the entry-meta fallback;
- worker 6's reproduced unredirected-mail race;
- a self-contained summary of the observed states, from worker-3.md and worker-6.md only;
- the immutable commit `2e2105c3…` and the two tracked regression test names in `adapters.test.ts` and `safety.test.ts`.

## Changed files and reasons

- `plugin/pirax-form-test/includes/mail.php`: header-name matching now matches how `wp_mail()` reads names (B F1). Doc comment updated.
- `plugin/pirax-form-test/includes/cleanup.php`: the FF sweep matches stored values minus FF's metadata whitelist, with no current-schema or form-existence dependency (B F2).
- `plugin/pirax-form-test/includes/fluent-forms.php`: deleted the now-unused `ff_field_values()` (B F2).
- `plugin/pirax-form-test/pirax-form-test.php`: unconditional module requires (A N1).
- `plugin/pirax-form-test/README.md`: the mail contract names padded/control-character header names, and the sweep says renamed/removed FF fields don't strand entries. No claims were weakened.
- `test/plugin/review-regressions.test.ts` (new, 176 lines): the B F1/F2 native regressions.
- `test/plugin/{harness,core,adapters,safety}.test.ts`: `setDefaultTimeout(180_000)` per file; `--timeout` removed from header comments (A F1).
- `package.json`: `test:plugin` no longer passes `--timeout` (A F1).
- `test/plugin/README.md`: the timeout explanation, the phpmailer_init envelope double, and a new suite row (A F1, B F1).
- `learnings/history/2026-09-25-form-helper-plugin.md`: the appended follow-up (A N2).
- The build allowlist is unchanged; the new/changed test files live outside `plugin/`. The core test re-asserted the exact ZIP file list. New `dist/pirax-form-test.zip` sha256: `d7b1d5ea3fb21f68694eb3c89aae4e9a2bb9be8bb37eb3467523198675e7bcdd`.

## Tests run

1. Red regressions, before any fix: `bun --env-file=<root>/.env test test/plugin/review-regressions.test.ts` gave 0 pass / 2 fail (excerpts above). Artifacts: `artifacts/plugin/review-regressions-2026-09-26T08-52-59-469Z/`.
2. Timeout red with the bunfig attempts, via the literal targeted command: 7 pass / 4 fail both times (excerpt above). The regressions were already green in those runs. Artifacts: `core-2026-09-26T08-55-51-432Z`, `core-2026-09-26T08-58-55-723Z`, `review-regressions-2026-09-26T08-55-07-261Z`, `review-regressions-2026-09-26T08-58-11-698Z`.
3. **Final green.** The literal targeted command, with no timeout flag and exit 0:
   ```sh
   AKROGON_BASE=93cf3b7f6b99f3a34be7f69c004345c439fa6a76 bun --env-file=/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/.env test test/plugin/core.test.ts test/plugin/review-regressions.test.ts
   ```
   ```text
   bun test v1.4.2 (744846f84)
    11 pass
    0 fail
    158 expect() calls
   Ran 11 tests across 2 files. [149.43s]
   ```
   Artifacts: `artifacts/plugin/core-2026-09-26T09-03-25-866Z/` and `artifacts/plugin/review-regressions-2026-09-26T09-02-40-981Z/` (entries.json, feeds.jsonl, mail.jsonl, manifest.json, network.jsonl, playground.log, review-regressions-install.trace.zip).
4. **Secret scan.** `findSecret` over all 7 directories above, with the token and GF ZIP path, gave 0 hits each.
5. **Other checks.**
   - Bun transpile of all 5 suites: ok.
   - `git diff --check`: clean.
   - Bun probes of `setDefaultTimeout` scope in a temp directory: bunfig `timeout` ignored; preload/shared module covers one file; a per-file call covers all.

## Known limitations

- The per-file default timeout depends on each suite calling `setDefaultTimeout`, because Bun 1.4.2 has no working repository-wide setting. The README says a new suite must add it; a suite that forgets it fails loudly at 5 s rather than hiding anything.
- `harness.test.ts`, `adapters.test.ts` and `safety.test.ts` were changed only by the timeout line and comment. Per the brief, I transpile-checked them but did not run them. B's literal full `bun --env-file=<root>/.env test` is the check for them.
- If a site filter (`fluentform/white_listed_fields`) whitelists a real field name, that field is treated as metadata and not matched. This matches FF's own semantics for that list.
- The GF sweep was not touched; it already reads stored entry values.

## Unverified criteria

- Criterion 1's full literal `bun --env-file=<root>/.env test` across all suites: not run by me (brief: B owns it). The targeted command is green without a timeout flag.
