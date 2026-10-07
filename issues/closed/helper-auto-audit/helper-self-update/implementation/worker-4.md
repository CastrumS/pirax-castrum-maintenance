# Worker 4 — release hardening (unit 4)

Commit: `078b228` (detached HEAD in worktree `issues/worktrees/helper-self-update-u4`, parent `a78d04c` = unit 3).

The configured changed command at `078b228` exited 0: **271 pass, 0 fail**, 24 files, 3586 expects, 2744.64s. B's `lane-after-u3` run was running on the same machine at the same time.

## Interface notes for B
- `remoteTag()` and its signature are unchanged, and the preflight order (seed, key match, clean source, local tag, read-only remote lookups) is unchanged.
- An invalid source version now fails with exactly `pirax-form-test.php: VERSION is not a stable dotted numeric version`. No source value is interpolated, and every other source-parse error was already name-only.
- Publication now runs after build, sign and self-verify:
  1. Claim: `gh api --method POST repos/CastrumS/pirax-castrum-maintenance/git/refs -f ref=refs/tags/v<version> -f sha=<HEAD commit>`, run through `run()`, so the seed is stripped and the output is captured rather than printed. On a nonzero exit it throws `could not create tag v<v> on <repo> (HTTP <status>|exit <code>); it may already exist; nothing was published`. The status is parsed from gh's `(HTTP nnn)`, and gh's text is not echoed.
  2. `gh release create v<v> --repo <repo> --verify-tag --latest --target <HEAD commit> --title v<v> --notes <audited> <zip> <manifest> <sig>`, with no `--clobber`.
     - On a nonzero exit it throws `gh release create failed (exit N); tag v<v> now exists on <repo> at <commit> without a release: rerun gh release create v<v> --verify-tag with the three dist/ files, or delete the tag deliberately`.
     - There is no rollback, retry, overwrite or delete.
- `--target` is the resolved HEAD SHA, not the literal string `HEAD`, because GitHub would read a literal `HEAD` as a branch name. With `--verify-tag`, the release uses the claimed tag anyway.
- The test wrapper's synthesized-failure switch is the env var `PIRAX_TEST_GH_FAIL=ref-exists|ref-error|release`. It exists only in the test wrapper; the CLI does not read it.

## Durable evidence (`implementation/evidence-u4/`)
- `red.log`: `bun --no-env-file test test/plugin/release.test.ts` at unit-3 production code, after the wrapper allowlist and the new tests: **10 pass, 4 fail**, exit 1.
  - The fails are: the publish argv (no claim), the claim refusals (old CLI exit 0), the release-failure residue, and source privacy.
  - The privacy failure diff shows only the booleans `leaked: true` vs `false`.
  - `red-release-2026-10-05T18-11-04-863Z/source-privacy.json` holds `{exit: 1, leaked: true, ghCalls: 0, dist: []}` for dry-run and publish. The matching `.log` files say `leaked true` and hold `[withheld]` in place of the output.
  - That red run's final `findSecret` test passed over its artifact dir, so no generated private value was retained.
- `green-release.log` + `green-release-2026-10-05T18-12-34-201Z/`: **14 pass, 0 fail**, 200 expects. `release-summary.json` there records the claim and create argv, the failure messages, the wrapper outcomes and `sourcePrivacy` `leaked: false`.
- `offline.log` + `offline-release-2026-10-05T18-12-42-366Z/`: `unshare -rn bun --no-env-file test test/plugin/release.test.ts -t '^offline:'` ran in a network namespace with no network: **8 pass, 6 filtered out, 0 fail**.
- `build-plugin.log`: `bun run build:plugin` (11 files) ran before the broad run.
- The broad run:
  - Command, under `setsid` with its own process group: `AKROGON_BASE=2689aaa3… bun --env-file=/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/.env -e '<spawn sh -c ": \"${AKROGON_BASE:?AKROGON_BASE is required}\" && bun test" with withoutSigningKey(process.env)>'`.
  - `changed.log` holds its output. `changed.exit` is the completion marker: `exit=0 commit=078b228 finished=2026-10-05T20:58:47+02:00`.
  - `changed-release-2026-10-05T18-58-40-509Z/` holds the release suite's artifacts from inside that run.
- `secret-scan.json`: `findSecret` over all of `evidence-u4/`, ZIP entries included.
  - It checked 9 env-loaded variables: FORM_TEST_TOKEN, GRAVITY_FORMS_ZIP, FLUENT_FORMS_PRO_ZIP, PIRAX_HELPER_SIGNING_KEY (base64, hex and base64url forms), IMAP_USER, IMAP_PASSWORD, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY and GPLVAULT_LICENSE_KEY.
  - Result: `hits: []`. `redact()` made 0 changes to `changed.log`, and no values were printed.

