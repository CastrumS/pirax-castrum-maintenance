import { expect, test } from "bun:test";
import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { PIN_KEYS, parseAuditedVersions, readAuditedVersions, readHelperVersion } from "../scripts/plugin-source";
import { nearMisses, nextPatch, pinLine, PINS, withHelperVersion } from "../test/plugin/version-fixtures";

const ROOT = resolve(import.meta.dir, "..");
const SOURCE = join(ROOT, "plugin/pirax-form-test");
const COMPATIBILITY = readFileSync(join(SOURCE, "includes/compatibility.php"), "utf8");
const MAIN = readFileSync(join(SOURCE, "pirax-form-test.php"), "utf8");
const STABLE = /^(0|[1-9][0-9]*)(\.(0|[1-9][0-9]*)){1,3}$/;
/** Planted in rejected source text: no error may repeat it. */
const SENTINEL = "pirax-sentinel-7f3a";
/** A credential-shaped unknown key: lowercase and underscores only, so it fits the key pattern itself. */
const KEY_SENTINEL = "sk_live_pirax_sentinel_secret";

/** A copy of the shipping source with file edits, removed after body. */
function withSource(edits: Record<string, (text: string) => string>, body: (dir: string) => void) {
  const dir = mkdtempSync(join(tmpdir(), "plugin-source-test-"));
  try {
    cpSync(SOURCE, dir, { recursive: true });
    for (const [file, edit] of Object.entries(edits)) {
      const before = readFileSync(join(dir, file), "utf8");
      const after = edit(before);
      expect(after).not.toBe(before);
      writeFileSync(join(dir, file), after);
    }
    body(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const message = (f: () => unknown) => {
  try {
    f();
  } catch (error) {
    return String(error);
  }
  throw new Error("expected a refusal");
};

const line = pinLine;

test("the shipping table holds exactly the five known pins as stable numeric versions", () => {
  const audited = readAuditedVersions();
  expect(Object.keys(audited).sort()).toEqual([...PIN_KEYS].sort());
  for (const key of PIN_KEYS) expect(audited[key]).toMatch(STABLE);
  // Each pin line occurs exactly once, so fixture edits of it are unambiguous.
  for (const key of PIN_KEYS) expect(COMPATIBILITY.split(line(key)).length).toBe(2);
  expect(parseAuditedVersions(COMPATIBILITY)).toEqual(audited);
});

test("the shipping helper header and VERSION constant agree with the reader", () => {
  const version = readHelperVersion();
  expect(version).toMatch(STABLE);
  expect(MAIN).toMatch(new RegExp(`^ \\* Version:\\s+${version.replace(/\./g, "\\.")}$`, "m"));
  expect(MAIN).toContain(`const VERSION = '${version}';`);
});

test("importing the reader is side-effect free and its default source does not depend on the working directory", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "plugin-source-cwd-"));
  try {
    const run = async (code: string) => {
      const proc = Bun.spawn([process.execPath, "--no-env-file", "-e", code], { cwd, stdout: "pipe", stderr: "pipe" });
      const [stdout, stderr, exit] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
      return { stdout, stderr, exit };
    };
    const module = JSON.stringify(join(ROOT, "scripts/plugin-source.ts"));
    expect(await run(`await import(${module})`)).toEqual({ stdout: "", stderr: "", exit: 0 });
    const read = await run(`const m = await import(${module}); console.log(JSON.stringify([m.readAuditedVersions(), m.readHelperVersion()]))`);
    expect(read.exit).toBe(0);
    expect(JSON.parse(read.stdout)).toEqual([readAuditedVersions(), readHelperVersion()]);
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

test("readAuditedVersions reads the given source directory", () => {
  withSource({ "includes/compatibility.php": (t) => t.replace(line("ff"), `\t'ff'          => '${nextPatch(PINS.ff)}',`) }, (dir) => {
    expect(readAuditedVersions(dir)).toEqual({ ...PINS, ff: nextPatch(PINS.ff) });
  });
  withSource({ "includes/compatibility.php": (t) => t.replace(`${line("gf")}\n`, "") }, (dir) => {
    expect(() => readAuditedVersions(dir)).toThrow("includes/compatibility.php: AUDITED_VERSIONS is missing gf");
  });
});

test("helper version refusals name the field, never the rejected value", () => {
  const helper = readHelperVersion();
  const cases: Record<string, [Record<string, (t: string) => string>, string]> = {
    "header differs from constant": [{ "pirax-form-test.php": (t) => t.replace(`const VERSION = '${helper}';`, `const VERSION = '${nextPatch(helper)}';`) }, "pirax-form-test.php: Version header and VERSION constant differ"],
    prerelease: [{ "pirax-form-test.php": withHelperVersion(`${helper}-beta`) }, "pirax-form-test.php: VERSION is not a stable dotted numeric version"],
    "private text as the version": [{ "pirax-form-test.php": withHelperVersion(SENTINEL) }, "pirax-form-test.php: VERSION is not a stable dotted numeric version"],
    "no constant": [{ "pirax-form-test.php": (t) => t.replace(`const VERSION = '${helper}';`, "") }, "pirax-form-test.php: expected exactly one VERSION constant, found 0"],
    "two headers": [{ "pirax-form-test.php": (t) => t.replace(/^( \* Version:.*)$/m, "$1\n$1") }, "pirax-form-test.php: expected exactly one Version header, found 2"],
  };
  for (const [name, [edits, expected]] of Object.entries(cases))
    withSource(edits, (dir) => {
      const text = message(() => readHelperVersion(dir));
      expect({ name, text }).toEqual({ name, text: `Error: ${expected}` });
    });
});

test("helper version fixtures survive two successive patch bumps", () => {
  const first = nextPatch(readHelperVersion());
  const second = nextPatch(first);
  withSource({ "pirax-form-test.php": withHelperVersion(first) }, (dir) => {
    expect(readHelperVersion(dir)).toBe(first);
    const bumped = withHelperVersion(second, first)(readFileSync(join(dir, "pirax-form-test.php"), "utf8"));
    writeFileSync(join(dir, "pirax-form-test.php"), bumped);
    expect(readHelperVersion(dir)).toBe(second);
    // A fixture that assumes the old version must refuse, not silently leave the file unchanged.
    expect(() => withHelperVersion("9.9.9", first)(bumped)).toThrow(/exactly once/);
  });
});

test("wrong-version fixtures are genuinely different from every pin, now and after two pin bumps", () => {
  for (const key of PIN_KEYS)
    for (const pin of [PINS[key], nextPatch(PINS[key]), nextPatch(nextPatch(PINS[key]))]) {
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
