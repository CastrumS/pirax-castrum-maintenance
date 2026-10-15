import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { resolve, join } from "node:path";
import { dispatch, parseArgs, runCommand, selectSites } from "../src/commands/common.ts";
import { completedRunIds, newestSiteCheck, runApprove } from "../src/commands/approve.ts";
import { loadSites } from "../src/sites.ts";
import { loadDeployment } from "../src/deployment.ts";
import { createStore } from "../src/store.ts";
import { fixtureConfig, fixtureKeys, FIXTURE_VERSIONS, writeDeployment } from "../test/fixtures/deployment.ts";

const dir = resolve("runs", `command-tests-${crypto.randomUUID()}`);
mkdirSync(dir, { recursive: true });
afterAll(() => rmSync(dir, { recursive: true, force: true }));
const sitesFile = join(dir, "sites.yaml");
await Bun.write(sitesFile, 'sites:\n  - slug: acme\n    url: https://example.test\n    form_helper: false\n    pages: [/, /about/]\n');
const sites = loadSites(sitesFile);
// Explicit selections: the repository's Pirax deployment, or a fixture deployment in a disposable root.
const pirax = { env: { DEPLOYMENT: "pirax" } };
const fixtureRoot = join(dir, "fixture-root");
const fixture = { root: fixtureRoot, env: { DEPLOYMENT: "fixture" } };
writeDeployment(fixtureRoot, "fixture", { config: fixtureConfig(fixtureKeys().publicKey), versions: FIXTURE_VERSIONS });

