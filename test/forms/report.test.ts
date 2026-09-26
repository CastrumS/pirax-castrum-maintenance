import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";
import { runApprove } from "../../src/commands/approve.ts";
import { renderHtml, reportStatus } from "../../src/report/html.ts";
import { parseManifest, parsePublishedManifest } from "../../src/report/manifest.ts";
import type { FormResult, FormsRunReport, Manifest } from "../../src/report/model.ts";
import { publishReport, reportAssets, saveArtifact, writeLocalReport } from "../../src/report/writer.ts";
import { createStore, type Store } from "../../src/store.ts";
import { PNG } from "pngjs";
import type { RunReport, ViewportResult } from "../../src/report/model.ts";
import type { Site } from "../../src/sites.ts";

// Local check fixture: importing tests/report.test.ts would re-register its tests here.
const site: Site = { slug: "acme", url: "https://example.test", form_helper: true, mask: [], max_diff_pixel_ratio: 0.01, pages: [{ path: "/", mask: [] }] };
const png = (width = 1440) => PNG.sync.write(new PNG({ width, height: 2 }));
const health = new TextEncoder().encode(JSON.stringify({ status: 200, finalUrl: "https://example.test/", criticalError: false, consoleErrors: [], failedRequests: [], mixedContent: [] }));
function fixture(): RunReport {
  const viewport = (name: "desktop" | "mobile"): ViewportResult => ({
    viewport: name, capture: { state: "captured", detail: null },
    visual: { state: "same", detail: null, baseline: null, actual: { width: name === "desktop" ? 1440 : 390, height: 2 }, ratio: 0, allowance: 0.01 },
    health: [], warnings: [], artifacts: { actualPng: `actual/acme/${name}/home.png`, actualHealth: `actual/acme/${name}/home.health.json` },
  });
  return { runId: "2026-09-25T12-00-00.000Z", sites: [{ slug: "acme", url: "https://example.test", pages: [{ path: "/", pageKey: "home", viewports: { desktop: viewport("desktop"), mobile: viewport("mobile") } }] }] };
}

const runId = () => new Date(Date.now() + Math.floor(Math.random() * 1000)).toISOString().replaceAll(":", "-");
const form = (outcome: FormResult["outcome"], detail = "detail"): FormResult => ({ selector: "#gform_1", plugin: "gravity", outcome, detail });
function formsReport(forms: FormResult[] = [form("delivered")], id = "2026-09-25T13-00-00.000Z"): FormsRunReport {
  return { mode: "forms", runId: id, sites: [{ slug: "acme", url: "https://example.test", pages: [{ path: "/", pageKey: "home", forms }, { path: "/about/", pageKey: "about", forms: [] }] }] };
}
const envelope = (report = formsReport()) => ({ schemaVersion: 1, command: "forms", report });

describe("forms-only manifest", () => {
  test("parsePublishedManifest returns either validated mode; parseManifest stays check-only", () => {
    expect(parsePublishedManifest(envelope(), "2026-09-25T13-00-00.000Z")).toEqual(envelope() as never);
    const check: Manifest = { schemaVersion: 1, command: "check", report: fixture() };
    expect(parsePublishedManifest(check)).toEqual(check);
    expect(() => parseManifest(envelope())).toThrow(/check manifest/);
  });
  test("rejects fabricated viewports, missing forms, mixed discriminators and malformed identity", () => {
    const mutations: ((v: any) => void)[] = [
      v => v.command = "visual", v => v.schemaVersion = 2, v => delete v.report.mode, v => v.report.mode = "check",
      v => v.report.runId = "yesterday", v => v.report.sites.push(v.report.sites[0]), v => v.report.sites[0].pages = [],
      v => v.report.sites[0].url = "https://example.test/", v => v.report.sites[0].pages[0].pageKey = "other",
      v => v.report.sites[0].pages[1].path = "/", v => delete v.report.sites[0].pages[0].forms,
      v => v.report.sites[0].pages[0].viewports = fixture().sites[0]!.pages[0]!.viewports,
      v => v.report.sites[0].pages[0].forms[0].outcome = "passed", v => v.report.sites[0].pages[0].forms[0].plugin = "contact7",
      v => v.report.sites[0].pages[0].forms[0].detail = null,
    ];
    for (const mutate of mutations) { const input = structuredClone(envelope()); mutate(input); expect(() => parsePublishedManifest(input)).toThrow(/manifest/); }
    expect(() => parsePublishedManifest(envelope(), "2026-09-25T13-00-01.000Z")).toThrow();
    // A check envelope may not smuggle a forms-only report, and vice versa.
    expect(() => parsePublishedManifest({ schemaVersion: 1, command: "check", report: formsReport() })).toThrow();
    expect(() => parsePublishedManifest({ schemaVersion: 1, command: "forms", report: fixture() })).toThrow();
  });
});

