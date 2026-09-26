# Worker 4 — final native integration, demonstrated repairs and docs

Read `brief-4.md` before editing; reread section 8 before preparing this report. Preserved predecessor implementation and worker-2's real-mail evidence. No commits/lifecycle calls, environment-file inspection/editing, plugin PHP changes, committed-site changes, live-site submissions or new SMTP message. Only disposable loopback sites and generated scoped test roots were mutated.

**Complete:** frozen configured suite **189 pass / 0 fail**, exact unfiltered native suite **5 pass / 0 fail**, frozen visual selftest **PASS**. Aggregate retained-evidence scan is clean and all **12** generated remote roots were independently re-listed empty. No source changed during the final frozen runs.

## Changed files and reasons

Worker-4 changes only (all other dirty/untracked implementation paths predate this unit):

- `test/forms/fixtures.php` (new): native GF fixture creation plus existing native FF fixtures; upload/no-marker/client-required/server-required/modern-AJAX cases; exact page-content readback and served marker. The server rejection renders a checkbox optional but leaves its actual native required rule intact. The client rejection hides an enabled required input without filling it.
- `test/forms/harness.ts` (new): reuse real serialized Playground `php<T>()`; explicit result types; genuine WordPress login/helper ZIP upload/activation/settings; unique native fixture administrator credential; installed PHP exact readback; production-redactor sanitation on inherited plugin artifacts; real disposable-package CLI invocation with scoped production dispatch.
- `test/forms/playground.test.ts` (new): native no-helper immutability, independent exclusions/rejections/continuation, GF/FF AJAX, two full default polling deadlines through the actual package command, real R2/private report rendering, actual capture/check attachment, privacy and scoped cleanup assertions. Per-file timeouts and explicit 900,000 ms primary CLI budget.
- `test/fixtures/cli.ts`: allow only `test/(visual|forms)-.../`; unchanged visual behavior. No production storage/test flags.
- `src/forms/fill.ts`: read native GF's `name="gform_submission_method"`, not a nonexistent native `id`; real GF 3.1.2 uses `data-js` plus `name`.
- `src/forms/submit.ts`: after the selected modern-GF POST only, allow the one exact audited default-path DOMPurify script needed to render confirmation. Same origin, exact pathname, script resource type, no query, selected page and spent authorization required. No general GET reopening, fetch/image allowance or unrelated write authorization.
- `test/forms/browser.test.ts`: native-shaped GF hidden input and lazy-chunk regression, including forbidden fetch/query serialization (only the actual script load reaches the fixture). Existing unrelated-write/draft/marker assertions preserved.
- `test/forms/imap.test.ts`: diagnose unrelated desktop TCP probes rather than weaken cleanup. Observe the real installed client's actual socket/local endpoint and close event while forwarding original `connect()` unchanged. Require exactly one owned connection and zero open owned peer **plus client** sockets, retaining the original deadline/cleanup bound. Deterministic unrelated idle probe demonstrates the former false leak; no authentication/transport/result substitution.
- `README.md`, `test/forms/README.md` (new), `plugin/pirax-form-test/README.md`, `test/plugin/README.md`: commands, acquisition/format of config names, lazy configuration, changed `check` mutation boundary, helper attestation versus proof, staged operator go-ahead, outcomes/exits/deadlines, unsupported flows, native log versus independent delivery proof, trace privacy/tools, ImapFlow pin/patch, forms manifests/approval exclusion, scoped tests/time budgets/cleanup/count-race limitations.

No change to screenshot/capture/compare algorithms, production IMAP polling/patch, or visual selftest source was needed.

## Demonstrated failures and repairs

### Outstanding mailbox cleanup assertion

`imap-stress.txt`: original `bun --env-file=.env test test/forms/imap.test.ts --rerun-each 20` reproduced **299 pass / 1 fail**. Simple TCP destroy and shorter polling stress could not initially reproduce it; those negative diagnostics are retained rather than represented as fixes.

`poll-socket3.txt` establishes the cause with real socket endpoints/process ownership:

- the actual ImapFlow socket was destroyed and emitted its close event;
- its corresponding peer emitted end/close and disappeared;
- **another connection** remained ESTABLISHED, owned by the local **`moshi-hook`** process, not the IMAP test client;
- closing the already-closed real peer did not remove that separate connection.

Other 127/8 and IPv6 listeners were also probed (two failures each in 40 repeats), so moving the listener was not accepted as a fix. No external process/system configuration was changed.

