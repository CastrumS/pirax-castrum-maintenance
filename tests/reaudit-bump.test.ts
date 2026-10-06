// Deterministic audited-change reconstruction (plan D7/D11): only the unique AUDITED_VERSIONS lines, the paired
// helper header/VERSION and the marked current-version section of the plugin guide change. Synthetic pins only;
// the checked-in baseline is read, never edited.
import { afterAll, expect, test } from "bun:test";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { applyBump, BUMP_FILES, bumpSources, changesDigest, nextHelperPatch, planBump, readBumpSources, renderCurrentVersions } from "../scripts/reaudit/bump";
import { readAuditedVersions, readHelperVersion, type AuditedVersions } from "../scripts/plugin-source";

const ROOT = resolve(import.meta.dir, "..");
const PINS = readAuditedVersions();
const HELPER = readHelperVersion();
const scratch = await mkdtemp(join(tmpdir(), "reaudit-bump-"));
afterAll(() => rm(scratch, { recursive: true, force: true }));

const bumpPatch = (v: string) => v.replace(/\d+$/, (n) => String(Number(n) + 1));
const raise = (pins: AuditedVersions, keys: (keyof AuditedVersions)[]): AuditedVersions =>
  Object.fromEntries(Object.entries(pins).map(([k, v]) => [k, keys.includes(k as keyof AuditedVersions) ? bumpPatch(v) : v])) as AuditedVersions;

let copies = 0;
/** A disposable root holding only the three allowlisted files, copied from this checkout. */
async function copyRoot() {
  const dir = join(scratch, `root-${++copies}`);
  for (const file of BUMP_FILES) {
    await mkdir(dirname(join(dir, file)), { recursive: true });
    await cp(join(ROOT, file), join(dir, file));
  }
  return dir;
}
const read = async (dir: string) => Object.fromEntries(await Promise.all(BUMP_FILES.map(async (f) => [f, await readFile(join(dir, f), "utf8")])));
/** Lines that differ between two texts of equal line count (the bump never adds or removes lines outside the section). */
const changedLines = (a: string, b: string) => {
  const [x, y] = [a.split("\n"), b.split("\n")];
  expect(x.length).toBe(y.length);
  return x.flatMap((line, i) => (line === y[i] ? [] : [[line, y[i]]]));
};

