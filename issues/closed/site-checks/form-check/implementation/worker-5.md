# Worker 5 — review repair round 1

Read `brief-5.md` before edits and reread section 8 before this report. Delegated repair only; no commit or lifecycle ownership.

- Before-head (and unchanged current HEAD): `83509cba10299f554b087d6392f0d28b7649d767`.
- Worktree: `/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/worktrees/form-check`.
- Evidence below: authoritative `implementation/evidence/worker-5/` unless otherwise qualified.
- **All four blocking findings addressed. Frozen resolved changed runner: 195 pass / 0 fail / exit 0.**
- No environment file opened, printed or edited; no production plugin PHP, live-site execution, committed site-list change, capture/compare change, mailbox write, new SMTP message, auth/delivery mock, public test flag or source commit. Only fresh `test/forms-.../` roots; all nine independently re-listed empty.

## Changed files and reasons

Fourteen tracked paths, preserving existing implementation/interfaces:

- `src/forms/fill.ts`: group usable checkboxes by GF field container or FF/native name; recognize `aria-required="true"` and GF `.gfield_contains_required`. Select one required-group choice (reuse an existing checked choice), preserve every individual HTML-required constraint, leave optional groups unchanged. Hidden/disabled choices remain excluded.
- `src/forms/evidence.ts`: automatic secrets are token, redirect address, account users/passwords and S3 access/secret keys, not hosts/folders/endpoint/bucket/licensed ZIP path. Mixed JSON matching now uses both UTF-16 code units for astral characters and accepts mixed hex case. Parsed/re-serialized trace events receive an additional decoded-value verification before retention; unsafe output still fails closed/deletes raw/output.
- `src/forms/runner.ts`: reuse unchanged `capture.challengeReason` before discovery in each fresh visit. Positively identified HTTP-200 challenges become explicit failed page scans, not successful empty arrays. No protection bypass.
- `test/forms/browser.test.ts`: required GF consent/group and FF terms/group regression, disabled/hidden choices, optional groups and multiple individually required choices; HTTP-200 challenge/header/firewall negatives and ordinary Cloudflare/CAPTCHA mention control.
- `test/forms/evidence.test.ts`: automatic secret-scope regression and actual ZIP sanitation with accepted synthetic Unicode credential; parse retained JSON and independently compare decoded values for full UTF-16, uppercase/mixed-hex and mixed literal/escaped forms. Existing encoding/fail-closed assertions preserved.
- `test/forms/report.test.ts`: actual production `runForms`, real scoped Store, synthetic nonsecret `IMAP_FOLDER` appearing in both run and listed page paths; assert execution, intact local-path logging, HTML/manifest publication, fetched bytes, privacy and exact-prefix cleanup.
- `test/forms/fixtures.php`, `test/forms/harness.ts`, `test/forms/playground.test.ts`: add native GF required checkbox + consent and FF required checkbox + terms fixtures without invented HTML `required`; retain old fixtures. FF clones existing native metadata and uses installed `DefaultElements.php` definitions. Assert seven served native checkboxes/markers, helper-false immutability, native confirmations, redirected/tagged mail and entry cleanup.
- `README.md`, `test/forms/README.md`, `plugin/pirax-form-test/README.md`: accurate required-group/challenge/privacy/test behavior; document unverified invisible/v3 CAPTCHA and specialized GF phones, plus late forms-config exit 2 after visual captures without a completed report. Bearer-link withholding remains documented.
- `learnings/LESSONS.md`, deleted `learnings/ACTIVE.md`: move the existing socket lesson to the canonical index; update README link. Canonical index inspected solely for this maintenance, not used as task/lesson input.

## Tests run

### Literal commands and red/green

Integration commands use:

```sh
export VISUAL_NODE=/home/rudi/.local/share/mise/installs/node/24.21.0/bin/node
export PATH="$(dirname "$VISUAL_NODE"):$PATH"
```

1. Before production repairs:
   ```sh
   bun --no-env-file test test/forms/browser.test.ts test/forms/evidence.test.ts -t 'native required checkbox|HTTP-200 explicit|automatic redaction|independently decodes'
   ```
   **0 pass / 4 fail**, exit 1 (`regressions-red.txt`, `.exit`): required boxes omitted, challenge scan empty, nonsecret config redacted, and parsed retained JSON still contained the synthetic credential.

2. Before repair:
   ```sh
   bun --env-file=.env test test/forms/report.test.ts -t 'production forms command publishes'
   ```
   **0 pass / 1 fail**, exit 1 (`collision-red.txt`, `.exit`): production command returned 2 rather than 0; root cleanup empty. This used real Store authorization, not a mock.

