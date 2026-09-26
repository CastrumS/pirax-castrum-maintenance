# Worker 1 report: config, read-only IMAP and forms-only report contracts

Worktree `issues/worktrees/form-check`, base `08fa818`. No commits, no lifecycle commands, no `.env` opened, printed or edited. Nothing was written to issue files inside the worktree.

## Status

AC1–AC4 are implemented, targeted tests are green and typecheck is clean. **AC5 is blocked by a human-only prerequisite.** `bun --env-file=.env run mail:selftest` exits 2 before sending anything, because these names are **defined but blank** in the registered repository `.env` (the worktree `.env` is a symlink to it):

- `FORM_TEST_ADDRESS`
- `IMAP_USER`
- `IMAP_PASSWORD`
- `SMTP_USER`
- `SMTP_PASSWORD`

`FORM_TEST_TOKEN`, `IMAP_HOST`, `IMAP_PORT`, `IMAP_FOLDER`, `IMAP_SPAM_FOLDER`, `SMTP_HOST` and `SMTP_PORT` are present.

The plan's credential check reported these names as "present". Because it evidently checked only that the names exist, it missed that the values are empty. I checked with `process.env[n] === undefined ? "undefined" : "defined-but-blank"` and printed only names.

**Needed action (operator):**
1. Create the dedicated mailbox and fill in the redirect address.
2. Fill in the IMAP login and app password for that mailbox.
3. Fill in an SMTP login that can send to it.
4. Rerun `bun --env-file=.env run mail:selftest`.

A later unit can complete AC5 by running only that command. The script is finished and type-checked, but it has not been exercised against a real server. Expect about 7–8 minutes: arrival wait, settle snapshots, the delivered poll, then one full 300 s unsent-ID deadline.

## Changed files and reasons

- `package.json`, `bun.lock` — dev dependencies `imapflow@^2.0.7` (IMAP client), `nodemailer@^10.0.10` and `@types/nodemailer@^8.0.2` (the SMTP sender, used only in the selftest). New script `mail:selftest` → `bun --env-file=.env test/forms/mailbox-selftest.ts`, following the `store:selftest` pattern.
- `src/env.ts` — new `EnvFormatError` (a present but unusable value; the message lists names only) and the shared lazy `readEnv(env, checks)`. It throws `EnvError` for missing or blank names first, then `EnvFormatError`, and never trims values.
- `src/forms/config.ts` (new) — `readFormConfig`, `tokenPattern`, `addressPattern`.
- `src/mail/config.ts` (new) — `readImapConfig`. Port 993 means implicit TLS; any other port requires STARTTLS. Folder names are literal: `*`, `%`, control characters and leading/trailing whitespace are rejected.
- `src/mail/imap.ts` (new) — `pollDelivery` and its pure helpers.
- `src/commands/common.ts` — `safeError` and `configurationError` now recognise `EnvFormatError`, so it returns exit 2 with a value-free message.
- `src/report/model.ts` — adds `FormsPageResult`, `FormsSiteResult`, `FormsRunReport`, `FormsManifest`, `AnyRunReport`, `PublishedManifest` and `isFormsReport`. `RunReport`, `PageResult` and check `Manifest` are unchanged.
- `src/report/manifest.ts`:
  - Shared identity validators (`reportOk`, `urlOk`, `pathOk`, `formsOk`).
  - `parseManifest` is still check-only and now also rejects a check report that carries `mode`.
  - New `parsePublishedManifest`. Forms pages must have `forms` and must not have `viewports`.
- `src/report/html.ts`:
  - New `formStatus` and `pageStatus`.
  - `reportStatus` accepts both modes and gates on forms.
  - The check renderer uses `pageStatus` for page and site headings.
  - New forms-only renderer: Outcome/Plugin/Form/Detail table, "No forms found." for empty pages, no image panels, same CSP.
- `src/report/writer.ts` — the envelope is derived from the report mode. `reportAssets` validates via `parsePublishedManifest` and returns `[]` for forms runs, so only `index.html` and `manifest.json` go to R2 (manifest last). Old check callers are unchanged.
- `src/commands/approve.ts` — `newestSiteCheck` uses `parsePublishedManifest` and skips validated `command: "forms"` runs. Malformed manifests still throw. `validateApproval` stays check-only.
- `test/forms/config.test.ts`, `test/forms/imap.test.ts`, `test/forms/report.test.ts` (new) — see Tests.
- `test/forms/mailbox-selftest.ts` (new) — the real SMTP/IMAP selftest (blocked, see Status).
- `tests/report.test.ts` — replaces the obsolete "forms are not gated" assertion: failed/rejected now fail the run, and the remaining outcomes produce a warning.
- `tests/commands.test.ts` — a newer forms run is skipped, a malformed newer forms manifest is an error, and a run with only forms manifests reports "no completed check".

## Exported interface for the next worker

