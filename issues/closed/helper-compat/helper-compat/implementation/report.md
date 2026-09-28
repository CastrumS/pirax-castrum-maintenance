# helper-compat — implementation report

## Outcome and commits

Implemented and committed on `helper-compat`; ready for `check.review` with the explicit boundaries/mismatches below.

- Base / `AKROGON_BASE`: `e2075daad1c5b0dd2438ff61d71e606c47819a39`.
- Committed head: **`aac43d6516b3cbb8f2187f1b98b49c36ac6ecef6`** — `feat: audit helper compatibility and expose admin diagnostics`.
- 19 files changed; worktree clean after commit. No branch changes under `src/**`, `sites.yaml`, or `issues/**`; no environment files edited. No live-site rollout.
- Final B checks: **239 tests passed, 0 failed**, typecheck/build/diff checks passed, privacy scan **0 credential/path matches**.
- Deliverable: `dist/pirax-form-test.zip`, version **0.2.0**, the unchanged ten-file allowlist. Current ZIP SHA-256 after the suites rebuilt it: `4d6326dbf8a4d98e305dcf2e1cdc44291f4790b230609fb2b06f315328110311`.

## Changes and reasons

| File | Change / reason |
|---|---|
| `plugin/pirax-form-test/includes/compatibility.php` | Shared side-effect-free version/callback report, exact optional-plugin pins, GF form-specific hook inspection, and audited CleanTalk/Pro binding suppression with restoration. Keeps existing compatibility APIs and callback identities. |
| `plugin/pirax-form-test/includes/gravity-forms.php` | Prepare marked submissions before CleanTalk dispatch; recheck audited bindings immediately before their dispatch; ordinary work restores bindings. |
| `plugin/pirax-form-test/includes/fluent-forms.php` | Prepare marked FF submissions before direct CleanTalk/Pro effects; suppress opt-in/approval/draft/auto-delete callbacks, including marked queued completion; preserve existing feed narrowing, stored IDs and native cleanup. |
| `plugin/pirax-form-test/includes/settings.php` | Admin-only, escaped, read-only GF/FF compatibility sections, applicable detected versions, verdicts and all unknown callbacks grouped by hook. |
| `plugin/pirax-form-test/pirax-form-test.php` | Version 0.2.0; no new packaged module. |
| `test/plugin/harness.ts` | Opt-in exact compatibility stack, safe ZIP header reading through stdin, additive HTTP/envelope/Simulator readers, optional version/hash manifest facts, both licensed-path redaction and reliable activation-notice matching. |
| `test/plugin/playground.ts` | Safeguards load before plugin activation; optional Pro/CleanTalk/FluentSMTP installation; FluentSMTP simulation selected before mail can send. |
| `test/plugin/mu-plugin.php` | Test-only Requests transport capture/containment, effective envelope observation, native Pro feature fixtures, late/unrecognizable CleanTalk fixtures and read-only settings render probes. |
| `test/plugin/fixtures.php` | Real enabled Pro webhook feed/local capture URL; compatible CleanTalk test settings and consumed one-shot activation redirect; mail passthrough only to FluentSMTP simulation. |
| `test/plugin/harness.test.ts` | Optional-stack preflight and default-stack contract tests, using synthetic file inputs where assertion diagnostics could expose a real path. |
| `test/plugin/stack-harness.test.ts` | Real ordinary full-stack controls, CleanTalk moderation, native Pro webhook queue dispatch, Simulator/envelope evidence and privacy/containment checks. |
| `test/plugin/compatibility.test.ts` | Full-stack marked/ordinary browser cases, direct Pro side effects, queued cleanup race, callback restoration, late/rebound bindings, actual version-gate submissions, Inventory rejection and transport/privacy evidence. |
| `test/plugin/core.test.ts` | Version/ZIP assertions and native admin/non-admin/read-only/hostile-closure-path panel tests. |
| `test/plugin/safety.test.ts` | Exact-string optional version matrix and absent-optional-plugin compatibility. |
| `plugin/pirax-form-test/README.md` | Exact pins, suppression inventory, panel semantics, browser/transport limits, preserved exclusions and rollout boundary. B corrected two neighboring clauses: CleanTalk is an exception to generic spam checks; GF form-specific callbacks block that form, not every form. |
| `test/plugin/README.md` | Optional credentials, audit table/vendor references, real stack setup/containment, native evidence readers, new suites, altered-version fixtures, privacy and budgets. |
| `README.md` | Plugin/full-suite prerequisites, exact tested stack, Pro ZIP acquisition and clean-checkout build-before-test requirement. |
| `learnings/history/2026-09-28-helper-compat-credential-assertions.md` | Factual case: failing matcher diagnostics can print credential-bearing return objects despite safe error messages; synthetic fixtures prevent this. |
| `learnings/LESSONS.md` | One active line naming/linking that mechanism; unrelated lessons unchanged. |

