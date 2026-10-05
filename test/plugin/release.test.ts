// Release CLI (plan D7; AC4): the real `bun scripts/release-plugin.ts` runs inside disposable git
// checkouts holding copies of the scripts and helper source, so this repository's dist/ and tags are
// never touched. Seeds are generated per run and reach only the CLI's environment. A gh wrapper on
// PATH records every call, forwards only the CLI's two exact read-only `gh api` lookups to the real gh
// and answers everything else itself, so no tag, ref or release is ever written. Logs, manifests and a
// summary are retained under artifacts/plugin/release-<timestamp>/.
// bun --no-env-file test test/plugin/release.test.ts                 (needs network and an authenticated gh)
// bun --no-env-file test test/plugin/release.test.ts -t '^offline:'  (no network, no gh)
import { afterAll, expect, setDefaultTimeout, test } from "bun:test";
import { createHash, createPublicKey, randomBytes, verify } from "node:crypto";
import { chmod, mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { FILES, withoutSigningKey } from "../../scripts/build-plugin";
import { findSecret } from "./artifacts";
import { testKey } from "./update-fixture";

setDefaultTimeout(120_000);

const ROOT = resolve(import.meta.dir, "../..");
const REPO = "CastrumS/pirax-castrum-maintenance";
const KEY = "PIRAX_HELPER_SIGNING_KEY";
const PRODUCTION_KEY = "D8BfOn8TZC3jD+Hv5Q+p7SGPNGIYISVcMCqQWU0Dh9w=";
const ASSETS = ["pirax-form-test-manifest.json", "pirax-form-test-manifest.json.sig", "pirax-form-test.zip"];
const SPKI_ED25519 = Buffer.from("302a300506032b6570032100", "hex");
const GH = Bun.which("gh");
const artifactDir = join(ROOT, "artifacts/plugin", `release-${new Date().toISOString().replace(/[:.]/g, "-")}`);
const scratch = await mkdtemp(join(tmpdir(), "pirax-release-test-"));
await mkdir(artifactDir, { recursive: true });

/** Every private representation generated here, for the final findSecret scans. */
const secrets: string[] = [];
const checkouts: string[] = [];
const summary: Record<string, unknown> = {};

afterAll(() => rm(scratch, { recursive: true, force: true }));

/** A fresh test seed (base64 of 32 bytes) and its raw public key; never the production pair. */
function key() {
  const k = testKey();
  secrets.push(...k.secrets());
  return { seed: k.secrets()[0]!, publicKey: k.publicKey, fingerprint: k.fingerprint };
}

const verifies = (bytes: Uint8Array, signature: string, publicKey: string) =>
  verify(null, bytes, createPublicKey({ key: Buffer.concat([SPKI_ED25519, Buffer.from(publicKey, "base64")]), format: "der", type: "spki" }), Buffer.from(signature, "base64"));
const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
/** Runs a shell command in dir without the signing seed. */
const sh = (dir: string, command: ReturnType<typeof Bun.$>) => command.cwd(dir).env(withoutSigningKey()).quiet();
const GIT = ["-c", "user.name=Release Test", "-c", "user.email=release@test.invalid", "-c", "commit.gpgsign=false", "-c", "tag.gpgsign=false", "-c", "core.hooksPath=/dev/null"];

/** A committed disposable checkout: scripts + helper source, with optional per-file source edits. */
async function checkout(name: string, edits: Record<string, (text: string) => string> = {}) {
  const dir = join(scratch, name);
  for (const file of ["scripts/build-plugin.ts", "scripts/release-plugin.ts", ...FILES.map((f) => `plugin/pirax-form-test/${f}`)]) {
    await mkdir(dirname(join(dir, file)), { recursive: true });
    await Bun.write(join(dir, file), Bun.file(join(ROOT, file)));
  }
  for (const [file, edit] of Object.entries(edits)) {
    const path = join(dir, "plugin/pirax-form-test", file);
    const before = await Bun.file(path).text();
    const after = edit(before);
    expect(after).not.toBe(before);
    await Bun.write(path, after);
  }
  await sh(dir, Bun.$`git ${GIT} init -q && git ${GIT} add -A && git ${GIT} commit -q -m fixture`);
  // Records each call's argv (one argument per line, then ---). Only the exact GET ref lookup and GET
  // release listing reach the real gh; every other call, any `gh api` write included, is answered here.
  // PIRAX_TEST_GH_FAIL synthesizes a failure: ref-exists or ref-error for the ref POST, release for gh release.
  const bin = join(scratch, `${name}-bin`);
  await mkdir(bin);
  await writeFile(
    join(bin, "gh"),
    `#!/bin/sh
printf '%s\\n' "$@" --- >> '${bin}/calls'
if [ "$#" = 3 ] && [ "$1" = api ] && [ "$2" = --include ]; then case "$3" in repos/*/git/ref/tags/*) exec '${GH}' "$@";; esac; fi
if [ "$#" = 5 ] && [ "$1" = api ] && [ "$2" = --paginate ] && [ "$4" = --jq ] && [ "$5" = '.[].tag_name' ]; then case "$3" in repos/*/releases'?per_page=100') exec '${GH}' "$@";; esac; fi
case "$1:$PIRAX_TEST_GH_FAIL" in
  api:ref-exists) echo 'gh: Reference already exists (HTTP 422)' >&2; exit 1;;
  api:ref-error) echo 'error connecting to api.github.com' >&2; exit 1;;
  release:release) echo 'HTTP 502: Bad Gateway' >&2; exit 1;;
esac
echo '{"synthesized":true}'
`,
  );
  await chmod(join(bin, "gh"), 0o755);
  checkouts.push(dir);
  return dir;
}

const withKey = (publicKey: string) => ({ "includes/updates.php": (t: string) => t.replace(PRODUCTION_KEY, publicKey) });
const withVersion = (version: string) => (t: string) =>
  t.replace(/^( \* Version:\s+)0\.3\.0$/m, `$1${version}`).replace("const VERSION = '0.3.0';", `const VERSION = '${version}';`);

/**
 * Run the CLI exactly as documented; seed undefined leaves the variable unset. Output is retained, unless
 * it contains a generated private value: then only leaked=true is kept, so neither the log nor an
 * assertion diff can carry the value.
 */
async function cli(dir: string, label: string, args: string[], seed?: string, extra: Record<string, string> = {}) {
  const env = { ...withoutSigningKey(), PATH: `${dir}-bin:${process.env.PATH}`, ...(seed === undefined ? {} : { [KEY]: seed }), ...extra };
  const proc = Bun.spawn([process.execPath, "--no-env-file", "scripts/release-plugin.ts", ...args], { cwd: dir, env, stdout: "pipe", stderr: "pipe" });
  let [stdout, stderr, code] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
  let calls = (await Bun.file(`${dir}-bin/calls`).text().catch(() => ""))
    .split("---\n").filter(Boolean).map((c) => c.trimEnd().split("\n"));
  const leaked = secrets.some((s) => `${stdout}${stderr}${JSON.stringify(calls)}`.includes(s));
  if (leaked) [stdout, stderr, calls] = ["[withheld: contained generated private material]\n", "[withheld]\n", calls.map(() => ["[withheld]"])];
  const dist = (await readdir(join(dir, "dist")).catch(() => [] as string[])).sort();
  await writeFile(join(artifactDir, `${label}.log`), `$ bun scripts/release-plugin.ts ${args.join(" ")}\nexit ${code}\nleaked ${leaked}\n--- stdout\n${stdout}--- stderr\n${stderr}--- gh calls\n${JSON.stringify(calls)}\n--- dist\n${dist.join("\n")}\n`);
  return { code, stdout, stderr, leaked, calls, dist };
}

test("offline: dry run signs the exact manifest bytes from source-derived facts and never calls GitHub", async () => {
  const k = key();
  // A changed audited version must flow from the PHP source into the manifest: no second matrix.
  const dir = await checkout("dry-run", { "includes/compatibility.php": (t) => t.replace("'ff_pro'      => '6.2.15',", "'ff_pro'      => '6.2.16',") });
  const r = await cli(dir, "dry-run", ["--dry-run"], k.seed);
  expect(r.code).toBe(0);
  expect(r.calls).toEqual([]);
  expect(r.dist).toEqual(ASSETS);

  const bytes = await Bun.file(join(dir, "dist/pirax-form-test-manifest.json")).bytes();
  const signature = await Bun.file(join(dir, "dist/pirax-form-test-manifest.json.sig")).text();
  expect(Buffer.from(signature, "base64").length).toBe(64);
  expect(Buffer.from(signature, "base64").toString("base64")).toBe(signature);
  expect(verifies(bytes, signature, k.publicKey)).toBe(true);
  // Dry run neither embeds nor satisfies the production key: a shipping helper would refuse it.
  expect(verifies(bytes, signature, PRODUCTION_KEY)).toBe(false);
  expect(await Bun.file(join(dir, "plugin/pirax-form-test/includes/updates.php")).text()).toContain(`const UPDATE_PUBLIC_KEY = '${PRODUCTION_KEY}';`);

  const main = await Bun.file(join(dir, "plugin/pirax-form-test/pirax-form-test.php")).text();
  const compatibility = await Bun.file(join(dir, "plugin/pirax-form-test/includes/compatibility.php")).text();
  const version = main.match(/^ \* Version:\s+(\S+)$/m)![1];
  const block = compatibility.match(/^const AUDITED_VERSIONS = array\(([\s\S]*?)\);$/m)![1]!;
  const audited = Object.fromEntries([...block.matchAll(/'(\w+)'\s*=>\s*'([^']+)'/g)].map((m) => [m[1], m[2]]));
  const zip = await Bun.file(join(dir, "dist/pirax-form-test.zip")).bytes();
  const manifest = JSON.parse(new TextDecoder().decode(bytes));
  expect(Object.keys(manifest).sort()).toEqual(["audited", "package", "sha256", "version"]);
  expect(manifest).toEqual({
    version,
    package: `https://github.com/${REPO}/releases/download/v${version}/pirax-form-test.zip`,
    sha256: sha256(zip),
    audited,
  });
  expect(manifest.audited.ff_pro).toBe("6.2.16");
  for (const file of FILES) {
    const entry = await sh(dir, Bun.$`unzip -p dist/pirax-form-test.zip ${`pirax-form-test/${file}`}`);
    expect(sha256(entry.stdout)).toBe(sha256(await Bun.file(join(dir, "plugin/pirax-form-test", file)).bytes()));
  }

  await Bun.write(join(artifactDir, "dry-run-manifest.json"), bytes);
  await Bun.write(join(artifactDir, "dry-run-manifest.json.sig"), signature);
  summary.dryRun = { exit: r.code, ghCalls: r.calls.length, dist: r.dist, version, sha256: manifest.sha256, audited, testKeyFingerprint: k.fingerprint, verifiedWithTestKey: true, verifiedWithProductionKey: false };
});

test("offline: importing the release script has no side effects", async () => {
  const k = key();
  const dir = await checkout("import");
  const proc = Bun.spawn([process.execPath, "--no-env-file", "-e", `await import(${JSON.stringify(join(dir, "scripts/release-plugin.ts"))})`], {
    cwd: dir,
    env: { ...withoutSigningKey(), PATH: `${dir}-bin:${process.env.PATH}`, [KEY]: k.seed },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, code] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
  expect({ code, stdout, stderr }).toEqual({ code: 0, stdout: "", stderr: "" });
  expect(await readdir(join(dir, "dist")).catch(() => "absent")).toBe("absent");
  expect(await Bun.file(`${dir}-bin/calls`).exists()).toBe(false);
  summary.import = { exit: code, output: stdout + stderr, dist: "absent", ghCalls: 0 };
});

test("offline: a missing or malformed seed is refused by name, in both modes, before anything is built", async () => {
  const k = key();
  const dir = await checkout("seed");
  const cases: [string, string | undefined][] = [
    ["unset", undefined],
    ["empty", ""],
    ["not-base64", "not a base64 seed!"],
    ["31-bytes", randomBytes(31).toString("base64")],
    ["64-bytes", randomBytes(64).toString("base64")],
    ["unpadded", k.seed.replace(/=+$/, "")],
    ["trailing-newline", `${k.seed}\n`],
    ["base64url", Buffer.from(k.seed, "base64").toString("base64url")],
  ];
  const outcomes: Record<string, number> = {};
  for (const [name, seed] of cases)
    for (const args of [["--dry-run"], []]) {
      const label = `seed-${name}-${args.length ? "dry-run" : "publish"}`;
      const r = await cli(dir, label, args, seed);
      expect(r.code).toBe(1);
      expect(r.stderr).toContain(KEY);
      if (seed?.trim()) expect(r.stderr + r.stdout).not.toContain(seed.trim());
      expect(r.dist).toEqual([]);
      expect(r.calls).toEqual([]);
      outcomes[label] = r.code;
    }
  summary.seedRefusals = outcomes;
});

test("offline: publishing refuses a seed whose public key is not the committed production key", async () => {
  const k = key();
  const dir = await checkout("mismatch");
  const r = await cli(dir, "publish-mismatch", [], k.seed);
  expect(r.code).toBe(1);
  expect(r.stderr).toContain(`${KEY} does not match UPDATE_PUBLIC_KEY`);
  expect(r.dist).toEqual([]);
  expect(r.calls).toEqual([]);
  summary.mismatch = { exit: r.code, ghCalls: 0, dist: r.dist };
});

test("offline: publishing refuses an existing local tag before any GitHub call", async () => {
  const k = key();
  const dir = await checkout("local-tag", withKey(k.publicKey));
  await sh(dir, Bun.$`git ${GIT} tag v0.3.0`);
  const r = await cli(dir, "publish-local-tag", [], k.seed);
  expect(r.code).toBe(1);
  expect(r.stderr).toContain("tag v0.3.0 already exists locally");
  expect(r.dist).toEqual([]);
  expect(r.calls).toEqual([]);
  summary.localTag = { exit: r.code, ghCalls: 0, dist: r.dist };
});

test("publishing fails closed when the real GitHub lookup cannot answer", async () => {
  expect(GH).toBeTruthy();
  const k = key();
  const dir = await checkout("remote-error", withKey(k.publicKey));
  // A real request with an invalid token: GitHub answers 401, which is not proof that the tag is absent.
  const r = await cli(dir, "publish-remote-error", [], k.seed, { GH_TOKEN: "invalid-pirax-release-test-token" });
  expect(r.code).toBe(1);
  expect(r.stderr).toContain(`could not confirm that v0.3.0 is absent from ${REPO}`);
  expect(r.calls.length).toBeGreaterThan(0);
  expect(r.calls.every((c) => c[0] === "api")).toBe(true);
  expect(r.dist).toEqual([]);
  summary.remoteError = { exit: r.code, ghCalls: r.calls.map((c) => c.slice(0, 2).join(" ")), dist: r.dist };
});

test("remote lookup tells a missing tag from an existing one", async () => {
  const { remoteTag } = await import("../../scripts/release-plugin");
  expect(await remoteTag(REPO, "v0.0.0-pirax-never-released")).toBe("absent");
  expect(await remoteTag("cli/cli", "v2.0.0")).toBe("present");
  await expect(remoteTag(REPO, "v0.0.0-pirax-never-released", { ...withoutSigningKey(), GH_TOKEN: "invalid-pirax-release-test-token" })).rejects.toThrow("HTTP 401");
  summary.remoteLookup = { absent: `${REPO}@v0.0.0-pirax-never-released`, present: "cli/cli@v2.0.0", invalidToken: "rejected (HTTP 401)" };
});

test("the test gh wrapper forwards only the two exact read-only lookups and answers every write itself", async () => {
  const dir = await checkout("wrapper");
  // An invalid token: a forwarded call gets GitHub's real 401, so even a wrapper bug could not write.
  const env = { ...withoutSigningKey(), GH_TOKEN: "invalid-pirax-release-test-token" };
  const gh = async (...args: string[]) => {
    const proc = Bun.spawn([`${dir}-bin/gh`, ...args], { cwd: dir, env, stdout: "pipe", stderr: "pipe" });
    const [stdout, code] = await Promise.all([new Response(proc.stdout).text(), proc.exited]);
    return { code, synthesized: stdout === '{"synthesized":true}\n' };
  };
  const tag = "v0.0.0-pirax-never-released";
  const outcomes = {
    refLookup: await gh("api", "--include", `repos/${REPO}/git/ref/tags/${tag}`),
    releaseListing: await gh("api", "--paginate", `repos/${REPO}/releases?per_page=100`, "--jq", ".[].tag_name"),
    refCreate: await gh("api", "--method", "POST", `repos/${REPO}/git/refs`, "-f", `ref=refs/tags/${tag}`, "-f", "sha=0000000000000000000000000000000000000000"),
    refDelete: await gh("api", "--include", `repos/${REPO}/git/refs/tags/${tag}`, "--method", "DELETE"),
    fieldsImplyPost: await gh("api", `repos/${REPO}/git/refs`, "-f", `ref=refs/tags/${tag}`),
    otherGet: await gh("api", `repos/${REPO}/git/ref/tags/${tag}`),
    releaseCreate: await gh("release", "create", tag, "--repo", REPO),
  };
  expect(outcomes).toEqual({
    refLookup: { code: 1, synthesized: false },
    releaseListing: { code: 1, synthesized: false },
    refCreate: { code: 0, synthesized: true },
    refDelete: { code: 0, synthesized: true },
    fieldsImplyPost: { code: 0, synthesized: true },
    otherGet: { code: 0, synthesized: true },
    releaseCreate: { code: 0, synthesized: true },
  });
  summary.wrapper = outcomes;
});

/** A publish of the never-released version 0.0.1 (real read-only lookups answer "absent"), with an optional synthesized failure. */
async function publish(label: string, fail?: string) {
  const k = key();
  const dir = await checkout(label, { ...withKey(k.publicKey), "pirax-form-test.php": withVersion("0.0.1") });
  const commit = (await sh(dir, Bun.$`git rev-parse HEAD`).text()).trim();
  const r = await cli(dir, label, [], k.seed, fail ? { PIRAX_TEST_GH_FAIL: fail } : {});
  const claim = ["api", "--method", "POST", `repos/${REPO}/git/refs`, "-f", "ref=refs/tags/v0.0.1", "-f", `sha=${commit}`];
  const first = r.calls.findIndex((c) => c[0] !== "api" || c[1] === "--method");
  const at = first < 0 ? r.calls.length : first;
  const lookups = r.calls.slice(0, at);
  expect(lookups.length).toBeGreaterThan(0);
  expect(lookups.every((c) => c[0] === "api" && (c[1] === "--include" || c[1] === "--paginate"))).toBe(true);
  expect(r.leaked).toBe(false);
  return { r, k, dir, commit, claim, lookups, writes: r.calls.slice(at) };
}

test("publishing checks GitHub read-only, claims the tag at HEAD, then creates exactly one release from it with the three signed assets", async () => {
  const { r, k, dir, commit, claim, lookups, writes } = await publish("publish");
  expect(r.code).toBe(0);
  expect(r.dist).toEqual(ASSETS);
  expect(writes.length).toBe(2);
  expect(writes[0]).toEqual(claim);
  const create = writes[1]!;
  expect(create.slice(0, 3)).toEqual(["release", "create", "v0.0.1"]);
  expect(create[create.indexOf("--repo") + 1]).toBe(REPO);
  expect(create[create.indexOf("--target") + 1]).toBe(commit);
  expect(create.filter((a) => a.startsWith("--")).sort()).toEqual(["--latest", "--notes", "--repo", "--target", "--title", "--verify-tag"]);
  expect(create.filter((a) => a.startsWith("/")).sort()).toEqual(ASSETS.map((a) => join(dir, "dist", a)));

  const bytes = await Bun.file(join(dir, "dist/pirax-form-test-manifest.json")).bytes();
  expect(verifies(bytes, await Bun.file(join(dir, "dist/pirax-form-test-manifest.json.sig")).text(), k.publicKey)).toBe(true);
  expect(JSON.parse(new TextDecoder().decode(bytes)).sha256).toBe(sha256(await Bun.file(join(dir, "dist/pirax-form-test.zip")).bytes()));
  summary.publish = { exit: r.code, lookups: lookups.map((c) => c.slice(0, 2).join(" ")), claim: writes[0], create, commit, testKeyFingerprint: k.fingerprint };
});

test("a tag claimed concurrently or an unanswered claim stops publication before gh release create", async () => {
  const outcomes: Record<string, unknown> = {};
  for (const [fail, reason] of [["ref-exists", "HTTP 422"], ["ref-error", "exit 1"]] as const) {
    const { r, claim, writes } = await publish(`publish-${fail}`, fail);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain(`could not create tag v0.0.1 on ${REPO} (${reason})`);
    expect(r.stderr).toContain("nothing was published");
    expect(writes).toEqual([claim]);
    outcomes[fail] = { exit: r.code, writes, message: r.stderr.trim() };
  }
  summary.claimRefusals = outcomes;
});

test("a release failure after the claim leaves the tag for deliberate recovery: no retry, overwrite or delete", async () => {
  const { r, commit, claim, writes } = await publish("publish-release-failure", "release");
  expect(r.code).toBe(1);
  expect(writes.length).toBe(2);
  expect(writes[0]).toEqual(claim);
  expect(writes[1]!.slice(0, 3)).toEqual(["release", "create", "v0.0.1"]);
  expect(writes[1]).toContain("--verify-tag");
  expect(r.stderr).toContain("gh release create failed (exit 1)");
  expect(r.stderr).toContain(`tag v0.0.1 now exists on ${REPO} at ${commit} without a release`);
  summary.releaseFailure = { exit: r.code, writes, message: r.stderr.trim() };
});

test("offline: a generated seed used as the source version never reaches CLI output, in either mode", async () => {
  const k = key();
  // Disposable generated seed as both header and constant: the invalid version must be refused by name only.
  const dir = await checkout("source-privacy", { ...withKey(k.publicKey), "pirax-form-test.php": withVersion(k.seed) });
  const outcomes: Record<string, { exit: number; leaked: boolean; ghCalls: number; dist: string[] }> = {};
  const messages: string[] = [];
  for (const args of [["--dry-run"], []]) {
    const r = await cli(dir, `source-privacy-${args.length ? "dry-run" : "publish"}`, args, k.seed);
    outcomes[`source-privacy-${args.length ? "dry-run" : "publish"}`] = { exit: r.code, leaked: r.leaked, ghCalls: r.calls.length, dist: r.dist };
    messages.push(r.stderr.trim());
  }
  await writeFile(join(artifactDir, "source-privacy.json"), `${JSON.stringify(outcomes, null, 2)}\n`);
  summary.sourcePrivacy = outcomes;
  for (const outcome of Object.values(outcomes)) expect(outcome).toEqual({ exit: 1, leaked: false, ghCalls: 0, dist: [] });
  for (const message of messages) expect(message).toBe("release-plugin: pirax-form-test.php: VERSION is not a stable dotted numeric version");
});

test("offline: malformed or ambiguous source facts are refused before anything is built", async () => {
  const k = key();
  const cases: Record<string, Record<string, (t: string) => string>> = {
    "header-differs-from-constant": { "pirax-form-test.php": (t) => t.replace("const VERSION = '0.3.0';", "const VERSION = '0.3.1';") },
    prerelease: { "pirax-form-test.php": withVersion("0.3.0-beta") },
    "duplicate-audited-key": { "includes/compatibility.php": (t) => t.replace("\t'gf'          => '3.1.2',\n", "\t'gf'          => '3.1.2',\n\t'gf'          => '3.1.3',\n") },
    "non-literal-audited-version": { "includes/compatibility.php": (t) => t.replace("'cleantalk'   => '6.88',", "'cleantalk'   => CLEANTALK_VERSION,") },
  };
  const outcomes: Record<string, string> = {};
  for (const [name, edits] of Object.entries(cases)) {
    const dir = await checkout(`source-${name}`, edits);
    const r = await cli(dir, `source-${name}`, ["--dry-run"], k.seed);
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/pirax-form-test\.php|compatibility\.php/);
    expect(r.dist).toEqual([]);
    outcomes[name] = r.stderr.trim();
  }
  summary.sourceRefusals = outcomes;
});

test("offline: the parent refuses to package a seed found in source, and no private material reaches outputs or logs", async () => {
  const k = key();
  // Disposable generated seed only: proves the build scans with the parent's seed before its seed-free children run.
  const dir = await checkout("seed-in-source", { "README.md": (t) => `${t}\n${k.seed}\n` });
  const r = await cli(dir, "seed-in-source", ["--dry-run"], k.seed);
  expect(r.code).toBe(1);
  expect(r.stderr).toContain(`README.md contains the value of ${KEY}`);
  expect(r.dist).toEqual([]);
  summary.seedInSource = { exit: r.code, message: r.stderr.trim() };

  await writeFile(join(artifactDir, "release-summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
  expect(await findSecret(artifactDir, secrets)).toEqual([]);
  for (const checkoutDir of checkouts) {
    if (!(await readdir(join(checkoutDir, "dist")).catch(() => null))) continue;
    expect(await findSecret(join(checkoutDir, "dist"), secrets)).toEqual([]);
  }
});
