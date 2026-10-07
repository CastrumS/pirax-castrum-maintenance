# Unit 5 — review repair, round 1

## 1. Goal

Close A-F1/F2 and B-F1/F2/F3 without changing helper/checker behavior or relaxing privacy gates (plan D1/D8, AC5/AC6). Work only in `/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/worktrees/helper-self-update-u5`.

Prerequisites landed: reviewed head f2b79e2 was rebased onto merged checker `origin/main` e6bc044. Pure-rebase head is **db2cba17bed1ecccab0f433a055ff8d4b7d5a405**. The root README command-table conflict already keeps both changed rows. The stale message prose still needs repair.

## 2. Numbered acceptance criteria

1. A parent with a synthetic signing variable calls the real `findSecret` and `sanitizeZip`; their unzip/zip children do not receive `PIRAX_HELPER_SIGNING_KEY`, while the parent still has it for content scanning. The three direct archive calls in harness.test.ts/stack-harness.test.ts also omit it. A fail-first subprocess-boundary test fails against the baseline, then passes. Zero content hits alone are not proof of environment isolation.
2. `updates.test.ts` no longer captures/asserts an entire environment containing real credentials. The actual check remains meaningful and records only presence/absence. Demonstrate safely with synthetic-only inputs that a failing assertion cannot print a credential-shaped canary; never deliberately fail a check with real credentials.
3. Docs consistently say helper 0.3.0+ emits version-only awaiting-audit refusals; older deployed helpers keep generic refusals, reported as rejected. The merged checker handles awaiting-audit with warning/exit 0 and escalation strictly beyond 72 hours. Retain the distinction between synthetic checker fixtures and native helper emission evidence.
4. Test privacy docs distinguish intentional temporary generated-seed source/git fixtures from memory-only handling, retaining the prohibition on production-seed writes and on private material in retained evidence.
5. Scoped commit, passing targeted/changed checks, secret-safe durable evidence, and a complete report. No remote mutation or code change outside scope.

## 3. Read-first list

- Authoritative `/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/open/helper-auto-audit/helper-self-update/{plan.md,review-A.md,review-B.md}` and its `review-B-{env,matcher}-proof.json`.
- `/home/rudi/.pi/agent/skills/implement-issue/ponytail.md`.
- Worktree `scripts/build-plugin.ts` (`withoutSigningKey` is the existing reusable pattern).
- `test/plugin/{artifacts.ts,harness.test.ts,stack-harness.test.ts,updates.test.ts,release.test.ts,README.md}`.
- `README.md` (helper introduction, command table, Awaiting-audit refusals), `plugin/pirax-form-test/README.md`, `test/forms/README.md`.
- Read-only checker contracts: `src/forms/{submit.ts,awaiting-audit.ts}`. No grounding index/AREA exists.

## 4. Change list and needed interfaces

Own these files:
- `test/plugin/artifacts.ts`: shared `run()` must pass `env: withoutSigningKey()` (import from `../../scripts/build-plugin`). Both scan and sanitizer use it. Do not delete the variable globally.
- `test/plugin/harness.test.ts`: strip at its direct zip/unzip calls (review lines 113/169).
- `test/plugin/stack-harness.test.ts`: strip at its direct unzip call (review line 149).
- `test/plugin/updates.test.ts`: replace the new full `env` dump/string matcher with a boolean/name-only observation.
- At most one small new `test/plugin/artifacts.test.ts` (or equivalent focused file) for the meaningful environment boundary and failure-diagnostic regressions. No new test framework or dependency.
- `README.md`, `plugin/pirax-form-test/README.md`, `test/forms/README.md`, `test/plugin/README.md`: the four factual documentation repairs, keeping both already-resolved command-table edits.

`withoutSigningKey(env = process.env)` returns the environment minus this variable; it must not mutate the parent. `findSecret(dir, needles)` returns hit paths and unpacks ZIP entries; `sanitizeZip(zip, secrets)` unpacks/scrubs/repacks. Test through these real functions, observing child presence at the process boundary and delegating actual archive operations to installed zip/unzip. A fresh child with an initial PATH is necessary: changing PATH inside an already-started Bun process did not intercept the reviewer’s archive commands.

## 5. Do-not, reasons and exceptions

- Never open, print or edit `.env`/`.env.*`. Load required native values through `bun --env-file=/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/.env`; report names/results only. For broad checks omit the real signing seed from test children. Use synthetic-only fresh children for the presence regression.
- No actual signing seed in logs, command arguments, temporary source, or unrelated subprocess environments. Generated public canaries test inheritance; generated private test fixtures remain disposable and never retained. Assertions must not receive raw credential-bearing buffers or whole env objects.
- Do not modify runtime PHP, checker logic, release/build behavior, audited versions, test discovery or auth/update HTTP. Do not create a remote tag/release/secret, alter lifecycle state or make phase calls. Those surfaces are outside these findings; docs may describe their already-merged behavior.
- Return an evidenced mismatch instead of expanding scope/interfaces; only B's revised brief authorizes expansion. These exclusions keep privacy, native safety and ownership intact; targeted docs/tests changes above are the authorized exception.

## 6. Ordered steps

1. Read the findings/live contracts; install dependencies with `bun install`.
2. Add the smallest subprocess-boundary regression (AC1), retaining red evidence without any real credentials. Set synthetic values only in isolated test children; preserve parent scanning. Add/verify the safe failure diagnostic for AC2.
3. Fix shared/direct archive environments and the updater assertion. Run the targeted tests green; inspect that real archive contents still work and parent state is unchanged.
4. Correct all four guides (AC3/AC4), following the actual checker rather than repeating “not implemented yet.” Do not claim synthetic fixtures prove native emission.
5. Run `bun run build:plugin` **before** the configured changed command (the forms suites need the prebuilt ZIP). Run the command to completion, capture its exit status, then commit only owned files and complete the report.

Advisory: about 9 files, under 44 worker turns. The changed run can take 45–55 minutes; use a detached `setsid` process group with an explicit completion marker and wait for it, not a final “waiting” response.

## 7. Commands

Resolved changed-test command, with prerequisites loaded by Bun and seed omitted from spawned test process:

```sh
AKROGON_BASE=2689aaa3bd69a9a46cc77788fdc5219354cc923a
: "${AKROGON_BASE:?AKROGON_BASE is required}" && bun test
```

This configured changed command happens to be the broad suite; do not substitute a narrower runner. B owns final blocking checks separately. Targeted red/green commands derive from the small regression file; keep them credential-free. No silent prerequisite skips.

## 8. Done-when, evidence and report

Write `implementation/worker-5.md` and durable `implementation/evidence-u5/` under the authoritative leaf, never the worktree issue copy. Include the scoped commit, exact commands/results, red/green results, full changed-command log and explicit exit marker, privacy checks, limitations and anything unverified. No runtime/browser flow changed here; existing native flow proof is retained and the changed command reruns it. Synthetic observer wrappers do not mock auth or archive behavior: they must delegate actual zip operations and capture only presence booleans.

Changed files and reasons: <paths and why>
Tests run: <commands and results>
Known limitations: <limitations or none known>
Unverified criteria: <criterion and why, or none>