`mail.php`, `cleanup.php`, the checker and build script were not changed. FluentSMTP's real replacement path accepted the existing transformation; no new production sender, dependency, REST endpoint or JavaScript was needed.

## Worker returns and fail-first evidence

Execution followed sequential sub-briefs; reports are beside this file.

1. **Unit 1, harness** — `brief-1.md`, `worker-1.md`:
   - Red: `208 pass, 8 fail`, 216 tests, 807.12 s. New stack/preflight expectations failed on old infrastructure; an existing clean-checkout missing-ZIP ordering failure also surfaced.
   - Green: `223 pass, 0 fail`, 223 tests, 1373.69 s. Final synthetic preflight fixture correction additionally passed its targeted two-test check; later full runs cover it.
   - Source/runtime finding: CleanTalk uses Requests directly, not `pre_http_request`; tests intercept the real underlying transport.
2. **Unit 2, production/tests** — `brief-2.md`, `worker-2.md`:
   - Red with the original production plugin temporarily restored: `225 pass, 14 fail`, 239 tests, 1900.93 s. New marked acceptance, panel, Pro isolation and version tests failed; ordinary controls still passed. Production files were restored and compared afterward.
   - Green: `239 pass, 0 fail`, 239 tests, 1953.63 s; typecheck clean. The report contains the exact newly audited callback table and native evidence paths.
3. **Unit 3, documentation** — `brief-3.md`, `worker-3.md`:
   - Documentation completed; report completion required returning the unfinished report to the same worker.
   - Its configured run reported `237 pass, 2 fail` in existing `test/forms/browser.test.ts`; one error said the shared browser had closed. The wrapping worker session ended mid-run, so numeric exit status was not preserved. External closure is only a hypothesis, not a proven cause.
   - Isolated browser-file diagnostic: exit 0, `20 pass, 0 fail`, 81.07 s. Subsequent complete runs, including B's final run, passed the same cases without code changes.
4. **Unit 4, failed final-check investigation** — `brief-4.md`, `worker-4.md`:
   - B's first final full suite received an R2/S3 `InternalError` on a GET in unchanged `test/forms/report.test.ts`; its afterAll assertion then also failed (`238 pass, 2 fail`, 240 including the failing hook, exit 1).
   - Worker verified the test's scoped cleanup left zero keys, no changes exist in `src/**` or `test/forms/**`, and performed a no-code recheck: exit 0, `239 pass, 0 fail`, 1916.12 s.
   - The error did not reproduce. A transient provider fault is plausible but not established without server-side evidence. No retries, assertions or storage/checker code were changed to mask it.

## Final B verification — completed after the last worker

B ran `bun --env-file=.env .cache/helper-compat-final.ts`, an ignored verification wrapper that supplies the base, collects child output, redacts configured credential/path values before retaining logs, and executes these commands. The single full invocation covers `checks.test` and the resolved `checks.test_changed` command; no configured advisory checks exist.

### Build — `final-build.log`

```text
Command: bun run build:plugin
Exit: 0
dist/pirax-form-test.zip (10 files, sha256 19988f1807ff9e90301272ff9ae454b438021e310866a2b8954c6996f5b0fba5)
```

