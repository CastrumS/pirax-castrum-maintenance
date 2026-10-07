# Unit 3 report: safe failure mail, heartbeat and schedule observation

Worker worktree: `issues/worktrees/reaudit-job-u3` (detached, base `4e929fc`).
Commit: `b827770bf1d3806388720dd6a95b50278c527f5b` (feat: re-audit failure notice, heartbeat and schedule watchdog). This is the original unit commit `c01afc3` amended in place by the brief-3-repair; it is still one commit on base `4e929fc`, with tree `77facef160fabf1b3e5e8bf8909ffff4535c1f9c`.
Evidence directory: `implementation/evidence-u3/`.

- Original run: `red.log`, `green.log`, `selftest.log`, `arrival.log`, `watchdog-live.log`, `build-plugin.log`, `changed-tests.log`, `updates-rerun.log`.
- Repair: `repair-red.log`, `repair-green.log`, `repair-changed-tests.log` and `repair-changed-tests.exit`.

B's reproductions remain in `implementation/evidence/heartbeat-tracked-repro.log` and `operations-validation-repro.log`.

## Exported interfaces

### `scripts/reaudit/notify.ts`

- `RECIPIENT = "piraxcastrum@gmail.com"`
- `PIN_KEYS = ["gf", "ff", "ff_pro", "cleantalk", "fluent_smtp"] as const`, `type VersionMap = Record<PinKey, string>`. These are structural only; the not-yet-landed pin helper is not imported.
- `STAGES = ["discovery", "setup", "download", "audit", "cleanup", "privacy", "bump", "push", "publication", "heartbeat", "watchdog", "notify-selftest", "unknown"]`
- `CLEANUP = ["confirmed", "failed", "unknown", "not-applicable"]`
- `PUBLICATION = ["not-attempted", "unknown", "main-pushed", "tag-claimed", "release-incomplete", "published"]`. When the value is absent, the notice renders `unknown` with inspection guidance. `not-attempted` is only for runs that never reached publication. No value means "nothing was published".
- `type FailureSummary = { stage; reason; oldVersions?; candidateVersions?; runUrl?; cleanup?; publication?; commit?; tag? }`. The repair added `commit` and `tag`, both optional:
  - `commit` is the intended pin commit and must match `^[0-9a-f]{40}$`.
  - `tag` is the intended release tag: `v` plus the helper VERSION pattern, i.e. `^v(0|[1-9][0-9]*)(\.(0|[1-9][0-9]*)){1,3}$`. This is the same stable dotted numeric rule `scripts/release-plugin.ts` applies.

  Both are for plan D7 partial-publication recovery. Existing callers that omit them are unchanged, and the rendered notice is byte-identical to before for them.
- `parseFailureSummary(value: unknown): FailureSummary`. This is strict: unknown keys are rejected. The reason must match `^[a-z][a-z0-9-]{0,63}$`. Versions must be exactly the five keys with dotted numeric values (2–4 components, no leading zeros). `runUrl` must be `https://github.com/CastrumS/pirax-castrum-maintenance/actions/runs/<n>[/attempts/<n>]`. `commit`/`tag` are checked as above. Errors throw `NoticeError` with a fixed field message (`invalid failure summary: <field>`). Unknown keys always produce the fixed message `invalid failure summary: unknown keys`, and key names are never echoed.
- `runUrlFromEnv(env?): string | undefined` returns the official run URL from `GITHUB_SERVER_URL`/`GITHUB_REPOSITORY`/`GITHUB_RUN_ID`/`GITHUB_RUN_ATTEMPT`, or undefined for anything else.
- `formatFailure(summary, selftestId?): { subject, text }`. It adds the lines `Intended commit: <sha>` and `Intended tag: <tag>` after the Publication line, only when those fields are present. The subject is `[pirax-audit] re-audit failed at <stage>: <reason>`, or for a selftest `[pirax-audit] SELFTEST harmless notice, not a real failure [pirax-test <id>]`.
- `safeError(e): string` returns our own messages (NoticeError/EnvError/EnvFormatError). For anything else it returns an allowlisted built-in error name (`Error`, `TypeError`, `RangeError`, `SyntaxError`, `AbortError`, `TimeoutError`, otherwise `Error`). It appends `(code)` only when the code is in a finite allowlist of public nodemailer SMTP and Node network codes: `EAUTH`, `ECONNECTION`, `ETIMEDOUT`, `ESOCKET`, `EDNS`, `ETLS`, `EPROTOCOL`, `EENVELOPE`, `EMESSAGE`, `ESTREAM`, `ECONFIG`, `ENOAUTH`, `EMAXLIMIT`, `ECONNREFUSED`, `ECONNRESET`, `ECONNABORTED`, `ENOTFOUND`, `EAI_AGAIN`, `EHOSTUNREACH`, `ENETUNREACH`, `EPIPE` and `ERR_TLS_CERT_ALTNAME_INVALID`. Other codes are omitted.
- `class NoticeError`
- `sendFailure(summary, env = process.env, { selftestId?, createTransport?, timeoutMs? } = {}): Promise<{ accepted: 1; rejected: 0 }>`
  - Credentials are read and validated from IMAP_USER/IMAP_PASSWORD; missing ones raise `EnvError`, which names the variables only.
  - Transport: nodemailer to `smtp.gmail.com:465` over implicit TLS, with `logger`/`debug` off. Timeouts are 20 s connection, 20 s greeting and 45 s socket, plus a 90 s overall deadline.
  - It makes one `sendMail` attempt to `RECIPIENT` from IMAP_USER. The transport is always closed. Any failure becomes a `NoticeError` carrying only an error name and safe code; there is no retry and no recursion.
  - The extra third options argument is a test seam (transport double, short timeout) plus the selftest tag.
