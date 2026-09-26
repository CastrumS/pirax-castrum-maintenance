## 1. Goal

Finish the **remaining first-unit work only**: D5 literal-folder/PEEK/no-list discrepancies, real mailbox proof (AC5), and retained report evidence (AC6/8). Preserve all landed edits. Worktree `/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/worktrees/form-check`; authoritative artifacts `/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/open/site-checks/form-check/implementation`.

## 2. Numbered acceptance criteria

1. Production `pollDelivery` opens only the two exact configured folders with EXAMINE, no folder listing/discovery/namespace rewriting; searches the full `[pirax-test <12-char-id>]` tag; fetches only candidate Subject headers using BODY.PEEK and rechecks decoded exact tag. No unrelated mail, bodies, writes or credential logging. Default 300000 ms deadline bounds connection/commands/cleanup; no submission/mail polling retry abstraction. Both-folder matches favor spam.
2. Real SMTP selftest sends exactly one harmless tagged message, confirms delivered or delivered-spam and full five-minute unsent-ID timeout. Counts/candidate UID/flags before/after both polls are identical or explicitly fail/inconclusive. Retain safe command facts establishing EXAMINE and PEEK, no LIST/mutations/body. No deletion of sent mail.
3. Report test retains report/browser trace and a sanitized summary identifying local paths, fresh scoped R2 prefix and verified cleanup, rather than removing its only end-to-end evidence. No signed URL retention or remote trace upload.
4. All existing unit/report functionality remains intact. Meaningful regression tests demonstrate red then green for contract fixes. No mocked authentication replaces real-service proof.

## 3. Read-first list

- Leaf plan.md D5/D6/D7/D9 and implementation notes, design.md, implementation/worker-1.md and report.md (previous blocker now cleared by B's names-only check).
- src/mail/{config,imap}.ts; test/forms/{imap.test,mailbox-selftest,report.test}.ts; src/forms/config.ts; src/report/{model,writer}.ts.
- README.md and test/plugin/README.md (runtime/testing); installed ImapFlow API/source, existing read-only network tests as pattern.
- /home/rudi/.pi/agent/skills/implement-issue/ponytail.md.

## 4. Change list and needed interfaces

B revision 2026-09-26 after worker-2 mismatch: explicitly authorize a reproducible Bun dependency patch (`patches/` plus package.json/bun.lock) to exactly pinned ImapFlow 2.0.7, including both shipped runtime builds and types as needed. Add opt-in literal/no-discovery mode: bypass startup namespace discovery (including LIST fallback), use exact supplied mailbox path without namespace/INBOX normalization, and omit select metadata LIST only in that mode. Preserve default library behavior. Enable this mode in production polling and selftest snapshot clients; do not invent a second IMAP parser. Test the patch's actual mechanism and decoding before/after, then prove real authenticated EXAMINE/PEEK operation through the selftest. Pure implementation/encoding diagnostics are allowed but are not auth proof. No provider credential values in patch/tests. Other changes remain limited to mailbox module/tests/selftest and report evidence test. Keep existing exported pollDelivery({id,config,timeoutMs?,onCommand?}) result and config signatures. All configuration names now nonblank, but validity/network/folders are unverified. The observed library mismatch is now resolved by the authorized dependency patch scope above; proceed, do not return the same mismatch again. Use `{uid:true,headers:['SUBJECT']}` for PEEK and the installed MIME decoder for unfolded uniquely identified Subject; validate malformed/duplicate fields conservatively. Keep exact exported poll interface. Return only newly observed conflicts or physical prerequisites.

## 5. Do-not, reasons and exceptions

1. Never open, print, append or edit `.env` or `.env.*`. Execute env-dependent code only via `bun --env-file=.env`; names-only checks print present/absent. No raw network/error/credential/signed URL logs. Missing/invalid human prerequisites must be precisely reported, not solicited in chat.
2. No plugin PHP, live sites, visual algorithms, browser forms/CLI work, mailbox writes/body reads or authentication mocks. Only generated scoped `test/forms-.../` storage roots may be changed remotely.
3. No commits/lifecycle commands, whole-unit reimplementation or issue artifacts inside worktree. Return a mismatch rather than change scope; exception is a revised brief from B.

Reasons/exceptions: protect secrets/read-only mail and sequential ownership; B owns final suite/commit/phase. Exceptions require B's revised brief, never guessed permission.

## 6. Ordered steps

1. Inspect remaining gaps, derive smallest failing protocol/decoding/exact-folder tests before changing src/mail/imap.ts (AC1/4).
2. Repair and verify the client contract, preserving deadlines/error safety (AC1).
3. Run real mailbox selftest (AC2). If a physical credential/folder/provider prerequisite is observed, immediately write report with exact operator action and stop; do not send repeated messages while debugging missing prerequisites.
4. Retain report test evidence and summary with cleanup proof (AC3), then run configured changed tests and report all results (AC4).
5. About 4–7 files, advisory under 60 turns; scope overrun returns evidence and remainder, not omitted work.

## 7. Commands

Resolved changed-test command (config now supplies this; supersedes old brief):
`export AKROGON_BASE=08fa818b7517dad3c2c0bfd0c2bef290d97db148; : "${AKROGON_BASE:?AKROGON_BASE is required}" && bun test`

Use compatible Node24 for Playground via `export VISUAL_NODE=/home/rudi/.local/share/mise/installs/node/24.21.0/bin/node` and PATH if required. Targeted red diagnostics are allowed. Required real invocation: `bun --env-file=.env run mail:selftest`. B owns separate final full suite and blocking typecheck.

## 8. Done-when, evidence and report

Preserve the initial mismatch report. Write the revised execution return to authoritative implementation/worker-2-resume.md with changed paths/reasons, red/green outputs, mailbox summary/retained report/trace paths, installed client wire/API evidence, exported interface changes (ideally none), limits and unverified criteria. Logs under implementation/evidence/worker-2/. Headless Chromium trace on/video off for report evidence. If blocked, report exactly what was attempted and whether a message was sent.

Changed files and reasons: <paths and why>
Tests run: <commands and results>
Known limitations: <limitations or none known>
Unverified criteria: <criterion and why, or none>