The core suites rebuilt the archive afterward, accounting for the current ZIP hash recorded above. Archive entry equality and header 0.2.0 are also asserted natively.

### Typecheck — `final-typecheck.log`

```text
Command: bun run typecheck
Exit: 0
$ tsc --noEmit
```

### Full suite / resolved changed-tests — `final-full-suite.log`

```sh
AKROGON_BASE=e2075daad1c5b0dd2438ff61d71e606c47819a39 bash -c ': "${AKROGON_BASE:?AKROGON_BASE is required}" && bun test'
```

```text
Exit: 0
 239 pass
 0 fail
 2955 expect() calls
Ran 239 tests across 22 files. [1910.70s]
```

The earlier failed B attempt is preserved separately in `final-full-suite-attempt-1.log` and `final-checks-attempt-1.log`; it is not represented as a successful check.

### Hygiene/privacy

```text
git diff --check: exit 0
git diff --cached --check: exit 0 (before commit)
Scanned plugin artifacts and dist; credential/path matches: 0
FINAL_CHECKS_PASS
git status --porcelain: empty after commit
```

See `final-diff-check.log`, `final-privacy.log`, and `final-checks-progress.log`. The privacy scan included token, both licensed ZIP paths and the configured mail/account/storage credential values, without printing values. Build/installation prerequisites (`bun install`, `bunx playwright install chromium`) completed earlier; Playwright used its supported Ubuntu fallback build on this host.

## Final native evidence

Paths below are under the worktree and gitignored. Every run has its manifest, relevant ledgers and action-only traces; videos/screenshots/DOM snapshots are disabled.

- `artifacts/plugin/compatibility-2026-09-28T18-03-33-971Z/` — marked/ordinary native acceptance, Pro feature states and queues, wrong-version gates, callback cases, all five ZIP hashes, HTTP/envelope/Simulator logs and `compatibility-notes.jsonl`.
- `artifacts/plugin/stack-harness-2026-09-28T18-02-20-392Z/` — real ordinary transport controls and contained HTTP.
- `artifacts/plugin/core-2026-09-28T17-55-54-099Z/` — archive, header, settings capability/nonce and hostile-filename panel evidence.
- `artifacts/plugin/safety-2026-09-28T17-59-53-528Z/` — version matrix and prior safety regressions.
- `artifacts/plugin/adapters-2026-09-28T17-50-14-868Z/`, `review-regressions-2026-09-28T17-58-58-839Z/`, `harness-smoke-2026-09-28T17-58-04-642Z/` — existing/default-stack behavior.
- `runs/forms-browser-2f303759-e48b-442f-bd0e-331f2ea0b754/` — final passing browser suite.
- `runs/forms-playground-62921fba-0353-4ec1-9bd7-b81b9d5c4f82/summary.json` — native checker regression evidence.
- `runs/forms-report-tests-aac6cf01-124f-4b3f-86e1-c0dd70c08c03/summary.json` — final passing real-R2 report regression and scoped cleanup.

## Initial acceptance assessment (superseded by repair round 1 below)

- **AC1:** met for the actual marked GF/FF submission: each produces exactly one redirected Simulator mail with effective empty Cc/Bcc and correct header/prefix, zero CleanTalk attempts during that submission, zero native Pro webhook jobs/hits, and no retained marked entry. **Not a whole-browser-visit zero-HTTP claim; see below.**
- **AC2:** real ordinary controls before/after preserve CleanTalk moderation, native FF Pro webhook, GF ledger, original effective mail recipients and entries.
- **AC3:** exact optional pins and actual wrong-version submissions, absent optional plugins, unknown/rebound callbacks, generic/form-specific GF findings and existing unsupported-form gates are covered. Late registration is covered only before the dispatch guard.
- **AC4:** both admin sections, all findings even alongside a version failure, escaping a real hostile closure path, non-admin denial and unchanged hook/options snapshots pass.
- **AC5:** opt-in/approval, draft deletion and queued auto-delete race are exercised natively; Pro webhook excluded before enqueue; unaudited Inventory stays blocked.
- **AC6/7:** existing marker/queue/CAPTCHA/cleanup/mail regressions, version 0.2.0, ten-file archive, docs, typecheck and full suite passed.

