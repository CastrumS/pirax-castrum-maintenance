// Builds and signs a helper release, then publishes it as a GitHub release on CastrumS/pirax-castrum-maintenance.
// The version (header + VERSION constant) and the audited matrix (AUDITED_VERSIONS) are read from the
// production PHP source by plugin-source.ts. The ZIP is built by build:plugin's buildPlugin(); dist/ then also holds
// pirax-form-test-manifest.json {version, package, sha256, audited} and its .sig, the base64 of the
// 64-byte detached Ed25519 signature over the exact manifest bytes.
//
// The signing seed comes only from PIRAX_HELPER_SIGNING_KEY (base64 of 32 raw Ed25519 seed bytes) and
// never reaches a file, an argument, a log or a child process.
//
// Usage:
//   bun scripts/release-plugin.ts --dry-run   build and sign only (any seed, e.g. a generated test key); no GitHub
//   bun scripts/release-plugin.ts             publish: the seed must match UPDATE_PUBLIC_KEY; refuses an existing
//                                             local or remote v<version> tag/release or an unanswered lookup, then
//                                             creates the remote tag ref at HEAD (fails if it exists) and runs
//                                             `gh release create v<version> --verify-tag --latest` with the three assets
// Import-safe: remoteTag() is exported for tests; nothing runs on import.
import { createPrivateKey, createPublicKey, sign, verify, type KeyObject } from "node:crypto";
import { readFileSync } from "node:fs";
import { rm, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { buildPlugin, withoutSigningKey } from "./build-plugin.ts";
import { only, readAuditedVersions, readHelperVersion } from "./plugin-source.ts";

const ROOT = resolve(import.meta.dir, "..");
const SOURCE = join(ROOT, "plugin/pirax-form-test");
const DIST = join(ROOT, "dist");
const ZIP = join(DIST, "pirax-form-test.zip");
const MANIFEST = join(DIST, "pirax-form-test-manifest.json");
const SIGNATURE = `${MANIFEST}.sig`;
const REPO = "CastrumS/pirax-castrum-maintenance";
const KEY = "PIRAX_HELPER_SIGNING_KEY";
/** DER prefixes that wrap a raw 32-byte Ed25519 seed (PKCS#8) and public key (SPKI). */
const PKCS8_ED25519 = Buffer.from("302e020100300506032b657004220420", "hex");
const SPKI_ED25519 = Buffer.from("302a300506032b6570032100", "hex");

/** The seed as a signing key. Errors name the variable, never its value. */
function signingKey(env = process.env): KeyObject {
  const text = env[KEY];
  if (!text) throw new Error(`${KEY} is not set`);
  const seed = Buffer.from(text, "base64");
  if (seed.length !== 32 || seed.toString("base64") !== text) throw new Error(`${KEY} is not base64 of a 32-byte Ed25519 seed`);
  return createPrivateKey({ key: Buffer.concat([PKCS8_ED25519, seed]), format: "der", type: "pkcs8" });
}

const rawPublicKey = (key: KeyObject) => createPublicKey(key).export({ format: "der", type: "spki" }).subarray(SPKI_ED25519.length).toString("base64");

/** Version, audited matrix (both via plugin-source.ts) and embedded public key, parsed narrowly from the helper source. */
function readSource(source = SOURCE) {
  const version = readHelperVersion(source);
  const audited = readAuditedVersions(source);
  const updates = readFileSync(join(source, "includes/updates.php"), "utf8");
  const publicKey = only(updates, /^const UPDATE_PUBLIC_KEY = '([^']*)';$/gm, "includes/updates.php", "UPDATE_PUBLIC_KEY");
  return { version, audited, publicKey };
}

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
  const key = signingKey();
  const { version, audited, publicKey } = readSource();
  const tag = `v${version}`;
  let commit = "";
  if (!dryRun) {
    if (rawPublicKey(key) !== publicKey) throw new Error(`${KEY} does not match UPDATE_PUBLIC_KEY in includes/updates.php`);
    const head = run(["git", "rev-parse", "--verify", "HEAD"]);
    const dirty = run(["git", "status", "--porcelain", "--", relative(ROOT, SOURCE)]);
    const local = run(["git", "tag", "--list", tag]);
    if (head.code !== 0 || dirty.code !== 0 || local.code !== 0) throw new Error("git could not read this checkout");
    if (dirty.stdout) throw new Error(`${relative(ROOT, SOURCE)} has uncommitted changes; the release must match its target commit`);
    if (local.stdout.trim()) throw new Error(`tag ${tag} already exists locally`);
    if ((await remoteTag(REPO, tag)) !== "absent") throw new Error(`tag or release ${tag} already exists on ${REPO}`);
    commit = head.stdout.trim();
  }

  // Never leave assets of an earlier build next to a new ZIP.
  await rm(MANIFEST, { force: true });
  await rm(SIGNATURE, { force: true });
  const { sha256 } = await buildPlugin({ source: SOURCE, zip: ZIP });
  const bytes = Buffer.from(`${JSON.stringify({ version, package: `https://github.com/${REPO}/releases/download/${tag}/pirax-form-test.zip`, sha256, audited }, null, 2)}\n`);
  const signature = sign(null, bytes, key);
  if (!verify(null, bytes, createPublicKey(key), signature)) throw new Error("the new signature does not verify");
  await writeFile(MANIFEST, bytes);
  await writeFile(SIGNATURE, signature.toString("base64"));
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
  const notes = `Pirax Form Test ${version}. Audited: ${Object.entries(audited).map(([plugin, audit]) => `${plugin} ${audit}`).join(", ")}.`;
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