```ts
// src/env.ts
class EnvFormatError extends Error { readonly invalid: string[] }
function readEnv<N extends string>(env, checks: Record<N, (v: string) => boolean>): Record<N, string>

// src/forms/config.ts
type FormConfig = { token: string; address: string };
function readFormConfig(env = process.env): FormConfig   // EnvError | EnvFormatError
const tokenPattern: RegExp; const addressPattern: RegExp;

// src/mail/config.ts
type ImapConfig = { host; port: number; secure: boolean; user; password; folder; spamFolder };
function readImapConfig(env = process.env): ImapConfig   // EnvError | EnvFormatError

// src/mail/imap.ts
type DeliveryResult = { outcome: "delivered" | "delivered-spam" | "failed"; detail: string };
type PollOptions = { id: string; config: ImapConfig; timeoutMs?: number /* 1..300000, default 300000 */; onCommand?: (summary: string) => void };
function pollDelivery(o: PollOptions): Promise<DeliveryResult>  // throws TypeError for id !~ /^[a-z0-9]{12}$/, RangeError for bad timeoutMs, before any network
const DELIVERY_TIMEOUT_MS = 300_000;
function subjectTag(id): string; function subjectHasTag(subject, id): boolean;
function deliveryFolders(config): { path: string; spam: boolean }[]; function roundOutcome(folders, found: boolean[]): "delivered" | "delivered-spam" | null;
function summarizeCommand(line: string): string | null;

// src/report/model.ts
type FormsPageResult = { path; pageKey; forms: FormResult[] };
type FormsSiteResult = { slug; url; pages: FormsPageResult[] };
type FormsRunReport = { mode: "forms"; runId; sites: FormsSiteResult[] };
type FormsManifest = { schemaVersion: 1; command: "forms"; report: FormsRunReport };
type AnyRunReport = RunReport | FormsRunReport; type PublishedManifest = Manifest | FormsManifest;
const isFormsReport: (r: AnyRunReport) => r is FormsRunReport;

// src/report/manifest.ts
parseManifest(value, runId?): Manifest                 // check only (unchanged contract)
parsePublishedManifest(value, runId?): PublishedManifest

// src/report/html.ts
formStatus(f): ResultStatus; pageStatus(page: PageResult | FormsPageResult): ResultStatus;
reportStatus(report: AnyRunReport); renderHtml(report: AnyRunReport, images)

// src/report/writer.ts (AnyRunReport accepted; check callers unchanged)
reportAssets(report); writeLocalReport(report, runDir); publishReport(report, runDir, store)
```

Notes for the runner/commands worker:
- A forms page must always carry a `forms` array, even `[]`. A page-scan failure must be an explicit `failed` `FormResult`.
- The next worker also needs `pageKey(path)` for page identity; it is not re-exported here.
- `CommandResult.report` is still `RunReport`. Add a separate `FormsCommandResult`.
- `captureSelection` already gates the check exit code through the forms-aware `reportStatus`.
- `pollDelivery` has no reconnect and no retry. Call it once per confirmed submission ID.

## Privacy, PEEK and read-only evidence

What I verified in the installed imapflow 2.0.7 source (`node_modules/imapflow/dist/cjs`), rather than assuming:
- **EXAMINE:** `commands/select.js:114` sends `EXAMINE` when `readOnly: true`. `pollDelivery` calls `mailboxOpen(path, {readOnly: true})` directly.
  - It avoids `getMailboxLock`, because on a failed open that adds a `LIST "" path` probe (`imap-flow.js:3715`).
- **Exact-name LIST:** `select.js:67-78` itself runs an exact-name `LIST "" <path>` once per folder per session to cache metadata. Folder names containing `*` or `%` are rejected in config, so this can never become a wildcard listing. This is a library behaviour and is documented here.
- **Fetch items:** `commands/fetch.js:41-57,112-118` builds every header/body item as `BODY.PEEK[...]`.
  - Production fetch requests only `{uid: true, envelope: true}`, i.e. `UID FETCH <uids> (UID ENVELOPE [MODSEQ|EMAILID|X-GM-MSGID])`. ENVELOPE is header metadata, decoded with libmime, and per RFC 3501 it never sets `\Seen`.
  - I chose it over `BODY.PEEK[HEADER.FIELDS (SUBJECT)]` because PHPMailer RFC-2047-encodes non-ASCII subjects, so a raw-header recheck would miss real Croatian-subject mail.
  - No BODY/RFC822/source is ever requested. Only UIDs returned by the exact-tag SUBJECT search are fetched.
- **No mutating calls:** there are no STORE, MOVE, COPY, APPEND, DELETE, EXPUNGE, CREATE or CLOSE calls. `disableAutoIdle: true`. Library logging is off (`logger: false`) unless `onCommand` is given; that callback receives only `summarizeCommand` output (the command word plus FETCH items, never arguments or auth).
- **Library `search()` returns `false` on error** (`commands/search.js`). This is treated as a failure, not as "no mail".
- **Namespace prefix:** `normalizePath` (`tools.js:393`) prepends a server personal-namespace prefix to folder names that lack it. On a Dovecot/Courier `INBOX.` namespace, `Spam` becomes `INBOX.Spam`. Gmail has no prefix. This is a limitation, below.

