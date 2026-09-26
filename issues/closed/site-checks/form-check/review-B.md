# Review B — form-check

Date: 2026-09-26. Initial blind review, slot B.

**Verdict: fix** — two reproducible contract defects below. No source changes made during review, no human-only blocker, and no peer review read or coordination performed.

- Base: `08fa818b7517dad3c2c0bfd0c2bef290d97db148`
- Reviewed HEAD: `83509cba10299f554b087d6392f0d28b7649d767`
- Worktree: `/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/worktrees/form-check` (clean throughout review).
- Effective config was already read once in this thread: blocking typecheck/test/changed-test runner; no advisory commands. Reviewed the plan and its updated implementation notes, locked design, completed implementation report, changed behavior/documentation and affected interfaces. Existing unchanged artifact contents were reused rather than redundantly reread.

## Fix 1 — HTTP-200 challenge pages become a successful empty forms scan

**Location:** `src/forms/runner.ts:34–39,48`.

**Contract:** plan AC1 (navigation/discovery failure must not masquerade as no forms), D6 (explicit failed page-scan result). README line 200 promises explicit failed results for discovery failures.

`visit()` rejects missing responses, HTTP >=400 and off-origin navigation, but does not reject a positively identified challenge/interstitial. A Cloudflare challenge served with HTTP 200 reaches `detectForms()`, produces `[]`, and the forms-only run aggregates to `pass`. The existing capture module already recognizes the exact same response as `Cloudflare challenge page`; this is not a heuristic about the mere mention of Cloudflare or a normal CAPTCHA.

**Reproduction:** real loopback HTTP server returning `<!doctype html><title>Just a moment...</title><script>window._cf_chl_opt={};</script>...`, actual production `scanPageForms`, headless Chromium/action trace, and production `reportStatus`. No browser/auth/storage/mail mock.

```sh
bun --no-env-file /home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/open/site-checks/form-check/review-B/probes.ts
```

Observed (`review-B/probes.txt`, `challenge.json`; exit 1):

```json
{"existingCaptureChallenge":"Cloudflare challenge page","forms":[],"status":"pass","expected":"explicit failed page-scan, not empty/pass"}
```

Actual browser traces are retained under `review-B/challenge/traces/forms/` (including `cc2d4457d2a10cf36555-scan.trace.zip`). Server/browser were stopped. The probe used no credentials or real-site requests.

**Required repair:** recognize explicit challenge/navigation-failure surfaces before accepting discovery as empty, reusing the existing narrow detector where appropriate. Return a failed scan result and therefore failure/exit 1 for forms-only commands. Do not solve/bypass the challenge or classify ordinary CAPTCHA presence as a blocked page. Add the HTTP-200 interstitial regression alongside genuine empty-page success.

## Fix 2 — valid JSON surrogate escapes bypass both trace redaction and its verifier

**Location:** `src/forms/evidence.ts:16–20,63–64,108`; configuration acceptance in `src/mail/config.ts:15,25–26`.

**Contract:** plan AC7 and D6: supplied credentials must not survive retained trace contents, including JSON-escaped forms; unsafe sanitation must fail closed. README line 235 claims encoded action arguments/errors are scrubbed.

The mixed-encoding matcher iterates Unicode code points (`[...s]`) but derives each JSON escape with `charCodeAt(0)`, which supplies only the first UTF-16 surrogate for an astral character. A valid credential containing such a character is accepted by the configuration reader, but its normal JSON `\uHHHH\uHHHH` encoding is not matched. Reapplying the same incomplete redactor is not an independent check: `sanitizeTrace()` publishes the archive and `findSecrets()` reports zero hits even though parsing the retained JSON recovers the complete credential.

**Reproduction:** actual production config reader, redactor, ZIP sanitation and retained-artifact scanner; a synthetic credential only, not a real account/password or mocked authentication. The small archive carries a valid JSON action parameter with standard UTF-16 surrogate escapes. Temporary input/output archives are removed in `finally`; only the source and value-free facts are retained.

```sh
bun --no-env-file /home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/open/site-checks/form-check/review-B/trace-privacy.ts
```

Observed (`review-B/trace-privacy.txt`, `trace-privacy.json`; exit 1):

```json
{"configuredUnicodePasswordAccepted":true,"sanitizeTraceRetainedArchive":true,"decodedRetainedParameterStillEqualsCredential":true,"findSecretsHits":0,"expected":"credential removed, or unsafe archive rejected"}
```

The independent raw-vs-escaped probe in `probes.ts` also shows raw credential redaction succeeds while JSON-surrogate redaction fails. This is a demonstrated sanitizer/retention defect, not a claim that the current configured mailbox credential has leaked.

**Required repair:** correctly cover JSON's UTF-16 representation (including surrogate pairs) for supported credential strings, retaining ordinary raw/percent/JSON behavior. Add a regression which decodes retained JSON and independently asserts the secret is absent, rather than treating agreement between two uses of the same redactor as proof. Unsafe encoded content must be removed or the archive rejected/deleted.

## Verification and remaining review observations

- Reused B's implementation-phase evidence for this exact frozen source: **189 pass / 0 fail / 2253 assertions / exit 0**, blocking `bun run typecheck` exit 0, visual selftest 15/15 and cleanup empty. Logs: `implementation/evidence/b-final/{test,typecheck,visual}.txt` and corresponding exit files. No code changed, so another 25-minute full-suite run was unnecessary; the two missing-edge probes above were the specific additional checks.
- Existing real SMTP/IMAP selftest proves one delivery plus the full 300001 ms unsent timeout with unchanged flags/counts, EXAMINE/Subject-only PEEK and no discovery/mutation. No extra SMTP message sent for review.
- Native GF/FF proof, genuine wp-admin authentication/settings, helper-false immutability, native rejection/continuation/AJAX, actual default-timeout scoped CLI, real R2 publication/approval/cleanup and forms-aware check attachment are materially evidenced. Local browser/compiled-command diagnostics do not substitute for those real acceptance runs.
- Reviewed both report shapes, strict approval exclusion, manifest-last/trace allowlist and lazy configuration boundaries. No additional concrete defect identified there. The dependency patch is documented/pinned and authorized by the implementation notes; the publication-log change is also explicitly documented.
- Documentation reviewed: root README, forms test guide and affected plugin/testing cross-links. The two wrong behavioral claims are accounted for by Fix 1 and Fix 2 rather than duplicated as separate prose findings. No missing referenced path identified. No changed `AREA.md` files, so the AREA path-list audit is not applicable.
- Checked the committed socket-ownership lesson against `implementation/evidence/worker-4/poll-socket3.txt`: the actual client is TIME-WAIT/closed while a different ESTABLISHED connection belongs to `moshi-hook`. The strengthened owned-client/peer regression is consistent with that evidence, not a waived cleanup failure.
- `git diff --check` passes; worktree clean at the reviewed HEAD. Review artifacts exist only beneath the authoritative leaf. No environment file was opened, printed or edited. Both additional probes are credential-free and expose only synthetic/value-free results.

## Nits

None. Both listed issues are concrete acceptance-contract failures, not speculative uncertainty or preferred architecture. Request `check.fix` for slot B; no approval or merge claim.
