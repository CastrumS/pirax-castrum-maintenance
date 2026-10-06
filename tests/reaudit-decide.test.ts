// Re-audit decisions (plan D6) and run.ts wiring. Every fact here is SYNTHETIC: fixture versions, digests, run IDs
// and command doubles prove the closed state machine and its fail-closed defaults, never GPL Vault, GitHub or a
// native suite. Real acquisition/notice evidence is B's live probes; the main-only workflow run is post-merge.
import { afterAll, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { cp, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { BUMP_FILES, bumpSources, changesDigest, planBump, readBumpSources } from "../scripts/reaudit/bump";
import {
  decideAudit,
  decidePublication,
  parseCandidate,
  parseTestCounts,
  verifyManifests,
  type AuditFacts,
  type Candidate,
} from "../scripts/reaudit/decide";
import { ReauditError, type AuditedVersions } from "../scripts/reaudit/detect";
import type { Acquisition } from "../scripts/reaudit/fetch";
import { chooseNotice, parseFailureSummary, readSummaries } from "../scripts/reaudit/notify";
import { runAudit, type RunDeps } from "../scripts/reaudit/run";
import { readAuditedVersions, readHelperVersion } from "../scripts/plugin-source";

const ROOT = resolve(import.meta.dir, "..");
const OLD: AuditedVersions = { gf: "3.1.2", ff: "6.2.14", ff_pro: "6.2.15", cleantalk: "6.88", fluent_smtp: "2.4.1" };
const NEW: AuditedVersions = { gf: "3.1.3.1", ff: "6.2.15", ff_pro: "6.2.15", cleantalk: "6.89", fluent_smtp: "2.4.1" };
const BASE = "a".repeat(40);
const RUN = "1234567890";
const ATTEMPT = "2";
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const PACKAGES = Object.fromEntries(Object.entries(NEW).map(([k, v]) => [k, { version: v, sha256: sha(`synthetic ${k} ${v}`) }])) as Record<keyof AuditedVersions, { version: string; sha256: string }>;
const DIGEST = sha("synthetic intended change");
const SENTINEL = "SYNTHETIC-SECRET-Qz7xWv";
const scratch = await mkdtemp(join(tmpdir(), "reaudit-decide-"));
afterAll(() => rm(scratch, { recursive: true, force: true }));

const changedFacts = (over: Partial<AuditFacts> = {}): AuditFacts => ({
  runId: RUN,
  runAttempt: ATTEMPT,
  base: BASE,
  helper: "0.3.0",
  oldPins: OLD,
  acquisition: { status: "changed", versions: NEW, packages: PACKAGES },
  cleanup: "confirmed",
  native: "passed",
  manifests: "verified",
  final: "passed",
  privacy: "passed",
  changes: { to: "0.3.1", digest: DIGEST },
  ...over,
});
const unchangedFacts = (over: Partial<AuditFacts> = {}): AuditFacts => ({
  runId: RUN,
  runAttempt: ATTEMPT,
  base: BASE,
  helper: "0.3.0",
  oldPins: OLD,
  acquisition: { status: "unchanged", versions: OLD },
  cleanup: "confirmed",
  currentRelease: "verified",
  privacy: "passed",
  ...over,
});
const failed = (d: ReturnType<typeof decideAudit>) => {
  if (d.outcome !== "failed") throw new Error(`expected failed, got ${d.outcome}`);
  return parseFailureSummary(d.summary);
};

describe("decideAudit", () => {
  test("unchanged: a complete identical matrix with confirmed cleanup, verified current release and clean evidence", () => {
    expect(decideAudit(unchangedFacts())).toEqual({ outcome: "unchanged", versions: OLD });
  });

  test("unchanged never hides an incomplete, missing or unverified current release", () => {
    for (const currentRelease of ["missing", "incomplete", "unknown", undefined] as const) {
      const s = failed(decideAudit(unchangedFacts({ currentRelease })));
      expect(s).toMatchObject({ stage: "publication", publication: "release-incomplete", tag: "v0.3.0", cleanup: "confirmed" });
      expect(s.reason).toBe(`current-release-${currentRelease ?? "unknown"}`);
    }
  });

  test("an 'unchanged' result whose versions differ from the pins is refused", () => {
    expect(failed(decideAudit(unchangedFacts({ acquisition: { status: "unchanged", versions: NEW } }))).stage).toBe("discovery");
  });

  test("detection, GPL Vault, download and cleanup failures map to safe stages and reasons", () => {
    const cases: [ReauditError | Error, string, string][] = [
      [new ReauditError("discovery", "gf", "downgrade"), "discovery", "discovery-gf-downgrade"],
      [new ReauditError("catalog", "ff_pro", "missing"), "discovery", "catalog-ff-pro-missing"],
      [new ReauditError("activation", "activate", "refused"), "download", "activation-activate-refused"],
      [new ReauditError("download", "gf", "version mismatch"), "download", "download-gf-version-mismatch"],
      [new ReauditError("cleanup", "deactivate", "unconfirmed (after download: gf failed)"), "cleanup", "cleanup-deactivate-unconfirmed-after-download-gf-failed"],
      [new ReauditError("environment", "GPLVAULT_LICENSE_KEY", "missing"), "setup", "environment-gplvault-license-key-missing"],
      [new ReauditError("playground", SENTINEL, "failed"), "setup", "playground-failed"],
      [Object.assign(new Error(SENTINEL), { code: SENTINEL }), "unknown", "unexpected-error"],
    ];
    for (const [error, stage, reason] of cases) {
      const cleanup = error instanceof ReauditError && error.stage === "cleanup" ? "failed" : "unknown";
      const s = failed(decideAudit(changedFacts({ acquisition: { status: "failed", error }, cleanup })));
      expect(s).toMatchObject({ stage, reason, publication: "not-attempted", oldVersions: OLD });
      expect(JSON.stringify(s)).not.toContain(SENTINEL);
      expect(JSON.stringify(s)).not.toContain(SENTINEL.toLowerCase());
    }
  });

  test("no gate may be missing or failed for a candidate, and never through a default", () => {
    const gates: [Partial<AuditFacts>, string, string][] = [
      [{ cleanup: "failed" }, "cleanup", "cleanup-failed"],
      [{ cleanup: "unknown" }, "cleanup", "cleanup-unknown"],
      [{ cleanup: undefined }, "cleanup", "cleanup-unknown"],
      [{ native: "failed" }, "audit", "native-suite-failed"],
      [{ native: undefined }, "audit", "native-suite-missing"],
      [{ manifests: "failed" }, "audit", "native-manifest-mismatch"],
      [{ manifests: undefined }, "audit", "native-manifest-missing"],
      [{ final: "failed" }, "bump", "final-checks-failed"],
      [{ final: undefined }, "bump", "final-checks-missing"],
      [{ privacy: "failed" }, "privacy", "evidence-privacy-failed"],
      [{ privacy: undefined }, "privacy", "evidence-privacy-missing"],
      [{ changes: undefined }, "bump", "intended-change-missing"],
      [{ acquisition: undefined }, "discovery", "acquisition-missing"],
    ];
    for (const [over, stage, reason] of gates) {
      const s = failed(decideAudit(changedFacts(over)));
      expect(s, reason).toMatchObject({ stage, reason, publication: "not-attempted" });
    }
    // Gate values are literals, not truthiness.
    expect(failed(decideAudit(changedFacts({ native: "yes" as never }))).reason).toBe("native-suite-missing");
    expect(failed(decideAudit(changedFacts({ privacy: true as never }))).reason).toBe("evidence-privacy-missing");
  });

  test("a suite failure reports the candidate versions it audited", () => {
    expect(failed(decideAudit(changedFacts({ native: "failed" })))).toMatchObject({ oldVersions: OLD, candidateVersions: NEW });
  });

  test("incomplete package facts or a helper target other than the next patch are refused", () => {
    const { gf: _gf, ...partial } = PACKAGES;
    expect(failed(decideAudit(changedFacts({ acquisition: { status: "changed", versions: NEW, packages: partial as never } }))).reason).toBe("candidate-invalid");
    expect(failed(decideAudit(changedFacts({ changes: { to: "0.3.2", digest: DIGEST } }))).reason).toBe("candidate-invalid");
    expect(failed(decideAudit(changedFacts({ acquisition: { status: "changed", versions: OLD, packages: PACKAGES } }))).reason).toBe("candidate-invalid");
  });

  test("all gates passed: a strict candidate with digests but no paths or URLs", () => {
    const d = decideAudit(changedFacts());
    if (d.outcome !== "audited-candidate") throw new Error(d.outcome);
    expect(d.candidate).toEqual({
      schema: 1,
      repository: "CastrumS/pirax-castrum-maintenance",
      runId: RUN,
      runAttempt: ATTEMPT,
      base: BASE,
      oldPins: OLD,
      newPins: NEW,
      packages: PACKAGES,
      helper: { from: "0.3.0", to: "0.3.1" },
      changes: { digest: DIGEST },
      gates: { cleanup: "confirmed", native: "passed", manifests: "verified", final: "passed", privacy: "passed" },
    });
    expect(JSON.stringify(d.candidate)).not.toMatch(/https?:|\/tmp|path|url/i);
    expect(parseCandidate(JSON.parse(JSON.stringify(d.candidate)), { runId: RUN, runAttempt: ATTEMPT })).toEqual(d.candidate);
  });
});

describe("parseCandidate", () => {
  const good = (): Candidate => {
    const d = decideAudit(changedFacts());
    if (d.outcome !== "audited-candidate") throw new Error(d.outcome);
    return JSON.parse(JSON.stringify(d.candidate));
  };
  const corrupt: [string, (c: any) => unknown, string][] = [
    ["null", () => null, "candidate: not an object"],
    ["array", () => [], "candidate: not an object"],
    ["string", () => "{}", "candidate: not an object"],
    ["schema", (c) => ({ ...c, schema: 2 }), "candidate: schema"],
    ["repository", (c) => ({ ...c, repository: "someone/fork" }), "candidate: repository"],
    ["extra key", (c) => ({ ...c, [SENTINEL]: SENTINEL }), "candidate: unknown keys"],
    ["nested extra key", (c) => ({ ...c, packages: { ...c.packages, gf: { ...c.packages.gf, path: `/tmp/${SENTINEL}` } } }), "candidate: packages"],
    ["url", (c) => ({ ...c, changes: { ...c.changes, url: `https://vault.invalid/?sig=${SENTINEL}` } }), "candidate: changes"],
    ["other run", (c) => ({ ...c, runId: "999" }), "candidate: runId"],
    ["earlier attempt of this run", (c) => ({ ...c, runAttempt: "1" }), "candidate: runAttempt"],
    ["missing attempt", ({ runAttempt: _, ...c }) => c, "candidate: runAttempt"],
    ["attempt with leading zero", (c) => ({ ...c, runAttempt: "02" }), "candidate: runAttempt"],
    ["numeric attempt", (c) => ({ ...c, runAttempt: 2 }), "candidate: runAttempt"],
    ["short base", (c) => ({ ...c, base: "abc123" }), "candidate: base"],
    ["uppercase base", (c) => ({ ...c, base: "A".repeat(40) }), "candidate: base"],
    ["base with newline", (c) => ({ ...c, base: `${BASE}\n` }), "candidate: base"],
    ["missing new pin", (c) => ({ ...c, newPins: { ...c.newPins, gf: undefined } }), "candidate: newPins"],
    ["prerelease pin", (c) => ({ ...c, newPins: { ...c.newPins, gf: "3.2.0-beta" } }), "candidate: newPins"],
    ["unchanged pins", (c) => ({ ...c, newPins: c.oldPins, packages: Object.fromEntries(Object.entries(c.packages).map(([k, p]: any) => [k, { ...p, version: c.oldPins[k] }])) }), "candidate: newPins"],
    ["downgrade", (c) => ({ ...c, oldPins: c.newPins, newPins: c.oldPins }), "candidate: newPins"],
    ["package version", (c) => ({ ...c, packages: { ...c.packages, ff: { ...c.packages.ff, version: "6.2.16" } } }), "candidate: packages"],
    ["package digest", (c) => ({ ...c, packages: { ...c.packages, ff: { ...c.packages.ff, sha256: "XYZ" } } }), "candidate: packages"],
    ["missing package", (c) => ({ ...c, packages: { ...c.packages, cleantalk: undefined } }), "candidate: packages"],
    ["helper skip", (c) => ({ ...c, helper: { from: "0.3.0", to: "0.4.0" } }), "candidate: helper"],
    ["digest", (c) => ({ ...c, changes: { digest: "not-a-digest" } }), "candidate: changes"],
    ["failed gate", (c) => ({ ...c, gates: { ...c.gates, native: "failed" } }), "candidate: gates"],
    ["truthy gate", (c) => ({ ...c, gates: { ...c.gates, privacy: true } }), "candidate: gates"],
    ["missing gate", (c) => ({ ...c, gates: { ...c.gates, final: undefined } }), "candidate: gates"],
  ];
  test("two attempts of one run: each attempt's candidate is accepted only by that attempt", () => {
    const first = decideAudit(changedFacts({ runAttempt: "1" }));
    if (first.outcome !== "audited-candidate") throw new Error(first.outcome);
    const value = JSON.parse(JSON.stringify(first.candidate));
    expect(parseCandidate(value, { runId: RUN, runAttempt: "1" }).runAttempt).toBe("1");
    expect(() => parseCandidate(value, { runId: RUN, runAttempt: "2" })).toThrow("candidate: runAttempt");
  });
  test.each(corrupt)("refuses %s with a fixed field message", (_label, edit, message) => {
    let error: Error | undefined;
    try {
      parseCandidate(edit(good()), { runId: RUN, runAttempt: ATTEMPT });
    } catch (e) {
      error = e as Error;
    }
    expect(error?.message).toBe(message);
    expect(error?.message).not.toContain(SENTINEL);
  });
});

describe("decidePublication", () => {
  const candidate = (() => {
    const d = decideAudit(changedFacts());
    if (d.outcome !== "audited-candidate") throw new Error(d.outcome);
    return d.candidate;
  })();
  const facts = { candidate, head: BASE, sourcePins: OLD, sourceHelper: "0.3.0", digest: DIGEST, remoteMain: BASE, tag: "absent" as const };
  test("proceeds only when every guard holds", () => {
    expect(decidePublication(facts)).toEqual({ proceed: true });
  });
  test.each([
    ["main advanced since the audit", { remoteMain: "b".repeat(40) }, "main-advanced"],
    ["remote main unreadable", { remoteMain: "" }, "main-unreadable"],
    ["target tag or release exists", { tag: "present" }, "tag-exists"],
    ["tag lookup unanswered", { tag: "unknown" }, "tag-lookup-failed"],
    ["checkout is not the audited base", { head: "c".repeat(40) }, "checkout-not-audited-base"],
    ["source pins drifted", { sourcePins: NEW }, "source-drift"],
    ["helper version drifted", { sourceHelper: "0.3.1" }, "source-drift"],
    ["reconstruction differs", { digest: sha("other") }, "reconstruction-mismatch"],
  ] as const)("%s publishes nothing", (_label, over, reason) => {
    expect(decidePublication({ ...facts, ...over } as never)).toEqual({ proceed: false, reason });
  });
});

describe("native evidence", () => {
  const manifest = (stack: "default" | "full", over: Record<string, unknown> = {}) => ({
    suite: "x",
    versions: { gf: NEW.gf, ff: NEW.ff, wp: "7.1.2", php: "8.3", ...(stack === "full" && { ffPro: NEW.ff_pro, cleantalk: NEW.cleantalk, fluentSmtp: NEW.fluent_smtp }) },
    zips: {
      gravityforms: PACKAGES.gf.sha256,
      fluentform: PACKAGES.ff.sha256,
      ...(stack === "full" && { fluentformpro: PACKAGES.ff_pro.sha256, cleantalk: PACKAGES.cleantalk.sha256, fluentSmtp: PACKAGES.fluent_smtp.sha256 }),
    },
    ...over,
  });
  test("every native manifest used the selected versions and digests, with at least one full stack", () => {
    expect(verifyManifests([manifest("default"), manifest("full")], PACKAGES)).toBe("verified");
    expect(verifyManifests([manifest("default")], PACKAGES)).toBe("failed");
    expect(verifyManifests([], PACKAGES)).toBe("failed");
    expect(verifyManifests([manifest("full"), manifest("default", { versions: { gf: OLD.gf, ff: NEW.ff } })], PACKAGES)).toBe("failed");
    const stale = manifest("full");
    stale.zips.fluentSmtp = sha("old cached zip");
    expect(verifyManifests([stale], PACKAGES)).toBe("failed");
    expect(verifyManifests([manifest("full"), null], PACKAGES)).toBe("failed");
  });
  test("test counts: no failure, skip or todo is acceptable", () => {
    expect(parseTestCounts("x\n 297 pass\n 0 fail\n 4535 expect() calls\nRan 297 tests across 29 files. [3237.22s]\n")).toEqual({ pass: 297, fail: 0, skip: 0, todo: 0, ran: 297 });
    expect(parseTestCounts(" 290 pass\n 7 skip\n 0 fail\nRan 297 tests across 29 files.\n")).toMatchObject({ skip: 7 });
    expect(parseTestCounts("no summary")).toBeNull();
  });
});

describe("chooseNotice", () => {
  const url = "https://github.com/CastrumS/pirax-castrum-maintenance/actions/runs/1234567890";
  const needs = (audit: string, publish: string, heartbeat: string) => ({ audit: { result: audit }, publish: { result: publish }, heartbeat: { result: heartbeat } });
  test("one notice: the failed job's own valid summary, publication first", () => {
    const pub = { stage: "publication", reason: "release-create-failed", publication: "main-pushed", commit: BASE, tag: "v0.3.1" } as const;
    expect(chooseNotice(needs("success", "failure", "failure"), { publish: pub, audit: undefined }, url)).toEqual({ ...pub, runUrl: url });
  });
  test("missing or invalid summaries fall back to fixed safe text per failed job", () => {
    expect(chooseNotice(needs("failure", "skipped", "success"), {}, url)).toEqual({ stage: "setup", reason: "audit-job-failure", cleanup: "unknown", publication: "not-attempted", runUrl: url });
    expect(chooseNotice(needs("cancelled", "skipped", "success"), { audit: { stage: "audit", [SENTINEL]: 1 } }, url)).toEqual({ stage: "setup", reason: "audit-job-cancelled", cleanup: "unknown", publication: "not-attempted", runUrl: url });
    expect(chooseNotice(needs("success", "failure", "success"), {}, url)).toEqual({ stage: "publication", reason: "publish-job-failure", cleanup: "not-applicable", publication: "unknown", runUrl: url });
    expect(chooseNotice(needs("success", "skipped", "failure"), {}, undefined)).toEqual({ stage: "heartbeat", reason: "heartbeat-job-failure", cleanup: "not-applicable", publication: "unknown" });
    expect(chooseNotice({} as never, {}, url)).toEqual({ stage: "unknown", reason: "no-failed-job-identified", cleanup: "unknown", publication: "unknown", runUrl: url });
  });
  test("a rerun reads only its own attempt: attempt 1's confirmed-cleanup summary never describes attempt 2's missing one", async () => {
    // Synthetic downloaded-artifact layout: <dir>/reaudit-summary-<attempt>-<job>/summary.json.
    const dir = join(scratch, "two-attempts");
    await mkdir(join(dir, "reaudit-summary-1-audit"), { recursive: true });
    const old = { stage: "audit", reason: "native-suite-failed", cleanup: "confirmed", publication: "not-attempted" } as const;
    await writeFile(join(dir, "reaudit-summary-1-audit/summary.json"), JSON.stringify(old));
    const failed = needs("failure", "skipped", "success");
    const attempt2 = `${url}/attempts/2`;
    expect(chooseNotice(failed, readSummaries(dir, "2"), attempt2)).toEqual({ stage: "setup", reason: "audit-job-failure", cleanup: "unknown", publication: "not-attempted", runUrl: attempt2 });
    expect(chooseNotice(failed, readSummaries(dir, "1"), url)).toEqual({ ...old, runUrl: url });
    // An unvalidated attempt (absent, "01", a path) reads nothing, never a guessed or earlier attempt.
    for (const attempt of [undefined, "", "01", "0", "1/../1", "*"]) expect(readSummaries(dir, attempt)).toEqual({});
  });
});

// run.ts wiring with injected acquisition/command doubles in a disposable git checkout of the helper source.
describe("runAudit wiring (synthetic doubles)", () => {
  const ENV = {
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    GPLVAULT_LICENSE_KEY: `${SENTINEL}-license`,
    GPLVAULT_PRODUCT_ID: `${SENTINEL}-product`,
    GPLVAULT_UPDATER_PASSPHRASE: `${SENTINEL}-passphrase`,
    GH_TOKEN: `${SENTINEL}-gh`,
    IMAP_PASSWORD: `${SENTINEL}-imap`,
    PIRAX_HELPER_SIGNING_KEY: `${SENTINEL}-seed`,
    FORM_TEST_TOKEN: `${SENTINEL}-operator-token`,
  };
  let n = 0;
  async function fixture() {
    const root = join(scratch, `run-${++n}`);
    for (const file of BUMP_FILES) {
      await mkdir(dirname(join(root, file)), { recursive: true });
      await cp(join(ROOT, file), join(root, file));
    }
    const git = (...args: string[]) => Bun.spawnSync(["git", "-c", "user.name=t", "-c", "user.email=t@t.invalid", "-c", "commit.gpgsign=false", ...args], { cwd: root });
    git("init", "-q");
    git("add", "-A");
    git("commit", "-q", "-m", "fixture");
    return { root, base: git("rev-parse", "HEAD").stdout.toString().trim(), out: join(root, "out") };
  }
  const pins = readAuditedVersions();
  const helper = readHelperVersion();
  const next = { ...pins, ff: pins.ff.replace(/\d+$/, (x) => String(Number(x) + 1)) };

  function doubles(opts: { acquire?: "changed" | "unchanged" | "fail"; nativeCode?: number; leak?: boolean; release?: "verified" | "missing" } = {}) {
    const calls: { cmd: string[]; env: Record<string, string> }[] = [];
    const seen: { directory?: string; env?: Record<string, string | undefined> } = {};
    const lifecycle = { activationAttempted: true, activationConfirmed: true, deactivationAttempted: true, deactivationConfirmed: true, remainingBefore: 139, remainingAfter: 139, updater: { before: "5.3.9", after: "5.3.9" }, site: null };
    const deps: RunDeps = {
      acquire: async ({ directory, env }) => {
        seen.directory = directory;
        seen.env = env;
        await mkdir(directory, { recursive: true });
        if (opts.acquire === "fail") throw Object.assign(new ReauditError("download", "gf", "failed"), { lifecycle });
        if (opts.acquire === "unchanged") return { status: "unchanged", versions: pins, packages: null, lifecycle } satisfies Acquisition;
        const packages = {} as Record<keyof AuditedVersions, { version: string; sha256: string; path: string }>;
        for (const [key, version] of Object.entries(next)) {
          const path = join(directory, `${key}.${version}.zip`);
          await writeFile(path, `synthetic ${key}`);
          packages[key as keyof AuditedVersions] = { version, sha256: sha(`synthetic ${key}`), path };
        }
        return { status: "changed", versions: next, changed: ["ff"], packages, lifecycle } satisfies Acquisition;
      },
      exec: async (cmd, { cwd, env }) => {
        calls.push({ cmd, env });
        if (cmd.includes("test/plugin")) {
          const dir = join(cwd, "artifacts/plugin", `stack-${calls.length}`);
          await mkdir(dir, { recursive: true });
          const zips = { gravityforms: sha("synthetic gf"), fluentform: sha("synthetic ff"), fluentformpro: sha("synthetic ff_pro"), cleantalk: sha("synthetic cleantalk"), fluentSmtp: sha("synthetic fluent_smtp") };
          const versions = { gf: next.gf, ff: next.ff, wp: "7.1.2", php: "8.3", ffPro: next.ff_pro, cleantalk: next.cleantalk, fluentSmtp: next.fluent_smtp };
          await writeFile(join(dir, "manifest.json"), JSON.stringify({ suite: "stack", versions, zips, note: opts.leak ? ENV.GPLVAULT_LICENSE_KEY : "" }));
          return { code: opts.nativeCode ?? 0, output: " 3 pass\n 0 fail\nRan 3 tests across 1 file.\n" };
        }
        return { code: 0, output: " 2 pass\n 0 fail\nRan 2 tests across 1 file.\n" };
      },
      currentRelease: async () => opts.release ?? "verified",
    };
    return { deps, calls, seen };
  }

  test("changed and every gate passed: candidate written, scratch removed, children get scoped random inputs", async () => {
    const { root, base, out } = await fixture();
    const { deps, calls, seen } = doubles();
    const decision = await runAudit({ root, out, runId: RUN, runAttempt: ATTEMPT, env: ENV, deps });
    expect(decision.outcome).toBe("audited-candidate");
    const candidate = parseCandidate(JSON.parse(await readFile(join(out, "candidate.json"), "utf8")), { runId: RUN, runAttempt: ATTEMPT });
    expect(candidate.base).toBe(base);
    expect(candidate.helper.to).toBe(planBump(pins, next, helper).to);
    // The publisher's independent reconstruction from the same base must give the recorded digest.
    expect(candidate.changes.digest).toBe(changesDigest(bumpSources(readBumpSources(ROOT), planBump(pins, next, helper))));
    expect(existsSync(seen.directory!)).toBe(false);
    expect(Object.keys(seen.env!).sort()).toEqual(["GPLVAULT_LICENSE_KEY", "GPLVAULT_PRODUCT_ID", "GPLVAULT_UPDATER_PASSPHRASE", "HOME", "PATH"]);

    expect(calls.map((c) => c.cmd.slice(1))).toEqual([
      ["--no-env-file", "test", "test/plugin"],
      ["--no-env-file", "run", "typecheck"],
      ["--no-env-file", "test", "test/plugin/core.test.ts", "test/plugin/release.test.ts", "tests/plugin-source.test.ts", "tests/reaudit-bump.test.ts"],
    ]);
    const native = calls[0]!.env;
    expect(native.FORM_TEST_TOKEN).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(native.FORM_TEST_TOKEN).not.toBe(ENV.FORM_TEST_TOKEN);
    expect(native.GRAVITY_FORMS_ZIP!.startsWith(seen.directory!)).toBe(true);
    expect(native.FLUENT_FORMS_PRO_ZIP!.startsWith(seen.directory!)).toBe(true);
    for (const name of ["GPLVAULT_LICENSE_KEY", "GPLVAULT_PRODUCT_ID", "GPLVAULT_UPDATER_PASSPHRASE", "IMAP_PASSWORD", "PIRAX_HELPER_SIGNING_KEY"]) expect(Object.keys(native)).not.toContain(name);
    expect(native.GH_TOKEN).toBe(ENV.GH_TOKEN); // read-only lookups in release.test.ts; the audit job's token has contents: read only
    const evidence = await readdir(out, { recursive: true });
    expect(evidence).toContain("decision.json");
    expect(evidence.some((f) => f.endsWith("manifest.json"))).toBe(true);
    expect(JSON.stringify(await Promise.all(evidence.filter((f) => f.endsWith(".json")).map((f) => readFile(join(out, f), "utf8"))))).not.toContain(SENTINEL);
  });

  test("a native suite failure writes a safe summary, no candidate, and never runs the helper bump checks", async () => {
    const { root, out } = await fixture();
    const { deps, calls, seen } = doubles({ nativeCode: 1 });
    const decision = await runAudit({ root, out, runId: RUN, runAttempt: ATTEMPT, env: ENV, deps });
    expect(decision.outcome).toBe("failed");
    expect(existsSync(join(out, "candidate.json"))).toBe(false);
    expect(parseFailureSummary(JSON.parse(await readFile(join(out, "summary.json"), "utf8")))).toMatchObject({ stage: "audit", reason: "native-suite-failed", cleanup: "confirmed", publication: "not-attempted" });
    expect(calls).toHaveLength(1);
    expect(readHelperVersion(join(root, "plugin/pirax-form-test"))).toBe(helper);
    expect(existsSync(seen.directory!)).toBe(false);
  });

  test("acquisition failure: summary carries the stage and cleanup state; scratch removed; no suite runs", async () => {
    const { root, out } = await fixture();
    const { deps, calls, seen } = doubles({ acquire: "fail" });
    expect((await runAudit({ root, out, runId: RUN, runAttempt: ATTEMPT, env: ENV, deps })).outcome).toBe("failed");
    expect(JSON.parse(await readFile(join(out, "summary.json"), "utf8"))).toMatchObject({ stage: "download", reason: "download-gf-failed", cleanup: "confirmed" });
    expect(calls).toEqual([]);
    expect(existsSync(seen.directory!)).toBe(false);
  });

  test("unchanged: no suite, no candidate; a missing current release fails instead of passing silently", async () => {
    const ok = await fixture();
    const healthy = doubles({ acquire: "unchanged" });
    expect(await runAudit({ root: ok.root, out: ok.out, runId: RUN, runAttempt: ATTEMPT, env: ENV, deps: healthy.deps })).toEqual({ outcome: "unchanged", versions: pins });
    expect(healthy.calls).toEqual([]);
    expect(existsSync(join(ok.out, "candidate.json"))).toBe(false);
    const bad = await fixture();
    const missing = doubles({ acquire: "unchanged", release: "missing" });
    expect((await runAudit({ root: bad.root, out: bad.out, runId: RUN, runAttempt: ATTEMPT, env: ENV, deps: missing.deps })).outcome).toBe("failed");
    expect(JSON.parse(await readFile(join(bad.out, "summary.json"), "utf8"))).toMatchObject({ reason: "current-release-missing", publication: "release-incomplete" });
  });

  test("lifecycle evidence survives a failure: strict flags, unknown counts stay null, only a loopback site is kept and reaches the cleanup notice", async () => {
    const lifecycle = { activationAttempted: true, activationConfirmed: true, deactivationAttempted: true, deactivationConfirmed: false, remainingBefore: 139, remainingAfter: null, updater: { before: "5.3.9", after: "5.4.0" }, site: "http://127.0.0.1:41234" };
    const cases = [
      [lifecycle, lifecycle],
      [{ ...lifecycle, site: `https://vault.invalid/x?key=${SENTINEL}` }, { ...lifecycle, site: null }],
      [{ ...lifecycle, activationConfirmed: "yes", remainingBefore: "139", updater: { before: `5.3.9 ${SENTINEL}`, after: "5.4.0" } }, { ...lifecycle, activationConfirmed: null, remainingBefore: null, updater: null }],
    ] as const;
    for (const [given, kept] of cases) {
      const { root, out } = await fixture();
      const deps: RunDeps = { ...doubles().deps, acquire: async () => { throw Object.assign(new ReauditError("cleanup", "deactivate", "unconfirmed"), { lifecycle: given }); } };
      expect((await runAudit({ root, out, runId: RUN, runAttempt: ATTEMPT, env: ENV, deps })).outcome).toBe("failed");
      expect(JSON.parse(await readFile(join(out, "evidence/lifecycle.json"), "utf8"))).toEqual(kept);
      const summary = parseFailureSummary(JSON.parse(await readFile(join(out, "summary.json"), "utf8")));
      expect(summary).toMatchObject({ stage: "cleanup", cleanup: "failed" });
      expect(summary.site).toBe(kept.site ?? undefined);
    }
  });

  test("confirmed cleanup keeps lifecycle evidence but no throwaway-site guidance; a missing site is null, never invented", async () => {
    const { root, out } = await fixture();
    const { deps } = doubles({ nativeCode: 1 });
    await runAudit({ root, out, runId: RUN, runAttempt: ATTEMPT, env: ENV, deps });
    expect(JSON.parse(await readFile(join(out, "evidence/lifecycle.json"), "utf8"))).toMatchObject({ deactivationConfirmed: true, remainingBefore: 139, remainingAfter: 139, site: null });
    expect(JSON.parse(await readFile(join(out, "summary.json"), "utf8")).site).toBeUndefined();
  });

  test("retained native evidence containing a known secret is withheld and fails the privacy gate", async () => {
    const { root, out } = await fixture();
    const { deps } = doubles({ leak: true });
    expect((await runAudit({ root, out, runId: RUN, runAttempt: ATTEMPT, env: ENV, deps })).outcome).toBe("failed");
    expect(JSON.parse(await readFile(join(out, "summary.json"), "utf8"))).toMatchObject({ stage: "privacy", reason: "evidence-privacy-failed" });
    expect(existsSync(join(out, "candidate.json"))).toBe(false);
    const all = await readdir(out, { recursive: true });
    for (const f of all) if (f.endsWith(".json")) expect(await readFile(join(out, f), "utf8")).not.toContain(SENTINEL);
  });
});
