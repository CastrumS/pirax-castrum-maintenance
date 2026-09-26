# Form checker: substring redaction of non-secret configuration

Recorded: 2026-09-26 (slot A review of form-check at `83509cb`).

## Case

To keep the token and credentials out of logs, reports and traces, the production redactor replaced every substring match of many configuration values. It covered hosts, IMAP folder names, the bucket, the endpoint and a local ZIP path, not only secrets. The `forms` command added a guard that refuses to run when any of those values appears in the run directory or the site list. Printed signed report links had already been dropped because the redactor corrupted them.

## Evidence

- `src/forms/evidence.ts:11–12` holds the environment-name list. `src/commands/forms.ts:25` holds the identity guard.
- With synthetic, documented-valid configuration and `IMAP_FOLDER=Pirax`, `runForms` from a checkout under `…/Pirax-Castrum-Maintenance/` exited 2: "Site/run identity contains configured private data; use non-secret identities." The `check` log path became `…/Privatni/<redacted>-Castrum-Maintenance/runs/…/index.html`.
- The operator's current values happened not to collide (checked by booleans only), so all suites passed. The defect stays latent until a label rename or site-list edit.
- Leaf review: `issues/open/site-checks/form-check/review-A.md`, F2.

## Learning

Value-based redaction is only safe for high-entropy secrets. Ordinary configuration values such as folder labels, hostnames, bucket names and paths are short, common strings that occur in unrelated paths, URLs and site data. Redacting them corrupts useful output, and a "contains private data" guard built on them rejects valid input. Classify which values are actually secret, redact only those, and test with a config value that also appears in a path.
