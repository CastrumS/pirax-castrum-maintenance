# Lessons

- **Own the connection, not the listening port — 2026-09-26:** local service discovery can open unrelated sockets on a test listener. Assert cleanup against the real client's endpoint and close event; never weaken deadlines to accommodate unrelated peers. [Case and evidence](history/2026-09-26-form-check.md).

- Return-only generic defaults can be overridden by contextual inference from overloaded test matchers; specify the bridge result shape rather than weakening the matcher or default to `any` (2026-09-26, [evidence](history/2026-09-26-form-helper-types.md)).

- When installing a text fixture through a process bridge, verify exact readback and a served marker before trusting screenshots: this Playground bridge malformed Node Buffer input; UTF-8 text plus both checks fixed the false fixture. [Evidence and scope](history/2026-09-25-visual-health-check.md).
- Classify queued/async work once at submission time and persist the verdict with the item; never re-derive it later against mutable settings or credentials (2026-09-25, [history](history/2026-09-25-form-helper-plugin.md)).
- WordPress normalizes header names after `wp_mail` filters; argument-level checks missed effective Cc/Bcc recipients — 2026-09-25 — [case and evidence](history/2026-09-25-form-helper-plugin-review-b.md).
- Form plugins mark required checkboxes with `aria-required`/container classes, not HTML `required`; read required-ness from the plugin's own markup and exercise consent/terms fields natively — 2026-09-26 — [case and evidence](history/2026-09-26-form-check-required-markers.md).
- Substring redaction of non-secret configuration (hosts, folder/bucket names, paths) corrupts unrelated paths and turns valid input into refusals; redact only secrets — 2026-09-26 — [case and evidence](history/2026-09-26-form-check-value-redaction.md).
- Adding a result for an edge input (empty, absent) silently falsifies old docs for that input, even inside a paragraph the diff edits; re-check every clause of edited paragraphs and grep for the old edge-case wording, not only the inserted text — 2026-09-27 — [case and evidence](history/2026-09-27-form-check-scope-edited-paragraph.md).
