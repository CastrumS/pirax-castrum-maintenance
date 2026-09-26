# Plan: checker-foundation

## Status and prerequisite verification

Synthesis by slot B, resumed 2026-09-25. Leaf state has `debate: "no"`; this is direct synthesis of the brief, locked design and live worktree, not a debate pass. The previously missing R2 configuration is now present; the credential-presence blocker is cleared. Implementation initially encountered the separate template-write restriction recorded in Implementation notes below; the operator has now provided the template, clearing the existence blocker.

Ran in the issue worktree:

```sh
bun --env-file=.env -e 'console.log(["S3_ACCESS_KEY_ID","S3_SECRET_ACCESS_KEY","S3_ENDPOINT","S3_BUCKET"].map(k => k + ": " + (process.env[k] === undefined ? "absent" : "present")).join("\n"))'
```

Latest result:

```text
S3_ACCESS_KEY_ID: present
S3_SECRET_ACCESS_KEY: present
S3_ENDPOINT: present
S3_BUCKET: present
```

The earlier attempt reported all four absent and was marked failed; this resumed check supersedes that blocker. No env-file contents or credential values were opened or printed. Presence does not establish valid credentials, bucket permissions or connectivity: implementation must still pass brief done-criteria 2 and 3 against real R2.

For README setup instructions: the key ID and secret come from Cloudflare dashboard → R2 → Manage API tokens → Object Read & Write credentials scoped to the intended bucket; the endpoint is `https://<account-id>.r2.cloudflarestorage.com` using the R2 overview account ID; the bucket variable is the exact operator-created bucket name. Do not put credential values into issue artifacts, committed examples or command output. No code implementation or R2 verification has occurred in this pass.

## Grounding and read-first paths

1. `/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/open/site-checks/checker-foundation/design.md` — binding architecture and exclusions.
2. `/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/open/site-checks/checker-foundation/brief.md` — required deliverables and negative/real-backend tests.
3. `/home/rudi/.claude/skills/chart-issues/assets/standing-design.md` — real mutations, negative tests and non-browser verification artifacts; this pass additionally obeys the skill's stricter prohibition on opening env files.
4. `issues/config.yaml` — registered lifecycle settings; effective `akrogon config` confirms `grounding: none`, Bun test toolkit, no configured check commands.
5. `learnings/LESSONS.md` — currently just a heading; no historical lesson to apply.
6. `.gitignore` — existing ignores must be preserved.

Grounding gap: no configured grounding index, linked AREA documentation, README or application code exists in the live worktree. The tracked surface is lifecycle configuration, ignores and the empty lessons resource. Do not invent existing app conventions. No peer positions or rebuttals exist or are required for this no-debate leaf.

## Stable decisions and interfaces

**D1 — Scope and runtime.** Bootstrap a root Bun/TypeScript project with strict type checking, Bun runtime types and a committed Bun lockfile. Use Bun's YAML parser and built-in `S3Client`; do not introduce an AWS SDK, Playwright, browser, form, mailbox or WP code. Scripts: `test`, `typecheck`, `store:selftest`. Preserve existing lifecycle configuration. No prerequisite leaf is required; all four R2 configuration names are now present. The inspected runtime is Bun 1.4.2. A GitHub origin is required later for merge, not for this plan's tests.

**D2 — Literal site input, normalized public model.** Export `Site`, `Page`, `SitesConfigError`, synchronous `loadSites(path = "sites.yaml"): Site[]`, and `pageKey(path): string` from `src/sites.ts`. Load UTF-8 synchronously and parse YAML. Return normalized pages as `{ path: string, mask: string[] }`, site masks defaulting to `[]`, and `max_diff_pixel_ratio` defaulting to `0.01`. Preserve site/page input order and separate site/page masks so later consumers combine them intentionally. Require the explicit boolean `form_helper`, a unique lowercase alphanumeric slug with single internal hyphens, an absolute HTTP(S) URL without trailing slash, and a nonempty pages array. Reject unknown keys at root, site and page levels, wrong types, duplicate slugs, empty/whitespace mask entries, scalar masks, non-string mask members and non-finite/out-of-range ratios (allowed range 0–1). Page paths are root-relative paths starting with one `/`, without query, fragment or traversal segments; keep their supplied trailing slash. Report contextual errors with slug and field, using `site[index]` or `<root>` where a slug cannot be known. Wrap read/parse failures in `SitesConfigError` with path/context, without leaking file contents. Empty root `sites` is allowed; individual sites must have pages.

