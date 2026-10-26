// Helper version report (plan D5–D12; criteria 3 and 4) through the production check command. Loopback stand-in sites
// answer the current version, an older one, no version, an error, nothing, and a redirect; a `helper: false` site would
// answer but must not be asked. A fixture deployment's helperVersion (1.4.9, unlike Pirax's) is the current one. The
// report, its published copy and the summary email show each state, and the token stays out of every request URL, the
// report, the run evidence and the logs.
// bun --no-env-file test tests/helper-version.test.ts
import { afterAll, beforeAll, expect, spyOn, test } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { formatWeekly } from "../scripts/weekly/summary.ts";
import { runCommand, type CommandResult } from "../src/commands/common.ts";
import { loadDeployment } from "../src/deployment.ts";
import { secretRedactor } from "../src/forms/evidence.ts";
import { HELPER_TOKEN_HEADER, versionUrl } from "../src/helper-version.ts";
import { parseManifest } from "../src/report/manifest.ts";
import type { Store } from "../src/store.ts";
import { findSecret } from "../test/plugin/artifacts.ts";
import { FIXTURE_VERSIONS, fixtureConfig, fixtureKeys, writeDeployment } from "../test/fixtures/deployment.ts";

// Synthetic, never a real FORM_TEST_TOKEN: a failing matcher prints what it received. Made at run time, because capture
// traces keep the caller's source files, and a literal token in this file would show up in them.
const TOKEN = `helper-${crypto.randomUUID()}+Token/=`;
const dir = resolve("runs", `helper-version-${crypto.randomUUID()}`);
const root = join(dir, "fixture-root");
writeDeployment(root, "fixture", { config: fixtureConfig(fixtureKeys().publicKey), versions: FIXTURE_VERSIONS });
const selection = { root, env: { DEPLOYMENT: "fixture" } };
const deployment = loadDeployment(selection);
const CURRENT = deployment.versions.helperVersion;
const VERSION_REQUEST = (() => { const url = new URL(versionUrl("http://stand-in.invalid")); return url.pathname + url.search; })();
const redact = secretRedactor(TOKEN);
/** The token itself, any encoding the redactor knows, or its redaction placeholder. */
const holdsToken = (text: string) => text.includes("<token>") || redact(text).includes("<token>");

type Seen = { method: string; path: string; token: string | null };
const seen: Record<string, Seen[]> = {};
const servers: ReturnType<typeof Bun.serve>[] = [];
const PAGE = '<!doctype html><meta charset="utf-8"><title>Stand-in</title><p>Stand-in site</p>';
/** A loopback site: `/` and `/favicon.ico` for the capture, `version` for the version request. */
function standIn(label: string, version: (request: Request) => Response | Promise<Response>, idleTimeout?: number): string {
  seen[label] = [];
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    ...(idleTimeout === undefined ? {} : { idleTimeout }),
    fetch(request) {
      const url = new URL(request.url);
      seen[label]!.push({ method: request.method, path: url.pathname + url.search, token: request.headers.get(HELPER_TOKEN_HEADER) });
      if (url.pathname + url.search === VERSION_REQUEST) return version(request);
      if (url.pathname === "/favicon.ico") return new Response(null, { status: 204 });
      return new Response(PAGE, { headers: { "content-type": "text/html; charset=utf-8" } });
    },
  });
  servers.push(server);
  return `http://127.0.0.1:${server.port}`;
}
/** What the helper does: the version to the exact token, WordPress's unknown-action answer otherwise. */
const helperLike = (version: string) => (request: Request) =>
  request.headers.get(HELPER_TOKEN_HEADER) === TOKEN ? Response.json({ version }) : new Response("0", { status: 400 });

