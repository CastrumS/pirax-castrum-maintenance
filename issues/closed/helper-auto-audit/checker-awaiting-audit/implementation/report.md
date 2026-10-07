# Implementation report: checker-awaiting-audit

Initial implementation completed by slot B on 2026-10-02. The initial snapshot below is retained; **Repair round 1** at the end records the current head and verification status. Not merged or pushed.

- Base: `2689aaa3bd69a9a46cc77788fdc5219354cc923a`
- Committed head: `5250748af9f96d3d8c35eef78a4f8b602f81b3f8`
- Worktree: `/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/worktrees/checker-awaiting-audit`
- Final verified code/test tree: `7cbba007e8384c5941c244744d4986f595ac0cc5`. The only subsequent commit, `5250748`, retires an applied lesson line and dates its historical application; no runtime/test/build files changed after final verification.
- Working tree clean; `git diff --check` passed; no branch changes under `issues/`. All three worker worktrees were removed before B's final suite. Issue artifacts exist only in the authoritative registered-checkout leaf.

## Delivered behavior

GF and FF selected-form refusals with the exact awaiting-audit message now produce the warning outcome `awaiting-audit`, preserving plugin/version text. The old generic integration block and other substantive/native validation errors remain rejected. Awaiting refusals never start mailbox polling or another submission.

The forms pass stores one `firstSeen` timestamp per site slug in its existing Store, at `state/awaiting-audit/<slug>.json`. Both commands share it. A warning becomes `failed` strictly after 72 hours, with elapsed duration and version detail. Repeated awaiting observations preserve the timestamp; a completed site pass without a raw awaiting result clears it. Skipped rows do not clear a concurrent awaiting result. State read/write failures degrade to a disclosed first sighting; failed clears are disclosed without fabricating form rows. Report schemas/rendering and operator docs include the new outcome.

## Changed files and reasons

Runtime:
- `src/forms/submit.ts`: individual fresh associated error messages, exact awaiting classification, native GF summary framing/overlap handling, and rejection when another substantive refusal or native invalidity exists.
- `src/forms/awaiting-audit.ts`: small forms-owned timestamp/key validation, pure duration/threshold helpers, real Store reconciliation, and fixed safe fallback diagnostics. No Store API expansion or dependency added.
- `src/forms/runner.ts`: optional fourth Store/clock runtime argument; reconcile once per completed site's complete forms results and return safe diagnostics. Direct scanner use stays storage-free.
- `src/commands/forms.ts`: supply the command Store and log state diagnostics before status/publication.
- `src/commands/check.ts`: same Store integration without weakening capture/health failures.
- `src/report/model.ts`: new FormResult outcome.
- `src/report/manifest.ts`: explicit whitelist support in both manifest modes, retaining unknown-outcome rejection and schema version.
- `src/report/html.ts`: updated warning explanations; existing warning aggregation remains authoritative.

Tests:
- `test/forms/browser.test.ts`: GF/FF awaiting/near-match/generic/mixed/stale/foreign refusal matrix, native-invalid regressions, one-POST assertions, and real mailbox no-connect evidence with a confirmed positive control.
- `tests/report.test.ts`: check warning rendering/escaping, manifest/approval validity, unknown outcomes and independent visual failure.
- `test/forms/report.test.ts`: forms warning rendering, exhaustive status mapping and both-mode manifest acceptance.
- `tests/awaiting-audit.test.ts`: key/schema/time validation, exact 72-hour boundaries, duration text and real closed-loopback transport fallback.
- `test/forms/awaiting-audit.test.ts`: scoped real-R2 persistence, fresh Store/repeat/version changes, precise boundaries, every non-awaiting clearing outcome, site isolation, malformed/future state, induced operation failures, pruning, production no-form clearing and cleanup.
- `test/forms/awaiting-audit-commands.test.ts`: actual production forms/baseline/check invocation through loopback GF/FF browser fixtures and real scoped R2; warning/failure exits, stable real captures, shared clock, clearing, fetched/local HTML rendering, mailbox ownership, privacy and cleanup.
- `tests/store.test.ts`: state-prefix retention sentinel.

Human/resource documentation:
- `README.md`: outcome/exit semantics, exact refusal exception, state layout/lifecycle, diagnostic fallback and limitations; corrected neighboring refusal/stale/skipped statements.
- `test/forms/README.md`: test matrices, commands, real-versus-fixture boundaries and evidence.
- `learnings/LESSONS.md`: removed the active owned-connection lesson after applying it to the command-test mailbox oracle.
- `learnings/history/2026-09-26-form-check.md`: dated that application without rewriting the original case/evidence.