- CLI:
  - `bun --env-file=.env scripts/reaudit/notify.ts --selftest` sends one labeled harmless notice. It prints `{"smtpAttempts":1,"smtpAccepted":true,"accepted":1,"rejected":0,"stage":"notify-selftest","selftestId":"<12 chars>"}`.
  - `bun --env-file=.env scripts/reaudit/notify.ts <summary.json>` sends that summary. An unreadable or invalid summary prints the field name, sends a fixed fallback notice (`stage: unknown`, `reason: invalid-summary`, cleanup/publication `unknown`) and still exits 1.
  - Exit codes: 2 usage, 1 send failure or invalid summary, 0 sent. On failure it prints `{"smtpAttempts":0|1,"smtpAccepted":false,"error":"<safe>"}`.

### `scripts/reaudit/heartbeat.ts`

- `HEARTBEAT_PATH = ".github/audit/heartbeat.txt"`, `HEARTBEAT_DUE_MS` (30 days), `CLOCK_SKEW_MS` (5 min).
- `parseInstant(text): number` accepts strict ISO-8601 with `Z` or `±hh:mm`, where the offset hour is 00–23 and the minute is 00–59. After the repair, `+99:99`, `+00:99` and `+24:00` throw. Calendar-invalid fields throw.
- `heartbeatDue(lastCommitIso, nowMs): boolean` is pure. It is due when the age is >= 30 days. A future timestamp within the skew counts as not due; beyond the skew, or malformed, it throws. A nonfinite `nowMs` (NaN/±Infinity) throws `RangeError` (repair).
- `safeChildEnv(env?)` keeps an allowlist only (PATH, HOME, USER, LANG, LC_ALL, TMPDIR, XDG_CONFIG_HOME, GH_TOKEN, GITHUB_TOKEN, GH_HOST, SSH_AUTH_SOCK). It also sets `GIT_TERMINAL_PROMPT=0` and `GH_PROMPT_DISABLED=1`. The watchdog uses it too.
- `runHeartbeat({ cwd, now, remoteUrl = "https://github.com/CastrumS/pirax-castrum-maintenance.git", env?, beforeRecheck? }): { outcome: "not-due" | "pushed"; base; commit? }`, in order:
  0. Refuses a nonfinite `now` before any git command (`heartbeat: refusing a nonfinite clock`). This step was added by the repair.
  1. Refuses a dirty checkout, or a branch other than `main` (a detached HEAD is allowed).
  2. Fetches `refs/heads/main` from the fixed URL and requires HEAD == fetched main.
  3. Checks the due predicate on main's `%cI`. If not due, it stops with no commit.
  4. Otherwise writes `<now ISO>\n` to the heartbeat file and refuses any other change. Repair: git output is now `trimEnd()`ed rather than `trim()`ed. This keeps the significant leading space of porcelain lines like ` M .github/audit/heartbeat.txt`, so an already-tracked heartbeat parses correctly.
  5. Commits as github-actions[bot] with hooks and signing disabled.
  6. Rechecks remote main with `ls-remote`, then makes a normal `push <url> HEAD:refs/heads/main`. There is no force, tag or release.
  7. Every failure is a `HeartbeatError` with a fixed stage message (`git <stage> failed (exit N)`, dirty, branch, not fresh main, main advanced, malformed time). It never includes stderr, paths or URLs.
  8. `beforeRecheck` is a test seam for the race case.
