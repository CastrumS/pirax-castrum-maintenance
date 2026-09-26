# Unit 2: repair the README empty-result contract (round 1)

## 1. Goal

Fix review B F1 only, refining plan D3/AC3/checklist 14 without changing behavior. Worktree: `/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/worktrees/form-check-scope`. Leaf: `/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/open/site-checks/form-check-scope`. Reviewed starting head: `2abc3458f796da5501ce82fe83d810f0cc766dcd`. Configured base: `0a7ddf98806ede20a331cd2d68e073e89741648e`.

## 2. Numbered acceptance criteria

1. README Private reports and local evidence no longer claims every no-form scan produces `[]`. It distinguishes a successfully scanned empty non-designated page (`[]`) from an empty designated page (one `failed` result with literal detail `test form not found`). Discovery failure remains explicit failed results.
2. Only README codebase content changes; preserve runtime, tests, helper flags, pages, secrets and all locked behavior. There is no new test of prose; existing empty-designation browser regression already proves the correct behavior.
3. Configured changed-tests command passes and the four-content worker report records actual result/evidence, limitations and unverified criteria. B runs its own blocking checks after return.

## 3. Read-first list

- Leaf `review-B.md` F1 and `plan.md` Implementation notes.
- `README.md` Private reports and local evidence / Designated test form sections (existing latter section is the pattern for the missing-result wording).
- `src/forms/runner.ts:49-89` and the existing empty-page case in `test/forms/browser.test.ts:330-365` for read-only contract confirmation.
- `/home/rudi/.pi/agent/skills/implement-issue/ponytail.md`.

No index lookup needed. Review A has no Fix; its three optional Nits (dead guard, prose assertions, name shadowing) are explicitly deferred.

## 4. Change list and needed interfaces

Only `README.md`, currently line 204: qualify the sentence containing `no forms is []`. Use concise wording distinguishing successfully scanned empty pages from a missing designation. `FormResult`/scanner interfaces are unchanged; a missing designation returns `{selector: 'test-form:gravity:1', plugin: 'gravity', outcome: 'failed', detail: 'test form not found'}` for an empty page with that designation.

## 5. Do-not, reasons and exceptions

- No source or test edits and no new test for prose: the runtime behavior is already correct and F1 is documentation-only. Do not implement the deferred Nits. Exception: return an evidence-backed mismatch if this small repair cannot meet its criteria; only B's revised brief can authorize broader work.
- Never open, print, append to or write `.env` or `.env.*`; run credential-dependent scripts with `bun --env-file=.env` and print results only, never values. Never visit a live site or broaden scoped R2 cleanup. No secrets/bearer links in evidence. No exception for diagnosis; report missing variable names/prerequisites to B instead.
- No commits, lifecycle commands, plan changes, peer communication or files under worktree `issues/`. Write return artifacts only under the authoritative leaf's implementation folder. These exclusions preserve narrow review scope, existing safety and B's phase ownership; only the revised-brief mismatch path can expand implementation scope, never convenience.

## 6. Ordered steps

1. Read the current sentence and confirm the empty-designation exception against the existing runner/test, before changing the doc (AC1).
2. Precisely edit the report-format paragraph in `README.md`; leave all other behavior/tests unchanged (AC1–2). Trivial prose correction needs no new test/red-green cycle; the review already established the concrete mismatch.
3. Inspect the repair diff, run the command below, retain its result under `<leaf>/implementation/worker-2-evidence/`, then complete the report (AC3).

Advisory size: 1 changed file, under 12 turns (at least four per file), plus waiting for the ~20-minute native suite; materially greater scope returns a mismatch, not a silent omission.

## 7. Commands

Resolved configured changed-test command only, supplied base and Node 24 retained for Playground:

```sh
mise exec node@24.21.0 -- env AKROGON_BASE=0a7ddf98806ede20a331cd2d68e073e89741648e bun --env-file=.env -e 'const p=Bun.spawn(["bash","-c",": \"${AKROGON_BASE:?AKROGON_BASE is required}\" && bun test"],{stdout:"inherit",stderr:"inherit",env:process.env}); process.exit(await p.exited)'
```

This repository resolves changed tests to the full Bun test invocation; do not invent a narrower replacement. Dependencies, Chromium, Node 24 and built plugin already exist in this worktree. Preserve test deadlines/criteria. B separately runs its full suite/typecheck; do not weaken tests for a transient failure. If the unchanged suite fails outside scope, report exact evidence and leave its repair decision to B.

## 8. Done-when, evidence and report

Only the README paragraph is corrected, the configured changed-tests result is known, and `<leaf>/implementation/worker-2-report.md` contains the following four contents with actual output/evidence. Existing native tests retain real headless Chromium traces/reports, no video; link the run summary emitted by the command rather than claiming new delivery evidence.

Changed files and reasons: <README.md paragraph and mismatch corrected>
Tests run: <exact command, pasted results, log and emitted summary path>
Known limitations: <documentation-only; unchanged runtime boundaries, any failure>
Unverified criteria: <criterion and why, or none>
