# Review A: checker-awaiting-audit

Slot A, phase `check.review`, initial review (blind, `debate: no`, so no positions or rebuttal to read). 2026-10-02.

- Base: `2689aaa3bd69a9a46cc77788fdc5219354cc923a`
- Reviewed head: `5250748af9f96d3d8c35eef78a4f8b602f81b3f8` (7 commits, 19 files; `7cbba00..5250748` changes only `learnings/`)
- Inputs: `brief.md`, `design.md`, `plan.md` (with implementation notes), `implementation/report.md`, worker reports 1 and 3, retained evidence summaries, and the full diff against live code and docs.

## Verdict: `fix`

There is one Fix: a wrong documentation claim about current helper behavior. The runtime, state lifecycle, report boundary and tests meet AC1–AC7.

## Findings

### F1 (Fix): the root README describes an unreleased helper message as the current helper's behavior

`README.md:233` says: "The helper refuses a test submission while installed plugin versions are not yet audited. Its message is `Pirax test blocked: awaiting audit of <Plugin label> <version>`…". `README.md:235` then calls the generic text "the older generic `Pirax test blocked: integrations could not be suppressed`". `test/forms/README.md:41` likewise calls it "the old generic block".

At the reviewed head, and on `origin/main`, the helper in this tree does not emit the awaiting message:

- Pirax Form Test is 0.2.4.
- `plugin/pirax-form-test/includes/compatibility.php:9` and `marker.php:23` fail version mismatches with `BLOCKED_MESSAGE` = "integrations could not be suppressed".
- `plugin/pirax-form-test/README.md:68` states exactly that, with FluentSMTP 2.4.2 as its example.

The message belongs to sibling leaf `helper-self-update`, whose brief owns the text. That leaf is in phase `failed` and unmerged, and this leaf has no `blocked-by`. So it can merge first, and `main` would then contradict itself for as long as the sibling stays unmerged.

- **Criterion:** AC7 says the root documentation must describe the new behavior accurately. D7 assigns this leaf the README refusal explanation, and the check skill counts a wrong documented claim as a Fix.
- **Scenario:** a site on helper 0.2.4 with FluentSMTP 2.4.2 runs `bun run forms <slug>`.
  - The README leads the operator to expect `awaiting-audit` (warning, exit 0), naming "FluentSMTP 2.4.2".
  - Actually, the helper answers "Pirax test blocked: integrations could not be suppressed". The checker correctly reports `rejected`, exit 1.
- **Repair (docs only):**
  - State that the checker recognizes this message from a helper that names version-only blocks (the helper-self-update contract).
  - State that the in-tree helper 0.2.4 still answers version-only blocks with the generic message, which stays `rejected` until such a helper is installed.
  - Drop "older" (`README.md:235`) and "old" (`test/forms/README.md:41`).
  - No code change.

### N1 (Nit): the new browser scanner case uses an aggregate listener count as its mailbox oracle

`test/forms/browser.test.ts:305-319` counts every connection its `Bun.listen` listener accepts. It asserts the count does not change across the GF/FF awaiting scans, and that it is > 0 after the positive control.

This leaf's own evidence shows that an unrelated local service probes loopback listeners:

- `worker-3.md`: an early failure came from a foreign probe.
- The retained command summaries `048eb23b…` and `7e2ec556…` record `foreign=1` in every run, in `check-escalated` and `check-warning`.
- `learnings/history/2026-09-26-form-check.md` records the same mechanism failing an aggregate count.

Consequences:

- A probe during the awaiting window (about 0.5 s; the case takes 2.47 s in total) fails the test spuriously.
- A probe during the positive control can satisfy `connections > 0` even if the checker never connected.

`awaiting-audit-commands.test.ts:55-64` already attributes connections to the installed ImapFlow client's local port. Reusing that would make this case robust. This is not a Fix because no failure of this case has been observed and its exposure is small. Note that the leaf retires the active lesson line while this new case keeps the pattern. The history file's "Applied" claim is accurate: it names only the commands test, which I verified.

### N2 (Nit): the slug rule is copied rather than reused

`src/forms/awaiting-audit.ts:5` duplicates `SLUG` from `src/sites.ts:37`, with the comment "Same rule as sites.ts". Exporting the existing constant is a one-word change and removes the drift risk at the key boundary.

### N3 (Nit): the docs do not say that page-scan failures restart the clock