No agent instruction documentation was affected. No helper/plugin, release, updater, site-list or credential file changed. `tests/commands.test.ts` needed no edit: existing alias/empty-selection/lazy-configuration coverage continued to pass. `src/store.ts` was reused unchanged.

## Workers and corrections

Three isolated units, each with an eight-section brief and committed return:

1. Classification/report worker: `b307e0e`, then `a5298de`; landed as `60f463c`, `8772e7a`. B caught blanket GF-container framing that could hide other text; worker added red/green cases and narrowed framing to the native heading.
2. State/command worker: `3439e6b`; landed as `ccd7747`. Completion correction reconciled failed-browser-launch rows as a completed non-awaiting observation, while configuration errors still abort before reconciliation.
3. Integration/docs worker: `ce34761`, `524f590`, `1fc1583`; landed as `f5481db`, `7dfe1ed`, `7cbba00`. Independent fail-first GF/FF cases confirmed that post-click native invalidity could otherwise become an awaiting warning; one condition preserves rejection. B also requested accurate adjacent doc claims and protected fixture/environment/prototype cleanup, including filtered-out tests and launch failure.

All worker reports contain file reasons, actual results, limitations and unverified scope. See `worker-1.md`, `worker-2.md`, `worker-3.md` and their brief/completion artifacts here.

## Verification commands and actual results

Node 24.21.0 was selected process-locally; no global runtime setting changed. Dependencies installed with `bun install --frozen-lockfile`, installed Chromium used, and `bun run build:plugin` prepared the native harness ZIP. All required existing environment names were checked as present using Bun; values/files were not opened, copied or printed. No new credential was needed.

Configured changed-tests were run with:

```sh
AKROGON_BASE=2689aaa3bd69a9a46cc77788fdc5219354cc923a
: "${AKROGON_BASE:?AKROGON_BASE is required}" && bun test
```

B's `run-check.ts` pass-artifact wrapper loads values through `bun --env-file=.env`, sets that base/Node PATH for the child, records a sanitized log and exit file, then removes its transient raw output. The final invocation satisfies both the configured changed-tests command after the last integrated chunk and the identical full-suite `checks.test`; there was no redundant unchanged full-suite rerun. Every worker worktree was already gone.

Final blocking results, pasted:

```text
bun run typecheck
$ tsc --noEmit
Exit: 0

: "${AKROGON_BASE:?AKROGON_BASE is required}" && bun test
262 pass
0 fail
Ran 262 tests across 25 files. [2239.74s]
Exit: 0

bun --env-file=.env run test:forms
70 pass
0 fail
Ran 70 tests across 8 files. [716.56s]
Exit: 0
```

Logs: `final-typecheck.log`, `final-suite.log`, `final-forms.log`, corresponding `.exit` files (all 0), and `final-checks-console.log`. No advisory checks are configured.

Earlier completed changed-test evidence:
- Worker 1: 252 pass / 0 fail, exit 0; `worker-1-changed-tests.log`.
- B after unit 1: 252 pass / 0 fail, exit 0; `lane-after-u1.log`.
- Worker 2 corrected code: 257 pass / 0 fail, exit 0; preserved `worker-2-evidence/runs/awaiting-audit-changed-tests-final.log`.
- B after unit 2: 261 pass / 0 fail, exit 0; `lane-after-u2.log`.
- Worker 3 corrected code: 262 pass / 0 fail, exit 0; `worker-3-evidence/worker-3-changed-tests.log`.

Red/green evidence is preserved in worker reports/logs: baseline awaiting messages were rejected; missing state module failed new tests; GF summary suppression and native-invalid GF/FF combinations each had failing regressions before correction. An initial overlapping worker-2 run reported 11 capture failures after its browser closed; its corrected sequential rerun and both later B runs passed, with no weakened assertions or changed native deadlines. Worker-3 initial integration failures were fixture/oracle mistakes (status/shape assertions, unrelated listener probes and visual-trace scanning), documented and corrected before passing evidence.

## Retained end-to-end evidence

Paths below are relative to the leaf worktree unless prefixed `implementation/`.

Final full suite:
- Browser matrix/traces: `runs/forms-browser-fb2f7f35-0ca5-4a64-9c7a-15391c913fe2/`.
- State summary: `runs/forms-awaiting-55b2380b-daf6-4113-9d97-6d353892147f/summary.json` — 72h−1ms warning, exact 72h warning, +1ms failed; every clearing outcome; operation fallback; cleanup deleted 3 / remaining 0.
- Production command summary: `runs/forms-awaiting-commands-048eb23b-5d1c-4c4d-8e4c-5096647c9bdc/summary.json` — per-scenario local HTML/manifests/forms traces, report-render traces and baseline/check captures; cleanup deleted 90 / remaining 0; fixture secret-scan hits `[]`.

