# Unit 3 — accurate release and test documentation

## 1. Goal

Complete the plan's documentation checklist for helper-compat 0.2.0 in `/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/worktrees/helper-compat`, reflecting the implemented D1–D7 behavior and actual evidence rather than promises. Add the reusable credential-assertion lesson observed during this implementation. Production/test logic is owned by completed prior units.

## 2. Numbered acceptance criteria

1. Plugin guide documents exact GF 3.1.2, FF free/Pro 6.2.14, CleanTalk 6.88 and FluentSMTP 2.4.0 pins; absent optional plugins remain optional. Other versions fail closed, including SMTP patches (locked design, not wildcard 2.4.x support).
2. Guide explains admin panel, scope of ready/blocked, complete escaped callback list, marked-only CleanTalk suppression and Pro direct callback/feed suppression; ordinary submissions unchanged. Explicitly distinguish the marked POST from earlier CleanTalk browser telemetry/REST email checks, which are not suppressed. The checker places its marker in text, but never claim manually placing a marker in an email field cannot leak through a pre-check. Remove stale blanket 'FF Pro blocks' language without claiming all optional Pro modules/custom forms are supported. Keep payment/post exclusions, queue/cleanup semantics and rollout boundaries accurate.
3. Test guide describes optional stack credential/pins, acquisition, named new suites, additive APIs/evidence, exact callback audit table (hook/identity/version/disposition/vendor source), both licensed-path redaction, effective envelope + real Simulator logging and current runtime budget. State that CleanTalk calls Requests directly, bypassing pre_http_request even in its 'WP API' mode. The test-only Requests interceptor/browser routing contains tested paths; raw cURL/sockets are not generically sandboxed. Do not claim real SMTP/IMAP delivery or all 2.4.x versions.
4. Root README plugin/test prerequisites include FLUENT_FORMS_PRO_ZIP and full suite requirements. Linked documentation and edited neighboring clauses remain consistent; no checker behavior changes.
5. Record one reusable lesson: assertion diagnostics can print credential-bearing return objects even if error messages are safe. History gives case/evidence (red log scrubbed, synthetic fixture replacement), no secret value; active line names mechanism/date/history path. Do not reinterpret unrelated old lessons or open their histories without need.
6. No environment files touched; carry exact operator-only action to add empty FLUENT_FORMS_PRO_ZIP in .env.example if missing. Documentation-only changes pass the resolved changed-tests command; no invented tests for prose.

## 3. Read-first list

- `/home/rudi/.pi/agent/skills/implement-issue/ponytail.md`.
- Authoritative leaf `/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/open/helper-compat/helper-compat`: `implementation/worker-1.md`, `implementation/worker-2.md`, `plan.md` Implementation notes/limitations.
- `plugin/pirax-form-test/README.md`, `test/plugin/README.md`, root `README.md` plugin/test prerequisites (copy existing table/link style).
- Current production compatibility/adapters/settings and the new `test/plugin/{compatibility,stack-harness}.test.ts`, harness/mu-plugin interfaces. Read sources rather than trusting stale report summaries.

## 4. Change list and needed interfaces

Own only `plugin/pirax-form-test/README.md`, `test/plugin/README.md`, root `README.md`, a new `learnings/history/2026-09-28-helper-compat-credential-assertions.md`, and one append to `learnings/LESSONS.md`. Existing lessons are not pass input; append the new active line without consuming/reworking unrelated entries. No agent AREA/index files are configured or affected.

Both worker reports have exact facts, artifact paths and caveats. Preserve distinction between `h.mail()` argument observation, `h.envelopes()` effective PHPMailer recipients, and `h.simulator()` actual FluentSMTP Simulator log. Keep transport containment's raw-socket ceiling and plan's pre_http_request mechanism mismatch explicit.

## 5. Do-not, reasons and exceptions

- Never read/write/print `.env*`; credential scripts only via Bun environment loader and name/result-only output. Never print secrets or licensed paths.
- No production code/tests/src/sites/dependencies, deployment, commits, lifecycle commands, or issue artifacts inside the worktree. This unit owns documentation only.
- Do not dilute acceptance or hide limitations/incidents to make prose simpler. Missing verification stays explicit.
- Return mismatch with evidence and smallest brief correction for a concrete code/doc inconsistency; only B's revised brief authorizes changed scope. These exclusions protect secrets, client safety and factual docs; there are no convenience exceptions.

## 6. Ordered steps

1. Cross-check landed behavior/reports against all three guides; identify stale clauses (criteria 1–4).
2. Update each guide with minimal factual paragraphs/tables, preserve unrelated command/API content and working links.
3. Add history and append the active lesson line without reading old lessons as input (criterion 5).
4. Verify edited paragraphs and old-version/Pro/observer statements across the docs; run configured changed-tests and record results (criterion 6).

Advisory size: 5 docs, under 30 turns. Larger work returns mismatch/remainder, not weaker claims.

## 7. Commands

Resolved changed-tests command (currently selects all tests):

```sh
AKROGON_BASE=e2075daad1c5b0dd2438ff61d71e606c47819a39 bash -c ': "${AKROGON_BASE:?AKROGON_BASE is required}" && bun test'
```

B runs final full-suite/build/typecheck after this unit. If a test fails, report it with output; do not edit logic outside this brief.

## 8. Done-when, evidence and report

Write `/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/open/helper-compat/helper-compat/implementation/worker-3.md` with factual changes, stale wording eliminated, exact changed-test results, remaining caveats and operator-only template action. Do not commit; final response points to report.

Changed files and reasons: <paths and why>
Tests run: <command and result/evidence path>
Known limitations: <limitations or none known>
Unverified criteria: <criterion and why, or none>
