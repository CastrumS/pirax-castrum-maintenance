# Implementation report: form-check

## Initial implementation outcome (repair round 1 appended below)

2026-09-26, slot B: implemented, committed, all blocking checks passed; ready for review. No live-site rollout performed. Earlier blank-mailbox prerequisites are resolved and real authenticated mail proof now passes.

- Worktree: `/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/worktrees/form-check`
- Branch: `form-check`
- Base / AKROGON_BASE: `08fa818b7517dad3c2c0bfd0c2bef290d97db148`
- Committed HEAD: `83509cba10299f554b087d6392f0d28b7649d767`
- Commit: `Add safe native form checks with read-only mailbox verification`
- Worktree clean after commit; no issue-artifact changes included in the branch diff.
- Authoritative artifacts: this leaf's `implementation/` directory, outside the worktree.

Sequential delegation: initial contracts unit (`brief-1.md` / `worker-1.md`), resumed mailbox/report remainder (`brief-2.md`, initial mechanism mismatch `worker-2.md`, completed `worker-2-resume.md`), browser/command unit (`brief-3.md` / `worker-3.md`), native integration/repairs/docs (`brief-4.md` / `worker-4.md`). Their detailed red/green logs and interface/evidence reports are retained. B accepted completed returns, resolved the documented dependency mechanism mismatch, performed the two-line publication-log correction below, ran independent final checks, audited evidence and committed.

## Changed files and reasons

All 38 committed paths, grouped by responsibility:

- `package.json`, `bun.lock`, `patches/imapflow@2.0.7.patch`: forms/test/mail commands; IMAP/test SMTP dependencies; exact-version reproducible patch implementing opt-in literal mailbox names without startup or select-time discovery. Both shipped runtime builds/types patched; ordinary dependency behavior preserved.
- `src/env.ts`, `src/forms/config.ts`, `src/mail/config.ts`: lazy value-free missing/invalid configuration errors, token/address/port/folder validation, no token/password transformation.
- `src/mail/imap.ts`: bounded real TLS IMAP EXAMINE, exact-tag UID search, candidate Subject-only BODY.PEEK, decoded exact-tag recheck, spam precedence and cleanup; no bodies, discovery or mailbox writes.
- `src/forms/detect.ts`, `fill.ts`: desktop GF/FF/unknown discovery, stable structural identity, deterministic visible-control filling, cryptographic IDs/intact markers and conservative unsupported preflight.
- `src/forms/submit.ts`, `runner.ts`: fresh contexts, pre-navigation no-submit/write policy, single selected native browser submission, specific new confirmation/rejection, separate persisted-ID polling, per-form/page continuation and shared check/forms orchestration. Native GF modern AJAX requires one narrowly authorized default-path sanitizer script after its selected POST; arbitrary GET/POST serialization remains blocked.
- `src/forms/evidence.ts`: production token `<token>`/credential redaction including encoded forms, private transient action-only traces, fail-closed scrubbing/verification/cleanup. No visual capture reuse for typing.
- `src/commands/common.ts`, `check.ts`, new `forms.ts`: forms selection/dispatch and separate result type; unchanged visual pass followed by forms attachment; forms-only no visual/baseline operations; documented exits, lazy config and secret-safe command boundaries.
- `src/report/model.ts`, `manifest.ts`, `html.ts`, `writer.ts`, `src/commands/approve.ts`: strict forms-only report/envelope alongside strict check types, forms-aware page/site/run gating, shared private manifest-last publication/last-ten retention, trace exclusion; approval skips valid forms-only runs but rejects malformed manifests.
- `test/forms/config.test.ts`, `imap.test.ts`, `browser.test.ts`, `evidence.test.ts`, `report.test.ts`, `mailbox-selftest.ts`: config/protocol/deadline/fill/safety/privacy/report/approval regressions, real R2/browser evidence and real SMTP/IMAP positive/negative/count/flag proof.
- `test/forms/fixtures.php`, `harness.ts`, `playground.test.ts`, `test/fixtures/cli.ts`: native GF/FF fixtures, real wp-admin login/upload/settings, scoped production package CLI and check invocation, negative/continuation/AJAX/isolation assertions, retained sanitized evidence and exact-prefix cleanup.
- `tests/commands.test.ts`, `tests/report.test.ts`: forms command/empty/preflight/root-alias/status/approval regressions and removal of obsolete non-gating expectations.
- `README.md`, `test/forms/README.md`, `plugin/pirax-form-test/README.md`, `test/plugin/README.md`: setup/acquisition/format/runtime/commands/exits/privacy/mutation boundary/attestation/rollout/manifest/test/evidence/cleanup documentation and cross-links.
- `learnings/ACTIVE.md`, `learnings/history/2026-09-26-form-check.md`: active mechanism and historical evidence for unrelated localhost probes masquerading as a socket leak.

