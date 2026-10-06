// Re-audit failure notice: one bounded SMTP attempt to the fixed operator mailbox over Gmail implicit TLS,
// authenticated with IMAP_USER/IMAP_PASSWORD (the dedicated Gmail account and app password). The body is
// rendered only from a strictly validated FailureSummary: never a raw Error, vendor response or private URL.
// Errors name variables or a safe error code, never values. A failed send exits nonzero and never sends again.
//
// Usage:
//   bun --env-file=.env scripts/reaudit/notify.ts --selftest       one clearly labeled harmless notice; prints
//                                                                    its subject tag ID for a separate arrival check
//   bun --env-file=.env scripts/reaudit/notify.ts <summary.json>   send that summary; an invalid summary sends a
//                                                                    fixed fallback notice and still exits 1
//   bun scripts/reaudit/notify.ts --jobs <dir>                     reaudit.yml's notice job: REAUDIT_NEEDS (toJSON(needs))
//                                                                    names the failed job; this attempt's (GITHUB_RUN_ATTEMPT)
//                                                                    <dir>/reaudit-summary-<attempt>-<job>/summary.json is
//                                                                    sent, else a fixed per-job fallback
// Import-safe: nothing runs on import.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import nodemailer from "nodemailer";
import { EnvError, EnvFormatError, readEnv } from "../../src/env.ts";
import { addressPattern } from "../../src/forms/config.ts";
import { subjectTag } from "../../src/mail/imap.ts";

export const RECIPIENT = "piraxcastrum@gmail.com";
const REPO = "CastrumS/pirax-castrum-maintenance";
const SEND_TIMEOUT_MS = 90_000;

/** Structurally the five AUDITED_VERSIONS keys; the shared pin reader is not imported here. */
export const PIN_KEYS = ["gf", "ff", "ff_pro", "cleantalk", "fluent_smtp"] as const;
export type VersionMap = Record<(typeof PIN_KEYS)[number], string>;
export const STAGES = ["discovery", "setup", "download", "audit", "cleanup", "privacy", "bump", "push", "publication", "heartbeat", "watchdog", "notify-selftest", "unknown"] as const;
export const CLEANUP = ["confirmed", "failed", "unknown", "not-applicable"] as const;
/** Uncertainty-aware: anything not proven is "unknown", and "not-attempted" is only for runs that never reached publication. */
export const PUBLICATION = ["not-attempted", "unknown", "main-pushed", "tag-claimed", "release-incomplete", "published"] as const;

export type FailureSummary = {
  stage: (typeof STAGES)[number];
  /** Lowercase reason code, e.g. `download-failed`. */
  reason: string;
  oldVersions?: VersionMap;
  candidateVersions?: VersionMap;
  /** This repository's official Actions run URL. */
  runUrl?: string;
  cleanup?: (typeof CLEANUP)[number];
  publication?: (typeof PUBLICATION)[number];
  /** Intended pin commit for partial-publication recovery (plan D7): exactly 40 lowercase hex. */
  commit?: string;
  /** Intended release tag: `v` plus a stable dotted numeric helper version. */
  tag?: string;
  /** The throwaway Playground site whose GPL Vault activation may remain (plan D4): a loopback URL only. */
  site?: string;
};

export class NoticeError extends Error {}

const VERSION = /^(0|[1-9][0-9]*)(\.(0|[1-9][0-9]*)){1,3}$/;
const REASON = /^[a-z][a-z0-9-]{0,63}$/;
const COMMIT = /^[0-9a-f]{40}$/;
const TAG = new RegExp(`^v${VERSION.source.slice(1)}`);
const ATTEMPT = /^[1-9][0-9]{0,3}$/;
const RUN_URL = new RegExp(`^https://github\\.com/${REPO}/actions/runs/[1-9][0-9]{0,19}(?:/attempts/${ATTEMPT.source.slice(1, -1)})?$`);
const LOOPBACK = /^http:\/\/(?:127\.0\.0\.1|localhost|\[::1\]):([1-9][0-9]{0,4})$/;
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** A throwaway site's loopback URL (`http://127.0.0.1:<port>`), its safe recovery identifier; null for anything else. */
export function loopbackSite(value: unknown): string | null {
  const port = typeof value === "string" ? LOOPBACK.exec(value)?.[1] : undefined;
  return port && Number(port) <= 65535 ? (value as string) : null;
}

const invalid = (field: string) => new NoticeError(`invalid failure summary: ${field}`);

