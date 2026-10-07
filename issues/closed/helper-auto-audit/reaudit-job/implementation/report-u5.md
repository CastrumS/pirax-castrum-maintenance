# Unit 5 repair report

**Complete:** A-F1/A-F2 and B-F1/B-F2 repaired; configured check, typecheck and retained-evidence privacy scan passed. Worker tree is clean and committed. No lifecycle command, other worker, actual GitHub mutation, live mail, acquisition or client change was performed.

- Worktree: `/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/worktrees/reaudit-job-u5`
- Before: `6e10d6c95ca27d2765fb2a8b41ff5c36a3263ed4`
- After: `1f1b6e63f678247053cd4169e4ce569582e60256`
- Tested and committed tree: `8fbe4b9c6798f0ef6af0296608f97ff21c7e9bf9`
- Evidence: `implementation/evidence-u5/` (all paths below relative to that directory).

## Changed files and reasons

11 files, 121 insertions / 22 deletions:

- `.github/workflows/reaudit.yml`: separate optional, explicitly named current-attempt audit/publish summary downloads into the existing loader's per-job directories. Named downloads extract flat into these paths; missing artifacts remain allowed. Clarify failed-publish-only versus failed-audit reruns.
- `scripts/release-plugin.ts`: reuse dependency-free `scanEvidence` and `secretValues` after writing the final manifest/signature/ZIP and before tag claim or release creation. Scan ZIP entries and encoded known secrets; withhold assets on a hit or scan failure. No rebuild or edit follows the gate. Preserve atomic claim, scoped archive children and independent post-publication verification.
- `scripts/reaudit/watchdog.ts`: request `branch=main`, require a branch fact, and ignore non-main history. Failed main audits still prove liveness.
- `tests/reaudit-workflow.test.ts`: update artifact contract and extract real single-summary ZIPs to workflow-selected destinations using pinned v8.0.1's flat rule, then exercise the actual loader, formatter and CLI. Cover audit stage/reason/versions, failed cleanup/site, all three partial-publication states with commit/tag, absent current evidence and zero SMTP attempts. The existing dependency-free fixture already copies all scripts plus `test/plugin/artifacts.ts`, and passes unchanged.
- `tests/reaudit-publish.test.ts`: copy new release import dependencies; add URL-encoded synthetic seed in a disposable source README before its base commit. Require zero intercepted tag/release mutations, no uploaded ZIP and withheld local ZIP; retain the existing clean publication/independent-verification control.
- `test/plugin/release.test.ts`: copy `scripts/reaudit/privacy.ts` and `test/plugin/artifacts.ts` into every disposable release checkout.
- `tests/reaudit-operations.test.ts`: test overdue main plus recent skipped non-main dispatch, actual requested branch selection, failed recent main liveness and missing-branch refusal; existing fixtures now declare main explicitly.
- `README.md`, `plugin/pirax-form-test/README.md`, `test/plugin/README.md`: document pre-mutation scanning, corrected rerun semantics, main-only watchdog history and regression coverage.
- `learnings/history/2026-10-07-workflow-attempt-artifacts.md`: preserve the historical case and add a dated correction to the overbroad recovery sentence plus the single-match extraction clarification. Lessons index was not read or edited.

No production PHP, helper 0.3.0, pins, public key, callback inventory, action pins or forms guide change. The existing summary loader needs no code change: explicit named-download destinations now match its contract. Existing post-publication verification remains intact.

## Tests run

All commands ran in the worker worktree with Node24.21.0 and native gh2.101.0 first on PATH. No environment file was opened/copied/edited; prerequisites entered only through Bun's loader at the registered checkout.