No environment file was opened, printed or edited. No production plugin PHP, committed live sites, screenshot/capture/compare algorithm, unrelated historical lesson or AREA document was changed. No AREA files exist in the affected surfaces.

### B's final publication-log correction

An in-memory presign diagnostic printed only:

```text
Current printed private link survives credential redaction: false
```

The redactor necessarily replaces configured credential identifiers in signed URLs. Instead of printing a broken URL or exempting credentials from privacy, B changed the two publication log lines to confirm private publication and direct users to the local report. The existing programmatic `result.url` remains a valid signed private link; publication, approval and retention are unchanged. README and dated plan notes document this CLI-log change. This is a trivial two-line repair, followed by B's complete final suite and visual regression run.

## Verification commands and observed results

All real integration used Node 24.21.0 first on PATH and `VISUAL_NODE=/home/rudi/.local/share/mise/installs/node/24.21.0/bin/node`. Required values were consumed only through `bun --env-file=.env`; no values or signed URLs were printed into this report.

### B's final blocking checks (after final code correction)

```sh
export VISUAL_NODE=/home/rudi/.local/share/mise/installs/node/24.21.0/bin/node
export PATH="$(dirname "$VISUAL_NODE"):$PATH"
export AKROGON_BASE=08fa818b7517dad3c2c0bfd0c2bef290d97db148
bun --env-file=.env test
```

`evidence/b-final/test.txt`, `test.exit`:

```text
(pass) helper false fills native forms without changing mail, entries or feeds; warning-only publication never accesses baselines
(pass) native upload/no-marker are unsupported; required client/server rejection continues to later FF
(pass) native GF modern AJAX and FF AJAX retain separate confirmations and native cleanup
(pass) production bun run forms local CLI waits two default five-minute deadlines and publishes truthful failed private report
(pass) production check captures both widths unchanged, attaches native failed forms and preserves failure status
189 pass
0 fail
2253 expect() calls
Ran 189 tests across 20 files. [1447.92s]
exit 0
```

`bun run typecheck` (`evidence/b-final/typecheck.txt`, `typecheck.exit`):

```text
$ tsc --noEmit
exit 0
```

`bun --env-file=.env run visual:selftest` (`evidence/b-final/visual.txt`, `visual.exit`):

```text
visual:selftest PASS; cleanup empty
exit 0
```

All 15 real visual/storage/approval/health/TLS/read-only/retention scenarios passed. Summary: `runs/visual-selftest-2026-09-26T16-45-46.167Z/summary.json`.

Workers also ran the resolved changed runner with the supplied base: `: "${AKROGON_BASE:?AKROGON_BASE is required}" && bun --env-file=.env test`. Final worker-4 frozen result: 189 pass / 0 fail / exit 0; B's separate full run above is final acceptance evidence, not merely reuse of a worker claim. No advisory commands are configured.

### Real mailbox proof (preserved; no unnecessary second SMTP send)

`bun --env-file=.env run mail:selftest` — worker-2 remainder, `evidence/worker-2/resume-mail-selftest.txt`:

