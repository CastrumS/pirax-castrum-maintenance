# Worker 3 — release CLI and human docs (unit 3)

Commit: `1729885` (detached HEAD in worktree `issues/worktrees/helper-self-update-u3`, parent `de69a62` with units 1 and 2 landed).

All unit 3 criteria are met. The configured changed command at `1729885` exited 0: **267 pass, 0 fail** across 24 files, 3544 expects, 2745.10s.

## Interface notes for B
- `scripts/release-plugin.ts`: CLI `bun scripts/release-plugin.ts [--dry-run]`. Any other argument prints usage and exits 1. On import it runs nothing (`import.meta.main`). Its only export is `remoteTag(repo, tag, env?) -> "present" | "absent"`, which throws on any lookup that is not a clean 200 or 404. It reuses unit 1's `buildPlugin({source, zip})` and `withoutSigningKey()` unchanged.
- Publish order:
  1. Validate the seed (name-only errors).
  2. The derived raw public key must equal `UPDATE_PUBLIC_KEY`.
  3. `plugin/pirax-form-test/` must be clean in git.
  4. No local tag `v<version>` may exist.
  5. Remote `gh api --include repos/<repo>/git/ref/tags/<tag>`: 404 is the only "absent". Then a full `--paginate` release listing, drafts included, must succeed and must not contain the tag.
  6. Remove stale manifest/sig, build, sign, self-verify, write.
  7. `gh release create v<version> --repo CastrumS/pirax-castrum-maintenance --latest --target <HEAD> --title v<version> --notes <audited list> <zip> <manifest> <sig>`, with no `--clobber`.
- The seed is read only from `PIRAX_HELPER_SIGNING_KEY`. It is wrapped as PKCS#8 DER from 32 raw bytes, and no child process (git, gh, zip/unzip) receives it.
- One addition beyond the brief: refusing a dirty `plugin/pirax-form-test/`. It keeps the `--target` commit equal to the signed ZIP's source.

## Durable evidence (`implementation/evidence-u3/`)
- `red.log`: red run before the CLI existed, `bun --no-env-file test test/plugin/release.test.ts`, **0 pass, 10 fail** (ENOENT `scripts/release-plugin.ts`).
- `green-release.log`: **10 pass, 0 fail**, 158 expects, 3.33s at `1729885`. Its artifacts are in `release-2026-10-05T17-16-55-050Z/`: one log per CLI case (exit code, stdout/stderr, recorded gh argv, `dist/` listing), the dry-run manifest/.sig and `release-summary.json`.
- `changed-release-2026-10-05T18-02-39-848Z/`: the same suite inside the configured changed run.
- `worktree-dry-run.json` plus its manifest/.sig: a real `bun --no-env-file scripts/release-plugin.ts --dry-run` in the worktree root, with an in-memory generated seed. Exit 0, 64-byte signature, independently verified with the raw public key, ZIP SHA-256 matches, audited map equals source, findSecret `[]`, no seed in output. The manifest/.sig were then removed from the worktree's `dist/`.
- `build-plugin.log`: `bun run build:plugin` before the broad run (11 files).
- `changed.log` / `changed.exit`: the configured changed command, run under `setsid` in its own process group with an exit marker: `exit=0 commit=1729885 finished=2026-10-05T20:02:43+02:00`. The log was passed through `redact()` afterwards with 0 replacements.
- `secret-scan.json`: `findSecret` over all of `evidence-u3/` (trace and ZIP entries included). The scan covered the env-loaded values of FORM_TEST_TOKEN, GRAVITY_FORMS_ZIP, FLUENT_FORMS_PRO_ZIP, PIRAX_HELPER_SIGNING_KEY (plus its hex/base64url forms), IMAP_USER, IMAP_PASSWORD, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY and GPLVAULT_LICENSE_KEY. Result: `hits: []`, and no values were printed.
- Worktree artifact dirs from the changed run, all gitignored and not copied: `artifacts/plugin/{adapters,compatibility,core,updates,safety,stack-harness,review-regressions,harness-smoke,forms-checker}-2026-10-05T17-*`.

