# Unit 4: close the folder-marker mismatch safely

## 1. Goal

Complete only the remaining optional A N3 portion of worker 3's return. The worktree is `/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/worktrees/checker-foundation`. B accepts the worker's demonstrated Bun 1.4.2 trailing-slash normalization mismatch and selects recommendation (a): retain fail-loud rejection and document it. Do not rerun or redo the already completed unit 3. D5/D6's scope safety and error reporting override an unsafe attempt to delete an external folder marker.

## 2. Numbered acceptance criteria

1. README explicitly states that externally created `reports/<runId>/` folder-marker keys make pruning reject, because Bun's client strips the trailing slash and cannot safely address that exact key. Operators should remove such markers with the tool that created them; this library does not create them. No claim of successful cleanup/skipping markers.
2. A targeted regression demonstrates the retained invariant: a canonical old report marker is selected with its old run by `expiredReportKeys`, but `delete(marker)` fails with `StoreError` before any request rather than addressing its slash-trimmed neighbor. Use synthetic closed-port config, as existing validation tests do; this is not fake-backend success evidence. Keep all existing validation tests and signatures intact.
3. No new signing code, new R2 mutation, changed selftest or store behavior. The blocked real-marker deletion test from unit 3 is not an acceptance requirement: it was an attempted optional Nit repair, not the locked design. The nonblocking limitation remains explicit in the report.

## 3. Read-first list

- `/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/open/site-checks/checker-foundation/implementation/worker-3.md` — mismatch evidence and safe correction (a).
- Same leaf `plan.md`, final implementation notes — B's resolution.
- `/home/rudi/.pi/agent/skills/implement-issue/ponytail.md`.
- Worktree `README.md`, `tests/store.test.ts`, `src/store.ts`: copy the existing `rejection`/`StoreError` test pattern, preserve lazy scoped API.

## 4. Change list and needed interfaces

Edit only `README.md` and `tests/store.test.ts`. Existing exports are `expiredReportKeys(keys:string[],keep=10):string[]`, `createStore({config,root})`, `StoreError`, and async `delete(key)`. The implementation already rejects trailing-slash keys and must remain unchanged. A named regression should capture the exact external-marker scenario, not a new general abstraction.

## 5. Do-not, reasons and exceptions

- Never open/print/write `.env` or `.env.*`; no credentials or real network are needed for this remainder.
- No store/API/S3 signing changes, skipping markers, deleting slash-trimmed neighbors, real bucket mutations or lifecycle/commit commands. These would exceed the resolved scope or endanger data; B owns checks and commit.
- Do not weaken existing tests or criteria. Return evidence for any new mismatch; only B's revised brief authorizes changed scope.

The exclusions protect exact-key deletion, credentials and locked scope. The only scope exception is an explicit revised brief; unsafe deletion and secret exposure have none.

## 6. Ordered steps

1. Add the named retained-rejection regression in `tests/store.test.ts` (criterion 2). This is a guard for unchanged behavior, so do not manufacture a red implementation run.
2. Add the accurate README limitation, keeping existing setup/path/discovery fixes (criterion 1).
3. Run the targeted tests and return the report (criterion 3). No full-suite rerun or selftest belongs to this worker.

Advisory size: two files, under 10 turns. Return a mismatch for materially larger work.

## 7. Commands

```sh
AKROGON_BASE=93cf3b7f6b99f3a34be7f69c004345c439fa6a76 bun test tests/store.test.ts
```

## 8. Done-when, evidence and report

Write `/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/open/site-checks/checker-foundation/implementation/worker-4.md` with exact changed files and targeted result. State A N3 remains a documented nonblocking limitation, not a claimed behavioral fix. Return its path.

Changed files and reasons: <paths and why>
Tests run: <command and result>
Known limitations: <external folder-marker rejection>
Unverified criteria: <any, or none for this bounded remainder>
