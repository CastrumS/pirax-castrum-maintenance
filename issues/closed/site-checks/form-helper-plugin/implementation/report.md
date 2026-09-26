# Implementation report: form-helper-plugin

Slot B · 2026-09-25 · implementation complete, submitted for review (not merged or installed on live sites).

## Base and committed head

- Worktree: `/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/worktrees/form-helper-plugin`
- Branch: `form-helper-plugin`
- Base: `93cf3b7f6b99f3a34be7f69c004345c439fa6a76`
- Committed head: `2e2105c37b199065a311b16ffc5797799fc50253`
- Commit: `feat: add safe WordPress form test helper and Playground verification`
- 27 changed files, 4,846 inserted lines. `git status --short` after commit is empty; the base-to-head diff changes no file under `issues/`.
- Effective `checks` and `advisory` are both empty. B nevertheless ran the complete real-WordPress suite, whitespace/packaging checks and secret scans. No physical/operator blocker occurred.

## Delivered behavior

Regular uploadable WordPress plugin, with capability/nonce-protected settings and autoload-off options. It recognizes the exact shared marker grammar, redirects marked mail through the site's WordPress mail path, strips extra recipients, tags subject/header, bypasses only the supported CAPTCHA path, suppresses native integration feeds, rejects unaudited side-effect paths, and removes entries with native APIs. GF marked notifications run synchronously before deletion. FF native queued mail carries submission-time classification and handles retries, mixed ordinary/test jobs, exceptions and deletion interleavings. Hourly recovery uses stable pagination, native cascade deletion and selective queued-task cleanup.

`dist/pirax-form-test.zip` exists (ignored build artifact), contains **10 files** under `pirax-form-test/`: 9 production PHP files plus the plugin README. No tests, licensed plugins, runtime dependencies or credentials are packaged.

Final ZIP SHA-256:

```text
d14c2acd37026b27637f9afd4adb6f7e58680b18d1e8c6082e383427f4a14002
```

## Changed files and reasons

| Path | Reason |
|---|---|
| `.gitignore` | Ignore artifacts, distributions and runtime/download cache. |
| `package.json` | Minimal Bun scripts and pinned Playground/Playwright/native-build prerequisites. |
| `bun.lock` | Reproducible dev dependency resolution. |
| `README.md` | Actual repository build/test entry points and documentation links. |
| `plugin/pirax-form-test/pirax-form-test.php` | Plugin metadata/bootstrap, option and hourly-cron lifecycle. |
| `plugin/pirax-form-test/includes/settings.php` | Real capability/nonce protected settings, secret/redirect validation. |
| `plugin/pirax-form-test/includes/marker.php` | Literal marker parser and request/scoped job contexts. |
| `plugin/pirax-form-test/includes/mail.php` | Idempotent recipient/header/subject transformation and fail-closed guard. |
| `plugin/pirax-form-test/includes/compatibility.php` | Exact audited versions and per-hook native callback inventory. |
| `plugin/pirax-form-test/includes/gravity-forms.php` | GF validation/CAPTCHA/feed interception, synchronous marked mail, native deletion. |
| `plugin/pirax-form-test/includes/fluent-forms.php` | FF early rejection/CAPTCHA/email-only feeds, durable queued classification, failure handling/deferred cleanup. |
| `plugin/pirax-form-test/includes/cleanup.php` | Native paginated recovery sweep, literal matching/timezone handling and selective GF/FF queue pruning. |
| `plugin/pirax-form-test/uninstall.php` | Guarded option/cron removal. |
| `plugin/pirax-form-test/README.md` | Packaged installation, contracts, exact support matrix, operation/rollout and genuine limits. |
| `scripts/build-plugin.ts` | Explicit allowlisted ZIP staging, content/secret checks and digest. |
| `test/plugin/playground.ts` | Node-side Playground CLI/blueprint and private stdin/stdout PHP execution protocol. |
| `test/plugin/harness.ts` | Real site/browser lifecycle, PHP assertions, native queue/cron driving, upload and evidence capture. |
| `test/plugin/fixtures.php` | Real users, GF/FF forms, notifications, feeds, CAPTCHA and unsupported forms. |
| `test/plugin/mu-plugin.php` | Test-only final-mail/siteverify observation and option-driven native feed/failure/race fixtures. |
| `test/plugin/artifacts.ts` | Redact retained text/ZIP resources and scan for secrets. |
| `test/plugin/harness.test.ts` | Real harness/auth/submission/upload baseline and evidence privacy checks. |
| `test/plugin/core.test.ts` | Packaging, settings authorization/nonces, parser/mail edge cases and uninstall. |
| `test/plugin/adapters.test.ts` | Native GF/FF positive/negative, CAPTCHA, feeds, queued/retry/rotation and sweep acceptance. |
| `test/plugin/safety.test.ts` | Fail-first late-filter, exception, CAPTCHA-precedence, queue-cancellation and cleanup-race regressions. |
| `test/plugin/README.md` | Prerequisites, environment loading, tests, native fixtures and artifact/privacy guidance. |
| `learnings/LESSONS.md` | One evidenced async-classification lesson with date/history pointer. |
| `learnings/history/2026-09-25-form-helper-plugin.md` | Observed mutable-token regression, native evidence, repair and abstract learning. |