## Report
Changed files and reasons:
- `scripts/release-plugin.ts`:
  - The version error is name-only (AC1).
  - Publication now claims the tag atomically through the refs API, then runs `gh release create --verify-tag --latest --target <HEAD>` with the same three assets (AC2).
  - Claim failures are reported with a sanitized message and stop before any release call.
  - A release failure leaves the claimed tag and the message names it for deliberate recovery.
  - The header usage comment is updated.
- `test/plugin/release.test.ts` (AC1–AC3):
  - **The boundary was strengthened first.** The `gh` wrapper forwards only two exact argv shapes to the real gh:
    - `api --include repos/*/git/ref/tags/*` (3 args);
    - `api --paginate repos/*/releases?per_page=100 --jq .[].tag_name` (5 args).
    Every other call is recorded and answered locally, with success or a selected failure. Authentication is never faked.
  - New wrapper test, run with an invalid token: the two lookups are forwarded (GitHub answers 401). A ref POST, a DELETE, a field-implied POST, another GET and `release create` are all synthesized.
  - New publish tests check:
    - the success argv and order: lookups, then the claim, then `release create` with `--verify-tag`;
    - ref-exists (422) and an unanswered claim, both of which stop before `release create`;
    - a release failure, which exits 1, names the remaining tag and makes no further write.
  - `cli()` now records `leaked`. If the output contains a generated private value, its stdout, stderr and argv are withheld from the logs and from assertion diffs.
  - New offline privacy test: a generated seed is used as the header and the VERSION, in both modes.
  - Cases that never touch GitHub are prefixed `offline:` so they can be filtered with `-t`. No test was skipped and test discovery was not changed.
- `plugin/pirax-form-test/README.md` (AC4):
  - **Limits** now states that the update protection exists only while the helper is active; deactivating it removes the protection, as file replacement by an administrator does.
  - **Key recovery** and **Releasing** now describe the repository secret being delivered to the publishing job. The "operator's private local copy" and the `--env-file=<file>` loading advice are removed.
  - **Publishing** documents the exact two-step POST and `--verify-tag` sequence, the 422 claim refusal, the fact that the two steps are not one transaction, and the recovery when a tag is left without a release.
  - The false claim that a concurrent tag makes `gh` fail is removed.
- `test/plugin/README.md` (AC4): the suite row is updated; the full and `-t '^offline:'` commands are added; the exact forwarding allowlist and the synthesized writes are described; and the new cases are listed. These tests are described as checks of the publication boundary, not evidence of a remote write.
- The root README is unchanged: its release lines are still accurate.

Tests run:
- Red: `bun --no-env-file test test/plugin/release.test.ts` gave 10 pass, 4 fail (expected), with leak evidence kept as booleans only.
- Green: the same command gave 14 pass, 0 fail, 200 expects.
- Offline: `unshare -rn bun --no-env-file test test/plugin/release.test.ts -t '^offline:'` gave 8 pass, 0 fail, with no network.
- `bun run typecheck`: exit 0. `git diff --check`: clean.
- `bun run build:plugin`: OK.
- Configured changed command (setsid, with completion marker): **exit 0, 271 pass, 0 fail**, 24 files, 2744.64s.

Known limitations:
- No real tag, ref, release or secret was created or claimed. The POST and `gh release create` were proven only as the argv the CLI emits, with synthesized results. Real publication stays untested until reaudit-job's first release.
- The read-only lookups and the wrapper's forwarded 401 checks are real GitHub requests. The full suite therefore needs network and an authenticated `gh`; only the `offline:` subset does not.
- The claim and the release are not one transaction. If the claim succeeds and `gh release create` then fails (or is interrupted), `v<version>` stays on GitHub without a release. A rerun of the CLI then refuses that tag, so recovery is deliberate: rerun `gh release create v<version> --verify-tag …` with the same `dist/` files, or delete the tag. The CLI never deletes it.
- A claim that times out after GitHub accepted it reports "could not create tag … it may already exist", and the tag may in fact exist. The message says so honestly, but the CLI cannot tell this case apart.
- Two release paths were not reproduced against real GitHub: `--verify-tag` failing on a tag that is missing, and GitHub rejecting a commit that was never pushed.
- Two changes to the `release.test.ts` test names are intentional: the `offline:` prefixes, and the publish test's new name.

Unverified criteria:
- AC2 and AC3 have no real-remote evidence (a real ref POST or release), because this leaf forbids it. Everything else in brief §2 (criteria 1–4) is verified by the evidence above.
