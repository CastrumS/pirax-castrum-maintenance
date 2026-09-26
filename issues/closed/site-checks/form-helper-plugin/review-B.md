# Review B — form-helper-plugin

**Verdict: fix** — two reproduced defects. No peer review was read or contacted.

- Base: `93cf3b7f6b99f3a34be7f69c004345c439fa6a76`
- Reviewed head: `2e2105c37b199065a311b16ffc5797799fc50253`
- Worktree: `/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/worktrees/form-helper-plugin`
- Reviewed contracts: authoritative design/plan (including implementation notes), implementation report, production PHP/build, native harness/tests and affected human documentation.
- Effective `checks: {}` / `advisory: []`. Reused the unchanged head's recorded full-suite result: **36 pass, 0 fail, 661 expectations**. Ran targeted native probes for the specific concerns below instead of repeating that suite.

## Fixes

### F1 — P1: WordPress accepts Cc/Bcc headers the filter leaves intact

**Location:** `plugin/pirax-form-test/includes/mail.php:24–38`, especially the raw-line recipient-header regex at line 38; `guard_mail()` at lines 58–72 repeats the same transformation and therefore does not catch the discrepancy.

**Contract:** brief mail-rewriting requirement and done-criterion 1; plan **AC2 / D5** require the configured redirect to be the sole recipient and all Cc/Bcc headers to be removed. The packaged README's Marker and mail contract makes the same claim.

`transform_mail()` unfolds only SP/TAB continuations and matches `Cc`/`Bcc` at the start of the remaining unnormalized line. WordPress later trims the parsed header name. Consequently these headers survive the helper and its guard but become real recipients in WordPress's ordinary downstream parser:

```php
[
    chr(11) . 'Cc: cc@client.test',
    chr(0) . 'Bcc: bcc@client.test',
]
```

**Native reproduction:** installed the reviewed ZIP through real wp-admin, configured the token/redirect, entered the marked context with `Pirax\FormTest\mark('abc123')`, and called actual `wp_mail()` with those headers. Removed only the harness's PHP_INT_MAX `pre_wp_mail` short circuit, leaving the production guard installed. A test-only `phpmailer_init` observer captured the effective envelope and threw **before any transport/send**, so no mail was delivered.

Observed envelope:

```json
{
  "to": [["review-tests@operator.test", ""]],
  "cc": [["cc@client.test", ""]],
  "bcc": [["bcc@client.test", ""]]
}
```

The probe's `sent: false` is from the deliberate pre-send observer exception, **not** a rejection by the helper. This defect does not need another mail plugin to rewrite recipients after the guard; core WordPress itself interprets the retained lines as Cc/Bcc.

**Required repair/evidence:** normalize or reject header names according to the recipient interpretation WordPress will apply before matching/removing them, while preserving legitimate non-recipient headers. Add a regression that inspects the native effective To/Cc/Bcc envelope without sending, covering both header strings and arrays/control-prefixed names. The current `pre_wp_mail`-only observer stops before this behavior and cannot prove the sole-recipient guarantee for such inputs. Expected: redirect-only To, empty Cc and Bcc, ordinary mail unchanged.

### F2 — P2: FF recovery depends on the current form schema, so renaming a field strands old test entries

**Location:** `plugin/pirax-form-test/includes/cleanup.php:149–153`, especially `ff_field_values($form, json_decode($row->response, true))`; that helper at `includes/fluent-forms.php:52–54` intersects stored response keys with the **current** form inputs.

**Contract:** brief done-criterion 4 and plan **AC7 / D9** require the sweep to delete entries containing the configured token that are older than one hour, matching decoded stored submission values. The README's Scheduled recovery sweep describes the same behavior without a current-schema dependency.

If an operator renames/removes the field containing the marker after the entry was stored, its historical response key is no longer in `FormFieldsParser::getInputs($form)`. The literal token is still in the stored response and the SQL candidate query finds the row, but the intersection removes that value before the authoritative match. Every subsequent sweep leaves it behind.

