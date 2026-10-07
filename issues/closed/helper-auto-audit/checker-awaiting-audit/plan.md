# Plan: checker-awaiting-audit

## Basis and read-first

Direct slot-B synthesis: authoritative `state.yaml` has `debate: "no"`; no positions or rebuttals exist or are required. The locked design controls. No brief/design conflict was found. This plan changes checker reporting only, not helper refusal generation, release approval, updates or re-audits.

Read first (code paths are relative to the worktree; leaf artifacts remain in the dispatched leaf folder):

1. This leaf's `brief.md` and `design.md`.
2. `README.md`: commands/exits, storage, form checks, designated form, configuration and limitations.
3. `test/forms/README.md`: fixture boundaries, native/scoped-R2 verification and private evidence.
4. `learnings/LESSONS.md`: particularly secret-bearing assertion diagnostics, nonsecret-path redaction and stale clauses in edited documentation. These are observed failure mechanisms, not additional scope.
5. `src/forms/submit.ts`, `src/forms/runner.ts`, `src/commands/forms.ts`, `src/commands/check.ts`.
6. `src/report/model.ts`, `src/report/manifest.ts`, `src/report/html.ts`, `src/report/writer.ts`, `src/store.ts`.
7. `test/forms/browser.test.ts`, `test/forms/report.test.ts`, `tests/report.test.ts`, `tests/store.test.ts`, `tests/commands.test.ts`.
8. For GF message structure only: `plugin/pirax-form-test/includes/gravity-forms.php` (`gf_rejection_message`); FF refusal shape: `plugin/pirax-form-test/includes/fluent-forms.php` (`ff_reject`). Do not edit these adapters.
9. `test/plugin/README.md` for full-suite setup; `/home/rudi/.claude/skills/chart-issues/assets/standing-design.md`, referenced by the design.

Grounding gap: `akrogon config` reports `grounding: none`, so there is no configured grounding index or linked AREA to read. Root README and linked test guides supply the relevant documentation. No AGENTS.md was found on the inspected surface.

## Acceptance criteria (fixed before implementation/tests)

- **AC1 — exact refusal classification:** a fresh, visible, selected-form-associated GF or FF error carrying the case-sensitive literal prefix `Pirax test blocked: awaiting audit of ` and a nonempty plugin/version payload becomes `awaiting-audit`. Preserve the labels and versions, including a comma-separated multiple-plugin message, in sanitized detail. Ordinary `Pirax test blocked: integrations could not be suppressed` stays `rejected`. Near matches, blank payloads, ordinary mentions outside the selected error, stale/foreign messages and native validation failures do not become warnings. A genuine additional substantive refusal must not be hidden by an awaiting-audit message.
- **AC2 — safety unchanged:** these refusals never count as confirmation, never poll IMAP, never retry or fill another form. Keep one authorized native POST at most, selected-form association, stale-message guards, transport failure precedence, redaction and trace sanitation. IMAP configuration is still preflighted before an eligible submission.
- **AC3 — continuous site clock:** the first completed forms-pass observation for a site stores its first-seen UTC timestamp. Later awaiting observations retain that exact timestamp, even across command modes or changed plugin/version text. Elapsed time `<= 72 * 60 * 60 * 1000` remains warning; strictly greater becomes `failed`. Escalated detail retains the version message and states elapsed duration and the 72-hour threshold. Repeated escalated sightings remain failed rather than restarting the clock.
- **AC4 — clearing and isolation:** a completed site forms pass with no raw awaiting-audit result clears that site's stored clock, including rejected/failed/not-verified/unsupported/delivered outcomes, omission of the designation, or an empty scan. Skipped forms on other pages or duplicate instances do not clear a simultaneously observed awaiting-audit result. A different site's state is untouched; page order does not affect the timer. Unvisited sites and a site whose pass aborts with a configuration error have no completed observation and are not cleared. Baseline/approve do not touch these keys.
- **AC5 — real persistence and fallback:** state uses the command's existing, possibly scoped Store at `state/awaiting-audit/<slug>.json`. Missing state starts a new clock. Invalid/noncanonical/future timestamps or a read/write failure yield a first-sighting warning, not a crash or unsupported escalation, with a safe diagnostic in the form detail. Failed clearing is nonfatal and disclosed; subsequent successful clearing removes the object. State survives report pruning. No state contains submitted values, plugin message text or credentials.
- **AC6 — report/exit contract:** both check and forms manifests accept the new outcome without weakening unknown-outcome validation or changing schema version. HTML shows literal `awaiting-audit`, warning status and versions. With no other failures, both production commands exit 0; after escalation they exit 1. Independent visual/health/other-form failures and publication failures still fail. Forms-only runs remain ineligible for approval; a valid check carrying this warning remains usable as visual approval evidence.
- **AC7 — evidence and regression:** GF/FF local browser scenarios leave sanitized Playwright artifacts under `runs/forms-browser-<uuid>/`. Real scoped-R2 command scenarios prove persistence across fresh invocations, escalation, clearing, warning/failure publication and cleanup. `bun run typecheck`, `bun test`, and `bun --env-file=.env run test:forms` pass with the documented runtime/prerequisites. Root outcome table and forms test guide describe the new behavior accurately.

