# Release approval

## Question
Q1. When the scheduled re-audit passes for a new plugin version, does the job publish the helper release that sites auto-install immediately, or hold it until the operator approves?

### Carries
- Operator 2026-10-02: "I can't manually keep uploading the helpers or plugin files."
- Off route: stopping site auto-updates.

## Findings
- better-than-training · Renovate docs, automerge (https://docs.renovatebot.com/key-concepts/automerge/, read 2026-10-02): automerge any update you would merge anyway; keep it off where you'd want to read changelogs/code first; works for production dependencies "in projects which have great test coverage". Changed: recommendation is automatic publish only because the gate includes the native suites (69 tests) plus an inventory/diff gate, and a failing gate never publishes.
- Inspected: the helper fails closed — an unaccepted version blocks test submissions only; real visitor submissions are never affected (`plugin/pirax-form-test/README.md`, Supported versions). So a held release costs only paused tests, while a wrongly published release could let test data reach a client integration.

## Taken
Operator 2026-10-02, verbatim: "1. automatically"
Reason: operator cannot keep doing manual steps; a failing gate never publishes. Foreclosed: per-release operator approval (1b).
