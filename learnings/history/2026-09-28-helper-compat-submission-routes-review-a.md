# Helper compat: a vendor binding audited on one route left another submission route open

Recorded: 2026-09-28 (helper-compat, check.review seat A, initial review of `aac43d6`).

## Case

The leaf audited CleanTalk 6.88's Gravity Forms bindings (`gform_entry_is_spam` and `gform_confirmation` at 999) and removed them for marked submissions. It verified that CleanTalk's generic AJAX check skips Fluent Forms (`fluentform_submit` is listed in `inc/cleantalk-ajax.php:119`). It then documented that "GF is checked only through its own binding". All its native GF cases used postback.

GF 3.1.2 also has a modern AJAX route (`action=gform_submit_form` to `admin-ajax.php`), which the checker supports. On that route:

- CleanTalk takes its admin branch. `gform_submit_form` is not in `$_cleantalk_hooked_actions`, so it schedules `ct_ajax_hook` on `plugins_loaded` (`cleantalk.php:745-787`).
- That check sends the whole POST to CleanTalk before any submission-time preflight runs.
- CleanTalk's own GF bindings are never registered there (`apbct_init` is public-only), so the helper found nothing to remove and reported `ready`.

## Evidence

- Leaf `issues/open/helper-compat/helper-compat/review-A.md`, finding F1: source trace with file:line references.
- `review-A-repro-gf-modern-ajax.ts` and `.log` beside it: native reproduction on the full audited stack.
  - One `check_message` moderation request was made during `plugins_loaded` with `action=gform_submit_form`.
  - Its body contained the marker id and the token (checked as booleans only; no value printed).
  - The marked submission still confirmed and was redirected, and the panel said `ready`.

## Learning

A third-party integration is not isolated by auditing its callbacks on the form plugin's default route. Before claiming isolation, enumerate every submission route the checker supports (postback, iframe, modern AJAX, the plugin's own AJAX action). For each route, trace the vendor's request-level paths as well as its per-plugin hooks. Generic AJAX or POST checks often run at `plugins_loaded`, before any submission-time classification can act. Give each route its own native marked and ordinary case.