Explicit final `test:forms` rerun:
- Browser artifacts: `runs/forms-browser-c80fba2c-6ea2-4c44-92f3-3228aba4001e/`.
- State: `runs/forms-awaiting-b183a452-66aa-4c2f-b20c-d68540212482/summary.json`.
- Commands: `runs/forms-awaiting-commands-7e2ec556-2368-4f58-8fd8-cc47f5ad8286/summary.json`.
- Native checker: `runs/forms-playground-755ad144-0981-4fb6-9a67-f392302211f3/summary.json`.
- Reports: `runs/forms-report-tests-b890f657-c112-4082-80ff-8acdcaa80cc8/summary.json`.

Command matrix, verified in the retained summaries:

| Scenario | Exit/result |
|---|---|
| First GF sighting, fresh Store/reversed pages, FF/new versions | 0 / warning; unchanged firstSeen on repeats |
| Real baseline followed by stable healthy check | 0 / awaiting warning; same site clock |
| Seeded ~100-hour clock, forms and check, repeated | 1 / failed; versions + elapsed detail; original clock retained |
| Generic rejection or confirmed-undelivered result | 1 / non-awaiting result; site clock cleared |
| Helper false, omitted designation, no forms | 0 / existing warning/pass; site clock cleared |
| Next check after clearing | 0 / awaiting warning with a new clock |

Each designated attempt has one POST. Awaiting refusals have zero owned mailbox connections/ImapFlow connects; only the confirmed-undelivered positive control connects. Other-site state survives. Every check scenario has real captured/same/healthy visuals rather than injected green reports. Published/local HTML is rendered through Playwright without navigating bearer links. New form/report traces have video/screenshots/snapshots/sources off; existing pre-fill visual traces retain their existing format and are explicitly excluded from the action-only trace scan.

Worker artifacts were copied before worktree removal. Old absolute paths in worker reports/summaries map as follows: `<former-uN-worktree>/runs/...` → authoritative leaf `implementation/worker-N-evidence/runs/...`; similarly `artifacts/...` → `implementation/worker-N-evidence/artifacts/...`. The lane evidence paths above remain directly usable. No bearer URL is retained in the report.

## Scope, limitations and unverified criteria

All brief acceptance criteria and configured blocking checks are verified. No human-only blocker or unresolved implementation finding remains.

Retained limitations:
- First-seen is the checker's observation, not plugin-update/audit-request time.
- The current Store interface has no conditional update/cross-run lock; overlapping observations can race first-write/clear.
- Unreadable/corrupt state can postpone escalation; failed clearing can retain an old timestamp.
- Renaming/removing a slug can orphan its old state key; no garbage collector was added.
- Awaiting-message behavior is verified through the design-authorized loopback browser fixtures, not a newly released helper or a live client site. Helper/refusal generation and auto-release/re-audit behavior remain sibling scope. Existing native plugin/checker regression suites passed.
- GF/FF message classification uses the audited native DOM structure. Custom framing, localized/changed refusal contract, or substantive content placed inside GF's native summary heading can require another compatibility audit; arbitrary custom plugin markup is not guaranteed.
- The real mailbox listener proves no polling for refusals and truthful failure for its confirmed control, not live mail delivery. No independent SMTP selftest was sent.

No live site-list check or production namespace mutation was used. Real R2 test mutations were scoped to fresh `test/forms-.../` prefixes and successful tests required zero remaining objects.

## Repair round 1 — 2026-10-05

Before (reviewed): `5250748af9f96d3d8c35eef78a4f8b602f81b3f8`.
After (committed): `e6bc04490e4a12c20db76fbc704b06e207627498`.
Base remains `2689aaa3bd69a9a46cc77788fdc5219354cc923a`.

Worker 4's repair `f1b75c19aa435e0875e0e5f6ede28578abb4dd0c` landed as `8f841e8`; B's `e6bc044` adds only a dated lesson-application note. The worker and picked trees matched exactly before that documentation-only commit. The worker worktree was removed before B's final checks. No other worker worktree for this leaf remains.

### Findings and changed files

