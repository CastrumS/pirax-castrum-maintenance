# Worker 1 report: awaiting-audit classification and report support (D1, D5, D6)

Commits, detached in worktree `issues/worktrees/checker-awaiting-audit-u1`, on parent `2689aaa`:
- `b307e0e`: `feat: classify exact awaiting-audit helper refusals as a warning outcome` (original chunk)
- `a5298de`: `fix: treat only GF's native summary heading as awaiting-audit framing` (completion correction for criterion 2)

## Changed files and reasons

- `src/forms/submit.ts`: `SubmissionResult.state` gains `awaiting-audit`. The observation loop now keeps each fresh, visible, selected-form error node as its own message. A node's message is its own text only, so text inside a nested matched error node (overlapping ancestor selectors) and FF's stacked-error dismiss `×` (`.error-clear`) are left out. Inside the GF `#gform_<id>_validation_container` node, only the native summary heading (`.gform_submission_error`) is framing. It is kept as a separate framing message. Any other text directly in that container is a substantive message: a literal generic block, extra refusal text, or an awaiting message on its own. (In b307e0e the whole container text was treated as framing; a5298de corrects this.) The result is `awaiting-audit` only when there is at least one non-summary message and every distinct non-summary message matches the case-sensitive pattern `^Pirax test blocked: awaiting audit of ITEM(, ITEM)*$`, where ITEM = `<nonempty label> <nonempty version>` with no commas. There is no plugin or version allowlist. Anything else stays `rejected` as before. The match runs on the raw text, then the existing `result()` redacts it and caps it at 2000 characters. Routing, POST authorization, the stale/foreign guards, transport-failure precedence, the success path and the native-validation (`invalid`) path are unchanged. The scanner already forwards every non-confirmed state without mailbox polling, so `runner.ts` did not need to change.
- `src/report/model.ts`: `FormResult.outcome` union gains `awaiting-audit`, with a doc comment.
- `src/report/manifest.ts`: `awaiting-audit` added to the explicit outcome whitelist that both the check and forms manifests use. Unknown outcomes still fail validation, and the schema version is unchanged.
- `src/report/html.ts`: `formStatus` was already mapping this outcome to a warning, so it is unchanged. Only its comment and the forms-only footer changed, to list awaiting-audit among the warnings. The check-mode footer has no warning list and is unchanged.
- `test/forms/browser.test.ts`: new loopback fixtures for GF native POST refusals and FF AJAX stacked refusals, plus two tests:
  - Classification matrix, with exactly one POST per case:
    - `awaiting-audit`: GF native summary plus helper paragraph; multi-item list with a synthetic token shown redacted as `<token>`; helper paragraph nested inside the matched container (overlapping selectors); FF multi-item stacked error.
    - Completion fixtures, fail-first:
      - `/gf-awaiting-generic-in-container` (summary heading plus the literal generic block in the container, plus an awaiting paragraph) → `rejected`.
      - `/gf-awaiting-extra-in-container` (heading plus `Spam check failed.` plus an awaiting paragraph) → `rejected`.
      - `/gf-awaiting-only-container` (awaiting text directly in the container) → `awaiting-audit`.
      - `/gf-summary-only` (bare native summary heading; ordinary native validation) → `rejected`, with the heading text in the detail.
    - `rejected`: awaiting message plus a GF field error, a second helper paragraph, or an FF field error; the old exact "integrations could not be suppressed" for GF and FF; lowercase prefix; blank payload for GF and FF; label without a version; `,` without a space; mid-sentence mention.
    - `failed` (existing behavior): another form's (GF #2) awaiting refusal; a stale FF awaiting message that was on the page before the attempt; an FF awaiting message rendered outside the selected instance.
  - Scanner test: `scanPageForms` returns `gravity:awaiting-audit` and `fluent:awaiting-audit` with the version text in the detail. It makes one POST and zero connections to a real loopback mailbox listener. A positive control shows a confirmed `/plain` submission does connect to that same listener. Traces use the existing pattern (tracing on; screenshots, snapshots and sources off; no video). The existing secret scan of retained traces still passes.
- `tests/report.test.ts`: `awaiting-audit` added to the exhaustive rendered-outcome list. New test: status is warning; the HTML shows literal `<strong>awaiting-audit</strong>` with the version text escaped; the check manifest parses and `validateApproval` still accepts it; a changed visual still makes the report a failure; near-miss outcome names are rejected.
- `test/forms/report.test.ts`: the exhaustive `Record<FormResult["outcome"], …>` gains `"awaiting-audit": "warning"`, which keeps the file compiling. Both manifest modes accept `awaiting-audit`, and `awaiting` / `Awaiting-audit` are rejected. New forms-only HTML test: warning cell class, escaped versions, footer text.

## Tests run

Every run had Node 24.21.0 first on PATH. Setup was `bun install --frozen-lockfile`, `bunx playwright install chromium` and `bun run build:plugin` (dist ZIP sha256 `36ae4cce…`), all exit 0.

