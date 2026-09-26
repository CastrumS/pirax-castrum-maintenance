# Worker 2 — implementation-mechanism mismatch (incomplete)

Read `brief-2.md` before work and reread section 8 before this report. Preserved all predecessor edits. No commits, lifecycle commands, environment-file inspection, authentication mocks, remote storage changes or live-site operations.

## Outcome

Stopped at ordered steps 1–2: the installed ImapFlow **2.0.7 public API cannot express the locked literal-folder/no-LIST contract**. This is a mechanism mismatch returned under brief section 3, not a newly observed credential/provider prerequisite. No production repair is claimed. A narrowly scoped dependency implementation patch or an explicitly approved private-internals adapter is needed; dependency pin/type metadata alone cannot correct the behavior.

**No message was sent by this worker.** `mail:selftest` was not invoked: step 2 has not established a conforming client, and the existing selftest would use the known nonconforming client and explicitly accept LIST. Real mailbox configuration validity remains unknown. No operator credential action is established by this attempt.

## Changed files and reasons

No worktree files changed by this worker; all landed implementation remains intact.

Authoritative artifacts written outside the worktree:
- `implementation/evidence/worker-2/api-red.txt` — reproducible pure installed-library path-contract failures and MIME decoding feasibility check; synthetic inputs only.
- `implementation/evidence/worker-2/existing-imap-tests.txt` — unchanged existing IMAP regression baseline.
- `implementation/worker-2.md` — this mismatch/evidence report.

## Installed client API/source evidence

Paths below are relative to the worktree. Installed package version comes from `node_modules/imapflow/package.json`; package exports include the corresponding ESM and CJS implementation and `imapflow/lib/tools.js`.

1. `node_modules/imapflow/dist/cjs/imap-flow.js:1154–1185`: `startSession()` unconditionally calls `run('NAMESPACE')` after authentication. `includeMailboxes: false` only prevents the separate verify-only listing; it does not disable this call.
2. `node_modules/imapflow/dist/cjs/commands/namespace.js:17–33,84–86`: servers without NAMESPACE cause **`LIST "" ""` during connection setup**. This additional LIST path was not identified in the predecessor report. Clearing `client.namespace` after `connect()` is therefore insufficient.
3. `node_modules/imapflow/dist/cjs/imap-flow.js:2475–2477`: `mailboxOpen()` delegates to `run('SELECT', path, options)`.
4. `node_modules/imapflow/dist/cjs/commands/select.js:67–84`: the handler calls `normalizePath(connection, pathInput)` and, on an uncached path, `run('LIST', '', path)`. Using `mailboxOpen` instead of `getMailboxLock` removes the latter's failure probe but **not** this normal-path LIST.
5. `node_modules/imapflow/dist/cjs/tools.js:393–406`: `normalizePath` prepends the personal namespace and canonicalizes any case variant of `inbox` to `INBOX`. Its third `skipNamespace` argument is not exposed by `mailboxOpen` and does not preserve lowercase `inbox` anyway.
6. `node_modules/imapflow/dist/cjs/types.d.ts:30–151,674–679`: no connection option disables namespace discovery; mailbox-open options are `readOnly` and `description`, with no literal/skip-list option. Private command registry/cache/dispatch hooks are not the supported mailbox API.
7. `node_modules/imapflow/dist/cjs/commands/select.js:114`: `{readOnly: true}` does select **EXAMINE** correctly.
8. `node_modules/imapflow/dist/cjs/commands/fetch.js:41–57,112–118`: `{uid: true, headers: ['SUBJECT']}` builds **BODY.PEEK[HEADER.FIELDS (SUBJECT)]**. PEEK itself requires no dependency implementation patch. Existing production currently requests ENVELOPE instead.
9. `node_modules/imapflow/dist/cjs/tools.js:855–856`: exported `decodeText` delegates RFC-2047 decoding to installed libmime (then handles surrounding quotes). Its feasibility for encoded exact-tag rechecking is demonstrated below. A production header path must first unfold and isolate the Subject header, fail closed on malformed/duplicate Subject fields, then decode/recheck; it must not search arbitrary header-buffer text.

These are source/API facts plus a pure-function diagnostic, **not authenticated wire proof**. No raw network logs were collected.

## Tests run

### Red: pure exact-folder diagnostic

Ran `bun --no-env-file -e '…'` importing `ImapFlow`, `normalizePath`/`decodeText` from `imapflow/lib/tools.js`, and existing `subjectHasTag`. Constructed an unconnected logger-disabled client with synthetic namespace `{prefix: 'INBOX.', delimiter: '.'}`. For each path, asserted `normalizePath(client, path) === path`. No fake authentication or network session was used.

