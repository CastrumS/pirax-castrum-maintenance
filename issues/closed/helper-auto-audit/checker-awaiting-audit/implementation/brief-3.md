## 1. Goal
Complete integrated command/browser/R2 evidence and human docs for checker-awaiting-audit (D3–D8), after worker 1 classification/report and worker 2 state/wiring commits land. Worktree `/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/worktrees/checker-awaiting-audit-u3`.

## 2. Numbered acceptance criteria
1. Real loopback GF and FF refusal fixtures feed production commands (not injected reports): `runForms` publishes awaiting warning exit 0, real firstSeen object persists across fresh Store/run; seeded >72h clock yields failed exit 1 with version and elapsed detail. Repeat does not reset. Seed stable baselines via production baseline to prove `runCheck` warning exit 0/failure exit 1 in otherwise healthy captures, sharing forms state. No production sites touched.
2. Two-page/skipped-order and site isolation evidence: skipped/duplicate/other-page results do not clear active clock. Changing plugin/version while still awaiting retains clock. Non-awaiting completed passes (normal rejection, helper false, no designation, empty scan) clear, and next awaiting starts fresh. Existing worker state matrix covers every structural outcome; no need fake delivered mail.
3. Awaiting refusal does not initiate any mailbox connection; observe actual loopback listener, do not stub polling. One native authorized submission maximum; no new retry/confirmation bypass.
4. Both manifests/HTML retain exact version text and warning/failure status; render fetched/local report bodies with headless Playwright trace on, no video/screenshots/snapshots/sources, no signed URL navigation. Retain report/trace/safe summary, privacy scan, finally stop fixtures, delete only test root and require empty cleanup. Real R2 auth only.
5. Root README outcome table, refusal/clearing/72h semantics, state prefix, warning exits/fallback/concurrency and forms test guide warning/evidence text match shipped behavior. No agent doc affected; no plugin release/helper docs modified.
6. No regressions: configured changed-tests pass. Mandatory final lane checks belong to B. Meaningful assertions derived first; any discovered production defect returns mismatch to B rather than broad ownership creep.
7. One concrete integration concern is authorized to inspect/fix: submitForm currently evaluates `observed.invalid` only after observed.bad. A fresh awaiting message appearing alongside a newly native-invalid selected form must not turn that validation failure into a warning. Add a fail-first browser fixture for this combination; if confirmed, minimally require absence of observed.invalid before returning awaiting-audit. Keep the existing refusal detail and no retry behavior.

## 3. Read-first list
Authoritative leaf `plan.md` and `implementation/worker-1.md`, `worker-2.md`; `src/forms/{submit,runner,awaiting-audit}.ts`, `src/commands/{forms,check,baseline}.ts`, `test/forms/{browser,awaiting-audit,report}.test.ts`, `test/forms/README.md`, root README, `test/plugin/README.md`; `/home/rudi/.pi/agent/skills/implement-issue/ponytail.md`. Copy loopback fixture and real scoped-R2 cleanup/summary patterns.

## 4. Change list and needed interfaces
Prerequisites: both worker commits on starting HEAD. Own new `test/forms/awaiting-audit-commands.test.ts`, `README.md`, `test/forms/README.md`, plus `src/forms/submit.ts` and `test/forms/browser.test.ts` solely for criterion 7's focused regression/fix. Keep shared fixture minimal (not a framework). Consume actual signatures from landed modules. Production runForms/runCheck use injected real Store; runBaseline creates real visual pairs. Use fresh run directories/IDs and store roots; synthetic mailbox env values during local fixture scenarios with restoration. For actual state boundary tests rely on unit 2; command scenarios seed comfortably old real timestamps rather than adding CLI clock knobs. Other tests/production edits require a mismatch return or revised brief.