**Red, before implementation** (log: `implementation/worker-1-red.log`)
- `bun --no-env-file test tests/report.test.ts`: 10 pass, 1 fail (the new awaiting-audit test).
- `bun --no-env-file test test/forms/report.test.ts -t "manifest|gating"`: 9 pass, 2 fail (manifest acceptance and the forms HTML test).
- `bun --no-env-file test test/forms/browser.test.ts -t awaiting`: 0 pass, 2 fail.
  - `/gf-awaiting` came back `rejected`.
  - The scanner returned `gravity:rejected`. Its mailbox positive control passed.

**Green, after implementation** (log: `implementation/worker-1-green.log`)
- `bun run typecheck`: exit 0.
- `tests/report.test.ts`: 11 pass, 0 fail.
- `test/forms/report.test.ts -t "manifest|gating"`: 11 pass, 0 fail.
- `bun --no-env-file test test/forms/browser.test.ts` (whole file): 22 pass, 0 fail. Every fixture state printed as expected.
- Browser evidence: `runs/forms-browser-2076b310-32a6-4b10-ba2d-9976eea6d87a/` in the u1 worktree.

**Completion red, on b307e0e with the new fixtures** (log: `implementation/worker-1-red-2.log`)
- `bun --no-env-file test test/forms/browser.test.ts -t "exact awaiting-audit"`, run twice: 0 pass, 1 fail each time.
  - Received `"/gf-awaiting-only-container: rejected"` (expected `awaiting-audit`).
  - After reordering the cases, received `"/gf-awaiting-generic-in-container: awaiting-audit"` (expected `rejected`). This is the masking defect.
- The matrix stops at its first mismatch, so `/gf-awaiting-extra-in-container` has no separate red. It goes through the same blanket-framing code path as the generic case.

**Completion green, on a5298de** (log: `implementation/worker-1-green-2.log`)
- `bun run typecheck`: exit 0.
- `tests/report.test.ts`: 11 pass, 0 fail.
- `test/forms/report.test.ts -t "manifest|gating"`: 11 pass, 0 fail.
- `test/forms/browser.test.ts` (whole file): 22 pass, 0 fail. All 22 fixture states as expected, including the four new ones.
- Browser evidence: `runs/forms-browser-805bf138-f29a-4067-a79c-5fdbe61c7e80/`.

**Configured changed-test command, on a5298de**
- Command: `AKROGON_BASE=2689aaa3bd69a9a46cc77788fdc5219354cc923a`, environment loaded through `bun --env-file=<registered .env> -e 'Bun.spawn(["bash","-c",": \"${AKROGON_BASE:?…}\" && bun test"])'`, Node 24 first on PATH.
- Output tail:
  ```
   252 pass
   0 fail
   3311 expect() calls
  Ran 252 tests across 22 files. [2429.69s]
  changed-tests exit 0
  ```
- Sanitized log: `implementation/worker-1-changed-tests.log`. Every loaded environment value of 6 or more characters was replaced in-process with `<redacted:NAME>` (no values were printed; 2 replacements, both `NVD_BACKEND`, an ambient shell variable whose value matched ordinary log text, so this was over-redaction and no secret was present), and the raw temp file was deleted.
- Suite evidence paths printed: `runs/forms-browser-c71407cd-e705-4c2c-9a8c-b368eb264fd9/`, `runs/forms-collision-3d9fe72a-…/summary.json`, `runs/forms-report-tests-c6a7969e-…/summary.json`.
- The first full-suite attempt (on b307e0e) was stopped with the previous session before it finished. It left no result and is not claimed. Other workers' `bun test` processes were running at the same time; there were no failures from contention.

## Known limitations

- Framing is recognized structurally by GF's native `.gform_submission_error` heading class inside the selected form's validation container, not by its localized text. If a third party put refusal text inside that heading element itself, it would be treated as framing. Text anywhere else in the container is counted.
- The pattern is strict. A label or version containing a comma, a double space, or a version with internal spaces is classified as `rejected`, not `awaiting-audit`. This matches the helper contract (`<label> <version>` items joined by `, `), but a future change to the helper's format would need this pattern updated.
- Rejected details now use each node's own text, de-duplicated, instead of each node's full `textContent`. Nested duplicates and FF's `×` no longer appear in rejected details. The rejected/failed state logic is unchanged.
- GF modern AJAX refusal markup is not a separate fixture. The node selectors and classification are the same as for GF postback.
- The fixtures follow the native shapes: GF 2.5+ summary `h2` in `#gform_<id>_validation_container` with the helper paragraph appended by `gform_validation_message`, and the FF 6.2.14 `form-submission.js` stacked error (inspected from the cached wordpress.org ZIP). They are not a released helper's output.

## Unverified criteria

- The helper release actually producing the awaiting-audit text on a live or native WordPress site is out of scope (sibling leaf helper-self-update). Here it is covered only by the permitted loopback fixtures.
- Storage, timer aging, escalation, clearing and the CLI/command exit contract are worker 2 and worker 3 scope and not claimed here. AC6 exit codes are verified only as report status (warning, with visual failure still a failure), not through production commands.
