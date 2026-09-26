# Worker 4 — real WordPress/R2 visual selftest

Completed brief-4’s unit. Final real WordPress/R2 selftest: **15 scenarios passed, 44 command invocations, exit 0**. Targeted tests: **17 pass, 0 fail**. Typecheck passed. Scoped R2 cleanup confirmed **0 remaining objects**, and fixture processes stopped. Extended criteria left to B are identified below.

## Changed files and reasons

Only the brief-4 unit was implemented. Existing worker-owned changes were preserved.

- `scripts/visual-selftest.ts`: assert-based real-R2/WordPress harness, unique `test/visual-<timestamp>-<random>/` root, shared production command calls, real scoped Store instrumentation (only counts forwarded puts), subprocess dispatch checks, private HTML fetch/render, retained artifacts, explicit failures and finally cleanup.
- `test/wp/blueprint.json`: pinned WordPress 6.8.3/PHP 8.3; pinned official WP-CLI 2.12.0 release; deterministic permalink/site settings and disabled cron/external update activity.
- `test/wp/fixture-plugin.php`: deterministic rendering of actual WordPress post content; isolated HTTP/critical/asset/console/transport/random/height/overflow/challenge/read-only fixtures. Control uses a WordPress option written by WP-CLI. Local request counters observe methods reaching WordPress.
- `test/wp/playground.ts`: Node bridge around `runCLI({command: 'server', workers: 1})` and Blueprint `wpCLI(server.playground, ...)` against that same instance. JSON lines over stdin/stdout carry control; no HTTP mutation endpoint. Plugin installation is verified byte-for-byte. The server is rebound to loopback before readiness and disposed on shutdown.
- `test/fixtures/https.ts`: Bun HTTPS fixture with a freshly generated one-day OpenSSL certificate and an independent HTTP script resource. Only this fixture's internal capture context opts into ignoring its certificate error.
- `test/fixtures/cli.ts`: subprocess adapter around production `dispatch`, accepting only a `test/visual-.../` root and forwarding a real Store. No production root/TLS flags were added.
- `package.json`, `bun.lock`: exact `@wp-playground/cli` and `@wp-playground/blueprints` 3.1.55 dependencies; `visual:selftest` is exactly `bun --env-file=.env scripts/visual-selftest.ts`.
- `src/report/manifest.ts`, `tests/report.test.ts`: generated wider-PNG regression for both viewports; removed only the incorrect viewport-width restriction. Approval still decodes PNGs and compares both dimensions against recorded actual dimensions, and rejects mismatches/corrupt health.

No README, site list, Store implementation, lifecycle configuration or environment-file edits. No subagents, commits, lifecycle calls or user questions.

## Actual red/green evidence

Overflow regression was written and run before the repair:

```text
error: actual PNG dimensions differ from captured dimensions; run check first
(fail) manifest and exact approval evidence > approval accepts full-page horizontal overflow using recorded dimensions
 16 pass
 1 fail
 83 expect() calls
Ran 17 tests across 2 files. [1.70s]
```

Evidence: `implementation/unit-4-overflow-red.log`.

After removing the fixed-viewport-width condition:

```text
 17 pass
 0 fail
 87 expect() calls
Ran 17 tests across 2 files. [1.74s]
```

Evidence: `implementation/unit-4-overflow-green.log`. Final targeted output is also retained in `implementation/unit-4-targeted.log`.

Meaningful integration failures were retained and repaired without weakening assertions:

