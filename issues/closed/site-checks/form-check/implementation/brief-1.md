## 1. Goal

Implement unit 1: secret-safe form/mail configuration, real read-only IMAP polling, and truthful forms-only report contracts. Plan D1, D5–D7; the next worker implements browser scanning and commands. Worktree: `/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/worktrees/form-check`. Artifacts/reports only under the authoritative leaf `/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/open/site-checks/form-check/implementation`.

## 2. Numbered acceptance criteria

1. Lazy import-safe readers validate token (16–255 chars `[A-Za-z0-9._~+/=-]`), single email, IMAP host/port/user/password and literal folders, emitting variable names not values. Missing/blank is EnvError; invalid format has a recognized value-free configuration error. No token/password trimming.
2. `pollDelivery({id, config, timeoutMs?})` accepts `[a-z0-9]{12}`, defaults 300000 ms including network waits, searches only named folders read-only (EXAMINE), exact `[pirax-test <id>]` SUBJECT and PEEK header metadata. No body or unrelated-message fetch, folder listing/creation, flags/move/delete writes. Both-folder match favors spam. Connections/locks close on all paths. Auth/folder errors are failed, not silently retried as no mail; logger never leaks auth.
3. Preserve strict existing check RunReport/PageResult/Manifest. Add discriminated FormsRunReport (`mode: "forms"`) with sites/pages/forms and FormsManifest command forms. Add parsePublishedManifest; keep parseManifest check-only. Both modes use private report rendering, manifest-last upload/pruning, local copy and traces excluded. Forms-only has no fake viewports/images.
4. Form failed/rejected gates page/site/run failure; spam/not-verified/unsupported warn; delivered passes. Existing visual/health failures remain. Approval skips validated newer forms manifests but rejects malformed manifests and still selects the newest check.
5. Real SMTP/IMAP selftest sends one harmless tagged mail, verifies delivery and an unsent-ID timeout, compares counts and candidate UID/flags before/after polling, retains sanitized summary/read-only operation facts and leaves mailbox unchanged (apart from deliberate SMTP arrival). No auth mock. Can be completed in later unit if prerequisite requires escalation; name it precisely.

## 3. Read-first list

- Authoritative `plan.md` sections D1/D5/D7/D9 and AC5–7, design.md.
- README.md; plugin/pirax-form-test/README.md (mail contract).
- src/env.ts, src/report/{model,manifest,html,writer}.ts, src/commands/{common,approve}.ts.
- tests/{report,commands,env}.test.ts; src/store.ts; scripts/store-selftest.ts as real-service/sanitized-evidence pattern.
- /home/rudi/.pi/agent/skills/implement-issue/ponytail.md.

## 4. Change list and needed interfaces

New `src/forms/config.ts`, `src/mail/{config,imap}.ts`; update report four files and approve.ts; add ImapFlow and SMTP test sender/types to package.json/bun.lock. New `test/forms/{config,imap,report}.test.ts` as needed and `mailbox-selftest.ts`; adjust existing report/commands assertions.

Return exact exported types/functions to next worker. Need readFormConfig, readImapConfig, pollDelivery, FormsRunReport/FormsManifest, parsePublishedManifest and forms-aware renderer/writers/status. Existing writers must remain compatible with old check callers. Existing CommandResult.report remains check-only; do not implement forms command/runner here. Configuration errors must be recognized by common.configurationError/safeError (small integration in common.ts allowed). Test-only SMTP config can live in selftest. Script `mail:selftest` points to selftest.

## 5. Do-not, reasons and exceptions

1. Never open, print, append or edit `.env` or `.env.*`, including the example. Run scripts requiring secrets via `bun --env-file=.env ...`; presence checks print only names with present/absent. Never print raw error objects, credential values, signed URLs or protocol logs. Required names are already present; missing/unusable human-provided credentials must be reported as a blocker, not requested in chat.
2. Do not modify plugin PHP, capture/compare, site lists, or browser/command unit scope. No new production test flags, fake authentication, mailbox writes, unrelated content fetches or hardcoded secrets.
3. No full suite, commits, lifecycle commands or issue files inside the worktree. Return a mismatch with actual interface/scale evidence and smallest correction instead of changing locked scope; only a revised brief authorizes an exception.

Reasons stay attached: secrets/privacy and read-only mailbox are hard boundaries; other units own browser/commands; B owns full verification/commit/phase. Exceptions require a revised brief, never a guessed permission.

## 6. Ordered steps

1. Derive failing targeted tests for config, exact matching/deadline and report/status/approval criteria before implementation. Record red output.
2. Implement minimal lazy config and narrow ImapFlow module; inspect installed API to establish EXAMINE/PEEK and bounded IO (not guessed).
3. Extend strict report contracts/parser/render/writer and approval selection; retain current check behavior except form gating. Implement targeted tests green.
4. Build real mailbox selftest and run it using private env-loaded values. Counts snapshot occurs after SMTP arrival settles; only fetch tagged candidate flags and folder status, no unrelated bodies. Run default five-minute unsent timeout once. If observed physical prerequisite blocks, return named blocker immediately with evidence (no values).
5. Return report with all four required fields and exact exported interface summary for next worker. About 14–18 files, advisory under 100 turns; scale mismatch should identify remaining work, not silently omit it.

## 7. Commands

No changed-test runner is configured. Base `AKROGON_BASE=08fa818b7517dad3c2c0bfd0c2bef290d97db148`.

Targeted changed-test command: `AKROGON_BASE=08fa818b7517dad3c2c0bfd0c2bef290d97db148 bun --env-file=.env test test/forms/config.test.ts test/forms/imap.test.ts test/forms/report.test.ts tests/report.test.ts tests/commands.test.ts` (create these named files; test/report integration can remain focused helper/browser scope here).

Real invocation required by AC5: `bun --env-file=.env run mail:selftest`.

Do not run the full suite. Dependency install and targeted type diagnostics are allowed; B runs blocking typecheck after units land.

## 8. Done-when, evidence and report

Write `implementation/worker-1.md` under the authoritative leaf. Include pasted red/green outputs, mailbox selftest summary path, interfaces, privacy/PEEK evidence, limitations and any unverified criteria. Browser report verification uses Playwright headless Chromium trace on/video off if added here. No signed URLs in evidence.

Changed files and reasons: <paths and why>
Tests run: <commands and results>
Known limitations: <limitations or none known>
Unverified criteria: <criterion and why, or none>