/** In memory only: no live reads behind it. */
function memoryStore(): Store & { objects: Map<string, Uint8Array> } {
  const objects = new Map<string, Uint8Array>();
  return {
    objects,
    async put(key, data) { objects.set(key, data instanceof Blob ? new Uint8Array(await data.arrayBuffer()) : data); },
    async get(key) {
      const bytes = objects.get(key);
      if (!bytes) throw new Error(`no object ${key}`);
      return bytes;
    },
    async list(prefix) { return [...objects.keys()].filter((key) => key.startsWith(prefix)).sort(); },
    presign: (key) => `https://store.invalid/${key}?X-Amz-Signature=stand-in`,
    async delete(key) { objects.delete(key); },
    async pruneReports() {},
  };
}

const store = memoryStore();
const logs: string[] = [];
const consoleLines: string[] = [];
const savedToken = process.env.FORM_TEST_TOKEN;
let result: CommandResult;
let runDir: string;

beforeAll(async () => {
  mkdirSync(dir, { recursive: true });
  // A CORS-permissive other origin that would answer the current version: following the redirect would reach it.
  const sinkBase = standIn("sink", (request) =>
    request.method === "OPTIONS"
      ? new Response(null, { status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": HELPER_TOKEN_HEADER } })
      : Response.json({ version: CURRENT }, { headers: { "access-control-allow-origin": "*" } }));
  const sites: [string, string, boolean][] = [
    ["current-site", standIn("current-site", helperLike(CURRENT)), true],
    ["older-site", standIn("older-site", helperLike("0.0.1")), true],
    ["no-version", standIn("no-version", (request) => new Response(`<p>WordPress 6.8.3 ${request.headers.get(HELPER_TOKEN_HEADER)}</p>`, { headers: { "content-type": "text/html" } })), true],
    ["error-site", standIn("error-site", () => Response.json({ version: CURRENT }, { status: 500 })), true],
    ["no-answer", standIn("no-answer", () => new Promise<Response>(() => {}), 0), true],
    ["redirect-site", standIn("redirect-site", () => new Response(null, { status: 302, headers: { location: versionUrl(sinkBase) } })), true],
    ["no-helper", standIn("no-helper", helperLike(CURRENT)), false],
  ];
  const sitesFile = join(dir, "sites.yaml");
  await Bun.write(sitesFile, `sites:\n${sites.map(([slug, url, helper]) => `  - slug: ${slug}\n    url: ${url}\n    form_helper: false\n${helper ? "" : "    helper: false\n"}    pages: [/]\n`).join("")}`);
  process.env.FORM_TEST_TOKEN = TOKEN;
  const spies = (["log", "error", "warn", "info"] as const).map((method) => spyOn(console, method).mockImplementation((...args: unknown[]) => { consoleLines.push(args.map(String).join(" ")); }));
  try {
    result = (await runCommand("check", ["all", "--sites", sitesFile], { store, selection, runsDir: join(dir, "runs"), log: (line) => logs.push(line) })) as CommandResult;
  } finally {
    for (const spy of spies) spy.mockRestore();
  }
  runDir = result.runDir!;
}, 240_000);
afterAll(() => {
  if (savedToken === undefined) delete process.env.FORM_TEST_TOKEN;
  else process.env.FORM_TEST_TOKEN = savedToken;
  for (const server of servers) server.stop(true);
  rmSync(dir, { recursive: true, force: true });
});

const text = (bytes: Uint8Array) => new TextDecoder().decode(bytes);
const published = (name: string) => text(store.objects.get(`reports/${result.report!.runId}/${name}`)!);

test("the report holds each site's answer and the deployment's current helperVersion", () => {
  const report = result.report!;
  expect(report.helperVersion).toBe(CURRENT);
  expect(Object.fromEntries(report.sites.map((site) => [site.slug, site.helper]))).toMatchObject({
    "current-site": { state: "version", version: CURRENT },
    "older-site": { state: "version", version: "0.0.1" },
    "no-version": { state: "unknown" },
    "error-site": { state: "unknown" },
    "no-answer": { state: "unknown" },
    "redirect-site": { state: "unknown" },
    "no-helper": { state: "no-helper" },
  });
  // The published manifest is the same report, and it validates.
  expect(parseManifest(JSON.parse(published("manifest.json")), report.runId).report).toEqual(report);
});

test("the HTML report and the summary email show each state, and unknown is never counted as current", async () => {
  const counts = `Helpers: current 1, not current 1, unknown 4, no helper 1 (current version ${CURRENT})`;
  const expected: Record<string, { html: string; email: string }> = {
    "current-site": { html: `helper ${CURRENT}, current`, email: `; helper ${CURRENT}, current` },
    "older-site": { html: "helper 0.0.1, not current", email: "; helper 0.0.1, not current" },
    "no-version": { html: "helper unknown (", email: "; helper unknown" },
    "error-site": { html: "helper unknown (", email: "; helper unknown" },
    "no-answer": { html: "helper unknown (", email: "; helper unknown" },
    "redirect-site": { html: "helper unknown (", email: "; helper unknown" },
    "no-helper": { html: "no helper", email: "; no helper" },
  };
  for (const html of [published("index.html"), await Bun.file(join(runDir, "index.html")).text()]) {
    // The matched line, not the whole page: a failure then prints one line instead of every inlined screenshot.
    expect(html.match(/Helpers: [^<]*/)?.[0]).toBe(counts);
    const sections = html.split("<section>").slice(1);
    expect(Object.fromEntries(Object.keys(expected).map((slug) => [slug, sections.find((s) => s.startsWith(`<h2>${slug} — `))?.includes(expected[slug]!.html)]))).toEqual(
      Object.fromEntries(Object.keys(expected).map((slug) => [slug, true])),
    );
  }
  const message = formatWeekly(deployment, { exitCode: result.exitCode, report: result.report, url: result.url }, new Date());
  expect(message.valid).toBe(true);
  const lines = message.text.split("\n");
  expect(lines[lines.findIndex((line) => line.startsWith("Sites: ")) + 1]).toBe(counts);
  expect(Object.fromEntries(Object.keys(expected).map((slug) => [slug, lines.find((line) => line.startsWith(`${slug}: `))?.endsWith(expected[slug]!.email)]))).toEqual(
    Object.fromEntries(Object.keys(expected).map((slug) => [slug, true])),
  );
});

test("only helper sites are asked, with the token in the header, and redirects are not followed", () => {
  const versionRequests = (label: string) => seen[label]!.filter((request) => request.path === VERSION_REQUEST);
  expect(versionRequests("current-site").map((request) => request.token === TOKEN)).toContain(true);
  expect(versionRequests("no-helper")).toEqual([]);
  expect(seen["no-helper"]!.filter((request) => request.token !== null)).toEqual([]);
  // A local service on this machine probes new listeners with `GET /` (see test/forms/imap.test.ts), so only requests
  // the checker could have sent count: the version path (its CORS preflight included) or the header.
  expect(seen.sink!.filter((request) => request.path === VERSION_REQUEST || request.token !== null)).toEqual([]);
});

test("the token appears in no request URL, report, run evidence or log", async () => {
  const urls = Object.values(seen).flatMap((requests) => requests.map((request) => request.path));
  expect(urls.length).toBeGreaterThan(0);
  expect(urls.filter(holdsToken)).toEqual([]);
  expect(await findSecret(runDir, [TOKEN])).toEqual([]);
  expect([...store.objects].filter(([, bytes]) => holdsToken(text(bytes))).map(([key]) => key)).toEqual([]);
  const message = formatWeekly(deployment, { exitCode: result.exitCode, report: result.report, url: result.url }, new Date());
  expect(holdsToken(message.text)).toBe(false);
  expect(logs.length).toBeGreaterThan(0);
  expect([...logs, ...consoleLines].filter(holdsToken)).toEqual([]);
});
