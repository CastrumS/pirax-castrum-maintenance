# Review B — helper-self-update

Date: 2026-10-05
Verdict: **fix**
Base: `2689aaa3bd69a9a46cc77788fdc5219354cc923a`
Reviewed head: `f2b79e29775869e0f353824bb4aafe61280833b0`

Initial review, blind to the peer's current review. The leaf worktree is clean and unchanged by this review. No environment file was opened or modified; the additional probes used public synthetic canaries only.

## Fixes

### F1 — Archive helpers still inherit the signing variable (P2)

**Locations:** `test/plugin/artifacts.ts:47–48`; new caller at `test/plugin/core.test.ts:98`; trace sanitation through `test/plugin/harness.ts:448`; documented guarantee at `test/plugin/README.md:42`.

**Contract:** plan D8 requires omitting `PIRAX_HELPER_SIGNING_KEY` from unrelated build/test/Playground children while keeping parent-visible scanning. AC5/AC6 cover privacy and accurate test guidance. The guide explicitly promises withholding the seed from zip/unzip when it is present in the test environment.

The shared artifact `run()` calls `Bun.spawn()` without an `env`. Consequently, `findSecret()` and `sanitizeZip()` pass the signing variable to their unzip/zip children. The new core scan explicitly reads the parent's signing variable as a needle, so this is a live path under the documented direct environment-loaded test invocation, not just the earlier one-off B scan mentioned in the report. Clearing it in B's outer test wrapper makes that wrapper safe but leaves these callers and the documented invocation unfixed.

**Reproduction/evidence:** `review-B-env-proof.json`. Fresh Bun children invoked the unchanged artifact functions against a one-file ZIP. PATH wrappers recorded presence booleans, stripped the canary before delegating, and executed the real zip/unzip tools. With a public non-key canary in the signing variable, observations were:

```text
findSecret content hits: 0
findSecret unzip: signingKeyPresent=true
sanitizeZip unzip: signingKeyPresent=true
sanitizeZip zip: signingKeyPresent=true
without-key control unzip: signingKeyPresent=false
```

An initial probe changed PATH inside an already-started Bun process and did not reach the wrappers; it was discarded, not treated as evidence. The retained proof starts fresh processes with the intended PATH/environment.

**Required repair:** omit the signing variable at the shared archive subprocess boundary, reusing the existing environment helper rather than deleting it globally. Preserve parent-side secret comparison. Add a generated/synthetic, presence-only regression covering both scanning and sanitizing archive children. Do not rely solely on the outer verification runner's scrub.

### F2 — The new environment assertion can print unrelated real credentials on failure (P2)

**Location:** `test/plugin/updates.test.ts:170–172`.

**Contract:** D8 keeps credential-bearing captured buffers out of assertion diagnostics; AC5 requires no private material in logs. The test guide's privacy section also explicitly warns against real credential-bearing matcher inputs.

The test runs `env` using `{ ...process.env, PIRAX_HELPER_SIGNING_KEY: "synthetic-seed-for-env-test" }`, captures the entire output, then passes that string to `expect(names).not.toContain(...)`. Only the signing variable is synthetic; the documented native invocation loads the real form token, licensed ZIP paths and other repository credentials. If seed stripping regresses—the condition this assertion is meant to catch—the failing matcher prints that environment, including unrelated credentials. Passing runs do not exercise this failure behavior.

**Reproduction/evidence:** `review-B-matcher-proof.json`. A fresh test process with only synthetic credential values ran the same `env` capture and string matcher in its failing state. It exited 1 and printed the synthetic `FORM_TEST_TOKEN` value. The canary was provided only in the environment, not in the test source, so this was diagnostic output rather than a displayed source literal. No real credential was loaded or exposed by this probe.

**Required repair:** observe/assert only a boolean or variable-name presence result, preferably emitting that result directly from the child instead of dumping its environment. Preserve the meaningful absence check and demonstrate that its failing path does not print a credential-shaped canary.

### F3 — Release test privacy documentation incorrectly promises memory-only test keys (P3)

**Location:** `test/plugin/README.md:186`; contradictory implementation at `test/plugin/release.test.ts:53–66,339,376`.

