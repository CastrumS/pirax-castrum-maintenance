import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PNG } from "pngjs";
import {
  challengeReason,
  combineMasks,
  MaskSelectorError,
  openCaptureSession,
  TIMEOUTS,
  VIEWPORTS,
  type CaptureRequest,
  type CaptureResult,
  type CaptureSession,
} from "../src/capture.ts";
import { comparePng } from "../src/compare.ts";
import { evaluateHealth } from "../src/health.ts";

// Real headless Chromium against local Bun fixtures. Screenshots, health and traces are kept under
// runs/capture-test-<runId>/ as evidence.
const runDir = join(import.meta.dir, "..", "runs", `capture-test-${new Date().toISOString().replaceAll(":", "-")}`);
mkdirSync(runDir, { recursive: true });

const counts = { writes: 0, serviceWorker: 0, tall: 0, socketMutations: 0, socketConnections: 0 };
const html = (body: string, head = "") =>
  `<!doctype html><html><head><meta charset="utf-8">${head}<style>body{margin:0;font:16px sans-serif}</style></head><body>${body}</body></html>`;
const page = (body: string, status = 200, headers: Record<string, string> = {}) =>
  new Response(html(body), { status, headers: { "content-type": "text/html; charset=utf-8", ...headers } });

let closedPort = 0;
let http: ReturnType<typeof Bun.serve>;
let https: ReturnType<typeof Bun.serve>;
let base = "";
let secure = "";
let session: CaptureSession;
let insecureSession: CaptureSession;

const PIXEL = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==", "base64");

function tallPage(): Response {
  // A changing element (as if random) and a page-only mask target; the colour alternates per request.
  const color = counts.tall++ % 2 ? "#c00" : "#00c";
  return page(
    `<div id="random" style="width:300px;height:300px;background:${color}"></div>
     <div class="page-mask" style="width:200px;height:200px;background:${color}"></div>
     <div class="spin" style="width:100px;height:100px;background:#0a0;animation:spin 1s linear infinite"></div>
     <input autofocus value="caret">
     <div style="height:2390px;background:linear-gradient(#fff,#888)"></div>
     <div id="sentinel" style="height:10px"></div>
     <style>@keyframes spin{to{transform:rotate(360deg)}}</style>
     <script>
       new IntersectionObserver((entries, io) => {
         if (!entries[0].isIntersecting) return;
         io.disconnect();
         const extra = document.createElement("div");
         extra.id = "lazy-extra";
         extra.style.cssText = "height:700px;background:#eee";
         document.body.append(extra);
       }).observe(document.getElementById("sentinel"));
     </script>`,
  );
}

