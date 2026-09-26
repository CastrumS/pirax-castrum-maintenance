import { evaluateHealth } from "../health.ts";
import type { Site } from "../sites.ts";
import { isRunId, type Store } from "../store.ts";
import type { Manifest } from "../report/model.ts";
import { artifactPath, parsePublishedManifest, ReportError, validateActualPair, validateApproval, viewportNames } from "../report/manifest.ts";
import { configurationError, dispatch, safeError, UsageError, type CommandResult } from "./common.ts";

export function completedRunIds(keys: string[]): string[] {
  return [...new Set(keys.flatMap(key => {
    const parts = key.split("/");
    return parts.length === 3 && parts[0] === "reports" && parts[2] === "manifest.json" && isRunId(parts[1]!) ? [parts[1]!] : [];
  }))].sort().reverse();
}

/** Reader seam keeps selection testable as pure manifest data, without claiming fake-storage acceptance.
 * Validated forms-only runs are skipped (never approval evidence); malformed manifests still stop selection. */
export async function newestSiteCheck(runIds: string[], slug: string, read: (runId: string) => Promise<unknown>): Promise<Manifest> {
  for (const id of [...runIds].sort().reverse()) {
    const manifest = parsePublishedManifest(await read(id), id);
    if (manifest.command === "check" && manifest.report.sites.some(site => site.slug === slug)) return manifest;
  }
  throw new ReportError("no completed check contains this site; run check first");
}

export async function runApprove(site: Site, store: Store, options: { pagePath?: string; log?: (message: string) => void } = {}): Promise<CommandResult> {
  const log = options.log ?? console.log;
  let writing = false;
  try {
    if (options.pagePath !== undefined && !site.pages.some(page => page.path === options.pagePath)) throw new UsageError("requested page is not in the current site list");
    const keys = await store.list("reports/");
    const manifest = await newestSiteCheck(completedRunIds(keys), site.slug, async id => {
      const bytes = await store.get(`reports/${id}/manifest.json`);
      try { return JSON.parse(new TextDecoder().decode(bytes)); } catch { throw new ReportError("invalid check manifest JSON; run a new check"); }
    });
    const pages = validateApproval(manifest, site, options.pagePath);
    const available = new Set(keys);
    const promote: { key: string; bytes: Uint8Array; type: string }[] = [];
    let unconditionalFailure = false;
    for (const page of pages) for (const name of viewportNames) {
      // Never read paths out of the manifest: derive canonical keys from validated identity.
      const pngPath = artifactPath("actual", site.slug, name, page.pageKey, "png");
      const healthPath = artifactPath("actual", site.slug, name, page.pageKey, "health.json");
      const prefix = `reports/${manifest.report.runId}/`;
      if (!available.has(prefix + pngPath) || !available.has(prefix + healthPath)) throw new ReportError("latest check actual artifacts are missing; run check first");
      const png = await store.get(prefix + pngPath);
      const health = await store.get(prefix + healthPath);
      const snapshot = validateActualPair(page.viewports[name], png, health);
      unconditionalFailure ||= evaluateHealth(snapshot, snapshot).some(h => h.severity === "failure");
      promote.push({ key: pngPath.replace(/^actual\//, "baselines/"), bytes: png, type: "image/png" }, { key: healthPath.replace(/^actual\//, "baselines/"), bytes: health, type: "application/json" });
    }
    // Every requested pair is read/decoded/validated before the first write. Preserve exact bytes.
    writing = true;
    for (const item of promote) await store.put(item.key, new Blob([Uint8Array.from(item.bytes)], { type: item.type }));
    log(`Approved ${site.slug}${options.pagePath ? ` ${options.pagePath}` : ""} from check ${manifest.report.runId}.`);
    log(unconditionalFailure ? "Health failures remain: approval does not waive HTTP failures, critical errors or mixed content." : "Approval does not waive HTTP failures, critical errors or mixed content on future checks.");
    return { exitCode: 0 };
  } catch (error) {
    log(`approve: ${safeError(error)}${writing ? "; baseline writes are nontransactional and may be partial" : "; no baselines written"}`);
    return { exitCode: configurationError(error) ? 2 : 1 };
  }
}

if (import.meta.main) process.exitCode = await dispatch("approve", process.argv.slice(2));