### Limitations / unverified broader criteria

1. **CleanTalk browser pre-submit traffic remains.** Its telemetry and REST email pre-check occur before a marker-bearing form POST exists. Tests contain this traffic but exclude only `/wp-json/cleantalk-antispam/v1/check_email_before_post` from the submission-attempt count. The helper does not make an entire marked visit CleanTalk-free. The checker places its marker in text rather than email, but manually putting a marker in an email field could expose it through a pre-check. This is an explicit brief/implementation boundary for review, not a silently passed whole-visit criterion.
2. **Literal `pre_http_request`-only evidence is impossible for this CleanTalk path.** Its real Requests call bypasses that hook even in its “WordPress HTTP API” mode. The test-only Requests transport supplies actual moderation evidence instead; production callbacks/plugins were not mocked. The plan's dated notes record the mechanism mismatch.
3. **Transport containment is not a general socket sandbox.** Raw PHP cURL/sockets could bypass Requests. The tested exact stack keeps CleanTalk in its built-in mode, seeds its moderation server, answers successfully and asserts the mode remains on. Browser HTTP is contained. General raw-socket non-egress is not proven.
4. **Admin `ready` is a current admin-request diagnostic.** Public-only GF CleanTalk bindings and future dynamic registrations cannot be certified there; submission-time preflight decides. Arbitrary callbacks registered after the priority-9/998 guards are outside the proof, as is arbitrary PHP beyond audited hooks. Restoring same-priority callbacks preserves the audited stack's order, not arbitrary third-party mutation.
5. **Exact FluentSMTP 2.4.0 simulation only.** No real provider/SMTP/IMAP delivery was tested here, and “2.4.x” is not wildcard support. Pinning 2.4.0 follows the locked design's exact-version requirement and is documented for review.
6. **Optional unaudited Pro modules/custom/payment/post/account flows remain blocked or unverified.** This is not broad Pro feature certification. Existing checker CAPTCHA and other documented limitations remain.
7. **Historical exploratory incidents are not hidden:** unit 1's early browser probe reached CleanTalk assets/telemetry before browser containment was installed; later verified runs are contained. A red preflight matcher also put one real licensed path into local temporary logs; those logs were scrubbed and the fixture changed to synthetic input. Retained plugin artifacts/ZIP pass the final zero-match privacy scan. See `worker-1.md` and the committed history case.
8. The earlier closed-browser and server-InternalError failures did not reproduce in final checks. Their causes are not established; passing reruns do not prove the external services/environment cannot fail again.

## Operator-only template action

If not already listed, **add `FLUENT_FORMS_PRO_ZIP=` (empty value) to `.env.example`**. Seats did not open or edit that file. The actual required variable was already present and its licensed 6.2.14 ZIP was usable, so this template action did not block implementation or tests. No credential value should be pasted into a report or command line.

## Initial handoff (historical)

Commit `aac43d6516b3cbb8f2187f1b98b49c36ac6ecef6` was handed to the initial A/B review with passing checks. The review found that the GF isolation assessment omitted modern AJAX and the HTTP privacy statement omitted appended inbound query strings. The repair below supersedes that readiness assessment.

---

## Repair round 1 — completed 2026-09-28

- Reviewed head: `aac43d6516b3cbb8f2187f1b98b49c36ac6ecef6`.
- Repaired head: **`d7933c81beae1c8b1457f27b5078595f1f01ac38`** (`fix: guard GF AJAX before moderation and sanitize HTTP evidence`).
- Configured base remains `e2075daad1c5b0dd2438ff61d71e606c47819a39`.
- Sequential units: `brief-5.md` / `worker-5.md`, followed by `brief-6.md` / `worker-6.md` for omitted checkpoints. The late checkpoints are recorded in the plan, not hidden as relaxed criteria.
- Eight source/test/doc files changed; no `src/**`, site, script, dependency, deployment or `.env*` edits. Version remains the unreleased **0.2.0**, with the same ten-file production allowlist. Worktree is clean after the repair commit.