function routes(req: Request, origin: () => string): Response | Promise<Response> {
  const url = new URL(req.url);
  if (req.method !== "GET") {
    counts.writes++;
    return new Response("written");
  }
  switch (url.pathname) {
    case "/delayed-unreachable":
      return page(`<p>Initial HTTP 200</p><script>setTimeout(() => location.replace("http://127.0.0.1:${closedPort}/gone"), 100)</script>`);
    case "/delayed-post":
      return page(`<p>Initial HTTP 200</p><form method="post" action="/write"><input name="value" value="x"></form>
        <script>setTimeout(() => document.forms[0].submit(), 100)</script>`);
    case "/plain":
      return page("<h1>Plain page</h1>");
    case "/delayed":
      return page(`<p>Initial HTTP 200</p><script>setTimeout(() => location.replace(${JSON.stringify(url.searchParams.get("to"))}), 100)</script>`);
    case "/redirect":
      return new Response(null, { status: 302, headers: { location: "/missing" } });
    case "/scroll-navigation":
      return page(`<div style="height:2000px">Scroll to navigate</div><script>
        addEventListener("scroll", () => location.replace(${JSON.stringify(url.searchParams.get("to"))}), { once: true });
      </script>`);
    case "/normal":
      return page('<h1>Normal page</h1><iframe src="/forbidden"></iframe><img src="/missing.png">');
    case "/socket-page":
      return page(`<h1>Ordinary GET content</h1><script>
        const ws = new WebSocket("ws://" + location.host + "/socket");
        ws.onopen = () => ws.send("mutate");
      </script>`);
    case "/header-only-challenge":
      return page("<p>Checking your browser</p>", 200, { "cf-mitigated": "challenge" });
    case "/tall":
      return tallPage();
    case "/health":
      return page(
        `<h1>Contact</h1>
         <p>Protected by Cloudflare. This form uses a captcha.</p>
         <div class="g-recaptcha" data-sitekey="x"></div>
         <img src="/missing.png"><img src="/missing.png?v=2">
         <link rel="stylesheet" href="/missing.css">
         <script src="http://127.0.0.1:${closedPort}/unreachable.js"></script>
         <script src="/cdn-cgi/challenge-platform/scripts/jsd/main.js"></script>
         <script>
           console.error("fixture console error");
           setTimeout(() => { throw new Error("fixture uncaught"); }, 0);
           fetch("/write", { method: "POST", body: "x" }).catch(() => {});
           navigator.sendBeacon("/beacon", "x");
           navigator.serviceWorker?.register("/sw.js").catch(() => {});
         </script>`,
      );
    case "/sw.js":
      counts.serviceWorker++;
      return new Response("", { headers: { "content-type": "text/javascript" } });
    case "/cdn-cgi/challenge-platform/scripts/jsd/main.js":
      return new Response("", { headers: { "content-type": "text/javascript" } });
    case "/critical":
      return page(`<p>There has been a critical error on this website.</p><p><a href="https://wordpress.org/">Learn more</a></p>`, 500);
    case "/forbidden":
      return page("<h1>Forbidden</h1>", 403);
    case "/challenge":
      return page(`<noscript>Enable JavaScript and cookies to continue</noscript><script>window._cf_chl_opt={cvId:'3'};</script>`, 200);
    case "/challenge-header":
      return page("<p>Checking your browser</p>", 403, { "cf-mitigated": "challenge" });
    case "/never-idle":
      return page(
        `<div id="feed"></div>
         <script>
           const feed = document.getElementById("feed");
           const more = () => { const d = document.createElement("div"); d.style.height = "900px"; d.textContent = "item"; feed.append(d); };
           more(); more();
           addEventListener("scroll", () => { if (scrollY + innerHeight > document.body.scrollHeight - 500) more(); });
           setInterval(() => fetch("/tick?" + Math.random()), 100);
         </script>`,
      );
    case "/tick":
      return new Promise<Response>((done) => setTimeout(() => done(new Response("tick")), 300));
    case "/mixed":
      return page(
        `<img src="http://127.0.0.1:${http.port}/pixel.png" width="10" height="10">
         <img srcset="http://127.0.0.1:${http.port}/pixel.png?w=2 2x">
         <script src="http://127.0.0.1:${http.port}/mixed.js"></script>
         <a href="http://127.0.0.1:${http.port}/just-a-link">plain link</a>`,
      );
    case "/links-only":
      return page(`<a href="http://127.0.0.1:${http.port}/just-a-link">plain link</a><img src="${origin()}/pixel.png">`);
    case "/pixel.png":
      return new Response(PIXEL, { headers: { "content-type": "image/png" } });
    case "/mixed.js":
      return new Response("", { headers: { "content-type": "text/javascript" } });
    case "/missing":
      return page("<h1>Not found</h1>", 404);
    default:
      return new Response("not found", { status: 404 });
  }
}

