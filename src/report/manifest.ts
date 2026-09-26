import { PNG } from "pngjs";
import type { ViewportName } from "../capture.ts";
import { parseHealth, type HealthSnapshot } from "../health.ts";
import { pageKey, type Site } from "../sites.ts";
import { isRunId } from "../store.ts";
import type { FormsManifest, Manifest, PageResult, PublishedManifest, ViewportResult } from "./model.ts";

export class ReportError extends Error {}
const fail = (detail: string): never => { throw new ReportError(detail); };
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const strings = (v: unknown): v is string[] => Array.isArray(v) && v.every(x => typeof x === "string");
const oneOf = (v: unknown, values: readonly string[]) => typeof v === "string" && values.includes(v);
const nullableString = (v: unknown) => v === null || typeof v === "string";
const ratio = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1;
const dimensions = (v: unknown) => v === null || (object(v) && Number.isSafeInteger(v.width) && Number(v.width) > 0 && Number.isSafeInteger(v.height) && Number(v.height) > 0);
const slugOk = (v: unknown): v is string => typeof v === "string" && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(v);
const keyOk = (v: unknown): v is string => typeof v === "string" && /^(?:[A-Za-z0-9._-]|%[0-9A-F]{2})+$/.test(v) && v !== "." && v !== "..";
export const viewportNames = ["desktop", "mobile"] as const;
export type ArtifactKind = "actual" | "baseline" | "diff" | "traces";
export function artifactPath(kind: ArtifactKind, slug: string, viewport: ViewportName, key: string, extension: "png" | "health.json" | "trace.zip"): string {
  if (!["actual", "baseline", "diff", "traces"].includes(kind) || !slugOk(slug) || !viewportNames.includes(viewport) || !keyOk(key) || !["png", "health.json", "trace.zip"].includes(extension)) fail("unsafe artifact path");
  return `${kind}/${slug}/${viewport}/${key}.${extension}`;
}

