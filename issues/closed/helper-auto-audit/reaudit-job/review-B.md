# Review B — reaudit-job

Date: 2026-10-07 · initial `check.review` · **verdict: fix**

- Base: `4e929fca0a8c793f2189454091fb5c0fcf74a1da`
- Reviewed head: `6e10d6c95ca27d2765fb2a8b41ff5c36a3263ed4`
- Code checkout: `issues/worktrees/reaudit-job`, clean and unchanged throughout review.
- Independent review: no peer contact, waiting, or reading of the current A review.

## Fix B-F1 — release privacy is checked after the assets have been published

**High priority.** `scripts/reaudit/publish.ts:223–236` runs the mutating release CLI before `verifyRelease()`. The full known-secret scan at `publish.ts:138` therefore runs only after tag creation and asset upload. The earlier build guard (`scripts/build-plugin.ts:28,47–51`) checks three environment values with raw `text.includes`, not `findSecret`'s encoded forms. It does not close this gap.

**Contract:** brief done criterion5; plan AC5/AC9 and D10 require final release assets, including ZIP entries, to pass the known-secret scan and a sanitation failure to stop publication. A post-upload failure is detection of disclosure, not withholding an unsafe artifact.

**Reproduction:** `review-evidence-B/prepublication.test.ts` reuses the committed publication fixture. It calls the real publisher, build, release CLI and verifier with a fresh synthetic signing key, local bare main remote and the existing gh wrapper. All GitHub mutations are intercepted; only pre-existing read-only lookups reach GitHub. The negative fixture appends the URL-encoded synthetic signing seed to the disposable source README before its fixture base commit. It does not inject an arbitrary candidate patch or claim a real credential was exposed.

Command (Node24/native gh first on PATH):

```sh
bun --no-env-file test <leaf>/review-evidence-B/prepublication.test.ts
```

Observed, `prepublication.log`, exit1:

- Clean control publishes and independently verifies at the intercepted boundaries.
- Negative case performs **2 mutations** (tag claim and release creation).
- The ZIP captured by the upload boundary **contains the encoded seed**.
- Only afterwards the publisher reports `release-asset-secret`, `publication: release-incomplete`.
- Expected zero mutation calls; got2. Total1pass/1fail. Temporary fixture checkouts, keys and synthetic assets are removed by `afterAll`.

**Required repair:** scan the exact final manifest, signature and ZIP contents for the applicable known secrets **before tag/release publication**, and withhold unsafe assets. Do not rebuild different, unscanned bytes after that gate. Preserve scoped archive-child environments, atomic tag claiming and the independent post-publication verification. Add the encoded-secret refusal regression plus a clean successful control. No automatic remote deletion/rollback should be added.

## Fix B-F2 — a skipped non-main dispatch masks an overdue main audit

**Medium priority.** `scripts/reaudit/watchdog.ts:78` requests runs without a branch filter. At lines40–43, every scheduled/manual run contributes to `lastStartedAt`, regardless of `head_branch`. But `reaudit.yml` guards every job to main, so a manual dispatch on another branch performs no audit or failure notification.

**Contract:** plan AC8/D8/D9, and README “Heartbeat and watchdog”: observe the main-only audit and notify when it has not started for >48hours. A different branch's skipped workflow is not that audit.

**Reproduction:** `review-evidence-B/watchdog-branch.ts` invokes the production observer with synthetic API response fixtures: active workflow, last main schedule at2026-10-04T03:17Z, and a non-main manual dispatch at2026-10-07T11:00Z; observer clock2026-10-07T12:00Z. No network or SMTP is invoked.

```sh
bun --no-env-file <leaf>/review-evidence-B/watchdog-branch.ts
```

Observed, `watchdog-branch.log`, exit1: `{healthy:true,reason:"healthy"}`; the requested runs URL is `.../runs?per_page=50`. Main is >80hours overdue, but the non-main timestamp suppresses the alert.

**Required repair:** constrain the queried/accepted audit history to main, and add this regression. Preserve the intentional rule that a failed **main** audit still counts as a started run; do not change this into a successful-conclusion monitor.

## Verification and scope

- Read configuration, plan including implementation refinements, design/brief/standing constraints, completed implementation report and ponytail guidance. Grounded changed behavior in root README, plugin release/support guide, native plugin guide and forms guide before judging it.
- Reviewed the candidate/run/publish chain, release/build/scanner boundary, workflow permissions/artifact attempts, notification/heartbeat/watchdog contracts and pin/harness/fixture changes. No change to shipping PHP, pins, key or callback inventory is required by these findings.
- No changed `AREA.md` exists; the AREA path audit is inapplicable. Documentation accurately distinguishes historical callback review, automated native gates, synthetic publication tests and post-merge proof. The publication privacy and watchdog promises are broken by B-F1/B-F2 rather than missing documentation.
- Test fixtures replace external boundaries, not the publication implementation under test. The new probes assert side effects/data and liveness decisions, not arbitrary prose.
- Reused immutable-head blocking evidence rather than rerunning the approximately52-minute suite: `implementation/evidence/final-full.log` ends516pass/0fail,5673expects,38files,3129.16s, exit0; final typecheck log is `tsc --noEmit` with recorded exit0. Final retained privacy scan records18native scopes,3roots,11loaded values,0findings, exit0. These successful checks do not cover the two counterexamples above.
- Existing real acquisition/deactivation and SMTP/arrival evidence remain valid. No real acquisition, mail, workflow dispatch, main push, tag/release or client-site operation was repeated for review. No environment file was opened, copied or edited.
- The documented attempt-bound artifact lesson is supported by strict candidate/summary consumers and their two-attempt fixtures. Unique-backup restoration keeps the byte-restoration oracle; atomic publication protections remain intact. No lesson/index wording was used as an additional acceptance criterion.
- Post-merge real workflow/release-or-mail proof, no-change repeat, installed watchdog observation and elapsed schedule/heartbeat evidence are still outstanding as the plan explicitly requires. Same-host total Actions/SMTP outage and hard-kill license cleanup remain accepted limitations, not new Fixes.

## Nits

None. The original plan's unchecked execution checklist is superseded by the detailed report/evidence and is not a material correctness blocker.

## Lifecycle

`akrogon phase reaudit-job check.fix --slot B --verdict fix` returned **`recorded`**. B's verdict is submitted; this is not proof of movement to repair. The aggregate awaits the other initial verdict. Output: `review-evidence-B/phase.log`.
