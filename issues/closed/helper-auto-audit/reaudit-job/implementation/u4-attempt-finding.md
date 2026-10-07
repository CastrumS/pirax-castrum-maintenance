# Additional integration finding: attempt-stale artifacts

Observed against2ac17e5. Do not edit the active worker's code concurrently.

The workflow uses fixed artifact names `reaudit-candidate`, `reaudit-summary-audit`, `reaudit-summary-publish`, `reaudit-evidence`; notify downloads `reaudit-summary-*`. Candidate validation binds runId only. GitHub reruns preserve run_id and increment run_attempt, while earlier artifacts remain in the run.

Concrete unsafe diagnostic path: attempt1 leaves an audit summary with cleanup=confirmed. Attempt2 fails during acquisition before summary output (e.g. runner loss after activation). Its missing summary upload is ignored. Notification downloads attempt1's fixed-name artifact and chooseNotice accepts it as attempt2's failure summary, claiming confirmed cleanup that has not been established for attempt2. The current run URL can be added to that stale payload, making the mismatch invisible. Fixed-name candidate uploads also collide on a full rerun, or a publisher-only rerun can consume an earlier attempt's artifact.

Repair before landing: bind artifact upload/download names/patterns to the trusted GitHub run attempt; candidate metadata/validation should include the attempt too. The notice loader must read only the current attempt's summaries and use fixed fallback/unknown cleanup when those are missing, even if older-attempt artifacts exist. Preserve current-run selection, main-only guard and no uncertain-publication retry. Test two attempts explicitly: prior confirmed summary/current missing summary cannot yield confirmed cleanup; mismatched candidate attempt is rejected. Document rerunning failed jobs versus a fresh main dispatch where needed.

Related small fail-closed point: publish.ts assigns the post-commit rev-parse output without checking it is40hex. Validate the new commit before any push (a read failure must not skip tag-commit verification via a falsy empty commit).

This was found after brief-4-remainder.md had already been dispatched. It is pending; do not assume the active worker has read this file.
