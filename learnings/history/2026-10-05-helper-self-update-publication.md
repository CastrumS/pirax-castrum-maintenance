# Helper release publication: preflight is not ownership

Date: 2026-10-05

## Case

The helper's signed-release CLI checked that a version tag was absent, then called `gh release create --target <commit>`. Inspection found that this did not enforce the intended concurrent-tag refusal: GitHub CLI can reuse an existing tag, so another publisher could create it between the lookup and publication.

The CLI now atomically creates `refs/tags/v<version>` at the intended commit through GitHub's create-reference API before `gh release create --verify-tag`. A failed claim stops before release creation. Neither branch overwrites or deletes a ref. This is not a transaction: a failure or lost response can leave a ref, draft, partial asset upload or completed release, so recovery text requires inspecting remote state rather than assuming no release exists.

## Evidence

- `gh release create --help` says `--target` selects the commit for **automatic tag creation**, and `--verify-tag` aborts if the tag does not exist. It also states that attaching assets makes separate calls to create a draft, upload assets, then publish.
- `scripts/release-plugin.ts` contains the create-ref/verify-tag sequence. Its hardening landed as `7475dfc` on the helper leaf; the final diagnostic wording was subsequently made uncertainty-aware.
- `test/plugin/release.test.ts` exercises command order, a competing/existing-ref refusal, unanswered claim and release failure with no retry, overwrite or deletion. Real read-only GitHub authentication is retained; every publication mutation is intercepted at a strict test boundary. No real tag or release was created to test this.
- The helper-self-update pass retained `implementation/evidence-u4/red.log` (10 pass, 4 fail), `green-release.log` (14 pass, 0 fail), and a green full run (271 pass, 0 fail). These are command-boundary proofs, not evidence of a real remote publication.

## Learning

A read-only existence check establishes an observation, not exclusive ownership. The primitive that creates a shared identifier must enforce absence atomically. Separate remote operations also have separate failure states: a failed client command is not proof that the server made no change, and cleanup advice must not pretend it is.

## Applied — 2026-10-07

The re-audit publisher delegates publication to this atomic-claim CLI instead of implementing a second tag/release path. It records the intended commit/tag and uncertain partial state, never retries or deletes automatically, and verifies the remote assets independently. `tests/reaudit-publish.test.ts` covers existing-tag refusal and failure after a claim using intercepted mutations; no real publication is claimed by those fixtures.
