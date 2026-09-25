import { describe, expect, test } from "bun:test";
import { resolve, join } from "node:path";
import { mkdirSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";
import { reportAssets, saveArtifact, writeLocalReport } from "../src/report/writer.ts";
import { PNG } from "pngjs";
import { renderHtml, reportStatus } from "../src/report/html.ts";
import { artifactPath, parseManifest, validateApproval, validateActualPair } from "../src/report/manifest.ts";
import type { FormResult, RunReport, ViewportResult, Manifest } from "../src/report/model.ts";
import type { Site } from "../src/sites.ts";

export const site: Site = { slug: "acme", url: "https://example.test", form_helper: false, mask: [], max_diff_pixel_ratio: 0.01, pages: [{ path: "/", mask: [] }] };
export function fixture(): RunReport {
  const viewport = (name: "desktop" | "mobile"): ViewportResult => ({
    viewport: name, capture: { state: "captured", detail: null },
    visual: { state: "same", detail: null, baseline: { width: name === "desktop" ? 1440 : 390, height: 2 }, actual: { width: name === "desktop" ? 1440 : 390, height: 2 }, ratio: 0, allowance: 0.01 },
    health: [], warnings: [], artifacts: {
      actualPng: `actual/acme/${name}/home.png`, actualHealth: `actual/acme/${name}/home.health.json`,
      baselinePng: `baseline/acme/${name}/home.png`, diffPng: `diff/acme/${name}/home.png`,
    },
  });
  return { runId: "2026-09-25T12-00-00.000Z", sites: [{ slug: site.slug, url: site.url, pages: [{ path: "/", pageKey: "home", viewports: { desktop: viewport("desktop"), mobile: viewport("mobile") } }] }] };
}
export const png = (width = 1440) => PNG.sync.write(new PNG({ width, height: 2 }));
export const health = new TextEncoder().encode(JSON.stringify({ status: 200, finalUrl: "https://example.test/", criticalError: false, consoleErrors: [], failedRequests: [], mixedContent: [] }));
const manifest = (report = fixture()): Manifest => ({ schemaVersion: 1, command: "check", report });

describe("private report", () => {
  test("embeds images and escapes all untrusted text without external assets", () => {
    const report = fixture();
    const v = report.sites[0]!.pages[0]!.viewports.desktop;
    v.capture.detail = '<script>alert("capture")</script>';
    v.health.push({ severity: "failure", kind: "console-error", detail: '<img src=x onerror="alert(1)">' });
    v.warnings.push("<warning>&");
    v.visual.detail = '<changed "dimensions">';
    const assets = new Map<string, Uint8Array>();
    for (const s of report.sites) for (const p of s.pages) for (const v of Object.values(p.viewports))
      for (const path of [v.artifacts.actualPng, v.artifacts.baselinePng, v.artifacts.diffPng]) assets.set(path!, png(v.visual.actual!.width));
    const html = renderHtml(report, assets);
    expect(html).toContain("data:image/png;base64,");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&lt;warning&gt;&amp;");
    expect(html).toContain("1440 × 2");
    expect(html).not.toContain('<script>');
    expect(html).not.toMatch(/src=["'](?:https?:|actual\/|baseline\/|diff\/)/);
    expect(html).not.toContain("<th>Forms</th>");
    expect(reportStatus(report)).toBe("failure");
  });
  test("renders exact future Forms outcomes only when supplied", () => {
    const report = fixture();
    const outcomes: FormResult["outcome"][] = ["delivered", "delivered-spam", "not-verified", "rejected", "unsupported", "failed"];
    report.sites[0]!.pages[0]!.forms = outcomes.map(outcome => ({ selector: '<form id="x">', plugin: "gravity", outcome, detail: "<detail>" }));
    const html = renderHtml(report, new Map());
    expect(html).toContain("<th>Forms</th>");
    for (const outcome of outcomes) expect(html).toContain(outcome);
    expect(html).toContain("&lt;detail&gt;");
    expect(html).toContain("&lt;form id=&quot;x&quot;&gt;");
    expect(reportStatus(report)).toBe("pass"); // Forms are displayed, not executed or gated here.
  });
  test("aggregates blocked, failures and warnings while keeping capture separate", () => {
    const report = fixture();
    const v = report.sites[0]!.pages[0]!.viewports.mobile;
    v.warnings.push("late image");
    expect(reportStatus(report)).toBe("warning");
    v.capture.state = "blocked";
    expect(reportStatus(report)).toBe("blocked");
    expect(v.visual.state).toBe("same");
  });
});

describe("manifest and exact approval evidence", () => {
  test("accepts canonical manifest and derives safe encoded page keys", () => {
    expect(parseManifest(manifest(), fixture().runId)).toEqual(manifest());
    expect(artifactPath("actual", "acme", "mobile", "a%2520b", "png")).toBe("actual/acme/mobile/a%2520b.png");
    expect(() => artifactPath("actual", "../acme", "desktop", "home", "png")).toThrow();
    expect(() => artifactPath("actual", "acme", "desktop", "../home", "png")).toThrow();
  });
  test("rejects malformed schemas, shapes, duplicate sites, run mismatch and arbitrary artifact paths", () => {
    const mutations: ((v: any) => void)[] = [v => v.schemaVersion = 2, v => v.report.runId = "yesterday", v => v.report.sites.push(v.report.sites[0]),
      v => delete v.report.sites[0].pages[0].viewports.mobile,
      v => v.report.sites[0].pages[0].viewports.desktop.artifacts.actualPng = "../../secret.png",
      v => v.report.sites[0].pages[0].pageKey = "different",
      v => v.report.sites[0].pages[0].viewports.desktop.health = [{}],
      v => v.report.sites[0].pages[0].viewports.desktop.visual.actual.width = -1,
      v => v.report.sites[0].pages[0].viewports.desktop.capture.state = ["captured"]];
    for (const mutate of mutations) { const input = manifest(); mutate(input); expect(() => parseManifest(input)).toThrow(); }
    expect(() => parseManifest(manifest(), "2026-09-25T12-00-01.000Z")).toThrow();
  });
  test("requires current URL, requested pages and both complete captures from the selected run", () => {
    expect(validateApproval(parseManifest(manifest()), site)).toHaveLength(1);
    expect(() => validateApproval(parseManifest(manifest()), { ...site, url: "https://changed.test" })).toThrow(/URL/);
    expect(() => validateApproval(parseManifest(manifest()), { ...site, pages: [...site.pages, { path: "/new", mask: [] }] })).toThrow(/page/);
    const report = fixture(); report.sites[0]!.pages[0]!.viewports.mobile.capture.state = "blocked";
    expect(() => validateApproval(parseManifest(manifest(report)), site)).toThrow(/complete/);
  });
  test("validates actual PNG and raw health bytes against recorded dimensions", () => {
    const v = fixture().sites[0]!.pages[0]!.viewports.desktop;
    expect(validateActualPair(v, png(), health).status).toBe(200);
    expect(() => validateActualPair(v, png(390), health)).toThrow(/dimension/);
    expect(() => validateActualPair(v, new Uint8Array([1]), health)).toThrow(/PNG/);
    expect(() => validateActualPair(v, png(), new TextEncoder().encode("{}"))).toThrow(/health/);
    const badHealth = new TextEncoder().encode(new TextDecoder().decode(health).replace('"status":200', '"status":404'));
    expect(validateActualPair(v, png(), badHealth).status).toBe(404); // Exact promotion can retain unconditional failures.
  });
  test("approval accepts full-page horizontal overflow using recorded dimensions", () => {
    for (const name of ["desktop", "mobile"] as const) {
      const v = fixture().sites[0]!.pages[0]!.viewports[name];
      v.visual.actual!.width += 200;
      expect(validateActualPair(v, png(v.visual.actual!.width), health).status).toBe(200);
      expect(() => validateActualPair(v, png(v.visual.actual!.width + 1), health)).toThrow(/dimension/);
    }
  });
});


test("local report renders all embedded images and inert hostile text in real Chromium", async () => {
  const report = fixture();
  report.runId = new Date().toISOString().replaceAll(":", "-");
  const runDir = resolve("runs", report.runId);
  mkdirSync(runDir, { recursive: true });
  const pageResult = report.sites[0]!.pages[0]!;
  pageResult.forms = [{ selector: '<script>window.reportInjected=true</script>', plugin: "fluent", outcome: "delivered-spam", detail: '<img src=x onerror="window.reportInjected=true">' }];
  const mobile = pageResult.viewports.mobile;
  mobile.visual.state = "changed";
  mobile.visual.ratio = null;
  mobile.visual.detail = "Dimensions changed; diff uses a padded canvas.";
  mobile.visual.actual!.height = 180;
  mobile.visual.baseline!.height = 140;
  mobile.warnings = ['<script>window.reportInjected=true</script>'];
  mobile.health = [{ severity: "warning", kind: "console-error", detail: '<img src=x onerror="window.reportInjected=true">' }];
  pageResult.viewports.desktop.visual.actual!.height = 140;
  pageResult.viewports.desktop.visual.baseline!.height = 140;
  for (const v of Object.values(pageResult.viewports)) {
    for (const [field, path] of Object.entries(v.artifacts)) {
      if (path.endsWith(".png")) {
        const image = new PNG({ width: v.visual.actual!.width, height: field === "baselinePng" ? 140 : v.visual.actual!.height });
        for (let y = 0; y < image.height; y++) for (let x = 0; x < image.width; x++) {
          const offset = (y * image.width + x) * 4;
          image.data.set(field === "diffPng" ? [235, 100, 140, 255] : y < 40 ? [35, 65, 120, 255] : x < image.width / 3 ? [125, 200, 180, 255] : [230, 235, 245, 255], offset);
        }
        await saveArtifact(runDir, path, PNG.sync.write(image));
      } else await saveArtifact(runDir, path, health);
    }
    v.artifacts.trace = `traces/acme/${v.viewport}/home.trace.zip`;
  }
  expect(reportAssets(report).some(path => path.includes("traces"))).toBe(false);
  for (const v of Object.values(pageResult.viewports)) delete v.artifacts.trace;
  const local = await writeLocalReport(report, runDir);
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const network: string[] = [];
  try {
    await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
    const page = await context.newPage();
    page.on("request", request => { if (/^https?:/.test(request.url())) network.push(request.url()); });
    await page.goto(pathToFileURL(local).href);
    expect(await page.locator("img").count()).toBe(6);
    expect(await page.locator("img").evaluateAll(images => images.every(img => (img as HTMLImageElement).complete && (img as HTMLImageElement).naturalWidth > 0 && (img as HTMLImageElement).src.startsWith("data:image/png;base64,")))).toBe(true);
    expect(await page.locator("th").allTextContents()).toContain("Forms");
    expect(await page.locator("body").textContent()).toContain("delivered-spam");
    expect(await page.locator("body").textContent()).toContain("390 × 180");
    expect(await page.locator("script").count()).toBe(0);
    expect(await page.evaluate(() => (window as unknown as Record<string, unknown>).reportInjected)).toBeUndefined();
    expect(network).toEqual([]);
    await page.screenshot({ path: join(runDir, "report-browser.png"), fullPage: true });
    await saveArtifact(runDir, "browser-verification.json", JSON.stringify({ localPath: local, imagesDecoded: 6, externalRequests: network.length, forms: "delivered-spam", scriptExecuted: false, trace: "report-browser.trace.zip", screenshot: "report-browser.png", captureTraces: [] }, null, 2));
  } finally {
    await context.tracing.stop({ path: join(runDir, "report-browser.trace.zip") });
    await context.close();
    await browser.close();
  }
  console.log(`Report browser artifact: ${local}`);
}, 30_000);
