## 1. Goal
Implement version-only awaiting-audit rejection in helper GF/FF paths, plan D5–D6/AC3, in /home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/worktrees/helper-self-update-u2. Unit 2 only. Do not call lifecycle phases.

## 2. Numbered acceptance criteria
1. Native FF submission with actual installed Pro file altered to 6.2.16 rejects exactly `Pirax test blocked: awaiting audit of Fluent Forms Pro 6.2.16`, no entry/mail/feed effects. Audited Pro's Inventory module still rejects exactly `Pirax test blocked: integrations could not be suppressed`, with no entry/mail effects.
2. Awaiting-audit needs a known installed version mismatch, no independent non-version cause, and all unaudited callbacks physically declared under a mismatched plugin's directory. Real reflection, not name/namespace guessing. Missing/unreadable versions, unattributed/mu callbacks, unsupported forms/payment/post fields, unrecognized audited CleanTalk binding, suppression failure or mixed cause stay generic. Deterministic multiple-label order. Never accept a formerly blocked submission.
3. GF postback and early modern AJAX apply the same reachable-facts classification without calling GF stored-form APIs when GF is unaudited or delaying the guard. Marker/config errors retain precedence. No change to ordinary submissions or exact-version accepted paths. Early guard unknown/dynamic field or wrapped/moved audited binding stays generic.
4. Existing last-block option stays autoload-off/private and panel-compatible, records new messages' reasons too; no submitted value/token/source absolute path/callable stored. Safe reusable writer covers early GF refusal without invoking GF form APIs.

## 3. Read-first list
Authoritative leaf plan.md D5–D6 and design.md; plugin/pirax-form-test/README.md especially early guard limits; test/plugin/README.md; includes/{compatibility,marker,gravity-forms,fluent-forms,settings}.php; test/plugin/{compatibility.test.ts,safety.test.ts,adapters.test.ts,harness.ts,mu-plugin.php}; /home/rudi/.pi/agent/skills/implement-issue/ponytail.md. Copy VERSIONS withAlteredFile native fixtures and native Inventory test pattern.

## 4. Change list and needed interfaces
Own plugin/pirax-form-test/includes/{compatibility,marker,gravity-forms,fluent-forms}.php and test/plugin/{compatibility.test.ts,safety.test.ts,adapters.test.ts}; mu-plugin.php only for tightly needed isolated classifier test fixtures. No prerequisites. Unit 1 owns updater/bootstrap/build/core/harness, unit 3 docs/release. Preserve gf_supported/ff_supported/prepare_marked_submission boolean interfaces if possible. Keep callback public record shape hook/priority/id; internal source ownership shouldn't falsify panel/last-block tests. Add stable awaiting prefix beside BLOCKED_MESSAGE. Existing versions: GF3.1.2, FF6.2.14, Pro6.2.15, CleanTalk6.88, FluentSMTP2.4.1. Pro fixture already changes to 6.2.16. Requests to plugin load can precede guard: preserve documented limitation.

## 5. Do-not, reasons and exceptions
Never open/read/write .env files; load by Bun --env-file and expose only results. Do not read or propagate real signing seed; before launching existing harness remove PIRAX_HELPER_SIGNING_KEY from process environment (unit 1 fixes harness separately). No checkout changes outside owned scope, checker outcome or scheduled job implementation, docs changes, exact audit pin changes, mocked auth or silent prerequisite skip. Message classification must not relax blocking or remove unaudited callbacks. Do not parse English reasons or class names to infer source ownership. Return evidence-backed mismatch to B instead of changing locked scope/interfaces; only revised brief permits exceptions. Reasons remain independent edits, existing safety timing, secret privacy and fixed product behavior; exceptions require revised brief.

## 6. Ordered steps
1. Add native message assertions/negative cases before changing PHP, show fail-first existing generic-version message.
2. Add structural diagnosis/reflection and private safe block writer in compatibility.php, stable prefix in marker.php. Reuse report data without side effects; directory boundaries and reflection failure must fail generic.
3. Wire normal GF/FF and early GF guard, maintaining precedence/no-unaudited-GF-read and existing support return interfaces.
4. Verify native version, Inventory, mixed-cause, missing/unknown version, source path ownership, form restriction and multiple-label cases. Keep native traces/entry-mail-HTTP evidence. Then configured changed command, commit owned files, report at authoritative leaf implementation/worker-2.md.
Advisory size 7–8 files, under 50 turns (at least 4/file); evidence-backed mismatch if genuinely beyond scope, not hard cutoff.

## 7. Commands
Install with bun install. Resolved configured changed command: AKROGON_BASE=2689aaa3bd69a9a46cc77788fdc5219354cc923a bun --env-file=/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/.env -e 'delete process.env.PIRAX_HELPER_SIGNING_KEY; const p=Bun.spawn(["bash","-c",": \"${AKROGON_BASE:?AKROGON_BASE is required}\" && bun test"],{env:process.env,stdout:"inherit",stderr:"inherit"});process.exit(await p.exited)'. Targeted red/green runs allowed for criterion evidence; no additional full-check ownership. Do not expose environment values/assert credential-bearing objects.

## 8. Done-when, evidence and report
Return commit ID, actual command summaries with red/green evidence and artifact paths, plus all four report fields below. Unrelated test blockers are evidence-backed mismatches, never silently skipped or called passing.
Changed files and reasons: <paths and why>
Tests run: <commands and results>
Known limitations: <limitations or none known>
Unverified criteria: <criterion and why, or none>
