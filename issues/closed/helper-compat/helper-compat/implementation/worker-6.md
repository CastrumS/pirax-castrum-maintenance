# Worker 6 — repair round 1 remainder (brief-6)

- Before-head: `aac43d6516b3cbb8f2187f1b98b49c36ac6ecef6`, with worker 5's eight-file uncommitted repair in place. That repair is preserved; this work adds to it. Nothing committed and no lifecycle command run.
- Plugin version is still 0.2.0. The ten-file ZIP allowlist is unchanged (the built ZIP holds the same 10 files).
- Out of scope and untouched: no `src/**`, sites, deployment, dependencies or client logs.
- No `.env*` file was opened. Credentials reached processes only through `bun --env-file=<registered>/.env`, and the scan prints names/counts only.

## What changed, per criterion

### Criterion 1 — ordinary fast path and GF version gate before any metadata read (fixed)

`gf_ajax_guard()` in `plugin/pirax-form-test/includes/gravity-forms.php` now works in this order:

1. **Unchanged preconditions.** It must be GF's modern AJAX route, CleanTalk must be present, and a token must be configured.
   - The `class_exists('GFFormsModel')` precondition was dropped. A missing GF core now counts as "not audited" in step 3 instead of silently skipping the guard.
2. **Helper-only candidate scan.** It runs `parse( gf_posted_values( array( 'fields' => array() ), true ) )`, which scans every GF field-shaped POST input (`input_<n>[_<m>]`) with this plugin's own code.
   - If there is no token, the request is ordinary and the guard returns.
   - No GF API is called on this path: no `rgpost`, `GFFormsModel::get_meta_table_name()`, `unserialize()` or DB query.
