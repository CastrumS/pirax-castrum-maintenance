import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import type { RunReport } from "./model.ts";
import type { Store } from "../store.ts";
import { parseManifest } from "./manifest.ts";
import { renderHtml } from "./html.ts";

export async function saveArtifact(runDir: string, path: string, data: Uint8Array | string): Promise<void> {
  if (!path || /[\\\u0000-\u001f]/.test(path) || path.split("/").some(p => !p || p === "." || p === "..")) throw new Error("unsafe local artifact path");
  const file = join(runDir, path);
  mkdirSync(dirname(file), { recursive: true });
  await Bun.write(file, data);
}

/** Explicit allowlist excludes traces and any other incidental files in the run directory. */
export function reportAssets(report: RunReport): string[] {
  parseManifest({ schemaVersion: 1, command: "check", report });
  const paths = new Set<string>();
  for (const site of report.sites) for (const page of site.pages) for (const v of Object.values(page.viewports))
    for (const [kind, path] of Object.entries(v.artifacts)) if (kind !== "trace") paths.add(path);
  return [...paths];
}

export async function writeLocalReport(report: RunReport, runDir: string): Promise<string> {
  const images = new Map<string, Uint8Array>();
  for (const path of reportAssets(report)) if (path.endsWith(".png")) images.set(path, await Bun.file(join(runDir, path)).bytes());
  await saveArtifact(runDir, "index.html", renderHtml(report, images));
  await saveArtifact(runDir, "manifest.json", JSON.stringify({ schemaVersion: 1, command: "check", report }, null, 2) + "\n");
  return join(runDir, "index.html");
}

/** Completion marker is the final upload. The local report survives publication or pruning failure. */
export async function publishReport(report: RunReport, runDir: string, store: Store): Promise<string> {
  const prefix = `reports/${report.runId}/`;
  for (const path of [...reportAssets(report), "index.html", "manifest.json"]) {
    const type = path.endsWith(".html") ? "text/html; charset=utf-8" : path.endsWith(".json") ? "application/json" : "image/png";
    await store.put(prefix + path, new Blob([await Bun.file(join(runDir, path)).arrayBuffer()], { type }));
  }
  await store.pruneReports(10);
  return store.presign(prefix + "index.html", 604800);
}
