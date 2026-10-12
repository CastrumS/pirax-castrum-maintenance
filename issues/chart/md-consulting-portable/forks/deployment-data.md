# Deployment data and audited stack

## Question
Q1. Where do per-deployment files live so MD can pull upstream code without merge conflicts: the daily job's pin and version bumps (today written into shared helper source), sites.yaml, and the deployment config?

Q2. Does MD's deployment audit Gravity Forms, or does the audited plugin list become per-deployment?

### Carries
- deployment-shape Q1 (taken 2026-10-12): configurable upstream; MD pulls fixes from upstream.
- deployment-shape Q2 (taken 2026-10-12): visible identity and channel only; internal PHP identifiers unchanged.
- Intake: the daily re-audit and test suites must not require GF when a deployment excludes it.

## Findings
- scripts/reaudit/bump.ts:17-21: every audited bump rewrites three shared files (includes/compatibility.php AUDITED_VERSIONS, pirax-form-test.php Version header and constant, plugin README current-versions section). Last bumps: ff91926 (0.3.2), b27a958 (0.3.1). If both repos run this job, each bump edits the same lines in both repos, so every upstream pull conflicts and helper version numbers collide.
- sites.yaml is tracked (public repo) and differs per deployment.
- Pin list is fixed at five keys in three places: scripts/plugin-source.ts:16, scripts/reaudit/detect.ts:5, scripts/reaudit/notify.ts:27. parseAuditedVersions refuses a missing key (plugin-source.ts:42-43).
- GF adapter (includes/gravity-forms.php:26-31) only hooks gform_* filters, so it is inert on a site without GF; no plugin code change is needed for a site that lacks GF.
- Research tier: better-than-training (inspected repo code) for both questions. Git behavior relied on: two branches that edit disjoint paths merge without conflict.

## Taken
Operator 2026-10-12: "1a | 2a"
- Q1: one folder per deployment (deployments/<name>/: config, sites.yaml, audited pins, helper version), selected by a repository variable; each deployment's jobs write only its own folder; the build injects pins and version into the helper ZIP; Pirax's built helper must stay identical. Reason: upstream pulls merge without conflict. Foreclosed: shared files with manual conflict resolution.
- Q2: per-deployment audited plugin list; MD's list excludes GF; a site with an unaudited plugin keeps refusing marked submissions. Reason: a GF failure never blocks MD releases (intake). Foreclosed: everyone audits all five.