No existing agent guide/AREA file existed or became stale. No environment file (including `.env.example`) was opened or edited. Variable names/acquisition are documented in the test README instead.

## Worker returns folded into the implementation

Six workers executed sequentially in this worktree, using `brief-1.md` through `brief-6.md`. Their full reports remain beside this report as `worker-1.md` … `worker-6.md`.

| Unit | Observed red / defect | Targeted green evidence |
|---|---|---|
| Harness | Harness module absent; later native Node ABI and queue-driving integration failures repaired. | 4 pass / 42 expectations initially. Real unmarked form/mail/feed controls and wp-admin upload. |
| Core | 8 failures before plugin/build existed. | 9 pass / 134 expectations initially. Real settings/auth and WordPress mail processing. |
| Adapters | Core-only plugin delivered unredirected mail, queued integrations, rejected marked CAPTCHA and retained old entries. | 25 pass / 504 expectations for core+adapters. Mutation removing GF form/add-on overrides failed the marked-notification test. |
| Safety | Five concrete failures: late FF filter resurrected a feed; thrown job redirected ordinary mail; wrong CAPTCHA error precedence; GF stale queue/active-worker deletion; overly broad version gate. | 6 pass / 84 expectations. Native runners and selective queue pruning, not sender stubs. |
| Docs/evidence | New network ledger assertion failed with missing file. | 13 pass / 190 expectations for harness+core, packaged README and sanitized network evidence. |
| Cleanup race | A loaded marked FF job mailed the original recipient after its entry metadata was deleted (including token rotation). | Focused native regression 2 pass / 23 expectations, plus changed-path checks; validated ID now travels in the job payload. |

Detailed red outputs, commands and individual artifact paths are in each worker report. B made one trivial documentation correction before the full run: name the exact removed `Resent-To/Cc/Bcc` headers instead of claiming all `Resent-*` headers are removed.

## B verification commands and pasted results

### Full suite (once after all implementation units)

```sh
AKROGON_BASE=93cf3b7f6b99f3a34be7f69c004345c439fa6a76 \
  bun --env-file=/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/.env \
  test --timeout 180000
```

```text
bun test v1.4.2 (744846f84)
 36 pass
 0 fail
 661 expect() calls
Ran 36 tests across 4 files. [597.95s]
```

Complete per-test output: `implementation/full-suite.log` in this authoritative leaf. No unchanged full-suite rerun was performed.

This includes actual `bun run build:plugin` invocations and Playwright upload/activation of the generated ZIP, real admin/editor/subscriber sessions and nonces, marked/unmarked/wrong/empty-token submissions for both real plugins, Cc/Bcc/header/subject/recipient assertions, positive ordinary native-feed controls, server-side false siteverify, other-field/honeypot rejection, FF separate-request and mixed-batch queues/retries/exceptions/rotation, unsupported dispatch rejection, native deletion/cascade assertions, and real hourly cron recovery with multiple pages, boundaries, SQL wildcards and non-UTC dates.

### Secret scans

B loaded values only through Bun `--env-file`, used `findSecret(directory, secrets)` for directories/ZIPs and `redact(fileText, secrets).count` for individual ordinary source files, and printed counts only:

```text
artifacts/plugin: 0 secret hits
dist: 0 secret hits
plugin: 0 secret hits
test/plugin: 0 secret hits
scripts: 0 secret hits
learnings: 0 secret hits
README.md: 0 secret hits
package.json: 0 secret hits
bun.lock: 0 secret hits
```