Final fixture identifies the client's real local endpoint, not “first connection wins.” It still requires the actual connected peer to close, now additionally requiring the client close event. A deliberately unrelated idle TCP connection stays open while those assertions pass; it is closed only in fixture teardown. The observer restores the original installed method in finally and never alters its arguments, transport, authentication or result. **40 repeats: 600 pass / 0 fail, 11,480 assertions**, 64.39 s (`imap-owned-green.txt`). No deadline increases, skips or production leak workaround.

### Native GF AJAX defects

`native-red2.txt` and `native-ajax-diagnostic.txt`: GF failed confirmation while FF confirmed. Read-only licensed-source/served-native evidence showed:

1. Native mode input has `name`/`data-js`, not the fake fixture's `id`; corrected the consumer and fixture.
2. Native GF AJAX actually submitted, then its lazy DOMPurify script was blocked by the frozen policy, so it could not render confirmation. `ajax-requests.json` records only field names, path, action/marker-presence booleans and sanitized failures, not bodies/credentials.

After the narrow script allowance, native GF modern AJAX and FF AJAX both confirm separately with redirected/tagged notifications, suppressed feeds and deleted entries. Actual production check captures both viewports unchanged and attaches failed/rejected forms, returning 1. `native-green2.txt` has those passing assertions; its final privacy scan still failed, so that intermediate run is **not** claimed as suite-green.

### Fixture/evidence corrections (not production workarounds)

- Initial installed-page exact readback correctly caught WordPress stripping fixture style while the PHP seeder ran anonymously. The fixture now creates native pages as the real fixture administrator; exact readback remains asserted.
- Initial client-required fixture was actually fillable, so it confirmed instead of rejecting. Replaced it with a hidden-but-enabled required native text input; client rejection is now distinct from native server-required rejection.
- The inherited generic default administrator password appeared as ordinary JavaScript vocabulary in untouched visual trace resources. The privacy assertion failed as intended. Four diagnostic archives were deleted, not waived (`privacy-remediation.json` in the failed run). Final harness uses a fresh unique password set through WordPress's native user API, then still logs in through actual wp-login. No screenshot algorithm/sanitizer relaxation.

## Tests run

All integration commands use Node 24.21.0 first on PATH and `VISUAL_NODE=/home/rudi/.local/share/mise/installs/node/24.21.0/bin/node`. Evidence logs are under `implementation/evidence/worker-4/`.

- `bun run build:plugin`: exit 0; built allowlisted helper ZIP. Native and existing core tests record actual upload ZIP digests. No licensed code packaged.
- `bun --env-file=.env test test/forms/browser.test.ts test/forms/evidence.test.ts test/forms/imap.test.ts`: **29 pass, 0 fail, 405 assertions**, 60.90 s (`targeted-green.txt`).
- Root alias separately: `bun --no-env-file run forms all --sites runs/forms-worker4-diagnostic/empty.json` → **0**; `bun --no-env-file run forms` → **2** (`root-cli.txt`). No remote writes.
- `bun --env-file=.env test test/forms/playground.test.ts -t 'production bun run'`: **1 pass / 0 fail** (four deliberately filtered cases), 37 assertions, 659.60 s, exit 0 (`native-cli.txt`). Actual production CLI inside it returned the expected **1**, not a delivered result.
- `bun --env-file=.env test test/forms/playground.test.ts`: **5 pass, 0 fail, 98 assertions**, 726.07 s, exit 0 (`native-frozen.txt`). All native cases and final privacy/cleanup assertions passed together on frozen source.
- Frozen configured changed suite:
  ```sh
  export VISUAL_NODE=/home/rudi/.local/share/mise/installs/node/24.21.0/bin/node
  export PATH="$(dirname "$VISUAL_NODE"):$PATH"
  export AKROGON_BASE=08fa818b7517dad3c2c0bfd0c2bef290d97db148
  : "${AKROGON_BASE:?AKROGON_BASE is required}" && bun --env-file=.env test
  ```
  **189 pass, 0 fail, 2,253 assertions across 20 files**, 1,474.36 s, **exit 0** (`changed-tests-frozen.txt` / `.exit`). No source edits during this run. Earlier `suite-before.txt` was a diagnostic begun before native/consumer fixture corrections; its mixed-source 183/1 result is not current acceptance evidence.
