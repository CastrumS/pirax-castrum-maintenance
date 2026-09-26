# Implementation report: form-check-scope

## Result and commits

Implemented plan D1–D7 / AC1–AC7 in the leaf worktree, using one sequential delegated implementation unit and independent B verification. Ready for review; not merged or deployed.

- Worktree: `/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/worktrees/form-check-scope`
- Branch: `form-check-scope`
- Base: `0a7ddf98806ede20a331cd2d68e073e89741648e`
- Committed head: `2abc3458f796da5501ce82fe83d810f0cc766dcd`
- Commit: `Scope form checks to one designated test form per site`
- Commit result: `16 files changed, 572 insertions(+), 116 deletions(-)`.
- After commit, `git status --short` is empty and the base-to-head diff contains no `issues/` files. All pass artifacts are in this authoritative leaf, not the worktree branch.

No live sites were visited; no helper flag was enabled; no plugin, screenshot, health, mailbox transport or storage algorithm was changed. Environment files were never opened, printed or edited. Scripts needing values used Bun environment loading and printed only results. All inherited credential names were present during synthesis; real test preflights succeeded during implementation.

## Behavior and criteria

- **AC1:** `Site.test_form?` is a strict `{page, plugin, id}` mapping. Page exactly matches a normalized listed path, plugin is gravity/fluent, and id is a numeric safe integer. Malformed shape, missing/unknown members, wrong page/plugin and noninteger IDs produce site/field-specific `SitesConfigError`. Omission remains absent. Native IDs are compared canonically without broadening detection for GF #0.
- **AC2–4:** The shared scanner finds the first matching descriptor on the designated page before any per-form context, inspection, credential validation or typing. Every other descriptor is `skipped`, including repeated instances/pages, unknown forms and account forms. A rejected/unsupported/failed selection does not authorize fallback. Missing designation after successful discovery appends `failed` with exact detail `test form not found`; scan/navigation failure stays a scan failure. Supported helper-false designation fills without submitting. Existing identity, marker, unsupported-flow, request-policy and IMAP-before-click gates remain.
- **AC5:** Both manifest modes accept and render `skipped`, neutral for aggregation but explicitly not delivery evidence. Legacy outcomes, rejection of unknown outcomes, visual/health status and approval selection are preserved.
- **AC6:** Native GF and FF, repeated three-form pages, four actual scoped CLI scenarios, production `check`, redirected native mail, entries/feed cleanup, private publication and headless report rendering all passed. The real CLI selected case takes one default five-minute mailbox deadline and truthfully exits 1 because Playground logs mail instead of transporting it. No delivery was fabricated.
- **AC7:** Exactly the 12 operator-commented designations became real fields. downstairs remains undesignated, all 13 helper flags remain false, and listed pages remain unchanged. Full suite and typecheck pass.

## Changed files and reasons

| File | Change |
| --- | --- |
| `src/sites.ts` | Export `TestForm`, optional Site field, strict nested validation after page normalization. |
| `src/forms/runner.ts` | Shared designation gate, immediate skip results and explicit missing-designation failure; no global deduplication or signature change. |
| `src/report/model.ts` | Add `skipped` outcome without a schema-version bump or required record fields. |
| `src/report/manifest.ts` | Permit skipped in the shared validator for both modes. |
| `src/report/html.ts` | Neutral skipped status/display and explanation in both report modes. |
| `sites.yaml` | Activate all 12 existing designations verbatim; explain scope and omission. |
| `sites.example.yaml` | Illustrative contact designation and omission/helper/account-flow cautions. |
| `README.md` | Update schema/type, operator behavior, skipped/missing results, selection, credentials and one-attempt timing. |
| `test/forms/README.md` | Update scenario matrix, one-default-deadline timing, mail-count oracle, limitations and artifact layout. |
| `tests/sites.test.ts` | Valid/absent/invalid nested mappings, exact page membership and all committed assignments offline. |
| `tests/report.test.ts` | Check-mode skipped parsing/rendering/status/approval and unknown-outcome rejection. |
| `test/forms/report.test.ts` | Both manifest modes, exhaustive/mixed outcome gating, rendered skipped report and real scoped R2/approval compatibility. |
| `test/forms/browser.test.ts` | Explicit selections in old scanner tests; new omission, two-page, same-number plugin, missing, duplicate/no-fallback, account, no-typing, independent-site/invocation regressions. |
| `test/forms/fixtures.php` | Second native GF form and two real pages each rendering both GF forms and one FF form. No packaged-plugin changes or unaudited entry hooks. |
| `test/forms/harness.ts` | Explicit designation and multi-page site helpers; per-scenario real CLI package/report directories. |
| `test/forms/playground.test.ts` | Preserve native adapter/negative/required/AJAX cases through separate designations; repeated-page CLI, FF API and check scenarios; exact mail-delta count oracle. |