Both `FORM_TEST_TOKEN` and the licensed ZIP path were checked, including the helper's URL/JSON encodings. An initial verification-only invocation mistakenly passed `README.md` to the directory scanner and ended with `ENOTDIR`; B corrected the invocation to use the text helper and reran the scan successfully. No product/test code changed and the complete suite had not failed.

### Diff, archive and commit

```text
git diff --cached --check
(no output; success)

git diff --cached --name-only -- issues
(no output)

sha256sum dist/pirax-form-test.zip
d14c2acd37026b27637f9afd4adb6f7e58680b18d1e8c6082e383427f4a14002  dist/pirax-form-test.zip

git commit -m "feat: add safe WordPress form test helper and Playground verification"
[form-helper-plugin 2e2105c] feat: add safe WordPress form test helper and Playground verification
 27 files changed, 4846 insertions(+)

git status --short
(no output)

git diff --name-only 93cf3b7f6b99f3a34be7f69c004345c439fa6a76..HEAD -- issues
(no output)
```

Archive listing was inspected: all entries are under `pirax-form-test/`, with the 10 allowlisted files only (plus directory entries). Each final suite also asserts its upload/evidence behavior.

## Final retained artifacts

Paths relative to the code worktree; all ignored and secret-scanned:

- `artifacts/plugin/harness-smoke-2026-09-25T15-46-51-919Z/`
- `artifacts/plugin/core-2026-09-25T15-47-42-142Z/`
- `artifacts/plugin/adapters-2026-09-25T15-49-24-560Z/`
- `artifacts/plugin/safety-2026-09-25T15-54-40-747Z/`

Each contains `manifest.json`, `mail.jsonl`, `feeds.jsonl`, `entries.json`, `network.jsonl`, redacted `*.trace.zip`, and `playground.log`. Adapter/safety runs also retain `queue-states.jsonl`. Manifests record suite/scenario context names, versions, artifact paths and uploaded ZIP digests. Browser execution is headless Chromium, with video/screenshots/snapshots/source capture off. Separate sanitized network ledgers supplement action traces because Playwright does not record network in snapshot-free traces.

Tested runtime: **WordPress 7.1.2 / PHP 8.3**, licensed **GF 3.1.2**, wordpress.org **FF 6.2.14**, pinned Playground CLI **3.1.55** and Playwright **1.63.0**.

## Plan refinements / review notes

All refinements and worker file consolidations are recorded in the authoritative plan's dated implementation notes:

- Playground needs a Node child for the native fs-ext dependency; `playground.ts` holds the blueprint instead of a duplicate `blueprint.ts`.
- Actual suite names are `harness/core/adapters/safety.test.ts`, covering the planned plugin/edge-case criteria.
- FF submission-time ID is saved in entry meta and native queued payload. Re-parsing against a mutable token was demonstrably unsafe. No raw-token metadata/custom schema was introduced.
- FF unsafe-form rejection moved before CAPTCHA to a verified native validation hook; ordinary validation remains native.
- FF's native email sender does not report terminal queue status; only marked jobs receive explicit result reporting, while ordinary jobs retain native behavior.
- Exact versions are gated, not whole patch families. The plugin does not optimistically accept unaudited updates.
- Empty-token no-op is verified for **new** submissions/sweep. Previously marked queued jobs remain protected (or fail closed) rather than leaking to clients. This explicitly narrows the brief's broad "does nothing" wording for already-enqueued work and should be retained in review.
- A 16–255 character sanitization-safe token charset is an explicit settings constraint; the actual environment token satisfies it.

## Known limitations and unverified criteria

**Main leaf acceptance:** the 36-test full run verifies the local done-criteria; no acceptance case was silently skipped. The following boundaries remain real and are not claimed as verified:

