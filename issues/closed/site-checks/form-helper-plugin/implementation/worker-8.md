# Worker 8: merge integration, strict TypeScript compatibility

Worktree `issues/worktrees/form-helper-plugin`, started at `67ab9bd8d9b119e79440ae596adffe913701139c` with base `9140cdd9647d14e91ebd0565b5f1ef1ee55fff07`. Edits are uncommitted. I did not run the full repository suite.

## Result

- `bun run typecheck` now exits 0 over the unchanged tsconfig scope `["src", "scripts", "tests", "test"]`, with `strict` and `noUncheckedIndexedAccess` still on. At the starting head it failed with the same 28 diagnostics as B's `merge-repair-typecheck-red.log`.
- 6 files changed, 26 insertions and 24 deletions, all under `test/plugin/`. There are no production PHP, dependency, lockfile, tsconfig, bunfig, README or `.gitignore` changes.
- Only one change affects runtime, and only on a failure path: a guard in one adapters test (see below).
- Two edits change the emitted JavaScript but not the values or their order: `special` in the sweep test is built directly from the same four ids, and the core nonce cases moved into an annotated `badNonces` const.
- Everything else is type-only and erased at runtime: explicit generic arguments, `!` after established invariants, `as const`, the typed seed signature and one parameter type. The stream decoding logic is unchanged.
- Targeted plugin suites: 38 pass / 0 fail, 680 `expect()` calls across 5 files, exit 0 in 644.68 s, with no `--timeout`. I later renamed a variable in `core.test.ts`, so I re-ran that suite alone on its final content: 9 pass / 0 fail, 139 `expect()` calls, exit 0.

## Criteria

1. **Done.** `bun run typecheck` exits 0 and the configuration files are unchanged (`git diff --quiet HEAD -- tsconfig.json package.json bun.lock bunfig.toml README.md .gitignore plugin/ scripts/` succeeds). I added no `ts-ignore`, `ts-nocheck`, excludes or option changes. Red→green output is below.
2. **Done.** All five plugin suites pass with the brief's command and no `--timeout`: 38 pass / 0 fail, 680 `expect()` calls. That matches the 38 tests / 680 expectations of B's round-1 plugin run, so no assertion was lost or added (the new guard is a `throw`, not an `expect`). No assertion, expected value, timeout or skip changed. The suites still start real Playground WordPress with real GF/FF, wp-admin authorization and native queues.
3. **Done.** Each explicit type comes from the PHP code that produces the value (details below). No new `any` or `unknown` casts. The change removes one existing `items as any` (the sweep seed), because the seed's labels are now typed. Each `!` follows an assertion that already fixes the array length, or a checked `ok`. Where no such invariant exists (FF job `b`), there is an explicit guard. Where a `!` could have let an assertion pass vacuously (seeded ids), I used a typed result instead.
4. **Done (type-only).** `eachLine()`'s body is unchanged. `pipeThrough(new TextDecoderStream())` still decodes chunk-split UTF-8, keeps complete lines and flushes the final unterminated `buffer`. Only its parameter type changed, so per the brief the evidence is the compiler, not new behavioral coverage. The real Node child's stdout/stderr bridge ran through it in every suite of the targeted run.
5. **Done.** I ran `findSecret()` from `test/plugin/artifacts.ts` with the registered `.env`, printing only counts. It found 0 hits for the token or the GF ZIP path (raw, URL-encoded or JSON-escaped) in the six artifact directories from these runs, and `redact()` counts are 0 for all four console logs. I opened no environment file. No production PHP, dependency or user-facing interface changes. No documentation is stale: `eachLine` and `seed` are internal, and the documented `Harness.php<T = unknown>` interface is unchanged, including its default.

## Diagnostics and how each was fixed

Line numbers match B's red log, i.e. before the edits. Two lines were inserted (core after 176, adapters after 525), so later lines in those files are now one higher.

**Six TS2769 errors on `h.php()` expectations** (adapters 187, 221, 346, 689; core 284; harness.test 93):
- Cause: `Harness.php<T = unknown>` is generic only in its return type. Inside `expect(await h.php(...))`, TypeScript infers `T` from the contextual type of Bun's first `expect` overload, `(actual?: never): Matchers<undefined>` (bun-types `test.d.ts:632`). That makes `T` `never`, so the matcher becomes `toBe(expected: undefined)`.
- Fix: explicit result types taken from the PHP.
  - `(bool) get_option(...)`, `wp_next_scheduled(...) > time()` and `in_array(..., true)` → `boolean`.
  - `get_option('_fluentform_reCaptcha_details')['secretKey']` → `string` (the fixture sets it).
  - `\Pirax\FormTest\parse()` → `{ state: string; id: string | null; reason: string | null }`, per `plugin/pirax-form-test/includes/marker.php:9` and lines 59–63.
- This follows the typed `h.php<T>` calls already in `review-regressions.test.ts`. The `T = unknown` default is kept.