**Contract:** AC6 requires accurate test/evidence guidance.

“Private test keys stay in memory” is false for the release privacy regressions: `checkout()` writes a generated seed into the temporary PHP header/constant or README and commits that fixture to a disposable git checkout. Those writes are intentional and useful for testing the guard, and `afterAll` removes the checkout; they are not production-key writes. Nevertheless, they are filesystem writes, not memory-only handling.

**Required repair:** describe the exception precisely: generated disposable seeds may temporarily appear in the privacy-regression checkout, those checkouts are cleaned up, and private values are not retained in the published/test evidence. Keep the production-seed prohibition and the useful regression tests intact. No behavioral change is needed for this finding.

## Other reviewed behavior and evidence

- Reviewed the whole initial diff, plan/implementation notes, locked design, implementation report and changed human documentation. No AREA file/index was changed, so no AREA path inventory applies.
- Updater verification binds exact signed bytes to a canonical versioned URL and downloaded SHA-256, revalidates at install time, rejects unsafe pre-populated results, and preserves unrelated packages. The same-repository different-asset repair is covered by retained red/green native evidence.
- Native positive installation is a real authenticated wp-admin update, not a manual target-ZIP substitution. The fixture changes only disposable public-key/channel/version constants; update/auth HTTP is not mocked. The 34 invalid-feed cases and install-time failures check unchanged installed file digests as well as version.
- Version-only diagnosis uses reflected declaring files, not callback names. Native tests cover Pro 6.2.16 versus audited Inventory, compound causes, ordinary controls, entry/mail/feed effects, and the GF early no-unaudited-form-read boundary.
- Release CLI source parsing, exact-byte signing, local/remote refusal and atomic ref-claim sequence were inspected. Read-only GitHub authentication remains real; publication mutations are intercepted at a strict boundary and are correctly reported as unverified against real remote writes.
- The publication lesson's claim is supported by `implementation/gh-release-create-help.txt`, the command sequence and retained unit-4 red/green evidence. No claim of a real remote publication is inferred from the command-boundary tests.
- Documentation changed for channel/rollout, release recovery, messages and test handling. The concrete inaccurate privacy claims above block; no missing newly referenced file path was found. Checker/scheduler responsibilities remain excluded.

## Checks accepted / additional verification

No code changed since the implementation checks, so the successful broad suites were not repeated solely for review:

```text
Typecheck + configured full/changed command: exit 0
271 pass, 0 fail, 3586 expects, 24 files
Standalone plugin suite: exit 0
92 pass, 0 fail, 1583 expects, 9 files
Credential-free subset: 114 pass, 0 fail
Offline release subset: 8 pass, 6 explicitly filtered, 0 fail
```

Evidence: `implementation/final-checks.{log,json}`, `final-plugin.{log,json}`, `final-unit.log`, `final-offline-release.log`, `evidence-final/`, `key-proof.json` and `final-artifact-scan.json`. These establish passing behavior/content scans but do not negate F1's child-environment gap or F2's unsafe failure diagnostics. Additional review verification is the two synthetic probes above; no real tag/release/secret mutation or credentialed rerun was needed.

## Recorded limitations, not additional Fixes

- Bare credential-free `bun test` discovers existing credentialed suites. The explicit credential-free subset plus full credentialed runs are truthful; no skip/discovery workaround was introduced.
- The pre-existing externally supplied local signing copy conflicts with the locked job-only wording, as already recorded in the implementation notes. This review does not authorize env edits, rotate the trust root, or claim GitHub secret-value readback. The code repairs above need no operator permission or credential change.
- Bootstrap upload from 0.2.4, active-helper/global-update/cron prerequisites, unavailable freshness guarantees, manual key recovery, and excluded real publication/deployment are documented limitations rather than newly discovered functional failures.

A reusable archive-child-environment lesson was recorded, per review protocol, in the **registered checkout** at `learnings/history/2026-10-05-helper-archive-child-environment.md` with an active mechanism/date/history line in `learnings/LESSONS.md`. Those documentation edits are left for the operator to commit; they are not changes to the reviewed leaf commit.

Requested transition: `check.fix` for F1–F3. No peer verdict was read or assumed.