describe("command preflight without browser or storage", () => {
  test("parses selection, optional sites and approve page; retains list order", () => {
    expect(parseArgs("check", ["--sites", sitesFile, "all"])).toEqual({ target: "all", sitesFile });
    expect(parseArgs("forms", ["all", "--sites", sitesFile])).toEqual({ target: "all", sitesFile });
    expect(parseArgs("approve", ["acme", "/about/", "--sites", sitesFile])).toEqual({ target: "acme", pagePath: "/about/", sitesFile });
    expect(selectSites(sites, "all")).toEqual(sites);
    expect(selectSites([], "all")).toEqual([]);
    expect(() => selectSites(sites, "unknown")).toThrow();
  });
  test("rejects missing, extra, unsupported flags and approve all", () => {
    for (const args of [[], ["all", "extra"], ["all", "--wrong"], ["all", "--sites"], ["all", "--sites", "a", "--sites", "b"]]) expect(() => parseArgs("check", args)).toThrow();
    expect(() => parseArgs("approve", ["all"])).toThrow();
  });
  test("exit 2 for configuration before work; empty all is zero with no credentials", async () => {
    const logs: string[] = [];
    const log = (s: string) => logs.push(s);
    expect(await dispatch("check", ["unknown", "--sites", sitesFile], { log, selection: pirax })).toBe(2);
    expect(await dispatch("approve", ["acme", "/unlisted", "--sites", sitesFile], { log, selection: pirax })).toBe(2);
    const empty = join(dir, "empty.yaml"); await Bun.write(empty, "sites: []\n");
    expect(await dispatch("check", ["all", "--sites", empty], { log, selection: pirax })).toBe(0);
    expect(await dispatch("forms", ["all", "--sites", empty], { log, selection: pirax })).toBe(0);
    expect(await dispatch("forms", ["acme", "extra", "--sites", sitesFile], { log, selection: pirax })).toBe(2);
    const bad = join(dir, "bad.yaml"); await Bun.write(bad, "sites: [{slug: bad}]\n");
    expect(await dispatch("baseline", ["all", "--sites", bad], { log, selection: pirax })).toBe(2);
  });
  test("runCommand returns the exit code: empty selection is zero, unknown slug is two", async () => {
    const empty = join(dir, "run-empty.yaml"); await Bun.write(empty, "sites: []\n");
    expect(await runCommand("check", ["all", "--sites", empty], { selection: pirax })).toEqual({ exitCode: 0 });
    expect(await runCommand("check", ["unknown", "--sites", sitesFile], { log: () => {}, selection: pirax })).toEqual({ exitCode: 2 });
  });
  test("valid argv needs a valid deployment even with --sites or an empty list; exit 2 names the field only", async () => {
    const empty = join(dir, "selection-empty.yaml"); await Bun.write(empty, "sites: []\n");
    const broken = join(dir, "broken-root");
    writeDeployment(broken, "broken", { config: { ...fixtureConfig(fixtureKeys().publicKey), forms: { refusalPrefix: "Blocked:", text: "<b>secret-filler</b>", message: "Message" } }, versions: FIXTURE_VERSIONS });
    const cases: [Record<string, string | undefined>, string, string?][] = [
      [{}, "DEPLOYMENT is not set"], [{ DEPLOYMENT: "" }, "DEPLOYMENT is not set"],
      [{ DEPLOYMENT: "Not_A_Name" }, "DEPLOYMENT is not a valid deployment name"], [{ DEPLOYMENT: "absent" }, "DEPLOYMENT names no deployment folder"],
      [{ DEPLOYMENT: "broken" }, "config.forms.text is invalid", broken],
    ];
    for (const [env, message, root] of cases) for (const [command, args] of [["check", ["all", "--sites", empty]], ["forms", ["all"]], ["baseline", ["acme", "--sites", sitesFile]], ["approve", ["acme", "--sites", sitesFile]]] as const) {
      const logs: string[] = [];
      expect(await dispatch(command, [...args], { log: (s) => logs.push(s), selection: { root: root ?? fixtureRoot, env } })).toBe(2);
      expect(logs).toEqual([`${command}: ${message}`]);
    }
  });
  test("usage errors precede selection; the default site list is the selected deployment's", async () => {
    const logs: string[] = [];
    expect(await dispatch("check", [], { log: (s) => logs.push(s), selection: { env: {} } })).toBe(2);
    expect(logs[0]).toContain("usage: check");
    expect(await dispatch("check", ["all"], { log: (s) => logs.push(s), selection: fixture })).toBe(0);
    expect(logs.at(-1)).toBe("No sites selected.");
    expect(await dispatch("check", ["stolarijabanek"], { log: (s) => logs.push(s), selection: fixture })).toBe(2);
    expect(logs.at(-1)).toBe("check: unknown site slug");
  });
  test("CLI imports have no credential or deployment reads or exits and missing env is sanitized exit 2", () => {
    const common = resolve("src/commands/common.ts");
    const child = (script: string, env: Record<string, string> = { DEPLOYMENT: "pirax" }) => Bun.spawnSync([process.execPath, "--no-env-file", "-e", script], { cwd: dir, env });
    const imported = child(`await import(${JSON.stringify(common)}); await import(${JSON.stringify(resolve("src/commands/check.ts"))}); await import(${JSON.stringify(resolve("src/forms/runner.ts"))});`, {});
    expect(imported.exitCode).toBe(0);
    expect(imported.stdout.toString() + imported.stderr.toString()).toBe("");
    const missing = child(`const {dispatch} = await import(${JSON.stringify(common)}); process.exitCode = await dispatch("check", ["acme", "--sites", ${JSON.stringify(sitesFile)}]);`);
    expect(missing.exitCode).toBe(2);
    expect(missing.stdout.toString() + missing.stderr.toString()).toContain("S3_ACCESS_KEY_ID");
  });
});

describe("root forms alias", () => {
  const child = (args: string[], env: Record<string, string> = { DEPLOYMENT: 'pirax' }) => Bun.spawnSync([process.execPath, '--no-env-file', 'run', 'forms', ...args], { cwd: resolve('.'), env: { PATH: process.env.PATH!, ...env } });
  // Independent process contracts get independent default budgets, not one cumulative timeout.
  test("invokes production entrypoint; empty selection needs no credentials or writes", async () => {
    const pkg = await Bun.file(resolve('package.json')).json();
    expect(pkg.scripts.forms).toBe('bun src/commands/forms.ts');
    const empty = join(dir, 'root-empty.yaml'); await Bun.write(empty, 'sites: []\n');
    const ok = child(['all', '--sites', empty]);
    expect(ok.exitCode).toBe(0); expect(ok.stdout.toString()).toContain('No sites selected.');
  });
  test("usage needs no credentials or writes", () => {
    const usage = child([], {});
    expect(usage.exitCode).toBe(2); expect(usage.stdout.toString()).toContain('usage: forms');
  });
  test("empty selection still refuses missing deployment", async () => {
    const empty = join(dir, 'root-unselected-empty.yaml'); await Bun.write(empty, 'sites: []\n');
    // Empty, not absent: the package script's inner bun may load an env file, which never overrides a set variable.
    const unselected = child(['all', '--sites', empty], { DEPLOYMENT: '' });
    expect(unselected.exitCode).toBe(2); expect(unselected.stdout.toString()).toBe('forms: DEPLOYMENT is not set\n');
  });
  test("direct empty run needs no credentials or writes", async () => {
    const { runForms } = await import('../src/commands/forms.ts');
    expect(await runForms([], createStore(), { forms: { texts: loadDeployment(pirax).config.forms } })).toEqual({ exitCode: 0 });
  });
});

