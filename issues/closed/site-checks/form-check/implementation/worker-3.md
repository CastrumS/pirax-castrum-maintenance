# Worker 3 — browser checker and production commands

Read `brief-3.md` before editing and reread section 8 before this report. Preserved all predecessor config/mail/report/patch/test work. No commits, lifecycle commands, environment-file inspection/editing, live-site form execution, new SMTP delivery, or plugin PHP/capture/compare changes. New browser mutations targeted only disposable loopback fixtures. Authoritative evidence is `implementation/evidence/worker-3/`, not an issue directory inside the worktree.

## Changed files and reasons

- `src/forms/detect.ts` — one actual-form traversal, GF/FF/unknown classification, deduplicated safe selectors, numeric plugin identity and structural SHA-256 identity recheck (never field values).
- `src/forms/fill.ts` — cryptographic 12-character IDs; whole-form inspection before typing; visible writable basic fields; intact first textarea/plain-text marker; native validation; hidden nonce/honeypot preservation; bounded conditional stabilization; unsupported upload/custom/multistep/payment/password/external/draft/ambiguous flows. Resolves audited native GF postback/iframe/modern AJAX and FF AJAX routes.
- `src/forms/submit.ts` — pre-navigation HTTP/WebSocket/native-submit guards; all outgoing requests blocked during filling; one marker-bearing, same-origin, selected-form browser POST authorization; explicit GF draft exclusion; specific new native confirmations and scoped validation errors; one click, no retry or direct HTTP submission. The `Request` constructor in the policy parses already-intercepted browser bytes; it makes no network call.
- `src/forms/evidence.ts` — production redaction of token (`<token>`), configured credentials and encoded forms; private transient action traces; strict no-resource/snapshot/source archive validation, scrub/verify/repack, atomic sanitized retention, and raw/temp cleanup on error/success.
- `src/forms/runner.ts` — fresh desktop contexts, one discovery plus isolated supported-form attempts, identity rechecks, lazy configuration, per-form/page continuation, persisted-ID mailbox polling only after native confirmation, explicit failed scans, shared check/forms population.
- `src/commands/forms.ts` — separate `FormsCommandResult`, local/private forms-only publication through existing writers, no visual capture/comparison/baseline reads, truthful exit/status boundaries.
- `src/commands/check.ts` — unchanged existing capture/comparison completes first; forms attached before publication; form failures recompute status without clearing prior operational failures; direct-call sanitized exits.
- `src/commands/common.ts` — forms parsing/dispatch, internal timing options, credential-safe recognized and unknown errors; strict existing check result type preserved.
- `package.json` — `forms` and `test:forms` scripts; predecessor dependency pins and patch registration preserved.
- `test/forms/browser.test.ts`, `test/forms/evidence.test.ts` — actual headless Chromium loopback red/green coverage and retained sanitized traces; no mailbox-success replacement or fake authorization/delivery.
- `tests/commands.test.ts` — added forms parsing, credential-free empty selection, actual root alias/usage invocations, direct-command sanitized configuration exits; predecessor approval selection regressions preserved.

## Interfaces for the final worker

```ts
// src/forms/runner.ts
export type FormsOptions = {
  runDir: string;
  navigationTimeoutMs?: number; // default 30,000; actions use a 5,000 ms default
  submissionTimeoutMs?: number; // default 30,000
  deliveryTimeoutMs?: number; // pollDelivery default remains 300,000; internal tests only
};
scanPageForms(site: Site, page: SitePage, options: FormsOptions,
              existingBrowser?: Browser): Promise<FormResult[]>;
populateForms(sites: Site[], report: AnyRunReport,
              options: FormsOptions): Promise<void>;

// src/commands/common.ts (additive)
type Command = 'baseline' | 'check' | 'approve' | 'forms';
type RunOptions = {
  runsDir?: string; runId?: string; browser?: SessionOptions;
  forms?: Omit<FormsOptions, 'runDir'>; log?: (message: string) => void;
};
// dispatch signature and ExitCode unchanged; options.store remains the real scoped Store seam.

// src/commands/forms.ts
export type FormsCommandResult = {
  exitCode: ExitCode; report?: FormsRunReport; runDir?: string;
  localPath?: string; url?: string;
};
runForms(sites: Site[], store: Store, options?: RunOptions): Promise<FormsCommandResult>;
// runCheck still returns CommandResult with report?: RunReport, NOT a report union.
```