**Indexed rows after an assertion that fixes the length** (adapters 236, 491, 498, 508; core 424–426; safety 182). Each gets `x[i]!`:
- adapters 236 `asyncFeed[0]`: line 235 asserts `["gf"]`.
- adapters 491 and safety 182 `markedMail[0]`: the previous `toEqual` pins exactly one subject.
- adapters 498 `afterRunner[1]`: `["success", "failed"]`.
- adapters 508 `retried[0]`: one subject.
- core 424–426 `mail[0]`: `toHaveLength(1)`.

The `!` is erased at runtime. A missing row fails the preceding assertion first, and the property read would throw anyway, so no failure is hidden. This is the file's existing style (`result.insertId!`, `failed.at(-1)!`).

**safety 146, `ordinary.insertId`:** `ffSubmit` returns `insertId: ok ? Number(...) : undefined` (safety.test.ts:87), and line 144 asserts `ordinary.ok`. The value is still compared against the native feed-ledger entry, so an absent id would still fail. The same file already uses `ordinary.insertId!` at lines 166 and 221.

**adapters 527/534, FF job `b` from `const [, b] = await ffRows([m])`:** that test asserts no job count before using it, so there is no invariant to rely on. I added `if (!b) throw new Error("expected two queued email jobs for the marked FF entry")`. This is the only runtime-visible change; it narrows the type and makes a missing job fail with a clear message instead of a TypeError. The happy path is unchanged.

**Seeded ids (adapters 678, 681, 684×2, 685, 686) and the plugin map (680, 693):**
- `seed()`'s PHP sets `$ids[$item['label']] = (int) $id` for every item, or throws. So the result is exactly one id per input label.
- It is now typed `<L extends string>(items: readonly { label: L; … }[]) => Promise<Record<L, number>>`. `exists()` is unchanged.
- In the first sweep test, the 240 bulk items built inside `Array.from` callbacks sat outside the outer `as const`. Their `plugin` widened to `string`, which caused the `Object.fromEntries` → `{ [k: string]: string }` errors, and the test used `seed(items as any)` to get past it.
- `as const` on the callbacks' objects gives `plugin: "gf" | "ff"` and labels `` `gfBulk${number}` `` / `` `ffBulk${number}` ``. So `seed(items)` needs no cast, `ids.ffMarkedOld` is `number`, and `plugin` is `{ [k: string]: "gf" | "ff" }`.
- `special` changed from `[labels].map((k) => ids[k])` to `[ids.ffMarkedOld, ids.ffOrdinaryOld, ids.ffActiveOld, ids.ffStaleOld]`: same values, same order.
- Why not `!`: at line 684, `expect(await ffRows([ids.ffMarkedOld, ids.ffStaleOld])).toEqual([])`, a missing label would reach PHP as `null`, become `intval` 0, match no rows and pass without checking anything. With the typed result, a wrong label fails to compile instead.
- Probe, reverted afterwards: `ids.ffStaleOLD` gives `TS2551 Property 'ffStaleOLD' does not exist on type 'Record<"ffActiveOld" | "ffMarkedOld" | … | `ffBulk${number}` | `gfBulk${number}`, number>'. Did you mean 'ffStaleOld'?`, and `empty.gfOldTypo` gives `TS2339`. After restoring the file, typecheck exits 0.

**core 178, nonce cases:**
- `[{}, { _wpnonce: "0123456789" }]` is inferred as the normalized union `{ _wpnonce?: undefined } | { _wpnonce: string }`, and its optional `undefined` does not fit `Record<string, string>`.
- I tried `as const` and `satisfies Record<string, string>[]`; both still produced that union.
- Fix: an annotated `const badNonces: Record<string, string>[]`, the same pattern as the `invalid` cases just above it. The same two cases (missing nonce, forged nonce) run in the same order.

**harness.ts 124, stream types:**
- With lib `DOM` loaded, bun-types defers `TextDecoderStream` to DOM's declaration (`globals.d.ts:42–44, 1799–1802`). Its `writable` is `WritableStream<BufferSource>`.
- `pipeThrough` on a `ReadableStream<Uint8Array>` needs a `WritableStream<Uint8Array>`, and TypeScript rejects `BufferSource` there.
- Fix: `eachLine`'s parameter is now `ReadableStream<BufferSource>`, exactly the chunk type `TextDecoderStream` decodes.
- Bun's `Subprocess.stdout`/`stderr` type is `ReadableStream<Uint8Array<ArrayBuffer>>` (`bun.d.ts:7795`), which is assignable. There are no casts and the body is unchanged. `eachLine` has only those two callers (harness.ts:174).

**playground.ts 10, `JSON.parse(process.argv[2])`:**
- Fix: `process.argv[2]!`, which is erasable syntax.
- It relies on this invariant: the only spawner, `startHarness()`, always passes `JSON.stringify({ ffZip, muPlugin, wp, php })` as argv[2].
- If the argument were ever missing, `JSON.parse` would still throw, and the harness would report "Playground exited … before it was ready" with the redacted log tail. Nothing is hidden.
- Node 26.8.2's type stripping ran the file in every suite of the targeted run.

