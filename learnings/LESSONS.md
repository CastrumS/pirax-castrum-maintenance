# Lessons

- Return-only generic defaults can be overridden by contextual inference from overloaded test matchers; specify the bridge result shape rather than weakening the matcher or default to `any` (2026-09-26, [evidence](history/2026-09-26-form-helper-types.md)).

- When installing a text fixture through a process bridge, verify exact readback and a served marker before trusting screenshots: this Playground bridge malformed Node Buffer input; UTF-8 text plus both checks fixed the false fixture. [Evidence and scope](history/2026-09-25-visual-health-check.md).
- Classify queued/async work once at submission time and persist the verdict with the item; never re-derive it later against mutable settings or credentials (2026-09-25, [history](history/2026-09-25-form-helper-plugin.md)).
- WordPress normalizes header names after `wp_mail` filters; argument-level checks missed effective Cc/Bcc recipients — 2026-09-25 — [case and evidence](history/2026-09-25-form-helper-plugin-review-b.md).
