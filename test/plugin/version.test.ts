// Version answer (plan D1–D4, D6; criteria 1 and 2) against the uploaded ZIP in real WordPress. Every request is
// anonymous. A refusal must equal, in status, headers (except Date) and body, the same request made before the helper
// was installed: what a site without the helper answers. The raw requests and the checker's own request use the
// protocol constants of src/helper-version.ts, so this suite is also their agreement test with the PHP copy.
// bun --env-file=/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/.env test test/plugin/version.test.ts
import { afterAll, beforeAll, expect, setDefaultTimeout, test } from "bun:test";
import { join, resolve } from "node:path";
import { loadDeployment } from "../../src/deployment";
import { askHelpers, HELPER_TOKEN_HEADER, versionUrl } from "../../src/helper-version";
import type { Site } from "../../src/sites";
import { startHarness, type Harness } from "./harness";
import { HELPER_VERSION } from "./version-fixtures";

// Playground round trips exceed Bun's 5 s default. Bun 1.4 scopes this to the calling file, so every suite sets it.
setDefaultTimeout(180_000);

const ROOT = resolve(import.meta.dir, "../..");
const ZIP = join(ROOT, "dist", loadDeployment().assets.zip);
const REDIRECT = "form-tests+pirax@operator.test";
// Synthetic, never h.token: a failing matcher prints what it received. No quote or backslash, so it is a plain PHP literal.
const TOKEN = "version-Suite+Token/=0123456789";

type Shape = { url: (base: string) => string; headers: Record<string, string> };
const header = (value: string): Shape => ({ url: versionUrl, headers: { [HELPER_TOKEN_HEADER]: value } });
const SHAPES = {
  token: header(TOKEN),
  none: { url: versionUrl, headers: {} },
  flipped: header(TOKEN[0]!.toUpperCase() + TOKEN.slice(1)),
  prefix: header(TOKEN.slice(0, -1)),
  suffix: header(`${TOKEN}x`),
  empty: header(""),
  query: { url: (base) => `${versionUrl(base)}&token=${encodeURIComponent(TOKEN)}`, headers: {} },
  path: { url: (base) => versionUrl(base).replace("?", `/${encodeURIComponent(TOKEN)}?`), headers: {} },
} satisfies Record<string, Shape>;
type Name = keyof typeof SHAPES;
type Seen = { status: number; headers: [string, string][]; body: string };

let h: Harness;
let before: Record<Name, Seen>;

async function ask(name: Name): Promise<Seen> {
  const { url, headers } = SHAPES[name];
  const response = await fetch(url(h.url), { headers, redirect: "manual" });
  return { status: response.status, headers: [...response.headers].filter(([key]) => key !== "date"), body: await response.text() };
}
/** Each shape's answer now, labeled so a failure names the shape. */
const refusals = async (names: Name[]) => {
  const seen: [Name, Seen][] = [];
  for (const name of names) seen.push([name, await ask(name)]);
  return seen;
};
const site = (): Site => ({ slug: "playground", url: h.url, form_helper: false, mask: [], max_diff_pixel_ratio: 0.01, pages: [{ path: "/", mask: [] }] });

beforeAll(async () => {
  const build = await Bun.$`bun run build:plugin`.cwd(ROOT).quiet().nothrow();
  if (build.exitCode !== 0) throw new Error(`build:plugin failed: ${build.stderr}`);
  h = await startHarness({ run: "version" });
  // Playground's CLI answers its very first request with a one-time 302 to the same URL; spend it here.
  await fetch(h.url, { redirect: "manual" }).then((response) => response.arrayBuffer());
  // Without the helper: the answer of a site that has none, for every request shape.
  before = {} as Record<Name, Seen>;
  for (const name of Object.keys(SHAPES) as Name[]) before[name] = await ask(name);
  const admin = await h.browser("version-install");
  await admin.page.goto(`${h.url}/wp-login.php`);
  await admin.page.fill("#user_login", h.users.admin.login);
  await admin.page.fill("#user_pass", h.users.admin.password);
  await admin.page.click("#wp-submit");
  await admin.page.waitForURL(/\/wp-admin\/?/);
  await h.uploadPlugin(admin.page, ZIP);
  await h.closeBrowser(admin.context);
  await h.php(`update_option('pirax_form_test_token', '${TOKEN}', false); update_option('pirax_form_test_redirect', '${REDIRECT}', false); return true;`);
}, 600_000);
afterAll(async () => {
  await h?.stop();
}, 60_000);

test("the configured token in the header gets exactly the installed version, never cacheable", async () => {
  expect(before.token.status).toBe(400);
  const answer = await ask("token");
  expect({ status: answer.status, body: JSON.parse(answer.body) }).toEqual({ status: 200, body: { version: HELPER_VERSION } });
  expect(answer.headers.find(([key]) => key === "cache-control")?.[1] ?? "no cache-control header").toContain("no-store");
});

test("every other request gets what WordPress answered before the helper was installed", async () => {
  const names: Name[] = ["none", "flipped", "prefix", "suffix", "empty", "query", "path"];
  expect(await refusals(names)).toEqual(names.map((name) => [name, before[name]]));
});

test("the checker's own request reads the version, and unknown for a wrong token", async () => {
  expect(await askHelpers([site()], TOKEN, { ignoreHTTPSErrors: false })).toEqual([{ state: "version", version: HELPER_VERSION }]);
  expect(await askHelpers([site()], `${TOKEN}x`, { ignoreHTTPSErrors: false })).toMatchObject([{ state: "unknown" }]);
});

test("with no token configured, the token and an empty header get what a site without the helper answers", async () => {
  await h.php(`delete_option('pirax_form_test_token'); return true;`);
  expect(await refusals(["token", "empty"])).toEqual([["token", before.token], ["empty", before.empty]]);
  await h.saveEvidence();
});
