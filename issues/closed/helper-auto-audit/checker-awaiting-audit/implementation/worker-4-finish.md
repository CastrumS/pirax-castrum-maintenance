# Worker 4 finish report: verification of `f1b75c1`

Retained worktree `issues/worktrees/checker-awaiting-audit-u4`, detached and clean at `f1b75c19aa435e0875e0e5f6ede28578abb4dd0c` before and after this pass. No code was edited and no commit was made, not even an empty one. Return commit: **`f1b75c1`**.

Node `/home/rudi/.local/share/mise/installs/node/24.21.0/bin` (v24.21.0) was first on PATH for every run. The environment file was never opened, printed or copied; its values reached only the configured command, through `bun --env-file=…`. There was no live-site work. The only R2 use was the suite's own test-scoped run. B's temporary inhibitor (`checker-awaiting-audit-tests`, `sleep:idle:handle-lid-switch`) stayed active throughout. `journalctl -b -g 'suspend entry'` showed no entries before, during or after the run.

## Evidence history (all prior evidence preserved)

1. **Original run, Oct 2:** `changed-tests.{head,log,exit}`. **Exit 1**, 227 pass / 11 fail, run during a host s2idle suspend loop (`suspend-journal.log`). This run is invalid as evidence for or against the repair; details are in `worker-4.md`.
2. **Retry, Oct 2:** `retry-changed-tests.*`. Interrupted, with no exit file. Not a result.
3. **Resume, Oct 5:** `resume-changed-tests.*`. Interrupted, with no exit file. The worker's CLI exited when its Monitor expired, and the test process went with it. The host did not suspend. Not a result.
4. **This finish pass, Oct 5:** `finish-*`. Completed, exit 0. This is the new evidence.

## Changed files and reasons

None in the worktree. Only artifacts were added: this report and `implementation/worker-4-evidence/finish-*`.

## Tests run

All paths below are under `implementation/worker-4-evidence/`.

- **Typecheck:** `bun run typecheck` (`tsc --noEmit`). **Exit 0.** Files: `finish-typecheck.{head,log,exit}`; head is `f1b75c1`.
- **Configured changed-tests (AC1).** This is the exact section 7 command, run with `AKROGON_BASE=2689aaa3bd69a9a46cc77788fdc5219354cc923a` exported: `bun --env-file=<registered .env> -e 'const p=Bun.spawn(["bash","-c",": \"${AKROGON_BASE:?AKROGON_BASE is required}\" && bun test"],…);process.exit(await p.exited)'`.
  - **Launch:** detached with `setsid nohup bash <script> &`. The script runs in its own session (SID/PGID 55814); the bun wrapper is 55816 and `bun test` is 55817. The script writes the real exit status itself. Waiting was done with foreground `sleep 240` checks only.
  - **Head:** `finish-changed-tests.head` = `f1b75c19aa435e0875e0e5f6ede28578abb4dd0c`.
  - **Timing:** 2026-10-05 16:25:17 to 17:05:25 CEST (`.start` / `.end`).
  - **Result: exit 0** (`finish-changed-tests.exit`): **262 pass / 0 fail**, 3909 expect() calls, 262 tests across 25 files, 2407.43 s (`finish-changed-tests.log`).
  - This covers every test the Oct 2 run failed, including:
    - the earlier 1 s `/gf-awaiting-extra-in-container` case;
    - the 60 s `IMAP preflight happens before POST` test and its `encoded URLs …` cascade;
    - all seven plugin Playground files.
- **Scanner regression with a real external unrelated probe (AC2).** I ran `bun --no-env-file test test/forms/browser.test.ts -t 'scanner forwards awaiting-audit'` with `python3 review-B-evidence/probe.py <test pid>` (unchanged) running against it.
  - Result: **exit 0**, 1 pass / 21 filtered out / 0 fail, 12 expect() calls, 2.87 s.
  - The probe opened **92** real unrelated loopback connections.
  - Files: `finish-external-probe.{head,log}` and `finish-external-probe-probe.log`; head is `f1b75c1`.
  - The original red evidence is kept unchanged: `red-in-test-probe.log`, which failed with expected 1 connection, received 2.
- **Summary copies from the passing run:**
  - **`finish-commands-summary.json`**, from `runs/forms-awaiting-commands-8ed3011e-…/summary.json`. All 14 production-command scenarios are present:
    - the forms/check awaiting outcomes exit 0;
    - escalation exits 1 as `failed`, and a normal rejection clears;
    - `mailboxConnections` and `imapClientConnects` are 0 everywhere except the loopback `clear-confirmed-undelivered` fixture (1 each).
  - **`finish-state-summary.json`**, from `runs/forms-awaiting-8b7602eb-…/summary.json`. It covers the state boundaries, clearing, malformed replacement and induced R2 failures against real test-scoped R2.
  - Both files were checked for signature, token and credential-like strings before copying; there were none. They contain a published-report notice whose bearer link is withheld.

## Known limitations

- This is a single clean run on a non-suspending host, made with B's temporary inhibitor active. The Oct 2 failures are explained as host-suspend effects, consistent with this result, but not otherwise reproduced.
- **Pre-existing, outside this repair's scope:** the `IMAP preflight happens before POST` test has run close to its 60 s limit (41.7 s and 59.5–60.3 s earlier). It passed here. Its per-test duration is not printed in the non-TTY log, so its margin this time is unknown.
- **Unchanged from the leaf:**
  - no released helper emits the awaiting message yet; the in-tree 0.2.4 still answers a version mismatch with `integrations could not be suppressed`;
  - R2 has no lock;
  - first-seen means the checker's first observation;
  - renamed slugs leave orphaned state.
- No new delivered-mail or native-delivery claim is made. The single mailbox connection in `clear-confirmed-undelivered` is a loopback fixture that confirms an *undelivered* outcome.
- B owns the final lane checks.

## Unverified criteria

None. Finish-brief AC1–AC3 are met, and worker-4 AC6, which `worker-4.md` left unverified, is now verified by the completed configured run on `f1b75c1` (exit 0, 262/0).
