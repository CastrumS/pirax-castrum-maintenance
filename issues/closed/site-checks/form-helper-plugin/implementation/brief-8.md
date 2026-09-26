# Unit 8 — merge integration: strict TypeScript compatibility

## 1. Goal

Repair merge A's compiler finding for D10/D12 and AC8 at rebased head `67ab9bd8d9b119e79440ae596adffe913701139c`, base `9140cdd9647d14e91ebd0565b5f1ef1ee55fff07`. The newer main includes `test/` in strict TypeScript checking with `noUncheckedIndexedAccess`; all 28 new errors are in this leaf's plugin test/harness files. Keep the real WordPress tests and production behavior unchanged.

Work only in `/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/worktrees/form-helper-plugin`. Authoritative artifacts belong to `/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/open/site-checks/form-helper-plugin` (LEAF below), outside this worktree's `issues/`.

## 2. Numbered acceptance criteria

1. `bun run typecheck` exits 0 over the unchanged tsconfig scope `src/scripts/tests/test`, preserving strictness, `noUncheckedIndexedAccess`, and existing dependencies. B already reproduced the 28-error red at current head in `LEAF/implementation/merge-repair-typecheck-red.log`.
2. Preserve every native acceptance assertion, real authorization, request/queue isolation, redaction, runtime timeout and safety regression. All plugin suites pass via the targeted command below, without `--timeout`; no skips or replacement with mocks.
3. Types reflect actual PHP result and fixture shapes rather than broad new `any`, unsafe global assertions, or weakened expected values. Handle possibly absent arguments/indexed values appropriately; an assertion may rely on an already-established runtime invariant, but must not conceal a missing-entry failure.
4. Any runtime change to stream decoding preserves complete lines, chunk-split UTF-8 and final unterminated output. If nontrivial runtime logic changes, leave one small meaningful runnable regression (reuse existing helper/test layout). A localized type-boundary correction that changes no runtime behavior needs compiler evidence, not invented behavioral coverage.
5. All retained evidence stays secret-free. No production PHP changes, dependency changes or user-facing interface changes. Update a doc only if an actual documented interface becomes stale.

## 3. Read-first list

- `/home/rudi/.pi/agent/skills/implement-issue/ponytail.md`.
- LEAF `plan.md` (D10–D12, AC8, final merge integration notes), `design.md`, and `review-A.md` final merge finding.
- LEAF `implementation/merge-repair-typecheck-red.log` (exact 28 diagnostics).
- Worktree `tsconfig.json`, `package.json`, `bunfig.toml`, `test/plugin/README.md`.
- `test/plugin/harness.ts`, `test/plugin/playground.ts`, `test/plugin/{adapters,core,harness,safety}.test.ts`; inspect `review-regressions.test.ts` for existing explicitly typed `h.php<T>` calls to copy.
- For a standard-library mismatch, inspect installed Bun/TypeScript declarations instead of guessing API types. Do not read any `.env` or `.env.*` file.

## 4. Change list and needed interfaces

- `test/plugin/adapters.test.ts`: 18 errors: untyped `h.php()` expectations, indexed mailbox/entry rows, possibly absent batch counts/seeded IDs and inferred `Object.fromEntries` plugin values wider than `"gf" | "ff"`.
- `test/plugin/core.test.ts`: 5 errors: nonce-case objects inferred with optional undefined incompatible with `Record<string,string>`; untyped parser result expectation; mail indexes.
- `test/plugin/harness.test.ts`: untyped boolean PHP result.
- `test/plugin/safety.test.ts`: possibly absent seeded ID and indexed email.
- `test/plugin/harness.ts`: `stream.pipeThrough(new TextDecoderStream())` mismatch between Bun byte-stream and DOM writable declarations. Keep the stdin/stdout native-PHP bridge and redaction semantics. Use a minimal stdlib-compatible solution.
- `test/plugin/playground.ts`: `JSON.parse(process.argv[2])` accepts a possibly absent argument. Keep erasable TypeScript compatible with Node's type-stripping invocation.
- Existing `Harness.php<T = unknown>(code: string): Promise<T>` already supports explicit PHP result typing. Preserve that generic default rather than turning it into `any`.
- Preserve the merge's package/lock/README/ignore resolutions, including root bunfig's `issues/**` exclusion. The current production ZIP/build allowlist and PHP files are out of scope.

## 5. Do-not, reasons and exceptions

- Never open, print, edit or write `.env`/`.env.*`; load needed values only via `bun --env-file=/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/.env ...` and print results, never values. Named credentials `GRAVITY_FORMS_ZIP` and `FORM_TEST_TOKEN` were presence-checked by B. Scrub failures/artifacts before exposing them.
- Do not weaken compiler options, excludes, assertions, tests or timeouts, or add `ts-ignore`/`ts-nocheck`; that would hide the integration defect. Avoid broad new `any` or `unknown` double casts. Existing unrelated casts are not a cleanup assignment.
- No real delivery, live-site, mailbox, R2, security-plugin operations, full suite, commits, rebases, lifecycle commands or code writes outside this worktree. B owns final verification/commit/handoff, and the narrow repair must preserve the rebased integration.
- Return a mismatch with concrete interface/scale evidence rather than changing scope or public interfaces. Only a revised brief from B authorizes an exception. These exclusions preserve security, test meaning and worker ownership; no other exception is implied.

## 6. Ordered steps

1. Read the listed files and red diagnostics; trace PHP result/seed/index invariants and the stream types (criteria 1–4). Derive any needed behavioral regression before changing nontrivial logic.
2. Repair the listed test/harness files with precise types and minimal shared fixes. Run `bun run typecheck` as the explicit compiler acceptance check and retain its exit/result. Do not alter tsconfig or dependencies (criteria 1, 3, 4).
3. Run the targeted plugin suites in section 7; repair failures inside this scope, retaining native/browser evidence (criteria 2, 4, 5). B runs the separate whole-repository suite later.
4. Review diff/check whitespace and secret scans; document any real interface/doc impact and return the section-8 report (criterion 5).

Advisory size: about 7 existing files, optionally one small helper regression, under 45 turns. Beyond that return an evidenced mismatch, not a silent cutoff.

## 7. Commands

Resolved changed-tests command (the shared harness affects all five plugin suites, but not upstream `tests/`):

```sh
AKROGON_BASE=9140cdd9647d14e91ebd0565b5f1ef1ee55fff07 bun --env-file=/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/.env test test/plugin
```

## 8. Done-when, evidence and report

Write `LEAF/implementation/worker-8.md` with each criterion's disposition, concrete type/shape reasoning, red→green compiler output, targeted test results and sanitized artifact paths. Do not run the full repository suite. Distinguish runtime changes from type-only corrections; report any unverified behavior explicitly. Leave all edits uncommitted.

Changed files and reasons: <paths and why>
Tests run: <commands and results, including compiler acceptance and targeted suite>
Known limitations: <limitations or none known>
Unverified criteria: <criterion and why, or none>