Production/orchestration usage:

```ts
await dispatch('forms', ['local', '--sites', generatedSites], {
  store: realScopedStore,
  runsDir: retainedCommandDirectory,
  log: safeHarnessLogger,
  forms: { deliveryTimeoutMs: 1000 }, // internal negative fixtures only; omit for full CLI proof
});
// Or:
const results = await scanPageForms(site, site.pages[0]!, {
  runDir: retainedEvidenceDirectory, deliveryTimeoutMs: 1000,
});
```

No public CLI/env timing override, TLS bypass, submission skip, delivery provider or fake-mail hook was added. `form_helper: true` remains operator attestation, not public proof of helper installation/token/version. `RunOptions.browser` applies only to the existing visual pass, not forms.

Lower-level exports:

```ts
// detect.ts
FormDescriptor = { selector; plugin; ordinal: number; pluginId: string | null; identity: string };
detectForms(page: Page): Promise<FormDescriptor[]>;
formLocator(page: Page, descriptor: FormDescriptor): Locator;
sameForm(page: Page, descriptor: FormDescriptor): Promise<boolean>;
// fill.ts
newSubmissionId(): string;
inspectForm(form: Locator, marker?: string): Promise<Inspection>;
fillForm(page: Page, descriptor: FormDescriptor, config: FormConfig, id: string): Promise<FillResult>;
nativeValidation(form: Locator): Promise<string>;
intactMarker(page: Page, prepared: PreparedForm): Promise<boolean>;
// PreparedForm includes id, marker (PRIVATE/in-memory), descriptor, markerIndex/Name,
// submitIndex, action, route: 'postback'|'gravity-ajax'|'fluent-ajax', validation.
// FillResult = PreparedForm | { state:'unsupported'|'not-verified'; detail:string }.
// submit.ts
installFormPolicy(context: BrowserContext): Promise<FormPolicy>;
submitForm(page: Page, prepared: PreparedForm, policy: FormPolicy,
           options?: { timeoutMs?: number; redact?: Redactor }): Promise<SubmissionResult>;
// SubmissionResult = { state:'confirmed'|'rejected'|'failed'; id:string; detail:string }.
// Policy: freeze(), arm(page, prepared), disarm(), submitted(), transportFailed().
// evidence.ts
secretRedactor(token?: string, secrets?: string[]): Redactor; // default env; explicit token for fixture-only lower-level APIs
retainTrace(context: BrowserContext, destination: string, redact: Redactor): Promise<void>;
sanitizeTrace(raw: string, destination: string, redact: Redactor): Promise<void>; // owns/deletes raw
findSecrets(root: string, redact: Redactor): Promise<string[]>; // safe ordinal hit labels only
```

For lower-level fixture APIs, install policy **before** navigation, start action-only tracing, call `policy.freeze()` **before** fill, and pass the fixture redactor to submission and trace retention. Prefer `scanPageForms`/`dispatch` for production behavior. Never log `PreparedForm`: its marker is intentionally private until scrubbed by the evidence boundary.

Production traces: `runDir/traces/forms/<20-hex-site/page-digest>-scan.trace.zip` and `...-form-<1-based-discovery-index>.trace.zip`. Hash-derived names cannot contain entered values. Traces are on; screenshots, snapshots, sources and video are off. Writers do not upload these traces. There is no fabricated visual evidence in forms manifests.

## Tests run