1. Local `pre_wp_mail` observation is **not** live SMTP delivery or IMAP arrival. No live site, mailbox or R2 was accessed. Installation on one site → group → all requires the operator's explicit go-ahead after merge; checker delivery confirmation is outside this leaf.
2. Compatibility is limited to the exact audited GF/FF versions and inventoried native hook paths. FF Pro, arbitrary custom PHP, later dynamically installed callbacks or mail transports rewriting after the guard are not proven safe. Other versions are rejected for marked submissions. Licensed GF payment add-ons were not installed; unsupported rejection was exercised with native post/payment form fixtures and real direct-hook dispatchers.
3. Native GF queue pruning lacks compare-and-set. A worker starting between the running-state check and batch update can reintroduce a removed task. An already-running worker causes deferral. That interleaving is documented, not claimed atomic or deterministically tested.
4. WP-Cron is traffic-driven; active/crashed jobs and FF's site-local DST fall-back timestamp ambiguity can delay cleanup. Retry exhaustion/recovery cleanup does not prove mail arrived. Current-token-only sweep cannot recover old-token entries after rotation: clear pending tests first.
5. FF new queued payloads survive the tested entry-deletion race. Jobs predating that payload format fall back to entry metadata and lack that specific race protection. A third-party filter stripping the private payload key after our hook reopens the old fallback; arbitrary later PHP is outside the audited surface.
6. Action Scheduler exception unwinding was exercised. Throwing legacy/WP-Cron FF sender paths ending their request, and synchronous exception behavior, were source-inspected rather than separately executed. GF saved drafts bypass ordinary submission validation and are not supported by this helper path.
7. Only GF reCAPTCHA v2 checkbox and FF reCAPTCHA v2 were exercised. FF's native `recaptcha` hook also covers v3 (bypassed but untested); hCaptcha/Turnstile/security plugins remain unchanged. Declared minimum WP 6.4/PHP 7.4 and multisite were not executed; all native tests used WP 7.1.2/PHP 8.3.
8. Artifact redaction checks raw, normal URL-encoded and JSON-escaped values, not every arbitrary alternative encoding. Captured final artifacts pass those scans; no auth headers/cookies/request bodies enter the network ledger.

No advisory failures/Nits were configured. The worktree is committed and clean; review owns the next verdict.

## Repair round 1 — 2026-09-26

### Commits and scope

- Reviewed/before head: `2e2105c37b199065a311b16ffc5797799fc50253`.
- Repaired/after head: **`034accb2cdacdc428a024de38553471ebef56d55`**.
- Commit: `fix: close review gaps in mail isolation and stale entry cleanup`.
- Repository base remains `93cf3b7f6b99f3a34be7f69c004345c439fa6a76`.
- This repair addresses review A F1, review B F1/F2 and A N1/N2. Slot A should re-check the repair diff `2e2105c..034accb`, not repeat the unchanged initial review.
- One sequential repair worker used `implementation/brief-7.md`; full return and red/green evidence are in `implementation/worker-7.md`. The plan's dated repair notes preserve all original criteria.

### Findings resolved

| Finding | Repair and verification |
|---|---|
| **A F1 — literal `bun test` timeout** | Each of the five real-WordPress test files calls `setDefaultTimeout(180_000)`; longer explicit hook/scenario deadlines remain. The package script no longer supplies an external timeout. Bun 1.4.2 probes showed a bunfig timeout key was ignored and a preload/shared-module call did not reliably cover all files, so those abandoned files were removed. Both the targeted command and B's complete command below pass without `--timeout`. |
| **B F1 — hidden Cc/Bcc recipients** | `transform_mail()` now compares header names using WordPress-equivalent trimming before the colon. The existing guard consumes the same normalization. The new regression observes real PHPMailer To/Cc/Bcc lists after native WordPress parsing, with the production guard still installed, and deliberately stops before transport. It covers string/array headers, leading/trailing controls, original-recipient ordinary controls, preserved From/Reply-To/custom headers, correlation idempotence, and rejection of a later padded-Bcc insertion. |
| **B F2 — renamed/removed FF fields strand entries** | Recovery matches decoded historical response values minus FF's native request-metadata whitelist, not current form inputs. The obsolete schema-intersection helper was removed. Real cron tests delete old renamed/removed/nested-field entries and their native related records/queued work, while keeping young/ordinary, active-worker, metadata/source-only, key-only and malformed-JSON controls; a repeat sweep is a no-op. |
| **A N1 — optional mandatory modules** | Bootstrap now requires all four packaged modules unconditionally. A damaged package fails loudly. The real upload/activation test with both form plugins inactive still passes. |
| **A N2 — historical note/evidence** | The original case remains intact. A dated follow-up explains payload-ID hardening and metadata fallback, includes a self-contained observed-state summary, and cites the immutable previous commit and tracked regression names instead of relying only on ignored artifact paths. |

