// Builds and signs the selected deployment's helper release, then publishes it as a GitHub release on the
// deployment's channel repository. DEPLOYMENT selects deployments/<name>/ (src/deployment.ts) before the seed or any
// build or GitHub step: its helper version, audited pins, public key, name, repository and asset names drive the
// release. The ZIP is built by build:plugin's buildPlugin(), which reads the rendered bytes back against the
// deployment; dist/ then also holds <slug>-manifest.json {version, package, sha256, audited} and its .sig, the
// base64 of the 64-byte detached Ed25519 signature over the exact manifest bytes.
//
// The signing seed comes only from PIRAX_HELPER_SIGNING_KEY (base64 of 32 raw Ed25519 seed bytes) and
// never reaches a file, an argument, a log or a child process.
//
// Usage:
//   DEPLOYMENT=<name> bun scripts/release-plugin.ts --dry-run
//       build and sign only (any seed, e.g. a generated test key); no GitHub
//   DEPLOYMENT=<name> bun scripts/release-plugin.ts
//       publish: the seed must match the deployment's public key and every build input (BUILD_INPUTS and the
//       deployment's config.json and versions.json) must be committed; refuses an existing local or remote
//       v<version> tag/release or an unanswered lookup, then creates the remote tag ref at HEAD (fails if it
//       exists) and runs `gh release create v<version> --verify-tag --latest` with the three assets
// Import-safe: remoteTag() is exported for tests, signingKey() and rawPublicKey() for deployment-selftest.ts; nothing
// runs on import.
import { createPrivateKey, createPublicKey, sign, verify, type KeyObject } from "node:crypto";
import { rm, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { loadDeployment } from "../src/deployment.ts";
import { buildPlugin, withoutSigningKey } from "./build-plugin.ts";
import { scanEvidence, secretValues } from "./reaudit/privacy.ts";

const ROOT = resolve(import.meta.dir, "..");
const DIST = join(ROOT, "dist");
/** Shared files every deployment's build reads (templates, renderer, build, loader and its imports), and this script. */
const BUILD_INPUTS = ["plugin/pirax-form-test", "scripts/render-plugin.ts", "scripts/build-plugin.ts", "scripts/plugin-source.ts", "scripts/release-plugin.ts", "src/deployment.ts", "src/forms/config.ts", "src/env.ts"];
const KEY = "PIRAX_HELPER_SIGNING_KEY";
/** DER prefixes that wrap a raw 32-byte Ed25519 seed (PKCS#8) and public key (SPKI). */
const PKCS8_ED25519 = Buffer.from("302e020100300506032b657004220420", "hex");
const SPKI_ED25519 = Buffer.from("302a300506032b6570032100", "hex");

/** The seed as a signing key. Errors name the variable, never its value. */
export function signingKey(env = process.env): KeyObject {
  const text = env[KEY];
  if (!text) throw new Error(`${KEY} is not set`);
  const seed = Buffer.from(text, "base64");
  if (seed.length !== 32 || seed.toString("base64") !== text) throw new Error(`${KEY} is not base64 of a 32-byte Ed25519 seed`);
  return createPrivateKey({ key: Buffer.concat([PKCS8_ED25519, seed]), format: "der", type: "pkcs8" });
}

/** base64 of the raw 32-byte Ed25519 public key, the format of config.channel.publicKey. */
export const rawPublicKey = (key: KeyObject) => createPublicKey(key).export({ format: "der", type: "spki" }).subarray(SPKI_ED25519.length).toString("base64");

/** Runs a command that never sees the seed; returns its exit code and output. */
function run(cmd: string[], env: Record<string, string | undefined> = process.env) {
  const proc = Bun.spawnSync(cmd, { cwd: ROOT, env: withoutSigningKey(env), stdout: "pipe", stderr: "pipe" });
  return { code: proc.exitCode, stdout: proc.stdout.toString(), stderr: proc.stderr.toString() };
}

/**
 * Whether tag exists in repo as a git tag or as any release (drafts included). Only a 404 for the ref
 * means "no tag"; any other failure (auth, network, rate limit) throws instead of answering "absent".
 */
export async function remoteTag(repo: string, tag: string, env: Record<string, string | undefined> = process.env) {
  const ref = run(["gh", "api", "--include", `repos/${repo}/git/ref/tags/${tag}`], env);
  const status = ref.stdout.match(/^HTTP\/[\d.]+ (\d{3})/)?.[1];
  if (ref.code === 0 && status === "200") return "present";
  if (status !== "404") throw new Error(`could not confirm that ${tag} is absent from ${repo}: tag lookup ${status ? `HTTP ${status}` : `failed (exit ${ref.code})`}`);
  const releases = run(["gh", "api", "--paginate", `repos/${repo}/releases?per_page=100`, "--jq", ".[].tag_name"], env);
  if (releases.code !== 0) throw new Error(`could not confirm that ${tag} is absent from ${repo}: release listing failed (exit ${releases.code})`);
  return releases.stdout.split("\n").includes(tag) ? "present" : "absent";
}

async function release(dryRun: boolean) {
  const deployment = loadDeployment();
  const key = signingKey();
  const { helperVersion: version, audited } = deployment.versions;
  const REPO = deployment.config.channel.repository;
  const ZIP = join(DIST, deployment.assets.zip);
  const MANIFEST = join(DIST, deployment.assets.manifest);
  const SIGNATURE = join(DIST, deployment.assets.signature);
  const tag = `v${version}`;
  let commit = "";
  if (!dryRun) {
    if (rawPublicKey(key) !== deployment.config.channel.publicKey) throw new Error(`${KEY} does not match config.channel.publicKey of deployment ${deployment.name}`);
    const inputs = [...BUILD_INPUTS, relative(deployment.root, deployment.paths.config), relative(deployment.root, deployment.paths.versions)];
    const head = run(["git", "rev-parse", "--verify", "HEAD"]);
    const dirty = run(["git", "status", "--porcelain", "--untracked-files=all", "--", ...inputs]);
    const local = run(["git", "tag", "--list", tag]);
    if (head.code !== 0 || dirty.code !== 0 || local.code !== 0) throw new Error("git could not read this checkout");
    if (dirty.stdout) throw new Error(`build inputs have uncommitted changes (${dirty.stdout.trim().split("\n").map((line) => line.slice(3)).join(", ")}); the release must match its target commit`);
    if (local.stdout.trim()) throw new Error(`tag ${tag} already exists locally`);
    if ((await remoteTag(REPO, tag)) !== "absent") throw new Error(`tag or release ${tag} already exists on ${REPO}`);
    commit = head.stdout.trim();
  }

  // Never leave assets of an earlier build next to a new ZIP.
  await rm(MANIFEST, { force: true });
  await rm(SIGNATURE, { force: true });
  const { sha256 } = await buildPlugin({ deployment, zip: ZIP });
  const bytes = Buffer.from(`${JSON.stringify({ version, package: deployment.packageUrl, sha256, audited }, null, 2)}\n`);
  const signature = sign(null, bytes, key);
  if (!verify(null, bytes, createPublicKey(key), signature)) throw new Error("the new signature does not verify");
  await writeFile(MANIFEST, bytes);
  await writeFile(SIGNATURE, signature.toString("base64"));
  // Gate the exact final bytes (ZIP entries included) before any tag/release mutation. Nothing below rebuilds
  // or edits these assets. Reuse the encoded-known-secret scanner and its credential-free archive children.
  try {
    if ((await scanEvidence(DIST, secretValues(process.env))).length) throw new Error("secret");
  } catch {
    await Promise.all([ZIP, MANIFEST, SIGNATURE].map((file) => rm(file, { force: true })));
    throw new Error("release asset privacy check failed; assets withheld, publication not attempted");
  }
  console.log(`${tag}: ${relative(ROOT, ZIP)} sha256 ${sha256}, signed by public key ${rawPublicKey(key)}`);
  if (dryRun) {
    console.log(`dry run: ${relative(ROOT, MANIFEST)} and .sig written; nothing published`);
    return;
  }

  // Creating the ref is the atomic claim: GitHub refuses (422) a tag that already exists, including one created
  // since the preflight, whereas gh release create would silently reuse it.
  const claim = run(["gh", "api", "--method", "POST", `repos/${REPO}/git/refs`, "-f", `ref=refs/tags/${tag}`, "-f", `sha=${commit}`]);
  if (claim.code !== 0) {
    const status = claim.stderr.match(/\(HTTP (\d{3})\)/)?.[1];
    throw new Error(`could not create tag ${tag} on ${REPO} (${status ? `HTTP ${status}` : `exit ${claim.code}`}); release creation was not attempted; inspect remote tag state before retrying`);
  }
  const notes = `${deployment.config.plugin.name} ${version}. Audited: ${Object.entries(audited).map(([plugin, audit]) => `${plugin} ${audit}`).join(", ")}.`;
  // --verify-tag releases only the tag claimed above; no --clobber, so an existing release or asset makes gh fail.
  const create = Bun.spawnSync(["gh", "release", "create", tag, "--repo", REPO, "--verify-tag", "--latest", "--target", commit, "--title", tag, "--notes", notes, ZIP, MANIFEST, SIGNATURE], {
    cwd: ROOT,
    env: withoutSigningKey(),
    stdout: "inherit",
    stderr: "inherit",
  });
  // No rollback: deleting a tag is a deliberate operator decision, not something to do on a failed request.
  if (create.exitCode !== 0)
    throw new Error(`gh release create failed (exit ${create.exitCode}); tag ${tag} was claimed on ${REPO} at ${commit}; inspect remote tag and release state before recovery: creation or upload may have partially succeeded; do not retry or delete blindly`);
  console.log(`published ${tag} on ${REPO}`);
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  try {
    if (args.some((a) => a !== "--dry-run")) throw new Error("usage: bun scripts/release-plugin.ts [--dry-run]");
    await release(args.includes("--dry-run"));
  } catch (error) {
    console.error(`release-plugin: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}
