// Re-audit publisher (plan D7), run by reaudit.yml's write-capable job in a checkout of the triggering main commit
// (never a ref taken from a candidate or job output). It selects its deployment itself (DEPLOYMENT, loaded from this
// checkout; in Actions its repository must be GITHUB_REPOSITORY) and consumes only this run's strict candidate as
// data, which never chooses a checkout, path, key, repository or remote:
//   1. parseCandidate (this deployment and repository, this GITHUB_RUN_ID and GITHUB_RUN_ATTEMPT only), clean
//      checkout, HEAD == candidate.base, the deployment's versions.json == old facts
//   2. reconstruct the allowlisted change with checked-in bump.ts; its digest must equal the candidate's
//   3. remote main still == base and v<next> has no tag/release (read-only lookups)
//   4. commit exactly the bump files (deployments/<name>/versions.json), read back its 40-hex hash, recheck main,
//      push HEAD:main normally (no force)
//   5. the existing release CLI (its atomic ref claim stays authoritative), signing key and DEPLOYMENT in that child only
//   6. verifyRelease: independent download and check of the deployment's three assets, signature against its
//      configured public key, ZIP hash and contents, manifest pins, latest release and the tag's commit
// Nothing is ever forced, clobbered, deleted or retried. A failure after a remote mutation reports the intended
// commit/tag and uncertain publication state for inspection (plugin guide, Releasing).
//
// Usage: bun --no-env-file --no-install scripts/reaudit/publish.ts --candidate <candidate.json> --summary <summary.json>
//   needs DEPLOYMENT, GITHUB_RUN_ID, GITHUB_RUN_ATTEMPT, PIRAX_HELPER_SIGNING_KEY and gh authentication (GH_TOKEN in Actions; git
//   pushes ask gh through heartbeat.ts GIT_AUTH, since the checkout persists no credentials). Exit 0 published
//   (prints {outcome, base, commit, tag}); 1 failure (writes a FailureSummary to --summary); 2 usage.
// Import-safe: publish() and verifyRelease() are exported; dependency-free (no package install needed).
import { createHash, createPublicKey, verify } from "node:crypto";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { DeploymentConfigError, loadDeployment, type Deployment } from "../../src/deployment.ts";
import { parseAuditedVersions, parseHelperVersion, pinKeys, samePins, type AuditedVersions } from "../plugin-source.ts";
import { remoteTag } from "../release-plugin.ts";
import { renderPlugin } from "../render-plugin.ts";
import { GIT_AUTH, repositoryMismatch } from "./heartbeat.ts";
import { applyBump, bumpFiles, bumpSources, changesDigest, planBump, readBumpSources } from "./bump.ts";
import { decidePublication, parseCandidate, type Candidate } from "./decide.ts";
import type { FailureSummary } from "./notify.ts";
import { bunCommand, runChild, scanEvidence, scopedEnv, secretValues } from "./privacy.ts";

type Env = Record<string, string | undefined>;
const ROOT = resolve(import.meta.dir, "../..");
const SPKI_ED25519 = Buffer.from("302a300506032b6570032100", "hex");
const HEX40 = /^[0-9a-f]{40}$/;

