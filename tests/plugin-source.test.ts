import { expect, test } from "bun:test";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { PIN_KEYS, parseAuditedVersions, pinKeys, parseHelperVersion, readAuditedVersions, readHelperVersion } from "../scripts/plugin-source";
import { auditedLine, renderPlugin } from "../scripts/render-plugin";
import { DeploymentConfigError, loadDeployment } from "../src/deployment";
import { FIXTURE_VERSIONS, fixtureConfig, fixtureKeys, writeDeployment } from "../test/fixtures/deployment";
import { nearMisses, nextPatch, pinLine, PINS, withHelperVersion } from "../test/plugin/version-fixtures";

const ROOT = resolve(import.meta.dir, "..");
const PIRAX = { env: { DEPLOYMENT: "pirax" } };
const pirax = loadDeployment(PIRAX);
/** The rendered Pirax helper, as its ZIP carries it: the strict parsers read built PHP, never templates. */
const rendered = Object.fromEntries(renderPlugin(pirax).map((f) => [f.path, f.contents]));
const COMPATIBILITY = rendered[`${pirax.config.plugin.slug}/includes/compatibility.php`]!;
const MAIN = rendered[pirax.assets.basename]!;
const STABLE = /^(0|[1-9][0-9]*)(\.(0|[1-9][0-9]*)){1,3}$/;
/** Planted in rejected source text: no error may repeat it. */
const SENTINEL = "pirax-sentinel-7f3a";
/** A credential-shaped unknown key: lowercase and underscores only, so it fits the key pattern itself. */
const KEY_SENTINEL = "sk_live_pirax_sentinel_secret";

const message = (f: () => unknown) => {
  try {
    f();
  } catch (error) {
    return String(error);
  }
  throw new Error("expected a refusal");
};

/** One exact edit (the search must occur once) of rendered text. */
const edited = (text: string, edit: (text: string) => string) => {
  const after = edit(text);
  expect(after).not.toBe(text);
  return after;
};

const line = pinLine;

test("the selected deployment holds exactly the five known pins, and the rendered table carries each once", () => {
  const audited = readAuditedVersions(PIRAX);
  expect(Object.keys(audited)).toEqual([...PIN_KEYS]);
  for (const key of PIN_KEYS) expect(audited[key]).toMatch(STABLE);
  // Each pin line occurs exactly once, so fixture edits of it are unambiguous.
  for (const key of PIN_KEYS) expect(COMPATIBILITY.split(line(key, audited[key])).length).toBe(2);
  expect(parseAuditedVersions(COMPATIBILITY)).toEqual(audited);
});

test("an AUDITED_VERSIONS line pads the quoted key to 14 characters and renders an unlisted key as null", () => {
  expect(auditedLine("gf", "3.1.2")).toBe("\t'gf'          => '3.1.2',");
  expect(auditedLine("fluent_smtp", "2.2.95")).toBe("\t'fluent_smtp' => '2.2.95',");
  expect(auditedLine("ff_pro", undefined)).toBe("\t'ff_pro'      => null,");
  for (const key of PIN_KEYS) expect(line(key)).toBe(auditedLine(key, PINS[key]));
});

test("null lines are unlisted keys: the parser returns only the stable pins, and still needs every known key once", () => {
  const unlisted = edited(COMPATIBILITY, (t) => t.replace(line("gf"), auditedLine("gf", undefined)).replace(line("cleantalk"), auditedLine("cleantalk", undefined)));
  const { gf: _gf, cleantalk: _cleantalk, ...rest } = PINS;
  expect(parseAuditedVersions(unlisted)).toEqual(rest);
  expect(Object.keys(parseAuditedVersions(unlisted))).toEqual(["ff", "ff_pro", "fluent_smtp"]);
  expect(message(() => parseAuditedVersions(unlisted.replace(`${auditedLine("gf", undefined)}\n`, "")))).toMatch(/missing gf$/);
});

test("the rendered helper header and VERSION constant agree with the selected helper version", () => {
  const version = readHelperVersion(PIRAX);
  expect(version).toMatch(STABLE);
  expect(MAIN).toMatch(new RegExp(`^ \\* Version:\\s+${version.replace(/\./g, "\\.")}$`, "m"));
  expect(MAIN).toContain(`const VERSION = '${version}';`);
  expect(parseHelperVersion(MAIN)).toBe(version);
});

