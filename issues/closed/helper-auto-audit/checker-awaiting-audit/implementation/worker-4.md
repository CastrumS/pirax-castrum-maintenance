# Worker 4 report: repair round 1 (A F1, B B1 / A N1, A N2, A N3)

Worktree `issues/worktrees/checker-awaiting-audit-u4`, detached, starting from the reviewed head `5250748`. One commit:

- `f1b75c1` `fix: attribute scanner mailbox connections to ImapFlow; truthful helper-dependent awaiting docs`

No helper or plugin code, production submission or state semantics, dependencies, lifecycle or issue-phase files, registered-root lesson files, or sibling worktrees were touched. No environment file was opened, printed or copied; values were loaded only through `bun --env-file=…` in the configured command. All runs used Node `/home/rudi/.local/share/mise/installs/node/24.21.0/bin` first on PATH. Setup: `bun install --frozen-lockfile`, `bunx playwright install chromium`, `bun run build:plugin` (`dist/pirax-form-test.zip`, sha256 `da0ec78a…`).

Evidence directory: `implementation/worker-4-evidence/`.

## Finding resolutions

### A F1 (Fix): truthful, helper-dependent documentation (AC1)

- `README.md` "Awaiting-audit refusals": the checker now *recognizes* the refusal from a helper that blocks unaudited versions and emits `Pirax test blocked: awaiting audit of <Plugin label> <version>`. The section states explicitly that the in-tree helper, Pirax Form Test 0.2.4, does not emit this message yet. It still answers a version mismatch with `Pirax test blocked: integrations could not be suppressed`, and that stays `rejected` (exit 1) until a helper emitting the awaiting message is installed.
- "the older generic" → "the generic" (README). In `test/forms/README.md`, "the old generic block" → "the generic `integrations could not be suppressed` block (the in-tree helper 0.2.4's answer to a version mismatch)". The scanner-evidence paragraph now says the fixtures are not output of a helper that emits the awaiting message, and that 0.2.4 does not emit it.
- Verified against the in-tree helper, read only: `plugin/pirax-form-test/pirax-form-test.php:5` `Version: 0.2.4`; `includes/marker.php:23` `BLOCKED_MESSAGE = 'Pirax test blocked: integrations could not be suppressed'`. No helper change and no sibling dependency were added.

### B B1 / A N1 (Fix): owned mailbox oracle (AC2, AC3)

`test/forms/browser.test.ts`, "scanner forwards awaiting-audit without polling the mailbox":

- **Listener:** the real `Bun.listen` loopback mailbox listener records each peer's `remotePort`.
- **Observer:** `ImapFlow.prototype.connect` is observed, not replaced. It calls the real installed `connect`, returns its result unchanged, and on the client socket's `connect` event records the socket's `localPort`. A connection counts as the checker's (`owned()`) only when its peer port is one of those client ports. This is the `awaiting-audit-commands.test.ts` / `imap.test.ts` pattern.
- **Unrelated probe:** `probe()` opens a real `node:net` TCP connection to the listener and waits (bounded) until the listener has seen that probe's port, asserting it did.
  - Before the positive control: the confirmed `/plain` scan must give `owned() > 0`, and the probe's port must not be a client port. So the probe can neither satisfy the positive control nor be mislabelled.
  - Before each GF/FF awaiting scan: `owned()` must be unchanged, with exactly one authorized POST and no traps, alongside the awaiting outcome and the version-text assertions.
- **Cleanup:** the listener is created and the observer installed inside `try`. `finally` destroys the probes, restores the prototype and stops the listener.
- Nothing is mocked: authentication, transport, poll results and timeouts are all unchanged. No assertion was relaxed.

### A N2: reuse the slug rule (AC4)

`src/sites.ts` now exports the existing `SLUG`. `src/forms/awaiting-audit.ts` imports it and drops its copy. The regexp is identical and has no flags, so validation behavior is unchanged. `sites.ts` imports only `node:fs`, so there is no import cycle.

### A N3: page-scan failures clear the clock (AC5)