**Native reproduction:** using the real FF fixture form and submission table, seeded a two-hour-old response with `message: <configured-token>-abc123` and ran the real `pirax_form_test_sweep` event through `wp-cron.php`. That positive control was deleted. Then seeded an equivalent old entry, renamed the form input's `attributes.name` from `message` to `renamed_message`, and ran the same real cron event. The old marked entry survived.

```json
{
  "sweepControlDeleted": true,
  "formRename": 1,
  "sweepEntryRetainedAfterFieldRename": true
}
```

**Required repair/evidence:** match the field values stored with the historical submission independently of subsequent form edits; retain literal-token, age, non-field metadata/source-URL exclusions and native deletion/queue protections. Add a native sweep regression with a renamed or removed field and a non-token control. Expected: the old marked response is removed, ordinary/young entries remain. Do not merely document indefinite retention as supported behavior. Remove the current-schema helper if it has no callers after the repair rather than retaining a redundant abstraction.

## Verification and evidence

Presence-only credential check reported both `GRAVITY_FORMS_ZIP` and `FORM_TEST_TOKEN` present. No environment file was opened/printed/edited and no credential value was printed.

Targeted command:

```sh
bun --env-file=/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/.env \
  .cache/review-B-probes.ts
```

The temporary probe is ignored worktree code, not a production change. It uses the existing real Playground/Playwright harness and uploads the unchanged reviewed ZIP. The complete final output is preserved as **`review-B-evidence.json`** beside this review. Runtime versions were GF 3.1.2, FF 6.2.14, WordPress 7.1.2, PHP 8.3.

Final targeted run artifacts:

```text
artifacts/plugin/review-B-probes-2026-09-25T16-05-29-209Z/
  review-results.json
  review-B-install.trace.zip
  manifest.json
  network.jsonl
  mail.jsonl
  feeds.jsonl
  entries.json
  playground.log
```

Secret scan: **0 hits** for the configured token/licensed ZIP path. The first probe iteration stopped because its deliberately thrown pre-send observer exception was not caught inside the probe; the corrected probe catches it locally and records the envelope. No plugin code changed between iterations.

Additional checks:

- `git diff --check <base>..HEAD`: success, no output.
- `git status --short`: empty; reviewed head unchanged.
- ZIP SHA-256 still `d14c2acd37026b27637f9afd4adb6f7e58680b18d1e8c6082e383427f4a14002`, matching the implementation report.
- No changed/deleted `AREA.md`, so no AREA path audit applies.
- Root README, packaged plugin README, test README and the new history case were read. Relevant mail/sweep documentation is contradicted by F1/F2; keep those guarantees by fixing implementation/tests rather than weakening them. Other stated boundaries (exact versions, native queue differences, SMTP/IMAP not verified, cron timing) are explicit.
- The historical async-classification lesson's cited queue/mail/entry evidence exists, and its corresponding native tests/report substantiate the case. `learnings/LESSONS.md` was not used as review input.

## Other scope assessment

The implementation uses actual WordPress authorization/nonces and native GF/FF processing; the mail/siteverify test boundaries do not mock the unit under test. The unchanged full suite provides substantial positive/negative, queue, CAPTCHA and cleanup coverage, but its header observation and unchanged-schema sweep fixtures miss the two reproduced behaviors above.

The documented GF queue check/update race, unsupported site combinations, legacy queue payload fallback, minimum runtime versions and live delivery limitations remain open as reported; they are not additional speculative Fixes in this verdict. No style-only/Nit findings are used to open repair.

A reusable review lesson about downstream header normalization versus argument-only assertions was written to the **registered checkout**, left uncommitted for the operator:

- `learnings/history/2026-09-25-form-helper-plugin-review-b.md`
- One mechanism/date/history line added to registered `learnings/LESSONS.md`.

No tracked worktree code, documentation or tests were edited during this review. Request `check.fix` for F1 and F2.
