import { SLUG } from "../sites.ts";
import type { Store } from "../store.ts";

/** A site may await a helper audit this long; strictly longer fails. */
export const AWAITING_AUDIT_LIMIT_MS = 72 * 60 * 60 * 1000;

/** Relative to the command's Store root, outside `reports/` retention. */
export function awaitingAuditKey(slug: string): string {
  if (!SLUG.test(slug)) throw new Error("invalid site slug for awaiting-audit state");
  return `state/awaiting-audit/${slug}.json`;
}

/** First-seen time from `{"firstSeen": <canonical UTC ISO>}`, or null if malformed, noncanonical or after now. */
export function parseFirstSeen(bytes: Uint8Array, nowMs: number): number | null {
  try {
    const value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).length !== 1 || typeof value.firstSeen !== "string") return null;
    const ms = Date.parse(value.firstSeen);
    return Number.isFinite(ms) && new Date(ms).toISOString() === value.firstSeen && ms <= nowMs ? ms : null;
  } catch { return null; }
}

export function formatElapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 86400)}d ${Math.floor(s / 3600) % 24}h ${Math.floor(s / 60) % 60}m ${s % 60}.${String(ms % 1000).padStart(3, "0")}s`;
}

export function describeAwaiting(firstSeenMs: number, nowMs: number): { failed: boolean; note: string } {
  const elapsed = nowMs - firstSeenMs, since = new Date(firstSeenMs).toISOString();
  return elapsed > AWAITING_AUDIT_LIMIT_MS
    ? { failed: true, note: `Awaiting audit for ${formatElapsed(elapsed)} since ${since}, exceeding the threshold of 72 hours.` }
    : { failed: false, note: `Awaiting audit since ${since} (${formatElapsed(elapsed)}); fails after 72 hours.` };
}

const UNREADABLE = "Awaiting-audit state could not be read; counted as a first sighting.";
const INVALID = "Stored awaiting-audit state was invalid; counted as a first sighting.";
const UNSAVED = "Awaiting-audit first sighting could not be saved; the 72-hour clock may not have started.";
const UNCLEARED = "Awaiting-audit state could not be cleared; retried on the next pass without an awaiting-audit result.";

/**
 * Reconciles one completed site forms pass with its persisted clock. Any raw `awaiting-audit` row keeps
 * (or starts) the clock and is aged, becoming `failed` past the limit; no such row clears it. Storage
 * failures never throw or escalate: they return fixed diagnostics and note them on the affected rows.
 * ponytail: no conditional writes or lock; overlapping runs for one slug may race first write/clear.
 */
export async function reconcileAwaitingAudit(slug: string, results: { outcome: string; detail: string }[], store: Store, nowMs: number): Promise<string[]> {
  const key = awaitingAuditKey(slug);
  const sightings = results.filter(r => r.outcome === "awaiting-audit");
  let present: boolean | undefined;
  try { present = (await store.list(key)).includes(key); } catch { /* unknown */ }
  if (!sightings.length) {
    if (present === false) return [];
    try { if (present) { await store.delete(key); return []; } } catch { /* disclosed below */ }
    if (results[0]) results[0].detail += ` ${UNCLEARED}`;
    return [UNCLEARED];
  }
  const diagnostics: string[] = [];
  let firstSeen: number | null = null;
  if (present === undefined) diagnostics.push(UNREADABLE);
  else if (present) {
    try { firstSeen = parseFirstSeen(await store.get(key), nowMs); if (firstSeen === null) diagnostics.push(INVALID); }
    catch { diagnostics.push(UNREADABLE); }
  }
  if (firstSeen === null) {
    firstSeen = nowMs;
    try { await store.put(key, new Blob([JSON.stringify({ firstSeen: new Date(nowMs).toISOString() })], { type: "application/json" })); }
    catch { diagnostics.push(UNSAVED); }
  }
  const { failed, note } = describeAwaiting(firstSeen, nowMs);
  for (const r of sightings) {
    r.detail = [r.detail, note, ...diagnostics].join(" ");
    if (failed) r.outcome = "failed";
  }
  return diagnostics;
}