`src/forms/runner.ts:116-120` treats a page-scan `failed` row as a completed non-awaiting pass, so it clears the clock. This covers navigation errors, challenge or interstitial pages, and browser launch failure. That matches brief criterion 2 ("any other outcome") and AC4.

However, the README "Clear" bullet (`README.md:247`) and the limitation at `README.md:396` list only storage problems as reasons the clock restarts. For a site that is intermittently unreachable while still blocked, the clock can keep restarting, so escalation can be postponed indefinitely. Each failing run does still exit 1. One clause in either place would make this explicit.

## Verification evidence

- **Real native markup:**
  - GF 3.1.2: I extracted `form_display.php` from the configured licensed ZIP through `bun --env-file=<registered .env>`; the script printed only `present` and exit codes, never the path. In `get_validation_errors_markup`, the helper `<p>` is appended to the filtered `<h2 class="gform_submission_error …">` inside `#gform_<id>_validation_container`, with no whitespace nodes. The `<ol>` summary lists only failed fields, and there are none for a helper-only refusal. Legacy markup keeps the same id.
    - The `own()` walk yields only the helper text for this shape. The `/gf-awaiting-nested` fixture reproduces it, and the final logs show it classified `awaiting-audit`.
  - FF 6.2.14 (`fluentform/assets/js/form-submission.js` from the cached wordpress.org ZIP): a stacked error is `div.error.text-danger[role=alert]` holding `span.error-text` and `span.error-clear` ("×"). It is appended to `.ff-errors-in-stack` in the form's parent, which matches the `ffStack` fixture and the `.error-clear` skip.
- **Classifier (`src/forms/submit.ts:112-191`):**
  - The match is anchored at both ends, case-sensitive, with nonempty `<label> <version>` items and no allowlist.
  - Any other fresh refusal or native invalidity keeps the result `rejected`.
  - Stale, foreign and outside-scope messages are unchanged, and an awaiting result never polls IMAP or retries.
  - Matching runs on raw text before the existing redaction and length cap.
- **State (`src/forms/awaiting-audit.ts`):**
  - `list` with exact membership, then `get`. Unreadable, invalid or future state is replaced by `now`, and nothing escalates on an unusable read.
  - A valid clock is never rewritten, and escalation is strictly `> 259200000` ms.
  - On clearing, a failure is disclosed on `results[0]` or only in the log, and is never fabricated as success.
  - Diagnostics are fixed strings. The only throw is an invalid slug, which is unreachable because `sites.ts` validates the same rule.
  - `dispatch` reads the R2 config before any command (`src/commands/common.ts:66`), so a missing credential still exits 2 before any forms pass.
- **Wiring:**
  - Reconciliation runs once per completed site after all its pages, before status and publication, in both `runForms` and `runCheck`. A configuration error propagates before reconciliation.
  - Baseline and approve never call `populateForms` (checked by grep), as the README says.
- **Report:** the model union, both manifest whitelists (unknown outcomes still rejected, schema unchanged) and the `formStatus` warning mapping are correct. The forms footer is updated, and the check footer has no warning list to update.
- **Tests against the criteria:**
  - Every AC has a test. The only observation hook is ImapFlow `connect`, which is observed, not replaced; that and the failing-operation stores delegate to real S3 clients, so the unit under test is never mocked.
  - Pure boundaries are covered credential-free; real scoped R2 covers the lifecycle and induced failures; production commands cover exits, the shared clock, clearing and cleanup.
  - The detail-text assertions pin numbers, timestamps and fixed diagnostic categories that the criteria require.
- **Retained command summaries** `048eb23b…` and `7e2ec556…` match the report's matrix: exits, statuses, 1 POST per designated attempt, owned IMAP connections only in `clear-confirmed-undelivered`, cleanup deleted 90 / remaining 0, privacy hits `[]`.
- **Documented behavior:** README (commands, exits, storage, outcome table, awaiting-audit section, limitations) and `test/forms/README.md` are accurate apart from F1 and the N3 omission. Every path they name exists, and the `#awaiting-audit-refusals` anchor resolves. The plugin README is unchanged, sibling-owned and consistent with the in-tree helper.
- **AREA.md:** none in the diff.
- **Blocking checks:** not rerun. There is no code change since verification, no missing evidence and no concern a rerun would settle. Logs at `7cbba00`:
  - `bun run typecheck`: exit 0.
  - `bun test`: 262 pass / 0 fail, exit 0.
  - `bun --env-file=.env run test:forms`: 70 pass / 0 fail, exit 0.
  - No advisory checks are configured.

