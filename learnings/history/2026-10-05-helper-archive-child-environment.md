# A clean content scan did not prove child-environment isolation

Date: 2026-10-05
Status: recorded during helper-self-update B review; repair pending at reviewed head `f2b79e29775869e0f353824bb4aafe61280833b0`.

## Case

The helper work added an explicit signing-key-free environment helper for packaging, Playground and Chromium. Its artifact utilities still spawned `zip` and `unzip` with inherited environment. Clearing the signing variable in B's outer verification wrapper made those particular checks safe, but did not repair the reusable utilities or the documented direct test invocation when a signing variable is present.

## Evidence

A fresh Bun process invoked the unchanged `findSecret()` and `sanitizeZip()` with a public, non-key canary under the signing variable's name. PATH wrappers recorded presence booleans and delegated to the real archive tools. `findSecret()` reported zero content hits, yet both unzip calls and the zip call received the variable. A second fresh process without it produced an absent control. No real credential or environment file was used.

The authoritative helper-self-update leaf holds `review-B-env-proof.json` and finding F1 in `review-B.md`. Relevant code: `test/plugin/artifacts.ts:47–48`, the newly extended core scan at `test/plugin/core.test.ts:98`, and trace sanitation from the harness.

## Learning

A content scan observes files, not subprocess environments. Caller-only scrubbing can hide a missing boundary in a shared runner. Environment-isolation checks need presence-only observations at the actual child boundary; comparison material can remain available in the parent without being inherited by non-signing tools.

## Applied — 2026-10-06

Applied on the helper leaf as `938bf9c029708984f4e14002d576923f7649fed4` (worker `086e95a`): the shared archive runner and three direct archive calls omit the signing variable; the new real-archive regression verifies scan/scrub counts, parent retention and four seed-free children. The updater's absence assertion now receives only a presence marker, not the environment. The active lesson line was removed; this historical case is retained for the operator to commit.

Additional verification constraint: existing worktree dotenv symlinks allow Bun to restore an omitted variable. A names-only probe (`implementation/repair-1-env-loading.json` in the helper leaf) observed restoration with automatic loading, but not with an explicit empty value or `--no-env-file`. The repair's literal configured test command uses an empty signing variable to prevent reloading; owned non-signing children still remove the variable entirely. Earlier caller-omission metadata alone did not establish the child's post-bootstrap environment.
