# Worker 3 report: release and test documentation

- **Worktree:** `/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/worktrees/helper-compat` (branch `helper-compat`).
- **Not committed.**
- **Documentation only.** No production code, tests, `src/**`, sites, dependencies or `.env*` were touched. All of units 1 and 2's landed changes are kept.
- **Facts cross-checked** against the landed sources (`includes/compatibility.php`, `settings.php`, `harness.ts` diff, `compatibility.test.ts`, `stack-harness.test.ts`, `harness.test.ts`, `test/forms/harness.ts`), the two worker reports and the plan's implementation notes.

## Changed files and reasons

### `plugin/pirax-form-test/README.md` (criteria 1–2)

**Supported versions.** This section now states version 0.2.0 and has an exact-pin table:

| Plugin | Pin | Applies to |
|---|---|---|
| GF | 3.1.2 | GF |
| FF free | 6.2.14 | FF |
| FF Pro | 6.2.14 | FF |
| CleanTalk | 6.88 | GF and FF |
| FluentSMTP | 2.4.0 | GF and FF |

- Absent optional plugins are optional.
- Any other version fails closed, with examples FluentSMTP 2.4.1 and CleanTalk 6.88.1. It states "2.4.0 … not 2.4.x".
- An unreadable version counts as not audited.

**Fail-closed list:**
- Adds version failure, GF `_<form id>` variants, and an unrecognized or unremovable CleanTalk binding.
- **Removed the stale "Examples: FF Pro, …" wording.** It is replaced by "FF Pro modules not listed below (Inventory, Post/CPT, payments, user registration, AffiliateWP)".
- Adds "FF Pro itself does not block…".
- Unaudited custom forms and Pro modules stay unsupported.
- Payment, non-`form` and GF post-field exclusions are unchanged.

**New "Suppressed for marked submissions only" block:**
- Removal by identity and priority is marked-only and verified. It is rechecked at GF 998 / FF 9 and restored for ordinary submissions in the same request.
- A table of the 7 bindings, with owner, hook, priority and effect.
- FF disabled-check vs. unrecognizable-binding rule.
- CleanTalk GF bindings are public-request only.
- No option changes and no fake approval.
- The Pro WebHook is removed before enqueue.

**New "CleanTalk browser traffic is not suppressed" paragraph:**
- CleanTalk's bot detector, telemetry and the `/wp-json/cleantalk-antispam/v1/check_email_before_post` → `api.cleantalk.org` pre-check happen before the marked POST.
- On live sites CleanTalk still receives the checker's email address.
- The checker places the marker in a text field. This is explicitly *not* a guarantee against a marker typed by hand into an email field.

**FluentSMTP.** It is a version pin only. Mail changes run inside its replacement `wp_mail()`.

**New "Compatibility panel" section:**
- rows, one verdict and all unaudited callbacks;
- escaped, and admin only (`manage_options`);
- no JS, endpoint, toggle, persistence or mutation;
- what `ready` covers: payment/post forms, marker, CAPTCHA, public-only or later callbacks, and delivery are excluded, and submission-time checks decide.

**Rollout.** Points to the panel as a diagnostic, not a rollout approval. Adds Pro/CleanTalk/FluentSMTP to the "differs from audited set" sentence.

**Limitations:**
- "After `wp_mail`" is narrowed to the FluentSMTP 2.4.0 simulated evidence (envelope and Simulator log). It excludes other versions, providers and real delivery.
- New "Late re-registration" limit: a re-registration after the guard in the same dispatch, or on another hook later, is not caught. Restore order is only guaranteed for the audited stack.
- The delivery bullet now mentions the Simulator.

Queue/cleanup, sweep and rollout-stage text is otherwise unchanged.

### `test/plugin/README.md` (criterion 3)

**Intro:**
- names the two full-stack suites;
- the doubles paragraph now says the full stack passes mail to the Simulator and uses a test-only HTTP transport;
- the Simulator is "not delivery either".

**Prerequisites:**
- Network fetch and `Version` check of CleanTalk 6.88 and FluentSMTP 2.4.0, and the pin list.
- The Pro version is read from the licensed ZIP and must be 6.2.14.

**Credentials:**
- The `FLUENT_FORMS_PRO_ZIP` row (fluentforms.com → account → Downloads), needed by `stack-harness` and `compatibility`, which `test:plugin` and `bun test` include.
- "two variables" is replaced by "these variables", and "missing or invalid".
- Node gets licensed paths through its environment only, and the Pro path only on the full stack. No licensed path goes on argv, because `unzip` reads the ZIP from stdin.