## Stable implementation decisions

### D1 — classify individual native refusal messages, not arbitrary page text

Extend `SubmissionResult.state` and `FormResult.outcome` with `awaiting-audit`. Classification belongs in `submitForm` where new selected-form errors are already observed; `scanPageForms` already forwards every non-confirmed result and must keep doing so without mailbox polling.

Do not simply search the joined `observed.bad` with `includes()`, and do not require that the entire joined error string start with the helper prefix. Live GF appends a `.pirax-form-test-rejected` paragraph to native validation markup, so its generic summary can precede the helper message; selectors can also yield parent/child duplicates. Preserve individual observations and distinguish GF's generic validation container from concrete helper/field refusal nodes. Match the exact prefix at the beginning of the trimmed helper/error message, require a nonempty `<label> <version>` item (and nonempty items separated by `, `), and retain that payload without a hardcoded plugin/version allowlist. The checker is not a second version auditor.

Generic GF validation-summary framing and duplicate ancestors of the same refusal are not independent refusals. Actual field errors, other helper block messages or other substantive error nodes keep the result rejected. Add fixtures for the native-shaped GF summary plus helper paragraph, not only an unrealistically bare container. Match before redaction; retain only bounded, redacted detail via existing result construction. Do not change route authorization or introduce response/API polling.

### D2 — small forms-owned state module; no Store API expansion

Add `src/forms/awaiting-audit.ts`. Use existing `Store.list/get/put/delete`; do not add state-specific methods to `src/store.ts` or import its global unscoped singleton into the forms pass.

Persist exactly `{ "firstSeen": "<canonical UTC ISO timestamp>" }` as JSON with application/json content type. Validate site slug at the key boundary; validate JSON shape, timestamp round trip, finite time and `firstSeen <= now`. Separate pure timestamp/elapsed decision logic from asynchronous storage orchestration so millisecond boundaries and malformed input are deterministic without fake backends.

Use `list(exactKey)` plus exact membership to distinguish absence from operational errors, then `get` only when present. On first sighting, malformed/future state or a read error, attempt to persist `now` as the replacement first sighting; never escalate based on an unusable read. An existing valid clock is not rewritten on each sighting. This minimizes writes and prevents accidental rolling deadlines. Missing state alone is normal; corrupt state/read/write errors add fixed, sanitized diagnostic text, never SDK exception messages or storage locations.

On clearing, find/delete only the exact site's key. A read/delete failure is nonfatal, records that clearing could not be confirmed, and is retried on the next non-awaiting observation. Never manufacture success after a failed delete. All keys are relative to the supplied Store root and outside `reports/` retention.

### D3 — reconcile once per completed site, before status/publication

Keep low-level `scanPageForms` storage-free. Extend `populateForms` with an optional fourth runtime argument, separate from existing `FormsOptions`:

```ts
{ store: Store; now?: () => number }
```

When present, capture a time per completed site and reconcile its flattened form results once, after all listed pages have been scanned. Production `runForms` and `runCheck` must always supply their own Store. Existing direct browser-scanner/population tests can omit the runtime and remain credential-free; document that omission is raw browser classification, not persisted aging. No new CLI clock/store bypass is added, and `RunOptions.forms` need not acquire a storage handle.

Suggested forms-owned interface: `reconcileAwaitingAudit(slug, results, store, nowMs): Promise<string[]>`, mutating only awaiting outcomes/details and returning safe state diagnostics. `populateForms` returns those diagnostics for the commands to log. For read/write failure on a sighting, append the diagnostic to that awaiting result's detail. For clearing failure, append it to an existing form result when available and return it for logging; for a no-form site, log it without fabricating a form or changing an empty `forms: []` report. Command logs retain existing redaction.

