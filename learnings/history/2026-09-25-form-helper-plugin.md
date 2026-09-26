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

## Follow-up — 2026-09-26: the id also travels in the queued job payload

The repair above was hardened before merge. Entry meta alone still left a window: a native FF entry deletion after a runner had loaded a queued job, but before the job's notification action read the classification, removed the meta, so the job ran as ordinary. Worker 6 reproduced this in real WordPress: the marked job's mail went out unredirected (subject `ff-3 notification A` instead of `[pirax-test abc123] ff-3 notification A`).

The adapter now stamps the validated id (never the token) into each marked notification job's payload at `fluentform/integration_feed_before_parse`, right before FF serializes the job, and strips the key from ordinary jobs. Job context reads the payload id first and falls back to the entry meta only for jobs queued without it. Request-end cleanup still reads the entry meta.

Durable evidence summary, since the run directories under the ignored `artifacts/` disappear with the worktree:

- Token rotation/clearing (worker 3): rotated token, marked queued mail still redirected and the entry deleted; cleared token, marked mail failed closed, jobs `failed` with retry count 1 and the entry kept; after reconfiguring, FF's retry delivered to the redirect and the entry was deleted.
- Deletion race (worker 6): red run, three untagged mails after the runner; green run, `[pirax-test] ff-3 notification A`, `ff-3 notification A`, `ff-3 notification B` (only the marked job redirected), with both marked payload rows carrying `abc123` and none of the three ordinary rows carrying the key.
- Tracked regressions in commit `2e2105c37b199065a311b16ffc5797799fc50253`: `test/plugin/adapters.test.ts` "FF queued email: rotating or clearing the token never turns queued test mail into client mail" and `test/plugin/safety.test.ts` "FF queued cleanup race: a marked entry deleted natively after the runner loaded it, with the token rotated, still sends only redirected mail; ordinary jobs stay ordinary".

The learning holds one level further: stored with the work means inside the job payload, not only on a record that can be deleted while the job runs.
