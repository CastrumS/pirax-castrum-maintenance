# Review B: checker-foundation

## Verdict: fix

- Base: `93cf3b7f6b99f3a34be7f69c004345c439fa6a76`
- Reviewed head: `fb5e37975905d708e58ee2b5a2d86ee4965979e3`
- Worktree clean; no code edited during review.
- Initial blind review: no peer review read or contacted. Debate is off, so missing position/rebuttal files are expected.
- Read the locked design, plan including implementation notes, implementation report, review ponytail guidance, changed implementation/tests/config and README. Effective config has no additional blocking/advisory commands and no grounding index. No AREA files or existing app-agent docs are affected.

## Fix F1 — Reject page paths whose URL normalization defeats root/traversal validation

**Location:** `src/sites.ts:112–114`; regression cases belong in `tests/sites.test.ts`; document the accepted characters in `README.md:81`.

**Contract:** plan D2 requires root-relative page paths without traversal segments; AC2 explicitly requires invalid-page-path rejection with site/field context. The README likewise promises no `.`/`..` segments. This is an input-validator contract defect, not a request to add browser code.

The loader checks only forward-slash-separated literal segments. WHATWG HTTP(S) URLs interpret backslashes as path separators and strip tabs/newlines. Consequently, malformed paths accepted as valid configuration can resolve outside the declared site or perform traversal:

```text
{"path":"/\\elsewhere.example/","accepted":true,"resolved":"https://elsewhere.example/","sameOrigin":false}
{"path":"/a/..\\outside/","accepted":true,"resolved":"https://acme.example/outside/","sameOrigin":true}
{"path":"/a/\t../outside/","accepted":true,"resolved":"https://acme.example/outside/","sameOrigin":true}
```

**Reproduction actually run** (exit 0; real loader, temporary YAML, standard URL resolver; no browser/network/env needed):

```sh
bun --no-env-file -e '
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadSites } from "./src/sites.ts";
const dir = mkdtempSync(join(tmpdir(), "checker-review-paths-"));
try {
  for (const path of [String.raw`/\elsewhere.example/`, String.raw`/a/..\outside/`, "/a/\t../outside/"]) {
    const file = join(dir, "sites.yaml");
    writeFileSync(file, JSON.stringify({ sites: [{ slug: "acme", url: "https://acme.example", form_helper: false, pages: [path] }] }));
    try {
      const site = loadSites(file)[0]!;
      const resolved = new URL(site.pages[0]!.path, site.url);
      console.log(JSON.stringify({ path, accepted: true, resolved: resolved.href, sameOrigin: resolved.origin === new URL(site.url).origin }));
    } catch (e) {
      console.log(JSON.stringify({ path, accepted: false, error: (e as Error).message }));
    }
  }
} finally { rmSync(dir, { recursive: true, force: true }); }
'
```

**Required repair/evidence:** reject these inputs in the shared page validator as `SitesConfigError` naming `acme` and `pages[0].path`, with fail-first tests covering both string and object page forms. Reject backslashes and URL-normalized control/whitespace bypasses (including CR/LF/TAB and trailing whitespace that can conceal `..`) rather than deferring this contract to downstream navigation. Keep valid root-relative examples and percent-encoded ordinary path characters working. Update README to match the implemented validation. No browser install or network test is needed.

The implementation report acknowledges backslashes/whitespace as a limitation, but acknowledging it does not waive D2/AC2: the native resolver already supplies a concrete counterexample to the promised path model.

## Nonblocking Nits

### N1 — Remove test-owned temporary directories

`tests/sites.test.ts:7,194`, `tests/env.test.ts:8` and `tests/store.test.ts:8` create directories without teardown. Repeated `bun test` runs leave fixtures in the OS temp directory. An `afterAll`/`finally` cleanup would make these tests self-contained. Nonblocking: tests remain isolated and correct, and the required real selftest does clean its upload temp directory.

### N2 — Avoid repeated copying while grouping report keys

`src/store.ts:56` rebuilds the whole run's array for every object (`[...(previous ?? []), key]`), giving quadratic copying per report. Append into the existing array instead. Nonblocking at the currently demonstrated report sizes; no performance threshold failure is claimed. The sequential-delete ceiling is already honestly commented/documented and is not itself a finding.

## Verification and acceptance review

- The reviewed head is exactly the tested implementation head, with no intervening changes. Reused the existing full-suite evidence rather than rerunning unchanged checks: **44 pass, 0 fail, 426 assertions**, `bun run typecheck` exit 0, frozen dependency installation exit 0.
- Read `runs/store-selftest-2026-09-25T13-56-04.489Z.json`: `result: pass`, all 11 checks true, real listing across at least 10 pages, exact 12-to-10 retention, default/zero/no-op/invalid keep cases, fetched signed GET, and `cleanup: { ok: true, deleted: 10, remaining: 0 }`. No real bucket rerun was necessary for this unchanged code.
- Existing test/report evidence covers the required negative site cases, contextual error fields, lazy env import, explicit null ratio rejection, missing-variable exit 2, real byte/file roundtrip and report survival/cleanup. Tests exercise the real loader/pure retention functions and real R2 selftest, not mocks of those units. The missing page-normalization cases are F1.
- Specific additional scope concern tested with synthetic S3 credentials and no network: presigning `%2e%2e/outside`, nested encoded traversal, `a%2Fb`, `a?query`, `a#fragment` and a percent-encoded page key leaves all names within the scoped URL path. Bun double-encodes `%` and encodes `?`/`#`; no namespace escape was observed. Only pathname results were printed, never signed URLs.
- `git diff --check <base>..HEAD -- . ':(exclude).env.example'`: exit 0, no output. All 14 changed paths reviewed by content or permitted template evidence. No env file was opened/printed/edited; operator-provided template validation and secret-scan evidence were retained from implementation.
- Documentation was reviewed against changed behavior: README covers setup, current scripts, site schema, layout, storage APIs and limitations. Its path-validation claim needs the F1 repair. There are no changed AREA files requiring path enumeration and no removed index pointers.
- Cleanup failure on a real outage remains unexercised, as transparently reported; successful cleanup and nonzero-error control flow have evidence and no concrete defect was found there. No operator action blocks this review.

## Requested transition

Request `check.fix` with verdict `fix`. Aggregate phase/result belongs to akrogon; this review does not assume the other seat's verdict.