test("direct forms/check errors sanitize trusted messages and classify config as exit 2", async () => {
  const common = resolve('src/commands/common.ts');
  const forms = resolve('src/commands/forms.ts'), check = resolve('src/commands/check.ts');
  const secret = 'private-command-token-1234';
  const code = `const { safeError, UsageError } = await import(${JSON.stringify(common)}); if (safeError(new UsageError(process.env.FORM_TEST_TOKEN)).includes(process.env.FORM_TEST_TOKEN)) process.exit(9); const {createStore} = await import(${JSON.stringify(resolve('src/store.ts'))}); const {runForms} = await import(${JSON.stringify(forms)}); const {runCheck} = await import(${JSON.stringify(check)}); const sites = ${JSON.stringify(sites)}; for (const run of [runForms,runCheck]) { const result = await run(sites, createStore(), {runId: process.env.FORM_TEST_TOKEN}); if (result.exitCode !== 2) process.exit(8); }`;
  const child = Bun.spawnSync([process.execPath, '--no-env-file', '-e', code], { cwd: dir, env: { FORM_TEST_TOKEN: secret } });
  expect(child.exitCode).toBe(0);
  expect(child.stdout.toString() + child.stderr.toString()).not.toContain(secret);
});

test("only canonical completed run IDs qualify, in descending order", () => {
  expect(completedRunIds(["reports/2026-09-25T12-00-00.000Z/manifest.json", "reports/2026-09-25T13-00-00.000Z/actual/a.png", "reports/2026-09-25T11-00-00.000Z/manifest.json", "reports/yesterday/manifest.json", "reports/2026-09-25T12-00-00.000Z/nested/manifest.json"])).toEqual(["2026-09-25T12-00-00.000Z", "2026-09-25T11-00-00.000Z"]);
});

test("latest containing site is selected, incomplete/unrelated evidence never replaces it", async () => {
  // Pure manifest-selection seam, not a storage/auth acceptance test.
  const ids = ["2026-09-25T13-00-00.000Z", "2026-09-25T12-00-00.000Z"];
  const read = async (id: string) => ({ schemaVersion: 1, command: "check", report: { runId: id, sites: id === ids[0] ? [] : [{ slug: "acme", url: "https://example.test", pages: [] }] } });
  // Empty site page lists are malformed, and must not be treated as an older usable run.
  await expect(newestSiteCheck(ids, "acme", read)).rejects.toThrow(/manifest/);
  await expect(newestSiteCheck([ids[0]!], "acme", read)).rejects.toThrow(/completed check/);
});

test("latest valid containing site wins over unrelated newer history without falling back from blocked pages", async () => {
  const v = (name: "desktop" | "mobile", slug: string) => ({ viewport: name, capture: { state: "captured", detail: null }, visual: { state: "same", detail: null, actual: { width: name === "desktop" ? 1440 : 390, height: 2 }, baseline: null, ratio: 0, allowance: 0.01 }, health: [], warnings: [], artifacts: { actualPng: `actual/${slug}/${name}/home.png`, actualHealth: `actual/${slug}/${name}/home.health.json` } });
  const make = (id: string, slug: string) => ({ schemaVersion: 1, command: "check", report: { runId: id, sites: [{ slug, url: "https://example.test", pages: [{ path: "/", pageKey: "home", viewports: { desktop: v("desktop", slug), mobile: v("mobile", slug) } }] }] } });
  const newest = "2026-09-25T14-00-00.000Z", relevant = "2026-09-25T13-00-00.000Z", older = "2026-09-25T12-00-00.000Z";
  const reads: string[] = [];
  const selected = await newestSiteCheck([older, relevant, newest], "acme", async id => { reads.push(id); return make(id, id === newest ? "other" : "acme"); });
  expect(selected.report.runId).toBe(relevant);
  expect(reads).toEqual([newest, relevant]);
  const { validateApproval } = await import("../src/report/manifest.ts");
  selected.report.sites[0]!.pages[0]!.viewports.mobile.capture.state = "blocked";
  expect(() => validateApproval(selected, sites[0]!, "/")).toThrow(/complete/);
  // A missing current page fails whole-site approval; an explicit complete current page can be selected.
  selected.report.sites[0]!.pages[0]!.viewports.mobile.capture.state = "captured";
  expect(() => validateApproval(selected, sites[0]!)).toThrow(/page/);
  expect(validateApproval(selected, sites[0]!, "/")).toHaveLength(1);
  expect(() => validateApproval(selected, sites[0]!, "/absent")).toThrow(/current site list/);
});