1. Node 26.8.2 could not load Playground's `fs-ext-extra-prebuilt` native dependency. Installed Node 24.21.0 using `mise install node@24`, without changing the default Node configuration. The harness accepts `VISUAL_NODE` for an explicit compatible runtime.
2. First integrated run failed during fixture initialization. A direct smoke showed that the mu-plugin parent directory did not exist; the bridge now creates it. `unit-4-integration-first.log`; summary `runs/visual-selftest-2026-09-25T16-40-42.961Z/summary.json`.
3. Second integrated run passed actual WordPress seeding and baseline R2 byte checks, then rejected nonnumeric WP-CLI stdout. Mutation now uses `wp eval` to resolve/update the actual post and asserts that a fetch of the running site contains its new content. `unit-4-integration-second.log`; summary `runs/visual-selftest-2026-09-25T16-41-21.101Z/summary.json`.
4. Playground's default WP-CLI download URL returned HTTP 403 in smoke tests. Blueprint now downloads the pinned 2.12.0 PHAR from the official GitHub release, which returned 200.
5. The third run's rendered report exposed a malformed installed plugin and the health assertion then failed, `FAIL isolated WordPress health failures and baseline-relative warnings: new health must fail`. A Node Buffer sent across this Playground bridge produced incorrect installed bytes; UTF-8 string installation fixes it. The bridge verifies installed contents exactly, and the harness requires the plugin's HTML marker before baseline. `unit-4-integration-third.log`; summary `runs/visual-selftest-2026-09-25T16-44-41.594Z/summary.json`. This run is failure evidence, not accepted deterministic-fixture evidence.

Every failed integrated run above completed scoped remote cleanup and reported an empty root.

## Commands and fixture operation

```sh
bun --no-env-file add --dev --exact @wp-playground/cli@3.1.55 @wp-playground/blueprints@3.1.55
mise install node@24
AKROGON_BASE=0663984e0d80887123298bd43d6768e1cc2cbbf9 bun --no-env-file test tests/report.test.ts tests/commands.test.ts
VISUAL_NODE=/home/rudi/.local/share/mise/installs/node/24.21.0/bin/node bun run visual:selftest
env -i PATH="$PATH" HOME="$HOME" bun --no-env-file scripts/visual-selftest.ts
bun --no-env-file run typecheck
git diff --check
```

The credential-free selftest invocation returned **2** and wrote a failure summary, with only the missing names `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_ENDPOINT`, `S3_BUCKET`. No remote access or fixture startup occurred. Evidence: `implementation/unit-4-missing-env.log`, `runs/visual-selftest-2026-09-25T16-48-52.151Z/summary.json`. No missing prerequisites are silently skipped.

No whole-suite run or `store:selftest` was executed; those remain B's final validation responsibility.

For the next documentation worker:

- Use Node 24 LTS on PATH, or set `VISUAL_NODE` to that executable. This bridge uses Node's built-in TypeScript support. Node 26 on this machine lacks a matching shipped native binary; saying merely “Node >=20.18” is insufficient for this exact fixture.
- Bun, installed Playwright Chromium, OpenSSL and network access for WordPress/WP-CLI downloads are required. Missing prerequisites fail with retained summary instead of a skip. `mise exec node@24 -- bun run visual:selftest` is an alternative to `VISUAL_NODE` when mise is available.
- Both Playground packages are pinned at 3.1.55. WordPress/PHP are 6.8.3/8.3, WP-CLI is 2.12.0. No host `wp` executable is required.
- Bridge requests are `{id, command: string[]}`, `{id, op: 'counts'}`, `{id, op: 'stop'}`; replies use `VISUAL ` followed by JSON. The selftest owns bounded readiness/RPC/shutdown. The Node process inherits only PATH/HOME and its disposable TMPDIR, never R2 variables.
- All real storage commands receive `createStore({config, root})`; the counting adapter forwards actual requests unchanged. It does not emulate storage or authentication. CLI subprocesses use the same dispatch implementation and the same scoped root.
- Reports are fetched using the real 604800-second signature, then only the returned HTML body is passed to Playwright. Traces never navigate to the signed URL. Images must decode from data URLs; external requests must remain zero.
- Local reports/traces are intentionally retained. Remote test objects are removed in `finally` and the prefix must list empty. Cleanup failure fails the selftest and leaves the exact test prefix in its summary.
- Remote-only approval removes the original cache path by moving it to a sibling `-retained` path. Summary paths are updated; byte fidelity is then checked against retained evidence after the remote-backed promotion.

