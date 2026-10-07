# Unit 1 native fixture repair: restoration is not reliable

## 1. Goal

Diagnose and repair the concrete native restoration failure observed by B in sequential lane verification. Resume retained worktree `/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/worktrees/reaudit-job-u1` at b120086 (already cherry-picked as lane0d32481). This is a NEW repair commit, not an amendment of the landed pin refactor.

## 2. Numbered acceptance criteria

1. Keep the existing restored-file SHA256 assertion and every native version-only/generic refusal assertion. B's sequential full run failed `Pro at the next patch: its own Inventory callbacks ...` at compatibility.test.ts:293: Expected a6966aa3fed7c4cbe182fcf6e2d32f006f02487f9902d7ee9448b46745745c3f, Received1494637ccf840c943677b35bcd15e5e72c7d7526aa42ce1ffd6f662daeb338dd. B computed these from the public FluentSMTP2.4.1 ZIP: expected is original boot.php, received is exactly its mutated2.4.2 contents. This occurred in the nested SMTP mutation at lines986–996, NOT the earlier standalone SMTP fixture (that passed).
2. Diagnose with actual filesystem/bridge evidence. `withAlteredFile` currently uses unchecked copy/file_put_contents then unchecked rename from a fixed `.pirax-original`, invalidates opcache and hashes immediately. The mutation helper itself was not changed by unit1. Determine whether backup/rename/cache/cross-request visibility causes the failure. Do not invent a contention cause: the original adapters timeout disappeared on this sequential lane run, but this different assertion failed.
3. Add meaningful fail-first regression coverage for repeated/nested mutations, original/altered/backup readback and restoration through the same real PHP mechanism. Prefer the smallest actual Playground reproduction before running the entire compatibility suite. Preserve original-byte identity and fresh-request version behavior, not merely a relaxed hash assertion or retry-until-pass. Fix the actual fixture mechanism with evidence; if unreproducible, report the exact limitation and proposed minimal safeguard as a mismatch before weakening anything.
4. Run affected native check plus configured changed tests; return new commit and complete repair report/evidence. Do not change production pins/callbacks or current helper version.

## 3. Read-first list

Read `/home/rudi/.pi/agent/skills/implement-issue/ponytail.md`, original brief1 and report-u1.md. Read B log `/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/open/helper-auto-audit/reaudit-job/implementation/evidence/lane-after-u1.log` around lines333–358. Native evidence is lane artifacts/plugin/compatibility-2026-10-06T08-16-29-202Z/compatibility-notes.jsonl (two SMTP mutation records). Inspect current compatibility.test.ts withAlteredFile and final nested Pro test, harness.php() wrapper and playground.ts serialization. Root cause cannot be inferred merely from an older resource snapshot.

## 4. Change list and needed interfaces

Own test/plugin/compatibility.test.ts plus minimal fixture/harness helper/test if the reproduction proves necessary. Default unchanged pin interfaces from committed unit1. Do not touch unit2 acquisition or unit3 operations. If a new reusable native fixture helper is necessary, include it and explain why; no production behavior changes. Existing worker worktree is retained, no new path needed. B lane tests are running against separate lane and must not be edited.

## 5. Do-not, reasons and exceptions

Do not delete/weaken restored-hash or rejection assertions, increase timeouts to hide failures, claim a single random green rerun proves a fix, broaden this into compatibility acceptance of new vendor versions, or alter real sites/GitHub. Never open/print/copy/write .env/.env.*; use Bun env-file loader only. Vendor sources/private ZIPs stay out of retained artifacts; inspect digests/control facts instead of dumping content. Return mismatch with evidence rather than changing scope; exception is B's revised brief. These limits preserve the exact-byte and native-safety oracle rather than silence it.

## 6. Ordered steps

1. Inspect retained code/logs; derive a small real PHP repeated/nested mutation reproduction and capture red/control facts.
2. Identify failed operation or stale observation explicitly; add checks/readback and minimal proven repair without weakening native assertions.
3. Run focused regression and native compatibility scenario green, retain hashes/counts not sources.
4. Run configured changed-test command with the shared lock below, commit new repair only, update report-u1.md with before/after and separate repair evidence.

Advisory:1–3 files, under30 editing turns plus bounded native waits. Keep active until report/commit; print-mode “waiting for notification” is not completion.

## 7. Commands

Node24 and native gh directories first on PATH as in original brief. Focused native command may use `bun --env-file=/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/.env test test/plugin/compatibility.test.ts -t 'Pro at the next patch'` after a smaller reproduction. Preserve full-scenario coverage later.

Resolved broad changed command remains `: "${AKROGON_BASE:?AKROGON_BASE is required}" && bun test`, AKROGON_BASE=4e929fca0a8c793f2189454091fb5c0fcf74a1da, via original brief7 Bun env-file wrapper. Serialize this expensive command with `flock /home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/open/helper-auto-audit/reaudit-job/implementation/native-check.lock`. B lane check and unit3 repair use it too; do not start another concurrent BROAD native suite.

## 8. Done-when, evidence and report

Append a repair section to authoritative report-u1.md with diagnosis evidence versus hypotheses, exact changed files/reasons, commands/results, old b120086 and new repair commit, and limitations/unverified items. Save evidence under implementation/evidence-u1-fixture-repair. Return new commit/report without lifecycle commands. Do not amend b120086; it has landed already.

Changed files and reasons: <paths and why>
Tests run: <commands and results>
Known limitations: <limitations or none known>
Unverified criteria: <criterion and why, or none>
