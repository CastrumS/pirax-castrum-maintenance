## 1. Goal

Final unit: real native Playground/production CLI/scoped R2 verification, repair demonstrated integration defects, and docs (plan D9–D10, AC3–8). Worktree `/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/worktrees/form-check`; authoritative artifacts `/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/open/site-checks/form-check/implementation`. Preserve predecessor implementation. Worker-3's new browser tests passed, but its full changed suite had one mailbox cleanup failure; resolve it without weakening assertions.

## 2. Numbered acceptance criteria

1. Reuse real Playground harness, licensed GF **3.1.2**, FF **6.2.14**, built helper ZIP. Real wp-admin login/upload/activation/settings (not direct option setup for the primary proof). Native form APIs may create disposable fixtures via serialized `php<T>` bridge. Repair round 1 under brief-5.md additionally proves native GF required checkbox/consent and FF terms/required checkbox reach confirmation, while the optional-rendered native server-rejection fixture remains rejected. Installed fixture text must be read back exactly and served marker verified; explicit result types.
2. Run actual `bun run forms local --sites <generated-list>` from disposable harness package using test/fixtures/cli.ts and production dispatch, real scoped Store, default five-minute poll. At least one GF and FF browser submission confirms; both log redirected mail/tag/header and native entry cleanup. Playground cannot send mail: expect truthful timeout failed/exit1 after two deadlines, never fake delivered. Record argv/cwd/report/traces and exact outcomes. Verify root alias separately (worker3 already covered empty/usage). No live production sites.
3. Independently verify helper-false unchanged mail AND entries; upload/no-marker unsupported; required client and native server rejection => rejected, later forms continue; multiple forms separate; native GF supported AJAX and FF AJAX confirmation association. Short internal delivery deadlines allowed in negatives, no fake-mail provider. Check wiring attaches forms/status without altering screenshots. Preserve worker2 real SMTP/IMAP success (no need to send another message).
4. Scoped R2 `test/forms-.../` only; manifest-last, no baseline access for forms-only/no trace uploads, failure/warning status/exit, newer forms skipped by approval, malformed still fails. Render retained/fetched private report with headless Chromium trace on/no video, never navigate signed URL. Retain sanitized summary and cleanup counts; always stop fixtures/browser and verify only that prefix empty.
5. Required changed tests and visual regression selftest pass, including the outstanding silent-peer cleanup assertion. Diagnose root cause with fail-first evidence, retain assertion strength (no blind timeout increases/skips). All secrets/raw+encoded absent in every new retained summary/report/log/unpacked trace. Existing plugin harness only redacts token/ZIP path: your wrapper must additionally sanitize credential/address values in its artifacts before retention using production redactor, with literal <token> for new evidence.
6. Update all four planned docs and stale claims: root README; new test/forms/README; plugin README rollout link; test/plugin README cross-link. Repair round 1 consolidates the socket lesson into the canonical LESSONS.md index and documents the review's nonblocking invisible/v3 CAPTCHA, specialized phone and config-error report limitations. Document commands/env-name acquisition/format/exits, lazy config, check now submits only helper opted-in sites, helper=true is operator attestation NOT installation/token proof, staged rollout needs explicit go-ahead. Describe outcomes, five-minute limits, local log vs independent SMTP proof, unsupported flows, trace privacy/zip prerequisites, pinned ImapFlow patch, forms-only manifest/approval exclusion, scoped tests/time budgets/cleanup/count-race limitations.

## 3. Read-first list

- Leaf plan.md D9/D10, AC1–8/checklist; design.md; implementation/worker-3.md interfaces and final failures; worker-2-resume.md evidence.
- README.md; test/plugin/{README.md,harness.ts,artifacts.ts,fixtures.php,core.test.ts,adapters.test.ts}; plugin/pirax-form-test/README.md.
- src/forms/{runner,fill,submit,evidence}.ts; src/commands/{forms,check,common}.ts; test/forms/{browser,imap,report}.test.ts; test/fixtures/cli.ts; scripts/visual-selftest.ts; test/wp/playground.ts; package.json.
- /home/rudi/.pi/agent/skills/implement-issue/ponytail.md. Copy test/plugin core's genuine settings form and existing scoped visual CLI wrapper.

## 4. Change list and needed interfaces

