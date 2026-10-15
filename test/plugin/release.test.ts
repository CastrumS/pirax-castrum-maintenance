// Release CLI (plan D7; AC4): the real `bun scripts/release-plugin.ts` runs inside disposable git
// checkouts holding copies of the loader, renderer, build and release scripts, the helper templates and two synthetic
// deployment folders (the selected `fixture` and an unrelated `other`), so this repository's dist/, deployments and
// tags are never touched. Seeds are generated per run and reach only the CLI's environment. A gh wrapper on
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
import { only, parseAuditedVersions, parseHelperVersion } from "../../scripts/plugin-source";
import { auditedLine } from "../../scripts/render-plugin";
import { loadDeployment, PIN_KEYS } from "../../src/deployment";
import { FIXTURE_VERSIONS, fixtureConfig } from "../fixtures/deployment";
import { findSecret } from "./artifacts";
import { testKey } from "./update-fixture";

setDefaultTimeout(120_000);

const ROOT = resolve(import.meta.dir, "../..");
/** A real repository where v0.0.1 was never released, so publish runs get real read-only "absent" answers. */
const REPO = "CastrumS/pirax-castrum-maintenance";
/** The synthetic channel's own repository: dry runs only (it does not exist on GitHub). */
const FIXTURE_REPO = fixtureConfig("").channel.repository;
const KEY = "PIRAX_HELPER_SIGNING_KEY";
const PRODUCTION_KEY = loadDeployment({ env: { DEPLOYMENT: "pirax" } }).config.channel.publicKey;
const SLUG = fixtureConfig("").plugin.slug;
const ASSETS = [`${SLUG}-manifest.json`, `${SLUG}-manifest.json.sig`, `${SLUG}.zip`];
/** Every input the build reads; all of them are copied into each checkout. */
const COPIED = ["src/deployment.ts", "src/forms/config.ts", "src/env.ts", "scripts/build-plugin.ts", "scripts/plugin-source.ts", "scripts/render-plugin.ts", "scripts/release-plugin.ts", "scripts/reaudit/privacy.ts", "test/plugin/artifacts.ts", ...FILES.map((f) => `plugin/pirax-form-test/${f}`)];
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

type Versions = { schemaVersion: number; helperVersion: string; audited: Record<string, unknown> };
interface Selection {
  /** The selected deployment's public key; a fresh unrelated key when omitted. */
  publicKey?: string;
  /** The selected channel's repository (its releases root follows). */
  repository?: string;
  /** versions.json of the selected deployment, as an object or exact text. */
  versions?: Versions | string;
  /** Edits of template files (paths under plugin/pirax-form-test/). */
  edits?: Record<string, (text: string) => string>;
  /** The selected deployment's audited list; all five when omitted. */
  audited?: string[];
}

/** The synthetic identity (name, slug, author, refusals) on the given key and repository. */
function identity(publicKey: string, repository: string, audited = fixtureConfig("").audited) {
  const config = fixtureConfig(publicKey);
  return { ...config, channel: { repository, releasesRoot: `https://github.com/${repository}/releases`, publicKey }, audited };
}

