# Brief: deployment-audited-stack

## What
Let each deployment list which vendor plugins it audits and pins (subset of gf, ff, ff_pro, cleantalk, fluent_smtp) in its deployment config. The daily re-audit, its GPL Vault download, the notice, the bump, the release manifest's `audited` field and the plugin test suites handle only the listed plugins. The helper refuses marked submissions on a site whose form plugin is not in the built audited list, as it already does for unaudited versions.

## Why
MD Consulting NY does not use Gravity Forms. A Gravity Forms release that fails the audit must never block MD's helper releases, and MD's job must not download Gravity Forms.

## Done-criteria
1. Pirax's config lists all five; its daily re-audit path, bump and published manifest are unchanged (existing reaudit tests pass unchanged in meaning).
2. A test deployment listing ff, ff_pro, cleantalk, fluent_smtp: the re-audit dry path (detect, fetch plan, decide, bump) never requests or reads a GF package, never needs `GRAVITY_FORMS_ZIP`, and produces a candidate and manifest with exactly those four keys.
3. A helper built for that deployment, on a Playground site with Gravity Forms active, refuses a marked GF submission with the awaiting-audit refusal and sends no mail (Playground test with artifact).
4. The same helper still accepts and redirects a marked Fluent Forms submission on Playground (artifact).
5. A config listing an unknown key, an empty list, or ff_pro without ff is refused by schema with the field named.
6. `bun run typecheck` and `bun test` pass.
