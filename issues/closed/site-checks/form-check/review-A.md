# Review A: form-check

Slot A, `check.review` (initial, blind), 2026-09-26.

- Base: `08fa818b7517dad3c2c0bfd0c2bef290d97db148`
- Reviewed head: `83509cba10299f554b087d6392f0d28b7649d767` (branch `form-check`, worktree clean, 38 changed paths)
- Debate: `"no"`, so there are no positions or rebuttal to read.
- **Verdict: `fix`**: two Fixes (F1, F2) and four Nits.

## Verification evidence

- Read the brief, the design, the plan (including its 2026-09-26 implementation notes), the implementation report, the worker logs where needed, and the full diff of all 38 paths.
- **Typecheck.** `bun run typecheck` at HEAD exits 0.
- **Credential-free tests.** `bun --no-env-file test tests test/forms/config.test.ts test/forms/imap.test.ts test/forms/browser.test.ts test/forms/evidence.test.ts` at HEAD gives 138 pass / 0 fail. New browser evidence is in `runs/forms-browser-0297733f-b34d-4e42-8f12-55ad6905db0e/`.
- **Full suite not rerun.** The real R2/IMAP/Playground suite takes about 25 minutes. Existing evidence covers it, and my concerns below are proven by targeted repros rather than by that suite.
  - B's `implementation/evidence/b-final/test.txt` shows 189 pass / 0 fail, finished 19:09. The commit is at 19:12. Typecheck and visual selftest exit codes are 0.
  - Every artifact path cited in the report exists: native summary, CLI/warnings/check reports, traces, admin trace, native ledger dir, report/browser/visual/mail summaries.
- **Mail proof is current.** The real mail selftest ran at 16:15:22 +02:00. That is after the last writes to `src/mail/imap.ts` (16:14:33), the patch (16:14:38) and `test/forms/mailbox-selftest.ts` (16:15:16), so the proof covers the reviewed IMAP code.
- **ImapFlow patch.** It is applied in the installed ESM and CJS builds. With `literalMailboxes` it skips NAMESPACE and the select-time LIST.
- **Lesson claim** (`learnings/history/2026-09-26-form-check.md`) matches its evidence:
  - `worker-4/imap-stress.txt`: 299 pass / 1 fail.
  - `poll-socket3.txt`: the `moshi-hook` peer is visible.
  - `imap-owned-green.txt`: 600 pass / 0 fail, 11,480 expects.
- **AREA files.** None exist in the diff or the worktree, so there were no paths to list.
- **Docs.** The changed behaviour is described in:
  - README: Commands/exits, Output, site list, Form checks;
  - `test/forms/README.md`;
  - plugin README: Rollout;
  - `test/plugin/README.md`.

  I checked their claims against the code. Every relative link target and anchor exists. No doc claim is wrong on its own terms; F2 is a code defect against the documented exit-code and IMAP_FOLDER format contract.
- **Design exclusions honoured.** There are no plugin PHP, capture, or compare changes, and no `.env` edits.
- **Environment files.** No environment file was opened or printed.
  - Gravity Forms 3.1.2 source was read from `GRAVITY_FORMS_ZIP` by `bun --env-file` scripts that print only source excerpts.
  - Fluent Forms 6.2.14 source came from `.cache/plugin-test/fluentform.6.2.14.zip`.
  - Repro scripts are in this seat's scratchpad and use synthetic values only.

## Fix

### F1: required checkbox, consent and terms fields are never filled on the audited plugin versions, so opted-in submissions are falsely `rejected`

**Where.** `src/forms/fill.ts:80`: `if (e.type === 'checkbox') { if (e.required) controls.push(...); continue; }`. Only checkboxes with the HTML `required` property are ticked.

**Mechanism.** Neither supported plugin emits HTML `required` on checkboxes.
- **GF 3.1.2:**
  - The consent input gets only `aria-required="true"` (`class-gf-field-consent.php:224,253`).
  - Checkbox-field inputs carry no required marker; the field container gets `gfield_contains_required` (`form_display.php:4566`).
  - No GF field class emits an HTML `required` attribute.
- **FF 6.2.14:** checkable fields and Terms & Conditions render `aria-required='true'` (`Checkable.php:144–153`, `TermsAndConditions.php:59–64`).

