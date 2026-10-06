// Re-audit decisions (plan D6): pure functions over explicit facts, no IO.
//   decideAudit(facts)          failed | unchanged | audited-candidate. Every gate is a literal; a missing or other
//                               value fails, so no default, `always()` path or partial result can authorize publishing
//   parseCandidate(value, {runId, runAttempt})  strict candidate handoff (exact keys at every level, this run attempt only)
//   decidePublication(facts)    the publisher's base/source/reconstruction/main/tag guards
//   verifyManifests(manifests, packages)  native harness manifests used exactly the selected versions and ZIPs
//   parseTestCounts(output)     Bun's final pass/fail/skip/todo/ran counts
// Failure summaries carry only stage/reason codes built from a fixed vocabulary, never error text or values.
import { nextHelperPatch } from "./bump.ts";
import { compareMatrix, PIN_KEYS, ReauditError, type AuditedVersions, type PinKey } from "./detect.ts";
import type { FailureSummary } from "./notify.ts";

export const CANDIDATE_SCHEMA = 1;
export const REPOSITORY = "CastrumS/pirax-castrum-maintenance";
const GATES = { cleanup: "confirmed", native: "passed", manifests: "verified", final: "passed", privacy: "passed" } as const;

export type PackageFact = { version: string; sha256: string };
export type Candidate = {
  schema: typeof CANDIDATE_SCHEMA;
  repository: typeof REPOSITORY;
  /** The Actions run that audited it; the publisher accepts only its own run's candidate. */
  runId: string;
  /** That run's attempt: a rerun keeps the run ID and earlier artifacts, so it must not consume an earlier candidate. */
  runAttempt: string;
  /** Exact audited main commit. */
  base: string;
  oldPins: AuditedVersions;
  newPins: AuditedVersions;
  /** Selected package versions and SHA-256 digests; never paths or URLs. */
  packages: Record<PinKey, PackageFact>;
  helper: { from: string; to: string };
  /** changesDigest() of the deterministic bump.ts rewrite of the audited base. */
  changes: { digest: string };
  gates: typeof GATES;
};

export type AuditFacts = {
  runId: string;
  runAttempt: string;
  base: string;
  /** The shipping helper version at the base. */
  helper: string;
  oldPins: AuditedVersions;
  acquisition?:
    | { status: "unchanged"; versions: AuditedVersions }
    | { status: "changed"; versions: AuditedVersions; packages: Record<PinKey, PackageFact> }
    | { status: "failed"; error: unknown };
  cleanup?: "confirmed" | "failed" | "unknown" | "not-applicable";
  /** Unchanged runs: the release of the current helper version, independently verified. */
  currentRelease?: "verified" | "missing" | "incomplete" | "unknown";
  native?: "passed" | "failed";
  manifests?: "verified" | "failed";
  final?: "passed" | "failed";
  privacy?: "passed" | "failed";
  changes?: { to: string; digest: string };
  runUrl?: string;
  /** The throwaway Playground site's loopback URL (plan D4), reported only while cleanup is not confirmed. */
  site?: string;
};
export type Decision =
  | { outcome: "failed"; summary: FailureSummary }
  | { outcome: "unchanged"; versions: AuditedVersions }
  | { outcome: "audited-candidate"; candidate: Candidate };

export class CandidateError extends Error {}

const VERSION = /^(0|[1-9][0-9]*)(\.(0|[1-9][0-9]*)){1,3}$/;
const HEX40 = /^[0-9a-f]{40}$/;
const HEX64 = /^[0-9a-f]{64}$/;
export const RUN_ID = /^[1-9][0-9]{0,19}$/;
export const RUN_ATTEMPT = /^[1-9][0-9]{0,3}$/;
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const keysAre = (v: Record<string, unknown>, keys: readonly string[]) => Object.keys(v).length === keys.length && keys.every((k) => Object.hasOwn(v, k));
const samePins = (a: AuditedVersions, b: AuditedVersions) => PIN_KEYS.every((k) => a[k] === b[k]);