Interpretation of the brief's “any other outcome for the site”: use the site's raw completed forms observation, not every individual row or aggregate visual status. If any raw awaiting result exists, preserve/age the clock; unrelated skipped rows do not erase it. Other genuine failures still independently fail the report. A raw awaiting result transformed to `failed` by this module is still an ongoing awaiting observation, never a clearing event. If a configuration error interrupts the site pass, propagate existing exit-2 behavior rather than inventing an observation. State mutations occur before report publication; a later upload failure does not undo an actual observed refusal.

### D4 — precise threshold and understandable duration

Use strict `elapsedMs > 259200000`, not rounded days or `>=`. Details should include a human-readable elapsed duration with enough precision to distinguish just-over-threshold from the boundary, plus the first-seen ISO timestamp and explicit threshold text for escalations. Keep current plugin/version text when aging. Clock identity is site slug only, as locked by design; changing form/version or switching `check`/`forms` does not restart it absent an intervening non-awaiting pass.

### D5 — update the full report boundary

Update the union in `model.ts` and the explicit whitelist in `manifest.ts`; otherwise publication/approval would reject the new result. Existing `formStatus` already maps non-pass/nonfailure forms to warning; preserve that mapping and test it explicitly. Update its comment and forms-only HTML footer, plus check-mode explanatory text if necessary, so rendering does not list an obsolete set of warnings. Keep hostile text escaping and existing neutral skipped formatting intact. No new manifest version or history migration is needed.

### D6 — verification uses real boundaries, not fake authentication

Browser refusal rendering is the explicitly allowed existing loopback fixture-server pattern. Deterministic time is an internal function argument, not mocked Date globally. Backend state assertions use real `createStore({ root: uniqueTestPrefix })`, real R2 authentication, actual JSON objects and cleanup in finally. Do not replace persistence with an in-memory success Store.

For deterministic storage error coverage, delegate unaffected methods to the real scoped Store and the failing operation to a real Store configured with a closed loopback endpoint, so the actual SDK produces a transport failure without contacting a production endpoint or simulating authentication. Check read/list, first-write and clear/delete failures separately; test pure decision/diagnostic functions independently as needed. Never print configuration objects or raw SDK errors. Distinguish real persisted-state evidence from intentionally induced unavailable-storage evidence.

### D7 — docs and sibling boundaries

Update root README outcome table, refusal explanation, timer/reset semantics, storage layout and storage-failure/concurrency limitations. Update `test/forms/README.md` coverage, warning list and evidence paths/commands. No agent instruction file is affected. Plugin README/refusal implementation and re-audit/release docs are owned by sibling leaves and are not changed here.

There is **no execution dependency on helper-self-update**: the locked text contract and permitted browser fixtures suffice to implement and verify this checker. Testing the actual newly released helper's message against live sites remains outside this leaf. No dependency on reaudit-job or release automation is introduced.

### D8 — explicit limitations

The R2 API has no conditional update/transaction or cross-run lock: overlapping runs for one slug may race first-write or clearing. Do not claim distributed consistency or build a new lock service. State outages/corruption can postpone escalation; a failed clear can leave an old clock until a successful later operation. First-seen means checker observation, not time of the plugin update or scheduled audit. Renaming a site leaves the former slug's state orphaned; no inventory-wide garbage collection is included. These are real retained limitations, not silently solved by report pruning.

## Ordered file/criterion checklist

Work can be divided into two independent workers after these interfaces are fixed, followed by integration; avoid concurrent ownership of the same test/doc file.

1. **Classification + report worker**
   - [ ] `src/forms/submit.ts` — D1; new state and exact fresh selected-refusal classification (AC1–2).
   - [ ] `src/report/model.ts` — outcome union (AC6).
   - [ ] `src/report/manifest.ts` — both-mode acceptance with unknown-outcome rejection (AC6).
   - [ ] `src/report/html.ts` — warning explanation and preserved aggregation/escaping (AC6).
   - [ ] `test/forms/browser.test.ts` — GF/FF positive/negative fixture matrix, native GF summary framing, version-list detail, no retry/no mailbox activity and retained traces (AC1–2, AC7).
   - [ ] `tests/report.test.ts` — check-mode outcome/aggregation/manifest/approval regressions (AC6).