/** A committed disposable checkout: build inputs, the selected deployment `fixture` and an unrelated `other`. */
async function checkout(name: string, { publicKey = key().publicKey, repository = REPO, versions = FIXTURE_VERSIONS, edits = {}, audited }: Selection = {}) {
  const dir = join(scratch, name);
  for (const file of COPIED) {
    await mkdir(dirname(join(dir, file)), { recursive: true });
    await Bun.write(join(dir, file), Bun.file(join(ROOT, file)));
  }
  for (const [deployment, config, data] of [
    ["fixture", identity(publicKey, repository, audited), typeof versions === "string" ? versions : `${JSON.stringify(versions, null, 2)}\n`],
    ["other", { ...identity(key().publicKey, REPO), plugin: { ...fixtureConfig("").plugin, slug: "other-form-check" } }, `${JSON.stringify(FIXTURE_VERSIONS, null, 2)}\n`],
  ] as const) {
    await mkdir(join(dir, "deployments", deployment), { recursive: true });
    await writeFile(join(dir, "deployments", deployment, "config.json"), `${JSON.stringify(config, null, 2)}\n`);
    await writeFile(join(dir, "deployments", deployment, "versions.json"), data);
    await writeFile(join(dir, "deployments", deployment, "sites.yaml"), "sites: []\n");
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

const versionsWith = (patch: Partial<Versions>): Versions => ({ ...FIXTURE_VERSIONS, ...patch });

/**
 * Run the CLI exactly as documented, selecting `fixture` unless extra sets DEPLOYMENT (undefined removes it); seed
 * undefined leaves the variable unset. Output is retained, unless
 * it contains a generated private value: then only leaked=true is kept, so neither the log nor an
 * assertion diff can carry the value.
 */
async function cli(dir: string, label: string, args: string[], seed?: string, extra: Record<string, string | undefined> = {}) {
  const all = { ...withoutSigningKey(), PATH: `${dir}-bin:${process.env.PATH}`, DEPLOYMENT: "fixture", ...(seed === undefined ? {} : { [KEY]: seed }), ...extra };
  const env = Object.fromEntries(Object.entries(all).filter(([, v]) => v !== undefined)) as Record<string, string>;
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

/** The ZIP's entries read back with unzip, keyed by path under the slug folder. */
async function entries(dir: string, zip: string) {
  const names = (await sh(dir, Bun.$`unzip -Z1 ${zip}`).text()).trim().split("\n").filter((e) => !e.endsWith("/"));
  return Object.fromEntries(await Promise.all(names.map(async (name) => [name, await sh(dir, Bun.$`unzip -p ${zip} ${name}`).text()] as const)));
}

test("offline: dry run signs the exact manifest bytes from the selected deployment's facts and never calls GitHub", async () => {
  const k = key();
  // A changed audited version must flow from the selected versions.json into the ZIP and manifest: no second matrix.
  const audited = { ...FIXTURE_VERSIONS.audited, ff_pro: "9.3.4" };
  expect(audited.ff_pro).not.toBe(FIXTURE_VERSIONS.audited.ff_pro);
  const dir = await checkout("dry-run", { publicKey: k.publicKey, repository: FIXTURE_REPO, versions: versionsWith({ audited }) });
  const r = await cli(dir, "dry-run", ["--dry-run"], k.seed);
  expect(r.code).toBe(0);
  expect(r.calls).toEqual([]);
  expect(r.dist).toEqual(ASSETS);

  const bytes = await Bun.file(join(dir, `dist/${SLUG}-manifest.json`)).bytes();
  const signature = await Bun.file(join(dir, `dist/${SLUG}-manifest.json.sig`)).text();
  expect(Buffer.from(signature, "base64").length).toBe(64);
  expect(Buffer.from(signature, "base64").toString("base64")).toBe(signature);
  expect(verifies(bytes, signature, k.publicKey)).toBe(true);
  // Dry run neither embeds nor satisfies the production key: a shipping helper would refuse it.
  expect(verifies(bytes, signature, PRODUCTION_KEY)).toBe(false);

  // The built bytes, read back independently of the renderer: selected folder, entry file, version, pins and key.
  const zip = await Bun.file(join(dir, `dist/${SLUG}.zip`)).bytes();
  const files = await entries(dir, `dist/${SLUG}.zip`);
  expect(Object.keys(files).sort()).toEqual(FILES.map((f) => `${SLUG}/${f === "pirax-form-test.php" ? `${SLUG}.php` : f}`).sort());
  const version = parseHelperVersion(files[`${SLUG}/${SLUG}.php`]!);
  expect(version).toBe(FIXTURE_VERSIONS.helperVersion);
  expect(parseAuditedVersions(files[`${SLUG}/includes/compatibility.php`]!)).toEqual(audited);
  expect(only(files[`${SLUG}/includes/updates.php`]!, /^const UPDATE_PUBLIC_KEY = '([^']*)';$/gm, "updates.php", "key")).toBe(k.publicKey);
  expect(files[`${SLUG}/${SLUG}.php`]).toContain(`\n * Plugin Name:       ${fixtureConfig("").plugin.name}\n`);
  const manifest = JSON.parse(new TextDecoder().decode(bytes));
  expect(Object.keys(manifest).sort()).toEqual(["audited", "package", "sha256", "version"]);
  expect(manifest).toEqual({
    version,
    package: `https://github.com/${FIXTURE_REPO}/releases/download/v${version}/${SLUG}.zip`,
    sha256: sha256(zip),
    audited,
  });
  // Templates and deployment data are only read.
  expect((await sh(dir, Bun.$`git status --porcelain --untracked-files=all -- plugin deployments`).text()).trim()).toBe("");

  await Bun.write(join(artifactDir, "dry-run-manifest.json"), bytes);
  await Bun.write(join(artifactDir, "dry-run-manifest.json.sig"), signature);
  summary.dryRun = { exit: r.code, ghCalls: r.calls.length, dist: r.dist, version, sha256: manifest.sha256, audited, testKeyFingerprint: k.fingerprint, verifiedWithTestKey: true, verifiedWithProductionKey: false };
});

test("offline: a four-key deployment's dry-run manifest carries exactly its listed pins", async () => {
  const k = key();
  const { gf: _gf, ...audited } = FIXTURE_VERSIONS.audited;
  const dir = await checkout("dry-run-four", { publicKey: k.publicKey, repository: FIXTURE_REPO, versions: versionsWith({ audited }), audited: ["ff", "ff_pro", "cleantalk", "fluent_smtp"] });
  const r = await cli(dir, "dry-run-four", ["--dry-run"], k.seed);
  expect(r.code).toBe(0);
  expect(r.calls).toEqual([]);
  expect(r.dist).toEqual(ASSETS);
  const bytes = await Bun.file(join(dir, `dist/${SLUG}-manifest.json`)).bytes();
  expect(verifies(bytes, await Bun.file(join(dir, `dist/${SLUG}-manifest.json.sig`)).text(), k.publicKey)).toBe(true);
  const manifest = JSON.parse(new TextDecoder().decode(bytes));
  expect(Object.keys(manifest.audited)).toEqual(["ff", "ff_pro", "cleantalk", "fluent_smtp"]);
  expect(manifest.audited).toEqual(audited);
  const files = await entries(dir, `dist/${SLUG}.zip`);
  expect(parseAuditedVersions(files[`${SLUG}/includes/compatibility.php`]!)).toEqual(audited);
});

test("offline: importing the release script has no side effects, even with no deployment selected", async () => {
  const k = key();
  const dir = await checkout("import");
  const { DEPLOYMENT: _selection, ...unselected } = withoutSigningKey();
  const proc = Bun.spawn([process.execPath, "--no-env-file", "-e", `await import(${JSON.stringify(join(dir, "scripts/release-plugin.ts"))})`], {
    cwd: dir,
    env: { ...unselected, PATH: `${dir}-bin:${process.env.PATH}`, [KEY]: k.seed },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, code] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
  expect({ code, stdout, stderr }).toEqual({ code: 0, stdout: "", stderr: "" });
  expect(await readdir(join(dir, "dist")).catch(() => "absent")).toBe("absent");
  expect(await Bun.file(`${dir}-bin/calls`).exists()).toBe(false);
  summary.import = { exit: code, output: stdout + stderr, dist: "absent", ghCalls: 0 };
});

test("offline: an unset, empty, unknown or invalid deployment is refused by field, in both modes, before the seed, build or GitHub", async () => {
  const k = key();
  const dir = await checkout("selection", { publicKey: k.publicKey });
  await mkdir(join(dir, "deployments/bad-config"));
  await writeFile(join(dir, "deployments/bad-config/config.json"), "{not json");
  await writeFile(join(dir, "deployments/bad-config/versions.json"), `${JSON.stringify(FIXTURE_VERSIONS)}\n`);
  await writeFile(join(dir, "deployments/bad-config/sites.yaml"), "sites: []\n");
  const cases: [string, string | undefined, string][] = [
    ["unset", undefined, "DEPLOYMENT is not set"],
    ["empty", "", "DEPLOYMENT is not set"],
    ["unknown", "missing", "DEPLOYMENT names no deployment folder"],
    ["traversal", "../fixture", "DEPLOYMENT is not a valid deployment name"],
    ["invalid-config", "bad-config", "config is not valid JSON"],
  ];
  const outcomes: Record<string, string> = {};
  for (const [name, deployment, message] of cases)
    for (const args of [["--dry-run"], []]) {
      const label = `selection-${name}-${args.length ? "dry-run" : "publish"}`;
      // An invalid seed too: the selection must be refused first.
      const r = await cli(dir, label, args, "not a base64 seed!", { DEPLOYMENT: deployment });
      expect({ label, code: r.code, stderr: r.stderr, dist: r.dist, calls: r.calls }).toEqual({ label, code: 1, stderr: `release-plugin: ${message}\n`, dist: [], calls: [] });
      outcomes[label] = r.stderr.trim();
    }
  // A valid selection with a schema error names the field, never the rejected value.
  const bad = await checkout("selection-schema", { publicKey: k.publicKey, versions: versionsWith({ helperVersion: k.seed }) });
  const r = await cli(bad, "selection-schema", ["--dry-run"], k.seed);
  expect({ code: r.code, stderr: r.stderr, leaked: r.leaked, dist: r.dist }).toEqual({ code: 1, stderr: "release-plugin: versions.helperVersion is invalid\n", leaked: false, dist: [] });
  summary.selectionRefusals = outcomes;
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

test("offline: publishing refuses a seed whose public key is not the selected deployment's", async () => {
  const k = key();
  const dir = await checkout("mismatch");
  const r = await cli(dir, "publish-mismatch", [], k.seed);
  expect(r.code).toBe(1);
  expect(r.stderr).toBe(`release-plugin: ${KEY} does not match config.channel.publicKey of deployment fixture\n`);
  expect(r.dist).toEqual([]);
  expect(r.calls).toEqual([]);
  // The unselected deployment's key does not count either.
  const other = (await Bun.file(join(dir, "deployments/other/config.json")).json()).channel.publicKey;
  expect(other).not.toBe(k.publicKey);
  summary.mismatch = { exit: r.code, ghCalls: 0, dist: r.dist };
});

test("offline: publishing refuses an existing local tag before any GitHub call", async () => {
  const k = key();
  const dir = await checkout("local-tag", { publicKey: k.publicKey });
  await sh(dir, Bun.$`git ${GIT} tag ${`v${FIXTURE_VERSIONS.helperVersion}`}`);
  const r = await cli(dir, "publish-local-tag", [], k.seed);
  expect(r.code).toBe(1);
  expect(r.stderr).toContain(`tag v${FIXTURE_VERSIONS.helperVersion} already exists locally`);
  expect(r.dist).toEqual([]);
  expect(r.calls).toEqual([]);
  summary.localTag = { exit: r.code, ghCalls: 0, dist: r.dist };
});

test("offline: publishing refuses uncommitted changes to any build input, but not to another deployment", async () => {
  const k = key();
  const dir = await checkout("dirty", { publicKey: k.publicKey });
  await sh(dir, Bun.$`git ${GIT} tag ${`v${FIXTURE_VERSIONS.helperVersion}`}`);
  const append = (file: string) => async () => writeFile(join(dir, file), `${await Bun.file(join(dir, file)).text()}\n`);
  const cases: [string, () => Promise<void>][] = [
    ["template", append("plugin/pirax-form-test/includes/updates.php")],
    ["untracked template file", () => writeFile(join(dir, "plugin/pirax-form-test/includes/extra.php"), "<?php\n")],
    ["renderer", append("scripts/render-plugin.ts")],
    ["build", append("scripts/build-plugin.ts")],
    ["pin reader", append("scripts/plugin-source.ts")],
    ["release script", append("scripts/release-plugin.ts")],
    ["loader", append("src/deployment.ts")],
    ["loader import", append("src/forms/config.ts")],
    ["loader import of an import", append("src/env.ts")],
    ["selected config", append("deployments/fixture/config.json")],
    ["selected versions", append("deployments/fixture/versions.json")],
  ];
  const outcomes: Record<string, string> = {};
  for (const [name, change] of cases) {
    await change();
    const r = await cli(dir, `dirty-${name.replace(/ /g, "-")}`, [], k.seed);
    expect({ name, code: r.code, calls: r.calls, dist: r.dist }).toEqual({ name, code: 1, calls: [], dist: [] });
    expect(r.stderr).toMatch(/^release-plugin: build inputs have uncommitted changes \(.+\); the release must match its target commit\n$/);
    outcomes[name] = r.stderr.trim();
    await sh(dir, Bun.$`git ${GIT} checkout -q -- . && git ${GIT} clean -q -f -- plugin`);
  }
  // Another deployment's data is not a build input of this one: the run continues to the tag check.
  await append("deployments/other/versions.json")();
  await writeFile(join(dir, "deployments/other/sites.yaml"), "sites: [] # edited\n");
  await append("deployments/fixture/sites.yaml")();
  const r = await cli(dir, "dirty-other-deployment", [], k.seed);
  expect({ code: r.code, stderr: r.stderr, calls: r.calls }).toEqual({ code: 1, stderr: `release-plugin: tag v${FIXTURE_VERSIONS.helperVersion} already exists locally\n`, calls: [] });
  outcomes["other deployment and site list"] = r.stderr.trim();
  summary.dirtyInputs = outcomes;
});

test("publishing fails closed when the real GitHub lookup cannot answer", async () => {
  expect(GH).toBeTruthy();
  const k = key();
  const dir = await checkout("remote-error", { publicKey: k.publicKey });
  // A real request with an invalid token: GitHub answers 401, which is not proof that the tag is absent.
  const r = await cli(dir, "publish-remote-error", [], k.seed, { GH_TOKEN: "invalid-pirax-release-test-token" });
  expect(r.code).toBe(1);
  expect(r.stderr).toContain(`could not confirm that v${FIXTURE_VERSIONS.helperVersion} is absent from ${REPO}`);
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
  const dir = await checkout(label, { publicKey: k.publicKey, versions: versionsWith({ helperVersion: "0.0.1" }) });
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
  expect(create[create.indexOf("--notes") + 1]).toBe(`${fixtureConfig("").plugin.name} 0.0.1. Audited: ${Object.entries(FIXTURE_VERSIONS.audited).map(([p, v]) => `${p} ${v}`).join(", ")}.`);
  expect(create.filter((a) => a.startsWith("--")).sort()).toEqual(["--latest", "--notes", "--repo", "--target", "--title", "--verify-tag"]);
  expect(create.filter((a) => a.startsWith("/")).sort()).toEqual(ASSETS.map((a) => join(dir, "dist", a)));

  const bytes = await Bun.file(join(dir, `dist/${SLUG}-manifest.json`)).bytes();
  expect(verifies(bytes, await Bun.file(join(dir, `dist/${SLUG}-manifest.json.sig`)).text(), k.publicKey)).toBe(true);
  const manifest = JSON.parse(new TextDecoder().decode(bytes));
  expect(manifest.sha256).toBe(sha256(await Bun.file(join(dir, `dist/${SLUG}.zip`)).bytes()));
  expect(manifest.package).toBe(`https://github.com/${REPO}/releases/download/v0.0.1/${SLUG}.zip`);
  summary.publish = { exit: r.code, lookups: lookups.map((c) => c.slice(0, 2).join(" ")), claim: writes[0], create, commit, testKeyFingerprint: k.fingerprint };
});

test("a tag claimed concurrently or an unanswered claim stops publication before gh release create", async () => {
  const outcomes: Record<string, unknown> = {};
  for (const [fail, reason] of [["ref-exists", "HTTP 422"], ["ref-error", "exit 1"]] as const) {
    const { r, claim, writes } = await publish(`publish-${fail}`, fail);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain(`could not create tag v0.0.1 on ${REPO} (${reason})`);
    expect(r.stderr).toContain("release creation was not attempted; inspect remote tag state before retrying");
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
  expect(r.stderr).toContain(`tag v0.0.1 was claimed on ${REPO} at ${commit}; inspect remote tag and release state before recovery`);
  summary.releaseFailure = { exit: r.code, writes, message: r.stderr.trim() };
});

test("offline: a generated seed used as a deployment version never reaches CLI output, in either mode", async () => {
  const k = key();
  // Disposable generated seed as the helper version and as a pin: the invalid value must be refused by field only.
  const cases: Record<string, Versions> = {
    helper: versionsWith({ helperVersion: k.seed }),
    pin: versionsWith({ audited: { ...FIXTURE_VERSIONS.audited, gf: k.seed } }),
  };
  const outcomes: Record<string, { exit: number; leaked: boolean; ghCalls: number; dist: string[]; message: string }> = {};
  for (const [name, versions] of Object.entries(cases)) {
    const dir = await checkout(`source-privacy-${name}`, { publicKey: k.publicKey, versions });
    for (const args of [["--dry-run"], []]) {
      const label = `source-privacy-${name}-${args.length ? "dry-run" : "publish"}`;
      const r = await cli(dir, label, args, k.seed);
      outcomes[label] = { exit: r.code, leaked: r.leaked, ghCalls: r.calls.length, dist: r.dist, message: r.stderr.trim() };
    }
  }
  await writeFile(join(artifactDir, "source-privacy.json"), `${JSON.stringify(outcomes, null, 2)}\n`);
  summary.sourcePrivacy = outcomes;
  for (const [label, outcome] of Object.entries(outcomes))
    expect(outcome).toEqual({ exit: 1, leaked: false, ghCalls: 0, dist: [], message: `release-plugin: ${label.includes("-helper-") ? "versions.helperVersion" : "versions.audited.gf"} is invalid` });
});

test("offline: malformed deployment versions or template literals are refused before anything is built", async () => {
  const k = key();
  const { fluent_smtp: _smtp, ...missing } = FIXTURE_VERSIONS.audited;
  const cases: Record<string, [Selection, string]> = {
    "prerelease helper version": [{ versions: versionsWith({ helperVersion: `${FIXTURE_VERSIONS.helperVersion}-beta` }) }, "versions.helperVersion is invalid"],
    "numeric helper version": [{ versions: `{"schemaVersion":1,"helperVersion":1.4,"audited":${JSON.stringify(FIXTURE_VERSIONS.audited)}}\n` }, "versions.helperVersion is invalid"],
    "missing audited key": [{ versions: versionsWith({ audited: missing }) }, "versions.audited.fluent_smtp is missing"],
    "unknown audited key": [{ versions: versionsWith({ audited: { ...FIXTURE_VERSIONS.audited, gravity: "1.0" } }) }, "versions.audited has an unknown field"],
    "prerelease audited version": [{ versions: versionsWith({ audited: { ...FIXTURE_VERSIONS.audited, ff: `${FIXTURE_VERSIONS.audited.ff}-beta` } }) }, "versions.audited.ff is invalid"],
    "not JSON": [{ versions: "{" }, "versions is not valid JSON"],
    // A template that ships its own literal is caught by the strict parsers reading the rendered bytes.
    "header differs from constant": [{ edits: { "pirax-form-test.php": (t) => t.replace("const VERSION = '{{php:versions.helperVersion}}';", "const VERSION = '9.9.9';") } }, "pirax-form-test.php: Version header and VERSION constant differ"],
    "non-literal audited version": [{ edits: { "includes/compatibility.php": (t) => t.replace("{{raw:auditedVersions}}", PIN_KEYS.map((key) => (key === "cleantalk" ? "\t'cleantalk'   => CLEANTALK_VERSION," : auditedLine(key, FIXTURE_VERSIONS.audited[key]))).join("\n")) } }, "includes/compatibility.php: AUDITED_VERSIONS has a line that is not a unique 'plugin' => 'version' literal"],
    "duplicate audited key": [{ edits: { "includes/compatibility.php": (t) => t.replace("{{raw:auditedVersions}}\n", `${auditedLine("gf", FIXTURE_VERSIONS.audited.gf)}\n{{raw:auditedVersions}}\n`) } }, "includes/compatibility.php: AUDITED_VERSIONS has a line that is not a unique 'plugin' => 'version' literal"],
    "literal public key": [{ edits: { "includes/updates.php": (t) => t.replace("'{{php:channel.publicKey}}'", `'${PRODUCTION_KEY}'`) } }, "rendered includes/updates.php does not hold the deployment's public key"],
  };
  const outcomes: Record<string, string> = {};
  for (const [name, [selection, message]] of Object.entries(cases)) {
    const dir = await checkout(`source-${name.replace(/ /g, "-")}`, { publicKey: k.publicKey, ...selection });
    const r = await cli(dir, `source-${name.replace(/ /g, "-")}`, ["--dry-run"], k.seed);
    expect({ name, code: r.code, stderr: r.stderr, dist: r.dist }).toEqual({ name, code: 1, stderr: `release-plugin: ${message}\n`, dist: [] });
    outcomes[name] = r.stderr.trim();
  }
  summary.sourceRefusals = outcomes;
});

test("offline: the parent refuses to package a seed found in source, and no private material reaches outputs or logs", async () => {
  const k = key();
  // Disposable generated seed only: proves the build scans with the parent's seed before its seed-free children run.
  const dir = await checkout("seed-in-source", { publicKey: k.publicKey, edits: { "README.md": (t) => `${t}\n${k.seed}\n` } });
  const r = await cli(dir, "seed-in-source", ["--dry-run"], k.seed);
  expect(r.code).toBe(1);
  expect(r.stderr).toBe(`release-plugin: README.md contains the value of ${KEY}\n`);
  expect(r.dist).toEqual([]);
  summary.seedInSource = { exit: r.code, message: r.stderr.trim() };

  await writeFile(join(artifactDir, "release-summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
  expect(await findSecret(artifactDir, secrets)).toEqual([]);
  for (const checkoutDir of checkouts) {
    if (!(await readdir(join(checkoutDir, "dist")).catch(() => null))) continue;
    expect(await findSecret(join(checkoutDir, "dist"), secrets)).toEqual([]);
  }
});