## Report
Changed files and reasons:
- `scripts/release-plugin.ts` (new): import-safe release CLI (plan D7). It takes the version and `AUDITED_VERSIONS` from the PHP source, parsed narrowly with no TS matrix: exactly one header and `VERSION`, which must be equal, stable dotted numeric, and unique literal `'key' => 'version',` lines. It builds through `buildPlugin`, writes a canonical-package manifest, signs it with Ed25519 and verifies the signature. Dry-run never calls GitHub. Publish runs the fail-closed preflight described above and then a single non-clobbering `gh release create`.
- `test/plugin/release.test.ts` (new): runs the real CLI in disposable git checkouts that hold copies of the scripts and helper source, so the repository's `dist/` and tags are untouched. Seeds are generated per test with `testKey()`. A `gh` wrapper records argv, forwards only `gh api` to the real gh, and answers `release create` without running it. It covers:
  - dry-run bytes and signature, checked independently, plus the source-authority edit;
  - an import with no side effects;
  - 8 seed shapes, each tried in both modes;
  - key mismatch, a real local tag and a real 401 lookup;
  - `remoteTag` absent and present answers;
  - the exact publish argv;
  - 4 malformed source cases;
  - the parent seed scan;
  - findSecret over the logs and every `dist/`.
- `README.md`: helper self-updates versus the checker, the 0.2.4 bootstrap, and the awaiting-audit versus generic message. It notes that checker interpretation and the scheduled job are not implemented. It adds release usage and the release test command, and changes the broad-run budget from 35 to 55 minutes.
- `plugin/pirax-form-test/README.md`: version 0.3.0 and "Replace current with uploaded" on install. A new **Updates** section covers bootstrap, channel, verification, auto-update limits, signature limits, releases not yet automated and key recovery (a new pair plus a manual upload on each site). A new **Releasing** section covers the dry-run (test-only key) and publish refusals. It also adds the awaiting-audit row and rules, the early GF AJAX wording and the last-block record (the message is stored but not shown in the panel). The early-bootstrap and lifecycle limits are kept unchanged.
- `test/plugin/README.md`: rows for the `updates.test.ts` and `release.test.ts` suites, plus a new "Update and release tests" section and updated core, compatibility and safety descriptions. It covers seed stripping and the evidence files, and corrects the Pro wrong-version fixture to **6.2.16**.

Tests run:
- Red: `bun --no-env-file test test/plugin/release.test.ts` gave 0 pass, 10 fail (`evidence-u3/red.log`).
- Green: the same command gave 10 pass, 0 fail (`evidence-u3/green-release.log`).
- `bun run typecheck`: exit 0, after fixing two strict-index typings found by the first typecheck. Tests were rerun green afterwards.
- `git diff --check`: clean.
- `bun run build:plugin`: OK.
- Configured changed command: `AKROGON_BASE=2689aaa… bun --env-file=/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/.env -e '…delete PIRAX_HELPER_SIGNING_KEY…bun test'`. Result: **exit 0, 267 pass, 0 fail**, 24 files, 2745.10s (`evidence-u3/changed.log`, `changed.exit`). It overlapped with B's concurrent `lane-after-u2` run on the same machine and still passed, including `tests/capture.test.ts`.

Known limitations:
- Publishing is proven only up to the `gh release create` argv, which the wrapper recorded without running it, as the brief requires. No real release, tag or secret was created. The preflight GitHub lookups were real and read-only.
- The release tests need network and an authenticated `gh` (`cli/cli v2.0.0` is the "present" reference). They are not credential-free in that sense, though they need no `.env`.
- The seed-in-source refusal test writes a **generated disposable** test seed into a temp checkout file, which is deleted after the test. That is the only way to prove the parent scan. No real key ever touches a file.
- The plugin README states that the operator keeps a private local copy of the seed in addition to the GitHub secret. That matches the plan's 2026-10-05 note but differs from the design's "job only" wording, which is already flagged for B.
- `remoteTag` lists releases with `--paginate` (fine at this repository's size). Between the preflight and `gh release create`, a concurrently created tag or release is left for gh to reject rather than being re-checked.

Unverified criteria:
- A real publish to GitHub (forbidden by scope), and a 0.3.0 shipping helper installing a production-key-signed release (needs the first real release, owned by reaudit-job).
- All other unit 3 criteria (brief §2 1–5) are verified with the evidence above.
