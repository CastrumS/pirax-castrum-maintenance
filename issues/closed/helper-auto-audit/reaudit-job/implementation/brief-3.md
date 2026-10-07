# Unit 3: safe failure mail, heartbeat and schedule observation

## 1. Goal

Implement independent operational helpers from plan D8–D10 in detached worktree `/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/worktrees/reaudit-job-u3`. No dependency on new pin/acquisition code. GitHub workflows/orchestration land in a later unit.

## 2. Numbered acceptance criteria

1. `notify.ts` formats only validated safe structured facts (stage, reason code, old/candidate numeric version maps, official run URL, cleanup/publication outcome). Recipient piraxcastrum@gmail.com, subject `[pirax-audit] ...`, Gmail implicit TLS465 via existing nodemailer and IMAP_USER/IMAP_PASSWORD. No raw exception/vendor response/private URL in body/logs; bounded timeouts, one attempt, failure exits nonzero without recursion. Imports are inert.
2. A `--selftest` CLI sends one clearly labeled harmless failure notice and produces only safe delivery facts. Real Gmail auth is used for real verification, never mocked. You may run this one authorized live selftest after synthetic checks, but never print response bodies/credentials. Record arrival separately if possible through dedicated mailbox read-only lookup; SMTP acceptance alone is not delivery proof.
3. `heartbeat.ts` has a pure injected-clock >=30day due predicate. Real operation fetches fresh main, writes only `.github/audit/heartbeat.txt` on a clean disposable/main-target checkout, rechecks main and pushes normally without force, tags or release. If not due, no commit. Reject unsafe branch/dirty state and arbitrary file changes. Scripts do not mutate real GitHub during unit tests.
4. `watchdog.ts` read-only gh Actions queries audit workflow active/disabled status and latest STARTED schedule/manual audit timestamp. >48h overdue or disabled triggers safe notice; a failed recent audit means scheduler is alive. Missing/malformed/API failure facts are not healthy. Missing history handles initial installation explicitly. Imports inert, healthy check no email. Same-host total scheduler outage remains a documented limitation, not a claimed guarantee.
5. Synthetic tests cover time boundaries, malformed dates/future timestamps, version/URL/message injection, missing credentials by name, notification errors and safe child environments. Keep partial publication vocabulary uncertainty-aware. Red/green evidence and configured changed-test result retained.

## 3. Read-first list

Read `/home/rudi/.pi/agent/skills/implement-issue/ponytail.md`, leaf plan.md D8–D10/D12 and implementation notes, design.md notice/host constraints, root README commands, test/plugin/artifacts.ts, scripts/release-plugin.ts, test/forms/mailbox-selftest.ts and src/mail/{config,imap}.ts. Existing patterns: nodemailer transport timeouts and safe errors in mailbox-selftest; real gh lookup refusal in release-plugin. Do not inherit mail:selftest's extra SMTP_* prerequisites: use IMAP_USER/PASSWORD and fixed Gmail host.

## 4. Change list and needed interfaces

Own scripts/reaudit/{notify,heartbeat,watchdog}.ts and tests/reaudit-operations.test.ts. Add small helper only if necessary and report it. Do not edit workflows/docs/pins/harness/acquisition files; workers1/2 and later integration own those.

Export types/functions for integration: a strict `FailureSummary` and `sendFailure(summary, env?)`; notice CLI supports `--selftest` and a nonsecret summary JSON path. Export heartbeat due predicate and operation callable from a final independent workflow job. Export watchdog normalize/decision function and CLI that uses real read-only gh and sendFailure. Pin inputs are structurally five-key numeric version records; do not import not-yet-landed pin helper.

No predecessor required. Shared test artifacts use unique temp dirs. Fixed repo CastrumS/pirax-castrum-maintenance, main branch; failures report safe stage facts not arbitrary git/gh stderr. Real heartbeat executes only under an explicit CLI operation, never tests/imports.

## 5. Do-not, reasons and exceptions

Do not publish, modify real main/tags, create schedules remotely, disable production workflow to test watchdog, or mock auth as integration evidence. Tests may use local temp git remotes and strict command boundaries; real selftest may send one harmless email. Keep unknown publication outcome explicit rather than say nothing was published.

Never open/print/copy/write .env/.env.*. Load actual values via Bun --env-file=/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/.env only; never print values or pass them to matchers. Secret-handling negative tests use synthetic stand-ins. Keep logs/report in authoritative leaf implementation/evidence-u3, not worker issues/.

Return mismatch with evidence instead of changing scope/interface; only a revised brief from B is an exception. These exclusions keep live mutations scoped, authentication truthful and worker edits independent; exceptions are the one mail selftest, local fixtures or B's revision.

## 6. Ordered steps

1. Write failing tests for safe structured notices and injected-clock predicates before code.
2. Implement notify.ts with fixed recipient/transport, safe error boundary and selftest (AC1–2).
3. Implement heartbeat.ts using local git fixture end-to-end proof without real GitHub mutation (AC3).
4. Implement watchdog.ts with response validation, pure decisions, read-only live healthy query when possible (AC4).
5. Run green tests, authorized mail selftest with safe evidence, dependency install/build and configured changed tests; repair only owned failures (AC5).
6. Commit owned changes and report exact interfaces/evidence/limits.

Advisory size: 4–6 files, under 40 turns; report evidence-backed scope mismatch rather than silently omit criteria.

## 7. Commands

Node24 PATH prefix `/home/rudi/.local/share/mise/installs/node/24.21.0/bin`; install `bun install --frozen-lockfile`; Chromium and `bun run build:plugin` before broad native checks.

Resolved changed-test command `: "${AKROGON_BASE:?AKROGON_BASE is required}" && bun test` with AKROGON_BASE=4e929fca0a8c793f2189454091fb5c0fcf74a1da:

```sh
AKROGON_BASE=4e929fca0a8c793f2189454091fb5c0fcf74a1da bun --env-file=/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/.env -e 'const p = Bun.spawn(["bash", "-c", ": \"${AKROGON_BASE:?AKROGON_BASE is required}\" && bun test"], {env: process.env, stdout: "inherit", stderr: "inherit"}); process.exit(await p.exited)'
```

Derive focused red/green checks from owned test file. B owns final full-suite verification.

## 8. Done-when, evidence and report

Commit and write `/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/open/helper-auto-audit/reaudit-job/implementation/report-u3.md`, with commit hash, exact exported signatures/CLI, paths/reasons, tests/exit/counts and evidence paths, real mail/read-only GH/local git versus fixture distinctions, limitations/unverified items. No phase command. Do not declare SMTP success to be mailbox arrival without evidence.

Changed files and reasons: <paths and why>
Tests run: <commands and results>
Known limitations: <limitations or none known>
Unverified criteria: <criterion and why, or none>
