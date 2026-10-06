// Facts read from the shipping helper source, narrowly and read-only: the audited vendor pins, whose only
// authority is the AUDITED_VERSIONS literal table in includes/compatibility.php, and the helper version
// (Version header + VERSION constant in pirax-form-test.php). The release script, the plugin test harness
// and the native tests all read pins here; there is no second table.
//   PIN_KEYS / AuditedVersions                 the five known pin keys and the record they form
//   parseAuditedVersions(text)                 strict parse of compatibility.php text
//   readAuditedVersions(sourceDirectory?)      the same, read from a plugin source directory
//   readHelperVersion(sourceDirectory?)        the header version, which must equal VERSION
// The default directory is plugin/pirax-form-test next to this script, never the working directory.
// Synchronous and import-safe. Errors name the file and field, never the rejected text: it could be
// anything, even private material pasted by mistake.
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

export const PIN_KEYS = ["gf", "ff", "ff_pro", "cleantalk", "fluent_smtp"] as const;
export type AuditedVersions = Record<(typeof PIN_KEYS)[number], string>;

const SOURCE = resolve(import.meta.dir, "../plugin/pirax-form-test");
const COMPATIBILITY = "includes/compatibility.php";
const MAIN = "pirax-form-test.php";
/** Same rule as the updater's verify_release(): stable dotted numeric versions only. */
const STABLE = /^(0|[1-9][0-9]*)(\.(0|[1-9][0-9]*)){1,3}$/;

/** The capture of exactly one match of pattern in text, or an error naming the file. */
export function only(text: string, pattern: RegExp, file: string, what: string) {
  const matches = [...text.matchAll(pattern)];
  if (matches.length !== 1) throw new Error(`${file}: expected exactly one ${what}, found ${matches.length}`);
  return matches[0]![1]!;
}

export function parseAuditedVersions(text: string): AuditedVersions {
  const block = only(text, /^const AUDITED_VERSIONS = array\(\n([^]*?)\n\);$/gm, COMPATIBILITY, "AUDITED_VERSIONS array");
  const audited: Record<string, string> = {};
  for (const line of block.split("\n")) {
    const [, key, version] = line.match(/^\t'([a-z_]+)' *=> '([^'\\]+)',$/) ?? [];
    if (!key || !version || Object.hasOwn(audited, key)) throw new Error(`${COMPATIBILITY}: AUDITED_VERSIONS has a line that is not a unique 'plugin' => 'version' literal`);
    if (!(PIN_KEYS as readonly string[]).includes(key)) throw new Error(`${COMPATIBILITY}: AUDITED_VERSIONS has an unknown plugin key`);
    if (!STABLE.test(version)) throw new Error(`${COMPATIBILITY}: AUDITED_VERSIONS '${key}' is not a stable dotted numeric version`);
    audited[key] = version;
  }
  const missing = PIN_KEYS.filter((key) => !Object.hasOwn(audited, key));
  if (missing.length) throw new Error(`${COMPATIBILITY}: AUDITED_VERSIONS is missing ${missing.join(", ")}`);
  return audited as AuditedVersions;
}

export const readAuditedVersions = (sourceDirectory = SOURCE) => parseAuditedVersions(readFileSync(join(sourceDirectory, COMPATIBILITY), "utf8"));

export function readHelperVersion(sourceDirectory = SOURCE) {
  const main = readFileSync(join(sourceDirectory, MAIN), "utf8");
  const header = only(main, /^ \* Version:[ \t]*(.*)$/gm, MAIN, "Version header").trim();
  const version = only(main, /^const VERSION = '([^']*)';$/gm, MAIN, "VERSION constant");
  if (header !== version) throw new Error(`${MAIN}: Version header and VERSION constant differ`);
  if (!STABLE.test(version)) throw new Error(`${MAIN}: VERSION is not a stable dotted numeric version`);
  return version;
}
