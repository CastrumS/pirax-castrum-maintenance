# Blocked reporting

## Question
Q1. When a site runs a plugin version the helper does not accept yet, what does the check report and exit with?

### Carries
- Fog item moved here 2026-10-02.

## Findings
- Inspected `src/report/model.ts:10`: outcomes delivered | delivered-spam | not-verified | rejected | unsupported | failed | skipped. README outcome table: not-verified/unsupported are warnings (exit 0); rejected/failed exit 1.
- Inspected `plugin/pirax-form-test/includes/marker.php:23`: one BLOCKED_MESSAGE covers both "plugin version not audited" and "unaudited callback"; the checker sees only that text (`src/forms/submit.ts` error scope), so it cannot tell a routine version wait from a real incompatibility today.
- With automatic releases, a version wait is expected and self-resolving (job run + site auto-update, up to ~1 day); an unaudited callback (e.g. a new plugin on the site) is not self-resolving and needs the operator.
- Today the checker reports `rejected` ("integrations could not be suppressed") and exits 1 (`README.md` outcome table, line ~225).

## Taken
Operator 2026-10-02, verbatim: "1a"
The helper reports a version-only block with its own message naming the not-yet-accepted plugin and version (e.g. "Pirax test blocked: awaiting audit of Fluent Forms 6.2.16"); every other block keeps "integrations could not be suppressed". The checker maps the version-only message to a new warning outcome `awaiting-audit` (exit 0) and escalates it to `failed` once the same site has been awaiting audit for more than 3 days. Foreclosed: reporting every block as a failure.
