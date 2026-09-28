# Unit 6 — finish repair-1 checkpoints omitted from worker 5's return

## 1. Goal

Finish the late §8 checkpoints of brief-5, which worker-5.md did not implement. Worktree `/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/worktrees/helper-compat`; reviewed head `aac43d6516b3cbb8f2187f1b98b49c36ac6ecef6`, with worker 5's eight-file uncommitted repair already present. Preserve that working diff. This remains repair round 1, not a new review round.

## 2. Numbered acceptance criteria

1. The GF modern-AJAX guard returns for ordinary GF-shaped inputs **before** new metadata reads, and refuses a token-bearing candidate with an unaudited/missing GF core **before** invoking GF-specific metadata APIs. Currently gf_stored_form() runs before the version gate, including for ordinary input. Keep safe field scoping, dynamic-field refusal, exact suppression and normal later GF detection unchanged.
2. Add a native modern-AJAX wrong-GF-version case. Use a read-only query observer if useful to demonstrate zero early form-metadata lookup for ordinary/unsupported-core requests, and a positive audited marked lookup. No vendor API replacement/mock. Also close worker 5's small logged-in coverage gap using the existing authenticated admin session: marked and ordinary modern AJAX with CleanTalk's logged-in protection off/on. Preserve appropriate normal moderation, mail and entry behavior.
3. Correct wording: suppress_cleantalk_ajax_check may remove the priority-10 binding then return false for another remaining binding, so “False (and nothing removed)” is false. “Wherever it was moved” excludes a callback already registered at PHP_INT_MIN. Scope README's repeated-dispatch/restoration paragraph to form-level bindings; the new one-shot bootstrap removal is not in that registry. Explicitly preserve the arbitrary-after-guard-registration limit for this earliest guard.
4. Replace the false broad “CleanTalk 6.88 audit found no submission request” during plugin loading claim. cleantalk.php's admin branch directly invokes ct_contact_form_validate when the unrelated Bitrix-like your-phone/your-email/your-message fields and its setting are present. Describe only the native GF field-layout proof, disclose this known bootstrap path, and retain the unknown-version/bootstrap limits. Do not attempt a new global bootstrap firewall.
5. Complete native checks and report actual source provenance. Keep 0.2.0 and the ten-file allowlist; no unrelated edits.

## 3. Read-first list

- `/home/rudi/.pi/agent/skills/implement-issue/ponytail.md`.
- Authoritative leaf `/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/open/helper-compat/helper-compat`: `implementation/brief-5.md` §8, `implementation/worker-5.md`, `plan.md` repair notes, `review-A.md` and `review-B.md`.
- Current diffs of the GF and compatibility PHP files; plugin/test README; compatibility.test.ts helpers and version tests; mu-plugin.php observers/fixtures.
- Exact GF metadata APIs and version declaration under `.cache/helper-compat-audit/gravityforms/`; CleanTalk `cleantalk.php` admin branch (~715–820) and the actual `apbct_is_user_logged_in` implementation.

## 4. Change list and interfaces

Own `includes/gravity-forms.php`, the compatibility helper comment, the two READMEs, compatibility.test.ts and a narrowly needed read-only mu-plugin query observer. Reuse gf_posted_values with empty fields/$others=true for a cheap helper-only candidate scan, or a comparably small shared approach; do not invoke versioned GF APIs before deciding they are audited. GF's POST `form_id` still decides stored-field scoping once safe. Preserve existing parse()/gf_detect behavior.

The native AJAX helper currently uses the visitor session; an optional session argument can reuse it with the already authenticated admin. Existing version tests alter real runtime declarations and restore hashes. Do not alter real vendor method behavior. Existing `h.http().carriesToken`, envelopes, Simulator and native entry/feed readers are available.

## 5. Do-not, reasons and exceptions

No `.env*` reads/edits/printing. Credential commands only via `bun --env-file=<registered>/.env`, with name/count/boolean-only output. Never expose token, body or licensed ZIP path through assertions/logs. No `src/**`, sites, deployment, dependencies, client-log purges, real SMTP/third-party submission traffic, commits or lifecycle commands. Do not edit registered-checkout review lessons or rewrite worker-5 history; supersede its stale claims in your report. These boundaries preserve ordinary behavior, privacy and audit history. Return a concrete mismatch if an interface/scope fails; only B may revise the brief.

## 6. Ordered steps

1. Add the focused native regression/observer and demonstrate the early-lookup issue safely (criteria 1–2).
2. Make the minimal guard correction and wording changes (criteria 1,3–4).
3. Run native coverage and changed tests to completion, sanitize/check evidence and report (criteria 2,5).

Advisory budget: ~6 files, 50 turns excluding waits. Do not return with pending processes or promises. This brief is frozen; no mid-run additions are planned.

## 7. Commands

Use the resolved changed-tests command (it selects the full suite here):

```sh
AKROGON_BASE=e2075daad1c5b0dd2438ff61d71e606c47819a39 bash -c ': "${AKROGON_BASE:?AKROGON_BASE is required}" && bun test'
```

Targeted native diagnostic probes may supplement it. B runs the final blocking checks after your return.

## 8. Done-when, evidence and report

Reread this section and fill `implementation/worker-6.md` under the authoritative leaf before returning. Record the completed command exits, red/green evidence, exact new guarantees and remaining limits; identify the worker-5 statements superseded. The absence of a forced native remove_action failure is acceptable if explained from WordPress's implementation and the verification branch, not presented as an executed test.

Changed files and reasons: <paths and why>
Tests run: <completed commands, actual exits, native artifact paths>
Known limitations: <including pre/post guard and ordinary token-outside-fields scope>
Unverified criteria: <specific criterion/reason or none>