3. Native before repair:
   ```sh
   bun --env-file=.env test test/forms/playground.test.ts -t 'native required GF'
   ```
   Initial run correctly caught fixture page readback mismatch (`native-red.txt`): a single-quoted PHP newline was stripped on WordPress insertion. Corrected fixture string only, preserving exact readback. Second run **0 pass / 1 fail**, exit 1 (`native-red2.txt`): actual GF and FF both `rejected` with required-field errors. `native-rejections-before.json` retains these outcomes. Served native markers and no-helper immutability passed first. Neither run is claimed green.

4. After repair:
   ```sh
   bun --no-env-file test test/forms/browser.test.ts test/forms/evidence.test.ts
   bun --env-file=.env test test/forms/report.test.ts
   bun run typecheck
   ```
   **18 pass / 0 fail / 143 assertions** (`targeted-green.txt`), **9 pass / 0 fail / 77 assertions** (`report-green.txt`), typecheck exit **0** (`typecheck.txt`); all exit files retained.

5. Native green:
   ```sh
   bun --env-file=.env test test/forms/playground.test.ts -t 'native required GF|native upload/no-marker|helper false fills'
   ```
   **3 pass / 0 fail / 49 assertions**, three deliberately filtered tests, exit 0 (`native-green.txt`). Required positive confirmations, original server/client rejection and helper-false invariance pass together. Summary copy: `native-summary.json`.

6. Independent reviewer repros, copied unchanged to ignored worktree scratch rather than overwriting review artifacts:
   ```sh
   bun --no-env-file runs/forms-worker5-audit/probes.ts
   bun --no-env-file runs/forms-worker5-audit/trace-privacy.ts
   ```
   Both exit **0** (`independent-probes-green.txt`, `independent-privacy-green.txt`). Challenge now produces explicit `page-scan`/`failed` and report status `failure`; raw and surrogate-escaped credentials both redact. Actual retained ZIP still exists during independent validation, but **JSON.parse no longer recovers the credential**; scanner hits 0. Facts retained as `challenge.json`, `unicode-privacy.json`, `trace-privacy.json`. Probe raw/temp ZIPs removed in finally; action trace retained under `runs/forms-worker5-audit/challenge/traces/forms/`.

7. Frozen resolved changed runner, executed once after native green:
   ```sh
   export AKROGON_BASE=08fa818b7517dad3c2c0bfd0c2bef290d97db148
   : "${AKROGON_BASE:?AKROGON_BASE is required}" && bun --env-file=.env test
   ```
   **195 pass / 0 fail / 2,316 assertions across 20 files**, **1,475.79 s**, exit **0** (`changed-tests-frozen.txt`, `.exit`). This includes all existing native/plugin/browser/report tests, six native checker cases, production CLI full waits and real check capture/attachment. `frozen-diff.sha256` equals `final-diff.sha256`: no source changes during or after this run. `git diff --check` clean.

### Finding A F1 — native required-field evidence

Final frozen workspace:
`runs/forms-playground-8449654a-3c1c-4603-8b9e-812f7e9372eb/`.

Summary: `summary.json` (copy `frozen-native-summary.json`). GF **3.1.2**, FF **6.2.14**, WP **7.1.2**, PHP **8.3**; genuine wp-admin login, built ZIP upload/activation/settings and exact PHP/page readback. Native markup: GF two required-group choices plus consent; FF three required-group choices plus terms. **All seven lack HTML required**; their audited GF container/ARIA markers are asserted.

- GF `#gform_8`: native “Pirax GF thanks”, ID `ashyowv4bcro`.
- FF `#fluentform_6`: native associated thank-you, ID `vf3nc5dqntbv`.
- Four logged notifications total, two per exact Subject ID; redirect recipient and `X-Pirax-Form-Test` verified; original recipient headers removed.
- Native GF/FF entries **0 → 0**, no remaining rows; feeds unchanged.
- Required forms with helper false: both `not-verified`; mail/entries/feeds identical before/after.
- Intentionally optional-rendered native server fixture `#gform_7` still **rejected** (“This field is required”). Hidden client-required fixture still rejected, later FF still confirms.
- Positive cases truthfully finish `failed` on the short internal IMAP deadline: Playground logging is **not mail delivery**. No delivery acceptance substitution.

Artifacts: `required.json`, `negative.json`, `required-markup.trace.zip`, `admin.trace.zip`, and `traces/forms/` in that workspace. Sanitized native ledgers/upload digests: `artifacts/plugin/forms-checker-2026-09-26T18-01-33-859Z/`. Forms/admin/required/report-render browser evidence is headless Chromium, trace on, video/screenshots/DOM snapshots/sources off. Existing separate visual capture traces are unchanged.