2. **State + command worker**
   - [ ] New `src/forms/awaiting-audit.ts` — key/schema validation, first-seen lifecycle, strict aging and nonfatal diagnostics (AC3–5).
   - [ ] `src/forms/runner.ts` — optional runtime interface and once-per-site reconciliation, preserving completed-observation semantics (AC2–5).
   - [ ] `src/commands/forms.ts` — supply Store and log state diagnostics before normal status/publication (AC5–6).
   - [ ] `src/commands/check.ts` — same Store/timer semantics without weakening existing capture failures (AC5–6).
   - [ ] New `tests/awaiting-audit.test.ts` — credential-free pure timestamp/key/decision boundaries, malformed/future data and elapsed formatting (AC3–5).
   - [ ] New `test/forms/awaiting-audit.test.ts` — real scoped-R2 lifecycle/failure tests and local fixture → production `runForms`/`runCheck` → private reports end-to-end evidence (AC3–7). Reuse production baseline capture for the check scenario; do not invent an all-green visual result.
   - [ ] `tests/store.test.ts` — add awaiting-state sentinel to retention coverage (AC5); no Store API implementation change needed.
3. **Integration owner, after both workers**
   - [ ] `test/forms/report.test.ts` — exhaustive outcome record, both manifest modes, rendered warning/version detail, real publication and approval regression for the new result (AC6).
   - [ ] `tests/commands.test.ts` — preserve actual aliases and empty-selection/lazy-config behavior; add a relevant regression only if command integration changes the exercised contract (AC2, AC6).
   - [ ] `README.md` — human documentation: warning/exit semantics, strict 72-hour escalation/reset, R2 state prefix and fallback/limitations (AC7).
   - [ ] `test/forms/README.md` — human/test-runner documentation: new matrices, real state evidence, warning list and verification (AC7).
   - [ ] `learnings/LESSONS.md` — retire the applied owned-connection lesson from the active list.
   - [ ] `learnings/history/2026-09-26-form-check.md` — date its application to the new command mailbox oracle without rewriting the historical case.
   - [ ] Agent documentation: none affected; no AGENTS.md or other agent policy changes.
   - [ ] Run all gates, inspect retained evidence and record exact commands, exit codes, artifact paths and any limitation in the implementation report.

Only real ordering constraints: integration compilation/report tests need the new union and runtime interface; full-suite forms integration needs dependencies installed and helper ZIP built first. The two implementation workers otherwise need no cross-leaf waiting.

## Implementation notes

2026-10-02 — D2/D3 worker independence: the state reconciler accepts the minimal structural input `{ outcome: string; detail: string }[]` (it only changes outcome/detail), so its storage/lifecycle worker can run independently of the model-union worker. Command-level awaiting fixtures and all documentation land in a third integration unit after both commits. This does not change production behavior or acceptance criteria.

2026-10-02 — Verification constraint: effective `checks.test_changed` resolves to the entire `bun test` suite, not a path-filtering runner. Workers must run that configured command with the supplied base and real prerequisites; B also runs it after each landed commit. Worker suites may contend for native resources, so launch verification serially if necessary. Worktree environment values are loaded with Bun using the registered repository's environment path, never by reading/copying a file.

2026-10-02 — D6 evidence applied the existing owned-connection lesson: a real unrelated loopback probe made unit 3's original aggregate mailbox count fail. Its corrected oracle attributes peers to the actual ImapFlow client, without changing transport or deadlines. Following the implementation skill's lesson lifecycle, retire that active line and date the historical application. These final edits affect lesson documentation only, not the already-verified code/tests.

2026-10-02 — Repair round 1 (reviewed head `5250748`): D7 documentation must distinguish checker capability from the installed helper: in-tree helper 0.2.4 still emits the generic integration block for version mismatches, and that remains rejected. Awaiting behavior is conditional on a helper that emits the sibling-owned version-only text; do not introduce a cross-leaf dependency or edit helper code. D6's scanner-level mailbox oracle must, like the command-level oracle, attribute real connections to ImapFlow; B's external-probe reproduction failed the unowned aggregate count. Add a deliberate unrelated probe without weakening zero-owned-polling/one-POST assertions. Also address A's small nits by reusing the existing slug regexp and documenting that completed page-scan/browser failures clear the clock (each such run still fails). All locked acceptance criteria are unchanged.

2026-10-02 — Repair verification environment: systemd journal proves repeated suspend/resume while the initial repair worker suite reported Chromium `ERR_NETWORK_IO_SUSPENDED`. The loop followed `Lid closed` at 19:33; an ordinary sleep/idle inhibitor did not stop logind's lid handling. B added a temporary process-scoped `handle-lid-switch` inhibitor at 21:07; no further suspends occurred during the initial observation window. Use fresh browser processes for verification, then release both inhibitors. No persistent desktop changes, permission request, timeout weakening or production workaround is required. Retain the interrupted failures separately from the clean retry (`brief-4-verification.md`).

## Concrete verification matrix

### Local browser evidence