export class PublishError extends Error {
  /** detail: a configuration error's safe field and reason (DeploymentConfigError), never other error text. */
  constructor(
    readonly summary: FailureSummary,
    readonly detail?: string,
  ) {
    super(`publish: ${summary.reason}${detail ? `: ${detail}` : ""}`);
  }
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
/** gh with the base environment plus its token only; never the signing key or vendor/mail credentials. */
const ghEnv = (env: Env) => ({ ...scopedEnv(env, []), ...(env.GH_TOKEN && { GH_TOKEN: env.GH_TOKEN }), GH_PROMPT_DISABLED: "1" });
const ghRun = (env: Env, args: string[]) => {
  const p = Bun.spawnSync(["gh", ...args], { env: ghEnv(env), stdout: "pipe", stderr: "pipe", timeout: 120_000 });
  return { code: p.exitCode, stdout: p.stdout.toString() };
};
/** `gh api --include` GET: HTTP status and parsed body; status 0 when unanswered. stderr is never surfaced. */
function apiGet(env: Env, path: string): { status: number; body: unknown } {
  const r = ghRun(env, ["api", "--include", path]);
  const status = Number(/^HTTP\/[\d.]+ (\d{3})/.exec(r.stdout)?.[1] ?? 0);
  if (status !== 200) return { status, body: null };
  const split = r.stdout.search(/\r?\n\r?\n/);
  try {
    if (r.code !== 0 || split < 0) throw new Error("unanswered");
    return { status, body: JSON.parse(r.stdout.slice(split).trim()) };
  } catch {
    return { status: 0, body: null };
  }
}

export type ReleaseCheck = { status: "verified" } | { status: "missing" | "incomplete" | "unknown"; reason: string };
/**
 * Read-only, independent check of the deployment's release `tag` in its channel repository: published (not
 * draft/prerelease) and latest, exactly the three assets (<slug>-manifest.json, its .sig, <slug>.zip), manifest
 * {version, package, sha256, audited} matching version/pins/ZIP and the canonical package URL, a signature that
 * verifies with the configured public key (raw 32-byte base64, the one the build ships), exactly the rendered ZIP
 * entries, embedded pins and the main file's Version header and VERSION constant, a tag ref on a commit (== commit
 * when given), and no known secret in any asset or ZIP entry. Only the deployment's config is used: version and pins
 * are the caller's facts.
 */
export async function verifyRelease({ deployment, tag, version, pins, commit, env = process.env, secrets = secretValues(env, [], deployment.config.notice.recipient) }: { deployment: Deployment; tag: string; version: string; pins: AuditedVersions; commit?: string; env?: Env; secrets?: string[] }): Promise<ReleaseCheck> {
  const bad = (status: "missing" | "incomplete" | "unknown", reason: string): ReleaseCheck => ({ status, reason });
  const { repository, releasesRoot, publicKey } = deployment.config.channel;
  const { assets } = deployment;
  const names = [assets.manifest, assets.signature, assets.zip].sort();
  const release = apiGet(env, `repos/${repository}/releases/tags/${tag}`);
  if (release.status === 404) return bad("missing", "release-missing");
  if (release.status !== 200 || !isObject(release.body)) return bad("unknown", "release-lookup-failed");
  const r = release.body;
  if (r.tag_name !== tag || r.draft !== false || r.prerelease !== false) return bad("incomplete", "release-not-published");
  const listed = Array.isArray(r.assets) ? r.assets.map((a) => (isObject(a) ? a.name : null)).sort() : [];
  if (JSON.stringify(listed) !== JSON.stringify(names)) return bad("incomplete", "release-assets");
  const latest = apiGet(env, `repos/${repository}/releases/latest`);
  if (latest.status === 0) return bad("unknown", "release-lookup-failed");
  if (!isObject(latest.body) || latest.body.tag_name !== tag) return bad("incomplete", "release-not-latest");
  const ref = apiGet(env, `repos/${repository}/git/ref/tags/${tag}`);
  if (ref.status === 0) return bad("unknown", "release-lookup-failed");
  const object = isObject(ref.body) && isObject(ref.body.object) ? ref.body.object : {};
  if (object.type !== "commit" || typeof object.sha !== "string" || !HEX40.test(object.sha) || (commit && object.sha !== commit)) return bad("incomplete", "release-tag-commit");

  const dir = await mkdtemp(join(tmpdir(), "pirax-release-verify-"));
  try {
    if (ghRun(env, ["release", "download", tag, "--repo", repository, "--dir", dir]).code !== 0) return bad("unknown", "release-download-failed");
    if (JSON.stringify((await readdir(dir)).sort()) !== JSON.stringify(names)) return bad("incomplete", "release-assets");
    const bytes = await readFile(join(dir, assets.manifest));
    const zip = await readFile(join(dir, assets.zip));
    let manifest: unknown;
    try {
      manifest = JSON.parse(bytes.toString("utf8"));
    } catch {}
    const m = isObject(manifest) ? manifest : {};
    const audited = isObject(m.audited) ? m.audited : {};
    if (
      JSON.stringify(Object.keys(m).sort()) !== JSON.stringify(["audited", "package", "sha256", "version"]) ||
      m.version !== version ||
      m.package !== `${releasesRoot}/download/${tag}/${assets.zip}` ||
      m.sha256 !== sha256(zip) ||
      Object.keys(audited).length !== pinKeys(pins).length ||
      !samePins(audited as AuditedVersions, pins)
    )
      return bad("incomplete", "release-manifest");
    const signature = Buffer.from((await readFile(join(dir, assets.signature), "utf8")).trim(), "base64");
    const key = createPublicKey({ key: Buffer.concat([SPKI_ED25519, Buffer.from(publicKey, "base64")]), format: "der", type: "spki" });
    if (signature.length !== 64 || !verify(null, bytes, key, signature)) return bad("incomplete", "release-signature");
    const unzip = (...args: string[]) => Bun.spawnSync(["unzip", ...args], { env: scopedEnv(env, []), stdout: "pipe", stderr: "ignore" });
    const entries = unzip("-Z1", join(dir, assets.zip)).stdout.toString().trim().split("\n").filter((e) => !e.endsWith("/")).sort();
    const main = unzip("-p", join(dir, assets.zip), assets.basename).stdout.toString();
    let zipPins: AuditedVersions | undefined;
    let zipVersion: string | undefined;
    try {
      zipPins = parseAuditedVersions(unzip("-p", join(dir, assets.zip), `${deployment.config.plugin.slug}/includes/compatibility.php`).stdout.toString());
      // Unique Version header and VERSION constant, equal to each other: a signed ZIP cannot claim another version.
      zipVersion = parseHelperVersion(main);
    } catch {}
    if (
      JSON.stringify(entries) !== JSON.stringify(renderPlugin(deployment).map((f) => f.path).sort()) ||
      zipVersion !== version ||
      !zipPins ||
      !samePins(zipPins, pins)
    )
      return bad("incomplete", "release-package");
    if ((await scanEvidence(dir, secrets)).length) return bad("incomplete", "release-asset-secret");
    return { status: "verified" };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

type PublishOptions = { root?: string; candidatePath: string; runId: string; runAttempt: string; env?: Env; remoteUrl?: string; beforePush?: () => void };
/**
 * The whole publication of the deployment that env.DEPLOYMENT selects in root (remote: its channel repository unless
 * a test passes remoteUrl); throws PublishError with a safe summary (intended commit/tag and uncertainty) on any failure.
 */
export async function publish({ root = ROOT, candidatePath, runId, runAttempt, env = process.env, remoteUrl, beforePush }: PublishOptions) {
  const summary = (stage: FailureSummary["stage"], reason: string, extra: Partial<FailureSummary> = {}): FailureSummary => ({ stage, reason, cleanup: "not-applicable", publication: "not-attempted", ...extra });
  let deployment: Deployment;
  try {
    deployment = loadDeployment({ root, env });
  } catch (error) {
    throw new PublishError(summary("publication", "deployment-invalid"), error instanceof DeploymentConfigError ? error.message : undefined);
  }
  if (repositoryMismatch(deployment, env)) throw new PublishError(summary("publication", "repository-mismatch"));
  const remote = remoteUrl ?? deployment.remote;
  const recipient = deployment.config.notice.recipient;
  let candidate: Candidate;
  try {
    const text = await readFile(candidatePath, "utf8");
    if (text.length > 64 * 1024) throw new Error("oversize");
    candidate = parseCandidate(JSON.parse(text), { deployment: deployment.name, repository: deployment.config.channel.repository, runId, runAttempt, keys: pinKeys(deployment.versions.audited) });
  } catch {
    throw new PublishError(summary("publication", "candidate-invalid"));
  }
  const tag = `v${candidate.helper.to}`;
  const facts: Partial<FailureSummary> = { oldVersions: candidate.oldPins, candidateVersions: candidate.newPins, tag };
  const stop = (stage: FailureSummary["stage"], reason: string, extra: Partial<FailureSummary> = {}) => new PublishError(summary(stage, reason, { ...facts, ...extra }));
  // No persisted checkout credentials (plan D5): pushes authenticate through gh with this job's GH_TOKEN.
  const gitEnv = { ...ghEnv(env), GIT_TERMINAL_PROMPT: "0" };
  const git = (args: string[]) => {
    const p = Bun.spawnSync(["git", ...GIT_AUTH, "-c", "core.hooksPath=/dev/null", ...args], { cwd: root, env: gitEnv, stdout: "pipe", stderr: "pipe", timeout: 120_000 });
    return { code: p.exitCode, out: p.stdout.toString().trimEnd() };
  };
  const remoteMain = () => {
    const r = git(["ls-remote", "--exit-code", remote, "refs/heads/main"]);
    return r.code === 0 ? r.out.split(/\s/)[0]! : "";
  };

  let state: NonNullable<FailureSummary["publication"]> = "not-attempted";
  let commit: string | undefined;
  try {
    const status = git(["status", "--porcelain", "--untracked-files=no"]);
    if (status.code !== 0 || status.out) throw stop("publication", "checkout-dirty");
    // The selected deployment's data in this checkout, read when it was loaded above (nothing has written it since).
    const sourcePins = deployment.versions.audited;
    const sourceHelper = deployment.versions.helperVersion;
    let plan, digest = "";
    try {
      plan = planBump(candidate.oldPins, candidate.newPins, candidate.helper.from);
    } catch {
      throw stop("publication", "source-drift");
    }
    try {
      digest = changesDigest(bumpSources(deployment, readBumpSources(deployment), plan));
    } catch {}
    const decision = decidePublication({
      candidate,
      head: git(["rev-parse", "--verify", "HEAD"]).out,
      sourcePins,
      sourceHelper,
      digest,
      remoteMain: remoteMain(),
      tag: await remoteTag(deployment.config.channel.repository, tag, ghEnv(env)).catch(() => "unknown" as const),
    });
    if (!decision.proceed) throw stop(decision.reason.startsWith("main-") ? "push" : "publication", decision.reason);

    await applyBump(deployment, plan);
    const files = bumpFiles(deployment);
    if (git(["add", "--", ...files]).code !== 0) throw stop("bump", "commit-failed");
    const staged = git(["status", "--porcelain", "--untracked-files=no"]).out.split("\n").sort();
    if (JSON.stringify(staged) !== JSON.stringify(files.map((f) => `M  ${f}`).sort())) throw stop("bump", "unexpected-changes");
    const lines = pinKeys(candidate.oldPins).filter((k) => candidate.oldPins[k] !== candidate.newPins[k]).map((k) => `${k} ${candidate.oldPins[k]} -> ${candidate.newPins[k]}`);
    const message = `chore(reaudit): audited pins, helper ${candidate.helper.to}\n\n${lines.join("\n")}\n\nRe-audit run ${candidate.runId} attempt ${candidate.runAttempt} at ${candidate.base}.`;
    const identity = ["-c", "user.name=github-actions[bot]", "-c", "user.email=41898282+github-actions[bot]@users.noreply.github.com", "-c", "commit.gpgsign=false"];
    if (git([...identity, "commit", "--quiet", "--no-verify", "-m", message]).code !== 0) throw stop("bump", "commit-failed");
    // An unread commit must stop here: an empty or partial value would disable verifyRelease's tag-commit check.
    const created = git(["rev-parse", "--verify", "HEAD"]);
    if (created.code !== 0 || !HEX40.test(created.out)) throw stop("bump", "commit-unreadable");
    commit = created.out;

    beforePush?.();
    if (remoteMain() !== candidate.base) throw stop("push", "main-advanced");
    if (git(["push", "--quiet", "--no-verify", remote, "HEAD:refs/heads/main"]).code !== 0) {
      const now = remoteMain();
      // A lost answer may still have landed: report what remote main shows, never retry.
      throw stop("push", "push-failed", { commit, publication: now === commit ? "main-pushed" : now ? "not-attempted" : "unknown" });
    }
    state = "main-pushed";

    const scratch = await mkdtemp(join(tmpdir(), "pirax-publish-"));
    try {
      state = "unknown";
      const release = await runChild(bunCommand("scripts/release-plugin.ts"), {
        cwd: root,
        // The release CLI loads the same selection (now holding the bumped data) from this checkout.
        env: { ...ghEnv(env), ...scopedEnv(env, ["PIRAX_HELPER_SIGNING_KEY"]), DEPLOYMENT: deployment.name },
        secrets: secretValues(env, [], recipient),
        log: join(scratch, "release.log"),
        timeoutMs: 20 * 60_000,
      });
      if (release.code !== 0)
        throw stop("publication", "release-cli-failed", { commit, publication: /tag v[\d.]+ was claimed/.test(release.output) ? "tag-claimed" : "main-pushed" });
    } finally {
      await rm(scratch, { recursive: true, force: true });
    }
    const check = await verifyRelease({ deployment, tag, version: candidate.helper.to, pins: candidate.newPins, commit, env });
    if (check.status !== "verified") throw stop("publication", check.reason, { commit, publication: "release-incomplete" });
    return { outcome: "published" as const, base: candidate.base, commit, tag };
  } catch (error) {
    if (error instanceof PublishError) throw error;
    throw stop("publication", "publisher-error", { ...(commit && { commit }), publication: state });
  }
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  if (args.length !== 4 || args[0] !== "--candidate" || args[2] !== "--summary") {
    console.error("usage: bun --no-env-file scripts/reaudit/publish.ts --candidate <candidate.json> --summary <summary.json>");
    process.exit(2);
  }
  try {
    console.log(JSON.stringify(await publish({ candidatePath: args[1]!, runId: process.env.GITHUB_RUN_ID ?? "", runAttempt: process.env.GITHUB_RUN_ATTEMPT ?? "" })));
  } catch (error) {
    const s: FailureSummary = error instanceof PublishError ? error.summary : { stage: "publication", reason: "publisher-error", cleanup: "not-applicable", publication: "unknown" };
    await writeFile(args[3]!, `${JSON.stringify(s, null, 2)}\n`);
    const detail = error instanceof PublishError && error.detail ? `: ${error.detail}` : "";
    console.error(`publish: ${s.reason}${detail} (publication ${s.publication}${s.commit ? `, intended commit ${s.commit}` : ""}${s.tag ? `, intended tag ${s.tag}` : ""})`);
    process.exit(1);
  }
}