function pins(value: unknown): AuditedVersions | undefined {
  if (!isObject(value) || !keysAre(value, PIN_KEYS) || !PIN_KEYS.every((k) => typeof value[k] === "string" && VERSION.test(value[k]))) return undefined;
  return Object.fromEntries(PIN_KEYS.map((k) => [k, value[k]])) as AuditedVersions;
}

/** Strict: throws CandidateError(`candidate: <field>`) for anything but this run attempt's complete, successful candidate. */
export function parseCandidate(value: unknown, expected: { runId: string; runAttempt: string }): Candidate {
  const fail = (field: string) => new CandidateError(`candidate: ${field}`);
  if (!isObject(value)) throw fail("not an object");
  const top = ["schema", "repository", "runId", "runAttempt", "base", "oldPins", "newPins", "packages", "helper", "changes", "gates"];
  if (Object.keys(value).some((k) => !top.includes(k))) throw fail("unknown keys");
  if (value.schema !== CANDIDATE_SCHEMA) throw fail("schema");
  if (value.repository !== REPOSITORY) throw fail("repository");
  if (typeof value.runId !== "string" || !RUN_ID.test(value.runId) || value.runId !== expected.runId) throw fail("runId");
  if (typeof value.runAttempt !== "string" || !RUN_ATTEMPT.test(value.runAttempt) || value.runAttempt !== expected.runAttempt) throw fail("runAttempt");
  if (typeof value.base !== "string" || !HEX40.test(value.base)) throw fail("base");
  const oldPins = pins(value.oldPins);
  if (!oldPins) throw fail("oldPins");
  const newPins = pins(value.newPins);
  if (!newPins) throw fail("newPins");
  try {
    if (compareMatrix(oldPins, newPins).status !== "changed") throw fail("newPins");
  } catch {
    throw fail("newPins");
  }
  const packages = value.packages;
  if (!isObject(packages) || !keysAre(packages, PIN_KEYS)) throw fail("packages");
  for (const key of PIN_KEYS) {
    const p = packages[key];
    if (!isObject(p) || !keysAre(p, ["version", "sha256"]) || p.version !== newPins[key] || typeof p.sha256 !== "string" || !HEX64.test(p.sha256)) throw fail("packages");
  }
  const helper = value.helper;
  if (!isObject(helper) || !keysAre(helper, ["from", "to"]) || typeof helper.from !== "string" || !VERSION.test(helper.from) || helper.to !== nextHelperPatch(helper.from)) throw fail("helper");
  const changes = value.changes;
  if (!isObject(changes) || !keysAre(changes, ["digest"]) || typeof changes.digest !== "string" || !HEX64.test(changes.digest)) throw fail("changes");
  const gates = value.gates;
  if (!isObject(gates) || !keysAre(gates, Object.keys(GATES)) || Object.entries(GATES).some(([k, v]) => gates[k] !== v)) throw fail("gates");
  return {
    schema: CANDIDATE_SCHEMA,
    repository: REPOSITORY,
    runId: value.runId,
    runAttempt: value.runAttempt,
    base: value.base,
    oldPins,
    newPins,
    packages: Object.fromEntries(PIN_KEYS.map((k) => [k, { version: newPins[k], sha256: (packages[k] as PackageFact).sha256 }])) as Record<PinKey, PackageFact>,
    helper: { from: helper.from as string, to: helper.to as string },
    changes: { digest: changes.digest },
    gates: { ...GATES },
  };
}

