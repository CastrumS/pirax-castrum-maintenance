// Deployment selection and data (plan D1/D2). DEPLOYMENT names one folder, deployments/<name>/, that holds every
// operator-specific value: config.json (the helper's visible identity and update channel, the failure notice, the
// form checker's texts and the weekly check flag and time zone), versions.json (the five audited pins and the
// helper version) and sites.yaml.
//   loadDeployment({ root?, env? })   the selected deployment, read and validated now, as an immutable snapshot
//                                     with derived paths, asset names, package URL and git remote
//   parseConfig(text) / parseVersions(text)   the strict schemas of config.json and versions.json
//   formatVersions(versions)          canonical versions.json text
//   DeploymentConfigError             a field (DEPLOYMENT or a schema path) and a fixed reason, never the rejected content
// The default root is this repository, never the working directory; env defaults to process.env when called.
// There is no default deployment and no cache. The folder and its data files must be plain entries (no links).
// Import-safe: nothing is read until loadDeployment() is called.
import { readFileSync, realpathSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { addressPattern } from "./forms/config.ts";

const ROOT = resolve(import.meta.dir, "..");

export const PIN_KEYS = ["gf", "ff", "ff_pro", "cleantalk", "fluent_smtp"] as const;
export type AuditedVersions = Record<(typeof PIN_KEYS)[number], string>;
/** Same rule as the updater's verify_release(): stable dotted numeric versions only. */
export const STABLE_VERSION = /^(0|[1-9][0-9]*)(\.(0|[1-9][0-9]*)){1,3}$/;

type Frozen<T> = { readonly [K in keyof T]: T[K] extends object ? Frozen<T[K]> : T[K] };
export type DeploymentConfig = Frozen<{
  schemaVersion: 1;
  plugin: { name: string; author: string; description: string; slug: string; updateUri: string };
  channel: { repository: string; releasesRoot: string; publicKey: string };
  notice: { recipient: string; subjectPrefix: string };
  forms: { refusalPrefix: string; text: string; message: string };
  weeklyCheck: { enabled: boolean; timeZone: string };
}>;
export type DeploymentVersions = Frozen<{ schemaVersion: 1; helperVersion: string; audited: AuditedVersions }>;
export type Deployment = Frozen<{
  name: string;
  /** Real paths of the repository root and of deployments/<name>/. */
  root: string;
  directory: string;
  paths: { config: string; versions: string; sites: string };
  config: DeploymentConfig;
  versions: DeploymentVersions;
  /** The helper's main file and plugin basename, and the release asset names; all from the slug. */
  assets: { main: string; basename: string; zip: string; manifest: string; signature: string };
  /** The canonical package URL of the current helper version's release. */
  packageUrl: string;
  /** The channel repository's git remote. */
  remote: string;
}>;
export type DeploymentOptions = { root?: string; env?: Record<string, string | undefined> };

type Reason =
  | "is not set"
  | "is not a valid deployment name"
  | "names no deployment folder"
  | "is a link or outside its folder"
  | "cannot be read"
  | "is not valid JSON"
  | "is missing"
  | "is invalid"
  | "has an unknown field";

export class DeploymentConfigError extends Error {
  constructor(
    readonly field: string,
    readonly reason: Reason,
  ) {
    super(`${field} ${reason}`);
    this.name = "DeploymentConfigError";
  }
}

/** Lowercase words joined by single hyphens: deployment names and plugin slugs. */
const NAME = /^[a-z0-9]+(-[a-z0-9]+)*$/;
/**
 * Visible text (names, refusal prefix, filler): one line of letters, digits, single spaces and plain punctuation.
 * No markup, backtick, pipe, backslash, brace or `*`, so it cannot close a comment or break a header, table or code span.
 */
const DISPLAY_CHARS = String.raw`\p{L}\p{N}\p{M}.,:;!?'"&()+\/#@%-`;
const DISPLAY = new RegExp(`^[${DISPLAY_CHARS}]+(?: [${DISPLAY_CHARS}]+)*$`, "u");
/** A mail subject prefix: printable ASCII, no leading or trailing space. */
const SUBJECT = /^[\x21-\x7e](?:[\x20-\x7e]*[\x21-\x7e])?$/;
/** owner/repo as GitHub allows them. */
const REPOSITORY = /^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?\/(?!\.\.?$)[A-Za-z0-9._-]+$/;

type Check = (value: unknown) => boolean;
type Shape = { readonly [key: string]: Check | Shape };

const display: Check = (v) => typeof v === "string" && DISPLAY.test(v);
const stable: Check = (v) => typeof v === "string" && STABLE_VERSION.test(v);
/** An IANA name exactly as Intl spells it: `europe/zagreb` and unknown zones are refused. */
const timeZone: Check = (v) => {
  if (typeof v !== "string" || v === "") return false;
  try {
    return new Intl.DateTimeFormat("en", { timeZone: v }).resolvedOptions().timeZone === v;
  } catch (error) {
    if (error instanceof RangeError) return false;
    throw error;
  }
};
/**
 * Canonical (exactly as URL parsing writes it) and plain: unreserved characters, `:`, `/` and `%` only, so no
 * credentials, query, fragment, quote or `*` (a URL is also a plugin header line inside a PHP comment).
 */
const cleanUrl = (v: unknown, protocol: string): URL | null => {
  if (typeof v !== "string" || !/^[A-Za-z0-9._~:\/%-]+$/.test(v) || !URL.canParse(v)) return null;
  const url = new URL(v);
  return url.href === v && url.protocol === protocol ? url : null;
};

const CONFIG: Shape = {
  schemaVersion: (v) => v === 1,
  plugin: {
    name: display,
    author: display,
    description: display,
    slug: (v) => typeof v === "string" && NAME.test(v),
    updateUri: (v) => cleanUrl(v, "https:") !== null,
  },
  channel: {
    repository: (v) => typeof v === "string" && REPOSITORY.test(v),
    // Checked against the repository below.
    releasesRoot: (v) => typeof v === "string",
    publicKey: (v) => typeof v === "string" && Buffer.from(v, "base64").length === 32 && Buffer.from(v, "base64").toString("base64") === v,
  },
  notice: {
    recipient: (v) => typeof v === "string" && addressPattern.test(v),
    subjectPrefix: (v) => typeof v === "string" && SUBJECT.test(v),
  },
  forms: { refusalPrefix: display, text: display, message: display },
  weeklyCheck: { enabled: (v) => v === true || v === false, timeZone },
};
const VERSIONS: Shape = { schemaVersion: (v) => v === 1, helperVersion: stable, audited: Object.fromEntries(PIN_KEYS.map((key) => [key, stable])) };

/** value checked against shape: every field present and valid, nothing else; the result has shape's key order. */
function validate(shape: Shape, value: unknown, field: string): unknown {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new DeploymentConfigError(field, "is invalid");
  if (Object.keys(value).some((key) => !Object.hasOwn(shape, key))) throw new DeploymentConfigError(field, "has an unknown field");
  return Object.fromEntries(
    Object.entries(shape).map(([key, rule]) => {
      if (!Object.hasOwn(value, key)) throw new DeploymentConfigError(`${field}.${key}`, "is missing");
      const v: unknown = (value as Record<string, unknown>)[key];
      if (typeof rule !== "function") return [key, validate(rule, v, `${field}.${key}`)];
      if (!rule(v)) throw new DeploymentConfigError(`${field}.${key}`, "is invalid");
      return [key, v];
    }),
  );
}

function json(text: string, field: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    throw new DeploymentConfigError(field, "is not valid JSON");
  }
}

