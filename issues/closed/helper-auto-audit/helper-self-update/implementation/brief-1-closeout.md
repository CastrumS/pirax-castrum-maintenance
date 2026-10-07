## 1. Goal
Close out unit1 only in retained /home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/worktrees/helper-self-update-u1. Native updater 7/7 and core10/10 are already green; no commit/report exists because prior agent ended with a waiting message. This closeout launches after the already-started changed-test process exits; do not rerun unchanged successful native tests or wait on stale Task IDs.

## 2. Numbered acceptance criteria
1. Preserve verified Ed25519 native updater listing/details/install/own auto-update, strict canonical repo package and negative refusal/unchanged bytes. Shipping public key D8BfOn8TZC3jD+Hv5Q+p7SGPNGIYISVcMCqQWU0Dh9w=, helper0.3.0, no runtime bypass/private key.
2. Assess configured changed run from worker-1-changed.txt and actual process result; no all-green claim if failures. Known capture.test.ts browser-closed failures are outside updater ownership; report evidence-backed mismatch, not scope expansion. B's unchanged lane baseline tests subset still passes after reboot.
3. Commit only owned implementation and leave complete worker-1.md with native artifact paths, red/green evidence, configured outcome, limitations and unmet criteria. Return commit ID even if out-of-scope broad regression is separately reported.

## 3. Read-first list
Original brief-1.md and brief-1-remainder.md for binding scope; current diff/untracked updater/test files; worker-1-{red,green,core,changed}.txt; plan D2–D4; /home/rudi/.pi/agent/skills/implement-issue/ponytail.md.

## 4. Change list and needed interfaces
Only retained bootstrap/build/core/harness and new updates.php/update-fixture.ts/updates.test.ts (playground only if needed). Existing build exports buildPlugin({source,zip}), FILES, withoutSigningKey; report this interface for release worker. No other prerequisite or new feature. No docs edits (unit3). Run git diff --check. Preserve evidence outside worktree before eventual worktree removal: copy only sanitized artifact directories, never .env or vendor/cache files, into authoritative implementation/evidence-u1/ and cite durable paths.

## 5. Do-not, reasons and exceptions
Never read/write/open .env; no signing seed handling or GitHub writes. No silent skip/mock auth or edits outside owned paths. Do not return a waiting announcement: test process has already been awaited by launch shell. Do not modify unrelated capture tests; return mismatch instead. Exception only B's revised brief. Exclusions preserve privacy, genuine evidence, independent scope and avoid redundant long tests.

## 6. Ordered steps
1. Inspect completed log/artifacts and diff; ensure source claim matches proven native tests.
2. Fix only actual own defects, retest changed behavior if changed. Otherwise no repeat of successful checks. Preserve sanitized updater/core artifacts at durable authoritative paths.
3. Commit own files, write worker-1.md with four fields and exact outcome, return. Advisory 8 retained files, under20 turns.

## 7. Commands
Already-run resolved changed command uses AKROGON_BASE=2689aaa3bd69a9a46cc77788fdc5219354cc923a and `: "${AKROGON_BASE:?AKROGON_BASE is required}" && bun test` with environment loaded via Bun --env-file=/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/.env. Reuse completed log when code unchanged. If own repair needed rerun affected checks and that command as required; B owns final full checks.

## 8. Done-when, evidence and report
Actual commit/report and durable native evidence; explicitly distinguish scoped green criteria and broad-run failures.
Changed files and reasons: <paths and why>
Tests run: <commands and results>
Known limitations: <including outside-scope broad failures>
Unverified criteria: <criterion and why, or none>