**Repro.** I ran production `detectForms`/`fillForm` with the frozen policy on GF-consent and FF-T&C markup copied from those sources:
```text
/gf: plugin=gravity state=prepared validation="Native client validation passed." requiredCheckboxChecked=false
/ff: plugin=fluent state=prepared validation="Native client validation passed." requiredCheckboxChecked=false
```
The retained native evidence shows what GF does with such a submission. `runs/forms-playground-39f8c947-…/negative.json`, `#gform_7`, came back `rejected` with "Required consent: This field is required." That fixture renders the box optional, but the checker ignores GF's required markers either way, so a truly required consent field behaves identically.

**Effect.**
- On a `form_helper: true` site, every GF/FF form with a required consent, terms or checkbox group is refused on every run. It is reported `rejected`, which is a failure with exit 1, and its delivery is never verified. Such consent boxes are standard on EU contact forms.
- On `form_helper: false` sites the report says "Native client validation passed." for a form the plugin would refuse.

**Contract broken.**
- Brief: "fill visible fields with test data".
- Plan D2: "normal select/radio/checkbox groups with safe deterministic values respecting ordinary constraints".
- AC4: `rejected` reports the site's refusal, not the checker's own omission.

**Done when:**
- Required-ness is read from the audited plugins' own markers: at least `aria-required="true"` on the input and GF `.gfield_contains_required` containers.
- One box per required group is checked; optional boxes may stay unchecked.
- A native GF consent (or required checkbox) field and an FF T&C/required checkbox reach native confirmation in the Playground suite.
- The existing server-rejection fixture, rendered optional, still reports `rejected`.

### F2: substring redaction of non-secret configuration turns valid configuration into exit 2 and corrupts the printed report path

**Where.**
- `src/forms/evidence.ts:11–12` treats the values of `IMAP_HOST`, `IMAP_FOLDER`, `IMAP_SPAM_FOLDER`, `SMTP_HOST`, `S3_ENDPOINT`, `S3_BUCKET` and `GRAVITY_FORMS_ZIP` as secrets. It replaces every substring match in all `check`/`forms` log lines, form details and `safeError`.
- `src/commands/forms.ts:25` refuses to run (`UsageError`, exit 2) when any such value occurs in the absolute run directory or the selected sites' JSON.

**Repro.** Synthetic, documented-valid IMAP configuration with `IMAP_FOLDER=Pirax` (`readImapConfig` accepts it). I ran `runForms` for an ordinary site with the runs directory under `/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/…`:
```text
forms exit: 2 | log: forms: Site/run identity contains configured private data; use non-secret identities.
check log line becomes: Local report: /home/rudi/Work/Privatni/<redacted>-Castrum-Maintenance/runs/2026-09-26T10-00-00.000Z/index.html
```
- **Forms never runs.** No browser or forms work happens, and this applies even to `form_helper: false` sites.
- **Broken report pointer.** The corrupted path is the only report pointer the CLI still prints, because the bearer link is now withheld.
- **Site-list collisions.** A lowercase folder or bucket value that appears in any listed URL, slug or page path makes `forms all` exit 2 for every site. An example is a `kontakt` label with a `/kontakt/` page.
- **Current config.** I checked with booleans and names only: the operator's current values collide with neither the committed `sites.yaml` nor the checkout path. The defect is latent, but an ordinary label rename or site-list edit triggers it.

**Contract broken.**
- AC6: only usage or missing/invalid configuration returns 2.
- README exit codes, and the README format for `IMAP_FOLDER`/`IMAP_SPAM_FOLDER`: any exact existing folder name without `*`/`%`, controls or outer whitespace.
- AC7 requires the token and credentials to be withheld. Hosts, folder names, bucket, endpoint and a local ZIP path are not credentials.

**Done when:**
- Redaction and the forms identity guard cover only the token and actual credentials or private identifiers: passwords, secret key, account user and address, and the access key ID if it is kept private.
- A regression test uses a folder, host or bucket value that appears in both the runs path and a listed site path, and shows the command runs with intact log paths.
- Privacy scans stay green.
- Restoring the printed signed link is optional. The plan's publication-log note remains valid while the access key ID is treated as private.

## Nits

None of these blocks merge on its own.

