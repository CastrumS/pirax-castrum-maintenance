// Re-audit run (plan D3–D6/D10), the read-only audit job's only step with vendor credentials. In this disposable
// checkout of the audited main commit it:
//   1. acquires the five selected packages (fetch.ts; GPL Vault inputs only in that call, private scratch outside
//      the evidence directory, deactivation confirmed before it returns)
//   2. unchanged: independently verifies the current helper release (read-only); missing/incomplete fails
//   3. changed: writes the candidate pins only, runs ALL `bun test test/plugin` with a random per-run
//      FORM_TEST_TOKEN and the selected paid ZIPs, and checks every new native manifest used exactly the selected
//      versions and digests; only then the helper patch/doc bump (bump.ts) and typecheck + core/release/pin tests
//   4. scans retained native evidence (trace ZIP entries included) and its own output for known secrets
//   5. always removes private scratch, then writes decision.json, plus candidate.json or summary.json
// Children get scoped environments and `bun --no-env-file`; their output is sanitized and rescanned line by line.
// No retries, skips or callback-inventory changes: any failed or missing gate is a failed decision.
//
// Usage: bun --no-env-file scripts/reaudit/run.ts --out <dir>
//   needs GITHUB_RUN_ID and GITHUB_RUN_ATTEMPT (digits; Actions sets both), GPLVAULT_LICENSE_KEY, GPLVAULT_PRODUCT_ID,
//   GPLVAULT_UPDATER_PASSPHRASE and a read-only gh token (GH_TOKEN) for the release lookups. It edits this checkout: run it only in a disposable one.
//   Writes `outcome=<failed|unchanged|audited-candidate>` to GITHUB_OUTPUT when set. Exit 0 unchanged or candidate,
//   1 failed, 2 usage.
// Import-safe: runAudit() is exported with injectable acquisition/command/release doubles for tests.
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { appendFile, cp, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { readAuditedVersions, readHelperVersion, type AuditedVersions } from "../plugin-source.ts";
import { applyBump, BUMP_FILES, planBump, readBumpSources } from "./bump.ts";
import { decideAudit, parseTestCounts, RUN_ATTEMPT, RUN_ID, verifyManifests, type AuditFacts, type Decision } from "./decide.ts";
import type { PinKey } from "./detect.ts";
import { acquirePackages, type Acquisition } from "./fetch.ts";
import { loopbackSite, type FailureSummary } from "./notify.ts";
import { bunCommand, runChild, scanEvidence, scopedEnv, secretValues } from "./privacy.ts";
import { readPublicKey, verifyRelease } from "./publish.ts";

type Env = Record<string, string | undefined>;
const ROOT = resolve(import.meta.dir, "../..");
const VAULT_INPUTS = ["GPLVAULT_LICENSE_KEY", "GPLVAULT_PRODUCT_ID", "GPLVAULT_UPDATER_PASSPHRASE"];
const NATIVE = ["test", "test/plugin"];
const FINAL = [["run", "typecheck"], ["test", "test/plugin/core.test.ts", "test/plugin/release.test.ts", "tests/plugin-source.test.ts", "tests/reaudit-bump.test.ts"]];
// Inside reaudit.yml's 150-minute audit job: acquisition and cleanup take minutes, the full plugin suite about an hour.
const NATIVE_TIMEOUT_MS = 105 * 60_000;
const FINAL_TIMEOUT_MS = 25 * 60_000;

export type RunDeps = {
  acquire: (options: { pins: AuditedVersions; directory: string; env: Record<string, string> }) => Promise<Acquisition>;
  exec: (cmd: string[], options: { cwd: string; env: Record<string, string>; log: string; secrets: string[]; timeoutMs: number }) => Promise<{ code: number | null; output: string }>;
  currentRelease: (options: { version: string; pins: AuditedVersions; root: string; env: Env }) => Promise<NonNullable<AuditFacts["currentRelease"]>>;
};
export const realDeps: RunDeps = {
  acquire: (options) => acquirePackages(options),
  exec: (cmd, options) => runChild(cmd, options),
  currentRelease: async ({ version, pins, root, env }) => (await verifyRelease({ tag: `v${version}`, version, pins, publicKey: readPublicKey(root), env })).status,
};

const cleanupState = (lifecycle: unknown): AuditFacts["cleanup"] => {
  const l = lifecycle as { activationAttempted?: unknown; deactivationConfirmed?: unknown } | undefined;
  if (!l || typeof l !== "object") return "unknown";
  if (l.activationAttempted === false) return "not-applicable";
  return l.deactivationConfirmed === true ? "confirmed" : "failed";
};

const flag = (v: unknown) => (typeof v === "boolean" ? v : null);
const count = (v: unknown) => (Number.isSafeInteger(v) && (v as number) >= 0 ? (v as number) : null);
const UPDATER_VERSION = /^\d+(\.\d+)*$/;
/**
 * The lifecycle facts kept as evidence (plan D4/D10), each strictly typed or null (unknown), never invented: so a
 * first live run's unchanged counts (139 → 139) stay distinct from counts the client did not expose.
 */
export function safeLifecycle(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const l = value as Record<string, unknown>;
  const u = l.updater as Record<string, unknown> | null | undefined;
  const updater = u && typeof u === "object" && typeof u.before === "string" && typeof u.after === "string" && UPDATER_VERSION.test(u.before) && UPDATER_VERSION.test(u.after) ? { before: u.before, after: u.after } : null;
  return {
    activationAttempted: flag(l.activationAttempted),
    activationConfirmed: flag(l.activationConfirmed),
    deactivationAttempted: flag(l.deactivationAttempted),
    deactivationConfirmed: flag(l.deactivationConfirmed),
    remainingBefore: count(l.remainingBefore),
    remainingAfter: count(l.remainingAfter),
    updater,
    site: loopbackSite(l.site),
  };
}

/** The whole audit decision for this checkout; writes decision.json and candidate.json/summary.json into out. */
export async function runAudit({ root = ROOT, out, runId, runAttempt, env = process.env, deps = realDeps }: { root?: string; out: string; runId: string; runAttempt: string; env?: Env; deps?: RunDeps }): Promise<Decision> {
  const source = join(root, "plugin/pirax-form-test");
  const git = (...args: string[]) => Bun.spawnSync(["git", "-c", "core.hooksPath=/dev/null", ...args], { cwd: root, env: scopedEnv(env, []), stdout: "pipe", stderr: "pipe" });
  const base = git("rev-parse", "--verify", "HEAD").stdout.toString().trim();
  if (!/^[0-9a-f]{40}$/.test(base) || (env.GITHUB_SHA && env.GITHUB_SHA !== base)) throw new Error("run: HEAD is not the audited event commit");
  if (git("status", "--porcelain", "--untracked-files=no").stdout.toString().trim()) throw new Error("run: the checkout has uncommitted changes");
  const facts: AuditFacts = { runId, runAttempt, base, helper: readHelperVersion(source), oldPins: readAuditedVersions(source) };
  const evidence = join(out, "evidence");
  await mkdir(evidence, { recursive: true });
  const artifacts = join(root, "artifacts/plugin");
  const before = new Set(existsSync(artifacts) ? await readdir(artifacts) : []);
  const scratch = await mkdtemp(join(env.RUNNER_TEMP ?? tmpdir(), "pirax-reaudit-private-"));
  const token = randomBytes(32).toString("base64url");
  let secrets = secretValues(env, [token, scratch]);
  // Cancellation: let the current child end (it gets the signal too) and still run cleanup below.
  let interrupted = false;
  const onSignal = () => void (interrupted = true);
  for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, onSignal);
  try {
    let acquisition: Acquisition | undefined;
    let lifecycle: unknown;
    try {
      const vaultEnv = { ...scopedEnv(env, []), ...Object.fromEntries(VAULT_INPUTS.flatMap((n) => (env[n] ? [[n, env[n]!]] : []))) };
      acquisition = await deps.acquire({ pins: facts.oldPins, directory: join(scratch, "packages"), env: vaultEnv });
      lifecycle = acquisition.lifecycle;
    } catch (error) {
      facts.acquisition = { status: "failed", error };
      lifecycle = (error as { lifecycle?: unknown })?.lifecycle;
    }
    facts.cleanup = cleanupState(lifecycle);
    // Safe lifecycle facts are evidence on success and failure alike; the loopback site identifies the throwaway
    // instance for recovery whenever cleanup is not confirmed.
    const safe = safeLifecycle(lifecycle);
    if (safe) await writeFile(join(evidence, "lifecycle.json"), `${JSON.stringify(safe, null, 2)}\n`);
    if (safe?.site) facts.site = safe.site;
    if (acquisition?.status === "unchanged") {
      facts.acquisition = { status: "unchanged", versions: acquisition.versions };
      facts.currentRelease = await deps.currentRelease({ version: facts.helper, pins: facts.oldPins, root, env }).catch(() => "unknown" as const);
    } else if (acquisition?.status === "changed") {
      const packages = acquisition.packages;
      facts.acquisition = { status: "changed", versions: acquisition.versions, packages: Object.fromEntries(Object.entries(packages).map(([k, p]) => [k, { version: p.version, sha256: p.sha256 }])) as Record<PinKey, { version: string; sha256: string }> };
      const plan = planBump(facts.oldPins, acquisition.versions, facts.helper);
      const baseSources = readBumpSources(root);
      await applyBump(root, plan, { pinsOnly: true });
      secrets = secretValues(env, [token, scratch, packages.gf.path, packages.ff_pro.path]);
      const childEnv = { ...scopedEnv(env, []), ...(env.GH_TOKEN && { GH_TOKEN: env.GH_TOKEN }), FORM_TEST_TOKEN: token, GRAVITY_FORMS_ZIP: packages.gf.path, FLUENT_FORMS_PRO_ZIP: packages.ff_pro.path };
      const exec = (args: string[], log: string, timeoutMs: number) => deps.exec(bunCommand(...args), { cwd: root, env: childEnv, log: join(evidence, log), secrets, timeoutMs });
      const passed = (r: { code: number | null; output: string }, counted: boolean) => {
        const c = parseTestCounts(r.output);
        return !interrupted && r.code === 0 && (!counted || (!!c && c.pass > 0 && c.pass === c.ran && c.fail === 0 && c.skip === 0 && c.todo === 0));
      };
      facts.native = passed(await exec(NATIVE, "native-suite.log", NATIVE_TIMEOUT_MS), true) ? "passed" : "failed";
      if (facts.native === "passed") {
        const manifests: unknown[] = [];
        for (const dir of (await readdir(artifacts).catch(() => [] as string[])).filter((d) => !before.has(d)).sort()) {
          const file = join(artifacts, dir, "manifest.json");
          if (existsSync(file)) manifests.push(await readFile(file, "utf8").then(JSON.parse).catch(() => null));
        }
        facts.manifests = verifyManifests(manifests, facts.acquisition.packages);
      }
      if (facts.manifests === "verified") {
        // Helper patch and current-version docs only after the native gate, from the audited base sources.
        for (const file of BUMP_FILES) await writeFile(join(root, file), baseSources[file]);
        facts.changes = { to: plan.to, digest: (await applyBump(root, plan)).digest };
        facts.final = "passed";
        for (const [i, args] of FINAL.entries())
          if (!passed(await exec(args, `final-${i + 1}.log`, FINAL_TIMEOUT_MS), args[0] === "test")) {
            facts.final = "failed";
            break;
          }
      }
    }
    // Native evidence (trace ZIP entries included) is scanned in place; files with a known secret are withheld.
    const fresh = (await readdir(artifacts).catch(() => [] as string[])).filter((d) => !before.has(d));
    let hits = 0;
    for (const dir of fresh) {
      hits += (await scanEvidence(join(artifacts, dir), secrets)).length;
      if (!existsSync(join(artifacts, dir, "manifest.json"))) continue;
      await mkdir(join(evidence, "native", dir), { recursive: true });
      await cp(join(artifacts, dir, "manifest.json"), join(evidence, "native", dir, "manifest.json"));
    }
    hits += (await scanEvidence(out, secrets)).length;
    facts.privacy = hits ? "failed" : "passed";
  } finally {
    for (const signal of ["SIGINT", "SIGTERM"]) process.off(signal, onSignal);
    await rm(scratch, { recursive: true, force: true });
  }
  if (existsSync(scratch)) facts.cleanup = "failed";

  const decision = decideAudit(facts);
  const write = (name: string, value: unknown) => writeFile(join(out, name), `${JSON.stringify(value, null, 2)}\n`);
  await write("decision.json", decision);
  if (decision.outcome === "failed") await write("summary.json", decision.summary);
  if (decision.outcome === "audited-candidate") await write("candidate.json", decision.candidate);
  return decision;
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  if (args.length !== 2 || args[0] !== "--out") {
    console.error("usage: bun --no-env-file scripts/reaudit/run.ts --out <dir>");
    process.exit(2);
  }
  const out = resolve(args[1]!);
  let decision: Decision["outcome"] = "failed";
  try {
    const [runId, runAttempt] = [process.env.GITHUB_RUN_ID ?? "", process.env.GITHUB_RUN_ATTEMPT ?? ""];
    if (!RUN_ID.test(runId) || !RUN_ATTEMPT.test(runAttempt)) throw new Error("run: GITHUB_RUN_ID/GITHUB_RUN_ATTEMPT is not a run attempt");
    const result = await runAudit({ out, runId, runAttempt });
    decision = result.outcome;
    const facts = result.outcome === "failed" ? { stage: result.summary.stage, reason: result.summary.reason } : result.outcome === "unchanged" ? { versions: result.versions } : { newPins: result.candidate.newPins, helper: result.candidate.helper.to };
    console.log(JSON.stringify({ outcome: result.outcome, ...facts }));
  } catch {
    // No decision exists (our own precondition or an unexpected error); the text is fixed, never the error. Whatever
    // already reached out is scanned like any evidence before the workflow may upload it.
    const summary: FailureSummary = { stage: "unknown", reason: "run-error", cleanup: "unknown", publication: "not-attempted" };
    await mkdir(out, { recursive: true });
    await scanEvidence(out, secretValues(process.env)).catch(() => rm(out, { recursive: true, force: true }));
    await mkdir(out, { recursive: true });
    await writeFile(join(out, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
    console.error("run: no decision was reached; see the summary");
  }
  if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `outcome=${decision}\n`);
  process.exit(decision === "failed" ? 1 : 0);
}
