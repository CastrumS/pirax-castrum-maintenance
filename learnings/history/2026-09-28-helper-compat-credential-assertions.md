# Helper compat: a failing assertion printed a credential-bearing return value

Recorded: 2026-09-28 (helper-compat, implementation unit 1, red run before implementation).

## Case

Unit 1 added a test that expected the harness `preflight(env, { compatibility: true })` to throw when `FLUENT_FORMS_PRO_ZIP` was missing, and passed it the real environment's `GRAVITY_FORMS_ZIP`. Before the implementation existed, preflight did not throw and returned normally. Bun's failing `toThrow` matcher then printed the received return value. That object held the real licensed Gravity Forms ZIP path. The error messages were safe, because preflight names only the variable, but the matcher diagnostics bypassed that.

The path appeared once in the local red-run log under `/tmp`. It was never in retained artifacts, the worktree or displayed output. No secret value is recorded here.

## Evidence

- Leaf report `issues/open/helper-compat/helper-compat/implementation/worker-1.md`, "Privacy verification": the incident, the scrub and the fix.
- The two copies of the red log were redacted in place with the harness's `redact()` (1 replacement each). The green log and the 11 artifact directories from that session had 0 `findSecret` hits for the token and both licensed paths.
- Fix in `test/plugin/harness.test.ts`: the compatibility preflight test now uses a temporary stand-in GF file instead of `process.env.GRAVITY_FORMS_ZIP`, so a failing assertion can only print synthetic values. Verified with a targeted run (2 pass).
- The plan's implementation notes (`plan.md`, "D6 privacy fixture constraint") carry the rule for later tests.

## Learning

Artifact redaction and name-only error messages do not cover the test runner's own output. When an assertion fails, the matcher prints the received value, whether that is a return object, the thrown value or the `expect` subject. If the subject can contain a credential, a red run leaks it into logs. Feed such tests synthetic stand-in credentials, never the real environment values, and scrub any red log produced before the fix.