## Lesson recorded

I added one active line to the registered checkout's `learnings/LESSONS.md`, plus `learnings/history/2026-10-02-checker-awaiting-audit-contract-docs-review-a.md`. Both are left for the operator to commit.

## Re-check after check.fix round 1 (2026-10-05)

- Prior reviewed head: `5250748af9f96d3d8c35eef78a4f8b602f81b3f8`
- Re-checked head: `e6bc04490e4a12c20db76fbc704b06e207627498` (repair diff only: `8f841e8` plus the learnings-only `e6bc044`; 6 files, +43/−15, `git diff --check` clean)

### Verdict: `ready`

| Finding | Status | Evidence |
|---|---|---|
| F1 (Fix) | Fixed | `README.md:233` now says the checker recognizes the message from a helper that emits it, and that in-tree helper 0.2.4 still answers a version mismatch with `integrations could not be suppressed`, which stays `rejected` (exit 1). "older" (`:235`) and "old" (`test/forms/README.md:41`) are gone; the test README names the generic block as 0.2.4's answer and says the fixtures are not output of a shipping helper. `git grep` finds no other present-tense claim in non-learnings docs. Consistent with `plugin/pirax-form-test/README.md:68`. |
| N1 (Nit) | Fixed | `test/forms/browser.test.ts` attributes listener peers to the installed ImapFlow client's socket local ports (`connect()` called unchanged), with the confirmed-submission positive control kept. A deliberately unrelated real TCP probe before each scan must be seen by the listener, must not be an owned port and must not change `owned()`. One-POST, trap and version assertions are unchanged; `finally` restores the prototype, listener and probes. Fail-first evidence: `worker-4-evidence/red-in-test-probe.log` (old oracle, 1 fail) → `green-in-test-probe.log` (12 assertions, exit 0); `finish-external-probe-probe.log` records 92 unrelated connections while the case passed. |
| N2 (Nit) | Fixed | `src/sites.ts:37` exports the existing `SLUG`; `src/forms/awaiting-audit.ts:1` imports it. Same regexp, no import cycle (`sites.ts` imports only `node:fs`). |
| N3 (Nit) | Fixed | `README.md:247` (Clear) and the limitation at `:396` now name navigation errors, challenge/interstitial pages and browser-launch failure as clearing, note those runs exit 1, and state the postponement risk. This matches `src/forms/runner.ts:116-120`; no runtime change. |

No new defect was introduced by the repair. The lesson history file's new "Applied: 2026-10-05" line cites `worker-4.md`, `worker-4-finish.md` and the 1 → 2 count and 92 probes, all present in the evidence. Documented behavior: the only changed claims are the ones above, and each now matches the code. No `AREA.md` in the repair diff.

Blocking checks were not rerun: B's final lane verification ran at exactly `e6bc044` (`repair-1-final.head`, `repair-1-suite-resumed.head`):

- `bun run typecheck`: exit 0.
- `bun test`: 262 pass / 0 fail, 3909 expect() calls, exit 0; the log includes `(pass) scanner forwards awaiting-audit without polling the mailbox`.

## Merge (2026-10-05)

- Rebase target: `origin/main` = `2689aaa3bd69a9a46cc77788fdc5219354cc923a`, which is the leaf base. `git rebase` was a no-op ("up to date"), with no conflicts. `AKROGON_BASE` stays `2689aaa…`.
- Head pushed: `e6bc04490e4a12c20db76fbc704b06e207627498`, the reviewed head itself.
- Checks were reused, not rerun, because neither code nor integration changed since B's final lane run at exactly this head (`implementation/repair-1-final.head`, `repair-1-suite-resumed.head`):
  - `typecheck` (`bun run typecheck`): exit 0.
  - `test` / `test_changed` (`bun test`, with `AKROGON_BASE` set): 262 pass / 0 fail, 3909 expect() calls, exit 0.
  - No advisory checks are configured.
- Push: `git push origin HEAD:main` fast-forwarded `2689aaa..e6bc044`. After a fresh fetch, `git merge-base --is-ancestor e6bc044 origin/main` succeeds.
- Held Nits: none. All earlier Nits were fixed in repair round 1, so no new lesson was recorded.
