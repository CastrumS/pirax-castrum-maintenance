# Brief: checker-awaiting-audit

## What
`bun run check|forms` report a designated form whose submission is refused with `Pirax test blocked: awaiting audit of …` as a new warning outcome `awaiting-audit` (exit 0) naming the plugin versions, and report it as `failed` once that site has been awaiting audit for more than 3 days.

## Why
With automatic helper releases, a block right after a plugin update is expected and resolves itself within about a day; reporting it as a failure would train the operator to ignore real failures.

## Done-criteria
1. Browser fixture tests (test/forms/browser.test.ts style): a Fluent Forms and a Gravity Forms fixture answering with the awaiting-audit text yield `awaiting-audit` with the version text in the detail; the existing `integrations could not be suppressed` text still yields `rejected`.
2. Escalation: with a stored first-seen time older than 72 hours for that site, the outcome is `failed` with a detail saying how long it has been awaiting audit; any other outcome for the site clears the stored first-seen state; tests cover first sighting, under/over 72 h, and clearing.
3. The run report and README outcome table show `awaiting-audit` as a warning; exit code is 0 when it is the worst outcome.
4. `bun run typecheck`, `bun test` and `bun --env-file=.env run test:forms` pass.
