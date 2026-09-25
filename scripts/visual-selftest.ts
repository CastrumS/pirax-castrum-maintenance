// Real WordPress + R2 acceptance. Nothing escapes the unique test root; never persist signed URLs.
import { mkdirSync, renameSync } from "node:fs";
import { join, resolve } from "node:path";
import { chromium } from "playwright";
import { runBaseline } from "../src/commands/baseline.ts";
import { runCheck } from "../src/commands/check.ts";
import { runApprove, completedRunIds } from "../src/commands/approve.ts";
import type { CommandResult } from "../src/commands/common.ts";
import { readR2Config, EnvError } from "../src/env.ts";
import { createStore, type Store } from "../src/store.ts";
import { pageKey, type Site } from "../src/sites.ts";
import type { Manifest } from "../src/report/model.ts";
import { startHttpsFixture } from "../test/fixtures/https.ts";

class Failure extends Error {}
function assert(ok: unknown, message: string): asserts ok { if (!ok) throw new Failure(message); }
const safe = (e: unknown) => e instanceof Failure || e instanceof EnvError ? e.message : e instanceof Error ? e.name : "unknown error";
const same = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((n, i) => n === b[i]);
const stamp = new Date().toISOString().replaceAll(":", "-");
const root = `test/visual-${stamp}-${crypto.randomUUID().slice(0, 8)}/`;
const workspace = resolve("runs", `visual-selftest-${stamp}`);
const runsDir = join(workspace, "commands");
mkdirSync(workspace, { recursive: true });
const checks: { name: string; ok: boolean; error?: string }[] = [];
const commands: { label: string; exitCode: number; runDir?: string; report?: string; traces: string[] }[] = [];
const cleanup = { remote: false, remaining: null as number | null, deleted: 0, wordpress: false, https: false, errors: [] as string[] };
let store: Store | undefined;
let writes = 0;
let wp: Awaited<ReturnType<typeof startWordPress>> | undefined;
let tls: ReturnType<typeof startHttpsFixture> | undefined;
let passed = false, prerequisite = false;
let lastId = Date.now();
const id = () => new Date(lastId = Math.max(Date.now(), lastId + 1)).toISOString().replaceAll(":", "-");
const options = () => ({ runsDir, runId: id(), log: () => {} });
async function check(name: string, fn: () => Promise<void>) {
  console.log(`run  ${name}`);
  try { await fn(); checks.push({ name, ok: true }); console.log(`ok   ${name}`); }
  catch (e) { checks.push({ name, ok: false, error: safe(e) }); console.log(`FAIL ${name}: ${safe(e)}`); throw e; }
}
function record(label: string, r: CommandResult) {
  commands.push({ label, exitCode: r.exitCode, runDir: r.runDir, report: r.localPath,
    traces: r.report?.sites.flatMap(s => s.pages.flatMap(p => Object.values(p.viewports).flatMap(v => v.artifacts.trace ? [join(r.runDir!, v.artifacts.trace)] : []))) ?? [] });
  return r;
}
const baseline = async (sites: Site[], label = "baseline") => record(label, await runBaseline(sites, store!, options()));
const capture = async (sites: Site[], label = "check") => record(label, await runCheck(sites, store!, options()));
const approve = async (site: Site, path?: string) => record("approve", await runApprove(site, store!, { pagePath: path, log: () => {} }));
const views = (r: CommandResult) => r.report!.sites.flatMap(s => s.pages.flatMap(p => Object.values(p.viewports)));
const makeSite = (slug: string, url: string, paths: string[]): Site => ({ slug, url, pages: paths.map(path => ({ path, mask: [] })), mask: [], form_helper: false, max_diff_pixel_ratio: 0.01 });
async function snapshot() {
  const keys = await store!.list("baselines/");
  return new Map(await Promise.all(keys.map(async key => [key, await store!.get(key)] as const)));
}
async function unchanged(before: Map<string, Uint8Array>) {
  const after = await snapshot();
  assert([...before.keys()].join() === [...after.keys()].join(), "baseline key set changed");
  for (const [key, bytes] of before) assert(same(bytes, after.get(key)!), `baseline bytes changed: ${key}`);
}
async function fidelity(r: CommandResult, approved = false, selected?: string) {
  for (const s of r.report!.sites) for (const p of s.pages) {
    if (selected && p.path !== selected) continue;
    for (const v of Object.values(p.viewports)) for (const [ext, artifact] of [["png", v.artifacts.actualPng], ["health.json", v.artifacts.actualHealth]] as const) {
      assert(artifact, "actual pair incomplete");
      const expected = await Bun.file(join(r.runDir!, artifact)).bytes();
      const key = approved ? `baselines/${s.slug}/${v.viewport}/${p.pageKey}.${ext}` : `reports/${r.report!.runId}/${artifact}`;
      assert(same(expected, await store!.get(key)), `remote bytes differ: ${key}`);
    }
  }
}
async function renderRemote(r: CommandResult, text: string[]) {
  assert(r.url, "check did not publish a private report");
  const response = await fetch(r.url);
  assert(response.status === 200, `presigned HTML HTTP ${response.status}`);
  assert(response.headers.get("content-type")?.startsWith("text/html"), "presigned HTML MIME differs");
  const body = await response.text();
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext();
    await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
    try {
      const page = await context.newPage();
      let external = 0;
      page.on("request", req => { if (/^https?:/.test(req.url())) external++; });
      await page.setContent(body); // Never navigate to or trace the signed bearer URL.
      const images = await page.locator("img").evaluateAll(nodes => nodes.map(n => ({ decoded: n instanceof HTMLImageElement && n.complete && n.naturalWidth > 0, inline: n instanceof HTMLImageElement && n.src.startsWith("data:image/png;") })));
      assert(images.length >= 6 && images.every(i => i.decoded && i.inline), "report image panels failed to decode");
      const visible = await page.locator("body").innerText();
      for (const item of text) assert(visible.includes(item), `report omitted ${item}`);
      assert(external === 0, "report requested unsigned external assets");
      await page.screenshot({ path: join(r.runDir!, "remote-report.png"), fullPage: true });
      await Bun.write(join(r.runDir!, "remote-render.json"), JSON.stringify({ status: response.status, mime: response.headers.get("content-type"), images: images.length, external, expectedText: text }, null, 2));
    } finally { await context.tracing.stop({ path: join(r.runDir!, "remote-report.trace.zip") }); await context.close(); }
  } finally { await browser.close(); }
}
async function cli(command: string, args: string[], sites: Site[], expected: number) {
  const file = join(workspace, `sites-${crypto.randomUUID()}.json`);
  await Bun.write(file, JSON.stringify({ sites })); // JSON is valid YAML; isolated fixture list only.
  const child = Bun.spawn([process.execPath, "--no-env-file", "test/fixtures/cli.ts", root, runsDir, command, ...args, "--sites", file], { stdout: "ignore", stderr: "ignore" });
  const exit = await child.exited;
  commands.push({ label: `CLI ${command} ${args.join(" ")}`, exitCode: exit, traces: [] });
  assert(exit === expected, `CLI ${command}: expected ${expected}, got ${exit}`);
}

