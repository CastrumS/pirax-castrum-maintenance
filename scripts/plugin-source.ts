// The helper's audited vendor pins and version (plan D4). Their one authority is the selected deployment's
// versions.json (src/deployment.ts); the build renders them into the shipping PHP as literals. The readers give
// the deployment's facts; the parsers independently read the same facts back from rendered helper PHP, such as
// a built ZIP's entries, so a package can be checked against its deployment. There is no second table.
//   PIN_KEYS / AuditedVersions          the five known pin keys and the record they form
//   readAuditedVersions(selection?)     the selected deployment's pins, read now ({ root?, env? } as loadDeployment)
//   readHelperVersion(selection?)       the selected deployment's helper version, read now
//   parseAuditedVersions(text)          strict parse of a rendered includes/compatibility.php
//   parseHelperVersion(text)            the same for a rendered main file: Version header and VERSION must agree
//   only(text, pattern, file, what)     the capture of exactly one match, or an error naming the file
// Synchronous and import-safe; the readers need DEPLOYMENT (or an explicit selection) only when called. Errors name
// the file and field, never the rejected text: it could be anything, even private material pasted by mistake.
import { loadDeployment, PIN_KEYS, STABLE_VERSION, type AuditedVersions, type DeploymentOptions } from "../src/deployment.ts";

export { PIN_KEYS, type AuditedVersions };

const COMPATIBILITY = "includes/compatibility.php";
const MAIN = "pirax-form-test.php";

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
    if (!STABLE_VERSION.test(version)) throw new Error(`${COMPATIBILITY}: AUDITED_VERSIONS '${key}' is not a stable dotted numeric version`);
    audited[key] = version;
  }
  const missing = PIN_KEYS.filter((key) => !Object.hasOwn(audited, key));
  if (missing.length) throw new Error(`${COMPATIBILITY}: AUDITED_VERSIONS is missing ${missing.join(", ")}`);
  return audited as AuditedVersions;
}

export const readAuditedVersions = (selection: DeploymentOptions = {}): AuditedVersions => ({ ...loadDeployment(selection).versions.audited });

export const readHelperVersion = (selection: DeploymentOptions = {}): string => loadDeployment(selection).versions.helperVersion;

/** The helper version from rendered main-file text (e.g. a release ZIP entry): header and VERSION must agree. */
export function parseHelperVersion(main: string) {
  const header = only(main, /^ \* Version:[ \t]*(.*)$/gm, MAIN, "Version header").trim();
  const version = only(main, /^const VERSION = '([^']*)';$/gm, MAIN, "VERSION constant");
  if (header !== version) throw new Error(`${MAIN}: Version header and VERSION constant differ`);
  if (!STABLE_VERSION.test(version)) throw new Error(`${MAIN}: VERSION is not a stable dotted numeric version`);
  return version;
}
