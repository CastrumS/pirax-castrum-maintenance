// Weekly check summary email: a pure builder from the parsed check result { exitCode, report?, url? }. The input is a
// strict whitelist; anything malformed gives a fixed fallback that echoes no part of it. A valid body carries only the
// run time, exit meaning, site slugs, statuses, page-status counts, helper versions and the private report link: never
// site URLs, details (unknown helper details included), health or warnings. selftestInput is a synthetic result for the
// clearly labeled selftest email.
import type { Deployment } from "../../src/deployment.ts";
import { subjectTag } from "../../src/mail/imap.ts";
import { aggregateStatus, helperCounts, helperText, pageStatus, type ResultStatus } from "../../src/report/html.ts";
import { parseManifest, ReportError } from "../../src/report/manifest.ts";
import type { RunReport, ViewportResult } from "../../src/report/model.ts";

export type WeeklyMessage = { subject: string; text: string; valid: boolean };
type ExitCode = 0 | 1 | 2;
type WeeklyResult = { exitCode: ExitCode; report?: RunReport; url?: string };

const STATUSES: readonly ResultStatus[] = ["pass", "warning", "failure", "blocked"];
const TAIL: Record<ExitCode, string> = { 0: "passed", 1: "found problems", 2: "could not run" };
const MEANING: Record<ExitCode, string> = { 0: "no problems found", 1: "problems found, see the report", 2: "the check could not run" };
const object = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

function reportOf(value: unknown): RunReport | null {
  // parseManifest validates the report's content but not unknown top-level report keys, so whitelist those here.
  if (!object(value) || Object.keys(value).some((k) => k !== "runId" && k !== "sites" && k !== "helperVersion")) return null;
  try {
    return parseManifest({ schemaVersion: 1, command: "check", report: value }).report;
  } catch (error) {
    if (error instanceof ReportError) return null;
    throw error;
  }
}

function urlOk(value: unknown, runId: string): value is string {
  if (typeof value !== "string" || !URL.canParse(value)) return false;
  const url = new URL(value);
  return url.protocol === "https:" && url.pathname.endsWith(`/reports/${runId}/index.html`) && url.search !== "";
}

function parseResult(value: unknown): WeeklyResult | null {
  if (!object(value) || Object.keys(value).some((k) => k !== "exitCode" && k !== "report" && k !== "url")) return null;
  const { exitCode } = value;
  if (exitCode !== 0 && exitCode !== 1 && exitCode !== 2) return null;
  if (value.report === undefined) return value.url === undefined ? { exitCode } : null;
  const report = reportOf(value.report);
  if (!report) return null;
  if (value.url === undefined) return { exitCode, report };
  return urlOk(value.url, report.runId) ? { exitCode, report, url: value.url } : null;
}

const counts = (states: ResultStatus[]) => STATUSES.map((s) => [s, states.filter((x) => x === s).length] as const);

function sitesLines(report: RunReport): string[] {
  const siteStates = report.sites.map((site) => aggregateStatus(site.pages.map(pageStatus)));
  const current = report.helperVersion;
  const helpers = helperCounts(report);
  return [
    `Sites: ${report.sites.length} (${counts(siteStates).map(([s, n]) => `${s} ${n}`).join(", ")})`,
    ...(helpers === null ? [] : [helpers]),
    "",
    ...report.sites.map((site, i) => {
      const pages = counts(site.pages.map(pageStatus)).filter(([, n]) => n > 0).map(([s, n]) => `${n} ${s}`).join(", ");
      return `${site.slug}: ${siteStates[i]} (${site.pages.length} pages: ${pages})${site.helper && current !== undefined ? `; ${helperText(site.helper, current)}` : ""}`;
    }),
  ];
}

/** Subject and body for one weekly check result; malformed input gives the fixed fallback with valid false. */
export function formatWeekly(deployment: Deployment, input: unknown, ranAt: Date, selftestId?: string): WeeklyMessage {
  const zone = deployment.config.weeklyCheck.timeZone;
  const runTime = `Run time: ${new Intl.DateTimeFormat("en-GB", { timeZone: zone, dateStyle: "full", timeStyle: "short" }).format(ranAt)} (${zone}), ${ranAt.toISOString()} UTC`;
  const result = parseResult(input);
  const tail = result ? TAIL[result.exitCode] : "result unreadable";
  const label = selftestId ? `SELFTEST weekly check ${tail} ${subjectTag(selftestId)}` : `weekly check ${tail}`;
  const subject = `${deployment.config.notice.subjectPrefix} ${label}`;
  if (!result) return { subject, text: `${runTime}\nThe weekly check result could not be read, so this email has no site details. See the Actions run log.\n`, valid: false };
  const text = [
    ...(selftestId ? ["SELFTEST: synthetic result, no check ran.", ""] : []),
    runTime,
    `Result: exit ${result.exitCode}, ${MEANING[result.exitCode]}`,
    ...(result.report ? sitesLines(result.report) : ["Sites: not available"]),
    "",
    result.url ? `Report (7 days): ${result.url}` : "Report link: not available",
    "This link is private. Do not forward it.",
  ].join("\n");
  return { subject, text: `${text}\n`, valid: true };
}

const viewport = (name: ViewportResult["viewport"], visual: "same" | "changed"): ViewportResult => ({
  viewport: name,
  capture: { state: "captured", detail: null },
  visual: { state: visual, detail: null, baseline: { width: name === "desktop" ? 1440 : 390, height: 2 }, actual: { width: name === "desktop" ? 1440 : 390, height: 2 }, ratio: visual === "same" ? 0 : 0.5, allowance: 0.01 },
  health: [],
  warnings: [],
  artifacts: {},
});

/** A synthetic exit-1 result: selftest-alpha passes, selftest-beta fails on a changed desktop visual. */
export function selftestInput(runId: string): { exitCode: 1; report: RunReport; url: string } {
  const site = (slug: string, desktop: "same" | "changed") => ({ slug, url: `https://${slug}.invalid`, pages: [{ path: "/", pageKey: "home", viewports: { desktop: viewport("desktop", desktop), mobile: viewport("mobile", "same") } }] });
  return { exitCode: 1, report: { runId, sites: [site("selftest-alpha", "same"), site("selftest-beta", "changed")] }, url: `https://weekly-selftest.invalid/reports/${runId}/index.html?selftest=1` };
}
