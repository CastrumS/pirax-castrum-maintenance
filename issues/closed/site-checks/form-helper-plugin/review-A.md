# Review A: form-helper-plugin

Slot A · check.review (initial, blind) · 2026-09-26

- Base: `93cf3b7f6b99f3a34be7f69c004345c439fa6a76`
- Reviewed head: `2e2105c37b199065a311b16ffc5797799fc50253` (worktree clean; `dist/pirax-form-test.zip` sha256 `d14c2acd…4002`, unchanged by this review)
- Debate: `no` (no positions/rebuttal expected). No `AREA.md` in the diff. `checks`/`advisory` empty.

## Verdict: `fix`

One blocking finding (done criterion + wrong doc claim). The production plugin itself looks correct against the plan; see notes.

## Findings

### F1 (Fix): plain `bun test` fails; tests depend on an external `--timeout` flag

- Done criteria: brief #5 "`bun test` passes"; AC8 "`bun test` passes real Playground-backed assertions"; plan "Concrete verification" lists `bun --env-file=<root>/.env test` without `--timeout`. `test/plugin/README.md:44` claims "plain `bun test` / `bun run test:plugin` works as well" — wrong claim.
- Cause: Bun 1.4.2's default per-test timeout is 5000 ms (probe: a 7 s hook/test fails at 5000 ms without `--timeout`). Several PHP-backed tests in `test/plugin/core.test.ts` have no explicit timeout (lines 237–424: parser, context, `wp_mail` transformation, bad redirect, never-marks). B's full run passed only because it used `--timeout 180000`; its own log shows 6.6 s and 10.3 s for two of them. No `bunfig.toml`/`setDefaultTimeout` exists.
- Reproduction (isolated `git archive 2e2105c` copy, node_modules symlinked, so B's worktree probes were not disturbed):
  `bun --env-file=/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/.env test test/plugin/core.test.ts`

  ```text
  (fail) wp_mail in marked context is redirected, stripped and tagged; ordinary mail is untouched [5000.22ms]
    ^ this test timed out after 5000ms.
  (fail) a bad redirect fails before marking and marked mail is never delivered to original recipients [5000.00ms]
    ^ this test timed out after 5000ms.
  (fail) the core never marks a request from query strings, cookies or arbitrary POST data [5000.00ms]
    ^ this test timed out after 5000ms.
  error: stop: Target page, context or browser has been closed   (cascade in closeBrowser, core.test.ts:427)
  (fail) deactivation unschedules, uninstall is guarded and removes options and owned events [2.71ms]
   5 pass
   4 fail
  Ran 9 tests across 1 file. [100.62s]
  ```
- Repair: give every Playground-backed test/hook an adequate timeout (e.g. one `[test] timeout` in a root `bunfig.toml`, or explicit per-test timeouts incl. `harness.test.ts:33` at 3.4 s), then run the literal `bun --env-file=<root>/.env test` and record it in the report; keep or correct the README claim accordingly.

### N1 (Nit): conditional module loading is dead flexibility that fails open

`pirax-form-test.php` loads `compatibility/gravity-forms/fluent-forms/cleanup` only `if is_readable(...)`. The build allowlist always ships all of them, so this is a development leftover (YAGNI). If a file were ever missing, marked submissions would silently be treated as ordinary (client mail, CAPTCHA, feeds) instead of failing. Plain `require_once` is simpler and fails loudly.

### N2 (Nit): lesson history slightly outdated / evidence not durable

`learnings/history/2026-09-25-form-helper-plugin.md` "Repair" says queued job context reads the entry meta; the final code reads the id stamped in the job payload first (worker 6) with meta fallback. Its evidence path `artifacts/plugin/adapters-2026-09-25T14-59-26-211Z/` is gitignored and disappears with the worktree. Claim itself verified against `implementation/worker-3.md:161-165`.

## Verification notes (no further findings)

- Plugin code checked against live GF 3.1.2 (`/tmp/pirax-gf-plan-KBir8t`) and FF 6.2.14 (`/tmp/pirax-fluentform-plan`) sources:
  - GF: `gform_pre_validation` → field CAPTCHA override → `gform_validation` rejection → four-level `pre_process_feeds` emptied → generic+form `gform_is_asynchronous_notifications_enabled` forced false → `GFAPI::delete_entry` at `gform_after_submission` after `send_form_submission_notifications`. Correct order.
  - FF: `before_form_validation` precedes `validateRestrictions` (`is_form_renderable`, where `ff_reject` throws) and `validateReCaptcha` (`disable_captcha` 'recaptcha'); `before_form_actions_processing` precedes `submission_inserted`/globalNotify and `integration_feed_before_parse` precedes serialization of queued `data`; `integration_action_result` updates the row by `scheduled_action_id`; retries select `failed` with `retry_count < 4` (matches `FF_MAX_RETRIES`); `Submission::remove` deletes `submission_action` rows. Shutdown-deferred deletion addresses the `is_form_action_fired` write after `submission_inserted`.
  - Mail: late `wp_mail` transform + earliest `pre_wp_mail` guard fail closed on config errors or later tampering; post-`wp_mail` rewrites are a documented limitation.
  - Sweep: id cursor paging, escaped LIKE only narrows, decoded field values decide, GF UTC / FF site-local cutoffs, native deletion, pending AS actions unscheduled, active processing deferred.
- Tests compared with AC1–AC8: real uploads/sessions/nonces, positive unmarked feed controls, both CAPTCHA negatives with a dummy response reaching siteverify, concrete direct-dispatch unsupported path, FF queue/retry/throw/rotation/legacy batch, sweep boundary/wildcards/timezone/paging. No mocks of the unit under test; only the `pre_wp_mail` observer and siteverify answer (per design).
- Docs: root `README.md`, `plugin/pirax-form-test/README.md` and `test/plugin/README.md` read against the code; all named paths exist; only the `test/plugin/README.md:44` claim is wrong (F1).
- The exact GF/FF version gate means routine updates block marked submissions until re-audit; this is a recorded plan decision (implementation note D8) and documented, so not a finding.
- No `.env` file was opened; credentials were loaded only through `bun --env-file`.

---

## Re-check after check.fix (round 1) — 2026-09-26

- Repair diff inspected only: `2e2105c37b199065a311b16ffc5797799fc50253..034accb2cdacdc428a024de38553471ebef56d55` (13 files, +240/−36). Worktree clean.
- Verdict: **`ready`**.

### Earlier findings

- **F1 (Fix) — resolved.** All five suites call `setDefaultTimeout(180_000)` (incl. new `review-regressions.test.ts`); `test:plugin` no longer passes `--timeout`; `test/plugin/README.md` claim now matches. Evidence: B's literal `bun --env-file=<root>/.env test` (no timeout flag) → 38 pass / 0 fail, `implementation/repair-1-full-suite.log`; the tests that previously timed out (6.7 s, 10.2 s) pass there. No rerun by A: the log covers the exact command at the repaired head.
- **N1 — resolved.** Bootstrap `require_once`s every module unconditionally.
- **N2 — resolved.** History file has a dated follow-up and durable evidence references.

### Repair-introduced defects: none

- `mail.php`: header names are now compared as `trim(explode(':', trim($line), 2)[0])`, matching `wp_mail()`'s own parsing; `guard_mail` reuses `transform_mail`, so both stay consistent. `array_filter` keys are re-indexed by the existing `array_values`. Regression observes the real PHPMailer envelope with the production guard installed (only the harness observer removed, transport stopped in `phpmailer_init`) — not a mock of the unit.
- `cleanup.php`: FF sweep matches decoded stored response values minus FF's native `Helper::getWhiteListedFields()` request metadata, instead of current form inputs; malformed JSON yields no match. Still token-literal, still native deletion; regression covers renamed/removed/nested fields plus young/ordinary/metadata-only/active controls. `ff_field_values()` removed with no remaining references.
- Docs changed with the behavior (plugin README header/sweep wording, test README suite table and timeout note); claims match the code.

---

## Merge — 2026-09-26

- Rebase target: `origin/main` = `0663984e0d80887123298bd43d6768e1cc2cbbf9` (checker-foundation landed). Old base `93cf3b7`; prior reviewed head `034accb`; resolved head `ffe6779` (commits `7fb4a9f`, `ffe6779`). Refreshed `AKROGON_BASE` = `0663984`.
- Conflicts (commit 1 only; commit 2 applied cleanly), both true sides kept:
  - `package.json`: union of foundation scripts/devDependencies (`test`, `typecheck`, `store:selftest`, `@types/bun`, `typescript`) and plugin ones; `trustedDependencies` kept.
  - `.gitignore`: foundation `runs/` plus `artifacts/`, `dist/`, `.cache/`.
  - `bun.lock`: regenerated with `bun install` from the merged manifest (pins unchanged: `@wp-playground/cli@3.1.55`, `playwright@1.63.0`).
  - `README.md`: foundation README kept; added a "Pirax Form Test plugin" section (links to plugin/test READMEs, build/test commands, credentials) and noted in the `bun test` row that it now includes the Playground plugin suites (`bunfig.toml`'s `issues/**` exclusion still keeps worktree copies out).
- `git range-diff 93cf3b7..034accb 0663984..ffe6779`: commit 1 differs only in the conflict files above; commit 2 is unchanged.
- Checks: configured `checks` empty. Because integration changed, ran `bun run typecheck` (clean) and the literal full suite `bun --env-file=<registered repo>/.env test` on `ffe6779`: **86 pass / 0 fail, 9 files, 637.79 s**, exit 0 (`merge-A-full-suite.log` beside this review). No advisory commands.

### Push attempt 1 rejected (non-fast-forward) → second rebase — red

- `git push origin HEAD:main` of `ffe6779` was refused: main advanced to `9140cdd9647d14e91ebd0565b5f1ef1ee55fff07` (visual-health-check: `f2abb31`, `2aa4e09`, `9140cdd`). Nothing was pushed.
- Rebase target: `origin/main` = `9140cdd`. Prior reviewed head `034accb`; rebased head **`67ab9bd`** (`85d5750`, `67ab9bd`), local branch only.
- Conflicts resolved (commit 1; commit 2 applied cleanly), both true sides kept:
  - `package.json`: visual scripts/deps plus `build:plugin`, `test:plugin`, `node-gyp`, `trustedDependencies`; `playwright` pinned `1.63.0` (inside upstream `^1.63.0`). `bun.lock` regenerated (`playwright@1.63.0`, `@wp-playground/cli@3.1.55`, `node-gyp@13.0.2`).
  - `learnings/LESSONS.md`: both lesson lines.
  - `README.md`: upstream README plus the "Pirax Form Test plugin" section. Upstream documented `bun --no-env-file test` as credential-free; with the plugin suites under `test/` that command would now fail at plugin preflight, so the row now reads `bun --no-env-file test tests` (upstream's credential-free set, all in `tests/`) and a new `bun test` row covers the plugin suites and their credentials.
- `git range-diff 93cf3b7..034accb 9140cdd..67ab9bd`:

```text
1:  2e2105c ! 1:  85d5750 feat: add safe WordPress form test helper and Playground verification
2:  034accb ! 2:  67ab9bd fix: close review gaps in mail isolation and stale entry cleanup
```

- **Red:** main's `tsconfig.json` now includes `test` (`"include": ["src", "scripts", "tests", "test"]`, strict + `noUncheckedIndexedAccess`). `bun run typecheck` passes on `9140cdd` but fails on `67ab9bd` with 28 errors, all in `test/plugin/` (adapters 18, core 5, safety 2, harness.test 1, harness.ts 1, playground.ts 1). The full suite was not rerun at `67ab9bd` because it is already red.

```text
$ tsc --noEmit
test/plugin/adapters.test.ts(187,93): error TS2769: No overload matches this call.
  The last overload gave the following error.
    Argument of type 'true' is not assignable to parameter of type 'undefined'.
test/plugin/adapters.test.ts(221,93): error TS2769: No overload matches this call.
  The last overload gave the following error.
    Argument of type 'true' is not assignable to parameter of type 'undefined'.
test/plugin/adapters.test.ts(236,10): error TS2532: Object is possibly 'undefined'.
test/plugin/adapters.test.ts(346,98): error TS2769: No overload matches this call.
  The last overload gave the following error.
    Argument of type '"pirax-local-secret-key"' is not assignable to parameter of type 'undefined'.
test/plugin/adapters.test.ts(491,12): error TS2532: Object is possibly 'undefined'.
test/plugin/adapters.test.ts(498,12): error TS2532: Object is possibly 'undefined'.
test/plugin/adapters.test.ts(508,12): error TS2532: Object is possibly 'undefined'.
test/plugin/adapters.test.ts(527,183): error TS18048: 'b' is possibly 'undefined'.
test/plugin/adapters.test.ts(534,120): error TS18048: 'b' is possibly 'undefined'.
test/plugin/adapters.test.ts(678,52): error TS2345: Argument of type '(number | undefined)[]' is not assignable to parameter of type 'number[]'.
  Type 'number | undefined' is not assignable to type 'number'.
    Type 'undefined' is not assignable to type 'number'.
test/plugin/adapters.test.ts(680,35): error TS2345: Argument of type '{ [k: string]: string; }' is not assignable to parameter of type 'Record<string, "ff" | "gf">'.
  'string' index signatures are incompatible.
    Type 'string' is not assignable to type '"ff" | "gf"'.
test/plugin/adapters.test.ts(681,51): error TS2345: Argument of type '(number | undefined)[]' is not assignable to parameter of type 'number[]'.
  Type 'number | undefined' is not assignable to type 'number'.
    Type 'undefined' is not assignable to type 'number'.
test/plugin/adapters.test.ts(684,24): error TS2322: Type 'number | undefined' is not assignable to type 'number'.
  Type 'undefined' is not assignable to type 'number'.
test/plugin/adapters.test.ts(684,41): error TS2322: Type 'number | undefined' is not assignable to type 'number'.
  Type 'undefined' is not assignable to type 'number'.
test/plugin/adapters.test.ts(685,25): error TS2322: Type 'number | undefined' is not assignable to type 'number'.
  Type 'undefined' is not assignable to type 'number'.
test/plugin/adapters.test.ts(686,25): error TS2322: Type 'number | undefined' is not assignable to type 'number'.
  Type 'undefined' is not assignable to type 'number'.
test/plugin/adapters.test.ts(689,91): error TS2769: No overload matches this call.
  The last overload gave the following error.
    Argument of type 'true' is not assignable to parameter of type 'undefined'.
test/plugin/adapters.test.ts(693,28): error TS2345: Argument of type '{ [k: string]: string; }' is not assignable to parameter of type 'Record<string, "ff" | "gf">'.
  'string' index signatures are incompatible.
    Type 'string' is not assignable to type '"ff" | "gf"'.
test/plugin/core.test.ts(178,47): error TS2345: Argument of type '{ _wpnonce?: undefined; pirax_form_test_redirect: string; pirax_form_test_clear: string; } | { _wpnonce: string; pirax_form_test_redirect: string; pirax_form_test_clear: string; }' is not assignable to parameter of type 'Record<string, string>'.
  Type '{ _wpnonce?: undefined; pirax_form_test_redirect: string; pirax_form_test_clear: string; }' is not assignable to type 'Record<string, string>'.
    Property '_wpnonce' is incompatible with index signature.
      Type 'undefined' is not assignable to type 'string'.
test/plugin/core.test.ts(284,13): error TS2769: No overload matches this call.
  The last overload gave the following error.
    Argument of type '{ state: string; id: string; reason: null; }' is not assignable to parameter of type 'undefined'.
test/plugin/core.test.ts(424,10): error TS2532: Object is possibly 'undefined'.
test/plugin/core.test.ts(425,10): error TS2532: Object is possibly 'undefined'.
test/plugin/core.test.ts(426,10): error TS2532: Object is possibly 'undefined'.
test/plugin/harness.test.ts(93,133): error TS2769: No overload matches this call.
  The last overload gave the following error.
    Argument of type 'true' is not assignable to parameter of type 'undefined'.
test/plugin/harness.ts(124,48): error TS2345: Argument of type 'TextDecoderStream' is not assignable to parameter of type 'ReadableWritablePair<string, Uint8Array<ArrayBufferLike>>'.
  Types of property 'writable' are incompatible.
    Type 'WritableStream<BufferSource>' is not assignable to type 'WritableStream<Uint8Array<ArrayBufferLike>>'.
      Type 'BufferSource' is not assignable to type 'Uint8Array<ArrayBufferLike>'.
        Type 'ArrayBuffer' is missing the following properties from type 'Uint8Array<ArrayBufferLike>': BYTES_PER_ELEMENT, buffer, byteOffset, copyWithin, and 33 more.
test/plugin/playground.ts(10,89): error TS2345: Argument of type 'string | undefined' is not assignable to parameter of type 'string'.
  Type 'undefined' is not assignable to type 'string'.
test/plugin/safety.test.ts(146,99): error TS2769: No overload matches this call.
  The last overload gave the following error.
    Type 'number | undefined' is not assignable to type 'number | "ff" | "ff-direct" | "gf" | "gf-direct"'.
      Type 'undefined' is not assignable to type 'number | "ff" | "ff-direct" | "gf" | "gf-direct"'.
test/plugin/safety.test.ts(182,12): error TS2532: Object is possibly 'undefined'.
error: script "typecheck" exited with code 1
```

- Repair criterion for check.fix: at `67ab9bd` (rebased onto `9140cdd`), `bun run typecheck` exits 0 without narrowing `tsconfig.json`, and the full `bun --env-file=<registered repo>/.env test` stays green. Work from the rebased local branch `form-helper-plugin` (already contains the conflict resolutions above).

---

## Re-check after merge-integration repair (check.fix round 2) — 2026-09-26

- Repair diff only: `67ab9bd..08fa818` (8 files, +50/−24) on `origin/main` = `9140cdd` (unchanged since). Worktree clean.
- Verdict: **`ready`**.
- Earlier red resolved: `bun run typecheck` exits 0 at `08fa818` (re-run by A); `tsconfig.json`, `bunfig.toml`, package/lock and production plugin files are untouched.
- Changes are type-only in `test/plugin/`: explicit `h.php<T>` result types (the `unknown` default kept, no `any`), `!` on array indexes that earlier assertions already establish, a typed `seed<L>` replacing an `as any`, `BufferSource` for the child stream, a non-null assertion on argv. The only behavior change is a clearer thrown error if an expected queued job is missing. No expected values or assertions were removed.
- B's evidence: full `bun --env-file=<registered repo>/.env test` at the repaired head, 137 pass / 0 fail across 14 files (`implementation/merge-repair-full-suite.log`), including upstream suites and all 38 plugin tests.
- Nit (non-blocking): the new `learnings/LESSONS.md` line sits above the existing entries with an extra blank line; purely cosmetic ordering.

### Push — 2026-09-26

- `origin/main` still `9140cdd` at fetch; head `08fa818` already rebased on it, so no rebase and no integration change. Reused unchanged evidence: A's `bun run typecheck` (exit 0) and B's full `bun test` 137/137 at `08fa818`. Configured `checks` empty.
- `git push origin HEAD:main`: `9140cdd..08fa818` fast-forward; `git merge-base --is-ancestor 08fa818 origin/main` confirmed.