```text
ok   real IMAP authentication and both exact folders are usable before sending
ok   smtp sends exactly one harmless tagged message {"accepted":1,"rejected":0}
ok   production poll finds the sent tag in the expected folder category {"outcome":"delivered","elapsedMs":3138}
ok   mailbox unchanged by the delivered poll (counts, UIDs, modseq, candidate flags) {"seenBefore":false,"seenAfter":false}
ok   unsent ID runs the full default deadline to failed {"outcome":"failed","elapsedMs":300001}
ok   mailbox unchanged by the timeout poll
ok   wire commands are read-only: EXAMINE, UID SEARCH, Subject-only BODY.PEEK; no discovery
ok   summary privacy scan
exit 0
```

Summary: `runs/mail-selftest-2026-09-26T14-15-22.260Z/summary.json`; sanitized copy `evidence/worker-2/resume-mail-summary.json`. Candidate flags remained `[]`; inbox count 2/spam count 0 and UID metadata unchanged. Positive poll used two EXAMINE/two UID SEARCH/one Subject-only PEEK fetch; unsent poll fetched no messages. No LIST/LSUB/NAMESPACE/SELECT/body/mutation commands. Exactly one sent test message remains in the dedicated mailbox intentionally.

### Red/green and repaired findings

- Initial unit: missing modules/status behavior, 16 pass / 5 fail / 3 errors → 41 pass / 0 fail; retained under `evidence/worker-1/`.
- Mailbox contract: installed library namespace/LIST/Subject regressions, 10 pass / 5 fail → 15 pass / 0 fail; frozen reinstall proves patch reproducibility. Source/API diagnostics are not represented as authentication proof; separate real selftest above provides it.
- Browser unit: missing production modules and focused FF timestamp, native-shaped GF AJAX, draft exclusion, lazy preflight and encoded-secret regressions red then green (`evidence/worker-3/`). Final new browser/commands/evidence cases pass in B's full run.
- One worker-3 full run had 183 pass / 1 fail: aggregate TCP peer count falsely attributed an independent `moshi-hook` port probe to the IMAP client. Worker-4 endpoint/process evidence establishes that the actual client and peer had closed. The fixture now observes that exact client endpoint plus its close event and retains the same strict zero-owned-peer/deadline assertions. Deterministic unrelated idle peer is a negative control; 40-repeat repair run: 600 pass / 0 fail. No production client leak workaround or timeout relaxation.
- Native GF mode-field/lazy-rendering defects reproduced against actual GF 3.1.2, repaired in consumer only and exercised again in B's native suite. Intermediate fixture/readback/privacy failures were repaired, not waived; four unsafe diagnostic visual archives were removed and not counted as passing evidence. Final privacy is clean.

## Final live-surface artifacts and acceptance coverage

Paths below are relative to the worktree unless prefixed `implementation/`.

### Native forms + real scoped R2 (B final run)

`runs/forms-playground-39f8c947-372d-46c2-8416-af5ec95841da/summary.json` records GF **3.1.2**, FF **6.2.14**, WP **7.1.2**, PHP **8.3**, genuine admin login/upload/settings, exact installed fixture readback and served marker.

Actual invocation: `bun run forms local --sites <workspace>/package/sites.json`, cwd `<workspace>/package`, where workspace is that `runs/forms-playground-...` directory. The generated package calls `test/fixtures/cli.ts` and production dispatch with a real scoped Store; no shortened CLI deadline, fake delivery, capture skip or public test flag. Root alias/empty/usage are independently verified by command tests (exit 0/2).

