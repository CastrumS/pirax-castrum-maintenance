// Renders the shared helper templates in plugin/pirax-form-test/ for one deployment (plan D3). A template holds a
// typed token, {{<context>:<value>}}, only where a deployment-specific value goes; every other byte, internal
// identifiers included (namespace, options, hooks, mail header and subject tag), ships unchanged. The context
// escapes for where the token sits:
//   raw    plugin headers, comments and Markdown code spans (the schema keeps these values to one plain line)
//   php    inside a single-quoted PHP string
//   html   HTML text
//   md     Markdown text
// Values: plugin.{name,author,description,slug,updateUri}, channel.{repository,releasesRoot,publicKey},
// forms.refusalPrefix, assets.{main,basename,zip,manifest,signature}, versions.helperVersion, auditedVersions
// (the AUDITED_VERSIONS body: every known key, null when unlisted) and currentVersions (the plugin guide's generated
// section). An unknown token, or anything left looking like one, throws naming the template file and token, never a value.
//   FILES / SOURCE                        the production allowlist (template paths) and the template directory
//   renderPlugin(deployment, source?)     every allowlisted file as { file, path, contents }; path is the archive
//                                         path <slug>/<file>, with the main file renamed to <slug>.php
//   renderTemplate(text, values, file)    one template
//   auditedLine(key, version)             one AUDITED_VERSIONS line; version undefined (an unlisted key) renders null
//   renderCurrentVersions(pins, version)  the plugin guide's current-versions section
// Import-safe; renderPlugin() only reads the templates.
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { PIN_KEYS, pinKeys, type AuditedVersions, type Deployment, type PinKey } from "../src/deployment.ts";

export const SOURCE = resolve(import.meta.dir, "../plugin/pirax-form-test");
export const FILES = [
  "pirax-form-test.php",
  "uninstall.php",
  "README.md",
  "includes/settings.php",
  "includes/marker.php",
  "includes/mail.php",
  "includes/compatibility.php",
  "includes/gravity-forms.php",
  "includes/fluent-forms.php",
  "includes/cleanup.php",
  "includes/updates.php",
];
/** The template's main file; every build ships it as <slug>.php. */
const MAIN = "pirax-form-test.php";

export type RenderedFile = { file: string; path: string; contents: string };