// JSON line RPC to one live Node Playground; no network control endpoint and no R2 secrets inherited.
async function startWordPress() {
  const probe = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response() });
  const port = probe.port!; probe.stop(true);
  const child = Bun.spawn([process.env.VISUAL_NODE ?? "node", "test/wp/playground.ts", String(port)], {
    env: { PATH: process.env.PATH!, HOME: process.env.HOME!, TMPDIR: workspace }, stdin: "pipe", stdout: "pipe", stderr: "ignore",
  });
  const reader = child.stdout.getReader();
  let buffer = "", seq = 0;
  async function response(): Promise<any> {
    for (;;) {
      const end = buffer.indexOf("\n");
      if (end >= 0) {
        const line = buffer.slice(0, end); buffer = buffer.slice(end + 1);
        if (line.startsWith("VISUAL ")) return JSON.parse(line.slice(7));
      } else {
        const chunk = await reader.read();
        assert(!chunk.done, "Node Playground exited before bridge reply (requires compatible Node and downloadable WordPress/WP-CLI)");
        buffer += new TextDecoder().decode(chunk.value);
      }
    }
  }
  async function bounded<T>(promise: Promise<T>, ms: number): Promise<T> {
    let timer: ReturnType<typeof setTimeout>;
    try { return await Promise.race([promise, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Failure("Playground bridge timed out")), ms); })]); }
    finally { clearTimeout(timer!); }
  }
  async function rpc(request: object) {
    const requestId = ++seq;
    child.stdin.write(JSON.stringify({ ...request, id: requestId }) + "\n"); child.stdin.flush();
    const result = await bounded(response(), 60_000);
    assert(result.id === requestId && result.ok, "same-instance Playground WP-CLI/control operation failed");
    return result.value;
  }
  try {
    const ready = await bounded(response(), 180_000);
    assert(ready.ready && new URL(ready.url).port === String(port), "Playground readiness identity mismatch");
    return { url: ready.url.replace(/\/$/, "") as string, command: (command: string[]) => rpc({ command }), counts: () => rpc({ op: "counts" }),
      async stop() {
        try { await rpc({ op: "stop" }); child.stdin.end(); await bounded(child.exited, 15_000); }
        finally { if (child.exitCode === null) { child.kill("SIGKILL"); await child.exited; } }
      } };
  } catch (e) { child.kill("SIGKILL"); await child.exited; throw e; }
}