- **N1: lesson index.**
  - **What.** The committed lesson line lives in a new `learnings/ACTIVE.md`, and the README links it as "Implementation lessons".
  - **Why it matters.** This repo's canonical index is `learnings/LESSONS.md`. `plan-issue` reads it, and `merge-issue` and `plan-issue` write it. Future plans will not see the new socket-ownership lesson, and the repo now has two indexes.
  - **Suggestion.** B, who owns doc and index authorship, should move the line into `LESSONS.md` and point the README there (or drop that pointer).
- **N2: reCAPTCHA v3 and invisible CAPTCHA are unverified.**
  - **What.** FF 6.2.14 calls `grecaptcha.execute(...)` before posting (`form-submission.js`), and GF invisible reCAPTCHA behaves similarly. The frozen policy blocks every request after filling starts, so these forms will probably time out as `failed`.
  - **Why it matters.** D4 wants known-unsupported CAPTCHA paths classified `not-verified` before submission. The helper README says FF v3 is bypassed server-side but untested.
  - **Suggestion.** Detect v3 or invisible widgets as `not-verified`, or document the limitation. Unverified, so a Nit.
- **N3: phone test data can falsely reject.**
  - **What.** The fixed `+12025550123` fails GF 3.1.2's "US Standard" regex `/^\D?(\d{3})\D?\D?(\d{3})\D?(\d{4})$/`. GF's default "International (formatted)" phone is a JS widget that stores JSON in a hidden `input_N` the checker never fills (`class-gf-field-phone.php:318–355, 928–933`).
  - **Why it matters.** A required GF phone field can falsely produce `rejected` instead of `unsupported`.
  - **Suggestion.** Treat these widgets conservatively or exercise them natively. Not exercised natively, so a Nit.
- **N4: forms config errors discard the visual report.**
  - **What.** When the lazy forms config read fails during `check` (missing `FORM_TEST_*` or `IMAP_*` with a supported form), the completed visual pass writes no local `index.html`/`manifest.json` and publishes nothing. The command exits 2 after all captures.
  - **Why it matters.** This follows AC6's exit-2 rule, but a long visual pass is wasted and a report with only the visual results is not produced.
  - **Suggestion.** Write the local report before returning 2, or preflight config when a selected page is known to need it.

## Checked without finding

- **Approval.** `newestSiteCheck` skips valid forms-only manifests, still fails on malformed ones, and keeps the strict check-only parser.
- **Envelopes.** Check and forms envelopes cannot be mixed. There are no fabricated viewports.
- **Status and exits.** `delivered` passes; `delivered-spam`, `not-verified` and `unsupported` warn; `failed` and `rejected` fail the page, site and run with exit 1. Existing visual and health failures still fail, and an earlier operational failure is preserved in `check`.
- **Browser policy.**
  - The policy is installed before navigation, with service workers and WebSockets blocked.
  - No request is allowed after freeze.
  - Exactly one marker-bearing, same-origin GF/FF POST is allowed, with the audited payload checks.
  - `submit`, `requestSubmit` and submit events are gated.
  - Stale or foreign confirmations and FF instance scoping are handled.
  - Nothing is retried, and marker integrity is re-checked before the click.
- **IMAP.**
  - Exact literal folders; EXAMINE only; UID SEARCH on the full tag plus an exact decoded-Subject recheck; Subject-only BODY.PEEK.
  - Spam precedence, the 300 s bound including connection time, and cleanup in `finally`.
  - Real-wire evidence shows no LIST, NAMESPACE, SELECT, body read or mutation.
- **Traces.** Action-only with no snapshots, sources or network. Scrubbing fails closed, raw files are removed, and trace names are hashes. Traces are never uploaded.
- **Lazy config and harness.**
  - Config is read lazily, import-safe and value-free.
  - An empty selection needs no browser or R2.
  - The root `forms` alias points to `src/commands/forms.ts`.
  - The CLI harness is scoped to a validated `test/forms-…/` root with cleanup to zero.

## Re-check after `check.fix` round 1

Slot A, repair re-check (A only), 2026-09-26.

- Base: `08fa818b7517dad3c2c0bfd0c2bef290d97db148`
- Prior reviewed head: `83509cba10299f554b087d6392f0d28b7649d767`
- Re-checked head: `ee854d825786d1e747aecefaf69e02ff0a5197e7` (`Fix required form fields and review privacy/discovery defects`, worktree clean, 14 paths, +208/−18)
- **Scope.** Only the repair diff `83509cb..ee854d8`. I read it against:
  - the plan's "Repair notes — check.fix round 1";
  - the report's "Repair round 1";
  - both initial reviews. The blind rule covered only the initial round, so `review-B.md` is now input for confirming B's two Fixes.