- Primary CLI: **606995 ms**, expected **exit 1**. GF ID `b0u5o0vmp5tv` and FF ID `cn1k7cueedzu` each rendered native confirmation then truthfully failed after **300 s** without a matching message. Four native logged notifications had exact redirect/tag/header, zero remaining entries, unchanged feeds.
- CLI HTML/manifest/fetched HTML and report-render trace: `<workspace>/cli/2026-09-26T16-59-11.344Z/`; real report `index.html`, trace `report.trace.zip`; scrubbed action traces in `traces/forms/`. Admin evidence: `<workspace>/admin.trace.zip`.
- Helper-false report: `<workspace>/warnings/2026-09-26T16-58-35.659Z/index.html`, exit 0, both not-verified, mail/entry/feed observations unchanged and no baseline access.
- Native negative order: upload unsupported, no-marker unsupported, client-required rejected, server-required rejected, later FF confirmed/short-mail-timeout failed. Native modern GF/FF AJAX confirmations retain distinct IDs and cleanup.
- Actual check report: `<workspace>/check/2026-09-26T17-09-27.985Z/index.html`, exit 1 from forms; both captured visual states same. No screenshot/compare changes.
- Sanitized native ledger/upload digest directory: `artifacts/plugin/forms-checker-2026-09-26T16-57-53-247Z/`.
- Remote root `test/forms-native-2026-09-26T16-57-53.246Z-b0ac65d8/`: 20 objects deleted, 0 remaining, browser/fixture stopped.

Playground mail logs prove native submission/isolation/cleanup, **not delivery**. Independent real SMTP/IMAP evidence is above; the test never translates a logged message into delivered.

### Report/approval, browser policy and visual evidence

- `runs/forms-report-tests-1a2aa1a1-e821-4d2a-bcfd-63cf342d56c1/summary.json`: private forms render/fetch, HTML then manifest, zero trace uploads, valid newer forms skipped for approval, malformed newer manifest fails, root `test/forms-report-2026-09-26T16-56-58.990Z-31ce1393/` cleaned empty.
- `runs/forms-browser-10ba1433-cd71-40ec-9f7c-90c7c36b58ec/`: local real Chromium discovery/fill/constraints/hidden controls, GET/POST/WebSocket no-submit traps, marker integrity, stale/foreign confirmations, rejection/error redaction, continuation and action-only trace privacy. No browser delivery substitution.
- `runs/visual-selftest-2026-09-26T16-45-46.167Z/summary.json`: unchanged full visual acceptance, root `test/visual-2026-09-26T16-45-46.167Z-24891c5e/` cleaned empty.

Together these cover plan AC1–AC8. No pending criterion is silently skipped.

### B's independent privacy/cleanup audit

Ran `bun --env-file=.env <authoritative-leaf>/implementation/evidence/b-final/audit.ts` after all final processes exited:

```text
{"files":1014,"archives":296,"unsafe":0,"roots":3,"remaining":0,"ok":true}
```

`evidence/b-final/audit.json` records all final-run directories/summaries and independent real R2 re-listing of all three final prefixes. Every actual trace archive was unpacked; two explicit report-upload exclusion sentinels containing only `local trace` were scanned as text, not claimed as browser evidence. Raw/encoded credentials and signed bearer URLs were absent. Worker-4 separately audited its 38 new directories/2,224 files/675 archives and re-listed all 12 of its generated roots empty. Worker-3's retained browser evidence likewise passed its aggregate scan.

`git diff --check` passed. Staged source credential scan printed `Staged source credential scan: PASS`. No running delegated worker remains, and final test processes exited. Only the deliberately retained mailbox test message remains remotely; every generated R2 prefix is empty.

## Known limitations and unverified scope

- No production rollout or live-client transport proof. `form_helper: true` is operator attestation, not independent public proof of installed/configured helper/token/version agreement. Staged rollout still needs operator go-ahead.
- Positive real delivery was in the configured inbox, not real spam/both folders; spam precedence has policy tests. Other providers/plugin versions and every notification path are unverified and not claimed.
- Read-only snapshots establish a quiet interval, not exclusive control against other clients/providers/filters. Late mail can arrive after timeout; no automatic submission retry.
- Conservative unsupported custom/multistep/payment/password/upload/draft/external/ambiguous flows; no CAPTCHA solving. Redirect-only confirmation and indefinitely delayed forms are not inferred as success. Native GF lazy script allowance covers its audited default path only.
- Forms tracing intentionally lacks screenshot/DOM/video replay; action evidence is scrubbed, local only. Existing pre-fill visual traces remain unchanged. Local artifacts consume disk until explicitly removed.
- CLI publication logs now withhold bearer links rather than emit redacted unusable URLs; local reports and valid API-returned private URLs remain available, as documented.
- No unresolved blocking implementation criterion or human prerequisite remains. Lifecycle/review handoff is the next operation, not a claim of reviewer approval.

