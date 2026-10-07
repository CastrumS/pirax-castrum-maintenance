# Checker awaiting-audit: consumer-side docs stated a sibling leaf's unreleased message as current behavior

Recorded: 2026-10-02 (helper-auto-audit / checker-awaiting-audit, check.review seat A, initial review of `5250748`).

## Case

Issue helper-auto-audit split one contract across leaves.

- `helper-self-update` owns the helper's new version-only refusal text, `Pirax test blocked: awaiting audit of <label> <version>`.
- `checker-awaiting-audit` classifies that text in the checker.

The checker leaf deliberately had no execution dependency on the helper leaf, and verified against loopback fixtures.

Its root README section nevertheless stated, in the present tense, "The helper refuses … Its message is `Pirax test blocked: awaiting audit of …`". It also called the generic block "the older generic" message.

At that commit, the in-tree helper (0.2.4) still failed version mismatches with "integrations could not be suppressed". The plugin README in the same tree said so too. The helper leaf was in phase `failed` and unmerged. Merging the checker leaf first would have left `main` contradicting itself, and would have told the operator that a version-only block is a warning when it was still a failure.

## Evidence

- Leaf `issues/open/helper-auto-audit/checker-awaiting-audit/review-A.md`, finding F1.
- At the reviewed head:
  - `README.md:233-235`;
  - `test/forms/README.md:41`;
  - `plugin/pirax-form-test/README.md:68`;
  - `plugin/pirax-form-test/includes/compatibility.php:9`;
  - `plugin/pirax-form-test/includes/marker.php:23`.
- The sibling's `state.yaml` showed phase `failed`. `git grep "awaiting audit" origin/main -- plugin/` was empty.

## Learning

When one leaf documents its side of a cross-leaf contract that it can merge independently, check two things before writing a present-tense claim about the other side: the sibling's merge state, and the in-tree implementation. Name which side or version supplies the behavior, and say what current releases still do. Fixture-verified consumer behavior is not evidence that the producer already ships the contract.
