// Same-host schedule watchdog for reaudit.yml: read-only gh GET lookups of the workflow's state and its
// latest started schedule/manual run. Disabled, overdue (>48h since the last start), missing history after
// the install grace, or any missing/malformed/failed Actions fact is unhealthy and attempts one safe notice.
// A failed recent audit still proves the scheduler is alive; failed-run notices belong to reaudit.yml itself.
// Limitation: it runs on the same GitHub Actions scheduler, so a total scheduler outage silences both.
//
// Usage: bun --env-file=.env scripts/reaudit/watchdog.ts [--no-notify]   exit 0 healthy, 1 unhealthy
// Import-safe: nothing runs on import.
import { CLOCK_SKEW_MS, parseInstant, safeChildEnv } from "./heartbeat.ts";
import { runUrlFromEnv, safeError, sendFailure, type FailureSummary } from "./notify.ts";

export const OVERDUE_MS = 48 * 3_600_000;
const API = "repos/CastrumS/pirax-castrum-maintenance/actions/workflows/reaudit.yml";
const WORKFLOW_PATH = ".github/workflows/reaudit.yml";
const STATES = ["active", "disabled_manually", "disabled_inactivity", "disabled_fork", "deleted"] as const;

export type Gh = (args: string[]) => { code: number | null; stdout: string };
export type WatchdogFacts = { state: (typeof STATES)[number]; createdAt: number; lastStartedAt: number | null };
export type WatchdogReason = "healthy" | "awaiting-first-run" | "audit-overdue" | "no-audit-history" | "workflow-missing" | "actions-query-failed" | "actions-response-invalid" | `workflow-${string}`;
export type WatchdogDecision = { healthy: boolean; reason: WatchdogReason };

class InvalidResponse extends Error {}
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
function finiteClock(now: number) {
  if (!Number.isFinite(now)) throw new RangeError("clock is not a finite time");
}
function instant(v: unknown, now: number): number {
  if (typeof v !== "string") throw new InvalidResponse();
  const t = parseInstant(v);
  if (t - now > CLOCK_SKEW_MS) throw new InvalidResponse();
  return t;
}

/** Validates the workflow and runs responses; anything unexpected throws. */
export function normalizeWatchdogFacts(workflow: unknown, runs: unknown, now: number): WatchdogFacts {
  finiteClock(now);
  if (!isObject(workflow) || workflow.path !== WORKFLOW_PATH || !STATES.includes(workflow.state as never)) throw new InvalidResponse();
  if (!isObject(runs) || !Array.isArray(runs.workflow_runs)) throw new InvalidResponse();
  let lastStartedAt: number | null = null;
  for (const run of runs.workflow_runs) {
    if (!isObject(run) || typeof run.event !== "string") throw new InvalidResponse();
    const started = instant(run.run_started_at, now);
    if ((run.event === "schedule" || run.event === "workflow_dispatch") && (lastStartedAt === null || started > lastStartedAt)) lastStartedAt = started;
  }
  return { state: workflow.state as WatchdogFacts["state"], createdAt: instant(workflow.created_at, now), lastStartedAt };
}

/** Pure decision; the conclusion of the last run is deliberately ignored. A nonfinite clock throws. */
export function decideWatchdog(facts: WatchdogFacts, now: number): WatchdogDecision {
  finiteClock(now);
  if (facts.state !== "active") return { healthy: false, reason: `workflow-${facts.state.replace("_", "-")}` };
  if (facts.lastStartedAt === null) return now - facts.createdAt > OVERDUE_MS ? { healthy: false, reason: "no-audit-history" } : { healthy: true, reason: "awaiting-first-run" };
  return now - facts.lastStartedAt > OVERDUE_MS ? { healthy: false, reason: "audit-overdue" } : { healthy: true, reason: "healthy" };
}

const realGh: Gh = (args) => {
  const p = Bun.spawnSync(["gh", ...args], { env: safeChildEnv(), stdout: "pipe", stderr: "pipe", timeout: 60_000 });
  return { code: p.exitCode, stdout: p.stdout.toString() };
};

/** GET with headers; returns the HTTP status and parsed body, or a failure reason. Never surfaces stderr. */
function get(gh: Gh, path: string): { status: number; body: unknown } | WatchdogReason {
  const r = gh(["api", "--include", path]);
  const split = r.stdout.search(/\r?\n\r?\n/);
  const status = Number(/^HTTP\/[\d.]+ (\d{3})/.exec(r.stdout)?.[1]);
  if (!status || split < 0) return "actions-query-failed";
  if (status !== 200) return { status, body: null };
  if (r.code !== 0) return "actions-query-failed";
  try { return { status, body: JSON.parse(r.stdout.slice(split).trim()) }; }
  catch { return "actions-response-invalid"; }
}

export function observe(gh: Gh, now: number): WatchdogDecision {
  const workflow = get(gh, API);
  if (typeof workflow === "string") return { healthy: false, reason: workflow };
  if (workflow.status === 404) return { healthy: false, reason: "workflow-missing" };
  if (workflow.status !== 200) return { healthy: false, reason: "actions-query-failed" };
  const runs = get(gh, `${API}/runs?per_page=50`);
  if (typeof runs === "string") return { healthy: false, reason: runs };
  if (runs.status !== 200) return { healthy: false, reason: "actions-query-failed" };
  try { return decideWatchdog(normalizeWatchdogFacts(workflow.body, runs.body, now), now); }
  catch { return { healthy: false, reason: "actions-response-invalid" }; }
}

type WatchdogOptions = { now: number; gh?: Gh; notify?: ((s: FailureSummary) => Promise<unknown>) | null; env?: Record<string, string | undefined> };
/** One observation; unhealthy attempts exactly one notice (none when notify is null). */
export async function runWatchdog({ now, gh = realGh, notify = sendFailure, env = process.env }: WatchdogOptions): Promise<WatchdogDecision & { notice: "not-needed" | "sent" | "failed" | "skipped" }> {
  const decision = observe(gh, now);
  if (decision.healthy) return { ...decision, notice: "not-needed" };
  if (!notify) return { ...decision, notice: "skipped" };
  const runUrl = runUrlFromEnv(env);
  try {
    await notify({ stage: "watchdog", reason: decision.reason, ...(runUrl && { runUrl }), cleanup: "not-applicable", publication: "not-attempted" });
    return { ...decision, notice: "sent" };
  } catch (e) {
    console.error(`watchdog: notice not sent: ${safeError(e)}`);
    return { ...decision, notice: "failed" };
  }
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  if (args.length > 1 || (args.length === 1 && args[0] !== "--no-notify")) {
    console.error("usage: bun scripts/reaudit/watchdog.ts [--no-notify]");
    process.exit(2);
  }
  const result = await runWatchdog({ now: Date.now(), notify: args.length ? null : sendFailure });
  console.log(JSON.stringify(result));
  process.exit(result.healthy ? 0 : 1);
}