// ReauditError stage/field/reason are code constants plus pin keys; a summary reason keeps only words from this
// vocabulary, so a field or nested message carrying data can never reach the notice.
const STAGE: Record<string, FailureSummary["stage"]> = {
  discovery: "discovery", catalog: "discovery", activation: "download", download: "download", cleanup: "cleanup",
  environment: "setup", decrypt: "setup", playground: "setup", updater: "setup", signal: "setup", pins: "setup",
};
const VOCABULARY = new Set([
  ...Object.keys(STAGE), ...PIN_KEYS, "acquisition", "gplvault_license_key", "gplvault_product_id", "gplvault_updater_passphrase",
  "activate", "deactivate", "status", "schema", "self-update", "boot", "configure", "record", "response", "wordpress.org", "sigint", "sigterm",
  "missing", "unknown", "duplicate", "malformed", "downgrade", "ambiguous", "failed", "refused", "received", "unconfirmed", "after",
  "failure", "already", "active", "mismatch", "version", "unreadable", "url", "oversize", "slug", "link", "item", "interrupted", "unexpected",
]);
function classify(error: unknown): { stage: FailureSummary["stage"]; reason: string } {
  if (!(error instanceof ReauditError)) return { stage: "unknown", reason: "unexpected-error" };
  const words = `${error.stage} ${error.field} ${error.reason}`.toLowerCase().split(/[^a-z0-9_.-]+/).filter((w) => VOCABULARY.has(w));
  const reason = words.join("-").replace(/[_.]/g, "-").slice(0, 64).replace(/-+$/, "");
  return { stage: STAGE[error.stage] ?? "unknown", reason: /^[a-z]/.test(reason) ? reason : "unexpected-error" };
}

/** The closed audit state machine. Only literal successes advance; everything else is a safe failure. */
export function decideAudit(facts: AuditFacts): Decision {
  const cleanup = facts.cleanup ?? "unknown";
  const common = { oldVersions: facts.oldPins, cleanup, publication: "not-attempted" as const, ...(facts.runUrl && { runUrl: facts.runUrl }), ...(facts.site && (cleanup === "failed" || cleanup === "unknown") && { site: facts.site }) };
  const fail = (stage: FailureSummary["stage"], reason: string, extra: Partial<FailureSummary> = {}): Decision => ({ outcome: "failed", summary: { stage, reason, ...common, ...extra } });
  const a = facts.acquisition;
  if (!a) return fail("discovery", "acquisition-missing");
  if (a.status === "failed") {
    const { stage, reason } = classify(a.error);
    return fail(stage, reason);
  }
  if (facts.cleanup !== "confirmed") return fail("cleanup", `cleanup-${facts.cleanup ?? "unknown"}`);
  if (a.status === "unchanged") {
    if (!samePins(a.versions, facts.oldPins)) return fail("discovery", "unchanged-versions-differ");
    if (facts.privacy !== "passed") return fail("privacy", facts.privacy === "failed" ? "evidence-privacy-failed" : "evidence-privacy-missing");
    if (facts.currentRelease !== "verified")
      return fail("publication", `current-release-${facts.currentRelease ?? "unknown"}`, { publication: "release-incomplete", tag: `v${facts.helper}` });
    return { outcome: "unchanged", versions: a.versions };
  }
  const audited = { candidateVersions: a.versions };
  if (facts.native !== "passed") return fail("audit", facts.native === "failed" ? "native-suite-failed" : "native-suite-missing", audited);
  if (facts.manifests !== "verified") return fail("audit", facts.manifests === "failed" ? "native-manifest-mismatch" : "native-manifest-missing", audited);
  if (facts.final !== "passed") return fail("bump", facts.final === "failed" ? "final-checks-failed" : "final-checks-missing", audited);
  if (facts.privacy !== "passed") return fail("privacy", facts.privacy === "failed" ? "evidence-privacy-failed" : "evidence-privacy-missing", audited);
  if (!facts.changes) return fail("bump", "intended-change-missing", audited);
  const packages = Object.fromEntries(PIN_KEYS.map((k) => [k, a.packages[k] && { version: a.packages[k].version, sha256: a.packages[k].sha256 }]));
  const draft = {
    schema: CANDIDATE_SCHEMA, repository: REPOSITORY, runId: facts.runId, runAttempt: facts.runAttempt, base: facts.base, oldPins: facts.oldPins, newPins: a.versions,
    packages, helper: { from: facts.helper, to: facts.changes.to }, changes: { digest: facts.changes.digest }, gates: { ...GATES },
  };
  try {
    return { outcome: "audited-candidate", candidate: parseCandidate(draft, { runId: facts.runId, runAttempt: facts.runAttempt }) };
  } catch {
    return fail("bump", "candidate-invalid", audited);
  }
}