**Suites:**
- Rows for `stack-harness.test.ts` and `compatibility.test.ts`.
- The `harness.test.ts` row covers the full-stack preflight with synthetic inputs and the default stack's exact versions/ZIPs.
- A paragraph on the `core.test.ts` panel test (hostile `<script>` mu-plugin filename, render snapshot, roles) and the `safety.test.ts` exact-string matrix.
- **Budget:** from the last green artifact timestamps (worker 2), about 8 min for compatibility, about 1.5 min for stack-harness, and about 25 min for the whole plugin suite. It replaces "roughly 10 minutes".

**Harness.** Adds `compatibility: true`, the new mu-plugin fixtures (`ct_rebind`, `ct_late`, `render_probe`, `pirax_harness_ff_pro_feature`), the `activations.jsonl` ledger, and that the mu-plugin is written before plugin installs.

**New "Full compatibility stack" section:**
- **Setup:** Simulator constant, CleanTalk HTTP mode, seeded server, redirect consumption, Pro webhook feed.
- **Transport containment:** explicitly says CleanTalk calls Requests directly and bypasses `pre_http_request`, even in its WP API mode. It covers only Requests-level PHP HTTP and the browser. Raw cURL/sockets bypass it, so this is "not a general network sandbox". The direct fallback trigger and the asserted builtin mode are documented, as is the fact that exploratory runs before containment did reach CleanTalk.
- **Mail:** separate `h.mail()` / `h.envelopes()` / `h.simulator()` views. Passthrough is gated. This is not SMTP/IMAP delivery, other providers or other 2.4.x.
- **Readers:** the additive API, `h.http()` fields and hook-based separation, and the exact REST-path exclusion of CleanTalk's browser pre-check.
- **Wrong-version fixtures:** the in-place edit, fresh requests, restore and SHA-256 equality, with hashes in `compatibility-notes.jsonl`.
- **"Callback audit" table:** hook / identity / priority / owner+version / disposition / vendor source for all 7 bindings. Also the other dispositions: Pro WebHook narrowed, FluentSMTP pin-only, CleanTalk generic paths, and the still-blocking Pro modules.
- `compatibility.php`'s docblock already points to this README for the audit.

**Evidence and privacy:**
- The manifest row covers Pro, CleanTalk and FluentSMTP versions and all five ZIP hashes.
- Rows for `http.jsonl`/`envelopes.jsonl`/`simulator.jsonl` (full stack only) and `compatibility-notes.jsonl`.
- Redaction covers the token and **both** licensed paths.
- New note: redaction does not cover runner output, and credential-bearing test subjects use synthetic inputs.

### Root `README.md` (criterion 4)

**Plugin section:**
- `test:plugin` includes the full stack.
- Prerequisites list `GRAVITY_FORMS_ZIP`, `FLUENT_FORMS_PRO_ZIP` and `FORM_TEST_TOKEN`.
- The exact tested stack (simulated sending only).

**Commands table, full-suite row:**
- The budget is "about 35 minutes" (worker 2 green: 1953.63 s). It replaces 20–30.
- It needs the licensed GF **and** Fluent Forms Pro ZIPs.
- New factual prerequisite: run `bun run build:plugin` first on a clean checkout, because `test/forms/harness.ts:61` uploads the existing `dist/pirax-form-test.zip`. This is the order-dependent failure that unit 1's red run hit. It documents existing behavior and does not change it.

**Forms/mail configuration table.** New `FLUENT_FORMS_PRO_ZIP` row, using the same wording style as `GRAVITY_FORMS_ZIP`.

Checker behavior claims and links are unchanged. The new anchors `#supported-versions-and-behaviour`, `#compatibility-panel` and `#full-compatibility-stack` match their headings.

### Lessons (criterion 5)

- **`learnings/history/2026-09-28-helper-compat-credential-assertions.md` (new).** Case: a failing `toThrow` printed the preflight return value, which held the real GF path once in the `/tmp` red log. Evidence: the log was scrubbed with `redact()`, 0 `findSecret` hits elsewhere, and the synthetic stand-in fixture in `harness.test.ts`. It points to worker-1.md and the plan note. No secret value is recorded.
- **`learnings/LESSONS.md`:** one appended active line, dated 2026-09-28, naming the mechanism and linking the history file. Existing entries were not reworked, and no old history was opened.

## Stale wording eliminated

- "Examples: FF Pro, …" as a blanket blocker (plugin README).
- The two-version-only support sentence (GF/FF only).
- The unqualified "After `wp_mail`" limitation, now scoped to the FluentSMTP 2.4.0 simulation.
- "The harness needs two environment variables", and "Network access … fetch WordPress 7.1.2 and Fluent Forms 6.2.14" only.
- "Budget roughly 10 minutes for the whole plugin suite".
- "redacted for the token and the GF ZIP path".
- Manifest "SHA-256 of both form-plugin ZIPs" (now plus all five on the full stack).
- Root "plugin suites need `GRAVITY_FORMS_ZIP` and `FORM_TEST_TOKEN`", "budget 20–30 minutes" and "Needs licensed GF ZIP".