console.log(`visual:selftest root ${root}`);
try {
  await check("R2 credentials available by required names", async () => { const real = createStore({ config: readR2Config(), root }); store = { ...real, async put(key, data) { writes++; await real.put(key, data); } }; });
  await check("real Node Playground boots and seeds WordPress via same-instance WP-CLI", async () => {
    wp = await startWordPress();
    for (const slug of ["alpha", "beta", "notfound", "critical", "assets", "console", "transport", "random", "height", "forbidden", "challenge", "writes", "overflow"]) {
      await wp.command(["wp", "post", "create", "--post_type=page", "--post_status=publish", `--post_name=${slug}`, `--post_title=${slug}`, "--post_content=<p>Stable original WordPress content.</p>", "--porcelain"]);
    }
    const seeded = await (await fetch(wp.url + "/alpha/")).text();
    assert(seeded.includes("Stable original WordPress content") && seeded.includes('data-visual-fixture="true"'), "seeded WordPress post or deterministic plugin is not served");
  });
  const site = makeSite("wordpress", wp!.url, ["/alpha/", "/beta/"]);
  const mode: Record<string, string> = {};
  const setModes = async (next: Record<string, string>) => { Object.assign(mode, next); await wp!.command(["wp", "option", "update", "visual_fixture", JSON.stringify(mode)]); };
  let initial: CommandResult, changed: CommandResult;
  await check("baseline both widths and exact real R2 PNG/health bytes", async () => {
    initial = await baseline([site]); assert(initial.exitCode === 0, "stable baseline failed"); await fidelity(initial, true);
  });
  await check("same-instance WP-CLI update changes exactly alpha at both widths", async () => {
    await wp!.command(["wp", "eval", `$post = get_page_by_path("alpha", OBJECT, "page"); if (!$post) WP_CLI::error("alpha missing"); wp_update_post(["ID" => $post->ID, "post_content" => '<div style="background:#df6c45;height:300px">Accepted updated WordPress content.</div>']);`]);
    assert((await (await fetch(wp!.url + "/alpha/")).text()).includes("Accepted updated WordPress content"), "WP-CLI mutation not visible on running instance");
    changed = await capture([site], "changed alpha"); assert(changed.exitCode === 1, "changed check must fail");
    for (const p of changed.report!.sites[0]!.pages) for (const v of Object.values(p.viewports)) {
      assert(v.visual.state === (p.path === "/alpha/" ? "changed" : "same"), `unexpected visual state ${p.path} ${v.viewport}`);
      assert(v.capture.state === "captured" && v.health.length === 0, "stable WordPress has health/capture errors");
    }
    await fidelity(changed); assert(!(await store!.list("reports/")).some(k => k.endsWith(".trace.zip")), "private traces uploaded to R2"); await renderRemote(changed, ["/alpha/", "/beta/", "changed", "same"]);
  });
  await check("page approval preserves beta; new check and CLI pass", async () => {
    const before = await snapshot(); assert((await approve(site, "/alpha/")).exitCode === 0, "page approval failed");
    await fidelity(changed!, true, "/alpha/");
    for (const [key, bytes] of before) if (key.includes("/beta.")) assert(same(bytes, await store!.get(key)), "unrelated beta baseline changed");
    assert((await capture([site], "after page approval")).exitCode === 0, "approved page check failed");
    await cli("check", [site.slug], [site], 0);
  });
  await check("remote-only whole-site approval ignores newer unrelated and partial runs", async () => {
    await wp!.command(["wp", "eval", `foreach (["alpha", "beta"] as $slug) { $post = get_page_by_path($slug, OBJECT, "page"); wp_update_post(["ID" => $post->ID, "post_content" => '<div style="background:#297c55;height:400px">Whole-site approved WordPress content.</div>']); }`]);
    const source = await capture([site], "remote approval source");
    assert(source.exitCode === 1 && views(source).every(v => v.visual.state === "changed"), "whole-site approval source must change both pages");
    const before = await snapshot();
    const archived = source.runDir! + "-retained"; renameSync(source.runDir!, archived); // Remove cache path, retain evidence elsewhere.
    const entry = commands.find(c => c.runDir === source.runDir)!;
    entry.runDir = archived; entry.report = join(archived, "index.html"); entry.traces = entry.traces.map(p => p.replace(source.runDir!, archived));
    const unrelated = await capture([makeSite("other", wp!.url, ["/beta/"])], "unrelated newest");
    assert(unrelated.exitCode === 1, "unrelated missing baseline should fail");
    const partialId = id(); await store!.put(`reports/${partialId}/actual/partial.png`, new Uint8Array([1]));
    assert((await approve(site)).exitCode === 0, "remote-only whole-site approval failed");
    source.runDir = archived; await fidelity(source, true);
    for (const [key, bytes] of before) if (key.endsWith(".png")) assert(!same(bytes, await store!.get(key)), "whole-site approval failed to replace a changed PNG");
  });
  await check("approval negative preflight leaves all real baselines unchanged", async () => {
    const source = await capture([site], "approval negative source");
    const original = JSON.parse(await Bun.file(join(source.runDir!, "manifest.json")).text()) as Manifest;
    const before = await snapshot();
    const failApproval = async (candidate: Site, pagePath?: string) => { const count = writes; assert((await approve(candidate, pagePath)).exitCode === 1, "invalid approval unexpectedly passed"); assert(writes === count, "failed approval attempted a baseline write"); await unchanged(before); };
    await failApproval({ ...site, url: site.url + "/changed" });
    await failApproval({ ...site, pages: [...site.pages, { path: "/new/", mask: [] }] });
    await failApproval({ ...site, slug: "no-history" });
    for (const mutation of ["blocked", "missing-page", "missing-pair"] as const) {
      const m = structuredClone(original); m.report.runId = id();
      if (mutation === "blocked") m.report.sites[0]!.pages[1]!.viewports.mobile.capture.state = "blocked";
      if (mutation === "missing-page") m.report.sites[0]!.pages.pop();
      // For missing-pair, first page is complete: validates before reaching missing beta, proving all-page preflight.
      for (const p of m.report.sites[0]!.pages) for (const v of Object.values(p.viewports)) for (const path of [v.artifacts.actualPng!, v.artifacts.actualHealth!]) {
        if (mutation === "missing-pair" && path.includes("/beta.")) continue;
        await store!.put(`reports/${m.report.runId}/${path}`, await Bun.file(join(source.runDir!, path)).bytes());
      }
      await store!.put(`reports/${m.report.runId}/manifest.json`, new TextEncoder().encode(JSON.stringify(m)));
      await failApproval(site);
    }
  });
  await check("isolated WordPress health failures and baseline-relative warnings", async () => {
    const healthSite = makeSite("health", wp!.url, ["/notfound/", "/critical/", "/assets/", "/console/", "/transport/"]);
    assert((await baseline([healthSite])).exitCode === 0, "clean health baseline failed");
    const closed = Bun.serve({ port: 0, fetch: () => new Response() }); const closedPort = closed.port!; closed.stop(true);
    await setModes({ notfound: "notfound", critical: "critical", assets: "assets-a", console: "console-a", transport: `transport:${closedPort}` });
    const broken = await capture([healthSite], "new health failures"); assert(broken.exitCode === 1, "new health must fail");
    const kinds: Record<string, string> = { "/notfound/": "status", "/critical/": "critical-error", "/assets/": "failed-request", "/console/": "console-error", "/transport/": "failed-request" };
    for (const p of broken.report!.sites[0]!.pages) for (const v of Object.values(p.viewports)) {
      assert(v.capture.state === "captured", "health fixture unexpectedly blocked");
      assert(v.health.some(h => h.kind === kinds[p.path] && h.severity === "failure"), `missing health failure ${p.path} ${v.viewport}`);
      const raw = await Bun.file(join(broken.runDir!, v.artifacts.actualHealth!)).json();
      if (p.path === "/assets/") assert(raw.failedRequests.filter((r: { status: number }) => r.status === 404).length === 2, "missing CSS/image 404 pair");
      if (p.path === "/console/") assert(raw.consoleErrors.length === 2, "console and uncaught error not both observed");
      if (p.path === "/transport/") assert(raw.failedRequests.some((r: { status: number | null }) => r.status === null), "transport failure not observed");
    }
    await renderRemote(broken, ["critical-error", "failed-request", "console-error"]);
    assert((await approve(healthSite)).exitCode === 0, "complete health evidence approval failed");
    const known = await capture([healthSite], "known health findings"); assert(known.exitCode === 1, "baselined status/critical errors must still fail");
    for (const p of known.report!.sites[0]!.pages) for (const v of Object.values(p.viewports)) {
      assert(v.visual.state === "same", "unchanged health fixture visually changed");
      if (["/assets/", "/console/", "/transport/"].includes(p.path)) assert(v.health.length > 0 && v.health.every(h => h.severity === "warning"), "known diagnostics must warn");
      else assert(v.health.some(h => h.severity === "failure"), "unconditional health failure waived");
    }
    const relative = { ...healthSite, pages: healthSite.pages.filter(p => ["/assets/", "/console/", "/transport/"].includes(p.path)) };
    assert((await capture([relative], "warnings only")).exitCode === 0, "warnings-only check failed");
    await setModes({ assets: "assets-b", console: "console-b" });
    const fresh = await capture([relative], "new relative findings"); assert(fresh.exitCode === 1, "new diagnostic must fail");
    for (const p of fresh.report!.sites[0]!.pages.filter(p => p.path !== "/transport/")) for (const v of Object.values(p.viewports)) assert(v.health.some(h => h.severity === "failure"), "new finding lacks failure");
    await setModes({ assets: "normal", console: "normal", transport: "normal" });
    const removed = await capture([relative], "removed diagnostics"); assert(views(removed).every(v => v.health.length === 0), "removed diagnostic retained");
  });
  await check("site/page mask union stabilizes large random regions; no mask fails", async () => {
    await setModes({ random: "random" });
    const masked = makeSite("masked", wp!.url, ["/random/"]); masked.mask = ["#random"]; masked.pages[0]!.mask = ["#random-page"];
    assert((await baseline([masked])).exitCode === 0, "masked baseline failed");
    assert((await capture([masked], "masked random")).exitCode === 0, "mask union did not stabilize random regions");
    const unmasked = makeSite("unmasked", wp!.url, ["/random/"]); await baseline([unmasked]);
    const changed = await capture([unmasked], "unmasked random"); assert(changed.exitCode === 1 && views(changed).every(v => v.visual.state === "changed"), "large unmasked random regions must change");
    await cli("check", [unmasked.slug], [unmasked], 1);
    await cli("check", [masked.slug], [{ ...masked, mask: ["div["] }], 2);
    const unmatched = await capture([{ ...masked, mask: [...masked.mask, ".absent"] }], "unmatched selector");
    assert(unmatched.exitCode === 0 && views(unmatched).every(v => v.warnings.some(w => w.includes("matched nothing"))), "unmatched selector warning missing");
  });
  await check("height and horizontal overflow preserve dimensions and approve correctly", async () => {
    const sizing = makeSite("sizing", wp!.url, ["/height/", "/overflow/"]); await baseline([sizing]);
    await setModes({ height: "tall", overflow: "overflow" });
    const changed = await capture([sizing], "dimensions changed"); assert(changed.exitCode === 1, "dimension changes must fail");
    for (const p of changed.report!.sites[0]!.pages) for (const v of Object.values(p.viewports)) {
      assert(v.visual.state === "changed" && v.artifacts.diffPng, "dimension diff missing");
      const dimension = p.path === "/height/" ? "height" : "width";
      assert(v.visual.actual![dimension] > v.visual.baseline![dimension], "dimension did not increase");
    }
    const heights = changed.report!.sites[0]!.pages[0]!.viewports.desktop.visual;
    await renderRemote(changed, [String(heights.baseline!.height), String(heights.actual!.height)]);
    assert((await approve(sizing)).exitCode === 0, "overflow/height approval failed"); await fidelity(changed, true);
    assert((await capture([sizing], "approved dimensions")).exitCode === 0, "approved dimensions did not pass");
  });
  await check("blocked unreachable/403/challenge sites continue to normal site", async () => {
    await setModes({ forbidden: "forbidden", challenge: "challenge" });
    const probe = Bun.serve({ port: 0, fetch: () => new Response() }); const port = probe.port!; probe.stop(true);
    const result = await capture([makeSite("unreachable", `http://127.0.0.1:${port}`, ["/"]), makeSite("denied", wp!.url, ["/forbidden/"]), makeSite("challenge", wp!.url, ["/challenge/"]), site], "blocked continuation");
    assert(result.exitCode === 1, "blocked selection must fail");
    for (const s of result.report!.sites.slice(0, 3)) for (const p of s.pages) for (const v of Object.values(p.viewports)) assert(v.capture.state === "blocked", "blocked state missing");
    for (const p of result.report!.sites[3]!.pages) for (const v of Object.values(p.viewports)) assert(v.capture.state === "captured" && v.visual.state === "same", "normal later site not checked");
  });
  await check("GET-only browser policy prevents POST and beacon reaching WordPress", async () => {
    await setModes({ writes: "writes" }); const before = await wp!.counts();
    const result = await baseline([makeSite("readonly", wp!.url, ["/writes/"])]);
    const after = await wp!.counts();
    assert((after.POST ?? 0) === (before.POST ?? 0) && after.GET > before.GET, "browser writes reached WordPress");
    assert(views(result).every(v => v.warnings.filter(w => w.includes("blocked POST")).length === 2), "POST/beacon policy evidence missing");
    await Bun.write(join(workspace, "get-only-counts.json"), JSON.stringify({ before, after }));
  });
  await check("self-signed HTTPS blocked by default; internal fixture reports mixed content", async () => {
    tls = startHttpsFixture(workspace); const secure = makeSite("mixed", tls.url, ["/"]);
    const strict = await capture([secure], "strict TLS"); assert(views(strict).every(v => v.capture.state === "blocked"), "default TLS validation bypassed");
    const mixed = record("mixed content", await runCheck([secure], store!, { ...options(), browser: { ignoreHTTPSErrors: true } }));
    assert(mixed.exitCode === 1 && views(mixed).every(v => v.capture.state === "captured" && v.health.some(h => h.kind === "mixed-content" && h.severity === "failure")), "HTTPS mixed-content failure missing");
    assert((await approve(secure)).exitCode === 0, "mixed-content evidence promotion failed");
    const repeated = record("baselined mixed content", await runCheck([secure], store!, { ...options(), browser: { ignoreHTTPSErrors: true } }));
    assert(repeated.exitCode === 1 && views(repeated).every(v => v.health.some(h => h.kind === "mixed-content" && h.severity === "failure")), "baseline waived mixed content");
  });
  await check("CLI configuration errors and missing baseline leave baseline bytes intact", async () => {
    const before = await snapshot();
    await cli("check", ["unknown"], [site], 2); await cli("approve", [site.slug, "/absent/"], [site], 2); await cli("check", [site.slug, "--bogus"], [site], 2);
    const absent = await capture([makeSite("absent", wp!.url, ["/beta/"])], "missing baseline");
    assert(absent.exitCode === 1 && views(absent).every(v => v.visual.state === "missing-baseline"), "missing baseline result incorrect"); await unchanged(before);
  });
  await check("real check prunes more than ten report runs; baselines unchanged", async () => {
    const before = await snapshot();
    const oldest = Array.from({ length: 12 }, (_, n) => new Date(Date.UTC(2020, 0, 1, 0, 0, n)).toISOString().replaceAll(":", "-"));
    for (const runId of oldest) await store!.put(`reports/${runId}/sentinel.json`, new TextEncoder().encode("{}"));
    const allBefore = [...new Set((await store!.list("reports/")).map(k => k.split("/")[1]!))].sort();
    assert(allBefore.length > 10, "retention fixture did not cross ten");
    const result = await capture([site], "retention check"); assert(result.exitCode === 0, "retention check failed");
    const actual = [...new Set((await store!.list("reports/")).map(k => k.split("/")[1]!))].sort();
    const expected = [...allBefore, result.report!.runId].sort().slice(-10);
    assert(actual.length === 10 && actual.join() === expected.join(), "retention removed wrong run directories");
    assert((await store!.list(`reports/${oldest[0]}/`)).length === 0, "oldest report survived");
    assert(completedRunIds(await store!.list("reports/")).length <= 10, "completed run retention exceeded ten"); await unchanged(before);
    await Bun.write(join(workspace, "retention.json"), JSON.stringify({ before: allBefore, after: actual, expected }, null, 2));
  });
  passed = true;
} catch (e) {
  prerequisite = e instanceof EnvError;
  if (!checks.some(c => !c.ok)) checks.push({ name: "selftest setup/operation", ok: false, error: safe(e) });
} finally {
  try { if (wp) await wp.stop(); cleanup.wordpress = true; } catch (e) { cleanup.errors.push(`WordPress shutdown: ${safe(e)}`); }
  try { tls?.stop(); cleanup.https = true; } catch (e) { cleanup.errors.push(`HTTPS shutdown: ${safe(e)}`); }
  if (store) try {
    const keys = await store.list("");
    for (const key of keys) { await store.delete(key); cleanup.deleted++; }
    cleanup.remaining = (await store.list("")).length; cleanup.remote = cleanup.remaining === 0;
    assert(cleanup.remote, "test root not empty after cleanup");
  } catch (e) { cleanup.errors.push(`test-root cleanup: ${safe(e)}`); }
  else { cleanup.remote = true; cleanup.remaining = 0; }
  passed &&= cleanup.remote && cleanup.wordpress && cleanup.https && cleanup.errors.length === 0;
  const summary = join(workspace, "summary.json");
  await Bun.write(summary, JSON.stringify({ command: "bun run visual:selftest", started: stamp, finished: new Date().toISOString(), root, result: passed ? "pass" : "fail", checks, commands, cleanup }, null, 2) + "\n");
  console.log(`visual:selftest ${passed ? "PASS" : "FAIL"}; cleanup ${cleanup.remote ? "empty" : "FAILED"}; summary ${summary}`);
  process.exitCode = passed ? 0 : prerequisite ? 2 : 1;
}
