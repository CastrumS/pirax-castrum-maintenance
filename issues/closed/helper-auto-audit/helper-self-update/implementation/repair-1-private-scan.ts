// Read credentials only through Bun's --env-file loader. Keep comparison material in memory;
// remove credential variables before any child process. Never retain private material or print hits' bytes.
// Run from the helper worktree after final checks:
// bun --env-file=/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/.env <this file>
import { copyFile, lstat, mkdir, mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { createHash, createPrivateKey, createPublicKey, sign, verify } from "node:crypto";

const root = "/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/worktrees/helper-self-update";
const leaf = "/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/open/helper-auto-audit/helper-self-update";
const { findSecret } = await import(join(root, "test/plugin/artifacts.ts"));
const names = ["FORM_TEST_TOKEN", "FORM_TEST_ADDRESS", "GRAVITY_FORMS_ZIP", "FLUENT_FORMS_PRO_ZIP", "PIRAX_HELPER_SIGNING_KEY", "IMAP_USER", "IMAP_PASSWORD", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY", "GPLVAULT_LICENSE_KEY"];
const present = Object.fromEntries(names.map((n) => [n, Boolean(process.env[n])]));
const values = names.map((n) => process.env[n] ?? "").filter(Boolean);
const seed = process.env.PIRAX_HELPER_SIGNING_KEY ?? "";
const raw = Buffer.from(seed, "base64");
if (raw.length !== 32 || raw.toString("base64") !== seed) throw Error("PIRAX_HELPER_SIGNING_KEY is missing or noncanonical");
const der = Buffer.concat([Buffer.from("302e020100300506032b657004220420", "hex"), raw]);
const key = createPrivateKey({ key: der, format: "der", type: "pkcs8" });
const pub = createPublicKey(key);
const publicRaw = Buffer.from(pub.export({ format: "der", type: "spki" })).subarray(-32);
const php = await readFile(join(root, "plugin/pirax-form-test/includes/updates.php"), "utf8");
const embedded = php.match(/const UPDATE_PUBLIC_KEY = '([^']+)'/)?.[1];
const privateForms = [seed, raw.toString("hex"), raw.toString("base64url"), der.toString("base64"), der.toString("hex"), key.export({ format: "pem", type: "pkcs8" }).toString()];
const needles = [...new Set([...values, ...privateForms])];
const challenge = Buffer.from("helper-self-update repair round 1 local pair proof; not a release manifest");
const publicMatch = publicRaw.toString("base64") === embedded;
const signVerify = verify(null, challenge, pub, sign(null, challenge, key));
const safeNames = new Set(["PATH", "HOME", "TMPDIR", "LANG", "LC_ALL"]);
for (const n of Object.keys(process.env)) if (!safeNames.has(n)) delete process.env[n];
const childEnv = { ...process.env };
const git = async (...args: string[]) => {
  const p = Bun.spawn(["git", ...args], { cwd: root, env: childEnv, stdout: "pipe", stderr: "ignore" });
  const [text, code] = await Promise.all([new Response(p.stdout).text(), p.exited]);
  if (code) throw Error("Metadata-only git command failed");
  return text;
};
const head = (await git("rev-parse", "HEAD")).trim();
const tracked = (await git("ls-files", "-z")).split("\0").filter(Boolean);
const scratch = await mkdtemp(join(tmpdir(), "pirax-repair-scan-"));
const skippedEnvPaths: string[] = [];
const placeholders: string[] = [];
const counts: Record<string, number> = {};
const hits: string[] = [];
function environmentPath(path: string) { return basename(path) === ".env" || basename(path).startsWith(".env."); }
async function stage(file: string, target: string, label: string) {
  if (environmentPath(file)) { skippedEnvPaths.push(label); return; }
  const stat = await lstat(file);
  if (stat.isSymbolicLink()) throw Error("Unexpected symlink in scan scope: " + label);
  if (!stat.isFile()) throw Error("Unexpected non-file in scan scope: " + label);
  // Report tests intentionally use this exact public-text stub. Any other invalid ZIP still fails
  // findSecret: do not silently downgrade arbitrary corrupt archives to a raw-byte-only scan.
  if (file.endsWith(".zip") && stat.size === 11 && (await readFile(file)).equals(Buffer.from("local trace"))) {
    target += ".known-placeholder";
    placeholders.push(label);
  }
  await mkdir(dirname(target), { recursive: true });
  await copyFile(file, target);
}
async function tree(source: string, target: string, label: string): Promise<number> {
  let count = 0;
  for (const entry of await readdir(source, { withFileTypes: true })) {
    const path = join(source, entry.name);
    const rel = label + "/" + entry.name;
    if (environmentPath(path)) { skippedEnvPaths.push(rel); continue; }
    if (entry.isDirectory()) count += await tree(path, join(target, entry.name), rel);
    else { await stage(path, join(target, entry.name), rel); count++; }
  }
  return count;
}
try {
  const source = join(scratch, "tracked-source");
  let count = 0;
  for (const rel of tracked) {
    if (environmentPath(rel)) { skippedEnvPaths.push("tracked-source/" + rel); continue; }
    await stage(join(root, rel), join(source, rel), "tracked-source/" + rel);
    count++;
  }
  counts["tracked-source"] = count;
  for (const [label, path] of [["dist", join(root, "dist")], ["artifacts", join(root, "artifacts")], ["runs", join(root, "runs")], ["authoritative-leaf", leaf]]) {
    counts[label] = await tree(path, join(scratch, label), label);
  }
  hits.push(...await findSecret(scratch, needles));
} finally {
  await rm(scratch, { recursive: true, force: true });
}
const result = {
  head, publicMatch, signVerify,
  publicFingerprint: createHash("sha256").update(publicRaw).digest("hex"),
  privateRepresentations: privateForms.length, credentialValues: values.length, variablesPresent: present,
  credentialsRemovedBeforeChildren: names.every((n) => !Object.hasOwn(childEnv, n)),
  counts, skippedEnvPaths, knownRawPlaceholderZips: placeholders, hits,
  githubSecretValueEquality: "not accessible; no claim", remoteMutation: false,
};
await Bun.write(join(leaf, "implementation/repair-1-private-scan.json"), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
if (!publicMatch || !signVerify || hits.length) process.exit(1);
