# Synthetic publication state must not fall through to live reads

Date: 2026-10-13

## Case

Publisher tests intercepted mutations and stored synthetic refs/releases locally, but forwarded reads to real GitHub whenever no synthetic state file existed. The fixture bumped the base helper from 0.3.2 to 0.3.3. When the actual repository acquired v0.3.3 during verification, six unrelated publication scenarios correctly stopped at `tag-exists` instead of reaching their intended boundaries.

## Evidence

- `artifacts/deployment-folder/final-tests-after-repair.log`: 557 pass / 6 fail; all six failures were the mixed-state fixture boundary, not a production publication-guard defect.
- Read-only observation: `artifacts/deployment-folder/upstream-release-during-verification.json` records v0.3.3 published at 2026-10-13T11:22:48Z. This task made no real release.
- Unit 8 separates the real read-only missing-release calibration from wholly synthetic lifecycle fixtures. Empty local state models an empty remote, not permission to consult the live one. Its regression checks that a genuinely published base version is absent from an empty fixture and that unmodelled reads fail closed. Evidence and results: leaf `implementation/return-8.md` and `artifacts/deployment-folder/unit-8-evidence/`.

## Learning

A stateful fake needs one source of truth for reads and writes. Keep a small explicit real-service calibration separate from controlled lifecycle scenarios. Do not repair this coupling by weakening existence guards, changing production version facts, or selecting a larger magic test version that merely postpones the collision.