- Frozen `bun --env-file=.env run visual:selftest`: **PASS**, exit 0, all 15 scenarios and scoped cleanup (`visual-frozen.txt`). No source compatibility edits. Earlier visual run also passed but final evidence is the frozen repeat.
- Diagnostic `bun --no-env-file x tsc --noEmit`: **0**, no diagnostics, including the final repeat (`typecheck-final.txt` / `.exit`); `git diff --check` clean. B still owns its independent blocking acceptance checks.

## Native CLI proof already complete

Native versions: **GF 3.1.2, FF 6.2.14, WordPress 7.1.2, PHP 8.3**. Genuine wp-admin settings followed built-ZIP upload/activation. Exact installed fixture PHP/page readback and served `native-v1` marker passed.

Workspace (relative to worktree):
`runs/forms-playground-032e3bf8-3a10-4019-95ef-70b420611019/`

Actual argv:
```
/home/rudi/.local/share/mise/installs/bun/1.4.2/bin/bun run forms local --sites /home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/worktrees/form-check/runs/forms-playground-032e3bf8-3a10-4019-95ef-70b420611019/package/sites.json
```
Cwd: that workspace's `package/`. Its package script calls the test-only wrapper with real scoped Store/run paths and production dispatch, default polling unchanged; this is not claimed as the root alias by itself.

- CLI elapsed **607,056 ms**, exit **1**.
- GF `#gform_1`: native “Pirax GF thanks”, ID `hfw076w43mx8`; **failed**, no exact tagged message within **300 s**.
- FF `#fluentform_3`: native associated thank-you, ID `k3as93z3934a`; **failed**, no exact tagged message within **300 s**.
- **Four** native logged notifications (two per ID), exact redirect recipient/tag/header assertions; To/Cc/Bcc/resent recipients removed; feeds unchanged.
- GF/FF entry counts **0 → 0**, no remaining rows. This is native submission/isolation/cleanup evidence, **not mail delivery**.
- Report/manifest/fetched HTML: `cli/2026-09-26T16-08-51.799Z/{index.html,manifest.json,remote-index.html}`.
- Actual headless report-render trace: same directory's `report.trace.zip`; forms traces in its `traces/forms/`; genuine install/settings trace at workspace `admin.trace.zip`. Video/screenshots/snapshots/sources off for these contexts. Fetched private HTML rendered via setContent, never a signed URL.
- Sanitized plugin ledger/digests: `artifacts/plugin/forms-checker-2026-09-26T16-08-04-965Z/`.
- Remote root: `test/forms-native-2026-09-26T16-08-04.963Z-60df4afe/`; only HTML/manifest uploaded. **2 deleted / 0 remaining**, fixture/browser stopped. Summary privacy: **12 files / 5 unpacked archives / 0 unsafe**.

## Final all-case native, R2, visual and privacy evidence

Final standalone all-case native summary:
`runs/forms-playground-7a48680a-54be-47ba-badd-28377c20cc77/summary.json`.

- Root `test/forms-native-2026-09-26T16-20-31.063Z-c3cc2b45/`: **20 deleted, 0 remaining**, browser/fixture stopped. Privacy: **55 files, 27 unpacked archives, 0 unsafe**.
- CLI argv/cwd use this workspace's `package/` and `package/sites.json`, exactly the same invocation shape above. **607,111 ms**, exit **1**; GF `i5qjw77u6vfw` and FF `fkw38pfd2kxn` each confirmed then genuinely timed out after **300 s**.
- CLI report/fetched HTML/manifest/render trace: `cli/2026-09-26T16-21-54.478Z/`.
- Warning-only report: `warnings/2026-09-26T16-21-16.833Z/index.html`, exit **0**, both `not-verified`, native client validity passed; full mail/entries/feeds unchanged; no baseline accesses; only HTML then manifest uploaded.
- Negative outcomes in native discovery order: `unsupported` upload, `unsupported` no marker, **client `rejected`** “Please fill out this field”, **native server `rejected`** “This field is required”, then FF confirmed and truthfully `failed` at short internal mail deadline. Later forms ran independently.
- Modern GF `#gform_4` and FF `#fluentform_3` each confirmed with separate IDs, native redirect/header/tag and entry/feed cleanup assertions.
- Production check report: `check/2026-09-26T16-32-11.229Z/index.html`, exit **1**, forms attached. Both visual states **same**, ratio **0**, captured dimensions **1440×3321 / 390×3240**, health/warnings empty. Failure is therefore from attached forms, not altered visual evidence.
- Native sanitized ledgers/upload digests: `artifacts/plugin/forms-checker-2026-09-26T16-20-31-065Z/`.