## Repair round 1 — 2026-09-26, slot B

Both initial reviews requested fixes. All four blocking findings are repaired, committed and independently revalidated by B. This supersedes the initial HEAD/check totals above; it does not claim reviewer approval.

- Before / reviewed commit: `83509cba10299f554b087d6392f0d28b7649d767`.
- After / committed repair: `ee854d825786d1e747aecefaf69e02ff0a5197e7` (`Fix required form fields and review privacy/discovery defects`).
- Base / AKROGON_BASE remains `08fa818b7517dad3c2c0bfd0c2bef290d97db148`.
- Worktree clean; 14 repair paths, 208 additions / 18 deletions. No issue artifacts committed.
- Updated dated plan notes and affected briefs before sequentially delegating `brief-5.md`. Complete return: `worker-5.md`; red/green/native/scoped-publication evidence: `evidence/worker-5/`. B inspected the repair diff and accepted all four required return contents before final checks.

### Findings, changed files and reasons

1. **A F1 — required native choice fields:** `src/forms/fill.ts` recognizes GF required containers and GF/FF `aria-required`, choosing one usable option per required group while preserving every individually HTML-required checkbox and leaving optional groups untouched. `test/forms/browser.test.ts`, `fixtures.php`, `harness.ts`, `playground.test.ts` add actual GF checkbox/consent and FF checkbox/terms positives, disabled/hidden/optional controls, helper-false invariance and preserve the intentionally optional-rendered server-rejection fixture.
2. **A F2 — nonsecret configuration collisions:** `src/forms/evidence.ts` automatically redacts real credentials/private identifiers, not hosts/folders/endpoints/buckets/licensed ZIP paths. `test/forms/evidence.test.ts` checks every retained credential category. `test/forms/report.test.ts` executes production `runForms` with a synthetic nonsecret folder in both site and run paths, real scoped R2 authentication/publication, intact logged local report path, fetched byte equality and cleanup.
3. **B F1 — HTTP-200 interstitial false pass:** `src/forms/runner.ts` reuses unchanged `capture.challengeReason` before accepting discovery. Browser regressions assert explicit failed page scans for identified challenges/firewalls, while ordinary CAPTCHA/Cloudflare mentions and genuine empty pages remain unaffected.
4. **B F2 — escaped Unicode credential privacy:** `src/forms/evidence.ts` matches full UTF-16 surrogate pairs and mixed hex/literal encodings; parsed/re-serialized trace events receive another verification. `test/forms/evidence.test.ts` sanitizes a real archive and independently parses retained JSON to assert the accepted synthetic credential is absent, not merely redactor idempotence. Raw/unsafe archive deletion remains covered.
5. **Documentation/index:** `README.md`, `test/forms/README.md`, `plugin/pirax-form-test/README.md` describe repaired behavior and explicitly document the nonblocking invisible/v3 CAPTCHA, specialized GF phone and late configuration-error reporting limitations. Existing lesson moved from duplicate `learnings/ACTIVE.md` to canonical `learnings/LESSONS.md`; duplicate deleted and README pointer corrected. The historical case is unchanged.

### Fail-first and delegated verification

Worker evidence records four focused regressions **0 pass / 4 fail** before production repairs; actual scoped command collision **exit 2 instead of 0**; and real native GF/FF required fixtures **rejected** before repair. An initial fixture readback failure was corrected in the fixture, not waived or counted green. After repair: focused browser/privacy **18 pass**, scoped report **9 pass**, native positive plus preserved rejection/helper-false cases **3 pass**, unchanged reviewer repros **exit 0**. Worker frozen resolved changed runner: **195 pass / 0 fail / 2,316 assertions**, exit 0; no source change during/after that run. See `worker-5.md` for literal commands and all red/green paths.