- Initial genuine red: `bun --no-env-file test test/forms/browser.test.ts test/forms/evidence.test.ts` failed with missing production modules (`red.txt`). Further targeted Chromium red diagnostics cover FF's real timestamp query (`ff-cachebuster-red.txt`), modern GF AJAX (`gf-ajax-red.txt`), unsupported/lazy preflight (`preflight-red.txt`), and GF save-and-continue's unprotected path (`gf-draft-red.txt`).
- Source contract audit: `routes-audit.txt`. Read-only ZIP examination, no live-site requests/PHP edits. Temporary extracted plugin sources were removed. Native plugin execution remains next-unit work.
- `bun --env-file=.env test test/forms/browser.test.ts test/forms/evidence.test.ts tests/commands.test.ts`: **25 pass, 0 fail, 162 assertions**, exit 0 (`targeted-env.txt`, final source including draft and lazy-preflight corrections). Earlier credential-free targeted runs also passed; interim diagnostic logs retain the initial timeout/route findings rather than hiding them. The browser suite's default test timeout was raised from 30 to 60 seconds after observing multi-context/trace runs exceed 30 seconds; production action/navigation/submit limits were not relaxed.
- Actual root commands (`root-cli.txt`): `bun --no-env-file run forms all --sites runs/forms-cli-proof/empty.yaml` → **0**; `bun --no-env-file run forms` → **2**. No browser/R2 required for either. Tests separately invoke direct `runForms` on a loopback no-form page with no form/IMAP/R2 credentials: a truthful local forms report is written, then missing R2 publication configuration returns **2**, with no remote access, PNGs or baseline artifacts.
- Diagnostic `bun --no-env-file x tsc --noEmit`: **0**, no diagnostics (`typecheck.txt`). B retains ownership of its final blocking checks.
- Full-suite history is retained, including intermediate mixed-version runs started before later focused test/code corrections. Those runs are not claimed as final green evidence.

## Known limitations and next-unit work

1. The production checker has not been run against live client sites; no rollout is authorized. Helper opt-in cannot prove the installed helper/token/audited plugin versions or arbitrary custom server behavior.
2. New checker **native Playground** proof is still owed: real wp-admin ZIP upload/settings, GF and FF confirmations/refusals, no-helper unchanged entries/mail, upload/no-marker/multiple-form cases, native AJAX behavior, helper cleanup/isolation, and root-equivalent scoped production CLI/R2 report publication. Local fixtures prove browser policy/DOM association, not native plugin processing or delivery. Existing plugin tests in the full suite do not replace these new checker scenarios.
3. No new SMTP message or delivery claim was made. Preserve worker 2's successful real SMTP/IMAP evidence. Playground mail logs must not become `delivered`; full CLI default polling should time out truthfully unless actual delivery occurs. A confirmed loopback submission plus missing mailbox message is `failed`/exit 1, with its native confirmation and ID in sanitized detail.
4. Conservative unsupported boundaries include custom controls, multi-step/payment/password/upload fields, nonnative/duplicate marker names, ambiguous FF message wrappers, unaudited actions and GF drafts. Redirect-only confirmation is not proof. Requests during filling are intentionally blocked even if a custom widget/token-generation flow needs them; do not widen authorization merely to make a fixture pass.
5. Discovery waits for load plus a bounded 200 ms initialization window; it does not promise to discover indefinitely delayed client-rendered forms. Filling stabilizes at most three passes. This is not a universal side-effect-free guarantee for arbitrary initial GET endpoints/site JavaScript.
6. `zip`/`unzip` are now production forms-runtime prerequisites. Raw trace sanitation failures fail the form/page; unsafe output is removed. Existing visual captures/traces stay unchanged and run before any form typing.
7. Final worker owns README/plugin/test documentation, the real scoped `test/fixtures/cli.ts` integration, and the new visual selftest. Document the changed `check` mutation boundary, helper attestation/rollout warning, credentials by name/acquisition, status/exits, privacy/runtime requirements and forms-only approval exclusion.

## Final verification / retained evidence

### Configured changed tests — NOT fully green

Ran, with the compatible Node directory first in PATH:

