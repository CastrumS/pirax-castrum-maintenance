## 1. Goal
Implement native authenticated helper updates per plan D2–D4, AC1–AC2, updater parts of AC5–AC6, in /home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/worktrees/helper-self-update-u1. This is unit 1 only. No lifecycle phase calls.

## 2. Numbered acceptance criteria
1. Shipping helper 0.3.0 uses normal WordPress update listing, plugins_api details, Plugin_Upgrader install and auto_update_plugin opt-in for its own exact basename only. Real fixture HTTP and native authenticated browser update leave trace/summary evidence and actually change the installed version on a fresh request.
2. Ed25519 signature covers exact manifest bytes; public key raw32 base64, .sig raw64 base64. Manifest {version,package,sha256,audited}. Production GitHub CastrumS/pirax-castrum-maintenance/releases/latest/download/pirax-form-test-manifest.json plus .sig; package canonical HTTPS same-repo releases/download/vVERSION/pirax-form-test.zip. No network/parse/validation failure offers an update.
3. Unsigned, wrong-key, stale/equal version, signed malformed manifest, hostile URL and hash-mismatched ZIP never change installed bytes. Helper direct-download/mismatched offer/changed feed fail closed. Preserve unrelated plugins, remove stale own offers on invalid refresh. Installer cannot fall back to unchecked download.
4. Build ZIP allowlist includes updates.php, header 0.3.0, Update URI avoids wordpress.org collision. Public key is D8BfOn8TZC3jD+Hv5Q+p7SGPNGIYISVcMCqQWU0Dh9w= (already provisioned). No real seed handled by worker; strip PIRAX_HELPER_SIGNING_KEY from unrelated child env. Ship no fixture overrides/private material.

## 3. Read-first list
Authoritative leaf plan.md (D2–D4/D8 and notes), design.md, plugin/pirax-form-test/README.md, test/plugin/README.md, scripts/build-plugin.ts, plugin bootstrap, test/plugin/{core.test.ts,harness.ts,playground.ts,artifacts.ts}, test/wp/playground.ts (loopback rebind pattern), /home/rudi/.pi/agent/skills/implement-issue/ponytail.md. Use actual WordPress source from disposable fixture to confirm filter signatures.

## 4. Change list and needed interfaces
Own plugin/pirax-form-test/includes/updates.php (new), pirax-form-test.php, scripts/build-plugin.ts, test/plugin/{updates.test.ts,update-fixture.ts} (new), core.test.ts, harness.ts, playground.ts. No other edits without mismatch. No prerequisite commits. Unit 2 owns compatibility PHP/tests independently. Release worker will consume constants named UPDATE_PUBLIC_KEY (raw32 base64), UPDATE_RELEASES_ROOT (production repository /releases URL), VERSION (0.3.0, helper bootstrap). Manifest .sig wire format fixed above. Coordinate constant naming by report if needed; no second version map. Build should allow additional dist release assets while ZIP stays strictly allowlisted. Tests stage disposable copy with test public key and loopback release root constants, never edit production source or inject a production runtime bypass. Existing shared dist builds may race: isolate fixture artifacts and use current harness safe building pattern.

## 5. Do-not, reasons and exceptions
Do not read/write/open .env or .env.*; use Bun --env-file for tests, never print values. Do not log private seed, call GitHub writes or create releases/tags: real pair is already provisioned. Do not modify compatibility PHP/tests/docs (unit 2/3 ownership), checker, workflow or repo test discovery. No mocked auth/update HTTP or silent test skips; tests must prove native behavior. Native sodium absent must use available WordPress sodium compatibility or fail closed. No broad runtime trust-key/base URL bypass: staged fixture code only. Return mismatch with evidence if ownership/interface/scale is wrong; only B's revised brief authorizes an exception. These exclusions preserve secret privacy, independent workers and locked scope; exceptions require revised brief, never convenience.

## 6. Ordered steps
1. Derive native updater tests/negative cases from criteria before code; demonstrate red evidence (missing updater) with credentials loaded safely.
2. Implement updates.php/bootstrap/build and core-test contract; exact WordPress filter identity/download handling. Confirm only trusted temporary ZIP goes to upgrader and failures unlink it.
3. Stage test fixtures and run positive/negative real native flow with sanitized request ledger, summary and Playwright headless Chromium trace, no video. Assert key/signature/hash and installed bytes separately.
4. Run changed-test command and repair within scope; record unrelated baseline failures as mismatch with evidence, not silent skips. Commit only own files, write report to authoritative leaf implementation/worker-1.md.
Advisory size: about 9 files, under 60 turns; return a concrete mismatch for work clearly beyond scope, not a cutoff.

## 7. Commands
Install dependencies in worker with bun install. Configured changed-tests (not an additional check command): AKROGON_BASE=2689aaa3bd69a9a46cc77788fdc5219354cc923a bun --env-file=/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/.env -e 'const p=Bun.spawn(["bash","-c",": \"${AKROGON_BASE:?AKROGON_BASE is required}\" && bun test"],{env:process.env,stdout:"inherit",stderr:"inherit"});process.exit(await p.exited)'. Run targeted red/green tests as necessary for criterion evidence; B runs final checks. Capture output in authoritative implementation artifacts, not tracked issues/.

## 8. Done-when, evidence and report
Commit ID, criteria outcomes, actual commands with pasted summaries/red+green results, native artifact paths, and these four report fields required. No real seed in diagnostic values or output. Return mismatches rather than weaken gates.
Changed files and reasons: <paths and why>
Tests run: <commands and results>
Known limitations: <limitations or none known>
Unverified criteria: <criterion and why, or none>
