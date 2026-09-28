# Unit 1 — optional native stack and contained evidence

## 1. Goal

Implement plan D6 and the fixture/transport portions of D5/D7 in `/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/worktrees/helper-compat`. Establish real optional FF Pro 6.2.14 + CleanTalk 6.88 + FluentSMTP 2.4.0 alongside existing GF 3.1.2/FF 6.2.14, with no third-party egress or real mail, preserving default harness callers. This unit does not change production PHP.

## 2. Numbered acceptance criteria

1. Existing `startHarness({run})` remains GF+FF-only and requires no Pro ZIP; opt-in `compatibility: true` requires `FLUENT_FORMS_PRO_ZIP`, activates exact optional plugins, exposes versions and all ZIP hashes.
2. Preflight/version errors name variables, never values. Token and both licensed ZIP paths are absent from retained artifacts; no licensed path on child argv. Requested missing prerequisites fail, never skip.
3. Safeguards are installed before optional plugin activation. Outgoing Requests-level third-party HTTP is intercepted/logged safely (CleanTalk bypasses pre_http_request). Repair B-F1 additionally requires the incoming request context in the HTTP ledger to be path-only: no appended query strings or nonce values. The repair is executed under brief-5.md. CleanTalk uses its actual moderation path via the WP HTTP API; successful fixtures prevent fallback to direct transport, with browser/Playground containment. No real API key required.
4. Ordinary native FF and GF controls reach intercepted CleanTalk moderation. A real enabled Pro WebHook module/feed to a loopback capture URL executes once for ordinary FF after native queue draining. No stand-in integration dispatcher.
5. FluentSMTP replaces wp_mail and reaches its real Simulator provider/log. Toggle only harness pre_wp_mail observer to observe without short-circuiting; retain production guards. Effective To/Cc/Bcc/subject/custom headers and simulator evidence are readable. Simulator routing is enabled before any send. Baseline observer behavior is unchanged.
6. Meaningful harness/preflight/ordinary-stack tests fail before implementation and pass after; existing default suites stay compatible. Evidence is redacted, traces on, video/snapshots/screenshots off.

## 3. Read-first list

- `/home/rudi/.pi/agent/skills/implement-issue/ponytail.md`.
- `test/plugin/README.md`, `plugin/pirax-form-test/README.md`, root README plugin section.
- `test/plugin/{harness.ts,playground.ts,mu-plugin.php,fixtures.php,artifacts.ts,harness.test.ts}`; copy existing serialized PHP bridge/observer/native browser patterns, not a new framework.
- `test/plugin/adapters.test.ts` for submit/queue patterns and `review-regressions.test.ts` for effective envelopes.
- Ignored `.cache/helper-compat-audit/` contains inspected vendor sources. CleanTalk integrations/public/common/HTTP files; FF Pro `src/Integrations/WebHook/{Bootstrap,Client,NotifyTrait}.php`; FluentSMTP `app/Functions/helpers.php` and Simulator handler. Licensed ZIPs can be accessed only internally via `bun --env-file=.env` without printing values.

## 4. Change list and needed interfaces

Own `test/plugin/harness.ts`, `playground.ts`, `mu-plugin.php`, `fixtures.php`, `harness.test.ts`; add `stack-harness.test.ts` if this keeps the baseline suite isolated. Reuse `artifacts.ts`; edit only for a demonstrated gap.

Add typed `startHarness({run, compatibility?: boolean})`, optional version/manifest fields, and additive HTTP, effective-envelope and simulator readers. The next unit needs to count submissions separately from activation/background traffic, configure Pro opt-in/approval/auto-delete fixtures and inspect native queues. It also needs ordinary HTTP/WebHook controls and transport records to compare marked submissions. Document exact interfaces and fixture options in your report. Preserve existing `MailRecord`, `FeedRecord`, queue and browser caller contracts.

## 5. Do-not, reasons and exceptions

- Never open/read/write/print `.env` or `.env.*`; execute scripts with `bun --env-file=.env` and print results/names only. No secrets/ZIP paths in command argv, errors or logs.
- No production plugin, checker `src/**`, sites, package dependencies, live sites, lifecycle commands, commits or issue artifacts inside the worktree. This unit is test infrastructure only.
- No network/mail escape or mocked form dispatch: boundaries are HTTP/mail transport, not plugin behavior.
- Return a mismatch with concrete evidence and smallest brief correction if requirements/interfaces/scale conflict; do not relax criteria. Only B's revised brief authorizes an exception. These exclusions protect credentials, real clients, ownership and native evidence; their only exception is an explicit revised brief, never convenience.

## 6. Ordered steps

1. Derive failing harness/preflight and native ordinary-control tests from criteria 1–6; record red output without secrets.
2. Extend `harness.ts`/`playground.ts` safely for extra installs/version/manifest/containment, criteria 1–3.
3. Extend mu-plugin/fixtures for real Pro webhook, native CleanTalk capture, effective FluentSMTP simulator observers, criteria 3–5.
4. Complete tests and privacy verification; record exact interfaces and evidence paths, criterion 6.

Advisory size: approximately 6 files, under 70 turns. Beyond that, return remaining work and evidence; this is not a reason to discard edits or silently omit verification.

## 7. Commands

Resolved changed-tests command (configured runner currently selects all tests; do not invent a narrower replacement or run separate full-suite commands):

```sh
AKROGON_BASE=e2075daad1c5b0dd2438ff61d71e606c47819a39 bash -c ': "${AKROGON_BASE:?AKROGON_BASE is required}" && bun test'
```

Use this for red/green evidence; credentials load through Bun's environment loader. B owns final full-suite/typecheck/build checks after the units. Dependencies are installed. If a prerequisite really requires operator action, report the name/action, never a value.

## 8. Done-when, evidence and report

Criteria implemented with native ordinary controls, meaningful red/green evidence and privacy checks; leave a report at `/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/open/helper-compat/helper-compat/implementation/worker-1.md`, including command results and artifact paths. Record incomplete/unverified work honestly. Do not commit. Final response can be short and point to the report.

Changed files and reasons: <paths and why>
Tests run: <commands and results, red then green, evidence paths>
Known limitations: <limitations or none known>
Unverified criteria: <criterion and why, or none>
