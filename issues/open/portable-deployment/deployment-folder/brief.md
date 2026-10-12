# Brief: deployment-folder

## What
Move every operator-specific value out of code into `deployments/<name>/`, selected by `DEPLOYMENT`, and make the checker, helper build, release, failure notice and workflows read it. Pirax's values move to `deployments/pirax/` (identity, update channel, public key, notice recipient, repository, refusal-text prefix, filler text, current audited pins and helper version, and `sites.yaml`). The daily bump writes pins and version into the deployment folder instead of shared helper files. A synthetic second deployment used only by tests proves a different config yields a differently branded, separately signed helper channel with no code edits.

## Why
MD Consulting NY needs its own copy of this setup and must be able to pull upstream fixes without merge conflicts. Today Pirax is hard-coded in about 45 files and the daily bump edits shared helper source.

## Done-criteria
1. A helper ZIP built from this branch with `DEPLOYMENT=pirax` has the same file list and byte-identical file contents as a ZIP built from `main` at the leaf's base commit (comparison script output saved as evidence).
2. A test deployment fixture with a different name, slug, releases repository, public key and refusal prefix builds a ZIP whose folder, entry file, `Plugin Name`, `Update URI`, release root, public key and refusal text all carry the fixture values, and whose internal identifiers (namespace `Pirax\FormTest`, `pirax_form_test_*` options and hooks) are unchanged.
3. With the fixture deployment, the helper's update code accepts a release signed with the fixture key at the fixture URL and rejects one signed with Pirax's key or served from Pirax's URL (Playground test).
4. `DEPLOYMENT` unset, empty, or naming a missing folder makes `check`, `build:plugin`, release and notify exit with a configuration error that names the variable; an invalid config file is refused by schema with the field named.
5. The reaudit bump writes only `deployments/$DEPLOYMENT/` files; `git grep` finds no audited version literal or helper version literal left in shared helper source.
6. `sites.yaml` lives at `deployments/pirax/sites.yaml`; `bun run check <one site>` against a live Pirax site still runs end to end and leaves a report (artifact path recorded).
7. `.github/workflows/reaudit*.yml` select the deployment from `vars.DEPLOYMENT` and no longer compare `github.repository` to a literal; the failure notice recipient and repository come from the deployment config.
8. `bun run typecheck` and `bun test` pass.