test("the checked-in plugin guide's marked section is exactly the rendering of the current pins and helper version (no drift)", async () => {
  const guide = await readFile(join(ROOT, "plugin/pirax-form-test/README.md"), "utf8");
  const section = guide.split("<!-- pirax:current-versions:start -->\n")[1]!.split("<!-- pirax:current-versions:end -->")[0];
  expect(section).toBe(renderCurrentVersions(PINS, HELPER));
  for (const key of Object.keys(PINS) as (keyof AuditedVersions)[]) expect(section).toContain(`| ${PINS[key]} |`);
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

test("two successive bumps edit only the allowlisted lines, keep historical prose and are deterministic", async () => {
  const dir = await copyRoot();
  const original = await read(dir);
  const first = raise(PINS, ["ff", "cleantalk"]);
  const plan1 = planBump(PINS, first, HELPER);
  const r1 = await applyBump(dir, plan1);
  const after1 = await read(dir);
  expect(r1.paths).toEqual([...BUMP_FILES]);
  expect(readAuditedVersions(join(dir, "plugin/pirax-form-test"))).toEqual(first);
  expect(readHelperVersion(join(dir, "plugin/pirax-form-test"))).toBe(plan1.to);

  const compat = changedLines(original[BUMP_FILES[0]]!, after1[BUMP_FILES[0]]!);
  expect(compat.map(([a]) => a!.trim().slice(0, 12))).toEqual(["'ff'        ", "'cleantalk' "]);
  const main = changedLines(original[BUMP_FILES[1]]!, after1[BUMP_FILES[1]]!);
  expect(main).toEqual([
    [` * Version:           ${HELPER}`, ` * Version:           ${plan1.to}`],
    [`const VERSION = '${HELPER}';`, `const VERSION = '${plan1.to}';`],
  ]);
  // Only the marked section of the guide changes; historical callback evidence keeps the hand-audited versions.
  const [before, , afterSection] = original[BUMP_FILES[2]]!.split(/<!-- pirax:current-versions:(?:start|end) -->/);
  const [before1, section1, afterSection1] = after1[BUMP_FILES[2]]!.split(/<!-- pirax:current-versions:(?:start|end) -->/);
  expect(before1).toBe(before!);
  expect(afterSection1).toBe(afterSection!);
  expect(section1).toBe(`\n${renderCurrentVersions(first, plan1.to)}`);
  expect(afterSection1).toContain("| CleanTalk 6.88 |");
  expect(afterSection1).toContain("FF Pro 6.2.15");

  // Second bump from the first bump's output.
  const second = raise(first, ["gf"]);
  const plan2 = planBump(first, second, plan1.to);
  expect(plan2.to).toBe(nextHelperPatch(plan1.to));
  const r2 = await applyBump(dir, plan2);
  expect(readAuditedVersions(join(dir, "plugin/pirax-form-test"))).toEqual(second);
  expect(readHelperVersion(join(dir, "plugin/pirax-form-test"))).toBe(plan2.to);
  expect(r2.digest).not.toBe(r1.digest);

  // Determinism: an independent copy reconstructs byte-identical files and the same digest.
  const again = await copyRoot();
  expect((await applyBump(again, plan1)).digest).toBe(r1.digest);
  expect(changesDigest(bumpSources(readBumpSources(ROOT), plan1))).toBe(r1.digest);
  expect(r1.digest).toMatch(/^[0-9a-f]{64}$/);
});

test("pins-only rewrite changes compatibility.php alone (the native audit gate runs before the helper bump)", async () => {
  const sources = readBumpSources(ROOT);
  const plan = planBump(PINS, raise(PINS, ["fluent_smtp"]), HELPER);
  const out = bumpSources(sources, plan, { pinsOnly: true });
  expect(out[BUMP_FILES[1]]).toBe(sources[BUMP_FILES[1]]);
  expect(out[BUMP_FILES[2]]).toBe(sources[BUMP_FILES[2]]);
  expect(changedLines(sources[BUMP_FILES[0]]!, out[BUMP_FILES[0]]!)).toHaveLength(1);
});

test("drift and ambiguity refuse the whole bump and write nothing", async () => {
  const plan = planBump(PINS, raise(PINS, ["ff"]), HELPER);
  const cases: [string, string, (t: string) => string, RegExp][] = [
    ["hand-edited section", BUMP_FILES[2], (t) => t.replace("| Gravity Forms |", "| Gravity  Forms |"), /current-versions section/],
    ["duplicated section", BUMP_FILES[2], (t) => `${t}\n<!-- pirax:current-versions:start -->\n<!-- pirax:current-versions:end -->\n`, /current-versions/],
    ["missing section", BUMP_FILES[2], (t) => t.replace("<!-- pirax:current-versions:end -->", ""), /current-versions/],
    ["pins differ from the plan's old pins", BUMP_FILES[0], (t) => t.replace(`=> '${PINS.gf}',`, `=> '${bumpPatch(PINS.gf)}',`), /old pins/],
    ["duplicated pin table", BUMP_FILES[0], (t) => `${t}\n${t.match(/^const AUDITED_VERSIONS = array\(\n[^]*?\n\);$/m)![0]}\n`, /AUDITED_VERSIONS/],
    ["helper header drift", BUMP_FILES[1], (t) => t.replace(/^( \* Version:\s+).*$/m, "$19.9.9"), /Version header/],
    ["duplicated VERSION constant", BUMP_FILES[1], (t) => `${t}\nconst VERSION = '${HELPER}';\n`, /VERSION/],
  ];
  for (const [label, file, edit, message] of cases) {
    const dir = await copyRoot();
    const text = await readFile(join(dir, file), "utf8");
    const edited = edit(text);
    expect(edited, label).not.toBe(text);
    await writeFile(join(dir, file), edited);
    const before = await read(dir);
    await expect(applyBump(dir, plan), label).rejects.toThrow(message);
    expect(await read(dir), label).toEqual(before);
  }
});
