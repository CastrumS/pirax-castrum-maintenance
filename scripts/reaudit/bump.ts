// Deterministic audited-change reconstruction (plan D6). The selected deployment's versions.json is the one
// authority for the audited pins and the helper version, so a bump rewrites only that file, in canonical form
// (formatVersions): the candidate pins, and for the final bump also the next helper patch. The shipping PHP and the
// plugin guide's current-versions section are rendered from it at build time (render-plugin.ts); no shared source,
// guide or other deployment is ever written.
// The file must first be canonical and hold the plan's old facts exactly (drift, a hand edit or another
// deployment's data refuses the whole bump, before anything is written). It is read again at every call, never
// taken from a deployment snapshot. The audit job and the publisher both call this checked-in code; no patch is
// ever handed between them.
//   bumpFiles(deployment)                          the repository-relative paths a bump writes: deployments/<name>/versions.json
//   readBumpSources(deployment)                    their current text, keyed by those paths
//   bumpSources(deployment, sources, plan, opts)   pure rewrite (pinsOnly: pins without the helper patch)
//   changesDigest(files)                           SHA-256 over the sorted (path, content hash) pairs
//   applyBump(deployment, plan, opts)              compute, then replace each file atomically
// Import-safe; no CLI.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { rename, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { formatVersions, parseVersions, type Deployment } from "../../src/deployment.ts";
import { PIN_KEYS, type AuditedVersions } from "../plugin-source.ts";
import { compareMatrix, ReauditError, validateVersions } from "./detect.ts";

export type BumpSources = Record<string, string>;
export type BumpPlan = { oldPins: AuditedVersions; newPins: AuditedVersions; from: string; to: string };

const HELPER = /^(0|[1-9]\d*)(\.(0|[1-9]\d*)){1,3}$/;

/** The repository-relative files a bump of this deployment writes: its versions.json only. */
export const bumpFiles = (deployment: Deployment): string[] => [relative(deployment.root, deployment.paths.versions)];

/** Last dotted component + 1, numerically (0.3.9 → 0.3.10). */
export function nextHelperPatch(version: string): string {
  if (!HELPER.test(version)) throw new Error("bump: helper version is not a stable dotted numeric version");
  return version.replace(/\d+$/, (n) => String(BigInt(n) + 1n));
}

/** A changed, non-downgraded, complete matrix and the next helper patch. */
export function planBump(oldPins: AuditedVersions, newPins: AuditedVersions, from: string): BumpPlan {
  oldPins = validateVersions(oldPins, "bump");
  newPins = validateVersions(newPins, "bump");
  let changed: string;
  try {
    changed = compareMatrix(oldPins, newPins).status;
  } catch (error) {
    throw error instanceof ReauditError ? new Error(`bump: ${error.field} ${error.reason}`) : error;
  }
  if (changed === "unchanged") throw new Error("bump: pins are unchanged");
  return { oldPins, newPins, from, to: nextHelperPatch(from) };
}

function rewriteVersions(text: string, file: string, plan: BumpPlan, pinsOnly: boolean): string {
  const current = parseVersions(text);
  if (formatVersions(current) !== text) throw new Error(`bump: ${file} is not in canonical form (hand edit or drift)`);
  if (PIN_KEYS.some((k) => current.audited[k] !== plan.oldPins[k])) throw new Error(`bump: ${file} does not hold the plan's old pins`);
  if (current.helperVersion !== plan.from) throw new Error(`bump: ${file} helper version is not ${plan.from}`);
  return formatVersions({ schemaVersion: 1, helperVersion: pinsOnly ? plan.from : plan.to, audited: plan.newPins });
}

/** Pure: the deployment's bump files after the plan (pinsOnly: the candidate pins with the old helper version, for the native gate). */
export function bumpSources(deployment: Deployment, sources: BumpSources, plan: BumpPlan, { pinsOnly = false } = {}): BumpSources {
  return Object.fromEntries(bumpFiles(deployment).map((file) => [file, rewriteVersions(sources[file]!, file, plan, pinsOnly)]));
}

/** SHA-256 over the sorted (path, SHA-256 of content) pairs: identical paths, inputs and plan give an identical digest. */
export function changesDigest(files: BumpSources): string {
  const entries = Object.keys(files).sort().map((path) => [path, createHash("sha256").update(files[path]!).digest("hex")]);
  return createHash("sha256").update(JSON.stringify(entries)).digest("hex");
}

export const readBumpSources = (deployment: Deployment): BumpSources =>
  Object.fromEntries(bumpFiles(deployment).map((file) => [file, readFileSync(join(deployment.root, file), "utf8")]));

/** Compute every rewrite first, then write each file atomically; returns the paths and the change digest. */
export async function applyBump(deployment: Deployment, plan: BumpPlan, options: { pinsOnly?: boolean } = {}) {
  const before = readBumpSources(deployment);
  const after = bumpSources(deployment, before, plan, options);
  for (const path of bumpFiles(deployment)) {
    if (after[path] === before[path]) continue;
    await writeFile(join(deployment.root, `${path}.bump-part`), after[path]!);
    await rename(join(deployment.root, `${path}.bump-part`), join(deployment.root, path));
  }
  return { paths: bumpFiles(deployment), digest: changesDigest(after) };
}