New test/forms/{fixtures.php,harness.ts,playground.test.ts,README.md}; extend test/fixtures/cli.ts root allowlist to `test/(visual|forms)-.../`, preserving visual behavior. Update docs listed above and compatibility in visual-selftest only if needed. Minimal src/forms/commands/mail and regression test fixes are explicitly authorized when concrete real integration/failure evidence demonstrates a defect; document red/green and do not weaken safety contracts.

Available: scanPageForms(site,page,{runDir,navigationTimeoutMs?,submissionTimeoutMs?,deliveryTimeoutMs?}); populateForms; runForms(sites,realStore,RunOptions); dispatch('forms',args,{store,runsDir,log,forms?:timings}). FormsRunReport mode forms, no viewports; check report stays strict. See worker3 exact interfaces. Internal short deadlines ONLY for negatives; primary CLI default five minutes. Existing report/R2 tests retain evidence already.

Outstanding frozen-suite output (`evidence/worker-3/changed-tests-frozen.txt`): `183 pass, 1 fail`; `test/forms/imap.test.ts:57` expected silent peer open count **0**, got **1** after 2-second close-event wait; poll outcome/detail/deadline passed. Three isolated 15/15 reruns passed. Determine client leak vs Bun peer half-close/observation before repair, not a flaky-test waiver.

## 5. Do-not, reasons and exceptions

1. Never open/print/edit `.env` or `.env.*`; scripts needing values run through `bun --env-file=.env`. No raw credential/error/signed URL output. Physical missing credential/permission => exact blocker/action report then stop; no chat questions.
2. No plugin PHP changes, committed site changes, production rollout, authentication mocks, mailbox mutation/body reads, fake delivery, CAPTCHA solving, weakened visual algorithms or public test flags. Only disposable loopback forms and generated R2 roots may mutate. Existing test-only PHP fixtures/hooks are allowed, never plugin code.
3. No commits/lifecycle calls or issue artifacts in worktree. Return newly discovered scope/interface mismatch with evidence; B's revised brief is the only scope exception.

Reasons/exceptions: secrets, real authorization/mutations and operator rollout limits are binding; B owns final checks/commit/phase. Explicit integration repairs above are allowed, not arbitrary scope growth.

## 6. Ordered steps

1. Diagnose mailbox cleanup regression with meaningful fail-first evidence; repair shared cause or proven peer protocol bug without reducing observable cleanup guarantee.
2. Derive native fixture/CLI assertions, implement harness/fixtures and run production flows (AC1–4); repair demonstrated consumer defects with targeted red/green. Tests set per-file timeout and primary CLI >=900000ms.
3. Sanitize/scan retained evidence, record root cleanup; update docs from observed behavior (AC5/6). Required check invocation against loopback covers actual capture+forms attachment; no shortcut around command wiring.
4. Run frozen configured changed tests after all code changes. Run real visual:selftest and retain summary. If a failure needs repair, rerun affected tests and configured checks afterwards. About 8–12 files plus evidenced fixes, advisory under 100 turns; report exact remainder if interrupted.

## 7. Commands

Changed tests: `export AKROGON_BASE=08fa818b7517dad3c2c0bfd0c2bef290d97db148; : "${AKROGON_BASE:?AKROGON_BASE is required}" && bun --env-file=.env test` (same resolved runner with explicit env loading).

Export Node24 first in PATH and VISUAL_NODE=/home/rudi/.local/share/mise/installs/node/24.21.0/bin/node. Required flows: `bun run build:plugin`; `bun --env-file=.env test test/forms/playground.test.ts`; disposable package `bun run forms local --sites ...`; `bun --env-file=.env run visual:selftest`. B separately runs final full suite/typecheck. No forms/check all against committed sites.

## 8. Done-when, evidence and report

Write authoritative implementation/worker-4.md, logs evidence/worker-4/. Include all changed files/reasons; exact commands/results/red-green; native versions, invocation cwd/argv, report/trace/summary paths; privacy and prefix cleanup proof; limits/unverified criteria. Preserve earlier mailbox summary. Do not claim log observation as delivery or intermediate mixed-source suite as green.

Changed files and reasons: <paths and why>
Tests run: <commands and results>
Known limitations: <limitations or none known>
Unverified criteria: <criterion and why, or none>
