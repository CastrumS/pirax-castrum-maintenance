import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { resolve, join } from "node:path";
import { dispatch, parseArgs, selectSites } from "../src/commands/common.ts";
import { completedRunIds, newestSiteCheck, runApprove } from "../src/commands/approve.ts";
import { loadSites } from "../src/sites.ts";
import { createStore } from "../src/store.ts";

const dir = resolve("runs", `command-tests-${crypto.randomUUID()}`);
mkdirSync(dir, { recursive: true });
afterAll(() => rmSync(dir, { recursive: true, force: true }));
const sitesFile = join(dir, "sites.yaml");
await Bun.write(sitesFile, 'sites:\n  - slug: acme\n    url: https://example.test\n    form_helper: false\n    pages: [/, /about/]\n');
const sites = loadSites(sitesFile);

describe("command preflight without browser or storage", () => {
  test("parses selection, optional sites and approve page; retains list order", () => {
    expect(parseArgs("check", ["--sites", sitesFile, "all"])).toEqual({ target: "all", sitesFile });
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
    expect(await dispatch("check", ["unknown", "--sites", sitesFile], { log })).toBe(2);
    expect(await dispatch("approve", ["acme", "/unlisted", "--sites", sitesFile], { log })).toBe(2);
    const empty = join(dir, "empty.yaml"); await Bun.write(empty, "sites: []\n");
    expect(await dispatch("check", ["all", "--sites", empty], { log })).toBe(0);
    const bad = join(dir, "bad.yaml"); await Bun.write(bad, "sites: [{slug: bad}]\n");
    expect(await dispatch("baseline", ["all", "--sites", bad], { log })).toBe(2);
  });
  test("CLI imports have no credential reads or exits and missing env is sanitized exit 2", () => {
    const common = resolve("src/commands/common.ts");
    const child = (script: string) => Bun.spawnSync([process.execPath, "--no-env-file", "-e", script], { cwd: dir, env: {} });
    const imported = child(`await import(${JSON.stringify(common)}); await import(${JSON.stringify(resolve("src/commands/check.ts"))});`);
    expect(imported.exitCode).toBe(0);
    expect(imported.stdout.toString()).toBe("");
    const missing = child(`const {dispatch} = await import(${JSON.stringify(common)}); process.exitCode = await dispatch("check", ["acme", "--sites", ${JSON.stringify(sitesFile)}]);`);
    expect(missing.exitCode).toBe(2);
    expect(missing.stdout.toString() + missing.stderr.toString()).toContain("S3_ACCESS_KEY_ID");
  });
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