| Command | Actual result | Evidence |
| --- | --- | --- |
| `bun --no-env-file install --frozen-lockfile` | exit0 | `install.log`, `install.exit` |
| `bun --no-env-file test tests/reaudit-workflow.test.ts tests/reaudit-operations.test.ts tests/reaudit-publish.test.ts` before production repair | **65pass / 5fail**, exit1, 70tests/3files, 12.95s | `red.log`, `red.exit` |
| `bun --no-env-file test tests/reaudit-workflow.test.ts tests/reaudit-decide.test.ts tests/reaudit-operations.test.ts tests/reaudit-publish.test.ts tests/reaudit-privacy.test.ts test/plugin/release.test.ts` | **150pass / 0fail**, 1051expects, 6files, 20.78s, exit0 | `green.log`, `green.exit` |
| `bun --no-env-file run typecheck` (`tsc --noEmit`) | exit0 | `typecheck.log`, `typecheck.exit` |
| `bun --no-env-file run build:plugin` | exit0, before configured check | `build.log`, `build.exit` |
| Configured changed command below | **519pass / 0fail**, no skips/todos, 5749expects, 38files, 3246.38s, exit0 | `configured-check.log`, `configured-check.exit` |
| `bun --env-file=/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/.env <evidence-u5>/retain.ts` | **19 native/forms scopes retained, 11 loaded values, 0 findings**, exit0 | `privacy.log`, `privacy.exit`, `retention.json`, `native/` |
| `git diff --cached --check`; production PHP comparison; final `git status --short` | no whitespace errors; production PHP unchanged; clean | inspected before/after commit |

The red failures were the actual encoded-seed mutation (2 calls instead of0), flat extraction losing the summary, outdated artifact contract, non-main liveness masking and absent branch validation. The clean intercepted publication control passed both before and after repair. The pinned action source and relevant README were fetched read-only at the workflow's exact SHA and retained as `download-artifact.ts` / `download-artifact-README.md`; its source uses `name || mergeMultiple || artifacts.length === 1 ? resolvedPath : path.join(resolvedPath, artifact.name)`.

### Configured command and attribution

```sh
export AKROGON_BASE=4e929fca0a8c793f2189454091fb5c0fcf74a1da
: "${AKROGON_BASE:?AKROGON_BASE is required}" && bun test
```

`run-configured.sh` held `implementation/native-check.lock`. It launched `run-configured.ts` through `bun --env-file=/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/.env`; that script spawned the exact configured shell command with the inherited loaded environment. The wrapper ran in a separate nohup/setsid session and was polled until its actual terminal exit, ending **2026-10-07T11:32:39Z**:

```text
519 pass
0 fail
5749 expect() calls
Ran 519 tests across 38 files. [3246.38s]
Result exit=0 at 2026-10-07T11:32:39Z
```

HEAD remained `6e10d6c` throughout the check; all repairs were staged before it began. `configured-head-{before,after}` and `configured-tree-{before,after}` match, and `configured-unstaged.diff` is empty. The subsequent commit has exactly the tested tree. **No post-check source or documentation difference.**

### Privacy and retained evidence

`retain.ts` refuses environment files and symlinks before copying or scanning. The fresh worker's evidence includes18 configured-suite scopes plus the earlier focused release scope. Only the two exact11-byte `local trace` synthetic non-ZIP placeholders were omitted, with their count in `retention.json`; genuine traces were retained and scanned. Known-secret scanning covered the new logs/scripts/upstream reference files and retained native/forms evidence, including ZIP entries, with zero findings. Original reports and evidence were not overwritten.

Publication output saying `published` is **synthetic mutation-interception evidence**, never actual remote publication. Tests use disposable local bare remotes and the existing gh wrappers; authenticated read-only lookups remain real. No SMTP was sent by these checks.

## Known limitations

- The publisher still pushes its main commit before invoking the release CLI. A refused asset can therefore leave `main-pushed`; this regression asserts that state rather than claiming transactional rollback. No tag/release mutation occurs for the encoded-seed case.
- Scanning covers known secrets and their supported encoded forms, not every conceivable private value. Assets are built/scanned once and not rebuilt before uploading.
- Same-host scheduler/SMTP outage, hard-kill GPL cleanup and accepted native audit-depth limits remain unchanged.
- Optional A Nits N1 (notice dependency install), N2 (version grammar/key-list duplication) and N3 (heartbeat fallback publication wording) are deferred as directed.

## Unverified criteria

All four repair criteria and local blocking checks are verified. Real post-merge Actions extraction/reruns, workflow dispatch, actual signed publication, Actions mail delivery, installed watchdog observation and elapsed schedule/heartbeat proof remain unverified; fixtures do not claim those operational results. No real remote mutation or mail was authorized or needed for this repair.