function versions(value: unknown, field: string): VersionMap {
  if (!isObject(value) || Object.keys(value).length !== PIN_KEYS.length || !PIN_KEYS.every((k) => typeof value[k] === "string" && VERSION.test(value[k] as string))) throw invalid(field);
  return Object.fromEntries(PIN_KEYS.map((k) => [k, value[k]])) as VersionMap;
}

/** Strict: unknown keys or any unsafe value throw a NoticeError naming the field only. */
export function parseFailureSummary(value: unknown): FailureSummary {
  if (!isObject(value)) throw invalid("not an object");
  const allowed = ["stage", "reason", "oldVersions", "candidateVersions", "runUrl", "cleanup", "publication", "commit", "tag", "site"];
  // Fixed message: a key's name is caller data and may be secret-shaped however harmless its characters look.
  if (Object.keys(value).some((k) => !allowed.includes(k))) throw invalid("unknown keys");
  const oneOf = <T extends readonly string[]>(list: T, field: string) => {
    const v = value[field];
    if (typeof v !== "string" || !list.includes(v)) throw invalid(field);
    return v as T[number];
  };
  const summary: FailureSummary = { stage: oneOf(STAGES, "stage"), reason: "" };
  if (typeof value.reason !== "string" || !REASON.test(value.reason)) throw invalid("reason");
  summary.reason = value.reason;
  if (value.oldVersions !== undefined) summary.oldVersions = versions(value.oldVersions, "oldVersions");
  if (value.candidateVersions !== undefined) summary.candidateVersions = versions(value.candidateVersions, "candidateVersions");
  if (value.runUrl !== undefined) {
    if (typeof value.runUrl !== "string" || !RUN_URL.test(value.runUrl)) throw invalid("runUrl");
    summary.runUrl = value.runUrl;
  }
  if (value.cleanup !== undefined) summary.cleanup = oneOf(CLEANUP, "cleanup");
  if (value.publication !== undefined) summary.publication = oneOf(PUBLICATION, "publication");
  for (const [field, pattern] of [["commit", COMMIT], ["tag", TAG]] as const) {
    const v = value[field];
    if (v === undefined) continue;
    if (typeof v !== "string" || !pattern.test(v)) throw invalid(field);
    summary[field] = v;
  }
  if (value.site !== undefined) {
    const site = loopbackSite(value.site);
    if (!site) throw invalid("site");
    summary.site = site;
  }
  return summary;
}

/** The official run URL from the Actions environment, or undefined outside this repository's runs. */
export function runUrlFromEnv(env: Record<string, string | undefined> = process.env): string | undefined {
  if (env.GITHUB_SERVER_URL !== "https://github.com" || env.GITHUB_REPOSITORY !== REPO) return undefined;
  const url = `https://github.com/${REPO}/actions/runs/${env.GITHUB_RUN_ID}${env.GITHUB_RUN_ATTEMPT && env.GITHUB_RUN_ATTEMPT !== "1" ? `/attempts/${env.GITHUB_RUN_ATTEMPT}` : ""}`;
  return RUN_URL.test(url) ? url : undefined;
}

const PUBLICATION_TEXT: Record<(typeof PUBLICATION)[number], string> = {
  "not-attempted": "No publication step was attempted by this run.",
  unknown: "Remote effect is not known; inspect main, tags and releases before any recovery.",
  "main-pushed": "The pin commit reached main but the release was not confirmed; inspect the remote tag and release, do not retry or delete blindly.",
  "tag-claimed": "The release tag was claimed but the release was not confirmed; inspect the remote tag and release, do not retry or delete blindly.",
  "release-incomplete": "A release exists but was not verified complete; inspect its assets, do not retry or delete blindly.",
  published: "The release was published and verified.",
};