- **Verdict: `ready`.** All four earlier Fixes are repaired, and the repair introduces no defect. The four Nits are resolved or documented.

### Verification evidence (re-check)

- **Typecheck.** `bun run typecheck` at `ee854d8` exits 0.
- **Whitespace.** `git diff --check 83509cb ee854d8` is clean.
- **Blocking suite.** I reran it myself at `ee854d8`, with Node 24 first on PATH and `VISUAL_NODE` set as in the report:

  ```sh
  : "${AKROGON_BASE:?AKROGON_BASE is required}" && bun --env-file=.env test
  ```

  Setting `AKROGON_BASE` also covers `test_changed`. Result: **195 pass / 0 fail, 2,316 `expect()` calls, 20 files, exit 0**, in 1470.16 s (18:54:16Z–19:18:46Z). The log is in this seat's scratchpad. New real-surface evidence from this run:
  - **Native suite:** `runs/forms-playground-cea816a8-bd01-4466-8b9a-837cb41e3ec2/summary.json`, on GF 3.1.2, FF 6.2.14, WP 7.1.2 and PHP 8.3.
    - The required GF (checkbox + consent) and FF (checkbox + terms) forms both reached native confirmation (`Native Gravity Forms confirmation: Pirax GF thanks`, and the FF thank-you message). Each then truthfully `failed` its 1 s mailbox wait.
    - All 7 served boxes carry native markers and none has HTML `required`.
    - With helper false, both forms are `not-verified` with nothing written.
    - Four redirected notifications; entries went 0 → 0; feeds unchanged.
    - Negative order: `unsupported`, `unsupported`, `rejected` (client), `rejected` (server, still optional-rendered), then FF `failed`.
    - Scoped root: 20 deleted, 0 remaining.
  - **Collision regression:** `runs/forms-collision-7104c31f-f632-44a1-8a62-7810386322d9/synthetic-folder-collision/summary.json`. Exit 0, no `<redacted>` in either log line, 2 published keys, fetched bytes equal, cleanup 2 deleted / 0 remaining.
- **Why I reran it.** B's `evidence/b-repair-1/test.txt` also reports 195 pass / 0 fail and exit 0. But worker-5's `final-diff.sha256` (`2f26678f…`) does not reproduce from the committed diff (`ea554f6c…`, a different diff input), so that evidence is not bound to the commit by hash. My rerun binds the blocking checks to the committed tree.
- **Reproductions.** All are credential-free (`bun --no-env-file`) scripts in this seat's scratchpad:
  - **A F1.** The same script as the initial review, with GF consent and FF T&C markup copied from the audited sources:
    ```text
    /gf: plugin=gravity state=prepared validation="Native client validation passed." requiredCheckboxChecked=true
    /ff: plugin=fluent state=prepared validation="Native client validation passed." requiredCheckboxChecked=true
    ```
  - **A F2.** The initial repro, adapted to a local no-form site and an in-memory store. The store is not the unit under test; the guard, redactor and log lines are. Collisions set up:
    - `IMAP_FOLDER=Pirax` with the run directory at `…/Pirax-runs/`;
    - `IMAP_SPAM_FOLDER` and `S3_BUCKET` both `contact`, with the listed page `/contact/`;
    - `IMAP_HOST` set to the site host `127.0.0.1`, `S3_ENDPOINT` on that host, and `GRAVITY_FORMS_ZIP` set to the runs parent.

    Result:
    ```text
    forms exit: 0 | requested: /contact/ | forms: []
    Local report line intact: true | any <redacted> in logs: false | stored keys: reports/<runId>/index.html,reports/<runId>/manifest.json
    check log line intact: true
    labels left intact: IMAP_FOLDER,IMAP_SPAM_FOLDER,IMAP_HOST,S3_BUCKET,S3_ENDPOINT,GRAVITY_FORMS_ZIP
    credentials redacted: FORM_TEST_ADDRESS,IMAP_USER,IMAP_PASSWORD,SMTP_USER,SMTP_PASSWORD,S3_ACCESS_KEY_ID,S3_SECRET_ACCESS_KEY | token: true
    ```
    The "check log line" is the registered-checkout path `…/Privatni/Pirax-Castrum-Maintenance/runs/…/index.html` with `IMAP_FOLDER=Pirax`.
  - **B Fix 1 and Fix 2.** B's unchanged `review-B/probes.ts` and `trace-privacy.ts`, copied to scratch so B's retained outputs are not overwritten, both exit 0:
    - The HTTP-200 `_cf_chl_opt` page becomes a `page-scan` result, `failed`, with status `failure`.
    - Surrogate-escaped credential redaction returns `true`.
    - `decodedRetainedParameterStillEqualsCredential:false`, with 0 scanner hits.
