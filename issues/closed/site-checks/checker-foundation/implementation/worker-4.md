# Worker 4 report: A N3 remainder (folder markers)

- Worktree: `/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/worktrees/checker-foundation`. Changes are uncommitted on top of unit 3's working tree. Nothing was committed, no lifecycle command was run, no `.env`/`.env.*` was accessed, and no network or R2 was used.
- B selected recommendation (a): A N3 remains a **documented nonblocking limitation**. This unit does not claim a behavioural fix. `src/store.ts`, the selftest and all signatures are unchanged by this unit.

Changed files and reasons:
- `tests/store.test.ts`: adds `store validation before any request > external folder marker of an expired run is selected but rejected, never slash-trimmed` (criterion 2). With 12 runs and `keep` 11, `expiredReportKeys` selects the marker `reports/<oldest>/` together with its run's objects, and does not select the slash-trimmed neighbour `reports/<oldest>`. `scoped.delete(marker)` rejects with `StoreError`, and the message names the exact marker key. The test uses the existing synthetic closed-port config and the `rejection` helper, so a `StoreError` means validation ran before any request. It does not show fake-backend success. No existing test was changed.
- `README.md`: adds one Limitations bullet (criterion 1). It says an externally created `reports/<runId>/` marker makes `pruneReports` reject with `StoreError` once its run expires, because Bun's S3 client strips the trailing `/` and would address `reports/<runId>` instead. It says the marker is neither deleted nor skipped, that operators should remove it with the tool that created it, and that this library never creates markers. The setup, path and discovery text from unit 3 is unchanged.

Tests run: `AKROGON_BASE=93cf3b7f6b99f3a34be7f69c004345c439fa6a76 bun test tests/store.test.ts`: 17 pass, 0 fail, 133 `expect()` calls, 1 file (Bun 1.4.2). `git diff --check` is clean. The new test guards unchanged behaviour, so there is no red run (brief step 1). The full suite, typecheck and selftest were not run; B owns them.

Known limitations: an external folder-marker object under an expired `reports/<runId>/` still makes `pruneReports` reject, as at the reviewed head. Sorted order means older runs are already deleted by then, but the marker, and any objects of its run that sort after it, stay until an operator removes the marker with another tool. Supporting deletion would need signing code outside Bun's `S3Client` (worker 3, option (c)), which is outside the locked design.

Unverified criteria: none for this bounded remainder. The real-marker R2 deletion test from unit 3 is not required (brief 4, criterion 3). It stays impossible with Bun 1.4.2 `S3Client` (see `worker-3.md`).
