# Native dictionary equality — 2026-10-12

## Case

During deployment-folder's real WordPress updater proof, the installed synthetic helper had exactly the expected eleven file hashes. The assertion still failed: PHP's `ksort` placed `README.md` before the lowercase main filename, while JavaScript's locale ordering placed the main filename first. Comparing `JSON.stringify` results treated insertion order as file-content identity.

## Evidence

- Red: ignored `artifacts/deployment-folder/unit-4-selftest-lead.log`, `installedIs` upload-state failure with identical hashes in different order.
- Repair: `test/plugin/update-scenario.ts` uses `node:util.isDeepStrictEqual` for native state assertions.
- Green: `artifacts/deployment-folder/unit-4-selftest-lead-green.log`, all six real production-key/channel scenarios passed; `artifacts/deployment-folder/unit-4-updates-lead.log`, eight native update tests passed with 167 assertions.

These logs belong to the implementation worktree; the authoritative issue report records the preserved evidence roots.

## Learning

JSON dictionaries are not ordered contracts. Compare their structure and values directly; keep array ordering and value types significant. Canonical serialization is appropriate only when canonical bytes themselves are the contract (for example, signed manifests), not as a substitute for ordinary object equality across runtimes.
