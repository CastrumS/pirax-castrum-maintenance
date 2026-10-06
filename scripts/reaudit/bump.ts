// Deterministic audited-change reconstruction (plan D7/D11). From old pins + helper version to candidate pins +
// next helper patch, it rewrites only:
//   includes/compatibility.php   the five unique AUDITED_VERSIONS lines (key padding preserved)
//   pirax-form-test.php          the paired Version header and VERSION constant
//   README.md (plugin guide)     the marked current-versions section, regenerated from the same facts
// Every input must first match the plan's old facts exactly (drift, duplicates or ambiguity refuse the whole bump,
// before anything is written). Historical callback evidence and limitations outside the marked section are never
// touched. The audit job and the publisher both call this checked-in code; no patch is ever handed between them.
// Import-safe; no CLI.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { only, parseAuditedVersions, PIN_KEYS, type AuditedVersions } from "../plugin-source.ts";
import { compareMatrix, ReauditError, validateVersions } from "./detect.ts";

export const BUMP_FILES = [
  "plugin/pirax-form-test/includes/compatibility.php",
  "plugin/pirax-form-test/pirax-form-test.php",
  "plugin/pirax-form-test/README.md",
] as const;
export type BumpFile = (typeof BUMP_FILES)[number];
export type BumpSources = Record<BumpFile, string>;
export type BumpPlan = { oldPins: AuditedVersions; newPins: AuditedVersions; from: string; to: string };

const [COMPATIBILITY, MAIN, GUIDE] = BUMP_FILES;
const START = "<!-- pirax:current-versions:start -->\n";
const END = "<!-- pirax:current-versions:end -->";
const HELPER = /^(0|[1-9]\d*)(\.(0|[1-9]\d*)){1,3}$/;
const quote = (v: string) => v.replace(/\./g, "\\.");

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

/** The plugin guide's generated current-versions section (between the markers), from pins and helper version. */
export function renderCurrentVersions(pins: AuditedVersions, version: string): string {
  const smtpSeries = `${pins.fluent_smtp.split(".").slice(0, -1).join(".")}.x`;
  return [
    `Version ${version}. Marked submissions are accepted only on these exact audited versions, compared as exact strings:`,
    "",
    "| Plugin | Audited version | Applies to |",
    "|---|---|---|",
    `| Gravity Forms | ${pins.gf} | GF |`,
    `| Fluent Forms (free) | ${pins.ff} | FF |`,
    `| Fluent Forms Pro | ${pins.ff_pro} | FF, when active |`,
    `| Anti-Spam by CleanTalk | ${pins.cleantalk} | GF and FF, when active |`,
    `| FluentSMTP | ${pins.fluent_smtp} | GF and FF, when active |`,
    "",
    `Pro, CleanTalk and FluentSMTP are optional: a site without them is checked against the core rows only. When one is active at any other version, marked submissions of the adapters it applies to are rejected. This includes later patch releases such as FluentSMTP ${nextHelperPatch(pins.fluent_smtp)} or CleanTalk ${pins.cleantalk}.1: ${pins.fluent_smtp} is the only audited FluentSMTP release, not ${smtpSeries}. An active plugin whose version cannot be read counts as not audited. A new version is supported only after it is re-audited. Ordinary submissions still work with any version. The plugin also loads without either form plugin; each adapter is simply inactive.`,
    "",
  ].join("\n");
}

function rewritePins(text: string, plan: BumpPlan): string {
  const current = parseAuditedVersions(text);
  if (PIN_KEYS.some((k) => current[k] !== plan.oldPins[k])) throw new Error(`bump: ${COMPATIBILITY} does not hold the plan's old pins`);
  for (const key of PIN_KEYS) {
    const line = new RegExp(`^(\\t'${key}' *=> ')${quote(plan.oldPins[key])}(',)$`, "gm");
    only(text, line, COMPATIBILITY, `AUDITED_VERSIONS line for ${key}`);
    text = text.replace(line, `$1${plan.newPins[key]}$2`);
  }
  if (PIN_KEYS.some((k) => parseAuditedVersions(text)[k] !== plan.newPins[k])) throw new Error(`bump: ${COMPATIBILITY} rewrite did not produce the new pins`);
  return text;
}

function rewriteHelper(text: string, plan: BumpPlan): string {
  const header = /^( \* Version:[ \t]*).*$/gm;
  const constant = /^const VERSION = '([^']*)';$/gm;
  if (only(text, /^ \* Version:[ \t]*(.*)$/gm, MAIN, "Version header").trim() !== plan.from) throw new Error(`bump: ${MAIN} Version header is not ${plan.from}`);
  if (only(text, constant, MAIN, "VERSION constant") !== plan.from) throw new Error(`bump: ${MAIN} VERSION constant is not ${plan.from}`);
  return text.replace(header, `$1${plan.to}`).replace(constant, `const VERSION = '${plan.to}';`);
}

function rewriteGuide(text: string, plan: BumpPlan): string {
  const parts = text.split(START);
  if (parts.length !== 2 || parts[1]!.split(END).length !== 2 || parts[0]!.includes(END)) throw new Error(`bump: ${GUIDE} needs exactly one current-versions section`);
  const [body, rest] = parts[1]!.split(END) as [string, string];
  if (body !== renderCurrentVersions(plan.oldPins, plan.from)) throw new Error(`bump: ${GUIDE} current-versions section differs from the old pins (hand edit or drift)`);
  return `${parts[0]}${START}${renderCurrentVersions(plan.newPins, plan.to)}${END}${rest}`;
}

/** Pure: the allowlisted files after the plan (pinsOnly: compatibility.php alone, for the native gate). */
export function bumpSources(sources: BumpSources, plan: BumpPlan, { pinsOnly = false } = {}): BumpSources {
  const pins = rewritePins(sources[COMPATIBILITY], plan);
  if (pinsOnly) return { ...sources, [COMPATIBILITY]: pins };
  return { [COMPATIBILITY]: pins, [MAIN]: rewriteHelper(sources[MAIN], plan), [GUIDE]: rewriteGuide(sources[GUIDE], plan) };
}

/** SHA-256 over the sorted (path, SHA-256 of content) pairs: identical inputs and plan give an identical digest. */
export function changesDigest(files: BumpSources): string {
  const entries = [...BUMP_FILES].sort().map((path) => [path, createHash("sha256").update(files[path]).digest("hex")]);
  return createHash("sha256").update(JSON.stringify(entries)).digest("hex");
}

export const readBumpSources = (root: string): BumpSources =>
  Object.fromEntries(BUMP_FILES.map((f) => [f, readFileSync(join(root, f), "utf8")])) as BumpSources;

/** Compute every rewrite first, then write each file atomically; returns the paths and the change digest. */
export async function applyBump(root: string, plan: BumpPlan, options: { pinsOnly?: boolean } = {}) {
  const before = readBumpSources(root);
  const after = bumpSources(before, plan, options);
  for (const path of BUMP_FILES) {
    if (after[path] === before[path]) continue;
    await writeFile(join(root, `${path}.bump-part`), after[path]);
    await rename(join(root, `${path}.bump-part`), join(root, path));
  }
  return { paths: [...BUMP_FILES], digest: changesDigest(after) };
}
