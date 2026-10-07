## 1. Goal
Finish retained unit2 implementation/testing/report in /home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/worktrees/helper-self-update-u2. Prior worker returned only 'waiting' without report/commit. NO unit2 test/agent process is running now; pre-reboot Task IDs are stale and must not be waited on. Start a fresh session from current diff, not a fresh implementation.

## 2. Numbered acceptance criteria
1. Native Pro6.2.16 FF refusal exactly `Pirax test blocked: awaiting audit of Fluent Forms Pro 6.2.16`; audited Inventory remains exactly generic `Pirax test blocked: integrations could not be suppressed`; no entry/mail/feed effects, unchanged ordinary controls.
2. Version-only requires known nonempty mismatches, no independent cause, all unaudited callbacks' declaring files under mismatched exact plugin directories. Unknown/missing versions, unrelated/unknown callbacks, unsupported forms and audited binding/removal failures generic. Never relax gate.
3. GF early AJAX retains no-unaudited-GF-API boundary and marker/config precedence, but known independently broken audited CleanTalk generic binding must still make a compound GF-version block generic. Concrete likely defect in retained code: gf_ajax_guard skips suppression/check when GF3.1.3, then compatibility_facts inspects submission hooks, not plugins_loaded; with audited CleanTalk wrapped/moved (`pirax_harness_ct_ajax_rebind='wrap'` or `'early'`) it incorrectly says only awaiting GF. Test this real combination before fixing; inspect binding without removing it or calling unaudited GF APIs.
4. Native tests and configured changed command completed with actual outcomes; safe last-block option remains autoload-off and public callback shapes intact. Commit and complete report, not a waiting message.

## 3. Read-first list
Current git diff (production PHP now implemented), original brief-2.md for exact ownership/contract, plan D5–D6, includes compatibility/GF/FF/marker and compatibility.test.ts/safety.test.ts. /home/rudi/.pi/agent/skills/implement-issue/ponytail.md. Copy native gf_ajax_version/ct_ajax_rebind fixtures and VERSIONS cases.

## 4. Change list and needed interfaces
All uncommitted at base2689aaa: four PHP files, three test files. Own only these plus narrow mu-plugin.php fixtures if needed; no docs/harness/updater changes. Most implementation exists. Remaining work: fix actual defects, prove outcomes, collect artifacts, commit/report. Source ownership internals public hook/priority/id shapes and boolean support interfaces kept. Unit1 independent in other worktree; do not wait for it.

## 5. Do-not, reasons and exceptions
Never open/read/write .env; Bun --env-file loads it, values never printed/asserted. Strip signing seed from test children. No GitHub writes, code outside ownership, auth mock, silent skip, changed audit pin or weaker gate. Do not poll stale pre-reboot background task IDs; no process exists. Do not return 'waiting': actively wait for newly started commands in this session to finish, then report. Return evidence-backed mismatch for scope/interface issues; exception only revised brief. Reasons are safety/privacy, independence and real completed evidence; exceptions require revised brief.

## 6. Ordered steps
1. Inspect retained diff, add actual mixed early-guard regression and run fail-first (or report it already passes with evidence).
2. Repair without unsafe GF API or suppression side effects; complete existing native criteria and configured changed run. Tests may take 30–40min; monitor/wait rather than ending session. No timeout-driven scope weakening.
3. Commit own files and write implementation/worker-2.md under authoritative leaf with command summaries/native artifact paths and criteria status. Return commit ID.
Advisory seven files already implemented, under 40 further turns; concrete mismatch if scope expands.

## 7. Commands
Dependencies installed. Resolved changed command: AKROGON_BASE=2689aaa3bd69a9a46cc77788fdc5219354cc923a bun --env-file=/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/.env -e 'delete process.env.PIRAX_HELPER_SIGNING_KEY;const p=Bun.spawn(["bash","-c",": \"${AKROGON_BASE:?AKROGON_BASE is required}\" && bun test"],{env:process.env,stdout:"inherit",stderr:"inherit"});process.exit(await p.exited)'. Targeted fail-first/native checks allowed. B owns final full checks. Retain logs outside worktree under authoritative implementation folder; never raw secret values.

## 8. Done-when, evidence and report
Only complete once commit/report with four fields exists, or concrete mismatch lists remainder/evidence. Never report a stale/in-progress run as passing.
Changed files and reasons: <paths and why>
Tests run: <commands and actual results>
Known limitations: <limitations or none known>
Unverified criteria: <criterion and why, or none>
