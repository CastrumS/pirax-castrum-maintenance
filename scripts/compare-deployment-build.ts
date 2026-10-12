// Build compatibility proof (plan AC1). Builds a base commit's helper ZIP from that commit's own committed build
// inputs (git archive of scripts/build-plugin.ts and plugin/pirax-form-test/ into disposable scratch, run by Bun
// with no env file and a credential-free environment), builds the selected deployment with this checkout's build,
// and compares the two archives: the sorted entry lists and every entry's uncompressed bytes. ZIP metadata
// (timestamps, compression) is ignored. Writes the comparison as JSON (base commit, deployment, each side's entries
// with size and SHA-256, differences, verdict) and exits 0 only when the archives are identical.
// Usage: DEPLOYMENT=pirax bun scripts/compare-deployment-build.ts --base <40-hex commit> --out <file.json>
// Import-safe: compareArchives(base, branch) is exported for tests.
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { loadDeployment } from "../src/deployment.ts";
import { buildPlugin } from "./build-plugin.ts";

const ROOT = resolve(import.meta.dir, "..");
/** git, tar, zip/unzip and the base build get no credentials. */
const TOOL_ENV = Object.fromEntries(["PATH", "TMPDIR", "LANG", "LC_ALL"].flatMap((name) => (process.env[name] === undefined ? [] : [[name, process.env[name]!]])));

export type ArchiveEntry = { path: string; size: number; sha256: string };
export type Comparison = { identical: boolean; base: ArchiveEntry[]; branch: ArchiveEntry[]; differences: { path: string; base: string | null; branch: string | null }[] };

/** Runs a tool; a failure throws with its output (the tools see no credentials, so it holds none). */
async function tool(command: string[], cwd = ROOT) {
  const proc = Bun.spawn(command, { cwd, env: TOOL_ENV, stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, exit] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
  if (exit !== 0) throw new Error(`${command[0]} failed (exit ${exit}): ${stderr.trim() || stdout.trim()}`);
  return stdout;
}

/** Every entry (directories as empty), sorted, with its uncompressed bytes. */
async function readArchive(zip: string) {
  const dir = await mkdtemp(join(tmpdir(), "compare-archive-"));
  try {
    await tool(["unzip", "-q", zip, "-d", dir]);
    const paths = (await tool(["unzip", "-Z1", zip])).trim().split("\n").sort();
    return await Promise.all(
      paths.map(async (path) => {
        const bytes = path.endsWith("/") ? Buffer.alloc(0) : Buffer.from(await Bun.file(join(dir, path)).arrayBuffer());
        return { path, size: bytes.length, sha256: new Bun.CryptoHasher("sha256").update(bytes).digest("hex"), bytes };
      }),
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export async function compareArchives(base: string, branch: string): Promise<Comparison> {
  const [a, b] = await Promise.all([readArchive(base), readArchive(branch)]);
  const differences = [...new Set([...a, ...b].map((e) => e.path))].sort().flatMap((path) => {
    const [x, y] = [a.find((e) => e.path === path), b.find((e) => e.path === path)];
    return x && y && x.bytes.equals(y.bytes) ? [] : [{ path, base: x?.sha256 ?? null, branch: y?.sha256 ?? null }];
  });
  const listing = (entries: typeof a) => entries.map(({ path, size, sha256 }) => ({ path, size, sha256 }));
  return { identical: differences.length === 0, base: listing(a), branch: listing(b), differences };
}

/** The base commit's own build of its committed inputs, in scratch; returns its ZIP. */
async function buildBase(commit: string, scratch: string) {
  const checkout = join(scratch, "base");
  await mkdir(checkout);
  await tool(["git", "archive", "--format=tar", "-o", join(scratch, "base.tar"), commit, "--", "scripts/build-plugin.ts", "plugin/pirax-form-test"]);
  await tool(["tar", "-xf", join(scratch, "base.tar"), "-C", checkout]);
  await tool([process.execPath, "--no-env-file", "scripts/build-plugin.ts"], checkout);
  return join(checkout, "dist/pirax-form-test.zip");
}

async function main(args: string[]) {
  const options = new Map<string, string>(args.length === 4 ? [[args[0]!, args[1]!], [args[2]!, args[3]!]] : []);
  const [commit, out] = [options.get("--base"), options.get("--out")];
  if (options.size !== 2 || !commit || !/^[0-9a-f]{40}$/.test(commit) || !out || out.startsWith("-")) {
    console.error("usage: DEPLOYMENT=<name> bun scripts/compare-deployment-build.ts --base <40-hex commit> --out <file.json>");
    return 2;
  }
  const deployment = loadDeployment();
  const scratch = await mkdtemp(join(tmpdir(), "compare-deployment-build-"));
  try {
    const baseZip = await buildBase(commit, scratch);
    const { zip } = await buildPlugin({ deployment, zip: join(scratch, "branch", deployment.assets.zip) });
    const comparison = await compareArchives(baseZip, zip);
    const verdict = comparison.identical ? "identical" : "different";
    await mkdir(dirname(resolve(out)), { recursive: true });
    await writeFile(out, `${JSON.stringify({ base: { commit, entries: comparison.base }, branch: { deployment: deployment.name, entries: comparison.branch }, differences: comparison.differences, verdict }, null, 2)}\n`);
    console.log(`${verdict}: base ${commit} and deployment ${deployment.name}, ${comparison.base.length} and ${comparison.branch.length} entries, ${comparison.differences.length} differences (${out})`);
    return comparison.identical ? 0 : 1;
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}

if (import.meta.main) {
  try {
    process.exitCode = await main(process.argv.slice(2));
  } catch (error) {
    console.error(`compare-deployment-build: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
