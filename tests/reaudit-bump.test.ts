// Deterministic audited-change reconstruction (plan D6): a bump rewrites only the selected deployment's
// versions.json, in canonical form. Shared templates, the plugin guide and every other deployment stay byte-identical;
// the build renders the bumped data. Synthetic pins only, in disposable roots; the checked-in data is read, never edited.
import { afterAll, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { cp, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { formatVersions, loadDeployment } from "../src/deployment";
import { parseAuditedVersions, parseHelperVersion, type AuditedVersions } from "../scripts/plugin-source";
import { applyBump, bumpFiles, bumpSources, changesDigest, nextHelperPatch, planBump, readBumpSources } from "../scripts/reaudit/bump";
import { renderCurrentVersions, renderPlugin } from "../scripts/render-plugin";
import { FIXTURE_VERSIONS, fixtureConfig, fixtureKeys, writeDeployment } from "../test/fixtures/deployment";

const ROOT = resolve(import.meta.dir, "..");
const PIRAX = loadDeployment({ env: { DEPLOYMENT: "pirax" } });
const PINS = { ...PIRAX.versions.audited };
const HELPER = PIRAX.versions.helperVersion;
const scratch = await mkdtemp(join(tmpdir(), "reaudit-bump-"));
afterAll(() => rm(scratch, { recursive: true, force: true }));

const bumpPatch = (v: string) => v.replace(/\d+$/, (n) => String(Number(n) + 1));
const raise = (pins: AuditedVersions, keys: (keyof AuditedVersions)[]): AuditedVersions =>
  Object.fromEntries(Object.entries(pins).map(([k, v]) => [k, keys.includes(k as keyof AuditedVersions) ? bumpPatch(v) : v])) as AuditedVersions;

let copies = 0;
/** A disposable root: Pirax's data, a second (fixture) deployment, and copies of the shared templates and guide. */
async function copyRoot() {
  const dir = join(scratch, `root-${++copies}`);
  await mkdir(join(dir, "deployments"), { recursive: true });
  await cp(join(ROOT, "deployments/pirax"), join(dir, "deployments/pirax"), { recursive: true });
  writeDeployment(dir, "fixture", { config: fixtureConfig(fixtureKeys().publicKey), versions: FIXTURE_VERSIONS });
  await cp(join(ROOT, "plugin"), join(dir, "plugin"), { recursive: true });
  await cp(join(ROOT, "README.md"), join(dir, "README.md"));
  return dir;
}
const select = (root: string, name = "pirax") => loadDeployment({ root, env: { DEPLOYMENT: name } });
/** Every file under root and its SHA-256. */
async function tree(root: string): Promise<Record<string, string>> {
  const files = (await readdir(root, { recursive: true, withFileTypes: true })).filter((e) => e.isFile());
  return Object.fromEntries(await Promise.all(files.map(async (e) => {
    const path = join(e.parentPath, e.name);
    return [relative(root, path), createHash("sha256").update(await readFile(path)).digest("hex")];
  })));
}
const changed = (a: Record<string, string>, b: Record<string, string>) => [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((p) => a[p] !== b[p]).sort();

test("a bump may write exactly the selected deployment's versions.json", () => {
  expect(bumpFiles(PIRAX)).toEqual(["deployments/pirax/versions.json"]);
  expect(Object.keys(readBumpSources(PIRAX))).toEqual(["deployments/pirax/versions.json"]);
});

test("next helper patch is numeric, not lexical", () => {
  expect(nextHelperPatch("0.3.0")).toBe("0.3.1");
  expect(nextHelperPatch("0.3.9")).toBe("0.3.10");
  expect(nextHelperPatch("1.0.19")).toBe("1.0.20");
  expect(() => nextHelperPatch("0.3.0-beta")).toThrow("helper version");
});

test("a plan needs a changed, non-downgraded matrix and names the next helper patch", () => {
  const next = raise(PINS, ["ff", "cleantalk"]);
  expect(planBump(PINS, next, HELPER)).toEqual({ oldPins: PINS, newPins: next, from: HELPER, to: nextHelperPatch(HELPER) });
  expect(() => planBump(PINS, PINS, HELPER)).toThrow("unchanged");
  expect(() => planBump(next, PINS, HELPER)).toThrow("downgrade");
  expect(() => planBump(PINS, { ...next, extra: "1.0" } as never, HELPER)).toThrow();
});

test("a four-key plan validates and rewrites exactly the listed pins", async () => {
  const { gf: _gf, ...four } = PINS;
  const next = raise(four, ["ff"]);
  const plan = planBump(four, next, HELPER);
  expect(plan).toEqual({ oldPins: four, newPins: next, from: HELPER, to: nextHelperPatch(HELPER) });
  expect(() => planBump(four, { ...next, gf: PINS.gf }, HELPER)).toThrow("bump: gf unknown");
  expect(() => planBump(PINS, next, HELPER)).toThrow("bump: gf missing");
  const dir = await copyRoot();
  const config = { ...fixtureConfig(fixtureKeys().publicKey), audited: ["ff", "ff_pro", "cleantalk", "fluent_smtp"] };
  writeDeployment(dir, "four", { config, versions: { schemaVersion: 1, helperVersion: HELPER, audited: four } });
  const deployment = select(dir, "four");
  const [file, text] = Object.entries(bumpSources(deployment, readBumpSources(deployment), plan))[0]!;
  expect(file).toBe("deployments/four/versions.json");
  expect(JSON.parse(text)).toEqual({ schemaVersion: 1, helperVersion: plan.to, audited: next });
  expect(() => bumpSources(deployment, readBumpSources(deployment), planBump(four, raise(four, ["ff_pro"]), plan.to))).toThrow("helper version");
});

test("two successive bumps write only the selected versions.json: no shared source, guide or other deployment; the build renders them", async () => {
  const dir = await copyRoot();
  const original = await tree(dir);
  const first = raise(PINS, ["ff", "cleantalk"]);
  const plan1 = planBump(PINS, first, HELPER);
  const r1 = await applyBump(select(dir), plan1);
  expect(r1.paths).toEqual(["deployments/pirax/versions.json"]);
  const after1 = await tree(dir);
  expect(changed(original, after1)).toEqual(["deployments/pirax/versions.json"]);
  expect(await readFile(join(dir, "deployments/pirax/versions.json"), "utf8")).toBe(formatVersions({ schemaVersion: 1, helperVersion: plan1.to, audited: first }));

  // Second bump from a fresh snapshot of the first bump's output.
  const second = raise(first, ["gf"]);
  const plan2 = planBump(first, second, plan1.to);
  expect(plan2.to).toBe(nextHelperPatch(plan1.to));
  const r2 = await applyBump(select(dir), plan2);
  expect(r2.digest).not.toBe(r1.digest);
  expect(changed(original, await tree(dir))).toEqual(["deployments/pirax/versions.json"]);
  expect(select(dir).versions).toEqual({ schemaVersion: 1, helperVersion: plan2.to, audited: second });
  expect(select(dir, "fixture").versions).toEqual(FIXTURE_VERSIONS as never);

  // The shared templates render the bumped data: pins, helper version and the guide's current-versions section.
  const files = renderPlugin(select(dir));
  const text = (file: string) => files.find((f) => f.file === file)!.contents;
  expect(parseAuditedVersions(text("includes/compatibility.php"))).toEqual(second);
  expect(parseHelperVersion(text("pirax-form-test.php"))).toBe(plan2.to);
  expect(text("README.md")).toContain(`<!-- pirax:current-versions:start -->\n${renderCurrentVersions(second, plan2.to)}<!-- pirax:current-versions:end -->`);

  // Determinism: an independent copy reconstructs byte-identical data and the same digest.
  const again = await copyRoot();
  expect((await applyBump(select(again), plan1)).digest).toBe(r1.digest);
  expect(changesDigest(bumpSources(PIRAX, readBumpSources(PIRAX), plan1))).toBe(r1.digest);
  expect(r1.digest).toMatch(/^[0-9a-f]{64}$/);
});

test("the digest binds the selected path: the same data in another deployment's folder digests differently", async () => {
  const dir = await copyRoot();
  await cp(join(dir, "deployments/pirax"), join(dir, "deployments/other"), { recursive: true });
  const plan = planBump(PINS, raise(PINS, ["ff"]), HELPER);
  const [pirax, other] = [select(dir), select(dir, "other")];
  const a = bumpSources(pirax, readBumpSources(pirax), plan);
  const b = bumpSources(other, readBumpSources(other), plan);
  expect(Object.values(a)).toEqual(Object.values(b));
  expect(changesDigest(a)).not.toBe(changesDigest(b));
});

test("pins-only rewrite keeps the helper version (the native audit gate runs before the helper bump)", () => {
  const plan = planBump(PINS, raise(PINS, ["fluent_smtp"]), HELPER);
  const out = bumpSources(PIRAX, readBumpSources(PIRAX), plan, { pinsOnly: true });
  expect(out).toEqual({ "deployments/pirax/versions.json": formatVersions({ schemaVersion: 1, helperVersion: HELPER, audited: plan.newPins }) });
});

test("drift, foreign data and noncanonical text refuse the whole bump and write nothing", async () => {
  const plan = planBump(PINS, raise(PINS, ["ff"]), HELPER);
  const canonical = (over: object) => formatVersions({ schemaVersion: 1, helperVersion: HELPER, audited: PINS, ...over } as never);
  const cases: [string, (t: string) => string, RegExp][] = [
    ["pins differ from the plan's old pins", () => canonical({ audited: { ...PINS, gf: bumpPatch(PINS.gf!) } }), /old pins/],
    ["helper version differs", () => canonical({ helperVersion: bumpPatch(HELPER) }), /helper version/],
    ["another deployment's data", () => formatVersions(FIXTURE_VERSIONS as never), /old pins/],
    ["hand-reformatted file", (t) => t.replace(/\n {2}/g, "\n    "), /canonical/],
    ["missing final newline", (t) => t.trimEnd(), /canonical/],
    ["invalid data", (t) => t.replace(`"${PINS.gf}"`, '"3.x"'), /versions\.audited\.gf is invalid/],
  ];
  for (const [label, edit, message] of cases) {
    const dir = await copyRoot();
    // A snapshot taken before the edit: a bump never trusts it and re-reads the file it writes.
    const deployment = select(dir);
    const file = join(dir, "deployments/pirax/versions.json");
    const text = await readFile(file, "utf8");
    const edited = edit(text);
    expect(edited, label).not.toBe(text);
    await writeFile(file, edited);
    const before = await tree(dir);
    await expect(applyBump(deployment, plan), label).rejects.toThrow(message);
    expect(await tree(dir), label).toEqual(before);
  }
});