Extend the existing server with GF POST refusals and FF AJAX refusals rendered inside the selected wrapper. Include single and multiple version items; exact old generic block; wrong capitalization/prefix, blank payload, prefix mentioned mid-sentence, stale error, other-form error, overlapping parent/child nodes, GF generic summary plus helper paragraph, and awaiting text alongside a genuine other refusal. Count authorized POSTs, keep the existing traps/trace privacy checks, and demonstrate raw scanner propagation. For a runner-level awaiting scenario, observe an actual local mailbox listener and assert no connection rather than mocking `pollDelivery` into succeeding.

### State/command scenario

Use a unique real root `test/forms-awaiting-audit-<timestamp>-<random>/` and nonsecret loopback fixture sites. Record safe facts in a retained summary, never the command result's bearer URL.

1. First `runForms` on the awaiting fixture: exit 0, warning HTML/manifest, real firstSeen object. A fresh Store/run for the same site observes unchanged firstSeen.
2. Pure-clock tests cover 72h minus 1ms, exactly 72h, and plus 1ms. Real state tests seed those timestamps and call reconciliation with fixed `nowMs`, asserting the persisted bytes remain unchanged.
3. Seed a comfortably over-72h clock and execute production commands with real time: exit 1, version text plus elapsed failure detail. Repeat and prove no reset. Seed stable visual baselines for a matching `runCheck`; warning/failed forms must determine exit in otherwise healthy captures.
4. Switch command mode and plugin/version message while still awaiting: same site clock. Include a second site and two pages in both orders with skipped rows before/after the target: no spurious clear or cross-site mutation.
5. Non-awaiting site passes clear the clock, including a normal rejection, helper-false result, omitted designation and no-form page. Exercise every non-awaiting outcome in the reconciliation transition matrix using real stored objects; a manufactured result array proves state transition only, not native mail delivery. A subsequent real awaiting submission starts a fresh clock.
6. Missing/malformed/wrong-shape/noncanonical/future JSON: warning and replacement timestamp; transport failures: no thrown run error from state handling, safe diagnostic, no false escalation. Clear failure leaves a disclosed old object; successful retry removes it.
7. Publish/prune reports and confirm state remains. Verify both manifests parse, report HTML renders in headless Chromium with warning text and escaped details, and new state objects are not report assets or approval candidates.
8. Finally stop fixture browsers/server/listeners, delete only the unique test root, require zero remaining remote objects, retain sanitized summary/report/trace paths. Cleanup failure fails the test. Keep browser artifacts action-only and no video for new forms flows.

### Commands and preparation

Planning preflight checked environment **names only** via `bun --env-file=.env -e ...`: all existing R2 names, FORM_TEST_TOKEN/FORM_TEST_ADDRESS, IMAP_HOST/PORT/USER/PASSWORD/FOLDER/SPAM_FOLDER, GRAVITY_FORMS_ZIP and FLUENT_FORMS_PRO_ZIP were present. The design names no new credential variables. Presence is not proof of valid access; real tests verify it. No human-only blocker is currently identified.

The worktree does not yet have its own `node_modules/` or built helper ZIP. Both are agent-owned setup, not operator blockers. Node on the default PATH is 26.8.2; compatible Node 24.21.0 is already installed at `/home/rudi/.local/share/mise/installs/node/24.21.0`. Use a process-local Node-24 PATH (do not change the machine default), install dependencies with the existing lockfile, install Chromium if necessary, then build the plugin. Do not edit/read/copy any environment file. If an actual prerequisite is missing and unobtainable, record the exact operator action and fail the implementation phase instead of silently skipping tests.

Run in the worktree, with Node 24 first on PATH:

```sh
bun install --frozen-lockfile
bunx playwright install chromium
bun run build:plugin
bun run typecheck
bun --no-env-file test tests/awaiting-audit.test.ts tests/report.test.ts tests/store.test.ts tests/commands.test.ts test/forms/browser.test.ts
bun --env-file=.env test test/forms/awaiting-audit.test.ts test/forms/report.test.ts
bun --env-file=.env run test:forms
bun test
```

The new integration file is under `test/forms/`, so `test:forms` is the user-visible end-to-end verification command and leaves browser/state/report evidence. Full `bun test` includes licensed/native plugin suites and may need roughly 35 minutes; forms integration includes the existing real five-minute mailbox timeout. Do not run against committed live sites, run `forms all`, alter global Node selection, send independent SMTP selftest mail unnecessarily, or reduce native deadlines to disguise failures. If the worktree environment loading changes, use Bun's documented registered-repository `--env-file` path rather than opening/linking/copying the file. Record gate outcomes honestly; this planning pass has not run or claimed implementation tests.