beforeAll(async () => {
  const probe = Bun.serve({ port: 0, fetch: () => new Response() });
  closedPort = probe.port!;
  probe.stop(true);

  http = Bun.serve({
    hostname: "127.0.0.1", port: 0,
    fetch: (req, server) => {
      if (new URL(req.url).pathname === "/socket") {
        return server.upgrade(req, { data: undefined }) ? undefined : new Response("upgrade failed", { status: 400 });
      }
      return routes(req, () => base);
    },
    websocket: {
      open() { counts.socketConnections++; },
      message(socket, message) {
        if (String(message) === "mutate") counts.socketMutations++;
        socket.close();
      },
    },
  });
  base = `http://127.0.0.1:${http.port}`;

  const certDir = join(runDir, "tls");
  mkdirSync(certDir, { recursive: true });
  const openssl = Bun.spawnSync(
    ["openssl", "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1", "-subj", "/CN=127.0.0.1", "-addext", "subjectAltName=IP:127.0.0.1",
      "-keyout", join(certDir, "key.pem"), "-out", join(certDir, "cert.pem")],
    { stderr: "pipe" },
  );
  if (openssl.exitCode !== 0) throw new Error(`openssl failed: ${openssl.stderr.toString()}`);
  https = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    tls: { cert: Bun.file(join(certDir, "cert.pem")), key: Bun.file(join(certDir, "key.pem")) },
    fetch: (req) => routes(req, () => secure),
  });
  secure = `https://127.0.0.1:${https.port}`;

  session = await openCaptureSession();
  insecureSession = await openCaptureSession({ ignoreHTTPSErrors: true });
});

afterAll(async () => {
  await session?.close();
  await insecureSession?.close();
  http?.stop(true);
  https?.stop(true);
});

let n = 0;
async function shoot(s: CaptureSession, path: string, over: Partial<CaptureRequest> = {}, origin = base): Promise<CaptureResult> {
  const name = `${n++}-${path.replace(/\W/g, "") || "root"}-${over.viewport ?? "desktop"}`;
  const r = await s.capture({ url: origin + path, viewport: "desktop", masks: [], tracePath: join(runDir, `${name}.trace.zip`), ...over });
  if (r.image) writeFileSync(join(runDir, `${name}.png`), r.image.png);
  writeFileSync(join(runDir, `${name}.result.json`), JSON.stringify({ ...r, image: r.image && { width: r.image.width, height: r.image.height } }, null, 2));
  return r;
}

const pixel = (png: Uint8Array, x: number, y: number) => {
  const img = PNG.sync.read(Buffer.from(png));
  const i = (y * img.width + x) * 4;
  return [...img.data.subarray(i, i + 3)];
};

test("locked viewports and readiness limits", () => {
  expect(VIEWPORTS).toEqual({ desktop: { width: 1440, height: 900 }, mobile: { width: 390, height: 844 } });
  expect(TIMEOUTS).toMatchObject({ navigation: 30_000, networkIdle: 15_000, lazyScroll: 15_000 });
});