- CLI: `bun scripts/reaudit/heartbeat.ts --run` prints the JSON result; exit 1 on failure with the safe message, 2 on usage. Without `--run` nothing happens.

### `scripts/reaudit/watchdog.ts`

- `OVERDUE_MS` is 48 h. Types: `Gh`, `WatchdogFacts`, `WatchdogReason`, `WatchdogDecision`.
- `normalizeWatchdogFacts(workflowJson, runsJson, nowMs): WatchdogFacts` requires all of:
  - path `.github/workflows/reaudit.yml`
  - a known `state`
  - a valid `created_at`
  - `workflow_runs` as an array whose every run has a string `event` and a valid, non-future `run_started_at`

  It returns the latest started `schedule`/`workflow_dispatch` start, or null. Anything else throws, including a nonfinite `nowMs` and invalid offsets (repair).
- `decideWatchdog(facts, nowMs)` is pure. A nonfinite `nowMs` throws (repair), and `observe` turns that into unhealthy `actions-response-invalid`. It ignores the run conclusion, so a failed recent audit counts as alive. Outcomes:
  - Not `active`: `workflow-<state>`, e.g. `workflow-disabled-inactivity`.
  - Last start older than 48 h (strictly greater): `audit-overdue`.
  - No history and the workflow is at most 48 h old: healthy `awaiting-first-run` (the initial-installation grace period). Older than that: `no-audit-history`.
- `observe(gh, nowMs)` makes only `gh api --include` GET lookups of `repos/CastrumS/pirax-castrum-maintenance/actions/workflows/reaudit.yml` and `.../runs?per_page=50`. Outcomes:
  - 404: `workflow-missing`
  - non-200, no status or a gh failure: `actions-query-failed`
  - unparsable or invalid response: `actions-response-invalid`

  All of these are unhealthy.
- `runWatchdog({ now, gh = real gh (allowlisted env, 60 s timeout), notify = sendFailure | null, env })` returns `{ healthy, reason, notice: "not-needed" | "sent" | "failed" | "skipped" }`. When unhealthy it sends exactly one `{ stage: "watchdog", reason, runUrl?, cleanup: "not-applicable", publication: "not-attempted" }` notice. If that notice fails, it logs a safe error and does not retry.
- CLI: `bun --env-file=.env scripts/reaudit/watchdog.ts [--no-notify]` exits 0 when healthy (no email) and 1 when unhealthy.

## Changed files and reasons

- `scripts/reaudit/notify.ts`: safe structured notice, fixed Gmail transport, selftest and summary CLI (AC1–2).
- `scripts/reaudit/heartbeat.ts`: pure due predicate, the main-only heartbeat operation, and the shared `parseInstant`/`safeChildEnv` helpers (AC3, AC5). No separate helper file was added; the watchdog imports these two helpers from heartbeat.ts.
- `scripts/reaudit/watchdog.ts`: read-only Actions observation, validation, pure decision and notice (AC4).
- `tests/reaudit-operations.test.ts`: 31 synthetic tests originally, 38 after the repair. They cover:
  - the summary allowlist and injection, private URL, version and unknown-key rejection
  - uncertainty-aware publication text
  - missing credentials by name
  - fixed transport options, one attempt, safe error codes, a bounded hang and a non-accepted recipient
  - notify CLI usage, invalid summary with fallback, and missing credentials, run as offline children
  - strict instants, the 30-day boundary (exactly 30 d due; 30 d − 1 ms not due), skew, future and malformed dates
  - safe child env
  - local file:// git remote end-to-end: due push, not due, dirty, other branch, stale HEAD, main racing, fetch failure without leaking paths
  - the 48 h boundary, newest schedule/manual run, failed run as alive, disabled states, initial-install grace, malformed/future/unknown responses
  - read-only GET-only gh arguments, 404/API failure/unparsable output
  - healthy run sends no notice, unhealthy sends one, a failed notice is not retried
  - inert imports for all three modules

  The transport double is used only for error-path unit checks; real delivery proof is the live selftest below. The CLI/import children run with `bun --no-env-file` from a temp directory.

No workflows, docs, pins, harness or acquisition files were edited.

## Repair (brief-3-repair.md)

