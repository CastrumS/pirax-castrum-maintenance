# Review B: form-check-scope

## Verdict: fix

One documentation-only Fix. No runtime correctness defect or failing blocking check found in the implementation. Do not change the implemented missing-form behavior to satisfy the stale documentation.

- Base: `0a7ddf98806ede20a331cd2d68e073e89741648e`
- Reviewed head: `2abc3458f796da5501ce82fe83d810f0cc766dcd`
- Worktree: `/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/worktrees/form-check-scope`
- Worktree clean; `git diff --check <base> HEAD` passes.
- Initial blind B review: peer review was not read or contacted. Debate was disabled, so no position/rebuttal input is missing.

## Fix F1 — qualify the documented empty forms result

**Location:** `README.md:204`, Private reports and local evidence.

The paragraph still states unconditionally that “no forms is `[]`”. This is no longer the report contract: a successful discovery of an empty **designated** page must produce a synthetic failed form result, not an empty array. The later designated-form section (`README.md:231`) correctly explains missing selection, so the two descriptions disagree.

**Concrete scenario:** A listed `/empty` page renders no forms and the site configures `test_form: {page: /empty, plugin: gravity, id: 1}`. `src/forms/runner.ts:89` returns:

```json
[{"selector":"test-form:gravity:1","plugin":"gravity","outcome":"failed","detail":"test form not found"}]
```

That result fails form status; it is not the neutral `[]` promised by the report-format paragraph. The existing browser matrix explicitly asserts this case at `test/forms/browser.test.ts:344` and passed in the review verification below.

**Criterion:** Plan AC3 / brief done-criterion 3 require a failed missing designation, and plan checklist item 14 requires README command/report behavior to be current. This is a concrete wrong documented behavior, not a request to expand scope or restyle prose.

**Required correction:** Qualify the empty-array statement: a successfully scanned page with no forms has `[]` **unless it is the designated page**, in which case absence produces `failed: test form not found`. Keep discovery-failure wording and the existing implementation/tests unchanged. An equivalent concise statement distinguishing these cases is sufficient.

## Nits

None.

## Diff and contract assessment

Reviewed all 16 changed paths against the plan/design and implementation report, including the operator-facing README sections, example configuration, native forms guide and linked plugin rollout context. No `AREA.md` or agent-instruction file changed; no area-path audit is applicable. The configured grounding index is absent by configuration (`grounding: none`), as recorded in the plan; no index content was invented and no lessons were used as review requirements.

- The strict optional mapping validates exact listed-page membership, plugin and numeric safe-integer ID with slug/field errors. Non-safe integers cannot preserve exact identity, so rejecting them is consistent with the selection contract. No default designation is inferred.
- The shared runner is used by both `runForms` and `runCheck`. Validated page uniqueness plus designated-page matching and one selected descriptor index bounds a CLI invocation to one attempt per site. Nonselected forms skip before inspection/fill/submission, and failed/unsupported/rejected selections do not authorize fallback. There is no cross-run/global suppression.
- The missing result is emitted only after successful discovery on the designated page, including an empty page; discovery failure remains a scan failure. Same identity on another page does not satisfy the designation. The targeted runtime behavior is correct; F1 is documentation-only.
- The outcome union, shared manifest validator and report status/rendering are changed together. Skipped is neutral, visibly not delivery evidence, and does not hide existing failures. Approval remains check-only, and invalid outcomes still reject.
- All 12 operator designations are preserved; downstairs remains absent, helper flags stay false and page lists are unchanged. No screenshot, health, plugin or transport implementation change is included.
- Old native adapter/negative/AJAX/required-field tests still exercise selected forms rather than accidentally passing via default skips. Browser cases cover no credentials, no nonselected input/change events, duplicate identities, same-number plugins, rejection/no fallback, independent sites/invocations and excluded account forms.
- Native WordPress and private R2 tests use real processing/authentication and production dispatch. Context wrappers observe rather than replace form logic. Playground mail logging is explicitly not delivery evidence. One submission is established by an exact unique-ID/two-notification delta together with native entry/feed cleanup, not by zero remaining entries alone.

The documentation changes otherwise describe the new schema, scope, omission, helper gate, missing form, outcome and CLI evidence accurately. No broken referenced file was found on the affected read-first/doc surfaces.

## Verification evidence

No source change occurred since the implementation checks, so full suites were not repeated merely for review. Verified the head and consumed the existing concrete logs/evidence:

- `implementation/b-full-suite.log`: `mise exec node@24.21.0 -- bun --env-file=.env test` — **212 pass, 0 fail, 2643 assertions, 20 files, exit 0**, 1233.79 s.
- `implementation/b-typecheck.log`: `bun run typecheck` — **exit 0**.
- `implementation/b-sites.log`: **13 sites / 12 designated / downstairs false**, offline.
- Worker fail-first logs establish behavioral red/green regressions for schema, scope and skipped status. The final worker configured changed-tests run also passed 212/0 with the supplied base.
- Native summary: `runs/forms-playground-1996ecd0-26c4-4c2e-a9d5-de315f30639f/summary.json`. Selected CLI: one native submission, five skips, 305,748 ms and truthful exit 1 after mailbox timeout. No-designation/missing/helper-false cases: zero submissions with exits 0/1/0. Check preserves both widths and the same scope. Scoped cleanup: 42 deleted, 0 remaining; privacy: 109 files, 46 archives, 0 unsafe.
- Selected report and UI trace: `runs/forms-playground-1996ecd0-26c4-4c2e-a9d5-de315f30639f/cli/selected/runs/2026-09-26T21-20-00.384Z/{index.html,report.trace.zip}`. Existing headless Chromium assertions verify visible skipped/reason/status content without navigating a signed URL.

**Specific review rerun for F1:**

```sh
bun --no-env-file test test/forms/browser.test.ts -t 'missing, wrong-plugin, elsewhere-only, GF #0 and empty-page designations'
```

```text
1 pass
19 filtered out
0 fail
20 expect() calls
Ran 1 test across 1 file. [4.82s]
EXIT=0
```

Log: `review-B-verification.log` in this leaf. This proves the intended empty-designated-page failure; it is not a failed test to be repaired. Existing suite traces remain in ignored `runs/forms-browser-*` directories. No live site or environment file was opened, printed or changed during review.

## Boundaries retained

No live designation validation or rollout is claimed. Playground does not prove transport delivery. Arbitrary page-script/GET effects, custom account integrations, unsupported CAPTCHA/widgets and concurrent separate invocations remain the documented limitations. The earlier unrelated local-file render timeout is recorded honestly, passed six targeted reruns and both final full suites, and was not hidden by weakened tests; its cause remains unconfirmed. No new reusable lesson or human-only blocker was established in this review.
