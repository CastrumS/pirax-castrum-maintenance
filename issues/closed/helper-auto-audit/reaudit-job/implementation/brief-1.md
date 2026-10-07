# Unit 1: one pin source and bump-resilient native tests

## 1. Goal

Implement plan D1/D2/D11 baseline refactor in detached worktree `/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/worktrees/reaudit-job-u1`. The five vendor pins remain unchanged and their only authority is the production PHP AUDITED_VERSIONS literal table. Future pin/helper bumps must not strand native tests or the forms harness.

## 2. Numbered acceptance criteria

1. A strict import-safe shared reader validates exactly gf, ff, ff_pro, cleantalk, fluent_smtp; malformed/missing/duplicate/unknown/nonliteral values fail. Shipping helper header/constant agree. Tests show red then green.
2. Harness, release manifest and native expected versions consume that reader. Both licensed ZIPs must match pins, free cached ZIPs retain header validation. Preserve release atomic-tag ownership and uncertainty-aware diagnostics.
3. No fixed audited-vendor versions remain in test/plugin/*.test.ts; wrong-version fixtures derive genuinely different versions. Preserve exact-string matrix edge cases, mutation readback/restored hashes, messages and native safety assertions.
4. Core/release fixtures tolerate two future shipping helper patch bumps. Explicit synthetic helper versions in updates.test.ts remain legitimate; its unrelated FF URL derives from FF pin. Disposable release checkouts copy the new reader.
5. test/forms/harness.ts follows shared GF/FF pins. Four guides describe pin authority/dynamic prerequisites and mark historical evidence as historical, without claiming future audits already passed.

## 3. Read-first list

Read `/home/rudi/.pi/agent/skills/implement-issue/ponytail.md`, this leaf's plan.md D1/D2/D11 and implementation notes, plugin/pirax-form-test/README.md, test/plugin/README.md, test/forms/README.md, root README opening commands. Existing patterns: scripts/release-plugin.ts strict literal parser and test/plugin/update-fixture.ts version substitutions. Inspect harness and all affected native tests before editing.

## 4. Change list and needed interfaces

Own scripts/plugin-source.ts; reader integration only in scripts/release-plugin.ts; test/plugin/harness.ts; new test/plugin/version-fixtures.ts; test/plugin/{harness,core,stack-harness,safety,compatibility,release,updates}.test.ts; test/forms/harness.ts; tests/plugin-source.test.ts; README.md, plugin/pirax-form-test/README.md, test/plugin/README.md, test/forms/README.md.

Export synchronous `PIN_KEYS`, `AuditedVersions`, `parseAuditedVersions(text): AuditedVersions`, `readAuditedVersions(sourceDirectory?): AuditedVersions`, `readHelperVersion(sourceDirectory?): string` from scripts/plugin-source.ts. Default directory is shipping plugin source resolved from module path, not cwd. Preserve existing harness exports and add GF_VERSION. Source reader errors name fields only.

No predecessor needed. Unit 2 owns scripts/reaudit acquisition and separate tests only; no shared edits. Do not change production pin values/header version. Subsequent worker will own bump/doc regeneration and operations on your committed interfaces. Docs should link to canonical pins instead of duplicating current vendor literals unnecessarily; production plugin support table remains for later generation.

## 5. Do-not, reasons and exceptions

Do not weaken safety assertions, replace native execution with mocks, update callbacks, touch client site config, publish, mutate GitHub, or alter current pins/version: this is a structural prerequisite, not an audit approval. Keep synthetic helper-release ordering fixtures and arbitrary checker parser fixtures; those are not audit pins.

Never open, print, copy, create or edit .env/.env.*. Load credentials only through Bun --env-file=/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/.env; never print values. Tests of private inputs use synthetic values. Do not write artifacts under issues/ in your worktree; place report/logs in authoritative leaf implementation/evidence-u1.

Return a mismatch with evidence if scope/interface conflicts or work exceeds the advisory scale; only B's revised brief authorizes changes. These exclusions preserve audit truth, security and independent edits; exceptions are explicit synthetic protocol fixtures or a revised brief, not convenience.

## 6. Ordered steps

1. Create focused parser/fixture tests from AC1–4 before implementation; retain failing output without secrets.
2. Implement reader and integrate release/harness (AC1–2).
3. Refactor native test constants, exact mismatch matrices and release disposable fixtures (AC3–4); check every literal source mutation matches exactly once.
4. Refactor forms harness and four guides (AC5); do not erase historical limitation evidence.
5. Install dependencies under Node24, build plugin, run focused green checks and configured changed-tests command. Preserve evidence and repair only owned defects; report unrelated failures concretely.
6. Commit only owned changes in detached worktree and return commit/report.

Advisory size: about 16 files, under 100 turns; report scale mismatch with evidence rather than silently dropping files.

## 7. Commands

Prepend `/home/rudi/.local/share/mise/installs/node/24.21.0/bin` to PATH. Install dependencies with `bun install --frozen-lockfile`, ensure Chromium exists, build plugin before broad tests.

Resolved changed-test command: `: "${AKROGON_BASE:?AKROGON_BASE is required}" && bun test`, with AKROGON_BASE=4e929fca0a8c793f2189454091fb5c0fcf74a1da. Run it with credentials loaded without reading the file:

```sh
AKROGON_BASE=4e929fca0a8c793f2189454091fb5c0fcf74a1da bun --env-file=/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/.env -e 'const p = Bun.spawn(["bash", "-c", ": \"${AKROGON_BASE:?AKROGON_BASE is required}\" && bun test"], {env: process.env, stdout: "inherit", stderr: "inherit"}); process.exit(await p.exited)'
```

Focused red/green commands are derived from your new test paths. Do not run a separate full-suite alias; B owns final verification.

## 8. Done-when, evidence and report

Commit the unit and write `/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/open/helper-auto-audit/reaudit-job/implementation/report-u1.md` with commit hash, changed paths/reasons, red/green evidence and configured changed-test actual result (include exit code and counts), limitations/unverified criteria. Native tests leave artifacts/plugin evidence in this worker until B inspects; copy safe summaries/logs to authoritative evidence-u1 before removal. No assertion may print real secret subjects. Return the commit hash and report path; no lifecycle command.

Changed files and reasons: <paths and why>
Tests run: <commands and results>
Known limitations: <limitations or none known>
Unverified criteria: <criterion and why, or none>
