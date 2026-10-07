# Design: checker-awaiting-audit

## Binding decisions, verbatim

### blocked-reporting
Question: Q1. When a site runs a plugin version the helper does not accept yet, what does the check report and exit with?

Answer: Operator 2026-10-02, verbatim: "1a"
The helper reports a version-only block with its own message naming the not-yet-accepted plugin and version (e.g. "Pirax test blocked: awaiting audit of Fluent Forms 6.2.16"); every other block keeps "integrations could not be suppressed". The checker maps the version-only message to a new warning outcome `awaiting-audit` (exit 0) and escalates it to `failed` once the same site has been awaiting audit for more than 3 days. Foreclosed: reporting every block as a failure.

### release-approval
Question: Q1. When the scheduled re-audit passes for a new plugin version, does the job publish the helper release that sites auto-install immediately, or hold it until the operator approves?

Answer: Operator 2026-10-02, verbatim: "1. automatically"
Reason: operator cannot keep doing manual steps; a failing gate never publishes. Foreclosed: per-release operator approval (1b).

Excluded here (owned by another leaf): update-channel (helper-self-update); audit-depth (reaudit-job); operator-notice (reaudit-job); job-host (reaudit-job); paid-source (reaudit-job); updater-source (reaudit-job); ff-6215 (reaudit-job)

/home/rudi/.claude/skills/chart-issues/assets/standing-design.md
Interpretation for this leaf: no auth or plugin is mocked beyond the existing local fixture-server pattern the browser tests already use; negative/edge cases (exact text match only, other refusal texts, 72 h boundary, clearing) are mandatory; the end-to-end artifact is the forms browser test evidence directory; no new secret.

## Leaf architecture
- Owned: `src/forms/submit.ts` (classification of the refusal text), `src/report/model.ts` (new outcome), report rendering, the first-seen state, `README.md`, tests under `test/forms/` and `tests/`.
- Contract with helper-self-update (its brief owns the text): refusal text begins `Pirax test blocked: awaiting audit of ` followed by `<Plugin label> <version>` items separated by `, `.
- First-seen state: persisted per site in the existing R2 store (`src/store.ts`) under a dedicated key prefix (e.g. `state/awaiting-audit/<slug>.json` holding an ISO timestamp), read and written only by the forms pass; failures to read/write state degrade to treating the sighting as first (never crash the run) and are noted in the detail.
- Excluded: helper behaviour (helper-self-update), the re-audit job (reaudit-job).