3. **Version gate for a token-bearing candidate.** `version_is_audited('gf', detected_version('gf'))` is checked first. It reads the static `GFForms::$version`, which is null when GF is missing.
   - Only for the audited GF does the guard then call `gf_stored_form()` (GF's metadata table and unserializer), check the stored-field scoping, and call `suppress_cleantalk_ajax_check()`.
   - For a missing or unaudited GF it goes straight to refusal.
4. **Refusal**, as before. The message comes from the candidate scan: invalid marker → marker message, then config message, else the blocked message. The response uses `GFCommon::send_json_error` when callable, otherwise `wp_send_json_error`.

Unchanged:
- field scoping by the POSTed `form_id` once the gate has passed;
- refusal of dynamic and unmatched fields;
- exact removal at priority 10 with verification;
- `parse()` and `gf_detect()`, and the late GF detection.

Two effects of computing the message from the candidate scan:
- When a stored-field marker and a different unmatched-field marker are both present, the request is still refused, but with the marker message instead of the blocked message.
- `GFCommon::send_json_error` is a response formatter, not a metadata API. It is still called (if callable) for an unaudited GF so GF's JavaScript shows the message. With GF missing, the guard falls back to `wp_send_json_error`.

### Criterion 2 — native evidence

New test-only fixtures in `test/plugin/mu-plugin.php`, all off by default:
- **`pirax_harness_gf_meta_probe`**: a read-only `query` filter. It logs each query touching `{prefix}gf_form_meta` during `plugins_loaded` to `gf-meta.jsonl`, keeping only the action and the request path. The query is returned unchanged.
- **`pirax_harness_gf_ajax_version`**: sets GF's runtime `GFForms::$version` on `plugin_loaded` right after GF's file loads, on admin-ajax requests only. No vendor method is replaced.
  - Why not alter the vendor file as the other version tests do: GF runs `gf_upgrade()->maybe_upgrade()` in `GFForms::init` on every non-AJAX request, including the harness's own `php()` calls. A changed on-disk version would therefore run GF's real upgrade and downgrade routines against the site DB.
  - The modern AJAX submission is `DOING_AJAX`, where GF skips that routine.
- **`pirax_harness_ct_skip_probe`**: logs CleanTalk's own `apbct_skipped_request` action to `ct-skips.jsonl`. It keeps only the file basename, function, line and reason, never the POST that action receives.
  - It was needed because CleanTalk's `ct_ajax_hook` skips admins before sending, so the HTTP ledger alone could not show whether the generic check was bound.

`compatibility.test.ts`:
- `gfAjaxSubmit` gained an optional `session`; the default is the visitor.
- New `probe(name)` reader for the two new ledgers.
- Two new tests.

**Test 1: "GF modern AJAX before GF initializes…"**

With the audited GF:
- the ordinary request made 0 early reads, confirmed, created an entry and sent the original mail, and CleanTalk's generic check ran for it;
- the marked request made exactly 1 read (the positive control), confirmed with one redirected mail, and sent no token-bearing HTTP.

With GF at 3.1.3 (runtime, AJAX-only):
- the marked request was refused with the blocked message, with 0 reads, no CleanTalk request, no entry and no mail;
- the ordinary request made 0 reads, confirmed, and kept the generic check.

**Test 2: "GF modern AJAX from a logged-in admin…"** uses the already authenticated `admin` session and toggles `cleantalk_settings.data__protect_logged_in`, restoring the original value afterwards.

| Protection | Submission | `ct_ajax_hook` ran? | Result |
|---|---|---|---|
| Off (0) | marked | no | confirmed, one redirected mail, no entry |
| Off (0) | ordinary | no | confirmed; entry, ledger feed and original mail kept |
| On (1) | marked | no (removed by the guard) | confirmed, one redirected mail, no entry |
| On (1) | ordinary | yes, then skipped (`cleantalk-ajax.php -> ct_ajax_hook():247(User is admin, editor, author)`) | confirmed; entry, ledger feed and original mail kept |

- Off: CleanTalk binds no generic check for a logged-in visitor.
- On: the check is bound, and CleanTalk's own skip for admins, editors and authors means there is no moderation request either way.
- In all four cases: 0 CleanTalk attempts and 0 token-bearing HTTP.

### Criterion 3 — precise wording (fixed)

- **`compatibility.php` `suppress_cleantalk_ajax_check()` doc.** "False (and nothing removed)" now applies only to the non-removing cases. The doc states that it can also return false after removing the priority-10 binding when another binding remains, and that the caller then refuses. The README refusal list gains "or a binding of it remains after the removal".
- **`gravity-forms.php` registration comment.** "wherever it was moved" is replaced by: any priority it was moved to, "unless that was registered earlier at PHP_INT_MIN itself", plus "Callbacks added after this runs are not rechecked." The guard's docblock describes the new order.
- **Plugin README "Suppressed for marked submissions only."** "removes again before dispatch / restores for the next ordinary submission" is now scoped to "these form-level bindings". It states that the generic AJAX check is removed once, early, and is neither removed again nor restored.
- **Plugin README GF modern AJAX bullet.**
  - It describes the helper-only scan, and that the GF audit check comes before any stored-form read.
  - It adds the same `PHP_INT_MIN` limit.
  - The refusal list now reads "GF is missing or not at its audited version (decided before any GF form API is called)".
- **Plugin README lifecycle paragraph.** Keeps the arbitrary-after-registration limit: code running after the early check that binds the check again (e.g. a later `plugins_loaded` callback at a later priority) is not rechecked.

### Criterion 4 — bootstrap claim (fixed)

Removed "The audit of CleanTalk 6.88 found no submission request there." The lifecycle paragraph now:
- discloses the known path: on admin requests (admin-ajax included), `cleantalk.php:801-807` calls `ct_contact_form_validate()`, which can send the POST, while its file loads, when `forms__general_contact_forms_test` is on and `your-phone` / `your-email` / `your-message` are non-empty (a Bitrix24 layout);
- states that GF's native inputs never use these names, and that the native tests of GF's field layout saw no CleanTalk request before the early check;
- states that a GF request that also carries those names would reach CleanTalk first, token included, and is not supported;
- says "Nothing else about CleanTalk's bootstrap is proven", and keeps the unknown-version limits and the version-pin caveat.

No bootstrap firewall was added.

### Criterion 5 — docs and scope

The test README gains:
- the new test coverage and the GF modern-AJAX version gate in the suite row;
- the three fixtures;
- the audit-row refusal conditions ("GF or CleanTalk is not the audited version (GF checked before the stored form is read)").

Version is still 0.2.0 and the allowlist is unchanged.

## Changed files and reasons

This round's additions are on top of worker 5's diff.
- `plugin/pirax-form-test/includes/gravity-forms.php`: guard order (helper-only scan → GF version gate → stored read and suppression), docblock, and registration comment (criteria 1 and 3).
- `plugin/pirax-form-test/includes/compatibility.php`: `suppress_cleantalk_ajax_check()` doc wording (criterion 3).
- `plugin/pirax-form-test/README.md`: restoration scope, modern AJAX order and limits, refusal list, bootstrap disclosure, and the after-registration limit (criteria 1, 3 and 4).
- `test/plugin/mu-plugin.php`: the three read-only or test-only fixtures above (criterion 2).
- `test/plugin/compatibility.test.ts`: `session` option, `probe()`, `gfMetaReads()` / `gfAjaxCounted()`, and the two new tests (criterion 2).
- `test/plugin/README.md`: suite row, fixtures and audit row (criterion 5).
- `harness.ts` and `stack-harness.test.ts` hold worker 5's changes only; this round did not touch them.

## Tests run

All logs are in this `implementation/` folder.

### Red (worker 5's guard; only the test and fixtures new)

`bun --env-file=<registered>/.env test test/plugin/compatibility.test.ts -t "before GF initializes|logged-in admin"` → **exit 1, 0 pass / 2 fail** (`worker-6-red.log`). The ZIP was built from worker 5's production code (sha256 in `worker-6-red.zip-sha256`, `b3b80bbe…`). Artifacts: `artifacts/plugin/compatibility-2026-09-28T19-53-18-046Z`.

- **Early-read test:** the ordinary modern AJAX request made `reads: 1`. The old guard ran the stored-form query before any version gate, even for ordinary input.
  - The GF 3.1.3 half was not reached in red, because the first assertion stopped the test.
  - The same pre-gate order is visible in the old code: `gf_stored_form()` ran before `suppress_cleantalk_ajax_check()` checked the GF version.
- **Logged-in test (first draft):** expected an ordinary moderation request with protection on, and got 0. This was an expectation error, not a defect: CleanTalk skips admins inside `ct_ajax_hook`.
  - Protection off passed all assertions.
  - The test was then changed to observe the binding through CleanTalk's skip action (`pirax_harness_ct_skip_probe`).

### Targeted green (final guard)

`bun --env-file=<registered>/.env test test/plugin/compatibility.test.ts -t "GF modern AJAX|at another version"` → **exit 0, 10 pass / 0 fail, 422.4 s** (`worker-6-green-compat.log`, ZIP sha256 `29f5e33d…` at the end of the log). Artifacts: `artifacts/plugin/compatibility-2026-09-28T19-56-21-381Z`.

The 10 tests: the 5 existing modern AJAX tests, the 2 new ones, and the 3 wrong-version gates (CleanTalk, Pro, FluentSMTP; postback and modern AJAX).

After this run, the only change was adding the skip reason to one evidence note (no assertion change). It was made before the full run started.

### Full changed-tests command

`AKROGON_BASE=e2075daad1c5b0dd2438ff61d71e606c47819a39 bash -c ': "${AKROGON_BASE:?AKROGON_BASE is required}" && bun test` was run as the child of a `bun --env-file=<registered>/.env --eval` wrapper. It started 22:03:49 (`worker-6-full-suite.start`) on the final code.

**Exit status: not recovered.**
- The wrapper, which was to print the exit code and write `worker-6-full-suite.exit`, died when the previous session ended. `worker-6-full-suite.exit` was never written.
- The `bun test` child (PID 1233617) kept running, reparented to systemd. I waited for it with `kill -0` polling; it ended at about 22:38:35.
- Its own summary line in `worker-6-full-suite.log` is **239 pass / 8 fail, 3086 expect() calls, 247 tests across 22 files, 2078.25 s**. bun exits non-zero when any test fails, but that exit code was not observed.

**The 8 failures are all in `tests/capture.test.ts`** (checker `src/capture.ts`; this leaf changes no `src/**`):
- one `TypeError: null is not an object (b.image.png)`;
- seven `async newContext: Target page, context or browser has been closed`.

They began at the run's first seconds (22:03:49), when the previous session's wrapper process was torn down.

**Diagnostic rerun:** `bun test tests/capture.test.ts` → **exit 0, 22 pass / 0 fail, 41.3 s** (`worker-6-capture-rerun.log`). I attribute the full-run failures to Chromium being closed during that teardown, not to this diff. The full run itself is not green, and B's final blocking run must confirm it.

All plugin suites passed in the full run, including all compatibility tests and the two new ones:
- Artifacts: `artifacts/plugin/compatibility-2026-09-28T20-26-25-424Z`, `stack-harness-2026-09-28T20-25-19-294Z`, `safety-2026-09-28T20-23-06-805Z`, `review-regressions-2026-09-28T20-22-20-185Z`.
- Forms evidence: `runs/forms-browser-e31c7a22-c33f-4f81-ace5-f0d79a82310f`, `runs/forms-playground-f0069476-428f-4ba6-905e-431d12b67775/summary.json`, `runs/forms-report-tests-9eb28a3e-1687-4e8a-bc5a-d959f233710b/summary.json`.

Full-run notes for the new tests are identical in substance to the targeted run:

| Step | Marked | Ordinary |
|---|---|---|
| Audited GF | confirmed, 1 read | confirmed, 0 reads, generic check ran |
| GF 3.1.3 | refused, 0 reads | confirmed, 0 reads, generic check ran |
| Logged in, protection 0 | confirmed, `ct_ajax_hook` not run | confirmed, `ct_ajax_hook` not run |
| Logged in, protection 1 | confirmed, `ct_ajax_hook` not run | confirmed, `ct_ajax_hook` ran and skipped (admin) |

Every step: 0 token-bearing HTTP.

### Other checks

- `bun run typecheck`: exit 0.
- `git diff --check`: exit 0.
- There is no local `php` binary, so the PHP was validated only by the native Playground runs above.

### Privacy (counts only, credentials through `--env-file`)

- 3 of 3 credential names present.
- Across 54 files (all `worker-6*` logs plus the four artifact dirs named above): 0 hits of any credential value, raw or URL-encoded, and 0 `X-Amz-Signature/Credential` markers.

Full-run `http.jsonl`:

| Suite | Records | `request` with query | `path` with query | `carriesToken` |
|---|---|---|---|---|
| compatibility | 105 | 0 | 0 | 1 |
| stack-harness | 9 | 0 | 0 | 0 |

The single `carriesToken` record is the intended ordinary positive control ("marker outside fields").

No test process is pending. PID 1233617 has exited, and no bun, Playwright or test Chromium process remains. The system `/opt/google/chrome` processes still running (some headless) were all started at 12:05, about ten hours before this unit began, and are parented to the user systemd. They are not from these runs and were left alone.

## Worker-5 statements superseded

- "The CleanTalk 6.88 audit found no submission send there" (Known limitations → Lifecycle). This is false as a general claim: see criterion 4.
- The flow in A-F1 and its early-initialization reasoning: the guard "reads the posted form's stored field ids … then classifies", calling `get_meta_table_name()` / `unserialize()` for every modern AJAX request. The stored read now happens only for token-bearing candidates under the audited GF.
- "Ordinary requests … are untouched": they are now also free of any GF API call or query in the guard.
- The guard's `class_exists('GFFormsModel')` early return: a token-bearing `gform_submit_form` with GF missing is now refused.
- Unverified criteria "logged-in visitors … source only" and "a non-3.1.2 GF on modern AJAX … not tested natively": both are now tested natively (above).
- Worker 5's "Final green" (245 pass, exit 0) predates these changes. It is not evidence for the final code.

## Known limitations

- **Pre-guard lifecycle.**
  - Anything before `plugins_loaded` `PHP_INT_MIN` is outside the proof: plugin file loading (including CleanTalk's admin-branch `ct_contact_form_validate()` for the Bitrix-like `your-phone` / `your-email` / `your-message` layout), `plugin_loaded`, and `plugins_loaded` callbacks registered earlier at `PHP_INT_MIN`.
  - The early refusal cannot undo what another CleanTalk version's bootstrap may have sent.
- **Post-guard.** The guard runs once. A binding that code running after it adds back at a later priority is not rechecked. Arbitrary PHP that adds a wrapper next to the intact original survives the exact removal.
- **Scope of classification.** Only GF field-shaped POST inputs (`input_<n>[_<m>]`) count.
  - The token in other POST names, the query or cookies is ordinary: CleanTalk's generic check runs and receives it (native positive control).
  - A token-bearing field that the stored form lacks (e.g. filter-added) is refused, not marked.
- **Refusal response for an unaudited GF.** It still uses GF's `GFCommon::send_json_error` formatter when callable (not a metadata API). A future GF could change how that response is shown.
- **GF version fixture.** It changes `GFForms::$version` at runtime on admin-ajax only. It proves the guard's gate, not the behaviour of a real different GF release.
- **Forced native `remove_action` failure.** Not executed. In WordPress 7.1.2, `remove_action` of a named function at its exact registered priority always removes it (`WP_Hook::remove_filter` builds the same `_wp_filter_build_unique_id`). The guard's remaining protection is the post-removal `has_action` check, which refuses if any binding remains. The "moved to priority 1" and "wrapped" tests exercise that branch natively.
- **Unchanged from worker 5:** browser pre-submit CleanTalk traffic (N1), and FluentSMTP logs keeping marked bodies.

## Unverified criteria

- **Criterion 5, full-suite exit status.** Not recovered: the wrapper died. The completed run's own summary is 239 pass / 8 fail, and all 8 failures are in `tests/capture.test.ts`, which passes 22/22 alone. A clean full-suite exit on the final code is therefore still unproven; B's final blocking run must establish it.
- **Criterion 1, missing GF core** (GF inactive while `gform_submit_form` carries the token). This follows from code reading (`detected_version('gf')` is null → not audited → refusal via `wp_send_json_error`). It was not exercised natively.