### Repair file changes

- `plugin/pirax-form-test/includes/mail.php`: normalize header-name interpretation at the shared transformation/guard boundary.
- `plugin/pirax-form-test/includes/cleanup.php`: historical-response matching independent of field edits, preserving native metadata exclusions and safe malformed-JSON handling.
- `plugin/pirax-form-test/includes/fluent-forms.php`: remove unused `ff_field_values()` (no callers remain).
- `plugin/pirax-form-test/pirax-form-test.php`: unconditional required modules and accurate loading comment.
- `test/plugin/review-regressions.test.ts`: two fail-first native regressions for B F1/F2.
- `test/plugin/harness.test.ts`: per-file default timeout.
- `test/plugin/core.test.ts`: per-file default timeout and literal command comment.
- `test/plugin/adapters.test.ts`: per-file default timeout and literal command comment.
- `test/plugin/safety.test.ts`: per-file default timeout and literal command comment.
- `package.json`: `test:plugin` is now `bun test test/plugin` without a hidden timeout override.
- `plugin/pirax-form-test/README.md`: describe normalized header names and historical field-value recovery accurately.
- `test/plugin/README.md`: document native-envelope observation, the new suite and per-file timeout requirements; plain-command claims are now verified.
- `learnings/history/2026-09-25-form-helper-plugin.md`: dated follow-up/durable evidence summary without rewriting the original case.

No dependencies/build allowlist/public marker-option-mail contracts changed. No production test endpoint was introduced. The review-created lesson in the registered checkout remains operator-owned and was not pulled into the worktree repair.

### Red-to-green evidence

Worker 7 reproduced the two native behavioral regressions before repair:

```text
(fail) marked wp_mail: control-prefixed Cc/Bcc header names never reach the native envelope; ordinary mail keeps them
  expected cc/bcc: []
  actual: cc@client.test / bcc@client.test
(fail) hourly sweep deletes old FF test entries whose marker field was later renamed or removed; controls stay
  unexpectedly retained: nestedRenamedOld, removedOld, renamedOld
 0 pass
 2 fail
```

The worker also reproduced the plain-command 5000 ms failures (7 pass / 4 fail with the two new regressions already green) before settling on per-file timeout configuration. No assertions were removed or skipped.

Final targeted worker command:

```sh
AKROGON_BASE=93cf3b7f6b99f3a34be7f69c004345c439fa6a76 \
  bun --env-file=/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/.env \
  test test/plugin/core.test.ts test/plugin/review-regressions.test.ts
```

```text
 11 pass
 0 fail
 158 expect() calls
Ran 11 tests across 2 files. [149.43s]
```

### B's complete repair verification — no timeout flag

```sh
AKROGON_BASE=93cf3b7f6b99f3a34be7f69c004345c439fa6a76 \
  bun --env-file=/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/.env test
```

```text
bun test v1.4.2 (744846f84)
 38 pass
 0 fail
 680 expect() calls
Ran 38 tests across 5 files. [634.57s]
```

Full output: `implementation/repair-1-full-suite.log` beside this report. This literal command corrects the initial report's insufficient AC8 evidence: the earlier successful run had relied on `--timeout 180000`. The repaired run includes the previously failing 6.7 s mail and 10.2 s invalid-redirect tests without any external override. B ran the full suite once after the repair worker; no unchanged successful full-suite rerun followed.

Final artifact directories, relative to the code worktree:

- `artifacts/plugin/harness-smoke-2026-09-26T09-07-12-797Z/`
- `artifacts/plugin/review-regressions-2026-09-26T09-08-01-728Z/`
- `artifacts/plugin/core-2026-09-26T09-08-48-118Z/`
- `artifacts/plugin/adapters-2026-09-26T09-10-31-116Z/`
- `artifacts/plugin/safety-2026-09-26T09-15-38-798Z/`

These retain manifests, safe browser traces/network ledgers, final mail/feed/entry evidence and applicable queue states. The new regression run includes `review-regressions-install.trace.zip` for installation of the actual built ZIP. Native-envelope assertions stop before transport and therefore send no real mail.

Additional B verification:

```text
git diff --cached --check
(no output; success)

Secret scans (FORM_TEST_TOKEN and GRAVITY_FORMS_ZIP values, counts only):
artifacts/plugin: 0 secret hits
dist: 0 secret hits
plugin: 0 secret hits
test/plugin: 0 secret hits
scripts: 0 secret hits
learnings: 0 secret hits
README.md: 0 secret hits
package.json: 0 secret hits
bun.lock: 0 secret hits

No abandoned bunfig/preload files
No ff_field_values references in plugin or tests

git commit -m "fix: close review gaps in mail isolation and stale entry cleanup"
[form-helper-plugin 034accb] fix: close review gaps in mail isolation and stale entry cleanup
 13 files changed, 240 insertions(+), 36 deletions(-)

git status --short
(no output)

git diff --name-only 2e2105c37b199065a311b16ffc5797799fc50253..HEAD -- issues
(no output)
```

Current 10-file production ZIP SHA-256:

```text
53b53e7b46a969f7414b4ebed44a7073d0c4f0a2c452dac396ca2ad91a566f45
```

### Remaining limitations / unverified criteria

All three blocking findings and both nits have concrete repaired behavior/evidence above; no requested repair criterion remains unverified. Existing live-delivery, exact-version compatibility and documented concurrency/runtime limits remain unchanged.

New test files must set their own default timeout under this Bun version (documented); there is no inactive bunfig/preload pretending to configure a global default. Recovery excludes FF's native whitelisted request metadata; a site extension that classifies a real field as request metadata via `fluentform/white_listed_fields` likewise excludes it. That extension semantics is not broadened into a new unsupported-schema heuristic.

No new configured blocking/advisory commands exist. The repaired worktree is committed and clean, ready for slot A's repair-only re-check.

## Merge integration repair — 2026-09-26

### Before/after and finding

- Refreshed base: `9140cdd9647d14e91ebd0565b5f1ef1ee55fff07`.
- Rebased before head recorded by merge A: `67ab9bd8d9b119e79440ae596adffe913701139c`.
- Committed after head: **`08fa818b7517dad3c2c0bfd0c2bef290d97db148`**.
- Commit: `fix: typecheck plugin harness under merged strict configuration`.
- Repair-only review range: `67ab9bd..08fa818`.

Merge A's second rebase integrated newer main, whose strict tsconfig includes `test/` and enables `noUncheckedIndexedAccess`. B reproduced its 28 compiler errors at the recorded rebased head. This repair preserves all merge conflict resolutions, compiler settings and dependency versions. It does not rebase again or touch production PHP.

Worker 8 used the eight-section `implementation/brief-8.md`; its complete result/type reasoning and targeted evidence are in `implementation/worker-8.md`. No mismatch or operator blocker remained.

### Changed files and reasons

- `test/plugin/adapters.test.ts`: explicit PHP boolean/string result types; indexed rows asserted non-null only after existing runtime assertions; one explicit missing-queued-job guard; a label-generic seed helper and literal bulk fixtures remove an `any` cast and preserve exact seed labels/plugin kinds. The same four special IDs are selected in the same order.
- `test/plugin/core.test.ts`: explicitly typed missing/forged nonce cases, parser result type, and indexed mail assertions after the existing length check.
- `test/plugin/harness.test.ts`: explicit boolean PHP result at the native plugin-activation assertion.
- `test/plugin/safety.test.ts`: non-null evidence follows existing successful-submission/one-message assertions; expected values are unchanged.
- `test/plugin/harness.ts`: `eachLine` accepts `ReadableStream<BufferSource>`, matching the native decoder's declared input and Bun's subprocess byte streams. The streaming algorithm, chunk-split UTF-8 handling, line buffering and redaction are unchanged.
- `test/plugin/playground.ts`: the internal argv assertion reflects the sole harness spawner always providing JSON configuration; it remains erasable TypeScript for Node, with unchanged runtime parsing/failure behavior.
- `learnings/LESSONS.md` and `learnings/history/2026-09-26-form-helper-types.md`: dated reusable lesson with self-contained evidence about return-only generic inference through overloaded test matchers. No previous history was rewritten.

The generic `Harness.php<T = unknown>` default remains `unknown`, not `any`. Type assertions do not replace runtime acceptance assertions. The only changed failure behavior is a clearer error when an expected queued job is absent; successful behavior and all expected values remain intact.