**D3 — Stable page keys and overwrite protection.** `/` maps to `home`; trim boundary slashes and join path segments with `-`, encoding unsafe filename characters deterministically, to preserve `/a/b/` → `a-b`. Keys must be filename-safe and never contain path separators. Reject duplicate page paths and collisions of computed page keys within a site, with site/field context, rather than silently overwriting future baselines. Explicitly test `/` versus `/home/`, and `/a/b/` versus `/a-b/`. This deliberately exposes a limitation of the locked readable key convention; do not replace it with a hash format.

**D4 — On-demand environment validation.** `src/env.ts` exports a typed R2 configuration reader. Validate only variables the invoking command needs; importing site or store helpers must not demand R2 credentials. Report every missing/blank required name together and never echo values. Map the four S3 variables explicitly into Bun `S3Client` options and use R2's `auto` region. Do not read or print env-file contents with agent tools. This planning seat does not open or write `.env` or `.env.*`; the names-only `.env.example` remains a required implementation deliverable, not an artifact to create during synthesis.

**D5 — Storage contract.** Export a lazy `store` facade and a factory for an equivalently configured store scoped to an optional key root. Public methods: `put(key: string, data: Uint8Array | Blob): Promise<void>` (Bun files are Blobs), `get(key: string): Promise<Uint8Array>`, `list(prefix: string): Promise<string[]>`, `presign(key: string, seconds: number): string`, and `pruneReports(keep = 10): Promise<void>`. Presign GET and validate the supported positive expiry range. Add `delete(key): Promise<void>` for owned-object cleanup. Keys are relative to the factory root; default root is empty. List exhausts continuation tokens and returns lexically sorted complete keys relative to that root, not just the first response page. Absent get rejects. Validate keys/root so scoped operations cannot address another namespace. Verify actual installed Bun APIs/types during implementation; do not assume a single-page list or a particular deletion overload.

**D6 — Retention.** Operate only on `reports/<runId>/` under the store root, retaining the newest distinct run prefixes, not the newest individual objects. `runId` uses canonical millisecond UTC ISO timestamps with `:` replaced by `-`, so lexical order is chronological. Ignore noncanonical report directories and objects directly under `reports/`; do not delete baselines or neighboring prefixes. Validate keep as a finite nonnegative integer; zero removes all recognized reports. List all pages before deciding what to prune, and delete all objects belonging to each selected old run. No action when count ≤ keep. Errors fail the command; do not report success after partial deletion. Root scoping allows the identical production algorithm to run under `test/<timestamp>/reports/` without touching real reports.

**D7 — Real verification and cleanup.** `scripts/store-selftest.ts` uses a unique safe timestamp-based `test/` root per invocation, the same storage implementation as production, and real R2 calls. Round-trip binary bytes; list; create a short-lived signed GET URL and fetch it to verify bytes without logging the URL. Exercise both byte and file uploads. Create 12 canonical report prefixes with multiple objects each, prune to 10, and verify exact surviving keys and bytes. Keep unrelated sentinels to detect overbroad deletion. Perform scoped cleanup in `finally`, including local temporary files, and verify the remote test root is empty. Cleanup failures must make the command nonzero and name only the safe root. Write a sanitized summary artifact under ignored `runs/` with counts, test root, cleanup result and pass/fail, never credentials or signed URLs. No R2/auth mocks substitute for these acceptance checks.

**D8 — Operator-owned configuration and docs.** Ship only `sites.example.yaml`; the operator creates the real secret-free `sites.yaml`, which remains committable per the design. Do not invent live sites or perform discovery. Preserve existing ignores and add `runs/`; keep `.env` ignored and the names-only `.env.example` trackable. README documents setup, all scripts, real-bucket test mutations/cleanup, site schema/defaults, errors, key collisions, fixed baseline/report layouts, and manual site-list ownership. It must not imply future baseline/check/approve commands already exist.

