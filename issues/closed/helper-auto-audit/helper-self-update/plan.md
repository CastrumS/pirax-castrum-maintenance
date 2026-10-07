# Plan: helper-self-update

Slot B · plan.synthesis · 2026-10-02 · base `2689aaa3bd69a9a46cc77788fdc5219354cc923a`

Direct synthesis: `state.yaml` has `debate: "no"`; there are no positions or rebuttals to integrate. The locked design controls scope.

## Grounding and read-first

Repository/worktree: `/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/worktrees/helper-self-update`. Artifacts belong in this authoritative leaf, not a worktree copy of the issue.

Read first, in order:
1. This leaf's `brief.md` and `design.md`.
2. `/home/rudi/.claude/skills/chart-issues/assets/standing-design.md`, interpreted with the design's explicit GitHub-secret exception.
3. `README.md`: plugin introduction, commands, environment handling and forms limitations.
4. `plugin/pirax-form-test/README.md`: supported versions, fail-closed boundaries, early GF AJAX guard, last-block record and rollout.
5. `test/plugin/README.md`: native harness, HTTP containment, wrong-version fixtures, evidence/privacy.
6. `learnings/LESSONS.md`: especially credential-bearing assertions, final HTTP log records, submission-route timing and changed-paragraph documentation drift. These are evidence-based cautions, not new scope.
7. `plugin/pirax-form-test/pirax-form-test.php`, `includes/{compatibility,marker,gravity-forms,fluent-forms}.php` and `scripts/build-plugin.ts`.
8. `test/plugin/{core.test.ts,compatibility.test.ts,safety.test.ts,harness.ts,playground.ts,artifacts.ts}`; `test/wp/playground.ts` for the existing loopback rebind pattern.
9. `package.json`, `bunfig.toml`.

Grounding gap: `akrogon config` reports `grounding: none`; no configured grounding index/AREA exists. README and its relevant linked guides supplied grounding instead. No agent instruction document was found in the inspected tracked surface.

### Live findings that constrain implementation

- Helper header and README are **0.2.4**, not 0.2.3; preserve its current early GF AJAX protection while moving to 0.3.0. There is no existing updater.
- Build files are strictly allowlisted. `core.test.ts` duplicates that allowlist, pins the header to 0.2.4 and assumes `dist/` contains only one ZIP. Release assets invalidate that last assumption.
- `compatibility_report()` already exposes versions, human reasons, unaudited identities and suppression bindings. `callback_findings()` currently discards actual callbacks' source ownership from the public findings; class/function names alone cannot establish the required ownership.
- `prepare_marked_submission()` returns a boolean and records the last block. GF and FF then choose the generic constant independently. The GF early AJAX guard has its own rejection path and currently does not use that record helper.
- Existing native `VERSIONS` fixtures already change Pro to **6.2.16** (the test guide incorrectly says 6.2.15), CleanTalk to 6.88.1 and FluentSMTP to 2.4.2. Inventory at audited Pro is already tested as a generic block.
- Playground harness requests are real, but default startup requires licensed GF/token; the full stack additionally requires Pro. Its Node child currently inherits most environment variables: explicitly prevent a signing seed from reaching it.
- `bunfig.toml` only excludes `issues/**`. Thus bare credential-free `bun test` discovers native credential-requiring suites and fails by design. Do not solve the brief's inconsistent “bun test (credential-free)” wording by skipping those suites or weakening their preflight. Run the actual credential-free subset and the required broad/full commands separately, recording which environment was supplied.
- No local/remote tags were listed during synthesis; tests must not create a real release or a remote test tag in this repository merely to test refusal.

## Prerequisites and key status

Presence was checked without opening or printing an environment file, using `bun --env-file=.env -e` and printing only `present`/`absent`:

| Design-named variable | Observed |
|---|---|
| GPLVAULT_LICENSE_KEY | present |
| GPLVAULT_PRODUCT_ID | present |
| IMAP_USER | present |
| IMAP_PASSWORD | present |
| PIRAX_HELPER_SIGNING_KEY | absent |

Additional native-test names `GRAVITY_FORMS_ZIP`, `FLUENT_FORMS_PRO_ZIP`, `FORM_TEST_TOKEN` are present. Presence is not a claim that their values/downloads work. GPL Vault and mail credentials are owned by the other job leaf, not consumed here.

`gh secret list --repo CastrumS/pirax-castrum-maintenance --json name` succeeded and returned no names; `gh repo view ... --json viewerPermission` returned `ADMIN`. The signing key is **obtainable by this seat**: the design explicitly assigns generation of a new pair and repository-secret storage. Its absence is not a human-only blocker, and no `add PIRAX_HELPER_SIGNING_KEY to .env` action is appropriate: the more specific locked design keeps the real seed only with the publishing job. Provision it during implementation (D8), never read/write any `.env` or `.env.*`. No production key is generated during this planning pass.