- **Coverage beyond the fixtures.**
  - FF 6.2.14 renders `gdpr_agreement` through the same `TermsAndConditions@compile` hook (`app/Modules/Component/Component.php:916–918`). That hook emits `aria-required` from the required rule (`TermsAndConditions.php:58–64`), and GDPR is required by default (`DefaultElements.php:1543–1550`). So the repaired filler also covers FF's GDPR box.
  - GF marks every required field container with `gfield_contains_required`.
  - The server-rejection fixture's optional rendering is still scoped to its own form ID (`test/forms/fixtures.php:9–11`), so the new required fixtures are unaffected.
- **Docs.** I checked the changed claims against the code:
  - README: discovery failures, required checkbox groups, CAPTCHA/phone limits, the late config-error note, and the redaction scope;
  - `test/forms/README.md`;
  - the plugin README's "Checker browser limits".

  No claim is wrong. There is no stale `learnings/ACTIVE.md` reference, every `learnings/LESSONS.md` history link resolves, and no `AREA.md` is in the repair diff.

### Earlier findings

| Finding | Status | Evidence |
| --- | --- | --- |
| A F1: required checkbox, consent and T&C fields never filled | Fixed | `src/forms/fill.ts:68–81,94`: writable checkboxes are grouped by GF `.gfield` container or FF name. Every HTML-`required` box is checked. Otherwise one usable choice (an already-checked one if present) is checked when any box has `aria-required="true"` or sits in a GF `.gfield_contains_required` container. Optional groups are untouched, and disabled or hidden boxes are skipped. Covered by `browser.test.ts:99` and native `playground.test.ts:123`: 7 served boxes with no HTML `required`, GF and FF native confirmations, redirected tagged mail, entry cleanup, and helper-false immutability. The optional-rendered server case at `:109` still ends `rejected`. The repro above is green. All four done criteria are met. |
| A F2: substring redaction of non-secret configuration | Fixed | `src/forms/evidence.ts:11` now covers only `FORM_TEST_ADDRESS`, IMAP/SMTP user and password, and the S3 access key ID and secret key, plus the token. The identity guard (`src/commands/forms.ts:25`) inherits the narrower set. `report.test.ts:38` runs production `runForms` with the folder value in both the run directory and the page path, with real scoped R2, the intact `Local report:` line, byte-equal fetch and cleanup. `evidence.test.ts:14` pins labels versus credentials. The repro is green. All done criteria are met. |
| B Fix 1: HTTP-200 challenge/interstitial became an empty pass | Fixed | `src/forms/runner.ts:40` reuses the existing `challengeReason` (`src/capture.ts:75–82`: `cf-mitigated`, `_cf_chl_opt`, the Cloudflare block title and the Sucuri title). It runs on the final response headers and the main-frame DOM before discovery. The thrown error becomes the existing failed `page-scan` result. `browser.test.ts:119` covers the body, header and firewall variants, and ordinary CAPTCHA and Cloudflare mentions stay `[]`. |
| B Fix 2: JSON surrogate escapes bypassed redaction and verification | Fixed | `src/forms/evidence.ts:18–21` matches per-UTF-16-unit `\uXXXX` with case-insensitive hex, literal JSON escapes, and code-point HTML entities. `sanitizeTrace` also re-serializes each parsed `.trace` event and fails closed on a hit (`:69–70`). `evidence.test.ts:28` sanitizes a real archive and decodes the retained JSON independently. |
| N1: lesson index | Resolved | The socket-ownership line moved into `learnings/LESSONS.md`, `ACTIVE.md` was deleted, and the README pointer now targets `LESSONS.md`. |
| N2–N4: CAPTCHA v3/invisible, GF phone widgets, `check` config error | Documented | Documented as limitations in the README, `test/forms/README.md` and the plugin README instead of being changed in code. That is an acceptable way to resolve Nits. The claims match the code paths I observed in the initial review. |