const HTML: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" };
const ESCAPE: Record<string, (value: string) => string> = {
  raw: (v) => v,
  php: (v) => v.replace(/[\\']/g, "\\$&"),
  html: (v) => v.replace(/[&<>"']/g, (c) => HTML[c]!),
  // Any ASCII punctuation may be backslash-escaped in Markdown.
  md: (v) => v.replace(/[!-\/:-@\[-`{-~]/g, "\\$&"),
};
const TOKEN = /\{\{([a-z]+):([A-Za-z0-9_.]+)\}\}/g;

export function renderTemplate(text: string, values: Readonly<Record<string, string>>, file: string): string {
  const rendered = text.replace(TOKEN, (token, context: string, name: string) => {
    if (!Object.hasOwn(ESCAPE, context) || !Object.hasOwn(values, name)) throw new Error(`${file}: unknown template token ${token}`);
    return ESCAPE[context]!(values[name]!);
  });
  if (/\{\{|\}\}/.test(rendered)) throw new Error(`${file}: unresolved template token`);
  return rendered;
}

/** e.g. `\t'gf'          => '3.1.2',`: the quoted key padded so every arrow lines up; an unlisted key is null. */
export const auditedLine = (key: PinKey, version: string | undefined): string => `\t${`'${key}'`.padEnd(14)}=> ${version === undefined ? "null" : `'${version}'`},`;

/** Each known plugin's guide label, its short name when optional, and the adapters it applies to. */
const GUIDE: Record<PinKey, { label: string; short?: string; applies: string }> = {
  gf: { label: "Gravity Forms", applies: "GF" },
  ff: { label: "Fluent Forms (free)", applies: "FF" },
  ff_pro: { label: "Fluent Forms Pro", short: "Pro", applies: "FF, when active" },
  cleantalk: { label: "Anti-Spam by CleanTalk", short: "CleanTalk", applies: "GF and FF, when active" },
  fluent_smtp: { label: "FluentSMTP", short: "FluentSMTP", applies: "GF and FF, when active" },
};

/** "A", "A and B", "A, B and C". */
const list = (names: string[]): string => (names.length === 1 ? names[0]! : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`);

/** The plugin guide's generated current-versions section (between its markers), from pins and helper version. */
export function renderCurrentVersions(pins: AuditedVersions, version: string): string {
  const listed = pinKeys(pins);
  const optional = listed.flatMap((key) => GUIDE[key].short ?? []);
  const unlisted = PIN_KEYS.filter((key) => !listed.includes(key)).map((key) => GUIDE[key].label);
  const { cleantalk, fluent_smtp: smtp } = pins;
  const sentences = [
    optional.length === 0
      ? []
      : `${list(optional)} ${optional.length === 1 ? "is" : "are"} optional: a site without ${optional.length === 1 ? "it" : "them"} is checked against the core rows only. When ${optional.length === 1 ? "it is" : "one is"} active at any other version, marked submissions of the adapters it applies to are rejected.`,
    cleantalk === undefined || smtp === undefined
      ? []
      : `This includes later patch releases such as FluentSMTP ${smtp.replace(/\d+$/, (n) => String(BigInt(n) + 1n))} or CleanTalk ${cleantalk}.1: ${smtp} is the only audited FluentSMTP release, not ${smtp.split(".").slice(0, -1).join(".")}.x.`,
    unlisted.length === 0
      ? []
      : `${list(unlisted)} ${unlisted.length === 1 ? "is" : "are"} not audited by this build: while ${unlisted.length === 1 ? "it is" : "one is"} active, marked submissions of the adapters it applies to are rejected as awaiting audit.`,
    "An active plugin whose version cannot be read counts as not audited. A new version is supported only after it is re-audited. Ordinary submissions still work with any version. The plugin also loads without either form plugin; each adapter is simply inactive.",
  ].flat();
  return [
    `Version ${version}. Marked submissions are accepted only on these exact audited versions, compared as exact strings:`,
    "",
    "| Plugin | Audited version | Applies to |",
    "|---|---|---|",
    ...listed.map((key) => `| ${GUIDE[key].label} | ${pins[key]} | ${GUIDE[key].applies} |`),
    "",
    sentences.join(" "),
    "",
  ].join("\n");
}

export function renderPlugin(deployment: Deployment, source = SOURCE): RenderedFile[] {
  const { config, versions, assets } = deployment;
  const values: Record<string, string> = {
    "plugin.name": config.plugin.name,
    "plugin.author": config.plugin.author,
    "plugin.description": config.plugin.description,
    "plugin.slug": config.plugin.slug,
    "plugin.updateUri": config.plugin.updateUri,
    "channel.repository": config.channel.repository,
    "channel.releasesRoot": config.channel.releasesRoot,
    "channel.publicKey": config.channel.publicKey,
    "forms.refusalPrefix": config.forms.refusalPrefix,
    "assets.main": assets.main,
    "assets.basename": assets.basename,
    "assets.zip": assets.zip,
    "assets.manifest": assets.manifest,
    "assets.signature": assets.signature,
    "versions.helperVersion": versions.helperVersion,
    auditedVersions: PIN_KEYS.map((key) => auditedLine(key, versions.audited[key])).join("\n"),
    currentVersions: renderCurrentVersions(versions.audited, versions.helperVersion),
  };
  return FILES.map((file) => ({
    file,
    path: `${config.plugin.slug}/${file === MAIN ? assets.main : file}`,
    contents: renderTemplate(readFileSync(join(source, file), "utf8"), values, file),
  }));
}
