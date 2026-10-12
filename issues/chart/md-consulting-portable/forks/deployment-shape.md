# Deployment shape

## Question
Q1. Does MD Consulting NY get a configurable upstream (this repo reads one deployment config; their repo is a copy plus their config and pulls fixes from here), or a one-time renamed fork they own?

Q2. How deep does the helper's identity change per deployment: visible identity and update channel only (name, author, description, folder/zip slug, Update URI, releases URL, public key, refusal-text prefix), or also internal PHP identifiers (namespace, option names, hooks, mail header)?

### Carries
- Intake: Pirax's installed helpers (slug pirax-form-test) and update channel must keep working unchanged.
- Intake: a second deployment is created by copying the repo and changing configuration only.

## Findings
- Q1 research: model-knowledge tier. Search "white-label WordPress plugin same codebase multiple brands build-time config vs fork" (2026-10-12) found only vendor pages; WP Ghost KB (https://wpghost.com/kb/?p=7273) bakes per-brand branding into a per-brand ZIP from one codebase. No practitioner write-up found.
- Q2 evidence: plugin/pirax-form-test/includes/updates.php:20-25 holds the channel constants. Internal identifiers (pirax_form_test_token, _redirect, _sweep, namespace Pirax\FormTest) are stored in site databases and cron; renaming them per deployment means the Pirax build must emit today's names exactly.

## Taken
Operator 2026-10-12: "1a | 2a"
- Q1: configurable upstream. One deployment config holds every operator-specific value; a second deployment is a repo copy with its own config and pulls fixes from upstream. Reason: queued fixes (updater, GF confirmation detection) reach both deployments once. Foreclosed: one-time renamed fork.
- Q2: visible identity and update channel only (plugin name, author, description, folder/zip slug, Update URI, releases URL, public key, refusal-text prefix). Internal PHP identifiers (namespace, option names, hooks, mail header) stay as today in every build. Foreclosed: full internal rename.
