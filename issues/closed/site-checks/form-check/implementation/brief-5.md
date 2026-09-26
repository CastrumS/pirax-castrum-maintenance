## 1. Goal

Repair round 1 at reviewed head `83509cba10299f554b087d6392f0d28b7649d767`: all four blocking review findings (A F1/F2, B Fix1/Fix2), with focused documentation/index maintenance. Worktree `/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/worktrees/form-check`; authoritative artifacts `/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/open/site-checks/form-check/implementation`. No commit/phase ownership. Preserve existing working behavior and tests.

## 2. Numbered acceptance criteria

1. **A F1 / D2:** recognize required native GF consent/checkbox groups and FF checkable/T&C inputs using aria-required=true and GF .gfield_contains_required as well as HTML required. Select one usable choice per required group; preserve individual HTML required constraints; optional groups remain untouched. Native Playground GF required checkbox/consent and FF terms/required checkbox reach native confirmation, redirected mail and entry cleanup. The existing server-rejection fixture deliberately rendered optional MUST still be rejected. Helper false still never submits.
2. **A F2 / AC6–7:** automatic redaction covers token and actual credentials/private identifiers: passwords, account users, redirect address, S3 secret/access key. Do NOT globally treat IMAP/SMTP hosts, mailbox folders, S3 endpoint/bucket or licensed ZIP path as credentials. Legitimate occurrences in site/run paths must not trigger UsageError or corrupt local-report paths. Run an actual production command with a synthetic nonsecret configuration value present in both the run path and listed site path; confirm execution, intact local-path logging and real scoped publication. Existing secret scans stay green; no actual credential exemption. Preserve documented bearer-link withholding.
3. **B Fix1 / AC1:** before accepting discovery, reject positively identified HTTP-200 challenge/interstitial surfaces using the existing narrow capture detector. Return explicit failed scan, not []/pass. Ordinary empty pages and ordinary CAPTCHA/Cloudflare mentions are not failures. No protection bypass.
4. **B Fix2 / AC7:** redact supported credential strings represented with valid JSON UTF-16 escapes including astral surrogate pairs and mixed literal/escaped forms. Actual sanitizeTrace must remove them or reject/delete unsafe output. Test retained JSON by parsing it and independently comparing decoded values, not only redactor idempotence/findSecrets. Keep existing raw/percent/nested/HTML/JSON behavior and literal <token> replacement.
5. **Docs/nits:** move the socket lesson line to canonical learnings/LESSONS.md and remove redundant learnings/ACTIVE.md; update README link. Inspect the canonical index solely to maintain it, not as task/lesson input. Document unverified invisible/v3 CAPTCHA and specialized GF phone flows, and that a late forms-config error during check returns2 after captures without a completed report. Do not introduce speculative runtime workarounds for these nonblocking nits. All affected behavioral docs and existing test criteria stay accurate.

## 3. Read-first list

- Authoritative review-A.md, review-B.md, plan.md repair notes; implementation/report.md and worker-4.md for retained native evidence/interfaces.
- src/forms/{fill,evidence,runner,submit,detect}.ts; src/{capture,health}.ts; src/commands/{forms,check,common}.ts; src/mail/config.ts.
- test/forms/{browser,evidence,report,playground}.test.ts; test/forms/{fixtures.php,harness.ts,README.md}; README.md; plugin/pirax-form-test/README.md.
- Existing native test fixture pattern and test/plugin/{harness.ts,fixtures.php,artifacts.ts} only as needed.
- B's reproducible diagnostic sources under authoritative review-B/{probes.ts,trace-privacy.ts}, results .json/.txt (all synthetic, no auth mock).
- /home/rudi/.pi/agent/skills/implement-issue/ponytail.md.

## 4. Change list and needed interfaces

Primary changes: src/forms/fill.ts (required-group logic), evidence.ts (secret scope/encoding), runner.ts (challenge detection), targeted browser/evidence/report tests, native fixtures/playground coverage, docs/index. Keep public command/results/IMAP interfaces unchanged; no mail module change is expected, so preserve its current real SMTP proof without another message. Real scoped Store/test root seams already exist; use them, not a mocked Store/auth acceptance test.

Relevant APIs: scanPageForms(site,page,{runDir,deliveryTimeoutMs?,submissionTimeoutMs?}); fillForm(page,descriptor,config,id); secretRedactor(token?,extraSecrets?); sanitizeTrace(raw,destination,redactor); runForms(sites,store,{runsDir,log,...}); existing shared report publication. Internal short mail deadlines may be used for additional native positive confirmations; primary CLI still exercises both default five-minute waits in the full suite.

## 5. Do-not, reasons and exceptions

1. Never open/print/append/edit .env or .env.*. Env-dependent scripts via bun --env-file=.env, printing results only. No raw credentials, signed URLs or auth logs. Missing physical prerequisites => exact blocker/action report then stop; no chat requests.
2. No plugin PHP edits, committed live-site changes, production form execution, CAPTCHA solving, mocked authentication/delivery, mailbox writes, capture/compare changes or new public test flags. Native test-only PHP fixtures are allowed. Only fresh test/forms-.../ R2 roots, exact-prefix cleanup.
3. Do not weaken tests, required markers, privacy guarantees, deadlines or original acceptance. No source commits/lifecycle calls or artifacts under worktree issues/. New scope/interface conflict returns concrete mismatch; only B's revised brief authorizes expansion.

Reasons/exceptions remain attached: protect real authorization/data/privacy and sequential ownership; B owns final validation/commit/review. The specified native fixture, doc/index and focused production repairs are authorized, not general scope growth.

## 6. Ordered steps

1. Add meaningful regression assertions BEFORE repairs for all four findings; record red (existing B probes are independent starting evidence). Derive native required-group fixtures using audited real markup/APIs, not an invented HTML required attribute.
2. Repair shared fill, redaction and scan boundaries minimally; prove targeted green and independent decoded-JSON privacy. Preserve native server rejection and no-submit cases.
3. Run actual native positive checkbox/terms and real scoped command collision proof; retain sanitized report/action trace/summary and clean prefixes/browser in finally. Update docs/index/nit limitation notes.
4. Freeze source, run resolved changed tests once; repair any owned failures then rerun. Return four-field report with before-head and exact evidence. About 10–13 files, advisory under 100 turns; report remainder if interrupted rather than rerun completed work blindly.

## 7. Commands

Resolved changed runner, base remains the configured base:
`export AKROGON_BASE=08fa818b7517dad3c2c0bfd0c2bef290d97db148; : "${AKROGON_BASE:?AKROGON_BASE is required}" && bun --env-file=.env test`

Export VISUAL_NODE=/home/rudi/.local/share/mise/installs/node/24.21.0/bin/node and prepend its bin directory to PATH. Targeted red/green/type diagnostics and required native/scoped flow invocations are allowed. B owns separate final blocking suite/typecheck; do not send another SMTP selftest message unless mail implementation actually changes and evidence becomes stale.

## 8. Done-when, evidence and report

Write authoritative implementation/worker-5.md and evidence/worker-5/ logs. Report each review finding addressed, literal commands/results/red-green, native required-field confirmations and preserved rejection, path-collision command result, independently decoded trace privacy, exact artifact/cleanup paths, before-head and limits/unverified items. Browser evidence headless Chromium, trace on/video off. Keep all four done fields explicit; no claim of full-suite green for intermediate/mixed-source results.

Changed files and reasons: <paths and why>
Tests run: <commands and results>
Known limitations: <limitations or none known>
Unverified criteria: <criterion and why, or none>