- The README **Clear** bullet now also covers completed page-scan failures (a navigation error, a challenge or interstitial page, or a browser launch failure) and states that such a run still exits 1.
- The limitations bullet adds that these failing passes restart the clock and can postpone escalation for an intermittently unreachable but still-blocked site, while each failing run exits 1.
- The **Not cleared** bullet (configuration-error interruption, sites not selected) is unchanged.

## Changed files and reasons

- `test/forms/browser.test.ts`: owned-connection oracle, unrelated real probes and cleanup (B1/N1).
- `README.md`: helper-dependent recognition, in-tree 0.2.4 behavior, "older" removed (F1); page-scan clearing and postponement (N3).
- `test/forms/README.md`: "old" removed and 0.2.4 behavior named (F1); the scanner oracle described.
- `src/sites.ts`: `export` on `SLUG` (N2).
- `src/forms/awaiting-audit.ts`: imports `SLUG` instead of a copy (N2).

## Tests run

All logs are under `implementation/worker-4-evidence/`. Node 24.21.0 was first on PATH for every run.

### Fail-first, then green (AC2, AC3)

1. **Red, in-test negative control.** I added only a real unrelated `node:net` probe in the awaiting interval and kept the old aggregate oracle, then ran `bun --no-env-file test test/forms/browser.test.ts -t 'scanner forwards awaiting-audit'`.
   - Result: **exit 1**, 0 pass / 1 fail, at the old line 324: expected `connections: 1`, received `2`, `writes: 1`, `traps: 0`. The awaiting outcome and version assertions passed first.
   - Log: `red-in-test-probe.log`.
2. **Green, same command after the owned-oracle repair.** **Exit 0**, 1 pass, 12 expect() calls. Log: `green-in-test-probe.log`.
3. **Green, B's external real-process probe.** Same command, with `review-B-evidence/probe.py <testpid>` (unchanged) running against the test process.
   - Result: **exit 0**, 1 pass, 12 expect() calls. The probe opened **81** real unrelated loopback connections.
   - Logs: `green-external-probe.log`, `green-external-probe-probe.log`. On the reviewed head, B's same reproduction failed (expected 16, received 29).

### Other checks

- `bun run typecheck`: **exit 0** (`typecheck.log`). `git diff --check`: clean.
- **Targeted, before commit:** `bun --no-env-file test tests/sites.test.ts tests/awaiting-audit.test.ts test/forms/browser.test.ts`. **Exit 1**, 62 pass / 2 fail (`targeted.log`).
  - Every sites and state test passed (AC4), as did the scanner case and the whole awaiting classification matrix.
  - The two failures: `no-marker/unknown/upload … IMAP preflight happens before POST` timed out at 60 s, and `encoded URLs … scrubbed from retained action traces` then failed in 0.5 ms with "Target page, context or browser has been closed", a cascade of the timeout.
- **That 60 s timeout is not caused by this repair:**
  - Alone, with the inherited environment: exit 1, timeout (`preflight-alone.log`).
  - Alone, with the private names unset: exit 0 at **59.51 s**, against a 60 s limit (`preflight-alone-cleanenv.log`).
  - At the **unmodified reviewed head `5250748`**, in a temporary detached `/tmp` worktree (since removed), with the same clean environment: **exit 1, timeout at 60 s** (`preflight-alone-head.log`).
  - Temporary timing instrumentation, since reverted (`runner.ts` restored from git, absent from the diff): almost all of the time is in the final `/plain` scan, about 8 s retaining its discovery trace and 26 s in `fillForm`. The earlier scans each took about 0.6 s.
  - Final verification at `7cbba00` recorded the same test passing at 41.7 s.

### Configured changed-test command, on committed `f1b75c1` (AC6)

The exact section 7 command: `AKROGON_BASE=2689aaa…` exported, run through `bun --env-file=<registered .env> -e 'Bun.spawn(["bash","-c",": \"${AKROGON_BASE:?…}\" && bun test"])…'`.

- `changed-tests.head` = `f1b75c19aa435e0875e0e5f6ede28578abb4dd0c`.
- I waited for the real completion. Result: **exit 1** (`changed-tests.exit`), **227 pass / 11 fail**, 3189 expect() calls, **238 tests across 25 files**, 2223.63 s (`changed-tests.log`).
- The reviewed head's run had 262 tests; some native files failed at file level ("(unnamed)") before registering every test.