Final visual summary:
`runs/visual-selftest-2026-09-26T16-11-06.276Z/summary.json`.
Root `test/visual-2026-09-26T16-11-06.276Z-f1a5b72d/`: **198 deleted, 0 remaining**, WordPress/HTTPS stopped, zero cleanup errors; **15/15 scenarios passed**. Production screenshots, comparison, baseline byte promotion, R2 retention, health, TLS and GET-only behavior remain covered.

The configured suite independently repeated all native cases on another live fixture:
`runs/forms-playground-05edfcf3-4915-47ad-a1c3-3ed8e794b338/summary.json`.
Root `test/forms-native-2026-09-26T16-23-30.794Z-763c54d7/`: **20 deleted / 0 remaining**, fixture/browser stopped. CLI **606,556 ms / exit 1**, GF `nda73hbfqqsn` and FF `llbqwj116ehs` confirmed then each timed out truthfully at **300 s**. Report/render trace directory `cli/2026-09-26T16-24-51.592Z/`; check report `check/2026-09-26T16-35-07.655Z/index.html`. Exact argv/cwd are in that summary (same disposable-package command shape). Privacy again **55 files / 27 unpacked archives / 0 unsafe**.

Existing scoped report/approval regressions also passed in the final suite:
`runs/forms-report-tests-8ab48341-881e-4f5d-bd5c-84ad34e74a21/summary.json`.
Root `test/forms-report-2026-09-26T16-22-36.318Z-1514534b/`: **13 deleted / 0 remaining**. HTML then manifest, **zero trace uploads**, fetched private HTML, real headless render trace, newer forms skipped in favor of older check, malformed newer manifest still fails approval. This preserves worker-2's separate real-mail evidence unchanged.

### Final privacy / cleanup

`evidence/worker-4/privacy-final.json`: **38 new evidence directories, 2,224 files, 675 unpacked archives, 0 unsafe hits**. Scan uses production redaction for raw/mixed URL/JSON/Unicode/HTML/nested encodings of configured token/credentials/addresses plus browser fixture token/address, and rejects signed bearer URL markers. The scanner program's own synthetic search needle is not retained report/log/trace evidence. Runtime native scans also cover the unique disposable admin credential before it is discarded. Inherited plugin ledgers receive additional production-redactor sanitation; new token evidence uses literal `<token>`.

Four unsafe *intermediate* diagnostic visual archives were removed; their failed privacy assertion and remediation record remain. No unsafe trace was accepted to turn a test green. Production forms raw/temp archives are removed by the unchanged fail-closed retention boundary.

`cleanup-final.json`: independently re-listed **all 12** newly generated scoped forms/report/visual roots, **0 objects remaining in every root**. No production baseline/report prefix accessed by cleanup. Final process inspection found no remaining Playground or native forms CLI child. The early fixture-readback failure's wrapper stopped its partially initialized site internally; its summary's `stopped:false` means no harness was returned, not a surviving process.

Sanitized copies of final CLI/native/visual summaries and all red/green logs are in `implementation/evidence/worker-4/`. No signed URL retained.

## Known limitations

- No production rollout or live-client mail transport proof is authorized/claimed. Helper opt-in remains operator attestation; mismatched helper/token and arbitrary site code remain risks documented prominently.
- Playground logged mail is not delivery. Preserve worker-2's independent real SMTP/IMAP success and unsent-ID full-timeout/count/flags evidence unchanged; no additional message was sent. Real spam arrival, every provider/notification path and exclusive mailbox control are not claimed.
- The AJAX script exception is deliberately exact for audited GF 3.1.2/default asset path. Custom relocation/chunk changes can fail confirmation, never reopen arbitrary GET serialization. Unsupported flow/CAPTCHA/redirect-only/delayed-initialization boundaries remain conservative.
- Local evidence is retained and consumes disk. Four unsafe intermediate diagnostic visual archives were removed, not passed. Final aggregate privacy verification is clean.
- Read-only mailbox counts remain susceptible to independent provider/filter/client traffic; tests establish observed unchanged state, not ownership/exclusivity.

## Unverified criteria

None remaining within this delegated brief. B retains lifecycle/commit/review ownership and its separate final blocking checks. Live rollout, additional SMTP messages, real spam delivery, other plugin/provider versions and universal arbitrary-site safety remain intentionally unclaimed; see limitations above.
