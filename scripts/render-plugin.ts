// Renders the shared helper templates in plugin/pirax-form-test/ for one deployment (plan D3). A template holds a
// typed token, {{<context>:<value>}}, only where a deployment-specific value goes; every other byte, internal
// identifiers included (namespace, options, hooks, mail header and subject tag), ships unchanged. The context
// escapes for where the token sits:
//   raw    plugin headers, comments and Markdown code spans (the schema keeps these values to one plain line)
//   php    inside a single-quoted PHP string
//   html   HTML text
//   md     Markdown text
// Values: plugin.{name,author,description,slug,updateUri}, channel.{repository,releasesRoot,publicKey},
// forms.refusalPrefix, assets.{main,basename,zip,manifest,signature}, versions.helperVersion,
// versions.audited.<pin key> and currentVersions (the plugin guide's generated section). An unknown token, or
// anything left looking like one, throws naming the template file and token, never a value.
//   FILES / SOURCE                        the production allowlist (template paths) and the template directory
//   renderPlugin(deployment, source?)     every allowlisted file as { file, path, contents }; path is the archive
//                                         path <slug>/<file>, with the main file renamed to <slug>.php
//   renderTemplate(text, values, file)    one template
//   renderCurrentVersions(pins, version)  the plugin guide's current-versions section
// Import-safe; renderPlugin() only reads the templates.
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { PIN_KEYS, type AuditedVersions, type Deployment } from "../src/deployment.ts";

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

/** The plugin guide's generated current-versions section (between its markers), from pins and helper version. */
export function renderCurrentVersions(pins: AuditedVersions, version: string): string {
  const smtpSeries = `${pins.fluent_smtp.split(".").slice(0, -1).join(".")}.x`;
  const smtpNext = pins.fluent_smtp.replace(/\d+$/, (n) => String(BigInt(n) + 1n));
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
    `Pro, CleanTalk and FluentSMTP are optional: a site without them is checked against the core rows only. When one is active at any other version, marked submissions of the adapters it applies to are rejected. This includes later patch releases such as FluentSMTP ${smtpNext} or CleanTalk ${pins.cleantalk}.1: ${pins.fluent_smtp} is the only audited FluentSMTP release, not ${smtpSeries}. An active plugin whose version cannot be read counts as not audited. A new version is supported only after it is re-audited. Ordinary submissions still work with any version. The plugin also loads without either form plugin; each adapter is simply inactive.`,
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
    ...Object.fromEntries(PIN_KEYS.map((key) => [`versions.audited.${key}`, versions.audited[key]])),
    currentVersions: renderCurrentVersions(versions.audited, versions.helperVersion),
  };
  return FILES.map((file) => ({
    file,
    path: `${config.plugin.slug}/${file === MAIN ? assets.main : file}`,
    contents: renderTemplate(readFileSync(join(source, file), "utf8"), values, file),
  }));
}
