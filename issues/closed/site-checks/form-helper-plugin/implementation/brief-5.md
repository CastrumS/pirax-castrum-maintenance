## 1. Goal

Finish the plan's human documentation and retained acceptance evidence (D10–D12, AC8), without expanding plugin behavior. One final documentation/evidence unit after safety worker 4; B then runs the full suite and commits.

## 2. Numbered acceptance criteria

1. All three planned docs exist and describe actual implemented interfaces/commands/limits: root README, packaged plugin README, test/plugin README. No invented checker/R2/IMAP features, no claims that local mail logs verify live delivery. Exact supported GF/FF versions and conservative rejection paths clearly documented.
2. Retained browser evidence has both sanitized Playwright action traces and a separately sanitized request/response ledger (method/URL/status/resource type suffice; no headers/cookies/body needed), with screenshots/snapshots/sources/video off. Plan implementation notes explain why network capture cannot be part of the trace without snapshots. Known credential value/encoded forms absent from all retained output.
3. Evidence manifest includes suite/scenario identification, versions, paths to mail/feed/entry/network/trace artifacts and built production ZIP digest when that ZIP is under test. Never include secrets/licensed source. Existing safe action tracing preserved.
4. Packaged README included by deliberate build allowlist/test update; `bun run build:plugin` still creates uploadable plugin-only ZIP and targeted upload/settings + harness evidence tests pass. No new production behavior or weakened assertions.

## 3. Read-first list

- Authoritative leaf `/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/open/site-checks/form-helper-plugin/plan.md`, checklist docs and implementation notes.
- Same leaf `implementation/worker-{1,2,3,4}.md` for actual interfaces, safety fixes, test evidence and unresolved limitations; use worker4/current code over outdated worker3 limitations.
- `/home/rudi/.pi/agent/skills/implement-issue/ponytail.md`.
- Current `package.json`, plugin bootstrap/settings/compatibility/cleanup modules; `scripts/build-plugin.ts`.
- Existing `test/plugin/{harness,artifacts,harness.test,core.test}.ts` as pattern. No existing human/agent README pattern; all docs here are new.

## 4. Change list and needed interfaces

Own `README.md`, `plugin/pirax-form-test/README.md`, `test/plugin/README.md`, plus `learnings/LESSONS.md` and `learnings/history/2026-09-25-form-helper-plugin.md`; narrow evidence updates in `test/plugin/harness.ts`, `artifacts.ts` if needed, `harness.test.ts`; README additions to allowlists in `scripts/build-plugin.ts` and `core.test.ts`.

Root: build/install/test entry points, plugin/testing links, no invented app commands. Plugin: regular wp-admin upload/activation/settings, manage_options/nonce behavior, secret pattern `[A-Za-z0-9._~+/=-]{16,255}`; blank keeps existing token, clear checkbox disables NEW marking; existing marked queued work remains protected. Shared `<token>-<id>` `[a-z0-9]{6,32}`, exact subject/header/recipient/options and blocked message. No secrets embedded in source. Describe cron traffic/timing, async retry + exception handling, native cleanup, token rotation (clear pending tests first), uninstall and guarded rollout one site → group → all with go-ahead. Exact audited GF3.1.2 and FF6.2.14, reCAPTCHA2 tested, other security/honeypot unchanged, unsupported versions/integration callbacks/payment paths fail closed. Describe actual residual limitations from current worker4 report, not ones it repaired.

Record one reusable lesson from worker3's observed regression: persist async classification at submission time instead of reinterpreting queued data against mutable credentials. Add one active line naming mechanism/date/history path; history records the actual ordinary-entry deletion/rotation leak, native test evidence paths, repair and abstract learning without secrets. Do not turn historical evidence into a blanket rule or invent a new failure.

Testing doc: pinned Playground/Playwright, Node child native module why, Bun+Node+zip/unzip+compiler prerequisites, real WordPress and native form/queue tests, no auth mocks, local mail observer only, siteverify boundary, credential names/acquisition (licensed zip/account Downloads; FORM_TEST_TOKEN private generated shared token). Never open/write environment files. Document `bun --env-file=<registered-repo>/.env ...` from a worktree and ordinary `bun test` when env already supplied. Build `bun run build:plugin`; `bunx playwright install chromium`; targeted commands and artifact paths/privacy.

Harness `browser`/`closeBrowser`/`saveEvidence` owns evidence. Add separately sanitized network.jsonl using Playwright events; avoid asynchronous listener work racing closure. Test probe includes configured token in request URL and typed value; ledger must record requests but scrub that token/encoded forms. Existing artifacts helpers redact errors and sanitize trace ZIP. No DOM snapshots to gain network data.

## 5. Do-not, reasons and exceptions

- No new plugin behavior, dependencies, broad refactor, commits, lifecycle commands or full suite; B owns final checks. Do not edit worktree issues/.
- Never open/print/write `.env`/`.env.*` (including `.env.example`); document variable names in test README. Load test credentials with Bun --env-file, print results only. No live-site/mailbox/R2 operations.
- Do not enable screenshots/snapshots/video, retain auth headers or credentials in ledger, or claim delivery/compatibility not actually verified. Privacy and honest scope matter.
- Return mismatch with evidence and smallest correction instead of changing scope/interfaces; only revised brief from B is an exception.

Reasons are a truthful documented deliverable, privacy, and clean final ownership; B may refine an interface but never authorize secret exposure or false claims.

## 6. Ordered steps

1. Add a failing harness evidence assertion for network ledger and manifest paths/digest before implementing evidence changes.
2. Update harness retained network ledger + manifest; keep all logs/ZIPs secret-scanned.
3. Write three concise docs grounded in actual current code/reports, then add packaged README to explicit archive allowlists.
4. Run targeted tests once green; report paths/results/limitations. Avoid redundant already-successful suite reruns.

Advisory ~9 files under 55 turns; keep docs concise and report any scale mismatch explicitly.

## 7. Commands

`AKROGON_BASE=93cf3b7f6b99f3a34be7f69c004345c439fa6a76 bun --env-file=/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/.env test test/plugin/harness.test.ts test/plugin/core.test.ts --timeout 180000`

Build as needed. Do not run the whole suite.

## 8. Done-when, evidence and report

Write `/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/open/site-checks/form-helper-plugin/implementation/worker-5.md` with pasted results/red-green, artifact paths, docs updated and explicit limitations. Code only in `/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/worktrees/form-helper-plugin`.

Changed files and reasons: <paths and why>
Tests run: <commands and results>
Known limitations: <limitations or none known>
Unverified criteria: <criterion and why, or none>