const formsOk = (v: unknown) => Array.isArray(v) && v.every(f => object(f) && typeof f.selector === "string" && typeof f.detail === "string" && oneOf(f.plugin, ["gravity", "fluent", "unknown"]) && oneOf(f.outcome, ["delivered", "delivered-spam", "not-verified", "rejected", "unsupported", "failed"]));
const urlOk = (v: unknown) => {
  if (typeof v !== "string") return false;
  try { const url = new URL(v); return /^https?:$/.test(url.protocol) && !url.username && !url.password && !/[?#]/.test(v) && !v.endsWith("/") && v.trim() === v; } catch { return false; }
};
const pathOk = (v: unknown): v is string => typeof v === "string" && v.startsWith("/") && !/[?#\s\\\u0000-\u001f\u007f]/.test(v) && !v.includes("//") && !v.split("/").some(s => /^(\.|%2e){1,2}$/i.test(s));

/** Run/site/page identity shared by both report modes; `page` validates the mode-specific fields. */
function reportOk(report: Record<string, unknown>, expectedRunId: string | undefined, page: (p: Record<string, unknown>, slug: string) => boolean): boolean {
  if (typeof report.runId !== "string" || !isRunId(report.runId) || (expectedRunId !== undefined && report.runId !== expectedRunId) || !Array.isArray(report.sites)) return false;
  const slugs = new Set<string>();
  for (const site of report.sites) {
    if (!object(site) || !slugOk(site.slug) || slugs.has(site.slug) || !urlOk(site.url) || !Array.isArray(site.pages) || !site.pages.length) return false;
    slugs.add(site.slug);
    const keys = new Set<string>();
    for (const p of site.pages) {
      if (!object(p) || !pathOk(p.path) || !keyOk(p.pageKey) || p.pageKey !== pageKey(p.path) || keys.has(p.pageKey.toLowerCase()) || !page(p, site.slug)) return false;
      keys.add(p.pageKey.toLowerCase());
    }
  }
  return true;
}

function checkPageOk(page: Record<string, unknown>, slug: string): boolean {
  if (!object(page.viewports)) return false;
  for (const name of viewportNames) {
    const v = page.viewports[name];
    if (!object(v) || v.viewport !== name || !object(v.capture) || !oneOf(v.capture.state, ["captured", "blocked", "error"]) || !nullableString(v.capture.detail) || !object(v.visual) || !oneOf(v.visual.state, ["same", "changed", "missing-baseline", "error", "not-compared"]) || !nullableString(v.visual.detail) || !dimensions(v.visual.baseline) || !dimensions(v.visual.actual) || !(v.visual.ratio === null || ratio(v.visual.ratio)) || !ratio(v.visual.allowance) || !strings(v.warnings) || !Array.isArray(v.health) || !object(v.artifacts)) return false;
    for (const h of v.health) if (!object(h) || !oneOf(h.severity, ["warning", "failure"]) || !oneOf(h.kind, ["status", "critical-error", "console-error", "failed-request", "mixed-content"]) || typeof h.detail !== "string") return false;
    const key = page.pageKey as string;
    const expected = {
      actualPng: artifactPath("actual", slug, name, key, "png"), actualHealth: artifactPath("actual", slug, name, key, "health.json"),
      baselinePng: artifactPath("baseline", slug, name, key, "png"), baselineHealth: artifactPath("baseline", slug, name, key, "health.json"),
      diffPng: artifactPath("diff", slug, name, key, "png"), trace: artifactPath("traces", slug, name, key, "trace.zip"),
    };
    for (const [k, path] of Object.entries(v.artifacts)) if (!(k in expected) || path !== expected[k as keyof typeof expected]) return false;
  }
  return page.forms === undefined || formsOk(page.forms);
}
/** Forms-only pages carry form results and nothing that could pass as visual evidence. */
const formsPageOk = (page: Record<string, unknown>) => !("viewports" in page) && formsOk(page.forms);

/** A manifest is the remote completion marker; validate the entire model before using any evidence. Check runs only. */
export function parseManifest(value: unknown, expectedRunId?: string): Manifest {
  if (!object(value) || value.schemaVersion !== 1 || value.command !== "check" || !object(value.report) || "mode" in value.report || !reportOk(value.report, expectedRunId, checkPageOk)) return fail("invalid check manifest; run a new check before approval");
  return value as Manifest;
}

/** Any published completion marker, discriminated by `command`; forms runs are never approval evidence. */
export function parsePublishedManifest(value: unknown, expectedRunId?: string): PublishedManifest {
  if (!object(value) || value.command !== "forms") return parseManifest(value, expectedRunId);
  if (value.schemaVersion !== 1 || !object(value.report) || value.report.mode !== "forms" || !reportOk(value.report, expectedRunId, formsPageOk)) return fail("invalid forms manifest; run forms again");
  return value as FormsManifest;
}

/** Select all current pages, or one current page; never choose a fallback run. */
export function validateApproval(manifest: Manifest, site: Site, pagePath?: string): PageResult[] {
  parseManifest(manifest);
  const source = manifest.report.sites.find(s => s.slug === site.slug);
  if (!source) return fail("no completed check contains this site; run check first");
  if (source.url !== site.url) return fail("latest check source URL differs from current site URL; run check first");
  const requested = pagePath === undefined ? site.pages : site.pages.filter(p => p.path === pagePath);
  if (!requested.length) return fail("requested page is not in the current site list");
  return requested.map(p => {
    const page = source.pages.find(candidate => candidate.path === p.path && candidate.pageKey === pageKey(p.path));
    if (!page) return fail(`latest check is missing current page ${p.path}; run check first`);
    for (const name of viewportNames) {
      const v = page.viewports[name];
      if (v.capture.state !== "captured" || !v.visual.actual || !v.artifacts.actualPng || !v.artifacts.actualHealth) return fail(`latest check has no complete ${name} capture for ${p.path}; run check first`);
    }
    return page;
  });
}

export function validateActualPair(viewport: ViewportResult, png: Uint8Array, healthBytes: Uint8Array): HealthSnapshot {
  let image: PNG;
  try { image = PNG.sync.read(Buffer.from(png)); } catch { return fail("actual PNG is corrupt; run check first"); }
  if (image.width !== viewport.visual.actual?.width || image.height !== viewport.visual.actual?.height) return fail("actual PNG dimensions differ from captured dimensions; run check first");
  try { return parseHealth(JSON.parse(new TextDecoder().decode(healthBytes))); } catch { return fail("actual health is corrupt; run check first"); }
}
