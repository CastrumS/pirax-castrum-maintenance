## 1. Goal

Implement the browser form checker and production commands, plan D2–D4/D6/D8, AC1–4/6–7. Worktree `/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/worktrees/form-check`; authoritative reports `/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/open/site-checks/form-check/implementation`. Predecessor implemented lazy config, mailbox polling and strict forms-only report contracts. Final worker owns Playground integration and docs; return concrete interfaces for it.

## 2. Numbered acceptance criteria

1. Scan every listed page once at desktop 1440×900; distinguish GF `.gform_wrapper form`, FF `form.frm-fluent-form`, and other actual forms. Deduplicate, preserve multiple identities, emit unknown `unsupported` without filling. No forms is `[]`; navigation/discovery failure, including a positively identified HTTP-200 challenge/interstitial, is an explicit failed scan result, never `[]`. Repair round 1 executes under brief-5.md. Empty selection needs no browser/credentials/R2.
2. Fill only supported visible/enabled writable basic controls deterministically, emails with configured address. Required checkbox groups use the audited plugin's aria-required/input and GF gfield_contains_required container markers as well as HTML required; choose one usable option per required group and leave optional groups alone. Generate cryptographically random `[a-z0-9]{12}` per attempt. Put exactly `<token>-<id>` in first eligible textarea, else plain text input; preserve hidden nonce/honeypot controls. Preinspect entire form: upload (even hidden), no marker, unsatisfied marker length/pattern/readonly, custom/multi-step/payment/password/ambiguous flows => unsupported without submission. Never truncate marker. Bounded stabilization; recheck intact marker immediately before submit.
3. Helper false: fill/native validate, always not-verified with detail, no submit. Install protection before navigation: block mutating HTTP/WebSocket and page-originated form/GET serialization (including autonomous input/change handlers). Helper true permits only selected form's audited same-origin GF/FF route during its one browser submit; no unrelated writes, external actions or direct request submission. Fresh context per descriptor so earlier navigation cannot erase later forms; verify identity again.
4. Require new specific GF `#gform_confirmation_message_<id>` or associated FF `.ff-message-success`; old/other-form success and HTTP 200 are not proof. Native client/server refusal => rejected with sanitized message; timeout/browser/transport => failed. Known unsupported FF CAPTCHA => not-verified before submission. Never solve CAPTCHA or auto-resubmit; later forms/pages continue. Only confirmed submissions poll persisted ID, default five minutes; mail alone cannot override rejection.
5. Both commands publish private/local reports, manifest last and last-ten retention. Forms-only has no visual/baseline access. Check completes unchanged capture/comparison first, then attaches forms/recomputes status preserving prior operational failures. Failed/rejected => exit1; unsupported/not-verified/spam => warning/exit0 alone. Usage/missing/invalid config =>2; operational/publication=>1. Config lazy: no forms requires no mail credentials; validate IMAP config before opted-in submission.
6. Actual credentials/private identifiers and token never appear in retained HTML/JSON/logs/trace contents/names, raw or URL/JSON-encoded (including UTF-16 surrogate pairs); token becomes literal `<token>`. Nonsecret host/folder/bucket/endpoint/ZIP-path values must not corrupt legitimate paths or cause configuration errors. Assert decoded retained JSON independently, not only redactor idempotence. Forms contexts: trace on, screenshots/snapshots/sources/video off. Raw traces private/transient, scrub/verify before retention, delete raw/temp on every path; sanitation failure fails operation and leaves no unsafe trace. No trace upload. Direct command and CLI errors also sanitize. Real Chromium fixtures demonstrate fill/no-submit/confirmation/error/privacy cases, trace retained; root CLI invocation verifies empty/usage without remote writes.

## 3. Read-first list