### B final checks on the committed source

Same Node 24 PATH/VISUAL_NODE and base as above:

```sh
bun --env-file=.env test
bun run typecheck
bun --env-file=.env run visual:selftest
```

`evidence/b-repair-1/test.txt`, `test.exit`:

```text
(pass) native required GF checkbox/consent and FF checkbox/terms confirm, redirect and clean entries; helper false never submits
(pass) native upload/no-marker are unsupported; required client/server rejection continues to later FF
(pass) production bun run forms local CLI waits two default five-minute deadlines and publishes truthful failed private report
(pass) production check captures both widths unchanged, attaches native failed forms and preserves failure status
195 pass
0 fail
2316 expect() calls
Ran 195 tests across 20 files. [1572.55s]
exit 0
```

`typecheck.txt` / `typecheck.exit`: `$ tsc --noEmit`, **exit 0**.
`visual.txt` / `visual.exit`: **`visual:selftest PASS; cleanup empty`**, **exit 0**, all 15 scenarios pass.

B also reran unchanged reviewer probes copied into `evidence/b-repair-1/`, preserving original review evidence:

```sh
bun --no-env-file <evidence>/probes.ts
bun --no-env-file <evidence>/trace-privacy.ts
```

Both **exit 0**. `probes.txt`: identified challenge now `page-scan` / `failed`, aggregate `failure`; raw and JSON-surrogate credential variants both redact. `trace-privacy.txt`: accepted Unicode password, retained sanitized archive, **`decodedRetainedParameterStillEqualsCredential:false`**, scanner hits 0. Temporary probe raw/ZIP files removed.

### Final real-surface evidence and cleanup

Relative worktree paths:

- Native GF/FF: `runs/forms-playground-0d2d6e5c-0af8-47f2-bbf0-dcd984f65703/summary.json`. Six native checker tests pass, including served required markers without invented HTML `required`, actual confirmations, redirected/tagged notification logs, entry cleanup, unchanged helper-false observations and preserved server rejection. Full production package CLI test took **612332.99 ms**, including both default five-minute mailbox waits; truthful delivery failure remains expected, never converted from notification logging to delivery.
- Real collision publication: `runs/forms-collision-e73a8cff-79ef-4919-a5e5-8e44f2da9e35/synthetic-folder-collision/summary.json`.
- Report/approval: `runs/forms-report-tests-42b9bfa9-50e2-41b2-8c64-0f51b88d49d5/summary.json`.
- Full visual regression: `runs/visual-selftest-2026-09-26T18-18-25.650Z/summary.json`.
- Sanitized native ledger/admin/upload evidence: `artifacts/plugin/forms-checker-2026-09-26T18-32-03-127Z/` and native workspace traces/reports.

B ran `bun --env-file=.env <leaf>/implementation/evidence/b-repair-1/audit.ts` after final processes exited:

```text
{"files":1039,"archives":308,"unsafe":0,"roots":4,"remaining":0,"ok":true}
```

`audit.json` retains directories and independently re-listed exact roots. All four final scoped R2 roots are empty. Worker separately audited **448 files / 208 archives / zero unsafe hits** and all nine of its roots empty. `git diff --check` and staged credential scan passed (`Repair staged credential scan: PASS`). No source edits followed successful checks.

### Limits and unverified scope after repair

No unresolved blocking repair criterion or human prerequisite remains. Original production-rollout/provider/transport/unsupported-flow limits still apply. Invisible/v3 CAPTCHA and specialized GF phone widgets remain explicitly unverified and can fail/time out or falsely reject; a late forms-config error in `check` still exits 2 after captures without completed report publication. These are documented limitations, not invented support or bypasses.

Mail implementation/patch did not change; original real positive/unsent-timeout/count/flag evidence remains valid. No additional SMTP message was sent, no mailbox write/body read, live-site request, production plugin PHP change or environment-file inspection occurred. Ready for **A-only repair review**, not merge approval.