## Acceptance criteria (before test implementation)

- **AC1:** `bun test` succeeds without R2 credentials. Valid literal YAML normalizes strings/object pages, preserves order, sets defaults, and retains explicit masks and `form_helper` values.
- **AC2:** Each required negative case (duplicate slug, missing URL, trailing-slash URL, empty pages, unknown key, malformed mask) fails as `SitesConfigError` with site and field. Cover root/page unknown keys, wrong types, ratio bounds, invalid page paths, duplicate paths, key collisions and YAML/read errors as well.
- **AC3:** `bun run typecheck` passes. Public interfaces are usable by downstream leaves without eager credentials or importing scripts. `pageKey` satisfies the two mandated examples and filename-safety tests.
- **AC4:** `bun run store:selftest` succeeds against the real bucket, verifying upload/list/download, fetched signed GET bytes and full cleanup under its unique `test/` root. Missing/blank variables cause a nonzero exit naming variables before any mutation. No output/artifact contains credentials or signed URLs.
- **AC5:** That real-bucket test creates 12 multi-object report runs, prunes to 10, proves exactly the two oldest runs are absent and every retained object is intact, preserves unrelated objects, then cleans up. Also verify zero keep, default keep, no-op retention and invalid keep behavior using the isolated root.
- **AC6:** Exercise real listing past a response-page boundary (use a supported small page size on the same listing implementation, otherwise create enough tiny objects to cross the service boundary) and show retention/cleanup include later-page objects. No mocked server mutations count as evidence.
- **AC7:** Required example/config/docs files exist, local `.env` and `runs/` are ignored, the example contains names with empty values only, and no secret is committed. Sanitized selftest artifact path is recorded in the implementation report.

## Ordered file / criterion checklist

Implementation should proceed in these bounded steps; workers receive the applicable decisions, interfaces and criteria rather than reopening design.

1. [ ] `package.json` — minimal Bun project, `test`, `typecheck`, `store:selftest`; AC1/3/4.
1a. [ ] `bunfig.toml` — exclude `issues/**` from bare Bun test discovery so nested leaf worktrees do not enter the project suite (review A F1); AC1.
2. [ ] `tsconfig.json` — strict no-emit TypeScript including source, scripts and tests; AC3.
3. [ ] `bun.lock` — record installed development dependencies; AC3.
4. [ ] `.gitignore` — preserve existing entries; ignore `.env` and `runs/`, not real `sites.yaml` or the example; AC7.
5. [ ] `.env.example` — required implementation deliverable listing the four S3 variable names with empty values; AC7.
6. [ ] `src/sites.ts` — parser, normalized types, contextual errors and collision-safe validation; D2–D3, AC1–3.
7. [ ] `sites.example.yaml` — demonstrate the literal schema with example-domain data and both page forms; AC1/7.
8. [ ] `tests/sites.test.ts` — valid fixtures and all validation/key negative cases; AC1–3.
9. [ ] `src/env.ts` — lazy typed validation, missing-name-only diagnostics; D4, AC3/4.
10. [ ] `tests/env.test.ts` — deterministic missing/blank/success cases using an explicitly supplied environment map, no credential reads or logging; AC4.
11. [ ] `src/store.ts` — scoped S3 implementation, complete listing and retention; D5–D6, AC3–6.
12. [ ] `tests/store.test.ts` — pure key/run grouping/keep validation edge cases, no fake backend claims; AC3/5.
13. [ ] `scripts/store-selftest.ts` — real storage verification, failure-safe cleanup and sanitized artifact; D7, AC4–7.
14. [ ] `README.md` — affected human documentation: prerequisites, operator setup, schema, interfaces/layout, command and artifact instructions, limitations; D8, AC7.
15. [ ] Agent documentation — none affected: no existing agent index or app agent doc is present, and no new agent documentation framework is needed.
16. [ ] Run all commands below and record results/artifact path without values or signed URLs; AC1–7.

## Concrete verification and remaining limitations