All three affected documentation surfaces from the plan were updated. No agent instruction file was affected. No new dependency or lockfile change.

## Delegation and red/green evidence

Delegated one vertical unit via `implementation/brief-1.md`, with the eight required sections, concrete acceptance criteria, constraints, worktree and base. Worker return `implementation/worker-1-report.md` supplies changed-file reasons, commands/results, actual artifacts, limitations and unverified boundaries. B inspected the landed schema, runner, report and test/doc changes, checked the return and independently verified the final tree. No mismatch or repair unit was needed.

Worker fail-first output is retained under `implementation/worker-1-evidence/`:

```text
bun --no-env-file test tests/sites.test.ts tests/report.test.ts test/forms/browser.test.ts
48 pass / 14 fail, exit 1 against unchanged source

bun --no-env-file test test/forms/report.test.ts -t "forms-only manifest|form outcome gating"
5 pass / 3 fail, exit 1 against unchanged source
```

The old loader rejected `test_form`; skipped aggregated as warning; the old runner touched every eligible form, including repeated pages/duplicates and omission cases. These are behavioral failures, not wording-only tests.

Green evidence includes browser `20 pass / 0 fail`, sites/report `42 pass / 0 fail`, forms-report units `8 pass / 0 fail`, and final focused native `8 pass / 0 fail` with real authentication, WordPress mutations, installed helper, R2 and Chromium.

