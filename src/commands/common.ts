import { existsSync, mkdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { combineMasks, MaskSelectorError, openCaptureSession, type CaptureResult, type CaptureSession, type SessionOptions } from "../capture.ts";
import { EnvError, EnvFormatError, readR2Config } from "../env.ts";
import { evaluateHealth } from "../health.ts";
import { loadSites, pageKey, SitesConfigError, type Site } from "../sites.ts";
import { createStore, isRunId, type Store } from "../store.ts";
import { artifactPath, ReportError, viewportNames } from "../report/manifest.ts";
import { reportStatus } from "../report/html.ts";
import { saveArtifact } from "../report/writer.ts";
import type { RunReport, ViewportResult } from "../report/model.ts";
import type { FormsOptions } from "../forms/runner.ts";
import { secretRedactor } from "../forms/evidence.ts";

export type Command = "baseline" | "check" | "approve" | "forms";
export type ExitCode = 0 | 1 | 2;
export type RunOptions = { runsDir?: string; runId?: string; browser?: SessionOptions; forms?: Omit<FormsOptions, "runDir">; log?: (message: string) => void };
export type CommandResult = { exitCode: ExitCode; report?: RunReport; runDir?: string; localPath?: string; url?: string };
export class UsageError extends Error {}
export type Arguments = { target: string; pagePath?: string; sitesFile?: string };

export function parseArgs(command: Command, args: string[]): Arguments {
  if (!["baseline", "check", "approve", "forms"].includes(command)) throw new UsageError("unknown command");
  const positional: string[] = [];
  let sitesFile: string | undefined;
  for (let i = 0; i < args.length; i++) {
    const value = args[i]!;
    if (value === "--sites") {
      if (sitesFile !== undefined || !args[i + 1] || args[i + 1]!.startsWith("--")) throw new UsageError("--sites requires one file, supplied once");
      sitesFile = args[++i];
    } else if (value.startsWith("-")) throw new UsageError("unsupported command option");
    else positional.push(value);
  }
  if (positional.length < 1 || positional.length > (command === "approve" ? 2 : 1)) throw new UsageError(`usage: ${command} <${command === "approve" ? "slug> [pagePath]" : "slug|all>"} [--sites file]`);
  const target = positional[0]!;
  if (command === "approve" && target === "all") throw new UsageError("approve requires one site slug; all is not supported");
  return { target, ...(positional[1] !== undefined ? { pagePath: positional[1] } : {}), ...(sitesFile !== undefined ? { sitesFile } : {}) };
}
export function selectSites(sites: Site[], target: string): Site[] {
  if (target === "all") return sites;
  const site = sites.find(s => s.slug === target);
  if (!site) throw new UsageError("unknown site slug");
  return [site];
}

/** Unknown errors never expose storage endpoints, credentials, bucket names or raw SDK messages. */
export function safeError(error: unknown): string {
  const redact = secretRedactor();
  if (error instanceof UsageError || error instanceof SitesConfigError || error instanceof EnvError || error instanceof EnvFormatError || error instanceof MaskSelectorError || error instanceof ReportError) return redact(error.message);
  const code = (error as { code?: unknown } | null)?.code;
  return redact(typeof code === "string" && /^[A-Za-z0-9_]{1,64}$/.test(code) ? `operation failed (${code})` : "operation failed");
}
export const configurationError = (error: unknown) => error instanceof UsageError || error instanceof SitesConfigError || error instanceof EnvError || error instanceof EnvFormatError || error instanceof MaskSelectorError;

/** Harness seam: supply a real scoped Store and browser/run options; CLI has no scope/TLS bypass flags. */
export async function dispatch(command: Command, args: string[], options: RunOptions & { store?: Store } = {}): Promise<ExitCode> {
  const log = options.log ?? console.log;
  try {
    const parsed = parseArgs(command, args);
    const sites = selectSites(loadSites(parsed.sitesFile), parsed.target);
    if (parsed.pagePath !== undefined && !sites[0]!.pages.some(p => p.path === parsed.pagePath)) throw new UsageError("requested page is not in the current site list");
    if (!sites.length) { log("No sites selected."); return 0; }
    const store = options.store ?? createStore({ config: readR2Config() });
    if (command === "baseline") return (await (await import("./baseline.ts")).runBaseline(sites, store, options)).exitCode;
    if (command === "check") return (await (await import("./check.ts")).runCheck(sites, store, options)).exitCode;
    if (command === "forms") return (await (await import("./forms.ts")).runForms(sites, store, options)).exitCode;
    return (await (await import("./approve.ts")).runApprove(sites[0]!, store, { pagePath: parsed.pagePath, log })).exitCode;
  } catch (error) {
    log(`${command}: ${safeError(error)}`);
    return configurationError(error) ? 2 : 1;
  }
}

type ConsumeCapture = (site: Site, key: string, capture: CaptureResult, result: ViewportResult, runDir: string) => Promise<void>;
/** Shared sequential production capture path, with one browser and all selectors preflighted. */
export async function captureSelection(sites: Site[], options: RunOptions, consume: ConsumeCapture): Promise<Required<Pick<CommandResult, "report" | "runDir" | "exitCode">>> {
  const runId = options.runId ?? new Date().toISOString().replaceAll(":", "-");
  if (!isRunId(runId)) throw new UsageError("runId must be a canonical timestamp");
  const runDir = resolve(options.runsDir ?? "runs", runId);
  // Do not silently mix local files from separate executions sharing a timestamp.
  if (existsSync(runDir)) throw new ReportError("run directory already exists; use a fresh run ID");
  mkdirSync(runDir, { recursive: true });
  const report: RunReport = { runId, sites: [] };
  let session: CaptureSession | undefined;
  let operationalFailure = false;
  try {
    try { session = await openCaptureSession(options.browser); }
    catch { operationalFailure = true; }
    if (session) await session.validateMasks(sites.flatMap(s => s.pages.flatMap(p => combineMasks(s, p))));
    for (const site of sites) {
      const result = { slug: site.slug, url: site.url, pages: [] as RunReport["sites"][number]["pages"] };
      report.sites.push(result);
      for (const page of site.pages) {
        const key = pageKey(page.path);
        const viewports = {} as Record<"desktop" | "mobile", ViewportResult>;
        result.pages.push({ path: page.path, pageKey: key, viewports });
        for (const name of viewportNames) {
          const trace = artifactPath("traces", site.slug, name, key, "trace.zip");
          let capture: CaptureResult;
          try {
            if (!session) throw new Error("browser unavailable");
            capture = await session.capture({ url: site.url + page.path, viewport: name, masks: combineMasks(site, page), tracePath: join(runDir, trace) });
          } catch (error) {
            if (configurationError(error)) throw error;
            capture = { state: "error", detail: "Browser/capture operation failed.", image: null, health: { status: null, finalUrl: site.url + page.path, criticalError: false, consoleErrors: [], failedRequests: [], mixedContent: [] }, warnings: [], tracePath: null };
          }
          const v: ViewportResult = {
            viewport: name, capture: { state: capture.state, detail: capture.detail },
            visual: { state: "not-compared", detail: null, baseline: null, actual: capture.image ? { width: capture.image.width, height: capture.image.height } : null, ratio: null, allowance: site.max_diff_pixel_ratio },
            health: evaluateHealth(capture.health, null), warnings: capture.warnings, artifacts: {},
          };
          viewports[name] = v;
          if (capture.tracePath && existsSync(join(runDir, trace))) v.artifacts.trace = trace;
          try {
            const healthPath = artifactPath("actual", site.slug, name, key, "health.json");
            await saveArtifact(runDir, healthPath, JSON.stringify(capture.health, null, 2) + "\n");
            v.artifacts.actualHealth = healthPath;
            if (capture.state === "captured" && capture.image) {
              const pngPath = artifactPath("actual", site.slug, name, key, "png");
              await saveArtifact(runDir, pngPath, capture.image.png);
              v.artifacts.actualPng = pngPath;
            } else if (capture.state === "captured") {
              v.capture = { state: "error", detail: "Capture is incomplete: PNG is unavailable." };
            }
            await consume(site, key, capture, v, runDir);
          } catch (error) {
            if (configurationError(error)) throw error;
            v.visual.state = "error";
            v.visual.detail = `Artifact/storage ${safeError(error)}`;
          }
          (options.log ?? console.log)(`${site.slug} ${page.path} ${name}: capture ${v.capture.state}, visual ${v.visual.state}, health ${v.health.some(h => h.severity === "failure") ? "failure" : v.health.length ? "warning" : "pass"}${v.visual.detail ? ` — ${v.visual.detail}` : ""}`);
        }
      }
    }
  } finally {
    if (session) try { await session.close(); } catch { operationalFailure = true; (options.log ?? console.log)("Browser close failed."); }
  }
  return { report, runDir, exitCode: operationalFailure || ["failure", "blocked"].includes(reportStatus(report)) ? 1 : 0 };
}