Verified locally with real TCP peers (`test/forms/imap.test.ts`):
- A silent server returns `failed` "did not complete … (connect)" within 1.45–2.5 s for a 1.5 s deadline, and the socket is closed.
- STARTTLS is required on a non-993 port. A server that doesn't advertise it never receives LOGIN/AUTHENTICATE or the password.
- Dropped and refused connections give `IMAP connect failed.`, with no host, port, user, password or folder in the detail.
- Invalid ID or timeout throws before any connection is made (0 connections).

The selftest adds its own privacy gate: an in-memory scan of `summary.json` for the raw, URL-encoded and JSON-escaped token, passwords, users, hosts and address. It prints only pass/fail. On a real run the summary is written to `runs/mail-selftest-<ISO-stamp>/summary.json`. It holds IDs, outcomes, elapsed times, per-category snapshots, comparisons and command counts. No summary was produced this time, because the run stopped at the env check before creating its directory.

## Tests run

Red, before implementation (`evidence/worker-1/red.txt`):
```
AKROGON_BASE=08fa818b… bun --env-file=.env test test/forms/config.test.ts test/forms/imap.test.ts test/forms/report.test.ts tests/report.test.ts tests/commands.test.ts
(fail) private report > renders exact future Forms outcomes only when supplied   Expected: "failure" Received: "pass"
error: Cannot find module '../../src/forms/config.ts'
error: Cannot find module '../../src/mail/imap.ts'
SyntaxError: Export named 'parsePublishedManifest' not found in module '…/src/report/manifest.ts'
 16 pass  5 fail  3 errors  Ran 21 tests across 5 files.
```

Green (`evidence/worker-1/green.txt`), same command:
```
 41 pass
 0 fail
 399 expect() calls
Ran 41 tests across 5 files. [8.76s]
```

Two things changed between red and green:
- **A test fixture defect:** the manifest-vs-report comparison and the table header count were wrong in the test itself.
- **A flaky wait:** the server-side socket close was checked with a fixed 100 ms wait, which was flaky under the combined run. It passed in 3/3 isolated runs. It is now a bounded wait of at most 2 s.

The green run includes a **real R2** case under a fresh `test/forms-report-<stamp>-<rand>/` root:
- Check publication, then forms publication. Puts were exactly `index.html` then `manifest.json`, no trace uploads, and the local trace was retained.
- `runApprove` against the real store approved from the older check, not the newer forms run.
- A malformed newer manifest makes approval exit 1.
- The root was cleaned and verified empty.

The forms-only local report was rendered in headless Chromium with tracing on and no video. The trace is at `runs/forms-report-tests-*/…/report-browser.trace.zip` and is deleted by the test's `afterAll`.

`bunx tsc --noEmit` (whole project, run as a diagnostic): clean, no output.

Real mailbox (`evidence/worker-1/mail-selftest.txt`):
```
$ bun --env-file=.env test/forms/mailbox-selftest.ts
mail:selftest: Missing or blank environment variables: IMAP_USER, IMAP_PASSWORD. No mail sent.
exit 2
```

## Known limitations

- **Namespace prefix:** imapflow prepends the server's personal-namespace prefix to folder names (see above). Folder names are otherwise literal. The operator should configure the exact names as the server shows them.
- **Exact-name LIST:** one per folder per session, library-mandated before EXAMINE. It is read-only but is technically a LIST command.
- **No reconnects:** a transient network drop during the 5-minute poll is reported as `failed` (a truthful, sanitized result). There is no retry.
- **Deadline boundary:** when the deadline expires mid-round, that round is abandoned. The detail says "No message tagged … within 300 s" if at least one full round completed, and otherwise "did not complete … (<phase>)".
- **Report tests don't use the real CLI:** `test/forms/report.test.ts` exercises the writers and approval against real R2, not the `forms` CLI (not in this unit's scope).
- **Docs not updated:** new env-name docs (README table, format rules) are not written. Plan items 29–30 are for the docs worker.

## Unverified criteria

- **AC5 (real SMTP/IMAP):** blocked by the blank `FORM_TEST_ADDRESS`, `IMAP_USER`, `IMAP_PASSWORD`, `SMTP_USER` and `SMTP_PASSWORD`. Not yet verified against a real server:
  - real authenticated delivery (`delivered` / `delivered-spam`);
  - the 300 s unsent-ID timeout;
  - before/after count, UID, modseq and flag equality;
  - wire command evidence (EXAMINE / UID SEARCH / `UID FETCH (UID ENVELOPE…)` only).
- **AC2 (real-server side):**
  - the `delivered` / `delivered-spam` paths;
  - both-folder-favours-spam on real mail (pure logic is unit-tested);
  - authentication-failure and missing-folder classification against a real server;
  - that the logger never leaks auth: shown only by construction (`logger: false`, command-word-only summaries) and by the local STARTTLS test, not against a real LOGIN.
