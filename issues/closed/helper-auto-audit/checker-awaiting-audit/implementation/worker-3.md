# Worker 3 report: integrated command/browser/R2 evidence, criterion 7 fix and docs (D3–D8)

Worktree `issues/worktrees/checker-awaiting-audit-u3`, detached, on `ccd7747` (both prior worker commits landed). Three commits:

- `ce34761` `fix: keep a natively invalid selected form rejected beside an awaiting-audit message` (criterion 7)
- `524f590` `test: prove awaiting-audit aging through production forms/check against real scoped R2; document it`
- `1fc1583` `fix: correct awaiting-audit doc claims; own command-test fixtures inside cleanup` (completion turn: B's section 8 corrections)

## Changed files and reasons

### Completion corrections (`1fc1583`, from B's section 8 review)

- `README.md`:
  - The existing confirmation paragraph's "Client/native server validation refusals are `rejected`" now names the exception: an exact helper awaiting-audit refusal is a time-limited warning (linked to its section).
  - Stale, other-form and outside-instance messages are now described as ignored. They cannot establish the attempt's result, and without another fresh form-associated result the attempt times out as `failed`. The text no longer claims they always force `failed`.
  - "Not cleared" now says skipped, duplicate and other-page rows keep the clock only alongside a current awaiting-audit result, and that an all-skipped completed pass clears it.
  - Invalid or read-error state is now described as an attempted replacement.
  - A failed save is disclosed in the awaiting form's detail and the log. A failed clear goes into the site's first form row only when one exists; otherwise it appears only in the command log.
- `test/forms/README.md`: the browser matrix's `failed` bullet now says those messages are ignored and the result is a timeout.
- `test/forms/awaiting-audit-commands.test.ts`: nothing runs at module scope any more except `setDefaultTimeout`. The fixture `fetch` handler and the ImapFlow `observe()` wrapper are inert definitions.
  - Inside the test's `try`, it starts the server, starts the real mailbox listener, installs the observer (still observing, not replacing), sets the synthetic environment and launches Chromium.
  - `finally` first restores the ImapFlow prototype and the environment synchronously, then stops the server and listener. Browser close is in a `try` whose own `finally` does the R2 root cleanup, the summary write and the zero-remaining assertion.
  - A filtered-out run (`-t no-such-test`) now finishes in 228 ms with nothing started.
  - The real listener, the positive control and every assertion are unchanged.

### Earlier commits

- `src/forms/submit.ts` (criterion 7 only, one condition): `submitForm` returns `awaiting-audit` only when `observed.invalid` is empty. Before the fix, a fresh awaiting message next to a selected form that was newly natively invalid became a warning, because `observed.bad` was evaluated before `observed.invalid`. Now that case falls through to the existing `rejected` result. The detail is the same `Plugin refused submission: …` text, and the GF summary heading is still included as it is for other rejections. No retry or other behavior changed.
- `test/forms/browser.test.ts`: two fail-first fixtures were added to the existing classification matrix, both expecting `rejected`:
  - `/gf-awaiting-invalid`: the GF native POST re-renders `#gform_1` with an empty `required` input beside the helper paragraph.
  - `/ff-awaiting-invalid`: the FF AJAX error stack is shown after `setCustomValidity` on the selected form's email field.
  
  Both cases assert that the awaiting text stays in the detail and that exactly one POST was made.
- `test/forms/awaiting-audit-commands.test.ts` (new): a single real-scoped-R2 scenario chain through production `runForms`, `runBaseline` and `runCheck`.
  - **Fixture:** a loopback GF/FF fixture. The GF native POST returns the summary plus the helper paragraph; the FF AJAX stack is rendered from the JSON message. The refusal's version text and reply mode can change, while page HTML stays static so baselines remain stable. The designated GF #1 sits next to a skipped duplicate and an undesignated FF; `/other/` is all skipped.
  - **Environment:** synthetic forms/IMAP values for the run, restored afterwards.
  - **Mailbox:** a real loopback mailbox listener. A connection counts as the checker's only if its peer port equals the local port of the installed ImapFlow client's socket. `connect()` is observed, not replaced, which is the existing pattern in `imap.test.ts`; that file documents the local desktop service that probes listeners. Foreign probes are recorded but not asserted.
  - **Report rendering:** fetched remote and local report bodies are rendered with `setContent` in headless Chromium. Tracing is on; screenshots, snapshots, sources and video are off. No signed URL is navigated or retained, and the test asserts that no network request is made.
  - **Privacy:** `findSecrets` runs per file over every retained file except visual capture traces (those keep screenshots/snapshots by design, 16 skipped). It runs once with the synthetic redactor and again after the real environment is restored.
  - **Cleanup:** in `finally` the test stops the server, listener and browser, restores the environment and the ImapFlow prototype, and deletes only the test root. Zero objects must remain.
  - The summary states that this is checker behavior evidence, not released-helper audit evidence.
- `README.md`:
  - The exit code list now covers `awaiting-audit` within 72 hours (0) and past 72 hours (1).
  - The storage layout adds `state/awaiting-audit/<slug>.json`, with notes that pruning, baseline and approve never touch it.
  - The outcome table has an `awaiting-audit` row.
  - A new section, "Awaiting-audit refusals", covers: exact text and which near matches stay rejected (including native invalidity); stale/foreign → failed; no polling or retry; the clock format; start, keep and the strict >72 h escalation; detail content; no restart on repeats; clearing and non-clearing rules; update before publication; storage fallback and the `Awaiting-audit state:` log prefix.
  - Limitations add: first-seen means the checker's observation; R2 race; outage or corruption postponing escalation; a failed clear leaving an old clock; orphaned renamed slugs.
  - Stale adjacent claims fixed: the "R2 failures were not induced" limitation now names the induced state-operation exception, and the `test:forms` description is updated.
- `test/forms/README.md`:
  - New targeted command line.
  - Browser awaiting-audit matrix paragraph, including the new invalid case.
  - "What is real" bullets for `awaiting-audit.test.ts` (unit 2) and the new command test.
  - Awaiting evidence paths and summary contents.
  - `awaiting-audit` added to the warning list in the exits paragraph.

No helper, plugin README, agent docs, lifecycle files, credentials or live sites were touched. No environment file was opened. Values were loaded only through `bun --env-file=…`.

## Tests run

All with Node `/home/rudi/.local/share/mise/installs/node/24.21.0/bin` first on PATH.

- Setup: `bun install --frozen-lockfile && bunx playwright install chromium && bun run build:plugin` → exit 0, `dist/pirax-form-test.zip (10 files, sha256 df598622…7406)`.
- **Red (criterion 7)**, on `ccd7747` plus the new fixtures, with `bun --no-env-file test test/forms/browser.test.ts -t "exact awaiting-audit"`:
  - `Received: "/gf-awaiting-invalid: awaiting-audit"` (0 pass, 1 fail). Log: `worker-3-evidence/worker-3-red-gf.log`.
  - The cases were temporarily reordered to get FF's independent red: `Received: "/ff-awaiting-invalid: awaiting-audit"` (0 pass, 1 fail). Log: `worker-3-red-ff.log`.
- **Green (criterion 7)**: `bun --no-env-file test test/forms/browser.test.ts` → 22 pass, 0 fail, with both fixtures `rejected`. Log: `worker-3-green-browser.log`.
- **Command scenario**, targeted: `bun --env-file=/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/.env test test/forms/awaiting-audit-commands.test.ts`.
  - The first four attempts failed on my own test assertions and oracles:
    - a `— undefined` status string;
    - a first-page shape index;
    - a foreign local probe counted as a mailbox connection during a long `check`, which led to the ImapFlow-port attribution;
    - `findSecrets` rejecting visual capture traces, which led to the per-file scan.
  
    None was a production defect.
  - The fifth attempt passed: 1 pass, 179 expects, 85.4 s. Log: `worker-3-commands-5.log`.
- **Non-native suites**, run as one command:
  ```
  export AKROGON_BASE=2689aaa3bd69a9a46cc77788fdc5219354cc923a
  bun run typecheck                      # exit 0
  bun --env-file=/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/.env -e 'const p=Bun.spawn(["bash","-c",": \"${AKROGON_BASE:?AKROGON_BASE is required}\" && bun test tests test/forms/awaiting-audit-commands.test.ts test/forms/awaiting-audit.test.ts test/forms/browser.test.ts test/forms/config.test.ts test/forms/evidence.test.ts test/forms/imap.test.ts test/forms/report.test.ts"],{stdout:"inherit",stderr:"inherit"});process.exit(await p.exited)'
  ```
  ```
   185 pass
   0 fail
  Ran 185 tests across 17 files. [267.05s]
  ```
  Log: `worker-3-evidence/worker-3-nonnative.log`. `findSecrets` over `worker-3-evidence/` with the Bun-loaded redactor → `[]`.
- **Completion turn, corrected code (`1fc1583`):**
  - `bun run typecheck` → exit 0.
  - `bun --no-env-file test test/forms/awaiting-audit-commands.test.ts -t no-such-test` → 0 tests matched, 228 ms, no fixture started.
  - `bun --env-file=… test test/forms/awaiting-audit-commands.test.ts` → 1 pass, 0 fail. Evidence: `runs/forms-awaiting-commands-aeb38eb5-1af7-4ea3-bfa2-0daaa3797492/summary.json`, deleted 90, remaining 0. Log: `worker-3-evidence/worker-3-commands-6.log`.
- **Configured changed-test command, full `bun test`, on committed `1fc1583`:** started only after B's `lane-after-u2` process exited and wrote `lane-after-u2.exit` = `0`, so no overlapping native suite ran. The worktree was clean.
  ```
  export PATH=/home/rudi/.local/share/mise/installs/node/24.21.0/bin:$PATH AKROGON_BASE=2689aaa3bd69a9a46cc77788fdc5219354cc923a
  bun --env-file=/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/.env -e 'const p=Bun.spawn(["bash","-c",": \"${AKROGON_BASE:?AKROGON_BASE is required}\" && bun test"],{stdout:"inherit",stderr:"inherit"});process.exit(await p.exited)'
  ```
  ```
   262 pass
   0 fail
   3905 expect() calls
  Ran 262 tests across 25 files. [2235.26s]

  changed-tests exit 0
  ```
  - Sanitized log: `worker-3-evidence/worker-3-changed-tests.log`. Inside Bun, every loaded value of 6+ characters found in the log was replaced with `<redacted:NAME>`; only names were printed. The replacements were `PWD` ×10 and `NVD_BACKEND` ×2, which are ambient shell variables matching ordinary path/log text (over-redaction, no secret). The raw log was deleted, and `findSecrets` over `worker-3-evidence/` → `[]`.
  - Suite evidence (u3 worktree, git-ignored):
    - `runs/forms-awaiting-commands-4d508227-323f-40f6-b4a2-6af9d54c5313/summary.json` (root `test/forms-awaiting-audit-commands-2026-10-02T16-06-37.316Z-6ffdde32/`, deleted 90, remaining 0, fixture privacy hits [], 16 capture traces skipped). Its scenario table matches the one below; in this run the single foreign probe landed in `check-escalated`, and the owned connections were again only in `clear-confirmed-undelivered`.
    - `runs/forms-awaiting-cf4172ee-1254-48d7-8727-3f595d667cb4/summary.json`
    - `runs/forms-playground-0e4c3d95-1ebc-4e3c-ba90-9a12ad2fd999/summary.json`
    - `runs/forms-collision-d82ae233-27d9-41fe-b31e-5362a55ac033/synthetic-folder-collision/summary.json`
    - `runs/forms-report-tests-9db91cf4-df7b-45ce-a647-00ae4b8c0bd6/summary.json`
    - `runs/forms-browser-0c1b2476-7ce6-4272-b40c-1e78245abbc0`

**Command-evidence summary from the earlier (pre-correction) green run** (`runs/forms-awaiting-commands-f2b5764c-e602-4409-be53-36a08d0e09a9/summary.json`, root `test/forms-awaiting-audit-commands-2026-10-02T15-39-06.546Z-27585904/`, cleanup deleted 90 / remaining 0; privacy fixtureHits [] with 16 capture traces skipped). Columns are scenario → exit, status, POSTs, owned mailbox connections, foreign probes:

```
forms-first              0 warning 1 0 0   (first sighting; firstSeen object; second site cleared by its own pass, then reseeded as sentinel)
forms-repeat-reversed    0 warning 1 0 0   (fresh Store, reversed page order; bytes unchanged)
forms-ff-new-version     0 warning 1 0 1   (FF, "Fluent Forms Pro 6.2.17, FluentSMTP 2.4.2"; bytes unchanged)
baseline                 0 -       0 0 0
check-warning            0 warning 1 0 0   (captured/same/no health or warnings; bytes unchanged)
forms-escalated          1 failure 1 0 0   (seeded ~100h: "Awaiting audit for 4d 4h …, exceeding the threshold of 72 hours")
forms-escalated-repeat   1 failure 1 0 0   (bytes unchanged)
check-escalated          1 failure 1 0 0   (captured/same visuals; bytes unchanged)
clear-normal-rejection   1 failure 1 0 0   → cleared
clear-confirmed-undeliv. 1 failure 1 1 0   → cleared (positive mailbox control)
clear-helper-false       0 warning 0 0 0   → cleared
clear-no-designation     0 pass    0 0 0   → cleared
clear-empty-scan         0 pass    0 0 0   → cleared
check-fresh-after-clear  0 warning 1 0 0   (new firstSeen ≥ restart time)
```

The second site's seeded key was byte-identical after every scenario. Both the remote and the local report showed `awaiting-a — <status>`, the version text, and `fails after 72 hours` or `exceeding the threshold of 72 hours`.

Retained artifacts. Under the u3 worktree (git-ignored):
- `runs/forms-awaiting-commands-f2b5764c-e602-4409-be53-36a08d0e09a9/` (per-scenario `NN-<name>/<runId>/` reports, manifests, forms traces, check/baseline capture artifacts, `report-render.trace.zip`) and the earlier green run `runs/forms-awaiting-commands-d4f9b2f1-9bf0-47c3-9e79-303e0e657b20/`
- `runs/forms-browser-f56e3c43-bf1d-48a8-a1ee-389a0166a32f/`
- `runs/forms-awaiting-678cdf87-9018-4c81-8c49-01d92ae76dd1/summary.json`
- `runs/forms-report-tests-3997870e-e4be-4138-b38b-699e65e1d44c/summary.json`
- `runs/forms-collision-7c0e527a-72fe-4fc8-ae79-d43fb19a71bd/synthetic-folder-collision/summary.json`

Logs are in `implementation/worker-3-evidence/`.

## Known limitations

- First-seen is the checker's observation time, not the plugin update or audit-request date.
- R2 has no conditional write or lock, so overlapping runs for one slug can race the first write or the clear.
- A state outage or corrupt object counts as a first sighting and restarts the clock, which can postpone escalation.
- A failed clear leaves an old clock until a later successful pass.
- A renamed slug orphans its old key; there is no garbage collection.
- The fixtures follow GF/FF native shapes over loopback. They are not a released helper's output and not live-mail proof. Delivery is shown only as the undelivered positive control (a truthful `failed` result against the loopback listener).
- The mailbox oracle attributes connections by the ImapFlow client's local port. A foreign probe that happened to share that exact ephemeral port would be miscounted. That is practically negligible, and it is recorded.
- The privacy scan skips visual capture traces. They are existing pre-fill capture artifacts that keep screenshots and snapshots by design.

## Unverified criteria

None. Criteria 1–5 and 7 are covered by the evidence above. Criterion 6 is covered by the configured full `bun test` on `1fc1583`: 262 pass, 0 fail, exit 0. B's mandatory final lane checks remain B's.
