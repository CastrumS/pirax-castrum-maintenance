# Unit 2: official package discovery, acquisition and provisioning

## 1. Goal

Implement plan D3–D5 acquisition/setup in detached worktree `/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/worktrees/reaudit-job-u2`. Resolve five latest packages; use GPL Vault's official updater in disposable Playground, never reimplement its REST protocol. No publication or pin mutation.

## 2. Numbered acceptance criteria

1. Pure fixture-tested discovery validates complete five-key matrices (gf,ff,ff_pro,cleantalk,fluent_smtp), stable numeric ordering including multi-digit components, no change, malformed/missing/duplicate products, downgrade and ambiguous equal spellings; 6.2.14→6.2.15 FF fixture detects change.
2. Changed discovery acquires all five packages with HTTPS/download response bounds, main-file Version and SHA256 checks. No change downloads no form packages. Free files occupy harness version-keyed cache paths; paid ZIP paths are private local results only. Failure never substitutes old packages.
3. Official updater runs under Node24 Playground WP7.1.2/PHP8.3 with networking: activate/save/enable, native updater self-update then fresh PHP request, schema filter for two paid main files at pins, download(), finally confirmed deactivate on success/nochange/caught failure. Mark attempted activation before request; cleanup failures fail. No paid URL/raw API response in public output. Catchable signals permit cleanup; hard-kill limitation explicit.
4. Explicit setup uses existing GPLVAULT_UPDATER_PASSPHRASE (now present), encrypts official ~/Downloads/gplvault-updater.zip via private GPG descriptor, validates roundtrip, sets matching secret and four GPL/Gmail secrets via gh stdin. Preserve signing secret; no automatic rotation or environment mutation. Setup imports have no side effects.
5. Test secrets are synthetic; children have minimal environments, private URLs are transient, errors name stage/field only. Retained evidence passes existing findSecret.

## 3. Read-first list

Read `/home/rudi/.pi/agent/skills/implement-issue/ponytail.md`, this leaf's design.md and plan.md D3–D5/implementation notes. Read test/plugin/README.md, test/plugin/playground.ts, test/plugin/harness.ts, test/plugin/artifacts.ts, scripts/build-plugin.ts. Existing pattern: Node-side runCLI and private stdin control protocol in playground.ts. Inspect official updater source by extracting needed files from ~/Downloads/gplvault-updater.zip to private scratch, not dumping its entire archive. No env files may be inspected.

## 4. Change list and needed interfaces

Own scripts/reaudit/{detect,fetch,gplvault-playground,setup}.ts and tests/reaudit-{detect,fetch}.test.ts. You may add small acquisition-only helpers/tests when necessary; report them. No docs or pin/release/harness edits (unit1 owns these). No predecessor required: accept structurally typed five-key version records, so no runtime dependency on not-yet-landed unit1 source reader.

Expose import-safe functions to subsequent orchestration: validate/compare complete versions; `acquirePackages({pins, directory, env?})` returning `{status:'unchanged'|'changed', versions, packages, lifecycle}`; packages keyed by all five pin keys with version, sha256, absolute path; lifecycle attempted/confirmed activation/deactivation and safe counts where official client exposes them. No return/download URL in public candidate metadata. Adapt exact function names if sensible, but document signatures precisely for B. The orchestrator needs discover+fetch in one license lifetime and final cleanup before return. Env optional permits synthetic unit tests; live auth is never faked as integration proof.

Setup CLI `bun --env-file=<root>/.env scripts/reaudit/setup.ts` is explicit, safely refuses mismatched/existing encryption state, and writes only ciphertext in `.github/audit/gplvault-updater.zip.gpg` when invoked. Do not run it against real GitHub yet; B will provision after inspecting your code. Existing credentials: GPLVAULT_LICENSE_KEY, GPLVAULT_PRODUCT_ID, GPLVAULT_UPDATER_PASSPHRASE, IMAP_USER, IMAP_PASSWORD, PIRAX_HELPER_SIGNING_KEY are present. Official updater ZIP exists, design says version5.3.9. Existing repository signing secret exists.

## 5. Do-not, reasons and exceptions

Do not implement GPL REST, mock auth as real proof, edit main/pins, publish, alter activation on client sites, or expose paid sources: official transient acquisition only. No new dependency unless existing Bun/Node/Playground cannot do it; report mismatch first.

Never open/print/copy/write .env/.env.*; load via Bun --env-file only. Never print credential values, private URLs, raw PHP/vendor error bodies or auth responses. Use synthetic secrets for negative test matcher subjects. No actual GitHub writes/setup run in this unit; real acquisition can be verified later by B after integration. No files under worker issues/; evidence belongs to authoritative leaf.

Return mismatch with concrete evidence and smallest correction rather than changing scope/interface; exception is B's revised brief. These limits preserve official-source ownership, real auth evidence and safety; only a revised brief permits scope changes.

## 6. Ordered steps

1. Derive meaningful fixture/ZIP/cleanup/secret tests from AC1–5 and record red result.
2. Inspect actual official client interfaces and response structure, not guessed protocol. Implement normalization and stable compare in detect.ts (AC1).
3. Implement private Node Playground client with finally cleanup and validated versioned packages in fetch.ts (AC2–3).
4. Implement explicit environment/stdin-only encryption/provisioning setup and synthetic child-boundary tests (AC4–5).
5. Install dependencies under Node24, run focused green tests and configured changed tests; build shipping plugin first. Repair owned failures, report unrelated failures.
6. Commit code only and return interface/report/evidence; B runs live setup/acquisition.

Advisory size: 6–9 files, under 60 turns; evidence-backed mismatch rather than omitted functionality.

## 7. Commands

Prepend `/home/rudi/.local/share/mise/installs/node/24.21.0/bin` to PATH; `bun install --frozen-lockfile`, installed Chromium, `bun run build:plugin` are prerequisites.

Resolved changed-test command is `: "${AKROGON_BASE:?AKROGON_BASE is required}" && bun test`, AKROGON_BASE=4e929fca0a8c793f2189454091fb5c0fcf74a1da:

```sh
AKROGON_BASE=4e929fca0a8c793f2189454091fb5c0fcf74a1da bun --env-file=/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/.env -e 'const p = Bun.spawn(["bash", "-c", ": \"${AKROGON_BASE:?AKROGON_BASE is required}\" && bun test"], {env: process.env, stdout: "inherit", stderr: "inherit"}); process.exit(await p.exited)'
```

Derive focused red/green commands from owned tests. B runs final suite separately.

## 8. Done-when, evidence and report

Commit only unit changes and write `/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/open/helper-auto-audit/reaudit-job/implementation/report-u2.md`: commit, exact public interfaces, changed paths/reasons, test results with exit/counts and red/green paths, real-vs-fixture evidence distinction, limitations/unverified criteria. Save sanitized logs under authoritative implementation/evidence-u2. No lifecycle transitions.

Changed files and reasons: <paths and why>
Tests run: <commands and results>
Known limitations: <limitations or none known>
Unverified criteria: <criterion and why, or none>
