# Review B — checker-awaiting-audit

Verdict: **fix**

- Base: `2689aaa3bd69a9a46cc77788fdc5219354cc923a`
- Reviewed head: `5250748af9f96d3d8c35eef78a4f8b602f81b3f8`
- Initial review, independent of slot A; no peer review read or requested.
- Source working tree remains clean. Review reproducer and logs are retained separately; no production/test source changed during review.

## Fix B1 — scanner mailbox oracle counts unrelated connections

**Location:** `test/forms/browser.test.ts:305–319`, especially the unconditional `connections++` in the listener and equality assertion at line 319.

**Contract:** plan AC2/AC7 and brief done-criteria 1/4 require meaningful no-polling evidence and passing browser/full-suite checks. This new test falsely fails when another process connects to its listening port, despite the production scanner returning the correct awaiting outcome and submitting exactly once. The same actual host interference was already observed during implementation of the command-level test; its fixed oracle is in `test/forms/awaiting-audit-commands.test.ts`, and the cited historical mechanism is `learnings/history/2026-09-26-form-check.md`.

**Reproduction on reviewed HEAD, no mocks or source changes:**

Control:

```sh
bun --no-env-file test test/forms/browser.test.ts -t 'scanner forwards awaiting-audit'
```

Result: exit 0; 1 pass, 0 fail, 8 expectations.

Then run the same command while a separate Python process uses `ss` to identify only that Bun process's loopback listening sockets and opens/closes real unrelated TCP connections:

```sh
bun --no-env-file test test/forms/browser.test.ts -t 'scanner forwards awaiting-audit' > runs/review-b-awaiting-audit/scanner-unrelated-probe.log 2>&1 &
testpid=$!
python /home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/open/helper-auto-audit/checker-awaiting-audit/review-B-evidence/probe.py "$testpid"
wait "$testpid"
```

The added process does not alter Bun, Playwright, ImapFlow, scanner behavior, responses or authentication. It is an external listener probe. Result: exit 1; 0 pass, 1 fail. The awaiting outcome/version assertions passed. The failing assertion was:

```text
expected connections: 16
received connections: 29
writes: 1
traps: 0
at test/forms/browser.test.ts:319
```

The probe opened 57 real connections across the test process's listeners. This is a deterministic reproduction of the otherwise timing-dependent false failure, not evidence that awaiting refusals poll IMAP. Conversely, an unrelated connection can also satisfy the test's current positive-control `connections > 0` without establishing ownership by the intended client.

**Required repair:** attribute mailbox activity to the actual installed ImapFlow client's connection/socket, as the command-level test already does. Retain the confirmed-submission positive control, one-POST/no-trap assertions and zero owned connections for awaiting refusals. Add a deliberate unrelated-probe case so the negative assertion stays green in its presence. Do not suppress local services, weaken the assertion to an arbitrary allowance, or mock delivery/polling.

Evidence: `review-B-evidence/scanner-control.log`, `scanner-unrelated-probe.log`, `probe.log`, `probe.py` under this leaf. The same logs are also at `runs/review-b-awaiting-audit/` in the worktree.

## Other review conclusions

- Checked the locked design, current plan/implementation notes and report, changed runtime/test surfaces and callers. Version-only classification, strict >72h escalation, preservation across repeated/mixed-page observations, clearing, scoped Store use/fallback, manifest support and command exit aggregation otherwise align with the contract. No production-behavior Fix identified.
- Reviewed the behavioral docs in root `README.md` (outcome table, refusal/clock semantics, state layout and limitations) and `test/forms/README.md` (commands, fixture/native boundaries and evidence). User-visible behavior changed and both guides document it. No additional documentation/path defect identified. No AREA/index file changed.
- New state tests use real scoped R2 mutations; induced failures are actual closed-loopback SDK requests. Browser fixtures are the explicitly authorized pattern. Production functions are exercised, not replaced with successful mocks. Mailbox connection observation forwards to the real installed client.
- Checked the cited owned-connection lesson's history/evidence and its application in the command test; B1 is the remaining sibling oracle, not a reason to rewrite that historical case. No new duplicate lesson filed.
- Reused final blocking evidence: typecheck exit 0, full suite 262 pass / 0 fail, explicit forms suite 70 pass / 0 fail. Reviewed runtime/tests match verified `7cbba00`; the subsequent commit is lesson documentation only. `git diff --check` passes. No unchanged full-suite rerun was necessary; the targeted rerun above was for the concrete oracle concern.
- Retained full-suite command/state summaries demonstrate exact 72h boundaries, real forms/check warning and escalation exits, repeated clock preservation, clearing and remote cleanup. New-helper release behavior, live mail delivery, cross-run atomicity and orphan-state collection remain the reported/locked limitations, not additional repair scope.

## Nits

None. B1 is a reproducible test-oracle defect rather than a stylistic preference or an uncertain production claim.