test("direct approval rejects an unlisted page before touching its real lazy Store", async () => {
  const messages: string[] = [];
  const result = await runApprove(sites[0]!, createStore(), { pagePath: "/unlisted", log: message => messages.push(message) });
  expect(result.exitCode).toBe(2);
  expect(messages.join("\n")).toContain("no baselines written");
});

test("newer valid forms-only runs are skipped; a malformed newer forms manifest is still an error", async () => {
  const v = (name: "desktop" | "mobile") => ({ viewport: name, capture: { state: "captured", detail: null }, visual: { state: "same", detail: null, actual: { width: name === "desktop" ? 1440 : 390, height: 2 }, baseline: null, ratio: 0, allowance: 0.01 }, health: [], warnings: [], artifacts: { actualPng: `actual/acme/${name}/home.png`, actualHealth: `actual/acme/${name}/home.health.json` } });
  const check = (id: string) => ({ schemaVersion: 1, command: "check", report: { runId: id, sites: [{ slug: "acme", url: "https://example.test", pages: [{ path: "/", pageKey: "home", viewports: { desktop: v("desktop"), mobile: v("mobile") } }] }] } });
  const forms = (id: string) => ({ schemaVersion: 1, command: "forms", report: { mode: "forms", runId: id, sites: [{ slug: "acme", url: "https://example.test", pages: [{ path: "/", pageKey: "home", forms: [{ selector: "#gform_1", plugin: "gravity", outcome: "failed", detail: "timeout" }] }] }] } });
  const newest = "2026-09-25T14-00-00.000Z", checkId = "2026-09-25T13-00-00.000Z";
  const reads: string[] = [];
  const selected = await newestSiteCheck([checkId, newest], "acme", async id => { reads.push(id); return id === newest ? forms(id) : check(id); });
  expect(selected.report.runId).toBe(checkId);
  expect(reads).toEqual([newest, checkId]);
  const malformed = forms(newest) as { report: Record<string, unknown> };
  delete malformed.report.mode;
  await expect(newestSiteCheck([checkId, newest], "acme", async id => id === newest ? malformed : check(id))).rejects.toThrow(/manifest/);
  await expect(newestSiteCheck([newest], "acme", async id => forms(id))).rejects.toThrow(/no completed check/);
});

test("baseline/check entrypoints finish after the lazy command import instead of deadlocking", () => {
  const unreachable = join(dir, "unreachable.yaml");
  require("node:fs").writeFileSync(unreachable, 'sites:\n  - slug: down\n    url: http://127.0.0.1:9\n    form_helper: false\n    pages: [/]\n');
  const env = { PATH: process.env.PATH!, HOME: process.env.HOME!, DEPLOYMENT: "pirax", S3_ACCESS_KEY_ID: "id", S3_SECRET_ACCESS_KEY: "secret", S3_ENDPOINT: "http://127.0.0.1:9", S3_BUCKET: "bucket" };
  for (const command of ["baseline", "check"]) {
    const child = Bun.spawnSync([process.execPath, "--no-env-file", "run", command, "down", "--sites", unreachable], { cwd: resolve("."), env, timeout: 90_000 });
    const out = child.stdout.toString();
    for (const [, runDir] of out.matchAll(/artifacts: (\S+)/g)) rmSync(runDir!, { recursive: true, force: true });
    expect(child.exitedDueToTimeout).toBeFalsy();
    expect(child.exitCode).toBe(1);
    expect(out).toContain("down / desktop");
  }
}, 120_000);