## 5. Do-not, reasons and exceptions
Do not change production behavior except criterion 7's explicitly authorized preservation of native validation failure; do not change helper code, plan/lifecycle, credentials, live sites or test success requirements. No fake auth/storage, mocked confirmation/delivery or manufactured green captures. Existing loopback browser fixture pattern is allowed; summary must state it is checker behavior evidence, not released-helper audit evidence. Never read/print/copy/write `.env` or `.env.*`; Bun loads values privately. Do not retain returned signed URL/whole command result or credential-valued assertion diagnostics. No bare skip for missing prerequisites. Return mismatch evidence and smallest correction; only revised brief from B authorizes scope expansion. Reasons remain locked behavior, real evidence and privacy; exceptions require B's revised brief.

## 6. Ordered steps
1. Install dependencies/build with Node 24 first on PATH; no machine default changes.
2. Derive integration tests from criteria, retain fail-first evidence for any defect found; run targeted command scenarios, examine reports/traces and cleanup.
3. Update both docs, checking every adjacent old claim including outcome lists/refusal explanation/retention behavior. No new instruction docs.
4. Run configured changed-tests, commit owned files, fill report at authoritative `implementation/worker-3.md`.
Advisory 5 files, under 32 turns; clear mismatch rather than silent incomplete return.

## 7. Commands
Configured changed tests only: `AKROGON_BASE=2689aaa3bd69a9a46cc77788fdc5219354cc923a bash -c ': "${AKROGON_BASE:?AKROGON_BASE is required}" && bun test'`.
Node `/home/rudi/.local/share/mise/installs/node/24.21.0/bin` first on PATH. Load environment via `bun --env-file=/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/.env -e 'const p=Bun.spawn(["bash","-c",": \"${AKROGON_BASE:?AKROGON_BASE is required}\" && bun test"],{stdout:"inherit",stderr:"inherit"});process.exit(await p.exited)'`, AKROGON_BASE exported. Targeted development test runs allowed. B runs final suite and checks separately; no lifecycle command by worker.

## 8. Done-when, evidence and report

Repair round 1: see `brief-4.md` for the current docs correction: awaiting-audit is conditional on a helper emitting version-only messages; in-tree 0.2.4 still emits the generic block and remains rejected for that response. Remove misleading old/older terminology. State explicitly that completed page-scan/browser failures clear the clock, without changing runtime semantics. Original scoped command evidence is retained.

B's review of 524f590 found these in-scope completion corrections; finish them before final configured verification:
- Root README's existing paragraph still says all client/native server refusals are rejected. Name the new awaiting exception there rather than leaving contradictory adjacent prose.
- Say stale/foreign messages are ignored and cannot establish this attempt's result; absent another fresh associated result they time out as failed. Do not claim they always force failed.
- Clarify skipped rows preserve a clock only alongside a current raw awaiting result; an all-skipped completed pass clears. Say invalid/read-error state replacement is attempted, and clear-failure detail only exists when a form row exists (otherwise command log).
- New command test currently starts server/listener and patches ImapFlow at module scope, then launches the browser before its try/finally. Move listener/prototype/env ownership into the test and put launch inside cleanup protection (or equivalent hooks) so a filtered-out test or launch/setup failure cannot leave a patched client, server or changed environment. Keep the real listener/positive control and don't weaken assertions. This is authorized test harness scope, not production changes.

Return committed diff and report `/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/open/helper-auto-audit/checker-awaiting-audit/implementation/worker-3.md` including exact tested commands, pasted summaries, commit and retained artifact paths. Clarification: the dispatch's 'avoid duplicating native suites' means do not start overlapping copies in your own worktree; it does NOT waive the exact final configured changed-test command `bun test`. Filtered nonnative development runs do not replace it. You may wait for B's existing lane-after-u2 suite to finish to avoid contention, then run your one configured full changed-test command and wait for its actual result before returning. Keep limitations: first-seen observation not update date, R2 races/outage deferral/stale clear, slug orphaning, fixtures not helper release/live mail proof.
Changed files and reasons: <paths and why>
Tests run: <commands and results>
Known limitations: <limitations or none known>
Unverified criteria: <criterion and why, or none>
