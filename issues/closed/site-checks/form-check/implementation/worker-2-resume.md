# Worker 2 resume — authorized remainder complete

Read the revised `brief-2.md` before editing and reread section 8 before this return. Preserved `worker-2.md` and its original mismatch evidence unchanged. Preserved predecessor edits. No commits, lifecycle commands, environment-file inspection/editing, authentication mocks, live-site operations or mailbox cleanup mutations.

## Outcome

All four **revised brief** criteria are satisfied for this first-unit remainder. No newly observed physical prerequisite or implementation conflict remains. **Exactly one SMTP message was sent and accepted**, found by production polling as `delivered`, and intentionally left in the mailbox. The independent unsent ID exercised the full default five-minute timeout. Report/browser evidence now survives test cleanup; both generated R2 roots were verified empty.

This is not completion of the whole leaf: browser runner/CLI/integration/docs work remains with B and subsequent workers.

## Changed files and reasons

Seven repository paths changed by this resume (other existing dirty/untracked paths belong to the predecessor):

- `package.json` — pin ImapFlow exactly to `2.0.7`; register its Bun dependency patch.
- `bun.lock` — record exact pin and patch mapping, preserving predecessor dependencies.
- `patches/imapflow@2.0.7.patch` — reproducible opt-in `literalMailboxes` option in both ESM/CJS shipped runtime builds and type declarations. Skip startup NAMESPACE (therefore its LIST fallback); require a string mailboxOpen path and bypass namespace/INBOX normalization; suppress select metadata LIST. Default behavior and other mailbox APIs are unchanged.
- `src/mail/imap.ts` — enable that mode; request `{uid: true, headers: ['SUBJECT']}` only for search candidates; unfold/isolate a single Subject field and use the installed MIME decoder. Reject malformed/duplicate fields, invalid UTF-8, decoded controls and leftover malformed encoded words conservatively. Preserve deadlines, cleanup and error sanitization.
- `test/forms/imap.test.ts` — actual installed ESM/CJS command/encoding diagnostics for startup suppression, exact paths/default behavior, missing-folder no-fallback, Subject-only PEEK compilation; decoded folded Q/B subjects and malformed/duplicate/near-tag negatives. Existing real TCP deadline/STARTTLS/cleanup tests remain.
- `test/forms/mailbox-selftest.ts` — literal mode for independent snapshots; real authentication/two-folder preflight before sending; record SMTP attempt/acceptance facts; require read-only snapshots and PEEK/no-discovery command evidence; assert no FETCH for the unsent ID.
- `test/forms/report.test.ts` — retain reports, fetched private HTML and real Chromium trace; sanitized summary with paths, scoped prefix and cleanup counts; scan retained files and unpacked trace for raw/encoded secrets and signed-URL markers. No signed URL retained and no trace uploaded. Existing manifest-last/approval tests preserved.

## Tests run

Logs below are relative to authoritative `implementation/evidence/worker-2/`.

1. **Red**, before implementation: `bun --no-env-file test test/forms/imap.test.ts`.
   - `resume-red-corrected.txt`: **10 pass, 5 fail, 65 assertions**. Both builds emitted NAMESPACE despite literal mode and transformed `Tests` to `INBOX.Tests`; Subject decoder was absent.
   - Earlier `resume-red.txt` is also retained. Its startup diagnostic initially used function `toString()`, whose Bun output omitted comments; corrected the diagnostic to read installed JS before the meaningful red above. Folder/decoder failures were already genuine.
2. Generated the patch using Bun's dependency patch workflow, then reran the same command.
   - `resume-green.txt`: **15 pass, 0 fail, 283 assertions**.
3. **Real mailbox:** `bun --env-file=.env run mail:selftest`.
   - `resume-mail-selftest.txt`: **exit 0**, all eight checks and summary privacy scan passed. Details below.
4. **Reproducibility:** removed only disposable `node_modules/imapflow`, then `bun --no-env-file install --frozen-lockfile --ignore-scripts`.
   - `resume-reinstall.txt`: **exit 0**. Subsequent diagnostics against the reinstalled ESM/CJS package passed, proving this is not a node_modules-only change.
5. `bun --env-file=.env test test/forms/config.test.ts test/forms/imap.test.ts test/forms/report.test.ts tests/report.test.ts tests/commands.test.ts`.
   - `resume-targeted.txt`: **48 pass, 0 fail, 627 assertions**, 9.83 s.
6. Configured changed-test suite, with explicit environment loading to honor brief section 5:
   ```sh
   export VISUAL_NODE=/home/rudi/.local/share/mise/installs/node/24.21.0/bin/node
   export PATH="$(dirname "$VISUAL_NODE"):$PATH"
   export AKROGON_BASE=08fa818b7517dad3c2c0bfd0c2bef290d97db148
   : "${AKROGON_BASE:?AKROGON_BASE is required}" && bun --env-file=.env test
   ```
   - `resume-changed-tests.txt`: **168 pass, 0 fail, 2022 assertions across 17 files**, 810.53 s, exit 0. Includes existing real Playground/plugin suites.
7. Diagnostic `bun --no-env-file x tsc --noEmit`: **exit 0**, no diagnostics (`resume-typecheck-diagnostic.txt`). B still owns its separate final blocking checks.
8. `git diff --check`: clean. In-memory privacy scan of this attempt's evidence logs/copied summaries: **pass** (`resume-privacy.txt`); no matching values printed.

## Real mailbox proof and installed client evidence

Retained worktree summary:
`runs/mail-selftest-2026-09-26T14-15-22.260Z/summary.json`

A safe copy is at `implementation/evidence/worker-2/resume-mail-summary.json`.