export type PublicationFacts = {
  candidate: Candidate;
  /** The trusted checkout's HEAD (the workflow checks out the event commit, never a candidate-supplied ref). */
  head: string;
  sourcePins: AuditedVersions;
  sourceHelper: string;
  /** changesDigest() reconstructed by checked-in code from that checkout. */
  digest: string;
  /** Remote main now ("" when unreadable). */
  remoteMain: string;
  tag: "absent" | "present" | "unknown";
};
export type PublicationReason = "checkout-not-audited-base" | "source-drift" | "reconstruction-mismatch" | "main-unreadable" | "main-advanced" | "tag-exists" | "tag-lookup-failed";
export function decidePublication(f: PublicationFacts): { proceed: true } | { proceed: false; reason: PublicationReason } {
  const stop = (reason: PublicationReason) => ({ proceed: false as const, reason });
  if (f.head !== f.candidate.base) return stop("checkout-not-audited-base");
  if (!samePins(f.sourcePins, f.candidate.oldPins) || f.sourceHelper !== f.candidate.helper.from) return stop("source-drift");
  if (f.digest !== f.candidate.changes.digest) return stop("reconstruction-mismatch");
  if (!HEX40.test(f.remoteMain)) return stop("main-unreadable");
  if (f.remoteMain !== f.candidate.base) return stop("main-advanced");
  if (f.tag === "present") return stop("tag-exists");
  if (f.tag !== "absent") return stop("tag-lookup-failed");
  return { proceed: true };
}

/** Every manifest used the selected GF/FF ZIPs; full-stack manifests also Pro/CleanTalk/FluentSMTP; at least one is full. */
export function verifyManifests(manifests: unknown[], packages: Record<PinKey, PackageFact>): "verified" | "failed" {
  let full = 0;
  for (const m of manifests) {
    if (!isObject(m) || !isObject(m.versions) || !isObject(m.zips)) return "failed";
    const { versions: v, zips: z } = m;
    if (v.gf !== packages.gf.version || v.ff !== packages.ff.version || z.gravityforms !== packages.gf.sha256 || z.fluentform !== packages.ff.sha256) return "failed";
    const extras = [v.ffPro, v.cleantalk, v.fluentSmtp, z.fluentformpro, z.cleantalk, z.fluentSmtp];
    if (extras.every((x) => x === undefined)) continue;
    const expected = [packages.ff_pro.version, packages.cleantalk.version, packages.fluent_smtp.version, packages.ff_pro.sha256, packages.cleantalk.sha256, packages.fluent_smtp.sha256];
    if (extras.some((x, i) => x !== expected[i])) return "failed";
    full++;
  }
  return full ? "verified" : "failed";
}

/** Bun's closing summary counts, or null when absent. */
export function parseTestCounts(output: string): { pass: number; fail: number; skip: number; todo: number; ran: number } | null {
  const last = (pattern: RegExp) => [...output.matchAll(pattern)].at(-1)?.[1];
  const word = (w: string) => last(new RegExp(`^\\s*(\\d+) ${w}$`, "gm"));
  const [pass, fail, ran] = [word("pass"), word("fail"), last(/^Ran (\d+) tests? across/gm)];
  if (pass === undefined || fail === undefined || ran === undefined) return null;
  return { pass: Number(pass), fail: Number(fail), skip: Number(word("skip") ?? 0), todo: Number(word("todo") ?? 0), ran: Number(ran) };
}