The failures:

| File | Tests failed | Error |
|---|---|---|
| `test/forms/browser.test.ts` | 1: `exact awaiting-audit refusals…` | `/gf-awaiting-extra-in-container` got `failed` instead of `rejected`, because its 1 s submission timeout elapsed |
| `test/plugin/adapters.test.ts` | 1 (unnamed) | `goto: net::ERR_NETWORK_IO_SUSPENDED` |
| `test/plugin/compatibility.test.ts` | 5 | one `waitForResponse` 30 s timeout; four `net::ERR_NETWORK_IO_SUSPENDED` |
| `test/plugin/harness.test.ts` | 1 | `waitForURL` 30 s timeout |
| `test/plugin/review-regressions.test.ts` | 1 (unnamed) | `innerText` 30 s timeout |
| `test/plugin/safety.test.ts` | 1 (unnamed) | "Plugin upload did not offer activation" |
| `test/plugin/stack-harness.test.ts` | 1 | `net::ERR_NETWORK_IO_SUSPENDED` |

**Cause: the host was in a suspend/resume loop during the whole session.**

- The journal shows `PM: suspend entry (s2idle)` about every 30 s, each lasting about 6 s, starting at **19:33 CEST**, before any of my test runs.
- There were **75 suspends during the 37-minute configured run**, and the loop was still running afterwards (10 in the last 5 minutes checked).
- An `irq/9-acpi` thread was also at about 51% CPU.
- `net::ERR_NETWORK_IO_SUSPENDED` is Chromium's error for an OS power suspend.
- No failure involves a file or symbol this repair changed. Seven of the eleven are in licensed Playground plugin suites, which the diff does not touch.

**Supporting rerun on committed `f1b75c1`:** `tests/sites.test.ts tests/awaiting-audit.test.ts test/forms/browser.test.ts`, with private names unset. **Exit 1**, 61 pass / 3 fail, 4 suspends during the run (`targeted-committed.log`).

- `/gf-awaiting-extra-in-container` now returned `rejected` and the classification matrix passed. The scanner owned-oracle case passed, as did all sites and state tests.
- A *different* set failed:
  - `native required checkbox groups…`: a Playwright `check` 2 s timeout in untouched `fill.ts`.
  - The pre-existing 60.3 s preflight timeout.
  - Its 0.5 ms closed-browser cascade.

I did not keep rerunning the 37-minute suite while the host keeps suspending: each run would be equally invalid, and the set of failing tests changes from run to run. I did not raise any deadline or relax any assertion.

## Known limitations

- **The host suspend loop invalidates timing-sensitive browser and Playground evidence.** It has run since 19:33 CEST: s2idle about every 30 s, plus an `irq/9-acpi` load. This needs operator action on the machine, for example the lid, a wake source or idle settings. I did not change any host or power setting.
- **Pre-existing, outside this repair's scope:** `no-marker/unknown/upload … IMAP preflight happens before POST` runs close to its 60 s limit (41.7 s at `7cbba00`, 59.5–60.3 s here) and times out at the unmodified reviewed head as well. When it times out, the next test in the file (`encoded URLs …`) fails on the closed shared browser.
- **Unchanged from the leaf:** no released helper emits the awaiting message yet (now stated in the docs); R2 has no lock, so concurrent runs can race the clock; first-seen means the checker's first observation; renamed slugs leave orphaned state. No new native or delivered-email claim is made.
- The scanner oracle counts a connection only once the ImapFlow client socket's `connect` event has fired. The positive control proves that this pairing records the real client connection.

## Unverified criteria

- **AC6 is not verified.** The configured changed-test command on committed `f1b75c1` exited **1** (227 pass / 11 fail). Every failure is a timeout or `ERR_NETWORK_IO_SUSPENDED` while the host was suspending about every 30 s, and none is in code this repair touches. A clean configured run is needed on a host that is not suspend-looping; B's lane gates are the natural place for it. This is reported as an evidence mismatch, not hidden.
- AC1–AC5 are verified by the diff, the helper-constant check, the red/green and external-probe runs, and the sites/state tests.