API grounding: installed package types and the official [programmatic CLI guide](https://developer.wordpress.org/playground/handbook/guides/programmatic-playground-cli/), [Blueprint steps](https://developer.wordpress.org/playground/blueprints/steps/), and [WP-CLI download guide](https://make.wordpress.org/cli/handbook/guides/verifying-downloads/).

## Known limitations and unverified extended criteria

- Fresh fixture boot needs external downloads. Package versions and WP-CLI/WordPress versions are pinned, but dependency-provided SQLite/PHP download availability remains external.
- The installed Playground server API initially binds all interfaces. The bridge immediately closes/rebinds its server to loopback before reporting readiness; there is a short upstream startup interval before that rebind.
- Real storage/authentication and normal cleanup/retention are exercised. Deliberate R2 network/list/prune/upload failures and partial baseline replacement after a real network failure are not induced. Production operations remain nontransactional.
- Never-idle/infinite-scroll readiness caps, detailed comparison allowance boundaries, malformed manifest/health variants and Forms/hostile-text rendering retain prior helper/browser-test coverage; this harness does not duplicate all such cases against R2. The targeted report tests do render Forms and hostile text in actual local Chromium.
- No claims about live production sites, token permissions beyond exercised operations, exhaustive mixed-content detection, or other WordPress/theme/plugin versions.
- A11 whole-suite and storage-selftest validation belongs to B and was deliberately not run here.

Section 8 of brief-4 was reread before writing and completing this report.


## Final executed acceptance and retained evidence

Final command (after strengthening whole-site approval to change **both** posts and parallelizing independent baseline snapshot reads):

```sh
VISUAL_NODE=/home/rudi/.local/share/mise/installs/node/24.21.0/bin/node bun run visual:selftest
```

Actual tail from `implementation/unit-4-validation.log`, exit **0**:

```text
ok   CLI configuration errors and missing baseline leave baseline bytes intact
run  real check prunes more than ten report runs; baselines unchanged
ok   real check prunes more than ten report runs; baselines unchanged
visual:selftest PASS; cleanup empty; summary /home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/worktrees/visual-health-check/runs/visual-selftest-2026-09-25T16-56-31.445Z/summary.json
```

Final scope: `test/visual-2026-09-25T16-56-31.445Z-c77913dd/`. Actual cleanup result:

```json
{
  "remote": true,
  "remaining": 0,
  "deleted": 198,
  "wordpress": true,
  "https": true,
  "errors": []
}
```

Real integrated assertions passed:

- Real Node Playground seeded 13 WordPress pages through its WP-CLI facility. The plugin byte readback and HTML marker proved the deterministic fixture was installed. A WP-CLI post update on the same running instance changed only alpha at both widths, while beta remained identical. Both raw baseline and actual PNG/health bytes round-tripped exactly through real R2.
- Changed-page approval promoted exact bytes and preserved beta. Subsequent check and subprocess check returned 0. Whole-site approval then promoted fresh changes to **both** pages from remote evidence, with its original local cache path removed, a newer unrelated completed report, and a newer incomplete upload present.
- URL mismatch, newly listed missing page, no site history, latest blocked metadata, latest missing page and latest missing actual-pair preflight all failed without a single forwarded Store put and without baseline byte changes. The latter three use deliberately seeded negative manifests/artifacts in real R2; independent production captures below exercise actual blocked navigation. No storage or auth implementation was mocked.
- Independent WordPress HTTP 404, critical-error phrase, two asset 404s (image/CSS), console plus uncaught error, and failed transport were identified at both widths. Approving complete health evidence converted repeated console/request findings into warnings; warnings-only checks returned 0. HTTP/critical failures persisted. New diagnostic identities failed and removed diagnostics disappeared.
- Separate large random regions demonstrated site/page mask union, masked pass, unmasked change, unmatched-selector warnings and invalid CSS exit 2.
- Height and horizontal width changes produced usable diff artifacts and displayed both dimensions. Whole-site approval of the genuine overflow captures succeeded, confirming the validator repair against real capture output, followed by a passing check.
- Unreachable, 403 and explicit challenge captures were blocked; the later normal site was still checked at both widths. Ordinary CAPTCHA/Cloudflare prose on normal pages did not block them.
- WordPress counters were `{"GET":125}` before and `{"GET":127}` after the write-attempt fixture, with no POST count. Both POST and beacon abort warnings were required at both widths.
- Default TLS rejected the self-signed HTTPS fixture. Only its internal browser option allowed capture; its HTTP resource was reported as mixed content, and remained a failure after approval.
- Shared-dispatch subprocesses returned 0/1/2 as expected. Missing baseline checks failed without creating baselines. The separate missing-environment selftest and existing command subprocess tests cover credential configuration failures.
- Three real presigned HTML fetches returned **200**, MIME **`text/html;charset=utf-8`**. Actual Chromium rendering decoded **12 / 30 / 12** embedded images respectively, matching every available baseline/actual/diff artifact; all had **0 external requests**. Changed-page, health and dimensions text were verified. Local screenshots and traces were retained, never signed URLs.
- Retention began with **22** report directories (including 12 seeded old canonical directories); one real completed check produced exactly the expected newest **10**, removed the oldest objects and left all baseline bytes unchanged. Finally cleanup deleted the remaining **198** objects and listed the test prefix empty.

Authoritative artifact directory:

`/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/worktrees/visual-health-check/runs/visual-selftest-2026-09-25T16-56-31.445Z/`

- `summary.json`: all 15 scenario assertions, 44 command invocations, direct command report/trace paths and cleanup.
- `artifact-verification.json`: all **125** trace archives passed CRC checks; recorded trace/report paths exist; no signed bearer URLs found in JSON/HTML or trace network/event records; expected image counts confirmed against actual manifests.
- `get-only-counts.json`, `retention.json`: actual method counters and exact before/after retained directory sets.

Representative command/report directories:

- **changed alpha**: `/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/worktrees/visual-health-check/runs/visual-selftest-2026-09-25T16-56-31.445Z/commands/2026-09-25T16-56-56.177Z/`
- **remote approval source**: `/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/worktrees/visual-health-check/runs/visual-selftest-2026-09-25T16-56-31.445Z/commands/2026-09-25T16-57-35.882Z-retained/`
- **new health failures**: `/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/worktrees/visual-health-check/runs/visual-selftest-2026-09-25T16-56-31.445Z/commands/2026-09-25T16-58-28.645Z/`
- **dimensions changed**: `/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/worktrees/visual-health-check/runs/visual-selftest-2026-09-25T16-56-31.445Z/commands/2026-09-25T17-01-13.188Z/`
- **retention check**: `/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/worktrees/visual-health-check/runs/visual-selftest-2026-09-25T16-56-31.445Z/commands/2026-09-25T17-02-40.946Z/`

Each check directory retains `index.html`, `manifest.json`, raw actual/baseline/health/diff files as available, and `traces/<slug>/<desktop|mobile>/<pageKey>.trace.zip`. The three browser-reviewed remote reports also retain `remote-report.png`, `remote-report.trace.zip`, and `remote-render.json`. The changed-alpha report was visually inspected and showed the deterministic fixture at 1440 and 390 pixels wide, a substantial alpha diff, and unchanged beta.

A prior complete green run also remains at `runs/visual-selftest-2026-09-25T16-48-13.955Z/`, with `implementation/unit-4-integration-final.log`; the later `unit-4-validation.log` and summary above are authoritative for the final strengthened harness.

Final targeted results (`implementation/unit-4-targeted.log`):

```text
 17 pass
 0 fail
 87 expect() calls
Ran 17 tests across 2 files. [1154.00ms]
```

`implementation/unit-4-typecheck.log`: `$ tsc --noEmit`, exit **0**. `git diff --check` passed, and owned new files had no trailing whitespace. Final process inspection found no `visual-selftest` or `test/wp/playground.ts` process (the no-match search returned 1 as expected). No full suite, storage selftest, commit or lifecycle action was performed.

No blocker remains for this unit. The known limitations/unverified extended criteria above remain explicit; this report does not claim B’s final A11 validation is complete.