### Review findings and repairs

**A-F1 — fixed for the audited native GF modern-AJAX route.** CleanTalk's generic `ct_ajax_hook` ran at `plugins_loaded` priority 10, before GF validation. The helper now guards `gform_submit_form` at `PHP_INT_MIN`:

1. Scan only GF-shaped POST values with helper code. Ordinary input returns without any new GF API/metadata read.
2. For a token-bearing candidate, require the audited GF before reading stored field metadata. The raw read does not construct fields, run form filters or populate GF's form cache.
3. If a token-bearing input cannot be reconciled with stored fields (including filter-added fields), refuse before generic dispatch. Otherwise remove exactly the audited CleanTalk callback at priority 10 and verify absence; keep normal later GF preflight.
4. Unknown GF/CleanTalk versions, moved or replaced bindings refuse before the known generic check. Native tests cover a binding moved to priority 1, a wrapper replacing it, malformed markers, invalid configuration, and GF 3.1.3's runtime version gate.

Marked native modern AJAX confirms with redirected Simulator mail, no moderation/token-bearing request and no entry/feed residue. Ordinary anonymous submissions retain the generic moderation check. Logged-in admin controls cover protection off/on: with protection on, the ordinary check runs and CleanTalk itself skips the privileged user; marked work removes it. A read-only query observer verifies zero early metadata reads for ordinary/unsupported-GF requests and one for the audited marked positive control. The GF version fixture changes only its runtime declaration on admin-ajax, avoiding native database upgrade/downgrade routines; it does not certify a real different GF release.

**B-F1 — fixed.** The HTTP transport supplies a query-free inbound `request` context, and the shared logger preserves that safe projection. Outgoing URL projection remains query-free too. Native regression uses synthetic inbound query/nonce and outgoing query/body values. Final retained profiles contain **114 HTTP records, zero incoming queries/nonces and zero outgoing queries**. The older browser-network ledger's URL contract is unchanged.

**N2:** control-padded/folded Cc/Bcc headers are now tested through FluentSMTP's actual effective envelope and Simulator, with an ordinary positive control.

**N3:** plugin docs explicitly warn that FluentSMTP's own body logs retain the marker/token independently of native entry deletion or the sweep. Logging/retention/purging policy remains the operator's; no client log deletion was added.

**N4:** stale `pre_http_request` comment corrected to the test Requests transport. **N1:** earlier browser telemetry/email pre-check boundary retained, with no checker changes.

### Final verification — observed exits on the repaired code

| Command / evidence | Result |
|---|---|
| `bun run build:plugin` — `repair-1-final-build.log` | exit 0; ten files |
| `bun run typecheck` — `repair-1-final-typecheck.log` | exit 0 |
| `AKROGON_BASE=e2075daad1c5b0dd2438ff61d71e606c47819a39 bash -c ': "${AKROGON_BASE:?AKROGON_BASE is required}" && bun test'` — `repair-1-final-full-suite.log` | **exit 0; 247 pass / 0 fail; 3135 assertions; 2071.99 s** |
| `git diff --check` — `repair-1-final-diff-check.log` | exit 0 |
| Configured credential/path scan of plugin artifacts, dist and authoritative leaf — `repair-1-final-privacy.log` | **0 matches** |

`repair-1-final-progress.log` records completed exits, not pending jobs. The final suite also satisfies the configured identical changed-test command. No source changed between these checks and the commit.

Final native artifacts:
- `artifacts/plugin/compatibility-2026-09-28T21-07-17-833Z/` — full exact stack, native submission/queue/envelope/Simulator and adversarial evidence.
- `artifacts/plugin/stack-harness-2026-09-28T21-06-13-723Z/` — ordinary controls and query-free logging.
- `repair-1-final-native-evidence.json` — count-only structural privacy evidence. The compatibility ledger has one `carriesToken: true` record: the intentional **ordinary, outside-GF-fields** positive control. Every marked/refused step asserts no token-bearing request. The transport was contained; no body/token value was retained.