```sh
export VISUAL_NODE=/home/rudi/.local/share/mise/installs/node/24.21.0/bin/node
export PATH="$(dirname "$VISUAL_NODE"):$PATH"
export AKROGON_BASE=08fa818b7517dad3c2c0bfd0c2bef290d97db148
: "${AKROGON_BASE:?AKROGON_BASE is required}" && bun --env-file=.env test
```

**Final frozen-source run:** `changed-tests-frozen.txt` / `.exit`: **183 pass, 1 fail, 2150 assertions across 19 files**, 809.30 seconds, **exit 1**. Every new browser/command/evidence test passed, as did all real existing Playground/plugin and R2/report tests.

The sole failure is in unchanged predecessor-owned `test/forms/imap.test.ts:57`: the silent TCP peer still counted **1 open connection**, expected **0**, after its existing 2-second close-event wait. The poll's outcome/detail/deadline assertions before it passed. No production mailbox/patch/test code was changed by this worker. **Cause not established.** Do not treat the entire configured suite as green or relax this assertion based on this report.

Follow-up `bun --env-file=.env test test/forms/imap.test.ts` ran **three times**, each **15 pass, 0 fail, exit 0** (`imap-recheck.txt`). This demonstrates an intermittent full-run cleanup observation, not proof of a fix. B owns rerunning the final blocking suite and, if it recurs, diagnosing the socket close/observation boundary in the existing mailbox unit. This is the only outstanding test failure observed on the final frozen implementation; no new human credential prerequisite was found.

Two earlier full runs (`changed-tests.txt`, `changed-tests-final.txt`) each had 182 pass / 2 fail while focused cases were being added after production modules had already been loaded by Bun. Their mixed-version failures are retained and superseded for current-source evaluation by the explicitly frozen run above. No test/code files changed during that final run.

### Retained browser and local-report evidence

Latest complete browser directory, relative to the worktree:

`runs/forms-browser-fb244ac9-a698-472f-9186-830136c6a278/`

- `1.trace.zip` — actual desktop basic fill, including token/address action arguments scrubbed before retention.
- `10.trace.zip`, `11.trace.zip`, `12.trace.zip` — local GF postback, FF timestamp-AJAX and GF modern AJAX confirmation cases.
- `13.trace.zip` — attempted GF draft flag blocked, zero fixture POSTs.
- `14.trace.zip` — native rejection with redacted error text.
- `24.trace.zip` — deliberately encoded-token URL and browser exception sanitation.
- `traces/forms/` — production scanner discovery/per-form contexts, including no-helper GET/POST/WebSocket traps, unsupported/lazy-config and multiple-form continuation.
- `commands/<canonical-run-id>/index.html` and `manifest.json` — production direct forms-only report for a no-form loopback page, with zero visual/baseline artifacts; publication correctly stops at missing R2 configuration.

`summary.json` records absolute directory/example-trace paths and privacy facts; `trace-proof.txt` records placeholder counts and the action-only ZIP entry list. Forms traces have **screenshots/snapshots/sources/video all off**, are private locally and never uploaded. No raw traces or transient scrub directories remain.

### Sanitizer scan

`privacy-final.txt` / `summary.json`: **18 browser evidence directories, 453 retained trace archives, zero unsafe browser/evidence hits, zero raw temporary directories**. The scan unpacked every form trace and checked raw/URL/JSON/mixed Unicode/percent-encoded token and configured credentials, including the fixture token/address/password. Retained diagnostic logs were scrubbed in memory before review; no matching secret or bearer URL was printed. The final trace archive allowlist rejects resources/network snapshots rather than trying to retain images or DOM containing typed secrets. `git diff --check` is clean; final type diagnostic is exit 0.

### Unverified criteria / handoff

- New native checker Playground/scoped production CLI/R2 end-to-end criteria and documentation remain with the next unit, as assigned; see the concrete list above.
- Whole configured-suite green is **not established** because of the preserved IMAP socket-cleanup failure. Three isolated passes are supplemental diagnostics only.
- No new delivery proof, real spam delivery, live-site rollout or final visual selftest is claimed. Preserve worker 2's real-mail evidence unchanged.