`implementation/evidence/worker-2/api-red.txt`:

```text
FAIL literal path: configured=Tests, library=INBOX.Tests
FAIL literal path: configured=Spam, library=INBOX.Spam
FAIL literal path: configured=inbox, library=INBOX
PASS installed MIME decoder: encoded exact tag accepted; wrong case rejected
No network connections or authentication performed.
exit 1
```

Decoder check used a UTF-8 Base64 encoded `[pirax-test abc123def456] Nova poruka – Kontakt` and a Q-encoded uppercase tag. The former matched after decoding and the latter did not.

### Existing baseline (not a repair green)

`bun --no-env-file test test/forms/imap.test.ts`

```text
8 pass
0 fail
56 expect() calls
Ran 8 tests across 1 file. [1.68s]
exit 0
```

Covers input validation, bounded silent connection/cleanup, required STARTTLS before credentials, dropped/refused connection sanitization, exact decoded-tag matching, equal-folder policy, spam precedence and protocol-summary reduction. These tests do not cover the namespace/LIST mismatch and do not replace real authentication/delivery evidence.

No red-to-green repair is claimed. The configured whole-suite command, report integration, blocking typecheck and real mailbox invocation were not run after the step-2 mismatch.

## Smallest proposed correction for B to authorize

Prefer a small reproducible **pinned ImapFlow dependency implementation patch**, rather than inventing a second IMAP parser/client or silently monkey-patching internal methods:

- Add an opt-in literal/no-discovery mode used only by the delivery checker and its independent snapshot sessions.
- In that mode, skip namespace discovery in `startSession` (including the no-NAMESPACE LIST fallback), use the provided string literally in the select handler rather than `normalizePath`, and omit the metadata LIST. The handler already supports `folderListData = false`; keep its existing EXAMINE parsing, TLS/authentication and cleanup.
- Preserve ordinary library behavior outside that opt-in mode. Pin the exact package version and include the patch/type declarations reproducibly; do not edit only disposable `node_modules`.
- Change production fetching to `headers: ['SUBJECT']` and decode/recheck only that header with the already-installed decoder. Apply the same literal/no-discovery client mode to the selftest snapshots; remove LIST from all selftest allowed-command sets.

This requires authorizing dependency **implementation** changes beyond the present brief's pin/type-metadata exception. An instance-local private command-registry/cache adapter is another possibility, but would need explicit approval and equivalent version-pinned tests; a post-connect namespace reset/cache seed alone misses connection-time LIST and INBOX spelling.

Required regressions before accepting either mechanism:
1. Connection startup with and without NAMESPACE capability emits no LIST/LSUB/discovery, while preserving real TLS/authentication behavior.
2. Nonempty server namespace does not alter either configured path; lowercase `inbox`, names with spaces and non-ASCII names remain literal after protocol encoding; only the configured two names are examined.
3. Only candidate UID Subject headers are fetched with PEEK; folded RFC-2047 Q/B encoded exact tags match, wrong case/near IDs/other headers do not.
4. No candidates means no FETCH; missing-folder failure emits no discovery/fallback; deadline covers pending commands/cleanup.
5. Real authenticated selftest remains mandatory after the above; compilation/pure tests must not be represented as authentication proof.

## Exported interfaces

No changes. Existing `pollDelivery({id, config, timeoutMs?, onCommand?})`, config and report signatures are preserved.

## Mailbox/report/trace evidence

- Mailbox summary: **none from this worker**; no SMTP send or real IMAP connection attempted.
- Retained report/browser trace: **none from this worker**. Existing `test/forms/report.test.ts` still deletes its directory in `afterAll`; the planned correction remains owed.
- Scoped R2 prefix/cleanup: **not applicable**; no R2 access occurred.
- No signed URLs, credential values or raw network errors retained.

## Known limitations

Current production still has all three known D5 deviations: automatic namespace rewriting, library LIST calls, and ENVELOPE rather than Subject-only PEEK. In addition to per-folder LIST, connection setup can issue LIST when NAMESPACE is not advertised. Existing report integration still removes its only report/trace evidence.

## Unverified criteria

- Brief AC1 / plan D5: not repaired; supported API cannot meet the contract as currently used.
- Brief AC2 / plan AC5: real delivery, full 300-second unsent timeout, counts/UIDs/flags equality and safe authenticated wire evidence all remain unverified; no message sent in this attempt.
- Brief AC3 / plan AC6/8: report/trace retention and sanitized R2 cleanup summary remain unimplemented, following the ordered-step stop before mailbox proof.
- Brief AC4: existing targeted baseline passes, but no completed fix/red-to-green cycle or configured full-suite run.

No acceptance boundary has been relaxed. B owns authorization of the refined mechanism and the next worker brief.