test("importing the readers is side-effect free and their default repository does not depend on the working directory", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "plugin-source-cwd-"));
  try {
    const run = async (code: string, env: Record<string, string>) => {
      const proc = Bun.spawn([process.execPath, "--no-env-file", "-e", code], { cwd, env: { PATH: process.env.PATH!, ...env }, stdout: "pipe", stderr: "pipe" });
      const [stdout, stderr, exit] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
      return { stdout, stderr, exit };
    };
    const module = JSON.stringify(join(ROOT, "scripts/plugin-source.ts"));
    expect(await run(`await import(${module})`, {})).toEqual({ stdout: "", stderr: "", exit: 0 });
    const read = await run(`const m = await import(${module}); console.log(JSON.stringify([m.readAuditedVersions(), m.readHelperVersion()]))`, { DEPLOYMENT: "pirax" });
    expect(read.exit).toBe(0);
    expect(JSON.parse(read.stdout)).toEqual([readAuditedVersions(PIRAX), readHelperVersion(PIRAX)]);
    const unselected = await run(`const m = await import(${module}); try { m.readAuditedVersions(); } catch (e) { console.log(e.message); }`, {});
    expect(unselected.stdout).toBe("DEPLOYMENT is not set\n");
    expect(readdirSync(cwd)).toEqual([]);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("malformed, incomplete, duplicate, unknown or nonliteral pins are refused by field, never by value", () => {
  const table = (edit: (text: string) => string) => () => parseAuditedVersions(edit(COMPATIBILITY));
  const cases: Record<string, [() => unknown, RegExp]> = {
    "missing key": [table((t) => t.replace(`${line("fluent_smtp")}\n`, "")), /missing fluent_smtp/],
    "duplicate key": [table((t) => t.replace(`${line("gf")}\n`, `${line("gf")}\n${line("gf")}\n`)), /not a unique/],
    "unknown key": [table((t) => t.replace(`${line("gf")}\n`, `${line("gf")}\n\t'gravity'      => '1.0',\n`)), /has an unknown plugin key$/],
    "credential-shaped unknown key": [table((t) => t.replace(`${line("gf")}\n`, `${line("gf")}\n\t'${KEY_SENTINEL}' => '1.0',\n`)), /has an unknown plugin key$/],
    "nonliteral value": [table((t) => t.replace(line("cleantalk"), "\t'cleantalk'   => CLEANTALK_VERSION,")), /not a unique/],
    "double-quoted value": [table((t) => t.replace(line("ff"), `\t'ff'          => "${PINS.ff}",`)), /not a unique/],
    "concatenated value": [table((t) => t.replace(line("ff"), `\t'ff'          => '${PINS.ff}' . '1',`)), /not a unique/],
    "empty value": [table((t) => t.replace(line("ff_pro"), "\t'ff_pro'      => '',")), /not a unique/],
    "prerelease value": [table((t) => t.replace(line("ff_pro"), `\t'ff_pro'      => '${PINS.ff_pro}-beta',`)), /'ff_pro' is not a stable dotted numeric version/],
    "private text as a value": [table((t) => t.replace(line("gf"), `\t'gf'          => '${SENTINEL}',`)), /'gf' is not a stable dotted numeric version/],
    "comment inside the table": [table((t) => t.replace(`${line("gf")}\n`, `${line("gf")}\n\t// ${SENTINEL}\n`)), /not a unique/],
    "unrendered template token": [table((t) => t.replace(/^const AUDITED_VERSIONS = array\(\n[^]*?\n\);$/m, "const AUDITED_VERSIONS = array(\n{{raw:auditedVersions}}\n);")), /not a unique/],
    "duplicate null key": [table((t) => t.replace(`${line("gf")}\n`, `${line("gf")}\n${auditedLine("gf", undefined)}\n`)), /not a unique/],
    "unknown null key": [table((t) => t.replace(`${line("gf")}\n`, `${line("gf")}\n\t'gravity'      => null,\n`)), /has an unknown plugin key$/],
    "uppercase null": [table((t) => t.replace(line("gf"), "\t'gf'          => NULL,")), /not a unique/],
    "quoted null": [table((t) => t.replace(line("gf"), "\t'gf'          => 'null',")), /'gf' is not a stable dotted numeric version/],
    "no table": [table((t) => t.replace("const AUDITED_VERSIONS = array(", "const AUDITED = array(")), /expected exactly one AUDITED_VERSIONS array, found 0/],
    "two tables": [table((t) => t.replace(/^const AUDITED_VERSIONS = array\([^]*?\n\);$/m, (block) => `${block}\n${block}`)), /expected exactly one AUDITED_VERSIONS array, found 2/],
    "empty source": [() => parseAuditedVersions(""), /found 0/],
  };
  for (const [name, [read, expected]] of Object.entries(cases)) {
    const text = message(read);
    expect({ name, text }).toEqual({ name, text: expect.stringMatching(expected) });
    expect(text).toContain("includes/compatibility.php");
    expect(text).not.toContain(SENTINEL);
    expect(text).not.toContain(KEY_SENTINEL);
  }
});

test("readers read the selected deployment's versions.json afresh on every call and refuse it by field", () => {
  const root = mkdtempSync(join(tmpdir(), "plugin-source-root-"));
  try {
    const directory = writeDeployment(root, "fixture", { config: fixtureConfig(fixtureKeys().publicKey), versions: FIXTURE_VERSIONS });
    const selection = { root, env: { DEPLOYMENT: "fixture" } };
    expect(readAuditedVersions(selection)).toEqual(FIXTURE_VERSIONS.audited);
    expect(readHelperVersion(selection)).toBe(FIXTURE_VERSIONS.helperVersion);
    const bumped = { ...FIXTURE_VERSIONS, helperVersion: nextPatch(FIXTURE_VERSIONS.helperVersion), audited: { ...FIXTURE_VERSIONS.audited, ff: nextPatch(FIXTURE_VERSIONS.audited.ff) } };
    writeFileSync(join(directory, "versions.json"), JSON.stringify(bumped));
    expect(readAuditedVersions(selection)).toEqual(bumped.audited);
    expect(readHelperVersion(selection)).toBe(bumped.helperVersion);
    writeFileSync(join(directory, "versions.json"), JSON.stringify({ ...bumped, audited: { ...bumped.audited, gf: SENTINEL } }));
    const refusal = (() => {
      try {
        readAuditedVersions(selection);
      } catch (error) {
        return error;
      }
    })();
    expect(refusal).toBeInstanceOf(DeploymentConfigError);
    expect(String(refusal)).toBe("DeploymentConfigError: versions.audited.gf is invalid");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("helper version refusals name the field, never the rejected value", () => {
  const helper = readHelperVersion(PIRAX);
  const cases: Record<string, [(t: string) => string, string]> = {
    "header differs from constant": [(t) => t.replace(`const VERSION = '${helper}';`, `const VERSION = '${nextPatch(helper)}';`), "pirax-form-test.php: Version header and VERSION constant differ"],
    prerelease: [withHelperVersion(`${helper}-beta`, helper), "pirax-form-test.php: VERSION is not a stable dotted numeric version"],
    "private text as the version": [withHelperVersion(SENTINEL, helper), "pirax-form-test.php: VERSION is not a stable dotted numeric version"],
    "no constant": [(t) => t.replace(`const VERSION = '${helper}';`, ""), "pirax-form-test.php: expected exactly one VERSION constant, found 0"],
    "two headers": [(t) => t.replace(/^( \* Version:.*)$/m, "$1\n$1"), "pirax-form-test.php: expected exactly one Version header, found 2"],
  };
  for (const [name, [edit, expected]] of Object.entries(cases)) {
    const text = message(() => parseHelperVersion(edited(MAIN, edit)));
    expect({ name, text }).toEqual({ name, text: `Error: ${expected}` });
  }
});

test("helper version fixtures survive two successive patch bumps", () => {
  const first = nextPatch(readHelperVersion(PIRAX));
  const second = nextPatch(first);
  const once = withHelperVersion(first, readHelperVersion(PIRAX))(MAIN);
  expect(parseHelperVersion(once)).toBe(first);
  const bumped = withHelperVersion(second, first)(once);
  expect(parseHelperVersion(bumped)).toBe(second);
  // A fixture that assumes the old version must refuse, not silently leave the text unchanged.
  expect(() => withHelperVersion("9.9.9", first)(bumped)).toThrow(/exactly once/);
});

test("wrong-version fixtures are genuinely different from every pin, now and after two pin bumps", () => {
  for (const listed of pinKeys(PINS).map((key) => PINS[key]!))
    for (const pin of [listed, nextPatch(listed), nextPatch(nextPatch(listed))]) {
      const misses = nearMisses(pin);
      expect(misses).not.toContain(pin);
      expect(new Set(misses).size).toBe(misses.length);
      expect(nextPatch(pin)).not.toBe(pin);
      expect(nextPatch(pin)).toMatch(STABLE);
    }
  // The exact-string edge cases the native matrix keeps (pins 3.1.2 and 6.2.14 as examples).
  expect(nearMisses("3.1.2")).toEqual(expect.arrayContaining(["3.1.3", "3.1.20", "3.1", "3.1.2.1", "3.1.2-beta", "3.2.0"]));
  expect(nearMisses("6.2.14")).toEqual(expect.arrayContaining(["6.2.15", "6.2.1", "6.2", "6.2.14.1", "6.3.0"]));
  expect(nearMisses("6.88")).toEqual(expect.arrayContaining(["6.88.1", "6.89", "6.8", "6.880", "6.88-rc1"]));
  expect(nextPatch("3.1.9")).toBe("3.1.10");
});

test("native plugin tests carry no fixed audited vendor version", () => {
  const dir = join(ROOT, "test/plugin");
  const found: string[] = [];
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".test.ts")))
    for (const [key, pin] of Object.entries(PINS))
      if (new RegExp(`(?<![\\w.])${pin.replace(/\./g, "\\.")}(?![\\w.])`).test(readFileSync(join(dir, file), "utf8"))) found.push(`${file}: ${key} ${pin}`);
  expect(found).toEqual([]);
});
