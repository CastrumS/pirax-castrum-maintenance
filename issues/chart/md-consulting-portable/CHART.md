# Chart: md-consulting-portable

## Destination
A copy of this repo plus one changed config file is a working, fully separate MD Consulting NY deployment, while Pirax keeps working unchanged.

## Forks taken
- [Deployment shape](forks/deployment-shape.md): configurable upstream; rename visible identity and update channel only
- [Deployment data](forks/deployment-data.md): per-deployment folder chosen by a repo variable; per-deployment audited list, MD without GF
- [Weekly check host](forks/weekly-check-host.md): MD weekly check in GitHub Actions with emailed summary and 7-day report link; Pirax keeps its local timer

## Open forks

## Fog

## Off route
- Friday updater (intake-updater.md): separate chart; reaches MD later.
- MD's plugin display name, site list, recipient and credentials: values for step 2, not needed for step 1 code (step 1 tests use a synthetic second deployment).
- Moving Pirax's weekly check to Actions: later, by operator choice 2026-10-12.
- Step 2 setup of MD's repo, secrets and helper installs: operator work after step 1 merges.

Handed off 2026-10-12
