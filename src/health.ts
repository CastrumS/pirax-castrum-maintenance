/** Raw health of one captured page, persisted verbatim as `<pageKey>.health.json`. */
export type HealthSnapshot = {
  /** Final main-document HTTP status, null when no response arrived. */
  status: number | null;
  finalUrl: string;
  criticalError: boolean;
  consoleErrors: string[];
  /** Subresource HTTP >= 400 responses, or `status: null` for transport failures. */
  failedRequests: { url: string; status: number | null }[];
  /** HTTP resources referenced by a final HTTPS document. */
  mixedContent: string[];
};

export type Severity = "warning" | "failure";

export type HealthFinding = {
  severity: Severity;
  kind: "status" | "critical-error" | "console-error" | "failed-request" | "mixed-content";
  detail: string;
};

export class HealthFormatError extends Error {
  constructor(field: string, detail: string) {
    super(`health: ${field}: ${detail}`);
    this.name = "HealthFormatError";
  }
}

export const CRITICAL_ERROR_PHRASE = "There has been a critical error on this website";

type FailedRequest = HealthSnapshot["failedRequests"][number];
const requestKey = (r: FailedRequest) => `${r.status ?? ""} ${r.url}`;
const sortedUnique = (xs: string[]) => [...new Set(xs)].sort();

/** Deduplicates and deterministically sorts every list, keeping query strings and statuses distinct. */
export function normalizeHealth(h: HealthSnapshot): HealthSnapshot {
  const requests = new Map(h.failedRequests.map((r) => [JSON.stringify([r.url, r.status]), { url: r.url, status: r.status }]));
  return {
    status: h.status,
    finalUrl: h.finalUrl,
    criticalError: h.criticalError,
    consoleErrors: sortedUnique(h.consoleErrors),
    failedRequests: [...requests.values()].sort((a, b) =>
      a.url < b.url ? -1 : a.url > b.url ? 1 : (a.status ?? -1) - (b.status ?? -1),
    ),
    mixedContent: sortedUnique(h.mixedContent),
  };
}

/**
 * Findings for `actual`, relative to an optional baseline. HTTP >= 400, critical errors and mixed
 * content always fail. Console errors and failed URL/status pairs already in the baseline are
 * warnings; new ones fail; ones only in the baseline are not reported.
 */
export function evaluateHealth(actual: HealthSnapshot, baseline: HealthSnapshot | null): HealthFinding[] {
  const findings: HealthFinding[] = [];
  const fail = (kind: HealthFinding["kind"], detail: string) => findings.push({ severity: "failure", kind, detail });
  const known = (seen: boolean): Severity => (seen ? "warning" : "failure");

  if (actual.status === null) fail("status", `no HTTP response for ${actual.finalUrl}`);
  else if (actual.status >= 400) fail("status", `HTTP ${actual.status} for ${actual.finalUrl}`);
  if (actual.criticalError) fail("critical-error", `page shows "${CRITICAL_ERROR_PHRASE}"`);
  for (const url of sortedUnique(actual.mixedContent)) fail("mixed-content", `insecure resource ${url}`);

  const oldConsole = new Set(baseline?.consoleErrors);
  for (const message of sortedUnique(actual.consoleErrors)) {
    findings.push({ severity: known(oldConsole.has(message)), kind: "console-error", detail: message });
  }
  const oldRequests = new Set(baseline?.failedRequests.map(requestKey));
  for (const r of normalizeHealth(actual).failedRequests) {
    const what = r.status === null ? "transport failure" : `HTTP ${r.status}`;
    findings.push({ severity: known(oldRequests.has(requestKey(r))), kind: "failed-request", detail: `${what} ${r.url}` });
  }
  return findings;
}

/** Validates parsed `.health.json` content; throws `HealthFormatError` naming the bad field. */
export function parseHealth(value: unknown): HealthSnapshot {
  const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
  const isStatus = (v: unknown) => v === null || Number.isInteger(v);
  const strings = (v: unknown) => Array.isArray(v) && v.every((s) => typeof s === "string");
  if (!isObj(value)) throw new HealthFormatError("<root>", "must be an object");

  const keys = ["status", "finalUrl", "criticalError", "consoleErrors", "failedRequests", "mixedContent"];
  for (const key of Object.keys(value)) if (!keys.includes(key)) throw new HealthFormatError(key, "unknown key");
  const { status, finalUrl, criticalError, consoleErrors, failedRequests, mixedContent } = value;
  if (!isStatus(status)) throw new HealthFormatError("status", "must be an integer or null");
  if (typeof finalUrl !== "string") throw new HealthFormatError("finalUrl", "must be a string");
  if (typeof criticalError !== "boolean") throw new HealthFormatError("criticalError", "must be a boolean");
  if (!strings(consoleErrors)) throw new HealthFormatError("consoleErrors", "must be a list of strings");
  const requestOk = (r: unknown) => isObj(r) && Object.keys(r).length === 2 && typeof r.url === "string" && isStatus(r.status);
  if (!Array.isArray(failedRequests) || !failedRequests.every(requestOk)) {
    throw new HealthFormatError("failedRequests", "must be a list of {url, status}");
  }
  if (!strings(mixedContent)) throw new HealthFormatError("mixedContent", "must be a list of strings");
  return normalizeHealth(value as HealthSnapshot);
}