Commands after setup: `bun install`, `bun test`, `bun run typecheck`, `bun run store:selftest`, and `git diff --check`. Exercise the selftest command's missing-variable path in a child with all four named values blank so an existing local env file cannot hide the negative case. Check tracked-file names and ignore behavior without opening any env file; keep secret validation value-free. Include exact exit statuses, remote cleanup status and sanitized `runs/` artifact path in implementation evidence.

Concrete scenario: a site has `/`, `/services/`, and a masked `/contact/`; loading yields ordered normalized pages and stable keys. Twelve timestamped reports, each with image and metadata, exist within one unique test root. Retention leaves only runs 3–12, including both objects and unchanged bytes; baseline/unrecognized-directory sentinels survive until final test-root cleanup.

Open limitations: credential presence is verified, but real-backend behavior and authorization remain unverified until the selftest runs. Mask validation checks representation/nonempty strings, not whether selectors match live DOM; this browser-free leaf cannot establish that. Concurrent report writers/pruners have no transactional retention guarantee; production callers should prune after a completed run. Malformed report IDs are deliberately retained rather than guessed at or destructively deleted. No lesson is added for an implementation incident that has not happened.

## Implementation notes

2026-09-25 — D4/D8 and checklist item 5: the implement-issue skill also prohibits B from opening or writing `.env` or `.env.*` with any tool. An existence-only check confirms `.env.example` is absent. Therefore the required names-only template cannot be produced by this seat, including indirectly through a delegated worker. This is an execution-permission mismatch, not a change to the locked deliverable or AC7. The operator must create `.env.example` in the issue worktree with the four required names and empty values (see `implementation/report.md`). All four real R2 variables still report present. No application code was changed in that attempt; it stopped at this permission blocker.

2026-09-25 resume — D4/D8: `.env.example` is now present as an operator-provided untracked file, and all four R2 variables report present. Preserve the supplied template without opening or editing it; it belongs in the eventual commit. Where template validation needs its variables, use Bun's env-file loader and print only validation results, never contents or values. The live runtime is Bun 1.4.2, no changed-test runner exists, and no lifecycle checks are configured; targeted Bun test paths are the resolved changed-test commands, with B running `bun test`, `bun run typecheck` and `bun run store:selftest` at final verification. Delegate sequential units in the worktree, with all briefs/reports outside it under the authoritative leaf.

2026-09-25 repair round 1 — D1/AC1: review A F1 demonstrates Bun test discovery ignores `.gitignore` and descends into nested leaf worktrees. Add `[test] pathIgnorePatterns = ["issues/**"]` in `bunfig.toml`, retaining both `tests/` and future `test/` discovery; verify with a nested deliberately failing test in an isolated copy. D2/AC2: review B F1 (also A N1) demonstrates that URL normalization turns accepted backslash/control-whitespace page paths into an off-site URL or traversal. Reject backslash and ASCII whitespace/control characters at the shared path boundary, preserving ordinary percent-encoded paths; this enforces, rather than reopens, the root-relative/traversal-free contract. Update README for both refinements and guard its example-copy setup against overwriting an existing site list (A N2).

The same bounded repair initially proposed allowing deletion of external trailing-slash folder markers (A N3). Worker 3 found a concrete SDK mismatch: Bun 1.4.2 strips the trailing slash on write/delete/presign; its dot-segment workaround fails real R2 signature validation. Accepting markers would silently address a different key, so that attempted change was reverted. Evidence and clean probe-root results are in `implementation/worker-3.md`. Retain the original fail-loud validation and document external markers as a nonblocking limitation; do not skip them as successful pruning or introduce a custom SigV4 implementation outside the locked Bun-S3Client design. Add a regression for the retained rejection; brief `implementation/brief-4.md` supersedes only the marker portion of brief 3. This is a resolution of an optional Nit, not relaxation of the blocking findings or D6's fail-on-error contract.

Replace quadratic run-group array copying with append (B N2). Clean up unit-test temporary fixtures (A N4/B N1) and make the missing-config artifact assertion inspect the actual repository runs directory (A N5). These are interface-preserving repairs; no criteria or failing tests are weakened. Worker brief `implementation/brief-3.md` supersedes the affected portions of briefs 1 and 2 for this repair.
