## 1. Goal

Implement one unit: real WordPress/R2 visual selftest and its fixtures, verifying integrated production commands (D11, A1–A11). Worktree `/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/worktrees/visual-health-check`; leaf `/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/open/site-checks/visual-health-check`.

## 2. Numbered acceptance criteria

1. `bun run visual:selftest` runs Bun with `--env-file=.env`, starts real Node `@wp-playground/cli` WordPress, seeds at least two stable pages, baseline captures both widths, changes one page using Playground WP-CLI on that SAME running instance, then check exits 1 with exactly that page visually changed at both widths. Stable controls pass. Approve changed page then check passes. Keep reports/traces and summary.
2. Isolated WordPress cases: listed 404, visible critical-error phrase, missing image and CSS 4xx, console/pageerror, known baseline console/request findings warnings not failures, new findings fail. Test random-element mask passes and no mask fails, height change displays both heights, unreachable/403/explicit challenge is blocked and later normal site still runs. Test-only Bun HTTPS fixture with self-signed certificate proves HTTP-resource mixed content independently; no global TLS bypass.
3. Real R2 root exclusively `test/visual-<timestamp>-<random>/`. Verify exact baseline/actual PNG and health bytes, page approval preserves other pages, whole-site approval, remote-only approval after removing local cache, latest unrelated run/partial upload handling, latest blocked/missing/page/URL mismatch/no history failure with no preflight writes. Seed >10 reports and run check, assert <=10, correct oldest removed and baseline unaffected. Cleanup all test-root objects in finally; assert empty. Do not substitute mock storage/auth.
4. Real presigned HTML fetch returns 200 and HTML MIME; Playwright renders fetched body (avoids signed URL in trace), image panels decode, health and changes visible, no unsigned assets. Keep local report/trace paths; never persist signed URL/credentials in logs/summary. CLI 0/1/2 verified through shared dispatch subprocess wrapper with real scoped Store. Fixture GET-only counters prove POST/beacon don't reach server. Existing helper tests cover negative input/manifest/Forms; add integrated evidence where feasible without duplicating them.
5. Fix concrete integration defects with fail-first evidence, not weakened tests. B found one: `validateActualPair` requires PNG width equal VIEWPORTS width, but fullPage PNG can include horizontal overflow. It should validate against recorded actual dimensions, not reject valid overflow captures. Demonstrate with a generated wider PNG regression in report tests and remove only erroneous fixed-width restriction.
6. Explicit summary on failures, cleanup/shutdown in finally, Node/Bun servers stopped, retained local artifacts. No silent prerequisite skips. Report meaningful remaining limitations/unverified extended criteria honestly.

## 3. Read-first list

Leaf `plan.md` D11/acceptance and `design.md`; `implementation/worker-3.md` exact command interfaces; `README.md`; `scripts/store-selftest.ts` isolation/cleanup/error pattern; `src/commands/*.ts`, `src/report/{writer,manifest,model}.ts`; `tests/{commands,report,capture}.test.ts`; `/home/rudi/.pi/agent/skills/implement-issue/ponytail.md`. Inspect installed Playground version types/help; upstream CLI docs describe programmatic runCLI and Blueprint WP-CLI, not a fabricated top-level wp-cli executable.

## 4. Change list and needed interfaces

Own `scripts/visual-selftest.ts`, `test/wp/{blueprint.json,fixture-plugin.php,playground.ts}`, `test/fixtures/https.ts`, a small fixture CLI wrapper as needed, package/lock additions. Add pinned `@wp-playground/cli` and matching Blueprint package only if needed; Node >=20.18 exists. Fix overflow validator/test as criterion 5. Other small production fixes discovered by integration are permitted within existing contracts; substantial interface/scope change returns mismatch.

`runBaseline(sites,store,RunOptions)`, `runCheck(...)` return `{exitCode,report?,runDir?,localPath?,url?}`; `runApprove(site,store,{pagePath?,log?})`; `dispatch(command,args,{store?,runsDir?,runId?,browser?,log?}) -> 0|1|2`. Inject real scoped createStore. RunOptions runsDir is parent, canonical runId added. Internal browser `{ignoreHTTPSErrors?:boolean,timeouts?}` only HTTPS fixture. Never serialize result.url. CLI wrapper imports dispatch and process.exitCode; do not add production storage-root flags.

Node bridge must execute seed/update WP-CLI against the same Playground instance; no public write endpoint or unrelated in-memory database. Deterministic plugin page rendering must still read actual WP post content, not replace content mutation with fake Bun HTML. Avoid external fonts/assets and tiny random changes below tolerance. Make random changing region large enough.

## 5. Do-not, reasons and exceptions

Never open/print/modify `.env` or `.env.*`; load through `bun --env-file=.env`, check presence by names only. Missing/unobtainable credential or physical permission -> explicit blocker to B, not pasted-value request. No production sites, lists or unscoped R2 writes. No paid plugins/mail/forms/update/discovery work. No subagents, commits, phase calls, user questions or whole-suite run. Don't write issue artifacts under worktree issues/. Do not weaken tests or replace real auth/storage/WordPress with mocks. Return mismatch with evidence for scope/interfaces; only revised B brief authorizes changes. Reasons: secret/scope safety, actual acceptance and ownership; exceptions only test-local WordPress mutations and authorized brief revision.

## 6. Ordered steps

1. Write failing overflow test, verify red, make minimal validator repair and green targeted tests.
2. Pin/install Playground dependencies; inspect API; build Node bridge/blueprint/plugin and HTTPS/CLI fixtures. Derive selftest assertions before driving commands; preserve first meaningful red integration result.
3. Implement/run isolated real selftest, repair observed integration defects and rerun affected cases. Keep summary/test-prefix cleanup evidence even on errors.
4. Typecheck, targeted tests, report exact commands and evidence paths. Stop all fixture processes before return.

Advisory ~8 files plus small integration fixes, under 80 turns. Return evidence if materially larger; never discard existing landed work.

## 7. Commands

`AKROGON_BASE=0663984e0d80887123298bd43d6768e1cc2cbbf9 bun --no-env-file test tests/report.test.ts tests/commands.test.ts`

`bun run visual:selftest` (script explicitly `bun --env-file=.env scripts/visual-selftest.ts`) and `bun run typecheck`. Targeted fixture smoke invocations permitted. No bare bun test or store:selftest: B owns final full validation.

## 8. Done-when, evidence and report

Write authoritative `implementation/worker-4.md` with pasted actual red/green results and retained report/trace/summary paths. Distinguish real R2/WordPress acceptance from helper-only assertions. Provide fixture APIs/version and needed operator-doc facts for next worker. No raw credentials/endpoints/bucket/signed URLs in artifact logs; signed response body rendering allowed. Failures retain precise blocker and outstanding criteria, not a false completion claim.

Changed files and reasons: <paths and why>
Tests run: <commands and results>
Known limitations: <limitations or none known>
Unverified criteria: <criterion and why, or none>