If implementation encounters an actual permission barrier, record the exact failed permission and operator action (restore the authenticated account's repository Actions-secret write access), then fail the phase; do not claim provisioning succeeded or invent a placeholder public key.

## Acceptance criteria (fixed before tests)

**AC1 — native trusted update.** A real local HTTP release fixture serves a manifest, detached signature and helper ZIP signed with a newly generated test key. On disposable WordPress, the installed test build exposes a normal plugin update, its details resolve through `plugins_api`, an authenticated native update installs it, and a fresh request reads the newer header/version. `auto_update_plugin` selects only this helper; an unrelated plugin preserves the incoming decision. Retain request evidence and a Playwright trace of listing/install, without mocking update/auth HTTP.

**AC2 — fail closed.** Unsigned/malformed signature, another signing key, equal/older version, malformed manifest, invalid package origin/path and network failure offer no helper update. A correctly signed manifest whose downloaded ZIP hash is different refuses the install and leaves installed bytes/version unchanged. Also refuse a helper install with no verified manifest, a package URL different from the verified one, or a manifest changed between offer and download; another plugin's download remains untouched. A stale helper entry in the update transient must not survive an invalid refresh.

**AC3 — distinguish version-only rejection, not permission to submit.** Pro 6.2.16 produces exactly `Pirax test blocked: awaiting audit of Fluent Forms Pro 6.2.16` on FF. Audited Pro's Inventory module still produces exactly `Pirax test blocked: integrations could not be suppressed`. Both reject before insertion/mail/feed effects. Applicable core/optional mismatches, GF postback and GF modern AJAX get the same classification rules; multiple labels use deterministic order. A mismatch combined with an unrelated/unattributable callback, unsupported form, missing core, unreadable version, unrecognized audited binding or suppression failure stays generic. Marker/config errors keep their existing precedence. Ordinary submissions and exact-version acceptance do not change. Last-block diagnostics remain private, autoload-off and visible in the existing panel.

**AC4 — release artifacts and refusal.** `bun scripts/release-plugin.ts --dry-run`, with a generated base64 32-byte test seed in its child environment, builds `dist/pirax-form-test.zip`, `dist/pirax-form-test-manifest.json`, and `dist/pirax-form-test-manifest.json.sig`. Independently verify Ed25519 over the exact bytes using a raw public key in the same base64 format as PHP, and verify the ZIP SHA-256 and audited matrix. Publishing refuses missing/invalid seed, key/public-key mismatch, an existing local or remote `v<version>` tag, or ambiguous/failed remote preflight, before release creation. No test or leaf action publishes a real release. Dry-run never invokes GitHub.

**AC5 — real trust root.** A non-placeholder real public key is committed; its generated private seed is successfully stored as GitHub secret `PIRAX_HELPER_SIGNING_KEY`, confirmed by name. A provisioning-time sign/verify check establishes the pair, without retaining the seed. `findSecret` checks the tracked-source snapshot (excluding all env files), release ZIP/assets, retained evidence and captured output for the private material; only public fingerprints and success/failure are retained.

**AC6 — regressions/docs.** Typecheck, credential-free unit/browser subset, native plugin suite, and configured broad tests pass with their actual prerequisites. Update the build contract and existing version-message assertions; do not silently skip missing prerequisites. Document channel, verification, failure behavior, one-time upgrade to updater-capable 0.3.0, key recovery, release usage and new message without claiming the excluded checker or scheduled job already exists.

## Stable decisions and needed interfaces

### D1 — ownership and sequencing

Owned: helper PHP, build/release scripts, tests/fixtures under `test/plugin/`, and their affected docs. No scheduled workflow, GPL Vault/version detection, real release publication, checker outcomes/three-day escalation, or client rollout here. The design's full blocked-reporting decision is partitioned: this leaf emits the string; `checker-awaiting-audit` implements interpretation. `reaudit-job` consumes the signer later; it is not an execution prerequisite for this leaf. No other leaf dependency is required.

### D2 — signed wire contract

`includes/updates.php` owns the production channel rooted at `https://github.com/CastrumS/pirax-castrum-maintenance/releases` and the manifest URLs at `/latest/download/pirax-form-test-manifest.json` and `.sig`.

Manifest fields: `version` (release version string), `package` (canonical repository `/releases/download/v<version>/pirax-form-test.zip` URL), `sha256` (64 lowercase hex characters), `audited` (string map matching `AUDITED_VERSIONS` in the released source). Release versions are stable dotted numeric versions, not prereleases. `.sig` is base64 encoding of the **64 raw detached signature bytes**; embedded public key is base64 encoding of **32 raw bytes**. Seed input is base64 encoding of **32 raw Ed25519 seed bytes**, not PEM or a 64-byte expanded secret.

Verify the detached signature over exactly the fetched JSON bytes before trusting parsed fields; strict base64 decoding, lengths, JSON object/types and version/hash/URL checks fail closed. Use WordPress's bundled sodium compatibility support when native sodium is unavailable; a missing verifier is never permission to proceed. The manifest is public data, not an authenticated endpoint.

URL validation parses scheme/host/path, disallows userinfo, unexpected port, query/fragment and ambiguous/traversal encodings, and anchors the repository path including its boundary. Do not use a string prefix that admits lookalike hosts or repositories. GitHub asset CDN redirects during the package download are expected: the authenticated starting URL is canonical and the downloaded bytes are verified before installation.

No manifest expiry/anti-freeze service or key rotation protocol is added. Newer-than-installed validation prevents simple downgrades, but withholding a release can keep a site behind (limitation below).

### D3 — WordPress integration and download boundary

Wire `updates.php` unconditionally from the plugin bootstrap, independently of GF/FF presence; set helper version to 0.3.0 and a repository-specific `Update URI` to avoid wordpress.org slug collision. Keep version comparison tied to the helper's actual version/header, not the audited form-plugin versions.

Use these WordPress interfaces, verifying their actual signatures in the installed test WordPress before wiring:
- `pre_set_site_transient_update_plugins`: add only `pirax-form-test/pirax-form-test.php` with normal `slug`, `plugin`, `new_version`, `url` and `package` fields from a verified newer manifest. Preserve every unrelated entry; remove this helper's old offer when refresh validation fails.
- `plugins_api`: handle only `plugin_information` for `pirax-form-test`; expose inert, escaped details and the verified download/version. Return the original result for other actions/slugs.
- `auto_update_plugin`: true for this exact plugin basename; preserve input otherwise. This requests automatic updates, not an override of globally disabled updates, filesystem permissions or absent WP-Cron traffic.
- `upgrader_pre_download`: identify the helper by upgrade context **and** its offered package identity; return the incoming result for unrelated plugins. For the helper, require a currently verified newer manifest and exact package binding, use real WordPress download facilities, hash the actual temporary file and return its filename only on success. Never return `false` on helper verification failure (that delegates to an unchecked download). Refuse unsafe pre-populated download results rather than trusting another filter's filename; preserve an existing error. Delete failed temporary files; allow the upgrader to clean up successful ones.

Keep an offer's verified identity available to its install request (WordPress update transient or a narrowly scoped helper site transient) and compare it with download-time verification. A changed latest feed must cause a retry/refusal rather than installing a different manifest/package behind the offered UI. No independently trusted hash from an unsigned transient. Bound HTTP timeout/body sizes; cache only signature-verified bytes with a short finite lifetime, or use request-local memoization for the first version. Prefer request-local memoization plus explicit install-time fetch to avoid a new persistent cache/uninstall contract.

### D4 — test channel without a production bypass

Never embed a fixture key in the shipping ZIP or offer runtime settings/filters to replace the production public key. Tests stage a copy of the helper, replace its release-root/base-URL constant and embedded **public** key only in that disposable copy, and build a fixture ZIP; assert exact replacement/readback and keep source-tree production files unchanged. The fixture root preserves the repository/releases path layout on `127.0.0.1` and uses real HTTP. URL policy must still enforce the configured constant's exact origin/path, with shipping constants fixed to HTTPS/GitHub; no generic “allow HTTP” switch.

Use distinct disposable installed/target versions, e.g. a 0.3.0 updater-equipped fixture upgrading to 0.3.1, and confirm the next request actually loads the new file. This is not proof that shipping 0.2.4 can self-update: it has no updater and needs one manual upload.

Extend the existing harness minimally for a test release fixture and seed-safe environment handling. Keep normal update traffic real (no `pre_http_request` update response double). Choose a normal/default plugin harness for update tests so full-stack containment does not block GitHub substitute traffic; fixture server itself binds loopback. Test fixtures and private keys are never production allowlist entries.

### D5 — structural version-only diagnosis

Keep current fail-closed predicates and callback allowlists unchanged. Introduce structured diagnosis for message selection, not a weakening of support. Separate version mismatches, absent/unreadable versions, unaudited callbacks and non-version/form/suppression failures; do not infer the class by parsing English `reasons` strings.

Reflect the actual registered function/method/closure's declaring source file and normalize its path. Associate it only with an exact applicable plugin directory (`gravityforms/`, `fluentform/`, `fluentformpro/`, `cleantalk-spam-protect/`, `fluent-smtp/`) under `WP_PLUGIN_DIR`, using a directory boundary. Unknown/internal/eval/mu-plugin/outside paths have no owner. A namespace/class prefix is not ownership. Keep absolute filesystem paths and callable objects out of last-block records and panel output; preserve the public `(hook, priority, id)` callback record shape where possible by keeping ownership internal.

A version-only diagnosis needs at least one known, nonempty installed-version mismatch, no independent blocker, and every unaudited callback attributable to one of those mismatched plugins. Those callbacks remain unaudited and the submission remains rejected; they just do not independently force the generic wording. At audited Pro, Inventory is still an independent blocker. At mismatched Pro, callbacks physically in that mismatched plugin satisfy the design's version-only rule; the message does not assert the future audit will accept Inventory.

Format with `PLUGIN_LABELS` and the existing core/optional ordering, listing each mismatched owner once: `Pirax test blocked: awaiting audit of <label> <version>[, ...]`. Treat unavailable/empty version as generic rather than pretending an unknown version can be scheduled for audit. Escape at the HTML boundary and retain the established GF/FF response shape/status.

### D6 — adapters, early guard and last-block consistency

Preserve the boolean interfaces `gf_supported`, `ff_supported`, `prepare_marked_submission` unless all existing callers/tests are migrated together. Add a request-local diagnosis/message helper used by GF/FF instead of replacing every generic constant indiscriminately. Build and store one coherent diagnosis at classification; include unsupported-form and removal-failure facts before choosing a message. Keep `BLOCKED_MESSAGE`, marker/config messages and their precedence intact; add the awaiting-audit prefix in `marker.php` as the checker-facing interface.

The early GF modern AJAX guard must classify its own reachable failure without calling unaudited GF form APIs or advancing/removing a new version's CleanTalk callbacks. A known GF/CleanTalk version refusal can get the version-only message when currently observable compatibility facts contain no independent cause. Missing GF, dynamic/unknown field refusal, wrapped/moved audited CleanTalk bindings, or removal failure stay generic. Do not probe GF stored metadata when GF itself is unaudited just to improve the wording. Add native regression assertions for that no-read boundary.

Record early rejection metadata safely as well: posted form id only, observed versions/reasons/callback identities; do not call `GFCommon::has_post_field` or form-loading APIs there. Reuse an internal record writer so both old generic and new version-only blocks still populate `pirax_form_test_last_block` with the existing autoload/privacy semantics. Panel diagnosis remains richer than the short submission message and must not hide callbacks.

### D7 — release CLI

Add an import-safe `scripts/release-plugin.ts` with a CLI entry guarded by `import.meta.main`. It reads the version/header and audited matrix from the production PHP source; reject an unparseable/ambiguous declaration rather than maintaining a second hardcoded version map. Build through the existing `build:plugin`, hash the final ZIP, serialize the manifest once, sign those exact bytes using Bun/Node Ed25519 facilities, then write only the ZIP/manifest/signature to `dist/`.

Default execution is publishing; the only planned public flag is `--dry-run`. Validate seed presence/strict encoding first with name-only errors. Dry-run allows a generated test key distinct from the committed production key and does no GitHub calls; publishing derives its public key and requires equality with the committed key. No private key is written into output, files, command arguments or caught-error dumps.

Before publishing: reject an existing local tag and query the explicit GitHub repo for the tag/release, distinguishing a genuine not-found response from an auth/network failure. Never infer that any nonzero `gh` status means no tag. Build/sign/check before invoking `gh release create v<version> --repo CastrumS/pirax-castrum-maintenance --latest` with exactly the three assets; use the intended checkout commit as target and do not overwrite an existing release. Let a concurrent tag/release creation fail rather than replacing assets. Preserve child failure as a sanitized nonzero CLI outcome. The scheduled leaf owns when audit gates invoke it; this CLI is not an audit bypass or a schedule.

Extract narrow pure helpers or a callable runner with explicit repository/output context if needed for tests. Refusal tests use a real disposable local git tag and synthetic absent/invalid seeds, not fake GitHub authentication. Read-only real GitHub preflight can verify remote lookup; do not create a remote production tag/release as test data. Tests for commands inspect only sanitized outcomes, never a private seed-bearing config object.

### D8 — real-key provisioning and privacy

After tests establish the format, generate a fresh seed once in a non-logging Bun process, derive the raw public key, run a sign/verify self-check, write **only the public constant** to the plugin and pipe the seed directly on stdin to `gh secret set PIRAX_HELPER_SIGNING_KEY --repo CastrumS/pirax-castrum-maintenance`. Do not place a key value in command-line arguments, shell history, a temporary file, an environment file or a pass artifact. Confirm the remote name and retain a public fingerprint plus the sign/verify/upload result. No real release is signed/published here.

Before provisioning, recheck the secret name. Do not silently replace a secret another pass/job has created. On a resumed pass use the public/provisioning evidence; an inaccessible existing secret is not permission to rotate a possibly deployed trust root. First-time generation is allowed by the design, replacement of a deployed key is not part of normal retry.

While the new seed is still in memory, scan tracked production/doc/script content via an env-file-excluding snapshot, `dist/` (including ZIP entries), and retained output/artifacts with `findSecret` against base64/raw-encoded private representations used by the tooling. Never recursively scan the repository root with this helper: that would open `.env` files. Return only clean/hit paths, never matching values. Private key objects/seeds and captured process buffers stay out of assertion diagnostics. Strip `PIRAX_HELPER_SIGNING_KEY` from unrelated build/test/Playground child environments; build secret scanning must still check the parent-visible seed before spawning children. Tests use generated disposable keys only.

Recovery: GitHub secrets cannot be downloaded. Losing the key/job secret means generating a new pair, replacing the committed public key and secret, and one manual helper upload per site. A compromised signing key is outside what signatures alone can mitigate; document this rather than promising transparent rotation.

## Ordered file/criterion checklist

Each implementation unit carries the ACs above verbatim as its contract. Updater and diagnosis code can be developed independently; shared bootstrap/build/core-test changes have one owner. Provisioning requires the settled key format; end-to-end tests require the corresponding implementation, not another issue leaf.

### 1. Wire/build/release foundation (AC4, AC5, AC6)
- [x] `scripts/release-plugin.ts` — import-safe signer/publisher, exact wire format, source-derived version/audited map, dry-run and tag/key refusal.
- [x] `scripts/build-plugin.ts` — allowlist `includes/updates.php`, check signing-key leakage by name, keep fixture/source isolation.
- [x] `plugin/pirax-form-test/pirax-form-test.php` — header 0.3.0, Update URI, updater include/version ownership.
- [x] `test/plugin/release.test.ts` (new) — credential-free generated-key dry-run verification, malformed/missing/mismatched key and real disposable local-tag refusal, secret-safe evidence. Isolate temporary source/dist fixtures so these tests do not race other suites' production ZIP.

### 2. Update client/native fixture (AC1, AC2)
- [x] `plugin/pirax-form-test/includes/updates.php` (new) — channel/public constants, verifier, strict manifest/URL validation and four WordPress hooks.
- [x] `test/plugin/updates.test.ts` (new) — actual list/details/native install/auto-update decision, negative matrix and unchanged installed bytes after refusals.
- [x] `test/plugin/update-fixture.ts` (new) — loopback feed/package service, ephemeral test key, staged fixture ZIPs and sanitized request/summary evidence.
- [x] `test/plugin/harness.ts` — minimal update-test plumbing if required, drop signing seed from child environment; preserve existing callers.
- [x] `test/plugin/playground.ts` — no edit needed; existing real startup/readback reused, with fixture setup through the harness. No production trust override or auth/update HTTP mock.
- [x] `test/plugin/core.test.ts` — new production file/header assertions; replace exact one-file `dist/` assertion with explicit allowed release-asset names while continuing ZIP-content/privacy checks.

### 3. Block-message classification (AC3)
- [x] `plugin/pirax-form-test/includes/compatibility.php` — structural diagnosis, reflected ownership, generic independent causes, reusable safe last-block writer.
- [x] `plugin/pirax-form-test/includes/marker.php` — stable awaiting-audit message prefix, existing messages unchanged.
- [x] `plugin/pirax-form-test/includes/gravity-forms.php` — normal/early rejection messages and safe early diagnosis without weakening timing.
- [x] `plugin/pirax-form-test/includes/fluent-forms.php` — diagnosed rejection while keeping HTTP/validation semantics.
- [x] `test/plugin/compatibility.test.ts` — change exact wrong-version expectations, preserve Inventory generic block, mixed-version/callback cases, GF AJAX no-read and last-block evidence.
- [x] `test/plugin/safety.test.ts` — structured classification edges, ownership/path boundaries, unknown/missing version, multiple mismatches and unsupported-form combinations; preserve exact audited predicates.
- [x] `test/plugin/adapters.test.ts` — regression check that unsupported/payment/post-field/callback tests retain generic messages; change only if a version-specific assertion genuinely needs migration.

### 4. Real trust root and complete verification (AC5, AC6)
- [x] `plugin/pirax-form-test/includes/updates.php` — the existing real pair's public key is embedded; the builder rejects a malformed/non-32-byte public key. Pair correspondence is independently verified.
- [x] GitHub secret `PIRAX_HELPER_SIGNING_KEY` — existing externally provisioned pair reused per the resumed D8 note; name-only confirmation and public proof in `implementation/key-proof.json`, no secret replacement or private value in git.
- [x] `test/plugin/artifacts.ts` — existing `findSecret` API reused with explicit serialized-key needles and env-excluding snapshots. Repair round 1 fixes the shared child environment and three direct archive calls; `artifacts.test.ts` proves parent scanning/retention and child isolation with real archives.
- [x] Run all verification below, retain artifact paths and report existing/external failures honestly. Initial B gates at `f2b79e2`: typecheck and full/changed suite 271 pass, standalone plugin suite 92 pass, credential-free subset 114 pass, offline release subset 8 pass; content scans clean. These are historical checks, not evidence against the later environment findings. Repair-round results are appended to `implementation/report.md` and have separate `repair-1-*` exit/evidence records.

### 5. Affected human/agent docs, one line each (AC6)
- [x] `plugin/pirax-form-test/README.md` — 0.3.0, signed GitHub channel and limits, bootstrap upload from old helper, version-only vs generic rejection, last-block behavior and key recovery.
- [x] `test/plugin/README.md` — new release/update suites, fixture signing/HTTP behavior, evidence names, safe test-key handling, correct Pro wrong-version example (6.2.16), exact commands/prerequisites.
- [x] `README.md` — concise link/description of helper self-updates vs the checker not updating client plugins, local release dry-run/publish distinction and test-command accuracy. Repair round 1 also synchronizes `test/forms/README.md` with the already-merged checker: describe its actual behavior without attributing its implementation to this leaf; the scheduled job remains excluded.
- [x] Agent docs: no `AGENTS.md` or configured grounding index/AREA exists. Added the reusable publication lesson to `learnings/LESSONS.md` with case/evidence/history in `learnings/history/2026-10-05-helper-self-update-publication.md`. This `plan.md` remains a pass artifact, not global instructions.

## Concrete verification and evidence

Install missing worktree dependencies with `bun install` (no installed `node_modules` was observed here), and use the existing supported Node/toolchain without changing the machine's global version. Install Playwright Chromium if absent. Environment names are checked with the prescribed Bun name-only scripts, never by reading an env file.

1. `bun run typecheck`.
2. `bun --no-env-file test tests` plus `bun --no-env-file test test/plugin/release.test.ts -t '^offline:'` — credential-free unit/browser and generated-key/local-tag release cases. Test itself sets a disposable seed only in the spawned dry-run environment and checks the output of the exact `bun scripts/release-plugin.ts --dry-run` command. The release file also contains separate real GitHub preflight cases; the unfiltered file and full suite require authenticated `gh`, and must run too. No actual signing key or GitHub credential is needed for the filtered cases.
3. `bun --env-file=/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/.env test test/plugin/updates.test.ts` — native WordPress updater proof. Retain `artifacts/plugin/updates-<timestamp>/update-summary.json` (versions, manifest/ZIP digests, results), sanitized fixture request ledger and the listing/install trace. Clear update transients and restore the starting plugin bytes between cases; no manual target-ZIP install may substitute for `Plugin_Upgrader`'s update route.
4. `bun --env-file=/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/.env test test/plugin/compatibility.test.ts test/plugin/safety.test.ts` — native classification matrix, entries/mail/HTTP ledgers and `compatibility-notes.jsonl`.
5. `bun --env-file=/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/.env test test/plugin` — whole plugin regression gate; about 25+ minutes baseline, longer with updates. Document exactly which new artifact directory proves AC1 and AC3.
6. `bun run build:plugin`, then configured `bun test` with the registered environment actually supplied by the harness, or explicitly `bun --env-file=/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/.env test` for the broad credentialed run. Broad tests include forms/R2 and are not credential-free. Record a literal configured-command failure rather than concealing this known invocation mismatch; do not change repository-wide discovery in this leaf.
7. Provisioning process: independently verify the new pair, run restricted `findSecret` scans before discarding private memory, then `gh secret list --repo CastrumS/pirax-castrum-maintenance --json name --jq '.[].name'` confirms the exact secret name. Rebuild the shipping ZIP with the committed public key and check the private key is absent from it.
8. `git diff --check`; inspect the scoped diff and generated ZIP allowlist, confirm no fixture keys, licensed sources, env files, real release/tag mutations or excluded checker/workflow edits.

Extra negative matrix beyond the brief's minimum: corrupted signature bytes; signed malformed manifest/hash; hostile package URL host/path/userinfo; install-time feed identity change; invalid refresh removing a previously offered update; helper direct-download bypass attempt; unrelated-plugin filter preservation; source-ownership false positives (lookalike directory and callback name); version mismatch plus external callback/form restriction; empty detected version; marker/config error precedence; audited Inventory. Tests assert booleans/counts or sanitized facts when failures could otherwise echo a credential.

## Real limitations and review notes

- The brief's “no operator step on every site” applies **after installation of an updater-equipped helper**. Current 0.2.4 cannot fetch its own first update; 0.3.0 needs one manual upload on each existing site. Thereafter WordPress still needs working cron, network/filesystem access and globally enabled updates.
- The brief's “only signed releases can ever be installed” is the automated helper-update boundary. Administrators can manually replace plugin files, and arbitrary PHP with equal privileges can remove hooks; this is not a platform-wide code-execution defense.
- Signatures provide authenticity/integrity, not freshness/availability or protection after signing-key compromise. There is no transparent key rotation. A split GitHub asset rollout/network error may temporarily suppress an update, never justify installing unchecked bytes.
- The version-only message is a diagnosis of the observed gate, not a promise a future audit will accept the plugin or that arbitrary bootstrap code already run was safe. Preserve the existing CleanTalk bootstrap/early-route limitations verbatim in substance.
- Locked design excludes checker warning/three-day escalation and scheduled release publication here despite mentioning their parent decisions. Leave those consumers untouched; no dependency is claimed merely because they later consume this interface.
- Credential-free bare `bun test` is a pre-existing brief/live-surface discrepancy. The truthful proof is a credential-free targeted run plus full credentialed native/broad runs, with no silent skips. Flag this for review rather than pretending all suites require no secrets.

## Implementation notes

2026-10-02 — Credential-gate mismatch affecting D8/AC5: implementation preflight again found `PIRAX_HELPER_SIGNING_KEY` absent, both with `--env-file=.env` and the registered repository's explicit environment-file path; GitHub secret listing returned no names. The loaded `implement-issue` skill expressly requires ending implementation when a credential is still absent from `.env`, recording `add <VAR> to .env` as an operator action. This is stricter than the synthesis skill's absent-and-unobtainable condition used above. It conflicts with D8's agent-generated, GitHub-job-only key handling and the locked design's specific storage interpretation. No locked decision is changed here, and no permission barrier is alleged: synthesis observed repository ADMIN access. Implementation stopped at this workflow mismatch, before code or key provisioning. See `implementation/report.md` for that attempt's evidence.

2026-10-05 — Resumed dispatch: `PIRAX_HELPER_SIGNING_KEY` is now present when loaded by Bun from the registered environment, and `gh secret list` lists its name. A name-only format check confirms a canonical base64 32-byte seed, and a real Ed25519 sign/verify check passes. The derived public key is `D8BfOn8TZC3jD+Hv5Q+p7SGPNGIYISVcMCqQWU0Dh9w=`. D8 is refined to use this already provisioned pair, not generate or replace an existing remote secret. The earlier absent-credential blocker is resolved externally. The local copy was supplied outside this pass; no agent opens or edits it, and the locked design's job-only storage discrepancy is noted for review rather than silently changing that design. GitHub cannot disclose its stored value; remote-name confirmation is evidence of provisioning, not readback equality. Subprocesses unrelated to signing must omit the seed.

2026-10-05 — Implementation partition: updater/bootstrap/build/core/harness (unit 1) and compatibility/messages/tests (unit 2) have disjoint edits and can run in the first wave. Release tooling and all affected human docs (unit 3) follow their landed interfaces. The configured changed-test command is the full `bun test` despite its name; workers run that resolved command with the registered environment loaded, and B retains final full-suite ownership. No discovery/skip changes are authorized.

2026-10-05 — Unit1 exposes the existing allowlisted builder as import-safe `buildPlugin({source?, zip?})` and `withoutSigningKey(env?)`; D7's release CLI will reuse that same implementation behind `build:plugin`, retaining parent-process secret scanning while stripping the signing seed from zip/unzip children. This is a code reuse/privacy refinement, not a separate packaging implementation. A machine reboot interrupted the first wave; retained worktrees were resumed using remainder briefs, not reset. Scoped updater/core tests pass; interrupted runs are not accepted as evidence. Broad runs currently take roughly 50+ minutes on this machine, beyond the old guide's estimate.

2026-10-05 — Release inspection found two concrete D7 gaps to close before handoff: (1) an invalid source version was interpolated into CLI errors before the packaging secret scan; a generated test seed placed in matching header/constant produced `outputContainsGeneratedSeed: true` (only this boolean was retained in `implementation/release-source-error-red.json`); source-parse diagnostics must be name-only. (2) `gh release create` may reuse an already-created tag, so preflight alone cannot implement D7's concurrent-tag refusal. Refine publication to atomically create the remote `refs/tags/v<version>` ref at the intended commit after build/sign, fail if it exists, then use `gh release create --verify-tag --latest`. No overwrite/delete rollback is added; an API/tag success followed by release failure leaves the tag for deliberate operator recovery. Tests must intercept all publication mutations (including that new POST) while keeping real read-only auth requests; this leaf still publishes nothing. A small additional release-hardening unit follows unit3's committed implementation. This changes implementation mechanics, not the locked signed GitHub channel or release-approval scope.

2026-10-05 — Final B copy-level repair to D7: a nonzero remote command or lost response cannot prove that no tag/release exists. Keep refusal/no-rollback behavior, but diagnostics and recovery docs must tell the operator to inspect remote state (which may include a tag, draft/partial upload or completed release), not assert “without a release” or recommend blind retry/deletion. Matching literal error assertions are updated; no safety gate is relaxed. Root documentation also distinguishes compatibility blocks from the unchanged marker/config errors and describes the excluded checker/scheduler by responsibility, not a timing-sensitive “not implemented yet” claim.

2026-10-05 — Final D3 inspection found the package-identity guard claimed every asset below this repository's releases root, including a different plugin's ZIP. Narrow that identity to the helper asset basename, keeping explicit helper context authoritative and all signature/URL/hash gates unchanged. Extend the existing unrelated-download native assertion to a different asset under the same release root, retain red/green proof, and rerun the full suite after this two-line source/test repair. A reusable publication-race/non-transactional-failure lesson is recorded in `learnings/LESSONS.md` and `learnings/history/2026-10-05-helper-self-update-publication.md`.

2026-10-05 — Repair round 1 (cap 3), reviews A/B of `f2b79e29775869e0f353824bb4aafe61280833b0`: rebase onto the merged checker leaf at `origin/main` = `e6bc04490e4a12c20db76fbc704b06e207627498`. Pure-rebase head, before repairs: **`db2cba17bed1ecccab0f433a055ff8d4b7d5a405`**. The only conflict was the root command table: kept both the helper full-suite/gh guidance and main's expanded test:forms row. This is the repair-diff baseline for A's re-check, not a claim that the stale cross-leaf prose is already fixed.

One delegated repair unit now owns: A-F1's root/plugin/forms-guide synchronization with the live checker; A-F2/B-F1's archive subprocess environment omission at the shared utility and three direct test calls; B-F2's presence-only environment assertion (including its failing-diagnostic check); and B-F3's accurate temporary generated-seed fixture description. Parent-visible seed scanning stays intact, no failing test or safety gate is weakened, and no checker/runtime PHP behavior is changed. The resolved changed command still uses configured `AKROGON_BASE=2689aaa3bd69a9a46cc77788fdc5219354cc923a`; B repeats blocking checks after landing/removing the worker. The existing local-copy policy and credential-free discovery discrepancies remain disclosed, not silently redefined.

2026-10-06 — Repair verification environment refinement (D8): worktree `.env` symlinks are present. A names-only fresh-process probe showed that merely omitting the signing variable from a Bun child's supplied environment lets automatic dotenv loading restore it; an explicit empty value prevents restoration, as does `--no-env-file`. Evidence: `implementation/repair-1-env-loading.json`. Therefore the literal configured `bun test` command receives an empty signing variable after B loads prerequisites explicitly, while isolated canary tests use `--no-env-file`. Owned non-signing children still remove the variable altogether through `withoutSigningKey()`. Historical initial-run wrapper metadata proves omission from the supplied environment, not absence after the child's automatic loading; no such runtime-absence claim is carried forward.

2026-10-06 — Repair round 1 complete: unit 5 (`086e95a`) landed as `938bf9c`; B's final typecheck/full/changed gate passed **286/0**, with **124/0** credential-free tests and **8/0** explicitly filtered offline release cases. Worker worktree removed before B's full gate. Final head is **`4e929fca0a8c793f2189454091fb5c0fcf74a1da`**: its only difference from the tested code is one `test/forms/README.md` full-suite timing/prerequisite sentence, recorded in `implementation/repair-1-final-diff.json`. All A/B Fixes are addressed; real-key/content proof is clean and the active archive-environment lesson has been dated as applied in its registered-checkout history. The ownership boundary remains unchanged: documentation now describes the already-merged checker accurately, without claiming this leaf implemented it. Scheduled work and the disclosed policy/secret-readback limitations remain excluded. A's repair re-check compares the recorded pure-rebase `db2cba1` with final `4e929fc`; evidence and limitations are in the report's repair appendix.