/** Renders already-validated facts; the optional selftest tag lets a read-only mailbox lookup find this message. */
export function formatFailure(input: FailureSummary, selftestId?: string): { subject: string; text: string } {
  const s = parseFailureSummary(input);
  const publication = s.publication ?? "unknown";
  const table = (map: VersionMap | undefined) => (map ? PIN_KEYS.map((k) => `  ${k}: ${map[k]}`).join("\n") : "  not available");
  const label = selftestId ? `SELFTEST harmless notice, not a real failure ${subjectTag(selftestId)}` : `re-audit failed at ${s.stage}: ${s.reason}`;
  const text = [
    selftestId ? "SELFTEST: this is a harmless failure-path proof. No detection, commit or publication ran.\n" : "",
    `Stage: ${s.stage}`,
    `Reason: ${s.reason}`,
    `Run: ${s.runUrl ?? "not available"}`,
    `Cleanup: ${s.cleanup ?? "unknown"}`,
    `Publication: ${publication}. ${PUBLICATION_TEXT[publication]}`,
    ...(s.commit ? [`Intended commit: ${s.commit}`] : []),
    ...(s.tag ? [`Intended tag: ${s.tag}`] : []),
    ...(s.site ? [`Throwaway site: ${s.site}. Its GPL Vault activation may remain: deactivate this site in the GPL Vault account before the next run (README, Automatic re-audit).`] : []),
    "",
    "Audited (old) versions:",
    table(s.oldVersions),
    "Candidate versions:",
    table(s.candidateVersions),
    "",
    "Details stay in the run's sanitized logs; this notice carries no credentials or vendor output.",
  ].join("\n").trimStart();
  return { subject: `[pirax-audit] ${label}`, text: `${text}\n` };
}

// Finite allowlists: a name or code set by arbitrary code is caller data, whatever its characters look like.
const ERROR_NAMES = ["Error", "TypeError", "RangeError", "SyntaxError", "AbortError", "TimeoutError"];
/** Public nodemailer SMTP and Node network error codes. */
const ERROR_CODES = ["EAUTH", "ECONNECTION", "ETIMEDOUT", "ESOCKET", "EDNS", "ETLS", "EPROTOCOL", "EENVELOPE", "EMESSAGE", "ESTREAM", "ECONFIG", "ENOAUTH", "EMAXLIMIT", "ECONNREFUSED", "ECONNRESET", "ECONNABORTED", "ENOTFOUND", "EAI_AGAIN", "EHOSTUNREACH", "ENETUNREACH", "EPIPE", "ERR_TLS_CERT_ALTNAME_INVALID"];

/** Safe description of any thrown value: our messages, or an allowlisted error name plus an allowlisted public code. */
export function safeError(e: unknown): string {
  if (e instanceof NoticeError || e instanceof EnvError || e instanceof EnvFormatError) return e.message;
  const name = e instanceof Error && ERROR_NAMES.includes(e.name) ? e.name : "Error";
  const code = (e as { code?: unknown })?.code;
  return typeof code === "string" && ERROR_CODES.includes(code) ? `${name} (${code})` : name;
}

type SendOptions = { selftestId?: string; createTransport?: typeof nodemailer.createTransport; timeoutMs?: number };

/** Exactly one bounded send to RECIPIENT; throws a NoticeError with safe facts on any failure. */
export async function sendFailure(summary: FailureSummary, env: Record<string, string | undefined> = process.env, { selftestId, createTransport = nodemailer.createTransport, timeoutMs = SEND_TIMEOUT_MS }: SendOptions = {}): Promise<{ accepted: number; rejected: number }> {
  const { subject, text } = formatFailure(summary, selftestId);
  const creds = readEnv(env, { IMAP_USER: (v) => addressPattern.test(v), IMAP_PASSWORD: (v) => !/[\u0000-\u001f\u007f]/.test(v) });
  const transport = createTransport({ host: "smtp.gmail.com", port: 465, secure: true, auth: { user: creds.IMAP_USER, pass: creds.IMAP_PASSWORD }, logger: false, debug: false, connectionTimeout: 20_000, greetingTimeout: 20_000, socketTimeout: 45_000 });
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const info = await Promise.race([
      transport.sendMail({ from: creds.IMAP_USER, to: RECIPIENT, subject, text }),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new NoticeError(`notice: SMTP send timed out after ${timeoutMs} ms`)), timeoutMs); }),
    ]);
    const accepted = Array.isArray(info?.accepted) ? info.accepted.length : 0;
    const rejected = Array.isArray(info?.rejected) ? info.rejected.length : 0;
    if (accepted !== 1 || rejected !== 0) throw new NoticeError(`notice: SMTP did not accept the recipient (accepted ${accepted}, rejected ${rejected})`);
    return { accepted, rejected };
  } catch (e) {
    throw e instanceof NoticeError ? e : new NoticeError(`notice: SMTP send failed: ${safeError(e)}`);
  } finally {
    clearTimeout(timer);
    transport.close();
  }
}