### Repair-introduced defects

None blocking, and no new Nits. Checked without finding:
- **Fill-round stability.** The fill signature stays stable across rounds because the chosen box is reused once checked. Conditional fields revealed by a newly ticked box are picked up by the existing three-round re-inspection.
- **Native payload.** The native payload audit accepts the extra checkbox fields (native confirmation).
- **Challenge detection.** It adds no heuristic beyond the detector the visual check already uses. Cross-origin CAPTCHA iframes are not serialized by `page.content()`, so an ordinary Turnstile, reCAPTCHA or hCaptcha form is not a challenge. HTTP ≥ 400 and origin checks still come first.
- **Redactor.** The new decoded-trace check can only fire on content whose escapes hid a configured secret. The mixed matcher stays linear, with no nested quantifiers. `.network` must still be empty.
- **No regression.** The narrower redaction set leaves the plugin harness's own token/ZIP sanitation and every credential category intact. It matches the plan's repair note and my F2 done criterion.

No new reusable lesson came out of this re-check.

## Merge (slot A), 2026-09-26

- **Lessons.** No Nit is still held: N1 was repaired, and I accepted the documentation of N2–N4 in the re-check. So this pass adds no Nit lesson. The two reusable lessons from F1 and F2 are already in the registered checkout's `learnings/` and remain uncommitted for the operator.
- **Outstanding changes.** None. The worktree was clean at `ee854d8`.
- **Fetch and rebase.** After `git fetch origin`, I ran `git rebase origin/main`:
  - Target: `4e3e6e9016cd307f35bbbc9c89f5042bd565afc9` (`chore: require typecheck and tests before merge; keep review lessons`).
  - Prior reviewed head: `ee854d825786d1e747aecefaf69e02ff0a5197e7`.
  - Rebased head: `0a7ddf98806ede20a331cd2d68e073e89741648e`.
  - The rebase had no conflicts.
  - `git range-diff 08fa818..ee854d8 4e3e6e9..0a7ddf9` shows both patches identical (`1: 83509cb = 1: 659e96e`, `2: ee854d8 = 2: 0a7ddf9`).
- **`AKROGON_BASE`.** Refreshed from `akrogon config` after the rebase: `08fa818b…` → `4e3e6e9016cd307f35bbbc9c89f5042bd565afc9`.
- **Lesson index.** `learnings/LESSONS.md` merged automatically and keeps both entries: main's `wp_mail` header lesson and this branch's socket-ownership lesson. All five history links resolve. `git diff --check 4e3e6e9 HEAD` is clean.
- **Checks at `0a7ddf9`.**
  - **Setup.** Node 24 was first on PATH and `VISUAL_NODE` was set. The only environment files are `.env` and `.env.example`, so `bun --env-file=.env test` has the same environment as the configured `bun test`.
  - **`typecheck`.** `bun run typecheck` exits 0.
  - **`test` and `test_changed`.** I ran `: "${AKROGON_BASE:?AKROGON_BASE is required}" && bun --env-file=.env test` once. After the guard, the two commands are the same `bun test`, and no code reads `AKROGON_BASE`, so one run covers both. Result: **195 pass / 0 fail, 2,316 `expect()` calls, 20 files, exit 0**, in 1514.65 s (19:21:13Z–19:46:27Z). The log is in this seat's scratchpad. New evidence:
    - `runs/forms-playground-1a17879e-5ffb-4b96-a2ad-69ae02f7696c/summary.json`
    - `runs/forms-collision-f4d12d9c-eb9a-4922-ab37-657770e6707a/synthetic-folder-collision/summary.json`
    - `runs/forms-report-tests-1e7aaeca-fb05-406d-91f4-5dc8a5eb98b0/summary.json`
    - `runs/forms-browser-57974b06-ac7d-4d6d-942a-7b27eb5764d4`
  - **Advisory.** None configured.
- **Push.** Pending at the time this was written; the result is recorded below.
- **Push result.** `git push origin HEAD:main` fast-forwarded `4e3e6e9..0a7ddf9` (exit 0). A fresh fetch confirms `git merge-base --is-ancestor 0a7ddf98806ede20a331cd2d68e073e89741648e origin/main`, so the pushed head is on `origin/main`.