- **A F1:** `README.md` and `test/forms/README.md` now describe recognition conditional on a helper emitting the exact version-only refusal. Both disclose that in-tree helper 0.2.4 still emits `integrations could not be suppressed` for a version mismatch, which remains rejected/exit 1. Removed misleading old/older terminology. No helper-code change or artificial sibling dependency.
- **B B1 / A N1:** `test/forms/browser.test.ts` pairs accepted peer ports with the installed ImapFlow client's actual socket local ports. The observer calls real `connect()` unchanged; a confirmed submission must produce an owned connection. Deliberately unrelated real TCP probes cannot satisfy that control or fail either GF/FF awaiting assertion. Existing one-POST, no-trap, outcome and version assertions remain; finally restores observer/listener/probes. No mocked transport/authentication, disabled service or weakened deadline.
- **A N2:** `src/sites.ts` exports the existing slug regexp; `src/forms/awaiting-audit.ts` imports it instead of duplicating it. Validation behavior is unchanged.
- **A N3:** root README explicitly documents that a completed pass with no awaiting result clears its clock even for navigation/challenge/browser-launch failures. Those runs still exit 1; intermittent scan failures can postpone continuous-audit escalation. Runtime semantics and config-error exceptions are unchanged.
- `learnings/history/2026-09-26-form-check.md` dates the existing owned-connection lesson's application to the scanner sibling without rewriting its historical case. No active index line remained to retire.

### Repair evidence and verification

Detailed returns: `worker-4.md` and the completing `worker-4-finish.md`. Briefs were revised around the findings; later briefs cover only missing verification, not repeated implementation.

Fail-first regression: with a deliberately unrelated probe, the old aggregate oracle failed (expected connections 1, received 2; `worker-4-evidence/red-in-test-probe.log`, exit 1). Repaired test: 1 pass / 0 fail / 12 assertions (`green-in-test-probe.log`, exit 0). A later unchanged external reproducer opened **92** unrelated real loopback connections while the repaired scanner passed (`finish-external-probe.log`, `finish-external-probe-probe.log`).

Worker's completed configured changed-tests on f1b75c1:

```text
bun run typecheck: exit 0
: "${AKROGON_BASE:?AKROGON_BASE is required}" && bun test
262 pass / 0 fail
3909 expect() calls
Ran 262 tests across 25 files. [2407.43s]
Exit: 0
```

Evidence: `worker-4-evidence/finish-{typecheck,changed-tests}.{head,log,exit}`. Preserved successful real-R2 command/state summaries: `finish-commands-summary.json`, `finish-state-summary.json`. All 14 command scenarios passed; only the confirmed-undelivered loopback control connected to the mailbox. No live mail-delivery claim.

Earlier evidence is retained, not silently replaced: the Oct2 full run exited 1 (227 pass / 11 fail) during repeated host suspends, including Chromium `ERR_NETWORK_IO_SUSPENDED`; two retries ended without exit files and are **not** passing runs. The Oct5 print-mode worker exited after a Monitor notification; its final replacement used detached tests with synchronous waiting and produced the completed result above. No timeout or test assertion was weakened. Temporary process-scoped sleep/idle/lid inhibitors protect verification; no host configuration was changed.

B final lane verification: **passed** at `e6bc04490e4a12c20db76fbc704b06e207627498`, with every worker worktree for this leaf already removed. Node24, Bun-loaded private environment and the configured base were supplied through the existing sanitized `run-check.ts` wrapper.

```text
bun run typecheck
$ tsc --noEmit
Exit: 0

: "${AKROGON_BASE:?AKROGON_BASE is required}" && bun test
262 pass
0 fail
3909 expect() calls
Ran 262 tests across 25 files. [3199.15s]
Exit: 0
```

Evidence: `repair-1-typecheck.{log,exit}`, `repair-1-suite-resumed.{head,log,exit}`. This completed post-pick run satisfies both the configured changed-tests and identical full-suite check; no advisory checks are configured. The working tree is clean, `git diff --check` passes, and no branch files under `issues/` changed.

The first B final suite was interrupted by the host reboot at 2026-10-05 17:40:44, without an exit file. Its sanitized partial output is retained as `repair-1-interrupted-suite.log` (no recorded failing assertion, but not a completed pass). The resumed run fills missing evidence rather than repeating a successful check.

Final end-to-end evidence:
- `runs/forms-browser-be5fe489-08f4-4bec-ae1b-5d05c4a52088/` in the leaf worktree.
- `runs/forms-awaiting-b1326013-c013-4e1e-b65a-e7419cb86ea9/summary.json`, also copied here as `repair-1-final-state-summary.json`: cleanup deleted 3, remaining 0.
- `runs/forms-awaiting-commands-d48489b5-d101-43ab-8405-c7fa2d8d693d/summary.json`, also copied here as `repair-1-final-commands-summary.json`: cleanup deleted 90, remaining 0.

### Remaining scope and limitations

The original first-observation, non-atomic R2, orphaned-slug-state and helper-release limitations remain. No production storage or live site was touched. Successful scoped tests assert cleanup; cleanup of interrupted attempts is not claimed. All recorded review findings/nits are addressed, all acceptance criteria and blocking checks are verified, and no unresolved repair finding or human-only blocker remains. Ready for slot A's repair review; not merged or pushed. The temporary verification inhibitor is released at handoff, with no persistent host changes.