- SMTP attempts: **1**; accepted recipients **1**, rejected **0**.
- Arrival: **1973 ms**, then stable before-snapshots.
- Production positive poll: **delivered**, **3138 ms**.
- Unsent poll: **failed**, **300001 ms**, explicit no-tagged-message timeout.
- Before / after delivery / after timeout snapshots were identical: configured inbox count **2**, candidate UID **2**, flags **[]**; configured spam count **0**, no candidates. UIDVALIDITY, UIDNEXT and HIGHESTMODSEQ also unchanged. Candidate remained unseen.
- Positive authenticated command facts: **2 EXAMINE**, **2 UID SEARCH**, **1 UID FETCH (UID X-GM-MSGID MODSEQ BODY.PEEK[HEADER.FIELDS (SUBJECT)])**. Normal TLS/auth/session setup and LOGOUT only otherwise.
- Unsent authenticated session: **41 EXAMINE**, **40 UID SEARCH**, **zero FETCH**. Deadline expired during the next folder-open round and forcibly closed the connection; no unbounded logout wait.
- Snapshot sessions: **12 EXAMINE**, **24 UID SEARCH**, **5 candidate UID/FLAGS metadata fetches** across six real authenticated sessions.
- Across all these sessions: **no LIST, LSUB, NAMESPACE, SELECT, body fetch or mutation commands**. Evidence retains command/item names only, never arguments, credentials or raw protocol.

Installed source mechanism:
- `dist/{esm,cjs}/imap-flow.js`, `startSession`: `literalMailboxes ? false : await this.run('NAMESPACE')`; skips both discovery paths without replacing TLS/authentication.
- `dist/{esm,cjs}/commands/select.js`: exact string path branch; metadata LIST guarded off only in literal mode; unchanged encoding and EXAMINE implementation.
- `dist/{esm,cjs}/commands/fetch.js`: existing header query compiler emits `BODY.PEEK[HEADER.FIELDS (SUBJECT)]`; no second IMAP parser added.
- `imapflow/lib/tools.js`, `decodeText`: installed MIME decoder reused after strict Subject isolation/unfolding.

Pure installed-code tests exercise post-auth **discovery code only**, select/fetch compilation and encoding; they are not fake authentication or authentication proof. Startup cases cover with/without NAMESPACE; literal cases cover nonempty namespace, lowercase `inbox`, spaces, Croatian characters and ampersand, with UTF-8 enabled/disabled. Both shipped builds are tested. The separate real selftest supplies authentication/wire/delivery proof.

## Retained report / trace / R2 cleanup

Latest full-suite evidence directory, relative to worktree:
`runs/forms-report-tests-f03e9cd5-38c6-4206-80b0-6a61a62aa918/`

Within it:
- `summary.json` — exact absolute paths, privacy and cleanup facts; safe copy at `implementation/evidence/worker-2/resume-report-summary.json`.
- `2026-09-26T14-35-57.358Z/index.html` and `manifest.json` — locally rendered forms report.
- `2026-09-26T14-35-57.358Z/report-browser.trace.zip` — actual headless Chromium trace, video off.
- `2026-09-25T13-00-00.000Z/index.html`, `manifest.json`, `remote-index.html` — published forms report and byte-identical fetched private HTML.

Fresh remote root: `test/forms-report-2026-09-26T14-35-57.713Z-9f9d91a3/`.
**13 objects deleted, 0 remaining, cleanup verified.** Forms publication uploaded HTML then manifest only; zero trace uploads. Newer forms report did not hide the older check from approval; malformed newer manifest still failed approval.

The targeted run also retains its independent evidence at
`runs/forms-report-tests-fbd107e1-331c-4e78-af5d-1b5a6c7fd737/summary.json`;
its root `test/forms-report-2026-09-26T14-22-14.733Z-75c9a52e/` likewise had **13 deleted, 0 remaining**. Both summaries identify their browser trace paths. Sentinel `home.trace.zip` files remain only as upload-exclusion fixtures; the genuine browser evidence is explicitly `report-browser.trace.zip`.

## Exported interfaces

`pollDelivery({id, config, timeoutMs?, onCommand?})`, its result, configuration readers and report APIs are unchanged. One additive pure helper is exported: `subjectFromHeaders(headers: Buffer | undefined): string | undefined`. The pinned dependency adds optional `ImapFlowOptions.literalMailboxes` (default false).

## Known limitations

- Unchanged snapshots demonstrate a quiet observation interval, not exclusive control over the mailbox. The one sent selftest message remains intentionally undeleted.
- Real delivery was observed in the configured inbox, not spam/both folders. Spam precedence is covered by existing pure policy tests; no artificial filing/mutations were performed.
- Nonempty namespace/Unicode/default-library behavior and missing-folder no-fallback are pure installed-command diagnostics, not additional provider sessions. Real wire proof covers the actual configured folders/provider.
- Literal mode deliberately affects startup discovery and `mailboxOpen`, not arbitrary other library mailbox APIs. Polling/snapshots use only the supported narrow path, never `getMailboxLock`.
- Subject parsing deliberately fails closed on malformed/duplicate/non-Subject returned fields. No reconnect/submission retry abstraction was added.
- Local report/trace evidence is now retained and will consume disk until explicitly removed; remote test prefixes are empty.

## Unverified criteria / remainder

No revised-brief remainder criterion remains blocked. Whole-leaf browser form runner/CLI, new form-specific Playground end-to-end scenarios and documentation are outside this worker scope. No claim is made for those still-unimplemented flows, a new visual selftest, real spam delivery, other providers, or B's final lifecycle/full-suite/typecheck acceptance.
