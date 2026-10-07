# Brief: helper-self-update

## What
Pirax Form Test 0.3.0 updates itself through WordPress's normal plugin updates from signed releases on https://github.com/CastrumS/pirax-castrum-maintenance/releases, and reports a block caused only by not-yet-audited plugin versions with its own message. A local release script builds, signs and publishes a helper release.

## Why
Client sites keep plugin auto-updates on. Each audited-version change used to need a manual helper upload on every site; after this leaf a helper release reaches every site with no operator step, and only a release signed with the project key can ever be installed.

## Done-criteria
1. A native Playground test serves a release feed from a local fixture server signed with a test Ed25519 key: WordPress lists the helper update, installs it (version changes) and the helper requests auto-update for itself; an unsigned manifest, a manifest signed by another key, a manifest whose version is not newer, and a package whose SHA-256 differs from the manifest each result in no update offered or a refused install with the installed version unchanged.
2. A native test with a pinned plugin at another version (e.g. Fluent Forms Pro altered to 6.2.16, as in `compatibility.test.ts` VERSIONS) gets the rejection text `Pirax test blocked: awaiting audit of Fluent Forms Pro 6.2.16`, while an unaudited callback from a plugin at its audited version (the Inventory module test) still gets `Pirax test blocked: integrations could not be suppressed`; both create no entry and send no mail.
3. `bun scripts/release-plugin.ts --dry-run` with a test key writes the ZIP, `pirax-form-test-manifest.json` and its `.sig` into `dist/`, and a test verifies the signature with the embedded public key format; without `--dry-run` it refuses when the tag `v<version>` already exists or `PIRAX_HELPER_SIGNING_KEY` is absent (named, never printed).
4. The real Ed25519 key pair exists: public key committed in the plugin, private key stored as GitHub repository secret `PIRAX_HELPER_SIGNING_KEY` (verified by `gh secret list` showing the name); no private key material in the repository, logs or artifacts (`findSecret` scan).
5. `bun run typecheck`, `bun test` (credential-free) and `bun --env-file=.env test test/plugin` pass; plugin README documents the update channel, signature check, key recovery and the new message.
