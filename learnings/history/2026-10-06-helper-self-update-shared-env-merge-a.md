# A secret in the shared `.env` reaches every Bun process, even one whose parent omits it

Date: 2026-10-06
Status: recorded when slot A merged helper-self-update. It comes from review A's Nit N1; keeping the local key copy remains the operator's policy decision.

## Case

helper-self-update's locked design keeps the release signing seed, `PIRAX_HELPER_SIGNING_KEY`, only in the GitHub repository secret. A local copy was supplied outside the leaf, in the registered `.env` (plan note, 2026-10-05).

The leaf strips the seed from its own packaging, archive, Playground and Chromium children. Two other paths still carry it:

- Every `bun` command started in the registered checkout or a leaf worktree loads it, because each worktree has a `.env` symlink to the registered file.
- Unowned suites (forms, R2, visual) and checker runs pass it to their own Chromium and Playground children.

During repair, B found that removing the variable from a Bun child's `env` is not enough: Bun restores it from the `.env` in the child's working directory.

## Evidence

- Names-only probe from the leaf worktree during the merge; it printed `present`/`absent` only:
  - parent started with `--no-env-file` and without the variable: `absent`;
  - Bun child with the variable omitted from `env`: `present`;
  - child given an explicit empty value: `absent`;
  - child with the variable omitted and `--no-env-file`: `absent`.
- B's earlier probe gave the same results (`implementation/repair-1-env-loading.json` in the helper-self-update leaf). B therefore ran the configured `bun test` with an empty signing variable (`repair-1-final.json`), and the merge checks did the same.
- Review A's N1 and its re-check are in that leaf's `review-A.md`.

## Learning

- Omitting a variable from a Bun child's `env` does not make it absent when the child's working directory has a `.env`, including a worktree symlink. Pass `--no-env-file` or an explicit empty value, and check presence where the child actually runs.
- Putting a credential in the shared `.env` hands it to every Bun process in the repository and its worktrees, and to their children unless each boundary strips it. Keep secrets that only a job needs in that job's secret store. If a local copy must exist, document that exposure or strip it at each boundary.
- Children that are not Bun (`zip`, `unzip`, `git`, `node`, Chromium) do not load `.env` automatically, so omitting the variable is enough for them.