- Leaf plan.md D2–D4/D6–D8 and AC1–4/6–7; design.md; implementation/worker-1.md and worker-2-resume.md.
- README.md; plugin/pirax-form-test/README.md; test/plugin/{README.md,artifacts.ts,adapters.test.ts,fixtures.php}; plugin/pirax-form-test/includes/{marker,gravity-forms,fluent-forms,mail}.php (read-only contracts).
- src/forms/config.ts; src/mail/{config,imap}.ts; src/report/{model,manifest,html,writer}.ts; src/commands/{common,check,approve}.ts; src/{capture,env,sites}.ts.
- tests/{commands,report,capture,env}.test.ts; package.json; bunfig.toml; tsconfig.json. Copy capture's isolated context/settings pattern, NOT secret-unsafe visual tracing.
- /home/rudi/.pi/agent/skills/implement-issue/ponytail.md.

## 4. Change list and needed interfaces

New src/forms/{detect,fill,submit,evidence,runner}.ts and src/commands/forms.ts; common/check wiring and package forms/test:forms scripts. New test/forms/{browser,evidence}.test.ts; extend tests/commands.test.ts. Keep implementation minimal and conservative rather than guessing plugin flows.

Available: readFormConfig()->{token,address}; readImapConfig(); pollDelivery({id,config,timeoutMs?,onCommand?})->{outcome,detail}; FormsRunReport={mode:'forms',runId,sites:[{slug,url,pages:[{path,pageKey,forms}]}]}; FormResult={selector,plugin:'gravity'|'fluent'|'unknown',outcome,detail}. Writers/status already accept check/forms. Keep CommandResult.report check-only; introduce FormsCommandResult. Add RunOptions.forms internal timing options only as needed; no mailbox-success provider/test skip. Expose scanPageForms/populateForms reusable orchestration, evidence paths under runDir. Return exact callable interfaces. runForms/runCheck boundaries must produce documented exits.

## 5. Do-not, reasons and exceptions

1. Never open/print/edit `.env` or `.env.*`; env-dependent scripts via `bun --env-file=.env`. No raw secret/error/signed-URL logs. Missing usable credentials => named blocker/action, no chat request.
2. No plugin PHP edits, real-site form execution, capture/compare changes, baseline weakening, fake auth/delivery, CAPTCHA solving, direct browser-bypassing submissions or production test flags. Local loopback fixtures only; final worker owns real Playground/R2 CLI integration.
3. No commit/lifecycle commands or artifacts under worktree issues/. Interface/scope conflicts return a mismatch with actual evidence and smallest correction; only B's revised brief authorizes exceptions.

Reasons/exceptions: locked safety/privacy/isolation and sequential ownership; B owns final checks/handoff. Revisions authorize mechanisms, never silently weaken acceptance.

## 6. Ordered steps

1. Derive real Chromium red tests before coding for each browser/privacy criterion, including input-triggered GET/POST traps, hidden uploads, constrained markers, multiple forms, stale/foreign confirmations, validation/error redaction and continuation.
2. Implement production sanitizer/detection/fill/submit and isolated request policy; prove green. Preserve native form data/nonce/plugin JS and refuse unsupported behavior.
3. Implement runner orchestration and command wiring/exit boundaries; test lazy config, empty selection, root alias/usage, forms report shape/status, no visual calls.
4. Run configured changed tests, retain sanitized trace/evidence and fill report. Approx. 11–14 files, advisory under 100 turns (not a hard cutoff); return concrete remainder if interrupted.

## 7. Commands

Resolved changed tests: `export AKROGON_BASE=08fa818b7517dad3c2c0bfd0c2bef290d97db148; : "${AKROGON_BASE:?AKROGON_BASE is required}" && bun test`.

Export PATH with `/home/rudi/.local/share/mise/installs/node/24.21.0/bin` first and VISUAL_NODE pointing to its node for existing Playground tests. Targeted red diagnostics and type diagnostics allowed. B separately owns final blocking suite/typecheck. Never invoke against committed live sites.

## 8. Done-when, evidence and report

Write authoritative implementation/worker-3.md and evidence/worker-3/ logs. Include actual exported signatures and usage for next worker; red/green and real command exits; retained local Chromium trace path (trace on/video off); sanitizer scan results; limitations and unverified Playground criteria (next unit). No invented delivery evidence.

Changed files and reasons: <paths and why>
Tests run: <commands and results>
Known limitations: <limitations or none known>
Unverified criteria: <criterion and why, or none>
