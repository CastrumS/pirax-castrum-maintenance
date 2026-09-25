# Lessons

- When installing a text fixture through a process bridge, verify exact readback and a served marker before trusting screenshots: this Playground bridge malformed Node Buffer input; UTF-8 text plus both checks fixed the false fixture. [Evidence and scope](history/2026-09-25-visual-health-check.md).
- Classify queued/async work once at submission time and persist the verdict with the item; never re-derive it later against mutable settings or credentials (2026-09-25, [history](history/2026-09-25-form-helper-plugin.md)).
