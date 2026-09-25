# 2026-09-25 — form-helper-plugin: queued test classification re-derived from mutable token

## What happened

In the first version of the Fluent Forms adapter, a queued notification job decided whether it was a test by re-parsing the entry's stored field values with the token configured at the time the job ran. Cleanup did the same.

Worker 3's adapter suite caught a real regression:

- An **ordinary** entry was submitted while the token was empty. Its queued feed job ran after the test restored the token.
- The ordinary entry was then deleted, because the re-parse against the new token now classified it as marked.
- The same mechanism in the other direction: clearing or rotating the token while marked jobs were still queued would have re-classified them as ordinary. Their mail would then have gone to the client's original recipients.

## Evidence

The evidence comes from real WordPress 7.1.2, Fluent Forms 6.2.14 native queue and Action Scheduler runs, and is retained in the worktree:

- `artifacts/plugin/adapters-2026-09-25T14-59-26-211Z/`: `queue-states.jsonl`, `mail.jsonl`, `entries.json`. It is the final green run with the regression test. Earlier iteration directories are beside it.
- The regression test in `test/plugin/adapters.test.ts` covers token rotation (still redirected and deleted) and token clearing (mail fails closed, jobs `failed`, entry kept; after reconfiguring, FF's retry delivers to the redirect and the entry is deleted).
- Implementation report: `issues/open/site-checks/form-helper-plugin/implementation/worker-3.md`.

## Repair

At submission time, the adapter now writes submission meta `_pirax_form_test = <id>` for a marked entry. The meta holds only the id, never the token. Queued job context and cleanup read that meta, and FF's native entry deletion removes it.

The hourly recovery sweep still matches the current token on purpose, which is why the plugin README tells operators to clear pending tests before rotating.

## Learning

When deferred work needs a classification that depends on configuration, record the classification together with the work at the moment it is decided. Configuration can change between enqueue and execution, and re-deriving the classification then gives a different answer in both directions: here, an ordinary entry was deleted and client mail could have leaked.
