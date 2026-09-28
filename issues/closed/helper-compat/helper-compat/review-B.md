# Review B — helper-compat

## Verdict: fix

- Base: `e2075daad1c5b0dd2438ff61d71e606c47819a39`.
- Reviewed head: `aac43d6516b3cbb8f2187f1b98b49c36ac6ecef6`.
- Initial blind review. No peer review was read, no peer was contacted, and no wait for the peer was needed. Debate was disabled; no position/rebuttal artifacts are expected.
- Worktree is clean and unchanged from the implementation's completed checks. No production or test code was edited during this review.

## Fix F1 — the new “no query” HTTP ledger retains inbound query strings

**Targets:** `test/plugin/mu-plugin.php:22-25` and the new `Pirax_Harness_Transport::request()` logging calls; `test/plugin/harness.ts:49`; `test/plugin/README.md:109`; the HTTP privacy case in `test/plugin/stack-harness.test.ts`.

**Contract:** plan D6 specifies safe HTTP evidence without credentials/token-bearing URLs, and AC7 requires accurate documented evidence/privacy boundaries. The new `h.http()` documentation explicitly describes its complete record, including `request`, as having **“no query, header or body”**; its TypeScript comment makes the same promise.

The transport correctly reduces the **outgoing** URL to host/path, but then calls the existing shared `pirax_harness_log()`. That function appends the **incoming** `$_SERVER['REQUEST_URI']` unchanged as `request`. The new HTTP evidence stream therefore retains inbound query strings even though its destination `path` is query-free. The current test puts a synthetic secret in the outgoing URL/body only, so it cannot detect this second route into the record.

This is present in the final passing native artifact, not merely a hypothetical flow. A count-only inspection of:

`artifacts/plugin/compatibility-2026-09-28T18-03-33-971Z/http.jsonl`

returned:

```json
{
  "records": 77,
  "requestWithQuery": 34,
  "requestWithNonce": 6,
  "pathsWithQuery": 0
}
```

Six request-context fields contain `_wpnonce=` from disposable wp-admin activity. No nonce or query value was printed or copied into this review. See `review-B-evidence.json`.

**Required correction:** make the new HTTP ledger's incoming request context path-only (or otherwise exclude the query before serialization), while retaining the hook/action correlation needed by the tests. Add a native harness regression with a **synthetic inbound query value**, alongside the existing outgoing-query/body case, and assert the value/query is absent from the retained HTTP record. Keep the documented boundary true; do not solve this merely by broadening secret-name scanning. An HTTP-specific context projection is sufficient—this finding does not require changing the pre-existing browser network ledger's URL contract.

**Why blocking:** the documented privacy projection is false and its test verifies only half the record construction. The configured-value privacy scan can correctly report zero matches while arbitrary appended query values remain. This finding is **not** a claim that the operator's actual marker or licensed ZIP path leaked in the final run, nor a production-site exploit claim; the observed nonces are from disposable test WordPress.

## Other review conclusions

- The shared compatibility report/collector avoids separate admin and submission allowlists. Exact optional-version gates, marked-only binding removal, disabled-vs-unrecognized CleanTalk handling, GF numeric variants and escaped admin rendering are consistent with the plan.
- CleanTalk's actual FF closure identity/capture is checked, not confused with its integration class's data-collection method. GF's spam and confirmation bindings are suppressed before their audited dispatch priorities.
- Pro's opt-in/approval/draft/auto-delete side effects are removed rather than simply allowed while dormant. Native webhook queue exclusion and the Pro auto-delete/retry race have meaningful positive/negative controls.
- Native tests use the real plugins and browser submission flows; transport interception and Simulator selection are at the allowed external-effect boundary. Modified version declarations exercise real submission gates and are restored with hash verification; they do not add a production override.
- The existing mail transformation is exercised through FluentSMTP's replacement `wp_mail`, effective PHPMailer recipients and its Simulator log, not only the old `pre_wp_mail` short-circuit. Ordinary controls are checked before and after marked work.
- The unchanged ten-file archive allowlist, header 0.2.0, no new dependencies/endpoints, and exclusions of `src/**`/`sites.yaml` are respected.

## Scope/limitation assessment

The report openly records three important boundaries. They are not additional findings here:

1. **Pre-submit browser activity vs marked submission:** the earlier CleanTalk email check/telemetry cannot be classified from a marker-bearing POST that does not yet exist. The code and docs do not promise a CleanTalk-free entire browser visit, and the test excludes only the exact pre-check route. The helper's server-side marked-submission contract and a stronger whole-visit claim must not be conflated. No rollout is authorized by this review.
2. **Requests vs `pre_http_request`:** source/runtime evidence shows CleanTalk bypasses the latter. Intercepting the real Requests transport is the appropriate deeper boundary; a `pre_http_request`-only zero would be misleading. The raw-socket ceiling is documented rather than presented as a universal sandbox.
3. **FluentSMTP exact 2.4.0:** the locked design's exact-version rule takes precedence over reading “2.4.x” as wildcard support. Simulator evidence is not real provider/SMTP/IMAP delivery.

Admin-request readiness, after-guard dynamic callbacks and unaudited optional Pro modules are likewise documented limitations, not evidence of a current accepted-stack defect. Uncertainty about arbitrary future PHP is not counted as a Fix.

## Verification and documentation review

- Read the plan/design and dated implementation notes, implementation report and worker evidence already present in this session; reviewed the live committed production/test changes and affected plugin/test/root documentation.
- `akrogon config` confirms the supplied base and blocking typecheck/test/test_changed commands; `grounding: none` and no advisory checks.
- The head is unchanged, so the completed final evidence remains applicable:
  - `implementation/final-full-suite.log`: exit 0, **239 pass / 0 fail**, 2955 assertions, 1910.70 s.
  - `implementation/final-typecheck.log`: exit 0.
  - `implementation/final-build.log`: exit 0, ten allowlisted files; core tests verify 0.2.0.
  - `implementation/final-diff-check.log`: exit 0.
  - `implementation/final-privacy.log`: zero configured credential/path matches, with the structural limitation identified in F1.
- Did not rerun the entire unchanged suite. The specific new verification was a read-only, count-only inspection of the actual final HTTP ledger, recorded in `review-B-evidence.json`.
- Earlier browser-closure and R2 `InternalError` failures are preserved, were rechecked without masking changes, and both passed in final checks. Their causes remain appropriately unconfirmed.
- Affected human docs were reviewed; F1 identifies a false new claim. No `AREA.md` exists in the reviewed diff, so there are no AREA path-list checks to perform.
- The committed credential-assertion history was checked against `worker-1.md`'s incident/scrub evidence and the synthetic preflight test. `learnings/LESSONS.md` was not used as review input.
- A new reusable lesson about a shared logger appending unsafe context after a safe projection was written under the **registered checkout's** `learnings/` (`history/2026-09-28-helper-compat-http-context-review-b.md` plus one active line), left uncommitted for the operator as required. It is not a code change on this leaf branch.

## Nits

None. F1 is the only requested repair from this seat.
