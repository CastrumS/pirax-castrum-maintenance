# Reused backup names across Playground workers

## Case — 2026-10-06

The helper compatibility suite temporarily changes an installed vendor version, then restores the exact original bytes. Its fixed `<file>.pirax-original` backup name sometimes left FluentSMTP's altered bytes installed after restoration. The SHA-256 assertion correctly failed; increasing timeouts or weakening that assertion would conceal the defect.

A small real-PHP probe isolated the mechanism without vendor sources or credentials: one Playground worker copied a file to the backup, and another worker renamed the backup away. When the first worker revisited that same backup name, `copy()` returned false with ENOENT although `file_exists()` reported true. The unchecked mutation still ran. The subsequent `rename()` also returned false, leaving the altered file behind. The first three probe cycles succeeded; cycles three through seven reproduced the inconsistent existence/readback and failed operations across six worker IDs.

## Evidence

The `reaudit-job` implementation artifacts retain:

- `evidence/lane-after-u1.log`: serial configured check, 295 pass / 1 fail. The expected hash was the original public FluentSMTP 2.4.1 `boot.php`; the received hash was exactly its 2.4.2 mutation.
- `evidence-u1-fixture-repair/probe-old-mechanism.log`: operation results, worker IDs and readback for a synthetic text file. This was a diagnosis probe, not a passing acceptance test.
- `evidence-u1-fixture-repair/red-regression.log`: repeated/nested mutation regression fails the original mechanism's restored-hash assertion.
- `evidence-u1-fixture-repair/green-regression.log` and `green-compatibility-focused.log`: unique backup names and checked copy/write/rename/readback pass the regression and the originally failing native Pro/SMTP scenario.

Broad verification is recorded separately in the implementation report; an interrupted check is not evidence of success.

## Learning

Do not reuse a transient backup pathname across Playground's worker pool. Give each mutation a unique backup name, verify the backup before touching the original, and check every write/rename plus exact-byte readback. Keep the restored-hash assertion. A single green run can merely have avoided the worker-revisit pattern: exercise repeated and nested edits through enough requests to revisit workers.

This establishes a fixture-level workaround for the observed stale-name behavior, not a general fix for Playground's filesystem implementation or every transient WordPress filename.
