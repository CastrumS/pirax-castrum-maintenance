# A single-match artifact pattern downloads flat

## Case — 2026-10-07

The re-audit workflow's notice job downloads `pattern: reaudit-summary-${{ github.run_attempt }}-*` with the default `merge-multiple: false`. `scripts/reaudit/notify.ts` then reads `<dir>/reaudit-summary-<attempt>-<job>/summary.json`, the per-artifact subdirectory layout. At most one summary artifact can exist per attempt: a failed audit writes one, and the publish job runs only after an audit that wrote none. `actions/download-artifact` v8.0.1 extracts a download that resolves to a single artifact directly into `path`, so the file landed at `<dir>/summary.json`. The loader found nothing and sent the fixed fallback notice: stage `setup`, cleanup `unknown`, no versions. The real stage, reason, cleanup state, throwaway-site URL and intended commit/tag were silently dropped. The unit and CLI tests built the nested directory by hand, so they passed while encoding a layout the action never writes.

## Evidence

- `actions/download-artifact` v8.0.1, `src/download-artifact.ts`: `path: isSingleArtifactDownload || inputs.mergeMultiple || artifacts.length === 1 ? resolvedPath : path.join(resolvedPath, artifact.name)`. Its README's v5 note says: "This change also applies to patterns that only match a single artifact."
- `upload-artifact` v7.0.1 keeps `archive: true` by default, so a single-file upload's ZIP has the file at its root.
- Reaudit-job review A (`issues/open/helper-auto-audit/reaudit-job/review-A.md`, F1) ran `bun --no-env-file scripts/reaudit/notify.ts --jobs <dir>` without mail credentials. With the flat layout it reported `stage: setup`; with the hand-made nested layout it reported `stage: audit`.
- `tests/reaudit-decide.test.ts` and `tests/reaudit-workflow.test.ts` at `6e10d6c` create `<dir>/reaudit-summary-1-audit/summary.json` themselves.

## Learning

An artifact's on-disk location after download depends on how many artifacts the request resolves to at run time, not on how the step is written. A `pattern` that usually matches one artifact behaves like a named download and extracts flat. Read the pinned action's destination rule. Prefer one named download per expected artifact, each into its own `path`. Write tests from the layout the action actually produces, not from a directory the test builds itself. Checking artifact names and attempt binding does not verify where the bytes land.