### Finding A F2 — actual command collision and publication

Final frozen collision summary:
`runs/forms-collision-de25b553-a7be-470e-9147-fa8e0ec24e41/synthetic-folder-collision/summary.json`
(copy `frozen-collision-summary.json`).

The actual production `runForms` command ran against a loopback page `/synthetic-folder-collision/`, with `IMAP_FOLDER=synthetic-folder-collision` and that same directory component in `runsDir`. Real R2 configuration/authentication remained unchanged. **Exit 0**, real browser request observed, `forms: []`, intact `Local report: <existing absolute index.html path>`, no `<redacted>` path corruption. Real scoped HTML and completion manifest published; fetched HTML equals local bytes. Private bearer URL remains withheld. Unit assertions retain automatic redaction for **every actual credential/private-identifier category**, including S3 access key ID.

### Full native CLI and check preserved

Frozen native suite actually invoked:

```text
/home/rudi/.local/share/mise/installs/bun/1.4.2/bin/bun run forms local --sites <workspace>/package/sites.json
cwd: <workspace>/package
```

Here `<workspace>` is the frozen native directory above. Existing disposable package wrapper calls production dispatch with real scoped storage; it is not represented as the unscoped root alias. Root alias tests also pass in the full suite.

- Actual CLI **606,636 ms / exit 1**: GF ID `ynpgaupooels`, FF ID `41o8neunr1x5` each confirms, then reaches its real default **300 s** mailbox timeout.
- Native redirect/header/entry/feed assertions still pass.
- CLI HTML/manifest/fetched HTML/render trace: `<workspace>/cli/2026-09-26T18-03-15.027Z/` (`index.html`, `manifest.json`, `remote-index.html`, `report.trace.zip`).
- Production `check`: `<workspace>/check/2026-09-26T18-13-31.705Z/index.html`, exit 1; both visual captures remain `same`, forms failure attached. No screenshot algorithm change.

### Privacy and cleanup

```sh
bun --env-file=.env runs/forms-worker5-audit/audit.ts
```

Exit **0** (`audit.txt`, `.exit`, `audit.json`): **25 directories / 448 files / 208 unpacked archives / 0 unsafe hits**. Includes new retained red/green/full-run browser/native/plugin/report evidence and authoritative logs; checks raw/encoded configured credentials, fixture token/address and signed bearer markers. Independent decoded-JSON regression is additional to this redactor-based aggregate scan. Synthetic trace test/probe raw/temp archives are deleted in finally, never retained as unsafe evidence.

All **nine** generated roots independently re-listed **0 objects**, including failed/red runs. Exact list is in `audit.json`. Final roots:

- Native: `test/forms-native-2026-09-26T18-01-33.858Z-c96f0d3e/` — **20 deleted / 0 remaining**, fixture/browser stopped.
- Collision: `test/forms-collision-2026-09-26T18-00-31.403Z-a45614a1/` — **2 deleted / 0 remaining**, server stopped.
- Report/approval: `test/forms-report-2026-09-26T18-00-34.298Z-7909a3b4/` — **13 deleted / 0 remaining**; summary `runs/forms-report-tests-c520b877-f30f-4092-ab57-76168214c932/summary.json`.

Final process check found no remaining Playground/native forms CLI child. No production remote prefix was cleaned. The first fixture-readback failure stopped its partially initialized harness internally (its outer summary's stopped:false only means no harness was returned).

## Known limitations

- No production rollout or live-client mail transport proof; helper opt-in remains operator attestation. Playground notification logging is not delivery; preserve existing real SMTP/IMAP evidence unchanged. Mail implementation/patch were not changed and no extra SMTP selftest message was sent.
- Invisible/v3 CAPTCHA and specialized GF phone flows remain unverified; request policy can time out the former and fixed data can falsely reject the latter. Documented, not worked around.
- A late forms-config error in `check` still returns 2 after captures without completed HTML/manifest publication; now explicitly documented.
- Existing conservative unsupported/redirect-only/custom flow limits, provider/mailbox concurrency risks and local evidence retention apply. Bearer URL logging remains withheld.
- Standalone visual selftest was not rerun in this delegated repair. The frozen full suite includes real native `check` at both widths and unchanged capture tests; B owns separate final blocking validation/typecheck/review. This report does not claim reviewer approval.

## Unverified criteria

None remaining within `brief-5.md`'s delegated blocking repairs. All four findings have before/after evidence, native positives and preserved negatives pass, real scoped collision publication passes, independent decoded trace privacy passes, and the resolved changed runner is green on frozen source. Live rollout, invisible/v3 CAPTCHA, specialized GF phones and additional provider/plugin versions remain intentionally unclaimed as above.
