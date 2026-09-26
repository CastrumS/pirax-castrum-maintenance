import { PNG } from "pngjs";
import { comparePng } from "../compare.ts";
import { evaluateHealth, parseHealth, type HealthSnapshot } from "../health.ts";
import type { Site } from "../sites.ts";
import type { Store } from "../store.ts";
import { artifactPath, ReportError } from "../report/manifest.ts";
import { publishReport, saveArtifact, writeLocalReport } from "../report/writer.ts";
import { captureSelection, configurationError, dispatch, safeError, type CommandResult, type RunOptions } from "./common.ts";
import { populateForms } from "../forms/runner.ts";
import { secretRedactor } from "../forms/evidence.ts";
import { reportStatus } from "../report/html.ts";

export async function runCheck(sites: Site[], store: Store, options: RunOptions = {}): Promise<CommandResult> {
  const redact = secretRedactor();
  const log = (message: string) => (options.log ?? console.log)(redact(message));
  try { return await executeCheck(sites, store, { ...options, log }); }
  catch (error) { log(`check: ${safeError(error)}`); return { exitCode: configurationError(error) ? 2 : 1 }; }
}
async function executeCheck(sites: Site[], store: Store, options: RunOptions): Promise<CommandResult> {
  if (!sites.length) return { exitCode: 0 };
  const log = options.log!;
  const result: CommandResult = await captureSelection(sites, options, async (site, key, capture, v, runDir) => {
    const prefix = `baselines/${site.slug}/${v.viewport}/`;
    // Listing distinguishes absence from authentication/network errors; failed gets remain operational errors.
    const present = new Set(await store.list(prefix));
    let basePng: Uint8Array | undefined;
    let baseHealth: HealthSnapshot | null = null;
    let malformed: string | null = null;
    for (const extension of ["png", "health.json"] as const) {
      const remote = `${prefix}${key}.${extension}`;
      if (!present.has(remote)) continue;
      const bytes = await store.get(remote);
      const path = artifactPath("baseline", site.slug, v.viewport, key, extension);
      await saveArtifact(runDir, path, bytes);
      if (extension === "png") {
        v.artifacts.baselinePng = path;
        basePng = bytes;
        try { const decoded = PNG.sync.read(Buffer.from(bytes)); v.visual.baseline = { width: decoded.width, height: decoded.height }; }
        catch { malformed = "Baseline PNG is corrupt; run baseline to replace it."; }
      } else {
        v.artifacts.baselineHealth = path;
        try { baseHealth = parseHealth(JSON.parse(new TextDecoder().decode(bytes))); }
        catch { malformed = "Baseline health is corrupt; run baseline to replace it."; }
      }
    }
    v.health = evaluateHealth(capture.health, baseHealth);
    if (malformed) { v.visual.state = "error"; v.visual.detail = malformed; return; }
    if (!basePng || !baseHealth) { v.visual.state = "missing-baseline"; v.visual.detail = `Missing baseline PNG/health pair; run baseline ${site.slug}.`; return; }
    if (v.capture.state !== "captured" || !capture.image) return;
    const comparison = comparePng(basePng, capture.image.png, site.max_diff_pixel_ratio);
    if (comparison.state === "error") { v.visual.state = "error"; v.visual.detail = comparison.detail; return; }
    v.visual = { state: comparison.state, detail: comparison.dimensionsChanged ? "Dimensions changed; diff uses a padded canvas (magenta outside original bounds)." : null, baseline: comparison.baseline, actual: comparison.actual, ratio: comparison.ratio, allowance: comparison.allowance };
    const diff = artifactPath("diff", site.slug, v.viewport, key, "png");
    await saveArtifact(runDir, diff, comparison.diffPng);
    v.artifacts.diffPng = diff;
  });
  try {
    if (!result.report || !result.runDir) throw new ReportError("check has no report");
    await populateForms(sites, result.report, { ...options.forms, runDir: result.runDir });
    if (["failure", "blocked"].includes(reportStatus(result.report))) result.exitCode = 1;
    result.localPath = await writeLocalReport(result.report, result.runDir);
    log(`Local report: ${result.localPath}`);
    result.url = await publishReport(result.report, result.runDir, store);
    log("Private report published; bearer link withheld from logs. Open the local report above.");
  } catch (error) {
    result.exitCode = configurationError(error) ? 2 : 1;
    log(`Forms/report publication/pruning failed: ${safeError(error)}. Local artifacts: ${result.runDir}`);
  }
  return result;
}

if (import.meta.main) process.exitCode = await dispatch("check", process.argv.slice(2));