A grep for `20–30`, `10 minutes`, `two environment` and "FF Pro" examples in the three guides found no remaining stale hits. The `10–15 minutes` in `test/forms/README.md` is the forms suite's own budget and is unaffected.

## Tests run

Resolved changed-tests command, exactly as in the brief (Bun loads the worktree `.env` itself; values were never printed):

```sh
AKROGON_BASE=e2075daad1c5b0dd2438ff61d71e606c47819a39 bash -c ': "${AKROGON_BASE:?AKROGON_BASE is required}" && bun test'
```

Result: **failed**. `237 pass, 2 fail, 2953 expect() calls, Ran 239 tests across 22 files [1896.00s]`.
- **Log:** sanitized output at `implementation/worker-3-tests-current.log` in this leaf.
- **Exit status is missing.** The run was started from this worker's earlier session. That session ended mid-run, the wrapping shell died, and the `echo exit` line was never written. The orphaned `bun test` process (pid 982328) kept running to completion. Bun exits non-zero when any test fails, so the command did not pass.
- **Both failures are in `test/forms/browser.test.ts`,** a forms-checker suite whose code (`src/**`, `test/forms/**`) this leaf does not change:
  1. `no-marker/unknown/upload requires no credentials; opted-in IMAP preflight happens before POST`: the `scanPageForms('/plain')` promise resolved instead of rejecting with `IMAP_HOST`.
  2. `encoded URLs and browser exceptions are scrubbed from retained action traces`: `browser.newContext` failed because the target page, context or browser had been closed.
- **Unconfirmed hypothesis:** the shared Chromium was closed from outside around the time the session ended. That would explain both failures. It is **not** confirmed.
- All 22 other files passed in this run, including every plugin suite (core, adapters, safety, review-regressions, harness, stack-harness, compatibility) with unit 1–2 code plus these docs.

**Targeted diagnostic.** One file only, not a suite rerun, after the full run ended: `bun test test/forms/browser.test.ts` from the worktree gave exit 0, `20 pass, 0 fail, Ran 20 tests across 1 file [81.07s]`. The log is `/tmp/hc-evidence-3-browser.log`. A name-only check for the token, both licensed ZIP paths and the IMAP/SMTP passwords found 0 hits. Worker 2's green run also passed this file on the same non-doc code.

The configured command itself has **no passing run** since the docs changed. B's final blocking full-suite run decides.

`git diff --check`: clean. No tests were added for prose.

## Known limitations

- **Budgets are estimates** from worker 2's green run (artifact timestamps and total time), not a separate timing run. This run took 1896 s in total.
- **Vendor source line numbers** in the audit tables are copied from worker 2's report. I did not re-inspect the vendor ZIPs, because the licensed sources are not in scope for a docs unit.
- **Behavior limits carried from units 1 and 2** are documented, not resolved:
  - Requests-only PHP containment (raw sockets/cURL);
  - CleanTalk's browser pre-check and telemetry on live sites;
  - no late re-registration after the guard in the same dispatch;
  - restore order only guaranteed for the audited stack;
  - simulated FluentSMTP 2.4.0 only, with no SMTP/IMAP delivery;
  - wrong-version native gates exercise one lookalike per plugin.
- **Plan/brief mismatch:** a literal `pre_http_request` proof is impossible for CleanTalk. The docs describe the Requests-boundary evidence instead.
- **Full-suite failure:** the configured command failed in 2 forms-browser tests (see Tests run). The cause is unconfirmed, and no code was edited.

## Operator-only action

Add the variable name `FLUENT_FORMS_PRO_ZIP` with an empty value to `.env.example` if it is not already listed. I did not read or edit it.

## Unverified criteria

- **Criterion 6, "documentation-only changes pass the resolved changed-tests command": not met by this run.** The configured command failed with 2 `test/forms/browser.test.ts` failures and no recorded exit status. That file then passed on its own targeted rerun (20/20). The cause of the in-suite failures is unverified; externally closed Chromium is only a hypothesis. B's final full suite decides.
- **Vendor line references and the runtime budgets** in the guides were taken from worker reports, not re-inspected or re-timed here. This run's total is 1896 s, consistent with the "about 35 minutes" root budget.
- **Carried from units 1–2 and documented, not resolved:** socket-level egress for PHP bypassing Requests is verified by construction only, and CleanTalk's browser pre-check still happens on marked visits.
- **`.env.example`** is operator-only (action above), not verified by me.
- **B's two plugin-guide corrections** (the CleanTalk exception to the spam-check sentence, and the scope of GF form-specific callback blocking) were made after my edits. They are preserved: I made no further edits to that file after them.
