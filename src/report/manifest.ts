import { PNG } from "pngjs";
import type { ViewportName } from "../capture.ts";
import { parseHealth, type HealthSnapshot } from "../health.ts";
import { pageKey, type Site } from "../sites.ts";
import { isRunId } from "../store.ts";
import type { Manifest, PageResult, ViewportResult } from "./model.ts";

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

/** A manifest is the remote completion marker; validate the entire model before using any evidence. */
export function parseManifest(value: unknown, expectedRunId?: string): Manifest {
  const bad = (): never => fail("invalid check manifest; run a new check before approval");
  if (!object(value) || value.schemaVersion !== 1 || value.command !== "check" || !object(value.report)) return bad();
  const report = value.report;
  if (typeof report.runId !== "string" || !isRunId(report.runId) || (expectedRunId !== undefined && report.runId !== expectedRunId) || !Array.isArray(report.sites)) return bad();
  const slugs = new Set<string>();
  for (const site of report.sites) {
    if (!object(site) || !slugOk(site.slug) || slugs.has(site.slug) || typeof site.url !== "string" || !Array.isArray(site.pages) || !site.pages.length) return bad();
    slugs.add(site.slug);
    try { const url = new URL(site.url); if (!/^https?:$/.test(url.protocol) || url.username || url.password || /[?#]/.test(site.url) || site.url.endsWith("/") || site.url.trim() !== site.url) return bad(); } catch { return bad(); }
    const keys = new Set<string>();
    for (const page of site.pages) {
      if (!object(page) || typeof page.path !== "string" || !page.path.startsWith("/") || /[?#\s\\\u0000-\u001f\u007f]/.test(page.path) || page.path.includes("//") || page.path.split("/").some(s => /^(\.|%2e){1,2}$/i.test(s)) || !keyOk(page.pageKey) || page.pageKey !== pageKey(page.path) || keys.has(page.pageKey.toLowerCase()) || !object(page.viewports)) return bad();
      keys.add(page.pageKey.toLowerCase());
      for (const name of viewportNames) {
        const v = page.viewports[name];
        if (!object(v) || v.viewport !== name || !object(v.capture) || !oneOf(v.capture.state, ["captured", "blocked", "error"]) || !nullableString(v.capture.detail) || !object(v.visual) || !oneOf(v.visual.state, ["same", "changed", "missing-baseline", "error", "not-compared"]) || !nullableString(v.visual.detail) || !dimensions(v.visual.baseline) || !dimensions(v.visual.actual) || !(v.visual.ratio === null || ratio(v.visual.ratio)) || !ratio(v.visual.allowance) || !strings(v.warnings) || !Array.isArray(v.health) || !object(v.artifacts)) return bad();
        for (const h of v.health) if (!object(h) || !oneOf(h.severity, ["warning", "failure"]) || !oneOf(h.kind, ["status", "critical-error", "console-error", "failed-request", "mixed-content"]) || typeof h.detail !== "string") return bad();
        const expected = {
          actualPng: artifactPath("actual", site.slug, name, page.pageKey, "png"), actualHealth: artifactPath("actual", site.slug, name, page.pageKey, "health.json"),
          baselinePng: artifactPath("baseline", site.slug, name, page.pageKey, "png"), baselineHealth: artifactPath("baseline", site.slug, name, page.pageKey, "health.json"),
          diffPng: artifactPath("diff", site.slug, name, page.pageKey, "png"), trace: artifactPath("traces", site.slug, name, page.pageKey, "trace.zip"),
        };
        for (const [key, path] of Object.entries(v.artifacts)) if (!(key in expected) || path !== expected[key as keyof typeof expected]) return bad();
      }
      if (page.forms !== undefined && (!Array.isArray(page.forms) || !page.forms.every(f => object(f) && typeof f.selector === "string" && typeof f.detail === "string" && oneOf(f.plugin, ["gravity", "fluent", "unknown"]) && oneOf(f.outcome, ["delivered", "delivered-spam", "not-verified", "rejected", "unsupported", "failed"])))) return bad();
    }
  }
  return value as Manifest;
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