describe("capture in real Chromium", () => {
  for (const path of ["/delayed-unreachable", "/delayed-post"]) {
    test(`failed later main-document navigation from ${path} cannot reuse HTTP 200`, async () => {
      const before = counts.writes;
      const r = await shoot(session, path);
      const normal = await shoot(session, "/plain");
      const observed = { writes: counts.writes - before };
      writeFileSync(join(runDir, `${path.slice(1)}-counts.json`), JSON.stringify(observed, null, 2));
      console.log("Failed navigation fixture:", JSON.stringify({ path, state: r.state, health: r.health, hasImage: !!r.image, ...observed }), "artifacts:", runDir);
      expect(observed.writes).toBe(0);
      if (path === "/delayed-post") expect(r.warnings).toContain(`read-only policy blocked POST ${base}/write`);
      expect(statSync(r.tracePath!).size).toBeGreaterThan(1000);
      expect(normal.state).toBe("captured");
      expect(normal.image).not.toBeNull();
      expect(normal.health).toMatchObject({ status: 200, finalUrl: base + "/plain" });
      expect(evaluateHealth(normal.health, null)).toEqual([]);
      expect({ state: r.state, status: r.health.status, hasImage: !!r.image }).toEqual({ state: "blocked", status: null, hasImage: false });
      expect(r.detail).toContain("navigation failed");
      for (const baseline of [null, r.health]) {
        expect(evaluateHealth(r.health, baseline)).toContainEqual({
          kind: "status", severity: "failure", detail: `no HTTP response for ${r.health.finalUrl}`,
        });
      }
    }, 60_000);
  }

  for (const [destination, status, criticalError, detail] of [
    ["/missing", 404, false, null],
    ["/critical", 500, true, null],
    ["/forbidden", 403, false, "HTTP 403 Forbidden"],
    ["/challenge", 200, false, "Cloudflare challenge page"],
    ["/header-only-challenge", 200, false, "Cloudflare challenge (cf-mitigated: challenge)"],
  ] as const) {
    test(`delayed main-document navigation to ${destination} uses final health and classification`, async () => {
      const r = await shoot(session, `/delayed?to=${destination}`);
      expect({ state: r.state, detail: r.detail, health: r.health }).toMatchObject({
        state: detail ? "blocked" : "captured", detail,
        health: { status, finalUrl: base + destination, criticalError },
      });
      if (detail) expect(r.image).toBeNull();
      else {
        expect(r.image).not.toBeNull();
        expect(evaluateHealth(r.health, r.health)).toContainEqual({
          kind: "status", severity: "failure", detail: `HTTP ${status} for ${base}${destination}`,
        });
      }
      expect(statSync(r.tracePath!).size).toBeGreaterThan(1000);
      // An iframe's 403 and an asset's 404 must not replace the main document's 200.
      const normal = await shoot(session, "/normal");
      expect(normal).toMatchObject({ state: "captured", health: { status: 200, finalUrl: base + "/normal", criticalError: false } });
      expect(normal.health.failedRequests).toContainEqual({ url: base + "/forbidden", status: 403 });
      expect(normal.image).not.toBeNull();
    }, 60_000);
  }

  test("direct HTTP redirect retains the final document status", async () => {
    expect(await shoot(session, "/redirect")).toMatchObject({ state: "captured", health: { status: 404, finalUrl: base + "/missing" } });
  }, 60_000);

  test("navigation triggered by readiness scrolling reconciles the final document", async () => {
    for (const [destination, status, state] of [["/missing", 404, "captured"], ["/header-only-challenge", 200, "blocked"]] as const) {
      const r = await shoot(session, `/scroll-navigation?to=${destination}`);
      expect({ state: r.state, detail: r.detail, health: r.health }).toMatchObject({
        state, health: { status, finalUrl: base + destination, criticalError: false },
      });
      if (state === "blocked") {
        expect(r.image).toBeNull();
        expect(r.detail).toBe("Cloudflare challenge (cf-mitigated: challenge)");
      } else expect(r.image).not.toBeNull();
    }
  }, 60_000);

  test("read-only policy blocks real WebSocket mutations while GET content captures", async () => {
    const before = { ...counts };
    const r = await shoot(session, "/socket-page");
    const observed = { mutations: counts.socketMutations - before.socketMutations, connections: counts.socketConnections - before.socketConnections };
    writeFileSync(join(runDir, "websocket-counts.json"), JSON.stringify(observed, null, 2));
    console.log("WebSocket fixture:", JSON.stringify(observed), "artifacts:", runDir);
    expect(observed.mutations).toBe(0);
    expect(observed.connections).toBe(0);
    expect(r.state).toBe("captured");
    expect(r.image).not.toBeNull();
    expect(r.warnings).toContain(`read-only policy blocked WebSocket ws://127.0.0.1:${http.port}/socket`);
    expect(evaluateHealth(r.health, null)).toEqual([]);
  }, 60_000);

  test("full-page PNG at both viewports includes lazy content; trace saved", async () => {
    for (const viewport of ["desktop", "mobile"] as const) {
      const r = await shoot(session, "/tall", { viewport });
      expect(r.state).toBe("captured");
      // 300 + 200 + 100 + input + 2390 + 10 sentinel, plus the 700 px appended only after scrolling to the bottom.
      expect(r.image?.width).toBe(VIEWPORTS[viewport].width);
      expect(r.image!.height).toBeGreaterThan(3700);
      expect(r.image!.height).toBeLessThan(3800);
      expect(r.health).toEqual({ status: 200, finalUrl: `${base}/tall`, criticalError: false, consoleErrors: [], failedRequests: [], mixedContent: [] });
      expect(r.warnings).toEqual([]);
      const trace = readFileSync(r.tracePath!);
      expect(trace.subarray(0, 2).toString()).toBe("PK");
      expect(statSync(r.tracePath!).size).toBeGreaterThan(1000);
    }
  }, 60_000);

  test("site and page masks combine; masked captures are stable, unmasked ones change", async () => {
    const site = { slug: "t", url: base, form_helper: false, mask: ["#random"], max_diff_pixel_ratio: 0.01, pages: [] };
    const masks = combineMasks(site, { path: "/tall", mask: [".page-mask", "#random"] });
    expect(masks).toEqual(["#random", ".page-mask"]);

    const a = await shoot(session, "/tall", { masks });
    const b = await shoot(session, "/tall", { masks });
    expect(pixel(a.image!.png, 150, 150)).toEqual([255, 0, 255]); // site mask
    expect(pixel(a.image!.png, 100, 400)).toEqual([255, 0, 255]); // page mask
    expect(comparePng(a.image!.png, b.image!.png, 0.01)).toMatchObject({ state: "same", diffPixels: 0 });

    const c = await shoot(session, "/tall");
    const d = await shoot(session, "/tall");
    expect(comparePng(c.image!.png, d.image!.png, 0.01)).toMatchObject({ state: "changed" });
  }, 60_000);

  test("unmatched valid mask warns; invalid or non-CSS selectors are configuration errors", async () => {
    const r = await shoot(session, "/tall", { masks: ["#random", ".nope"] });
    expect(r.state).toBe("captured");
    expect(r.warnings).toEqual(['mask ".nope" matched nothing']);

    for (const bad of ["div[", "text=Hello", "div >> span", "xpath=//div"]) {
      const e1 = await shoot(session, "/tall", { masks: ["#random", bad] }).catch((e) => e);
      const e2 = await session.validateMasks([bad]).catch((e) => e);
      expect(e1).toBeInstanceOf(MaskSelectorError);
      expect(e2).toBeInstanceOf(MaskSelectorError);
      expect(e2.message).toContain(bad);
    }
    await session.validateMasks(["#random", ".a > .b:not(.c)", "[data-x='1']"]);
  }, 60_000);

  test("health: console/pageerror, 404 assets, transport failure; policy aborts are warnings; CAPTCHA text is not blocked", async () => {
    const before = { ...counts };
    const r = await shoot(session, "/health");
    expect(r.state).toBe("captured");
    expect(r.health.status).toBe(200);
    expect(r.health.consoleErrors).toEqual(["Uncaught Error: fixture uncaught", "fixture console error"]);
    expect(r.health.failedRequests).toEqual([
      { url: `${base}/missing.css`, status: 404 },
      { url: `${base}/missing.png`, status: 404 },
      { url: `${base}/missing.png?v=2`, status: 404 },
      { url: `http://127.0.0.1:${closedPort}/unreachable.js`, status: null },
    ].sort((a, b) => a.url < b.url ? -1 : a.url > b.url ? 1 : 0));
    expect(r.health.mixedContent).toEqual([]);
    // Non-GET requests never reached the server and are labelled as policy, not asset failures.
    expect(counts.writes).toBe(before.writes);
    expect(counts.serviceWorker).toBe(before.serviceWorker);
    expect(r.warnings).toContain(`read-only policy blocked POST ${base}/write`);
    expect(r.warnings).toContain(`read-only policy blocked POST ${base}/beacon`);
    expect(evaluateHealth(r.health, null).every((f) => f.severity === "failure")).toBe(true);
    expect(evaluateHealth(r.health, r.health).map((f) => f.severity)).toEqual(Array(6).fill("warning"));
  }, 60_000);

  test("404 page and critical error are captured health failures, not blocked", async () => {
    const missing = await shoot(session, "/missing");
    expect(missing).toMatchObject({ state: "captured", health: { status: 404, criticalError: false } });
    const critical = await shoot(session, "/critical", { viewport: "mobile" });
    expect(critical).toMatchObject({ state: "captured", health: { status: 500, criticalError: true } });
    expect(evaluateHealth(critical.health, critical.health).map((f) => f.kind)).toEqual(["status", "critical-error"]);
  }, 60_000);

  test("unreachable, 403 and challenge pages are blocked with reasons and a trace", async () => {
    const down = await shoot(session, "/", {}, `http://127.0.0.1:${closedPort}`);
    expect(down).toMatchObject({ state: "blocked", image: null, health: { status: null } });
    expect(down.detail).toContain("ERR_CONNECTION_REFUSED");
    expect(statSync(down.tracePath!).size).toBeGreaterThan(0);

    expect(await shoot(session, "/forbidden")).toMatchObject({ state: "blocked", detail: "HTTP 403 Forbidden", health: { status: 403 } });
    expect(await shoot(session, "/challenge")).toMatchObject({ state: "blocked", detail: "Cloudflare challenge page", health: { status: 200 } });
    expect(await shoot(session, "/challenge-header")).toMatchObject({ state: "blocked", health: { status: 403 } });
  }, 60_000);

  test("never-idle, infinitely scrolling page finishes within its limits with readiness warnings", async () => {
    const quick = await openCaptureSession({ timeouts: { networkIdle: 1000, lazyScroll: 2000, settle: 1000 } });
    try {
      const started = Date.now();
      const r = await shoot(quick, "/never-idle");
      expect(Date.now() - started).toBeLessThan(15_000);
      expect(r.state).toBe("captured");
      expect(r.warnings).toContain("network not idle after 1000 ms; captured anyway");
      expect(r.warnings).toContain("lazy-load scrolling stopped at the 2000 ms limit");
    } finally {
      await quick.close();
    }
  }, 60_000);
});

