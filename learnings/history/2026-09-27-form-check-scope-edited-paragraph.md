# Form check scope: stale clause inside an edited doc paragraph

Recorded: 2026-09-27 (slot A re-check of form-check-scope at `24a67fd`, after repair round 1).

## Case

form-check-scope added a synthetic `failed` result, `test form not found`, for a designated page whose scan succeeds without the designated form, including a page with no forms. The implementation edited the README paragraph on report format by inserting "Every discovered form is listed, including `skipped` ones with their reason." directly after the existing clause "no forms is `[]`", which it left unchanged. A's initial blind review read that paragraph in the diff and checked the inserted sentence and the new "Designated test form" section. It concluded that every documentation claim matched the code. B's review flagged the stale clause as Fix F1, which cost a repair round for a one-line README change.

## Evidence

- Initial diff `0a7ddf9..2abc345`, `README.md`: the paragraph starting "`check` attaches `PageResult.forms`" gained the `skipped` sentence and kept "no forms is `[]`".
- `src/forms/runner.ts:89` (at `2abc345`) pushes `{selector: 'test-form:<plugin>:<id>', outcome: 'failed', detail: 'test form not found'}` after a successful scan without a match. `test/forms/browser.test.ts:344` asserts that a designated `/empty` page gives `["gravity:failed"]`, while `:235` asserts an undesignated `/empty` gives `[]`.
- Leaf reviews: `issues/open/site-checks/form-check-scope/review-B.md` F1, and `review-A.md` (initial `nits`, then the re-check). Repair commit `24a67fd`.

## Learning

When a change makes an edge input (empty, absent, missing) produce a different result, the old documentation for that input goes stale without any edit to it. It can sit right next to the text the diff adds. For every edited doc paragraph, re-read each clause against the new behavior, not just the inserted sentence. Also grep the docs for the old edge-case wording (`[]`, "no forms", "empty", "none") and check each hit.