describe("form outcome gating", () => {
  test("failed/rejected fail, spam/not-verified/unsupported warn, delivered passes", () => {
    const expected: Record<FormResult["outcome"], string> = { delivered: "pass", "delivered-spam": "warning", "not-verified": "warning", unsupported: "warning", rejected: "failure", failed: "failure" };
    for (const [outcome, status] of Object.entries(expected)) {
      expect(reportStatus(formsReport([form(outcome as FormResult["outcome"])]))).toBe(status as never);
      const check = fixture();
      check.sites[0]!.pages[0]!.forms = [form("delivered"), form(outcome as FormResult["outcome"])];
      expect(reportStatus(check)).toBe(status as never);
    }
    expect(reportStatus(formsReport([]))).toBe("pass");
  });
  test("existing visual/health failures still fail with passing forms", () => {
    const check = fixture();
    check.sites[0]!.pages[0]!.forms = [form("delivered")];
    check.sites[0]!.pages[0]!.viewports.desktop.visual.state = "changed";
    expect(reportStatus(check)).toBe("failure");
  });
  test("forms-only HTML has page Forms data without image panels and escapes hostile text", () => {
    const report = formsReport([form("rejected", '<img src=x onerror="alert(1)">'), { selector: "<script>x</script>", plugin: "fluent", outcome: "delivered-spam", detail: "spam" }]);
    const html = renderHtml(report, new Map());
    expect(html).toContain("Form check");
    expect(html).toContain("acme — failure");
    expect(html).toContain("/ — failure");
    expect(html).toContain("/about/ — pass");
    expect(html).toContain("No forms found");
    expect(html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toMatch(/<img|<figure|Viewport|Baseline|<script/);
    expect(html).toContain("default-src 'none'");
  });
  test("check pages show form-aware page and site status", () => {
    const check = fixture();
    check.sites[0]!.pages[0]!.forms = [form("failed", "No tagged message arrived")];
    const html = renderHtml(check, new Map());
    expect(html).toContain("acme — failure");
    expect(html).toContain("/ — failure");
    expect(html).toContain("No tagged message arrived");
  });
});

describe("forms-only local and published reports", () => {
  const dir = resolve("runs", `forms-report-tests-${crypto.randomUUID()}`);
  const evidence: Record<string, any> = { directory: dir, browser: { headless: true, trace: true, video: false } };
  afterAll(async () => {
    // Retain the real report/trace; no signed URL or remote trace is evidence.
    const secrets = ["FORM_TEST_TOKEN", "FORM_TEST_ADDRESS", "IMAP_HOST", "IMAP_USER", "IMAP_PASSWORD", "SMTP_HOST", "SMTP_USER", "SMTP_PASSWORD", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY", "S3_ENDPOINT", "S3_BUCKET"]
      .map(name => process.env[name]).filter((v): v is string => !!v && v.length >= 4)
      .flatMap(v => [v, encodeURIComponent(v), JSON.stringify(v).slice(1, -1)]);
    const clean = (text: string) => !secrets.some(v => text.includes(v)) && !/X-Amz-(?:Signature|Credential)=/i.test(text);
    expect(clean(JSON.stringify(evidence))).toBe(true);
    for (const name of readdirSync(dir, { recursive: true }).filter((name): name is string => typeof name === "string" && /\.(?:html|json|zip)$/.test(name))) {
      // The sentinel trace is intentionally not a ZIP; unpack only the actual Chromium trace.
      const file = join(dir, name);
      let text: string;
      if (name.endsWith("report-browser.trace.zip")) {
        const child = Bun.spawn(["unzip", "-p", file], { stdout: "pipe", stderr: "ignore" });
        text = await new Response(child.stdout).text();
        expect(await child.exited).toBe(0);
      } else text = await Bun.file(file).text();
      expect(clean(text)).toBe(true);
    }
    evidence.privacyScan = "passed (raw, URL-encoded, JSON-escaped secrets and signed URL markers; trace unpacked)";
    await Bun.write(join(dir, "summary.json"), JSON.stringify(evidence, null, 2) + "\n");
    expect(evidence.local?.ok).toBe(true);
    expect(evidence.remote?.ok).toBe(true);
    expect(evidence.cleanup?.ok).toBe(true);
    expect(await Bun.file(evidence.local.trace).exists()).toBe(true);
    console.log(`Forms report evidence: ${join(dir, "summary.json")}`);
  });

  test("local report has only HTML and manifest, excludes traces, and renders in real Chromium", async () => {
    const report = formsReport([form("failed", '<b onclick="window.injected=1">timeout</b>'), form("not-verified")], runId());
    const runDir = join(dir, report.runId);
    mkdirSync(runDir, { recursive: true });
    await saveArtifact(runDir, "traces/acme/forms/home.trace.zip", "local trace");
    expect(reportAssets(report)).toEqual([]);
    const local = await writeLocalReport(report, runDir);
    evidence.local = { report: local, manifest: join(runDir, "manifest.json"), trace: join(runDir, "report-browser.trace.zip"), ok: false };
    expect(parsePublishedManifest(await Bun.file(join(runDir, "manifest.json")).json(), report.runId)).toEqual({ schemaVersion: 1, command: "forms", report });
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const network: string[] = [];
    try {
      await context.tracing.start({ screenshots: true, snapshots: true });
      const page = await context.newPage();
      page.on("request", request => { if (/^https?:/.test(request.url())) network.push(request.url()); });
      await page.goto(pathToFileURL(local).href);
      expect(await page.locator("h1").textContent()).toBe("Form check");
      expect(await page.locator("img, figure").count()).toBe(0);
      expect(await page.locator("th").allTextContents()).toEqual(["Outcome", "Plugin", "Form", "Detail"]);
      expect(await page.locator("body").textContent()).toContain("not-verified");
      await page.locator("b").count().then(n => expect(n).toBe(0));
      expect(await page.evaluate(() => (window as unknown as Record<string, unknown>).injected)).toBeUndefined();
      expect(network).toEqual([]);
      evidence.local.ok = true;
    } finally {
      await context.tracing.stop({ path: join(runDir, "report-browser.trace.zip") });
      await context.close();
      await browser.close();
    }
  }, 30_000);

  // Real R2 under a fresh test root: forms publication is manifest-last, uploads no traces, and
  // a newer forms-only run neither blocks nor replaces the newest usable check for approval.
  test("real R2: manifest last, traces excluded, approval still selects the older check", async () => {
    const root = `test/forms-report-${runId()}-${crypto.randomUUID().slice(0, 8)}/`;
    evidence.root = root;
    evidence.cleanup = { ok: false, deleted: 0, remaining: null };
    const real = createStore({ root });
    const puts: string[] = [];
    const store: Store = { ...real, put: async (key, data) => { puts.push(key); await real.put(key, data); } };
    try {
      const check = fixture();
      check.runId = "2026-09-25T12-00-00.000Z";
      const checkDir = join(dir, check.runId);
      for (const v of Object.values(check.sites[0]!.pages[0]!.viewports)) {
        await saveArtifact(checkDir, v.artifacts.actualPng!, png(v.visual.actual!.width));
        await saveArtifact(checkDir, v.artifacts.actualHealth!, health);
      }
      await writeLocalReport(check, checkDir);
      await publishReport(check, checkDir, store);
      const forms = formsReport([form("failed")], "2026-09-25T13-00-00.000Z");
      const formsDir = join(dir, forms.runId);
      await saveArtifact(formsDir, "traces/acme/forms/home.trace.zip", "local trace");
      await writeLocalReport(forms, formsDir);
      puts.length = 0;
      const url = await publishReport(forms, formsDir, store);
      expect(url.includes("index.html")).toBe(true);
      expect(puts).toEqual([`reports/${forms.runId}/index.html`, `reports/${forms.runId}/manifest.json`]);
      expect(readdirSync(join(formsDir, "traces/acme/forms"))).toEqual(["home.trace.zip"]);
      const remote = parsePublishedManifest(JSON.parse(new TextDecoder().decode(await real.get(`reports/${forms.runId}/manifest.json`))), forms.runId);
      expect(remote).toEqual({ schemaVersion: 1, command: "forms", report: forms });
      const traceUploads = (await real.list("")).filter(key => key.includes("trace"));
      expect(traceUploads).toEqual([]);
      const fetchedHtml = await real.get(`reports/${forms.runId}/index.html`);
      const fetchedReport = join(formsDir, "remote-index.html");
      await Bun.write(fetchedReport, fetchedHtml);
      expect(fetchedHtml).toEqual(await Bun.file(join(formsDir, "index.html")).bytes());
      evidence.remote = { report: join(formsDir, "index.html"), manifest: join(formsDir, "manifest.json"), fetchedReport, traceUploads: traceUploads.length, manifestLast: true, ok: false };
      const logs: string[] = [];
      const approved = await runApprove(site, real, { log: message => logs.push(message) });
      expect(approved.exitCode).toBe(0);
      expect(logs[0]).toContain(`from check ${check.runId}`);
      expect(await real.get("baselines/acme/desktop/home.png")).toEqual(new Uint8Array(png()));
      // A malformed newer manifest is still an error, never skipped.
      await real.put("reports/2026-09-25T14-00-00.000Z/manifest.json", new Blob([JSON.stringify({ ...envelope(), report: { ...formsReport(), runId: "2026-09-25T14-00-00.000Z", mode: undefined } })]));
      expect((await runApprove(site, real, { log: () => {} })).exitCode).toBe(1);
      evidence.remote.ok = true;
    } finally {
      for (const key of await real.list("")) { await real.delete(key); evidence.cleanup.deleted++; }
      const remaining = await real.list("");
      evidence.cleanup.remaining = remaining.length;
      evidence.cleanup.ok = remaining.length === 0;
      expect(remaining).toEqual([]);
    }
  }, 120_000);
});
