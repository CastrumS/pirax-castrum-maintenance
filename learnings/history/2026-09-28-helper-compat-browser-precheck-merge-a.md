# Helper compat: a server-side marker cannot cover a vendor's pre-submit browser calls

Recorded: 2026-09-28 (helper-compat, merge seat A; review-A nit N1, held through the re-check).

## Case

The brief asked that a marked submission send nothing to CleanTalk's servers and make "zero HTTP requests to CleanTalk hosts" (item 2, done-criterion 1). The helper achieves that for the marked form POST on every supported route.

The visit as a whole still reaches CleanTalk:
- CleanTalk 6.88's frontend script runs a pre-submit email check by default (`data__email_check_before_post => 1`, `lib/Cleantalk/ApbctWP/State.php:88`).
- That check calls the site's `/wp-json/cleantalk-antispam/v1/check_email_before_post`, which calls `api.cleantalk.org`.
- It happens while the visitor fills the form, before any marked POST exists.

The site plugin has no marker to classify that request by, so it cannot stop it without changing ordinary visits. The request carries the checker's configured email address, not the marker. The checker fills email controls with `config.address` (`src/forms/fill.ts:124`) and puts the marker only in a text or textarea control (`:57`, `:84`). A marker typed into an email field by hand would be sent.

The leaf met the criterion per submission and excluded exactly that REST path from its assertions. It documented the visit-level boundary. Containing the pre-check needs a checker change, and the leaf excluded `src/**`, so the question was left to the operator.

## Evidence

- Leaf `issues/open/helper-compat/helper-compat/`:
  - `review-A.md`: N1 in the initial review, still open in the re-check.
  - `plan.md`: implementation note "D2/AC1 browser boundary".
  - `implementation/report.md`: limitation 1.
- `review-A-recheck-gf-modern-ajax.log` beside them. During the marked GF submission on the repaired head, the only CleanTalk-bound request was this pre-check (`parse_request`, `api.cleantalk.org`, contained by the harness). It carried neither the marker id nor the token (checked as booleans only).
- `test/plugin/compatibility.test.ts:24,116`: marked-submission assertions exclude only that REST path.

## Learning

A server-side marker only governs requests that carry it. Vendor browser scripts can call their own APIs during a test visit before the marked submission exists: pre-submit checks, bot detection, telemetry.

When a brief asks for "zero requests to vendor X":
- State whether it means the marked submission or the whole test visit.
- Contain visit-level traffic in the checker's browser, by blocking or routing the vendor's endpoints, not in the site plugin.
- Keep the marker out of every field such pre-checks read.
