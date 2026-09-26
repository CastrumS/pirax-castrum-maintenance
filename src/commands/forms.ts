import { existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { secretRedactor } from "../forms/evidence.ts";
import { populateForms } from "../forms/runner.ts";
import { reportStatus } from "../report/html.ts";
import { ReportError } from "../report/manifest.ts";
import type { FormsRunReport } from "../report/model.ts";
import { publishReport, writeLocalReport } from "../report/writer.ts";
import { pageKey, type Site } from "../sites.ts";
import { isRunId, type Store } from "../store.ts";
import { configurationError, dispatch, safeError, UsageError, type ExitCode, type RunOptions } from "./common.ts";

export type FormsCommandResult = { exitCode: ExitCode; report?: FormsRunReport; runDir?: string; localPath?: string; url?: string };
/** No captureSelection, image comparison, baseline access or mobile pass. */
export async function runForms(sites: Site[], store: Store, options: RunOptions = {}): Promise<FormsCommandResult> {
  if (!sites.length) return { exitCode: 0 };
  const redact = secretRedactor();
  const log = (message: string) => (options.log ?? console.log)(redact(message));
  const result: FormsCommandResult = { exitCode: 1 };
  try {
    const runId = options.runId ?? new Date().toISOString().replaceAll(':', '-');
    if (!isRunId(runId)) throw new UsageError('runId must be a canonical timestamp');
    const runDir = resolve(options.runsDir ?? 'runs', runId);
    if (existsSync(runDir)) throw new ReportError('run directory already exists; use a fresh run ID');
    if (redact(runDir) !== runDir || redact(JSON.stringify(sites)) !== JSON.stringify(sites)) throw new UsageError('Site/run identity contains configured private data; use non-secret identities.');
    mkdirSync(runDir, { recursive: true, mode: 0o700 });
    result.runDir = runDir;
    result.report = { mode: 'forms', runId, sites: sites.map(s => ({ slug: s.slug, url: s.url, pages: s.pages.map(p => ({ path: p.path, pageKey: pageKey(p.path), forms: [] })) })) };
    await populateForms(sites, result.report, { ...options.forms, runDir });
    result.exitCode = reportStatus(result.report) === 'failure' ? 1 : 0;
    result.localPath = await writeLocalReport(result.report, runDir);
    log(`Local report: ${result.localPath}`);
    result.url = await publishReport(result.report, runDir, store);
    log("Private report published; bearer link withheld from logs. Open the local report above.");
  } catch (error) {
    result.exitCode = configurationError(error) ? 2 : 1;
    log(`forms: ${safeError(error)}${result.runDir ? `. Local artifacts: ${result.runDir}` : ''}`);
  }
  return result;
}
if (import.meta.main) process.exitCode = await dispatch('forms', process.argv.slice(2));