Current uploadable ZIP: `dist/pirax-form-test.zip`, SHA-256 **`8d2301d89ac7ab8cb826cfa9ea5e1a8ed04285d44d4ceb3b4a4fc75a41305acf`**. Test suites rebuilt it after the initial build log, so that log's earlier archive hash is not the final one.

### Red evidence and failed/interrupted verification are retained

- Worker 5 demonstrated both original failures natively, plus the too-late priority-9 guard and a dynamically added GF field. Its intermediate 245-pass full run predates worker 6 and is not final-head evidence.
- Worker 6's early-read regression failed against worker 5's guard, then passed. Its first logged-in test expectation was corrected after source/runtime evidence showed CleanTalk's own privileged-user skip; that expectation error is not claimed as a production defect.
- Worker 6 initially returned while its full suite was still pending. B resumed it to wait and produce an actual report. The wrapper's exit status was lost, and the completed child summary was **239 pass / 8 fail**, not a successful check. All eight failures were in the unchanged capture suite (null image, followed by browser-closed errors). A no-code targeted rerun passed **22/22**; B's no-code full rerun above then passed **247/247**.
- Worker 6 attributes the closure to session teardown. **B has not independently established that cause**; the confirmed facts are the closure, lost wrapper status, preserved failures and passing unchanged reruns. No capture code/assertion was altered, and no failed run was relabelled green.

### Explicit remaining boundaries for re-review

These qualify the native-route proof; they are not a claim that arbitrary marked POSTs can never expose a token:

- The generic guard runs once, after plugin files load. Earlier `plugin_loaded` work, an earlier-registered `PHP_INT_MIN` callback, arbitrary re-registration after the guard, or an additional wrapper alongside the intact original are outside this suppression proof. The new bootstrap binding is not rechecked/restored like the existing GF/FF form-level bindings; docs now distinguish them.
- **Known CleanTalk 6.88 bootstrap path:** its admin branch immediately calls `ct_contact_form_validate()` when the Bitrix-like `your-phone`, `your-email`, `your-message` fields and general-contact setting are present. Native GF-generated field names do not take that path. A GF request also carrying those foreign names can reach CleanTalk, token included, before this regular plugin can guard it; that layout is explicitly unsupported. The earlier broad worker-5 claim of no bootstrap submission path is superseded by this source-backed disclosure. No global bootstrap firewall was implemented.
- Unknown-version refusal cannot undo arbitrary vendor bootstrap effects. The pin is not proof of zero earlier traffic from an unaudited release.
- Token-bearing GF-shaped fields absent from stored metadata are conservatively refused on modern AJAX with CleanTalk active. Unrelated non-GF names, query values and cookies remain outside marker classification and can reach CleanTalk during ordinary work (the contained positive control demonstrates this).
- Browser pre-submit traffic, Requests-vs-raw-socket containment, Simulator-only delivery and FluentSMTP log retention remain as documented. No whole-visit or general socket-sandbox claim is made.
- A forced native `remove_action` failure was not manufactured: WordPress removes the named binding by its exact identity; the code checks afterward and refuses if any binding remains. Moved/replaced binding refusals are exercised natively. Missing GF entirely is covered by code-path inspection, not a separate native test; the unaudited-GF gate is tested.

### Operator notes and handoff

The empty `FLUENT_FORMS_PRO_ZIP=` template action above remains operator-only; no `.env*` file was inspected or changed. Review A/B learning notes remain uncommitted in the registered checkout for the operator, outside this leaf commit. No live-site deployment or real SMTP occurred. If an older helper was used on a live affected GF modern-AJAX/CleanTalk route, assess token rotation; this pass does **not** establish that such live use or a live disclosure occurred.

Re-review target: **A only**, repair diff `aac43d6516b3cbb8f2187f1b98b49c36ac6ecef6..d7933c81beae1c8b1457f27b5078595f1f01ac38`. The findings, proof and remaining acceptance boundaries are explicit above.