// reaudit.yml's notice job sends exactly one notice per run: the first failed or cancelled job in this order.
const NOTICE_JOBS = ["publish", "audit", "heartbeat"] as const;
const JOB_FALLBACK: Record<(typeof NOTICE_JOBS)[number], Omit<FailureSummary, "reason">> = {
  // The audit job also owns setup (checkout, toolchain, install): a failure there leaves no summary.
  audit: { stage: "setup", cleanup: "unknown", publication: "not-attempted" },
  publish: { stage: "publication", cleanup: "not-applicable", publication: "unknown" },
  heartbeat: { stage: "heartbeat", cleanup: "not-applicable", publication: "unknown" },
};
/** The failed job's own valid summary, else fixed safe text for that job; never a raw or partially valid summary. */
export function chooseNotice(needs: unknown, summaries: Partial<Record<string, unknown>>, runUrl?: string): FailureSummary {
  const url = runUrl ? { runUrl } : {};
  for (const job of NOTICE_JOBS) {
    const result = (needs as Record<string, { result?: unknown } | undefined> | null)?.[job]?.result;
    if (result !== "failure" && result !== "cancelled") continue;
    try {
      const summary = parseFailureSummary(summaries[job]);
      return { ...url, ...summary };
    } catch {
      return { ...JOB_FALLBACK[job], reason: `${job}-job-${result}`, ...url };
    }
  }
  return { stage: "unknown", reason: "no-failed-job-identified", cleanup: "unknown", publication: "unknown", ...url };
}

/**
 * The downloaded summaries of this run attempt only (`<dir>/reaudit-summary-<attempt>-<job>/summary.json`). A rerun
 * keeps its run ID and earlier attempts' artifacts, so an absent or malformed attempt reads nothing: an earlier
 * attempt's summary (say, with confirmed cleanup) can never describe this one.
 */
export function readSummaries(dir: string, attempt: string | undefined): Partial<Record<string, unknown>> {
  const summaries: Record<string, unknown> = {};
  if (!attempt || !ATTEMPT.test(attempt)) return summaries;
  for (const job of NOTICE_JOBS)
    try {
      summaries[job] = JSON.parse(readFileSync(join(dir, `reaudit-summary-${attempt}-${job}`, "summary.json"), "utf8"));
    } catch {}
  return summaries;
}

function newId(): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  let id = "";
  while (id.length < 12) { const b = crypto.getRandomValues(new Uint8Array(1))[0]!; if (b < 252) id += alphabet[b % 36]; }
  return id;
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const jobs = args[0] === "--jobs" && args.length === 2;
  if (!jobs && (args.length !== 1 || (args[0]!.startsWith("-") && args[0] !== "--selftest"))) {
    console.error("usage: bun scripts/reaudit/notify.ts --selftest | <summary.json> | --jobs <summary-dir>");
    process.exit(2);
  }
  const runUrl = runUrlFromEnv();
  let summary: FailureSummary;
  let exitCode = 0;
  let selftestId: string | undefined;
  if (jobs) {
    let needs: unknown = null;
    try {
      needs = JSON.parse(process.env.REAUDIT_NEEDS ?? "");
    } catch {
      console.error("notify: REAUDIT_NEEDS is not JSON; sending the fixed fallback notice");
    }
    summary = chooseNotice(needs, readSummaries(args[1]!, process.env.GITHUB_RUN_ATTEMPT), runUrl);
  } else if (args[0] === "--selftest") {
    selftestId = newId();
    summary = { stage: "notify-selftest", reason: "selftest", cleanup: "not-applicable", publication: "not-attempted", ...(runUrl && { runUrl }) };
  } else {
    try {
      summary = parseFailureSummary(JSON.parse(readFileSync(args[0]!, "utf8")));
    } catch (e) {
      console.error(`notify: ${e instanceof NoticeError ? e.message : "summary file unreadable or not JSON"}; sending the fixed fallback notice`);
      summary = { stage: "unknown", reason: "invalid-summary", cleanup: "unknown", publication: "unknown", ...(runUrl && { runUrl }) };
      exitCode = 1;
    }
  }
  try {
    const facts = await sendFailure(summary, process.env, { selftestId });
    console.log(JSON.stringify({ smtpAttempts: 1, smtpAccepted: true, ...facts, stage: summary.stage, ...(selftestId && { selftestId }) }));
  } catch (e) {
    console.error(JSON.stringify({ smtpAttempts: e instanceof EnvError || e instanceof EnvFormatError ? 0 : 1, smtpAccepted: false, stage: summary.stage, error: safeError(e) }));
    exitCode = 1;
  }
  process.exit(exitCode);
}