| Finding | Root cause | Fix |
| --- | --- | --- |
| Tracked heartbeat refused, so every normal subsequent heartbeat failed (B's `heartbeat-tracked-repro.log`) | `git()` called `.trim()`, which removed the leading space of the first ` M path` porcelain line; then `slice(3)` cut the path's first character | `trimEnd()` in `heartbeat.ts`. All other git outputs used (rev-parse, branch, `%cI`, ls-remote) have no leading whitespace |
| `+99:99` and `+00:99` offsets accepted | `INSTANT` regex took any two digits | Offset is now `[+-](?:[01]\d|2[0-3]):[0-5]\d` |
| Nonfinite injected clock gave not-due or healthy | NaN comparisons are all false | `heartbeatDue`, `runHeartbeat`, `normalizeWatchdogFacts` and `decideWatchdog` throw on nonfinite `now` |
| Alphabetic `error.code` / unknown key echoed a sentinel | Format-only "safe" regexes | Finite name and code allowlists in `safeError`; a fixed `unknown keys` message |
| D7 intended commit/tag missing | Not in the original brief | Optional validated `commit`/`tag` fields, rendered when present |

There are 9 fail-first tests: 7 are new and 2 are existing tests (time parsing, malformed watchdog facts) extended with new cases.

- **Tracked heartbeat end-to-end.** The fixture seeds `.github/audit/heartbeat.txt` in the 31-day-old base. The test asserts a pushed fast-forward, `M\t.github/audit/heartbeat.txt` as the only diff, the new content, no tags and a clean work tree.
- **Nonfinite clock in `runHeartbeat`.** Refused; the remote is unchanged.
- **Offsets.** Invalid offsets are rejected, and `±23:59` still parses.
- **Nonfinite `heartbeatDue` clock.** Throws.
- **Watchdog.** Invalid-offset facts and a nonfinite clock are never healthy.
- **Unknown keys.** Both the alphabetic `SyntheticTokenQzXwVb` and the dashed synthetic secret give exactly `invalid failure summary: unknown keys`.
- **Error allowlists.** A synthetic alphabetic code, a non-allowlisted underscore code, or an alphabetic custom error name gives exactly `notice: SMTP send failed: Error`, while an allowlisted code (`TypeError (ECONNRESET)`) is still reported.
- **Commit/tag.** Accepted and rendered, absent when omitted. Twenty malformed values must fail with exactly the `commit` or `tag` field message: uppercase, short or long hex, a trailing newline, non-hex, a leading space and non-strings for the commit; no `v`, a single component, a prerelease, a leading zero, `V`, header injection, a secret suffix, `refs/tags/`, five components, empty and a number for the tag.

Existing boundary tests (30 d / 30 d − 1 ms, 5 min skew, 48 h / 48 h + 1 ms, install grace) are unchanged and pass.

- Red, with the new tests against the unrepaired `c01afc3` code: `bun --no-env-file test tests/reaudit-operations.test.ts` gave exit 1, 29 pass / 9 fail. Every new case failed, and the tracked case failed with B's exact message `heartbeat: refusing changes outside the heartbeat file`. Log: `evidence-u3/repair-red.log`.
- Green: the same command gave exit 0, 38 pass / 0 fail, 228 expect() calls. Log: `evidence-u3/repair-green.log`. `bun run typecheck` gave exit 0.
- Configured changed-test command. It ran serialized with `flock implementation/native-check.lock`: queued 07:59:36Z, waited for B's lane check, got the lock at 08:45:59Z. It ran `bun run build:plugin` (exit 0) and then the brief's Bun `--env-file` wrapper running `: "${AKROGON_BASE:?…}" && bun test` with `AKROGON_BASE=4e929fca0a8c793f2189454091fb5c0fcf74a1da`.
  - Result: **exit 0, 324 pass / 0 fail, 4556 expect() calls, 324 tests across 29 files in 3113.68 s** (finished 09:37:53Z).
  - The tested tree was `77facef…`, the uncommitted repair over `c01afc3`. The amended commit `b827770` has exactly that tree.
  - The `test/plugin/updates.test.ts` Playground failure from the original run did not recur.
  - Log: `evidence-u3/repair-changed-tests.log`; exit file `repair-changed-tests.exit` = 0.
- No new SMTP selftest, real heartbeat, real main/tag mutation or env-file read was performed. The delivered `selftest.log`/`arrival.log` evidence is preserved unchanged.

## Tests run (original unit run, preserved)

PATH was prefixed with Node 24 (`/home/rudi/.local/share/mise/installs/node/24.21.0/bin`).

- Red: `bun test tests/reaudit-operations.test.ts` before any implementation gave exit 1, 0 pass / 1 fail / 1 error (modules missing). Log: `evidence-u3/red.log`.
- Green: the same command gave exit 0, 31 pass / 0 fail, 173 expect() calls. Log: `evidence-u3/green.log`.
- `bun run typecheck` (tsc --noEmit; tsconfig includes scripts/tests) gave exit 0.
- `bun install --frozen-lockfile` gave exit 0. `bun run build:plugin` gave exit 0. Log: `evidence-u3/build-plugin.log`.
- Configured changed-test command, exactly as in brief §7 with `AKROGON_BASE=4e929fca0a8c793f2189454091fb5c0fcf74a1da` (full `bun test`): exit 1, 316 pass / 1 fail, 4491 expect() calls, 317 tests across 29 files in 3195 s (06:55–07:48Z). Log: `evidence-u3/changed-tests.log`.
  - The single failure is the non-owned `test/plugin/updates.test.ts` test "the download boundary refuses unverified helper packages and leaves the installed bytes unchanged" (54 s).
  - The cause was a WordPress Playground PHP fatal inside `wp_is_maintenance_mode()`: `require(/wordpress/.maintenance)` failed to open, raised from `test/plugin/harness.ts:279`. This unit did not touch that code path.
  - Two other workers' full suites (u1, u2) were running concurrently on the same host.
  - Rerunning that test alone (`bun --env-file=<registered .env> test test/plugin/updates.test.ts -t "download boundary refuses unverified helper packages"`) gave exit 0, 1 pass / 0 fail, 40 expect() calls. Log: `evidence-u3/updates-rerun.log`.
  - I treat this as a load-sensitive Playground race outside this unit's ownership and did not repair it. B's final full suite should confirm it.
  - `tests/reaudit-operations.test.ts` passed inside the full run.
- Privacy scan: `findSecret` was run over `evidence-u3/` and this report against nine real secret values loaded through `--env-file` (values not printed). Findings: 0 and 0.

### Live checks (real, not fixtures)

- **Real Gmail SMTP** (`evidence-u3/selftest.log`): `bun --env-file=<registered .env> scripts/reaudit/notify.ts --selftest` at 2026-10-06T06:48:51Z gave exit 0, `smtpAttempts 1, accepted 1, rejected 0, selftestId n2flwqprza2x`. This is SMTP acceptance only.
- **Mailbox arrival, separately confirmed** (`evidence-u3/arrival.log`): a one-off read-only `pollDelivery` (existing `src/mail/imap.ts`) on the dedicated account searched for `[pirax-test n2flwqprza2x]`.
  - Folder override: the configured spam folder plus `INBOX`, because notices go to the account's own address rather than the IMAP_FOLDER plus-address folder.
  - Outcome: `delivered` (INBOX, not spam) in 759 ms.
  - Commands were AUTHENTICATE/EXAMINE/UID SEARCH/Subject-only BODY.PEEK fetch, with no SELECT or flag writes. The script text is included in the log. No body or credentials were printed. A pre-run boolean check confirmed that IMAP_USER equals the recipient address and IMAP_HOST is Gmail; values were not printed.
- **Real read-only GitHub** (`evidence-u3/watchdog-live.log`): `bun --no-env-file scripts/reaudit/watchdog.ts --no-notify` was run against CastrumS/pirax-castrum-maintenance.
  - The first run returned `actions-query-failed`. On this machine `~/.local/bin/gh` is a mise wrapper script that hangs under the allowlisted child env, so the 60 s timeout fired and the result was correctly reported as unhealthy.
  - Rerun with the mise-installed native gh binary first on PATH: `{"healthy":false,"reason":"workflow-missing","notice":"skipped"}`, exit 1. This is correct: the repository currently has no Actions workflows (`gh api .../actions/workflows` lists none). No email was sent for this check.
- **Local git only**: all heartbeat proof uses temp bare repositories over file://. The real heartbeat CLI was never run, and no real main, tag, release or schedule was touched.

## Known limitations

- The repair's new evidence logs contain only synthetic-test output; the original `findSecret` scan against real values was not repeated for them. `repair-changed-tests.log` is the same suite output class as the scanned `changed-tests.log`.

- Same-host total scheduler outage is not covered. The watchdog runs on the same GitHub Actions scheduler as reaudit.yml, so a platform-wide outage, or both workflows being disabled, silences it until execution resumes. An unconditional guarantee needs a separately authorized external monitor (D12).
- SMTP acceptance is not a delivery guarantee in general; this unit's single selftest arrival was confirmed separately. If Gmail is down, `sendFailure` fails with a safe error and the caller stays failed.
- `safeChildEnv` drops everything outside its allowlist. That suits GitHub-hosted runners, which use a native `gh` with `GH_TOKEN`. Locally, a wrapper `gh` that needs other variables (like this machine's mise shim) times out and reports `actions-query-failed`, which fails closed rather than healthy.
- Heartbeat push credentials come from the checkout's git configuration or a credential helper (e.g. actions/checkout's persisted auth header, or a `GH_TOKEN` credential helper). The workflow unit must provide a write-capable credential for this job only. The heartbeat file's initial committed payload is owned by the integration unit; `runHeartbeat` creates the directory and file when due.
- `FailureSummary` now has the validated optional `commit`/`tag` fields (repair). Integration must populate them; this unit does not derive them.
- `safeError` reports `Error` for codes outside the allowlist. A genuinely public but unlisted SMTP/network code is therefore reported without its code; that is deliberate, and the fix is to extend the list.
- The watchdog inspects the newest 50 runs of reaudit.yml. Runs from other events are ignored. The run conclusion is deliberately ignored, because failure notices come from reaudit.yml's own notification job.
- The CLI test for missing credentials initially made one real SMTP login attempt. The worktree's pre-existing `.env` symlink was auto-loaded by Bun, which supplied the real IMAP_USER alongside a synthetic password. Gmail rejected it with EAUTH and no mail was sent. The test children now use `--no-env-file` from a temp cwd.

## Unverified criteria

- The original AC5 changed-test run was not green: one non-owned Playground test failed under concurrent load. It passed in an isolated rerun. The repair's serialized configured run is green (exit 0, 324/0), so this item is resolved.

- AC4 healthy live query: unverified until `reaudit.yml` exists on main. The real read-only lookup currently and correctly returns `workflow-missing`. The healthy and overdue paths are fixture-proven. Live verification belongs to the post-merge `gh workflow run reaudit-watchdog.yml` step owned by integration/merge.
- AC3 real heartbeat push to GitHub: not executed by design. It needs the workflow and elapsed time, and the decision boundaries are fixture-proven.
- Daily scheduling and elapsed-time keep-alive behaviour are not provable in this unit.

## Brief §8 summary (repair)

Changed files and reasons:
- `scripts/reaudit/heartbeat.ts`:
  - Porcelain parsing fix (`trimEnd`), so a tracked heartbeat commits and pushes.
  - Offset bounds in `parseInstant`.
  - Nonfinite-clock refusal in `heartbeatDue` and `runHeartbeat`.
- `scripts/reaudit/watchdog.ts`: nonfinite-clock refusal in `normalizeWatchdogFacts` and `decideWatchdog`.
- `scripts/reaudit/notify.ts`:
  - Fixed unknown-key message.
  - Finite allowlists for error names and codes in `safeError`.
  - Optional validated `commit` (40 lowercase hex) and `tag` (`v` + stable dotted numeric) fields in `FailureSummary`, rendered when present.
- `tests/reaudit-operations.test.ts`: fail-first tests for all of the above, including the tracked-heartbeat end-to-end case against a local bare remote.

Tests run:
- Focused red: exit 1, 29 pass / 9 fail (`evidence-u3/repair-red.log`).
- Focused green: exit 0, 38 pass / 0 fail (`evidence-u3/repair-green.log`).
- `bun run typecheck`: exit 0.
- Configured changed tests under flock, after `build:plugin`: exit 0, 324 pass / 0 fail, 3113.68 s (`evidence-u3/repair-changed-tests.log`).
- Amended commit: `b827770bf1d3806388720dd6a95b50278c527f5b`, tree equal to the tested tree.

Known limitations:
- Same-host scheduler outage; the watchdog fails closed with the local mise `gh` wrapper.
- Unlisted SMTP codes render as `Error`.
- Integration must supply `commit`/`tag`.
- No real heartbeat push or live healthy watchdog check yet (see above).

Unverified criteria:
- AC3 real GitHub heartbeat push and the AC4 live healthy watchdog both need `reaudit.yml` on main, which is post-merge evidence. Every repair-brief criterion (1–5) is verified locally.