The worker ran the configured changed-tests command with the supplied base (this repository's changed-tests command is itself `bun test`):

```sh
mise exec node@24.21.0 -- env AKROGON_BASE=0a7ddf98806ede20a331cd2d68e073e89741648e bun --env-file=.env -e 'const p=Bun.spawn(["bash","-lc",": \"${AKROGON_BASE:?AKROGON_BASE is required}\" && bun test"],{stdout:"inherit",stderr:"inherit",env:process.env}); process.exit(await p.exited)'
```

Final worker output (`worker-1-evidence/changed-tests-full-2.log`):

```text
212 pass
0 fail
2643 expect() calls
Ran 212 tests across 20 files. [1238.19s]
EXIT=0
```

### Earlier failure, retained rather than hidden

The worker's first full run was 211 pass / 1 fail: the existing `tests/report.test.ts` local-file Chromium render hit its 30-second test timeout. The retained trace showed navigation had not reached load before cleanup aborted it. It passed three isolated and three capture-then-report reruns with no test/code weakening, then passed the final worker suite and B's independent suite. Logs are `worker-1-evidence/changed-tests-full.log` and `flake-1-report-render.log`; detailed trace/path analysis is in the worker report. Its root cause remains unconfirmed; do not call this an implemented timeout fix.

## Independent B blocking checks

Final source tree was unchanged during these checks and committed afterward. Bun 1.4.2; the already-installed Node 24.21.0 was scoped through mise for the native Playground dependency, without changing the machine's global Node selection.

### Full suite

Command:

```sh
mise exec node@24.21.0 -- bun --env-file=.env test
```

Result (`implementation/b-full-suite.log`, 2026-09-26 21:16:56Z–21:37:30Z):

```text
212 pass
0 fail
2643 expect() calls
Ran 212 tests across 20 files. [1233.79s]
EXIT=0
```

The full suite includes all existing plugin suites, schema/report/browser/security tests and native scoped forms tests. No missing prerequisites or native tests were silently skipped. B ran the full suite once after the unit's successful return; no repair was necessary.

### Typecheck

```text
$ bun run typecheck
$ tsc --noEmit
EXIT=0
```

Log: `implementation/b-typecheck.log`.

### Committed-list/offline validation

```sh
bun --no-env-file -e 'import {loadSites} from "./src/sites.ts"; const sites=loadSites(); console.log(JSON.stringify({sites:sites.length,designated:sites.filter(s=>s.test_form).length,downstairsHasDesignation:!!sites.find(s=>s.slug==="downstairs")?.test_form}))'
```

```json
{"sites":13,"designated":12,"downstairsHasDesignation":false}
```

Log: `implementation/b-sites.log`. No network/site visits.

`git diff --check` passed. `git diff --name-only <base> HEAD -- issues` and final `git status --short` were empty. No advisory checks are configured.

## B native evidence and user-visible flow

All following run paths are relative to the worktree. Summary:

`runs/forms-playground-1996ecd0-26c4-4c2e-a9d5-de315f30639f/summary.json`

Fixture versions: GF 3.1.2, FF 6.2.14, WordPress 7.1.2, PHP 8.3. Actual CLI argv/cwd for each scenario are recorded in the summary: `bun run forms local --sites <generated-sites.json>`, from its own disposable package whose script invokes production dispatch with a real scoped store. Never the live-site alias/list.

Let `N = runs/forms-playground-1996ecd0-26c4-4c2e-a9d5-de315f30639f`:

| Scenario | Observed result | Evidence directory under N |
| --- | --- | --- |
| No designation, helper true | Exit 0; six skipped; no mail/entry/feed change; only two discovery traces. 3,039 ms. | `cli/none/runs/2026-09-26T21-19-36.229Z/` |
| Missing GF ID on second page | Exit 1; six skipped plus exact `test form not found`; no mail/entry/feed change; only discovery traces. 3,069 ms. | `cli/missing/runs/2026-09-26T21-19-43.791Z/` |
| Designated GF, helper false | Exit 0; one not-verified/five skipped; no mail/entry/feed change; one fill trace. 4,538 ms. | `cli/helper-false/runs/2026-09-26T21-19-51.324Z/` |
| Designated GF on second page, helper true | Exit 1; native confirmation then default mailbox timeout; one submission/five skipped. 305,748 ms. | `cli/selected/runs/2026-09-26T21-20-00.384Z/` |
| Production check, same designation | Exit 1 for truthful mailbox failure; one submission/five skips; both pages captured/same at desktop and mobile. | `check/2026-09-26T21-25-19.791Z/` |

Each CLI directory retains `index.html`, `manifest.json`, fetched `remote-index.html`, `report.trace.zip`, and `traces/forms/*.trace.zip`. The selected form's action trace is:

`N/cli/selected/runs/2026-09-26T21-20-00.384Z/traces/forms/4b686828140636acdd01-form-1.trace.zip`.

The selected CLI mail delta has exactly one unique ID (`ttupisrwaooa`), exactly two native notifications, correct redirected recipients/headers, unchanged feeds, and native GF/FF entry counts zero before and after helper cleanup. Check separately has one ID/two notifications and the same cleanup evidence. The zero-entry count is NOT used alone to count submissions; the exact tagged mail delta plus native snapshots is the combined oracle. Separate native FF scope selection also passed through production `runForms` with a short internal deadline; old required-field/AJAX/rejection scenarios still exercise both adapters with explicit designations.

Sanitized native ledgers/upload digests:

`artifacts/plugin/forms-checker-2026-09-26T21-17-34-549Z/` (`mail.jsonl`, `feeds.jsonl`, `entries.json`, network/manifest/traces).

The native summary reports:

```json
{"cleanup":{"ok":true,"deleted":42,"remaining":0,"stopped":true},"privacy":{"files":109,"archives":46,"unsafe":0}}
```

Real private HTML was rendered as local content in headless Playwright, with tracing on and video off. Tests assert visible skipped outcomes/reasons, missing failure, warning/failure/pass statuses and no image panels for forms-only. Signed bearer URLs were not retained; forms traces stayed local. All R2 mutations were scoped under a fresh `test/forms-.../` prefix, deleted and confirmed empty.

Additional B evidence:

- Browser scope/security traces: `runs/forms-browser-b7192ecd-3f1a-486d-ae82-d1409aaafa66/`.
- Both-mode report/publication/approval proof: `runs/forms-report-tests-43ac2745-8c53-440e-a2f3-507b4d0f0632/summary.json`.
- Nonsecret-folder-path publication regression: `runs/forms-collision-0290e608-b4f0-4802-a792-e4703a72ce39/synthetic-folder-collision/summary.json`.
- B ran `findSecrets(<leaf>/implementation, secretRedactor())` via `bun --env-file=.env`, printing counts only: `{"implementationEvidenceUnsafeFiles":0}` in `implementation/b-privacy.log`. Native/browser suites independently scanned retained artifacts and unpacked archives.

## Known limitations and unverified boundaries

- Per-site at-most-one attempt is per invocation. Separate commands/processes can each attempt; there is no persistent deduplication or cross-run lock.
- A designation identifies plugin/id/page, not a business purpose. Operators must never designate account flows. Existing unsupported/password/custom-flow gates remain; ordinary-looking unaudited account integrations cannot be inferred from arbitrary DOM. The committed login/registration forms are not selected.
- Skipped proves the checker did not fill/submit that descriptor, not absence of arbitrary page-script or initial GET side effects. Bounded discovery, unsupported CAPTCHA/widgets, helper attestation and rollout requirements remain unchanged.
- Numeric IDs must fit the safe-integer range to preserve exact identity. Zero/negative integers load but cannot match the positive native IDs recognized by existing detection.
- The 12 live designations were preserved verbatim and validated offline, not confirmed against production DOM. A stale designation fails explicitly rather than choosing a different form.
- Playground logs outgoing mail. This leaf proves native submission/isolation/cleanup and truthful mailbox timeout, not live client transport delivery. No SMTP selftest or live rollout was authorized/required or performed.
- The earlier unrelated render timeout did not recur in six targeted repetitions or either final full suite, but its environmental cause is unverified.

No acceptance criterion remains unverified within the locked local/native scope. No human-only blocker, changed locked decision, new secret, or unsupported delivery claim is carried into review.

## Repair round 1 — 2026-09-27 (local date)

### Finding, scope and commits

- Before/reviewed commit: `2abc3458f796da5501ce82fe83d810f0cc766dcd`.
- After/repair commit: `24a67fdcc7df668cca4387ed7ea58caa497e136c` — `Clarify missing designated forms in report documentation`.
- Addressed **review B F1**: `README.md:204` now says an empty successfully scanned page yields `[]` except the designated `test_form` page, which produces one `failed` result with detail `test form not found`. The separate discovery-failure statement remains intact. The old unconditional empty-array claim is removed.
- The entire repair diff is **one README line changed** (1 insertion / 1 deletion). Runtime, configuration, tests and deadlines are unchanged; no prose test was added for this trivial documentation correction.
- Review A requested no Fix. Its three non-blocking Nits (unreachable guard, prose-sensitive test assertions, test-local name shadowing) are deliberately deferred to keep this documentation repair narrow. They remain disclosed, not claimed resolved.
- Before coding, appended repair constraints to the plan's dated Implementation notes, clarified the original README brief step, and delegated `implementation/brief-2.md` as one sequential unit. `worker-2-report.md` contains all four required return contents and the real command/evidence. B checked the return and repair diff.

### Checks

Worker configured changed-tests command (base remains the configured issue base):

```sh
mise exec node@24.21.0 -- env AKROGON_BASE=0a7ddf98806ede20a331cd2d68e073e89741648e bun --env-file=.env -e 'const p=Bun.spawn(["bash","-c",": \"${AKROGON_BASE:?AKROGON_BASE is required}\" && bun test"],{stdout:"inherit",stderr:"inherit",env:process.env}); process.exit(await p.exited)'
```

`implementation/worker-2-evidence/changed-tests.log` / `.exit`:

```text
212 pass
0 fail
2643 expect() calls
Ran 212 tests across 20 files. [1243.67s]
exit 0
```

After worker completion, B ran the full suite independently:

```sh
mise exec node@24.21.0 -- bun --env-file=.env test
```

`implementation/b-repair-1-full-suite.log` / `.exit`, 2026-09-26 22:19:12Z–22:39:51Z:

```text
212 pass
0 fail
2643 expect() calls
Ran 212 tests across 20 files. [1238.16s]
EXIT=0
```

`implementation/b-repair-1-typecheck.log`:

```text
$ bun run typecheck
$ tsc --noEmit
EXIT=0
```

No failures or weakened checks in this round. `git diff --check` passed. After commit, `git status --short` is empty and `git diff --name-only 2abc3458f796da5501ce82fe83d810f0cc766dcd HEAD` prints only `README.md`; no issue artifacts are on the branch.

### Repair verification artifacts

Paths below are relative to the worktree:

- B native summary: `runs/forms-playground-55d3beb7-c1aa-4889-844a-85c69279f694/summary.json`.
- B selected CLI report: `runs/forms-playground-55d3beb7-c1aa-4889-844a-85c69279f694/cli/selected/runs/2026-09-26T22-22-18.116Z/index.html`; sibling `manifest.json`, `report.trace.zip` and `traces/forms/*.trace.zip` retained.
- B browser regressions (including empty designation): `runs/forms-browser-1828f7da-62a1-4aca-b4b8-e78621eaa584/`.
- B report/publication summary: `runs/forms-report-tests-0a3ae5bc-e484-472d-9a6e-033996916b41/summary.json`.
- Worker native summary: `runs/forms-playground-e11f4094-4f0a-450e-af82-1bf82aef83e8/summary.json`.

B native summary again reports cleanup `ok`, 42 deleted/0 remaining, 109 files/46 archives scanned/0 unsafe. Selected CLI has one submission ID/two notifications and truthful timeout exit 1 in 305,523 ms. These are regression checks of unchanged runtime, not newly claimed transport delivery. The missing/empty-page behavior stays covered by the existing meaningful test; no assertion matches README prose.

### Remaining boundaries

F1 is resolved; no blocking review finding remains unaddressed by this repair. The three optional A Nits remain deferred as above. Original live-site, transport-delivery, arbitrary-page-code and per-invocation limitations are unchanged. No acceptance criterion is newly unverified, no environment file was opened/printed/edited, no live site was visited, and no operator blocker arose. Ready for A's repair-diff-only re-check from `2abc3458f796da5501ce82fe83d810f0cc766dcd` to `24a67fdcc7df668cca4387ed7ea58caa497e136c`.
