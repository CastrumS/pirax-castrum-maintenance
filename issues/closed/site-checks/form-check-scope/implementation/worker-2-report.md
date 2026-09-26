# Worker 2 report: README empty-result contract (review B F1)

Worktree: `/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/worktrees/form-check-scope`, starting head `2abc3458f796da5501ce82fe83d810f0cc766dcd`, base `0a7ddf98806ede20a331cd2d68e073e89741648e`. Nothing is committed. Nothing ran against a live site. No `.env` file was opened or printed. Values were loaded only through `bun --env-file=.env`. Evidence is in `<leaf>/implementation/worker-2-evidence/` (leaf = `/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/open/site-checks/form-check-scope`).

**Status: AC1–AC3 are met. Only one README line changed. The configured changed-tests command exits 0 with 212 pass / 0 fail.**

## Changed files and reasons

| Path | Why |
| --- | --- |
| `README.md` (line 204, Private reports and local evidence) | Fixes F1. The old text said "no forms is `[]`" unconditionally. It now reads: "a successfully scanned page without forms is `[]`, except the `test_form` page, which gets one `failed` result with detail `test form not found`; discovery failures (including positively identified HTTP-200 challenge/interstitial pages) are explicit failed results." This matches the Designated test form section (`README.md:231`). |

Before editing, I checked the new wording against the code, read-only. `src/forms/runner.ts:51` returns only a `page-scan` failure when discovery fails. `src/forms/runner.ts:89` appends `{selector: 'test-form:<plugin>:<id>', plugin, outcome: 'failed', detail: 'test form not found'}` only when the designated page scans successfully and has no match. `test/forms/browser.test.ts:336-365` asserts both behaviours: the `/empty` designation gives `["gravity:failed"]`, and `/challenge` and `/missing` give a single `page-scan` failure.

`git diff --stat`: `README.md | 2 +-`, 1 file changed. No source, test, `sites.yaml`, helper flag, page, plan or `issues/` file was touched. The deferred Nits from review A were not implemented. No test was added for the prose, as the brief specifies.

## Tests run

The resolved configured changed-tests command, run verbatim from the worktree:

```sh
mise exec node@24.21.0 -- env AKROGON_BASE=0a7ddf98806ede20a331cd2d68e073e89741648e bun --env-file=.env -e 'const p=Bun.spawn(["bash","-c",": \"${AKROGON_BASE:?AKROGON_BASE is required}\" && bun test"],{stdout:"inherit",stderr:"inherit",env:process.env}); process.exit(await p.exited)'
```

Result (`worker-2-evidence/changed-tests.log`, exit code in `worker-2-evidence/changed-tests.exit` = `0`, finished 2026-09-27 00:17:17 +0200):

```
 212 pass
 0 fail
 2643 expect() calls
Ran 212 tests across 20 files. [1243.67s]
```

Run summaries emitted by the command (paths relative to the worktree):

- Native Playground: `runs/forms-playground-e11f4094-4f0a-450e-af82-1bf82aef83e8/summary.json`. Cleanup `{ok: true, deleted: 42, remaining: 0, stopped: true}`. Privacy `{files: 109, archives: 46, unsafe: 0}`. GF 3.1.2 / FF 6.2.14 / WP 7.1.2 / PHP 8.3.
- Forms browser (headless Chromium traces, no video): `runs/forms-browser-5c6be6ae-add6-45e7-a01e-02f26209044d`
- Forms report: `runs/forms-report-tests-bb631c55-f7b8-45d6-aff8-5f28b3248d5a/summary.json`
- Collision: `runs/forms-collision-23de52a4-7595-43c1-a33d-af857874bd83/synthetic-folder-collision/summary.json`
- Capture fixtures: `runs/capture-test-2026-09-26T21-56-34.483Z`

These are regression evidence for unchanged runtime code. They are not new delivery evidence from this documentation-only change.

## Known limitations

- The change is documentation only. Runtime behaviour, test deadlines and form-scope boundaries are unchanged. The existing empty-page designation regression already proves the documented behaviour, and nothing tests the prose itself.
- I did not run `bun run typecheck` separately; the brief leaves that to B. No TypeScript changed.
- There were no failures or flakes in this run.

## Unverified criteria

None.
