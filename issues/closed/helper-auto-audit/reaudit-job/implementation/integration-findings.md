# B integration observations (2026-10-06)

These are concrete follow-up checks for returned units, not accepted changes or review verdicts. Do not edit a currently running worker's code concurrently.

## Confirmed: tracked heartbeat is refused

Unit3 commit c01afc3 has `git()` return `stdout.toString().trim()`, then status lines parsed with `line.slice(3)`. For an already-tracked modified file, porcelain emits ` M .github/audit/heartbeat.txt`; trim removes the leading space so the path loses its first character. A local bare-remote reproduction with a tracked heartbeat and old commit fails with `heartbeat: refusing changes outside the heartbeat file` (exit1). Evidence: `implementation/evidence/heartbeat-tracked-repro.log`. This is the production path after installation, not an edge case. Repair requires preserving porcelain whitespace and an end-to-end local tracked-file test.

## Checks to tighten before integration

- Unit3 `parseInstant` validates date/time fields but does not bound timezone offset hours/minutes. Reproduced acceptance of +99:99 and +00:99 offsets; see `evidence/operations-validation-repro.log`. Reject invalid offsets; test injected now nonfinite values rather than allowing a false healthy/not-due result.
- Unit3 `safeError` prints arbitrary regex-shaped error.code and summary unknown keys. Reproduced both echoing a synthetic credential-shaped sentinel; see `evidence/operations-validation-repro.log`. A string being alphanumeric does not prove it is public. Prefer fixed field names/allowlisted diagnostic codes and synthetic credential-shaped code/key negative tests.
- Unit2 PHP status reduction uses `!empty($r['data']['activated'])`; a missing activated field becomes false, which can falsely confirm cleanup. Require a recognized explicit boolean/inactive value from the actual client schema; malformed status must fail closed. Verify through its stand-in protocol test, not just a fake Vault returning a bool.
- Local `~/.local/bin/gh` is a wrapper that invokes `mise use -g` before exec. Unit3's minimal child env made it hang. Use the installed gh binary directory first on PATH for B's local provisioning/live checks; standard Actions gh is not this wrapper. Do not broaden secret inheritance merely to make the wrapper work.

## Evidence already available

- Unit3 real SMTP selftest accepted one recipient; read-only IMAP found its exact unique tagged Subject as delivered. See `evidence-u3/selftest.log` and `arrival.log`. Do not send another selftest merely for repeated verification.
- Public wordpress.org currently reports ff6.2.15, cleantalk6.89, fluent_smtp2.4.1. First live acquisition must include the CT update, not pretend only FF changed.

Setup and two real GPL acquisition probes subsequently passed, including counts139→139; ciphertext is committed in lane468fc9b. Unit3 repaired all reproduced findings in b827770, with 324pass/0fail configured check and B's subsequent privacy scan finding zero. Still outstanding: remaining B picks/checks, fixture-repair completion, orchestration/publishing/workflows, final docs and full verification. Main-only Actions dispatch remains post-merge evidence.

## Worker continuation

The first unit1 print-mode worker exited without committing/reporting while its configured `bun test` process continued (PID1150473, authoritative changed-tests log). A remainder-only brief was dispatched in the retained worktree; original edits were not discarded or restarted. The in-flight log has a native PHP timeout and downstream closed-context failures in adapters.test.ts. Do not call that run green, and do not attribute the timeout to resource contention without a successful sequential reproduction/check.

## Subsequent native fixture finding and reboot

B's sequential lane check passed adapters but failed the nested Pro/SMTP restored-byte assertion (295pass/1fail). A real PHP probe proved a reused backup pathname becomes stale in a worker after another worker renames it away: copy()/rename() return false/ENOENT while file_exists() returns true. The repair uses unique names and checked writes/readback, retaining the hash assertion. Regression and affected native scenario are green. One broad run was aborted after it selected the local mise gh wrapper; its replacement was interrupted by a host reboot at10:34:54Z. Remainder-only worker is running brief-1-fixture-remainder.md. These interruptions are not successful test results.

## Unit2 flag-boundary follow-up for unit4

Source inspection confirms the missing-status-field concern also has siblings: PHP activate/deactivate reduce arbitrary truthy fields via empty(), and deactivate's boolean is trusted as cleanup receipt when the final status request fails. Tighten all three flag conversions at the shared boundary, with stand-in fail-first tests (e.g. malformed truthy deactivated plus unavailable status must not authorize success). acquirePackages also discards the initial status's activated flag; refuse an already-active initial instance before activate/deactivate so this run never releases a pre-existing seat. This is included in brief4, not silently patched into a returned worker's tree. The live probes demonstrated normal successful cleanup but do not exercise malformed responses; B should repeat one controlled live acquisition after this boundary changes.