export function parseConfig(text: string): DeploymentConfig {
  const config = validate(CONFIG, json(text, "config"), "config") as DeploymentConfig;
  const { repository, releasesRoot } = config.channel;
  // GitHub releases of the configured repository, or the same path on a loopback test channel (plain HTTP there only).
  const loopback = cleanUrl(releasesRoot, "http:");
  if (releasesRoot !== `https://github.com/${repository}/releases` && !(loopback?.hostname === "127.0.0.1" && loopback.pathname === `/${repository}/releases`))
    throw new DeploymentConfigError("config.channel.releasesRoot", "is invalid");
  return config;
}

export const parseVersions = (text: string): DeploymentVersions => validate(VERSIONS, json(text, "versions"), "versions") as DeploymentVersions;

/** Canonical versions.json: schema key order, two-space indent, final newline. */
export const formatVersions = (versions: DeploymentVersions): string =>
  `${JSON.stringify({ schemaVersion: versions.schemaVersion, helperVersion: versions.helperVersion, audited: Object.fromEntries(PIN_KEYS.map((key) => [key, versions.audited[key]])) }, null, 2)}\n`;

/** The real path, or null when nothing is there. */
function real(path: string): string | null {
  try {
    return realpathSync(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT" || (error as NodeJS.ErrnoException).code === "ENOTDIR") return null;
    throw error;
  }
}

const freeze = <T>(value: T): T => {
  if (typeof value === "object" && value !== null) {
    for (const v of Object.values(value)) freeze(v);
    Object.freeze(value);
  }
  return value;
};

export function loadDeployment({ root = ROOT, env = process.env }: DeploymentOptions = {}): Deployment {
  const name = env.DEPLOYMENT;
  if (!name) throw new DeploymentConfigError("DEPLOYMENT", "is not set");
  if (!NAME.test(name)) throw new DeploymentConfigError("DEPLOYMENT", "is not a valid deployment name");
  const repository = realpathSync(root);
  const directory = join(repository, "deployments", name);
  const found = real(join(root, "deployments", name));
  if (found === null || (found === directory && !statSync(found).isDirectory())) throw new DeploymentConfigError("DEPLOYMENT", "names no deployment folder");
  if (found !== directory) throw new DeploymentConfigError("DEPLOYMENT", "is a link or outside its folder");
  const data = (file: string, field: string) => {
    const path = join(directory, file);
    const resolved = real(path);
    if (resolved !== null && resolved !== path) throw new DeploymentConfigError(field, "is a link or outside its folder");
    if (resolved === null || !statSync(path).isFile()) throw new DeploymentConfigError(field, "cannot be read");
    return path;
  };
  const paths = { config: data("config.json", "config"), versions: data("versions.json", "versions"), sites: data("sites.yaml", "sites") };
  const config = parseConfig(readFileSync(paths.config, "utf8"));
  const versions = parseVersions(readFileSync(paths.versions, "utf8"));
  const { slug } = config.plugin;
  const assets = { main: `${slug}.php`, basename: `${slug}/${slug}.php`, zip: `${slug}.zip`, manifest: `${slug}-manifest.json`, signature: `${slug}-manifest.json.sig` };
  return freeze({
    name,
    root: repository,
    directory,
    paths,
    config,
    versions,
    assets,
    packageUrl: `${config.channel.releasesRoot}/download/v${versions.helperVersion}/${assets.zip}`,
    remote: `https://github.com/${config.channel.repository}.git`,
  });
}
