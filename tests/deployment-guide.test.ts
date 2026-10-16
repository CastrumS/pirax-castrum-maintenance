import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "..");
const readme = readFileSync(join(ROOT, "README.md"), "utf8");

const PATH_PREFIXES = ["deployments/", "scripts/", "src/", "plugin/", "test/", "tests/", ".github/"];
const GENERATED_PREFIXES = ["dist/", "runs/", "artifacts/"];
const NAME_DIRS = ["src/", "scripts/", "test/", "tests/", ".github/"];
const SELF = relative(ROOT, import.meta.path);
// File extensions, plus hostname suffixes so provider hosts such as imap.gmail.com are not read as config fields.
const NON_FIELD_SUFFIXES = new Set(["json", "ts", "tsx", "js", "mjs", "cjs", "md", "yml", "yaml", "txt", "toml", "lock", "sh", "php", "html", "css", "xml", "csv", "svg", "png", "jpg", "zip", "patch", "com", "net", "org", "io", "dev"]);
const DOTTED_FIELD = /^[a-z][A-Za-z]*(\.[a-z][A-Za-z]*)+$/;
const UPPER_NAME = /\b(?:[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+|DEPLOYMENT)\b/g;

const listed = Bun.spawnSync(["git", "ls-files"], { cwd: ROOT });
if (listed.exitCode !== 0) throw new Error(`git ls-files failed: ${listed.stderr.toString()}`);
const TRACKED = listed.stdout.toString().split("\n").filter((file) => file !== "");
const TRACKED_SET = new Set(TRACKED);
const ROOT_FILES = new Set(TRACKED.filter((file) => !file.includes("/")));
const PACKAGE: { scripts: Record<string, string> } = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
const CONFIG: unknown = JSON.parse(readFileSync(join(ROOT, "deployments/pirax/config.json"), "utf8"));
// This test file holds the synthetic invented names, so it is excluded from the name corpus.
const NAME_TEXT = TRACKED.filter((file) => file !== SELF && !file.endsWith(".md") && (file === ".env.example" || NAME_DIRS.some((dir) => file.startsWith(dir))))
  .map((file) => readFileSync(join(ROOT, file), "utf8"))
  .join("\n");

function section(readme: string, heading = "## New deployment"): string {
  const lines = readme.split("\n");
  const start = lines.findIndex((line) => line.trimEnd() === heading);
  if (start === -1) throw new Error(`guide heading not found: ${heading}`);
  const next = lines.findIndex((line, i) => i > start && line.startsWith("## "));
  return lines.slice(start, next === -1 ? undefined : next).join("\n");
}

function codeLines(text: string): { spans: string[]; fenced: string[] } {
  const spans: string[] = [];
  const fenced: string[] = [];
  let inFence = false;
  for (const line of text.split("\n")) {
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
    } else if (inFence) {
      fenced.push(line);
    } else {
      for (const match of line.matchAll(/`([^`]+)`/g)) spans.push(match[1]!);
    }
  }
  return { spans, fenced };
}

function stripEdges(token: string): string {
  return token.replace(/^["'([]+/, "").replace(/[.,;:!?)"'\]]+$/, "");
}

function isTracked(path: string): boolean {
  const dir = path.endsWith("/") ? path : `${path}/`;
  return TRACKED_SET.has(path) || TRACKED.some((file) => file.startsWith(dir));
}

function resolvesInConfig(field: string): boolean {
  let node: unknown = CONFIG;
  for (const key of field.split(".")) {
    if (typeof node !== "object" || node === null || !(key in node)) return false;
    node = node[key as keyof typeof node];
  }
  return true;
}

// Returns the cited name when a path, workflow file token is missing; undefined when it exists or is not checked.
function missingToken(token: string): string | undefined {
  const bare = stripEdges(token.split("#")[0]!).replaceAll("<name>", "pirax");
  if (bare.includes("<") || GENERATED_PREFIXES.some((prefix) => bare.startsWith(prefix))) return undefined;
  if (PATH_PREFIXES.some((prefix) => bare.startsWith(prefix)) || ROOT_FILES.has(bare)) return isTracked(bare) ? undefined : bare;
  if (bare.endsWith(".yml")) {
    const workflow = `.github/workflows/${bare.slice(bare.lastIndexOf("/") + 1)}`;
    return TRACKED_SET.has(workflow) ? undefined : bare;
  }
  return undefined;
}

function missingNames(section: string): string[] {
  const { spans, fenced } = codeLines(section);
  const missing = new Set<string>();
  for (const line of [...spans, ...fenced]) {
    for (const token of line.split(/\s+/)) {
      const problem = missingToken(token);
      if (problem !== undefined) missing.add(problem);
    }
    for (const match of line.matchAll(/\bbun run ([^\s`]+)/g)) {
      const script = stripEdges(match[1]!);
      if (!script.includes("<") && !Object.hasOwn(PACKAGE.scripts, script)) missing.add(`bun run ${script}`);
    }
    for (const name of line.match(UPPER_NAME) ?? []) {
      if (!NAME_TEXT.includes(name)) missing.add(name);
    }
  }
  for (const span of spans) {
    const suffix = span.slice(span.lastIndexOf(".") + 1);
    if (DOTTED_FIELD.test(span) && !NON_FIELD_SUFFIXES.has(suffix) && !resolvesInConfig(span)) missing.add(span);
  }
  return [...missing];
}

test("the New deployment guide cites only names that exist", () => {
  expect(missingNames(section(readme))).toEqual([]);
});

test("missingNames reports every invented name, inline and in fenced blocks", () => {
  const text = [
    "## New deployment",
    "",
    "Inline: `scripts/no-such.ts` `NO_SUCH_SECRET` `bun run no-such` `no-such.yml` `weeklyCheck.nope`.",
    "",
    "```sh",
    "bun run no-such",
    "scripts/no-such.ts NO_SUCH_SECRET no-such.yml",
    "```",
  ].join("\n");
  expect(missingNames(text).sort()).toEqual(
    ["NO_SUCH_SECRET", "bun run no-such", "no-such.yml", "scripts/no-such.ts", "weeklyCheck.nope"].sort(),
  );
});

test("missingNames reports nothing for real names, provider values and placeholders", () => {
  const text = [
    "## New deployment",
    "",
    "Run `scripts/release-plugin.ts` with `deployments/<name>/config.json`, set `FORM_TEST_TOKEN` for `DEPLOYMENT`.",
    "Then `bun run build:plugin`, check `weekly-check.yml`, enable `weeklyCheck.enabled`.",
    "Mail host `imap.gmail.com`, repo `<owner>/<repo>`.",
    "",
    "```sh",
    "bun run build:plugin",
    "```",
  ].join("\n");
  expect(missingNames(text)).toEqual([]);
});

test("section returns the guide up to the next ## heading", () => {
  const text = [
    "# Title",
    "",
    "## Setup",
    "scripts/no-such.ts",
    "",
    "## New deployment",
    "Guide `scripts/release-plugin.ts`",
    "### Step",
    "",
    "## Limits",
    "scripts/no-such.ts",
    "",
  ].join("\n");
  const guide = section(text);
  expect(guide.startsWith("## New deployment")).toBe(true);
  expect(guide).toContain("### Step");
  expect(guide).not.toContain("Limits");
  expect(missingNames(guide)).toEqual([]);
});

test("section throws when the heading is absent", () => {
  expect(() => section("# Title\n\n## Setup\n")).toThrow("## New deployment");
});