## Red → green compiler output

Red at `67ab9bd`: `bun run typecheck` exit 1 with 28 `error TS` lines (adapters 18, core 5, safety 2, harness.test 1, harness.ts 1, playground.ts 1). `diff` against B's `implementation/merge-repair-typecheck-red.log` found them identical.

Green, after the edits (same command, unchanged tsconfig):

```text
$ tsc --noEmit
exit=0
```

`git diff --check` exit 0.

## Targeted suites

Bun prints only the summary when stdout is not a TTY.

```text
$ AKROGON_BASE=9140cdd9647d14e91ebd0565b5f1ef1ee55fff07 bun --env-file=/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/.env test test/plugin
bun test v1.4.2 (744846f84)

 38 pass
 0 fail
 680 expect() calls
Ran 38 tests across 5 files. [644.68s]
exit=0
```

Re-run of core after renaming `forged` to `badNonces`. The core suite had already loaded during the full run when I made that rename.

```text
$ AKROGON_BASE=9140cdd9647d14e91ebd0565b5f1ef1ee55fff07 bun --env-file=/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/.env test test/plugin/core.test.ts
 9 pass
 0 fail
 139 expect() calls
Ran 9 tests across 1 file. [102.82s]
exit=0
```

Artifact directories in the worktree (git-ignored; 0 secret hits each):
- `artifacts/plugin/review-regressions-2026-09-26T09-50-27-055Z/`
- `artifacts/plugin/harness-smoke-2026-09-26T09-51-13-670Z/`
- `artifacts/plugin/core-2026-09-26T09-52-03-572Z/`
- `artifacts/plugin/safety-2026-09-26T09-53-51-072Z/`
- `artifacts/plugin/adapters-2026-09-26T09-55-58-132Z/`
- `artifacts/plugin/core-2026-09-26T10-01-28-904Z/` (the core re-run)

Each holds `manifest.json`, `mail.jsonl`, `feeds.jsonl`, `entries.json`, `network.jsonl`, `playground.log` and the scenario `.trace.zip` files. The adapters and safety directories also have `queue-states.jsonl`.

## Changed files and reasons

- `test/plugin/adapters.test.ts`:
  - typed `h.php<boolean|string>` expectations;
  - `!` on rows whose length an assertion already fixes;
  - explicit guard for job `b`;
  - label-typed `seed()` result, with `as const` bulk items replacing `items as any`;
  - `special` built from typed ids.
- `test/plugin/core.test.ts`: annotated nonce cases; typed `parse()` result; `mail[0]!` after `toHaveLength(1)`.
- `test/plugin/harness.test.ts`: `h.php<boolean>`.
- `test/plugin/safety.test.ts`: `ordinary.insertId!` after an asserted `ok`; `markedMail[0]!` after the one-subject assertion.
- `test/plugin/harness.ts`: `eachLine` parameter typed `ReadableStream<BufferSource>` to match DOM `TextDecoderStream`. No runtime change.
- `test/plugin/playground.ts`: `process.argv[2]!`, relying on the harness always passing the argument. Erasable for Node's type stripping.

## Tests run

- `bun run typecheck`: exit 1 with 28 errors at the starting head (identical to B's red log), then exit 0 after the edits. The seed-label probe also gave the expected TS2551/TS2339 errors, and typecheck exits 0 after reverting it.
- `AKROGON_BASE=9140cdd9647d14e91ebd0565b5f1ef1ee55fff07 bun --env-file=/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/.env test test/plugin` (no `--timeout`): 38 pass / 0 fail, 680 `expect()` calls across 5 files, exit 0 in 644.68 s. The same command on `test/plugin/core.test.ts` after the rename: 9 pass / 0 fail, 139 `expect()` calls, exit 0.
- `git diff --check`: exit 0.
- Secret scan: `findSecret()` found 0 hits in all six artifact directories, and `redact()` counts are 0 in all four console logs (red and green typecheck, the targeted run, the core re-run).

## Known limitations

- The `!` sites rely on invariants documented above: a preceding assertion, `ffSubmit`'s `ok` → `insertId`, or the harness always passing argv[2]. They add no runtime checks of their own.
- `Harness.php<T>` remains an unchecked cast of decoded JSON. The explicit `T` values describe the PHP code but are not validated at runtime; the existing assertions do that.
- The new `b` guard's `throw` has never executed. It fires only if FF queues fewer than two email jobs for a marked entry. The normal path ran and passed in the adapters suite.
- Per the brief, I did not run the full-repository `bun --env-file=<registered-repo>/.env test`; B owns that run and the commit.

## Unverified criteria

None. All five criteria were verified with the compiler, the targeted plugin suites and the secret scan above.