describe("TLS and mixed content on a real HTTPS fixture", () => {
  test("self-signed certificate is blocked unless the internal test option is set", async () => {
    const r = await shoot(session, "/mixed", {}, secure);
    expect(r.state).toBe("blocked");
    expect(r.detail).toContain("ERR_CERT");
  }, 60_000);

  test("HTTP resources on an HTTPS page are mixed content; plain HTTP links are not", async () => {
    const mixed = await shoot(insecureSession, "/mixed", {}, secure);
    expect(mixed.state).toBe("captured");
    expect(mixed.health.finalUrl).toBe(`${secure}/mixed`);
    expect(mixed.health.mixedContent).toEqual([
      `${base}/mixed.js`,
      `${base}/pixel.png`,
      `${base}/pixel.png?w=2`,
    ]);
    expect(evaluateHealth(mixed.health, mixed.health).filter((f) => f.kind === "mixed-content" && f.severity === "failure")).toHaveLength(3);

    const links = await shoot(insecureSession, "/links-only", {}, secure);
    expect(links.state).toBe("captured");
    expect(links.health.mixedContent).toEqual([]);
    expect(evaluateHealth(links.health, null)).toEqual([]);
  }, 60_000);
});

test("challengeReason needs explicit markers", () => {
  expect(challengeReason({ "cf-mitigated": "challenge" }, "")).toContain("Cloudflare");
  expect(challengeReason({}, "<title>Attention Required! | Cloudflare</title>")).toBe("Cloudflare block page");
  expect(challengeReason({}, "<title>Sucuri WebSite Firewall - Access Denied</title>")).toBe("Sucuri firewall page");
  expect(challengeReason({ server: "cloudflare" }, "<title>Home</title><p>Cloudflare captcha</p><div class=g-recaptcha></div>")).toBeNull();
  expect(challengeReason({}, '<script src="/cdn-cgi/challenge-platform/scripts/jsd/main.js"></script>')).toBeNull();
});
