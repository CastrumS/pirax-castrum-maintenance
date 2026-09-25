import { join } from "node:path";
import type { Site } from "../sites.ts";
import type { Store } from "../store.ts";
import { artifactPath } from "../report/manifest.ts";
import { captureSelection, dispatch, type CommandResult, type RunOptions } from "./common.ts";

export async function runBaseline(sites: Site[], store: Store, options: RunOptions = {}): Promise<CommandResult> {
  if (!sites.length) return { exitCode: 0 };
  const result = await captureSelection(sites, options, async (site, key, capture, v, runDir) => {
    if (v.capture.state !== "captured" || !capture.image || !v.artifacts.actualPng || !v.artifacts.actualHealth) return;
    // Both local artifacts must be ready before replacing either remote object. R2 pairs are not transactional.
    const png = await Bun.file(join(runDir, v.artifacts.actualPng)).arrayBuffer();
    const health = await Bun.file(join(runDir, v.artifacts.actualHealth)).arrayBuffer();
    const base = artifactPath("baseline", site.slug, v.viewport, key, "png").replace(/^baseline\//, "baselines/");
    await store.put(base, new Blob([png], { type: "image/png" }));
    await store.put(base.replace(/\.png$/, ".health.json"), new Blob([health], { type: "application/json" }));
  });
  (options.log ?? console.log)(`Baseline artifacts: ${result.runDir}`);
  return result;
}

if (import.meta.main) process.exitCode = await dispatch("baseline", process.argv.slice(2));