No human interface documentation became stale. Root README already documents typecheck and its complete scope. Upstream's valid `bunfig.toml` discovery exclusion, tsconfig, package/lock, ignore rules, scripts and production plugin files are unchanged by this repair.

### Fail-first compiler and targeted verification

At the before head:

```text
$ bun run typecheck
$ tsc --noEmit
28 errors in test/plugin/: adapters 18, core 5, safety 2,
  harness.test 1, harness.ts 1, playground.ts 1
error: script "typecheck" exited with code 1
```

Exact red output: `implementation/merge-repair-typecheck-red.log`. It matches merge A's finding. The worker then demonstrated green typecheck under unchanged compiler settings and verified that misspelled seed labels now fail compilation (temporary probes reverted).

Worker targeted run:

```sh
AKROGON_BASE=9140cdd9647d14e91ebd0565b5f1ef1ee55fff07 bun --env-file=/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/.env test test/plugin
```

```text
 38 pass
 0 fail
 680 expect() calls
Ran 38 tests across 5 files. [644.68s]
```

A final local nonce-variable rename was covered by a targeted core rerun: 9 pass / 0 fail, 139 expectations, 102.82 s. B subsequently tested the exact final code across the entire repository. Worker artifact paths and zero-secret scan details are retained in `implementation/worker-8.md`.

### B's required checks and full integrated suite

```text
$ bun run typecheck
$ tsc --noEmit
(exit 0)

$ git diff --check
(no output; exit 0)
```

Compiler output: `implementation/merge-repair-typecheck-green.log`. Configured `checks` and `advisory` are still empty; typecheck is nevertheless blocking here because merge explicitly requested it.

```sh
AKROGON_BASE=9140cdd9647d14e91ebd0565b5f1ef1ee55fff07 bun --env-file=/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/.env test
```

```text
bun test v1.4.2 (744846f84)
 137 pass
 0 fail
 1482 expect() calls
Ran 137 tests across 14 files. [685.83s]
```

Full output: **`implementation/merge-repair-full-suite.log`**. No timeout override or skip was used. This includes all upstream local browser/helper/CLI tests and all 38 native WordPress plugin tests. B ran the full suite once after the worker; there was no unchanged successful full-suite rerun. No real mail, live-site or R2 mutation was performed.

Final plugin artifact directories relative to the worktree:

- `artifacts/plugin/review-regressions-2026-09-26T10-05-44-532Z/`
- `artifacts/plugin/harness-smoke-2026-09-26T10-06-32-096Z/`
- `artifacts/plugin/safety-2026-09-26T10-07-21-446Z/`
- `artifacts/plugin/adapters-2026-09-26T10-09-36-002Z/`
- `artifacts/plugin/core-2026-09-26T10-14-51-785Z/`

Upstream browser evidence from the same full run:

- `runs/capture-test-2026-09-26T10-05-09.551Z/`
- `runs/2026-09-26T10-05-44.272Z/index.html`

B scanned the configured token, licensed ZIP path and both configured S3 key values without printing any value:

```text
Configured secret values scanned: 4
artifacts/plugin: 0 secret hits
runs: 0 secret hits
dist: 0 secret hits
plugin: 0 secret hits
test/plugin: 0 secret hits
learnings: 0 secret hits
<authoritative leaf>/implementation: 0 secret hits
```

The generated allowlisted ZIP passed the real upload/activation test again. Current SHA-256: `f17ac3c0ebe15c0e03a57b29d9d0014ff5510cda7204b0ad9c659bc3cfdd227c`.

```text
$ git diff --cached --check
(no output; exit 0)

$ git commit -m "fix: typecheck plugin harness under merged strict configuration"
[form-helper-plugin 08fa818] fix: typecheck plugin harness under merged strict configuration
 8 files changed, 50 insertions(+), 24 deletions(-)

$ git status --short
(no output)

$ git diff --name-only 9140cdd9647d14e91ebd0565b5f1ef1ee55fff07..HEAD -- issues
(no output)
```

### Limitations and unverified criteria

No merge-repair criterion remains unverified. Existing plugin/runtime limitations are unchanged. The bridge's generic type describes decoded PHP JSON; it is not a new runtime schema validator. Indexed non-null assertions rely on documented existing runtime assertions or the internal spawner contract, rather than broad unchecked assumptions. No new advisory failure exists. The branch is committed and clean for A's repair-only re-check.
