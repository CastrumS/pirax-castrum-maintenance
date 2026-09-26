import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { chromium, type Browser, type Page, type Request, type Response } from "playwright";
import { CRITICAL_ERROR_PHRASE, normalizeHealth, type HealthSnapshot } from "./health.ts";
import type { Page as SitePage, Site } from "./sites.ts";

export const VIEWPORTS = {
  desktop: { width: 1440, height: 900 },
  mobile: { width: 390, height: 844 },
} as const;
export type ViewportName = keyof typeof VIEWPORTS;

/** Milliseconds. navigation covers load; the others each have their own cap after it. */
export const TIMEOUTS = { navigation: 30_000, networkIdle: 15_000, lazyScroll: 15_000, settle: 5_000, screenshot: 30_000 };
export type Timeouts = typeof TIMEOUTS;

export type CaptureState = "captured" | "blocked" | "error";

export type CaptureRequest = {
  url: string;
  viewport: ViewportName;
  /** CSS selectors; see `combineMasks`. */
  masks: string[];
  /** Where the Playwright trace zip is written, whatever the outcome. */
  tracePath: string;
};

export type CaptureResult = {
  state: CaptureState;
  /** Why the capture is blocked or failed; null when captured. */
  detail: string | null;
  health: HealthSnapshot;
  /** Full-page PNG, only for `captured`. Dimensions come from the PNG itself. */
  image: { png: Uint8Array; width: number; height: number } | null;
  /** Readiness limits, unmatched masks and read-only policy aborts. */
  warnings: string[];
  /** Null only if saving the trace failed (a warning says so). */
  tracePath: string | null;
};

export type SessionOptions = {
  timeouts?: Partial<Timeouts>;
  /** Test fixtures with self-signed certificates only; never set for real sites. */
  ignoreHTTPSErrors?: boolean;
};

export type CaptureSession = {
  /** Throws `MaskSelectorError` for the first selector that is not valid CSS. */
  validateMasks(selectors: string[]): Promise<void>;
  /** One page at one viewport in a fresh context. Throws only `MaskSelectorError`. */
  capture(request: CaptureRequest): Promise<CaptureResult>;
  close(): Promise<void>;
};

/** A mask that is not valid CSS: a configuration error. */
export class MaskSelectorError extends Error {
  constructor(readonly selector: string) {
    super(`mask ${JSON.stringify(selector)} is not a valid CSS selector`);
    this.name = "MaskSelectorError";
  }
}

export const MASK_COLOR = "#FF00FF";
const FREEZE_CSS = `*, *::before, *::after {
  animation: none !important; transition: none !important; caret-color: transparent !important; scroll-behavior: auto !important;
}`;

/** Site masks then page masks, without duplicates. */
export const combineMasks = (site: Site, page: SitePage): string[] => [...new Set([...site.mask, ...page.mask])];

/**
 * Names a positively identified bot challenge or firewall interstitial, else null. Only explicit
 * markers count: pages merely mentioning Cloudflare or showing a form CAPTCHA are not challenges.
 */
export function challengeReason(headers: Record<string, string>, html: string): string | null {
  if (headers["cf-mitigated"]?.toLowerCase() === "challenge") return "Cloudflare challenge (cf-mitigated: challenge)";
  if (html.includes("_cf_chl_opt")) return "Cloudflare challenge page";
  const title = (/<title[^>]*>([^<]*)<\/title>/i.exec(html)?.[1] ?? "").trim().toLowerCase();
  if (title.startsWith("attention required!") && title.includes("cloudflare")) return "Cloudflare block page";
  if (title.includes("sucuri website firewall")) return "Sucuri firewall page";
  return null;
}

/** Launches headless Chromium. Callers must `close()` the session. */
export async function openCaptureSession(options: SessionOptions = {}): Promise<CaptureSession> {
  const browser = await chromium.launch({ headless: true });
  const timeouts = { ...TIMEOUTS, ...options.timeouts };
  const ignoreHTTPSErrors = options.ignoreHTTPSErrors ?? false;
  return {
    async validateMasks(selectors) {
      const context = await browser.newContext();
      try {
        await assertCss(await context.newPage(), selectors);
      } finally {
        await context.close();
      }
    },
    capture: (request) => capture(browser, timeouts, ignoreHTTPSErrors, request),
    close: () => browser.close(),
  };
}

async function assertCss(page: Page, selectors: string[]): Promise<void> {
  const bad = await page.evaluate((list) => {
    const probe = document.createDocumentFragment();
    return list.find((s) => {
      try {
        probe.querySelector(s);
        return false;
      } catch {
        return true;
      }
    });
  }, selectors);
  if (bad !== undefined) throw new MaskSelectorError(bad);
}

const firstLine = (e: unknown) => String(e instanceof Error ? e.message : e).split("\n")[0]!.replace(/^\w+\.\w+: /, "");

async function capture(browser: Browser, t: Timeouts, ignoreHTTPSErrors: boolean, req: CaptureRequest): Promise<CaptureResult> {
  const context = await browser.newContext({
    viewport: VIEWPORTS[req.viewport],
    deviceScaleFactor: 1,
    locale: "en-US",
    timezoneId: "UTC",
    colorScheme: "light",
    reducedMotion: "reduce",
    serviceWorkers: "block",
    ignoreHTTPSErrors,
  });
  const warnings = new Set<string>();
  const consoleErrors: string[] = [];
  const failedRequests: HealthSnapshot["failedRequests"] = [];
  const insecure = new Set<string>();
  let status: number | null = null;
  let finalUrl = req.url;
  let criticalError = false;
  let mainResponse: Response | null = null;
  let mainRequest: Request | null = null;
  let navigationVersion = 0;
  let navigating = false;
  let result: Omit<CaptureResult, "health" | "warnings" | "tracePath">;

  let page: Page;
  let traceSaved = false;
  try {
    await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
    await context.routeWebSocket("**/*", (socket) => {
      warnings.add(`read-only policy blocked WebSocket ${socket.url()}`);
      // Never connectToServer: even the handshake must stay inside this context.
      return socket.close({ code: 1008, reason: "read-only policy" });
    });
    page = await context.newPage();
    result = await run();
  } catch (e) {
    if (e instanceof MaskSelectorError) throw e;
    result = { state: "error", detail: `capture failed: ${firstLine(e)}`, image: null };
  } finally {
    try {
      mkdirSync(dirname(req.tracePath), { recursive: true });
      await context.tracing.stop({ path: req.tracePath });
      traceSaved = true;
    } catch (e) {
      warnings.add(`trace not saved: ${firstLine(e)}`);
    }
    await context.close().catch(() => {});
  }

  const health = normalizeHealth({
    status,
    finalUrl,
    criticalError,
    consoleErrors,
    failedRequests,
    mixedContent: finalUrl.startsWith("https:") ? [...insecure] : [],
  });
  return { ...result, health, warnings: [...warnings], tracePath: traceSaved ? req.tracePath : null };

  async function run(): Promise<typeof result> {
    // Read-only browsing: only GET leaves the browser.
    await context.route("**/*", (route) => {
      const r = route.request();
      if (r.method() === "GET") return route.continue();
      warnings.add(`read-only policy blocked ${r.method()} ${r.url()}`);
      return route.abort("blockedbyclient");
    });
    const isMainDocument = (r: Request) => r.isNavigationRequest() && r.frame() === page.mainFrame();
    page.on("console", (msg) => {
      const text = msg.text();
      const mixed = /^Mixed Content: .*? requested an insecure [^']*'([^']+)'/s.exec(text);
      if (mixed) insecure.add(mixed[1]!);
      // Resource load errors are recorded precisely (URL and status) from network events instead.
      else if (msg.type() === "error" && !text.startsWith("Failed to load resource:")) consoleErrors.push(text);
    });
    page.on("pageerror", (e) => consoleErrors.push(`Uncaught ${e.name}: ${e.message}`));
    page.on("request", (r) => {
      if (isMainDocument(r)) {
        mainRequest = r;
        mainResponse = null;
        navigating = true;
        navigationVersion++;
      }
      if (r.url().startsWith("http:") && !isMainDocument(r)) insecure.add(r.url());
    });
    page.on("framenavigated", (frame) => {
      if (frame === page.mainFrame()) {
        navigating = false;
        navigationVersion++;
      }
    });
    page.on("response", (r) => {
      if (isMainDocument(r.request())) {
        if (r.request() === mainRequest) mainResponse = r;
      } else if (r.status() >= 400) failedRequests.push({ url: r.url(), status: r.status() });
    });
    page.on("requestfailed", (r) => {
      // Policy aborts are warnings; ERR_ABORTED is the browser cancelling its own request (media ranges, superseded loads).
      if (r.method() !== "GET" || isMainDocument(r) || r.failure()?.errorText === "net::ERR_ABORTED") return;
      failedRequests.push({ url: r.url(), status: null });
    });

    await assertCss(page, req.masks);

    try {
      await page.goto(req.url, { waitUntil: "load", timeout: t.navigation });
    } catch (e) {
      status = mainResponse?.status() ?? null;
      finalUrl = page.url() === "about:blank" ? req.url : page.url();
      return { state: "blocked", detail: `navigation failed: ${firstLine(e)}`, image: null };
    }

    await page.waitForLoadState("networkidle", { timeout: t.networkIdle }).catch(() => {
      warnings.add(`network not idle after ${t.networkIdle} ms; captured anyway`);
    });
    if (!(await scrollThrough(page, t.lazyScroll))) warnings.add(`lazy-load scrolling stopped at the ${t.lazyScroll} ms limit`);
    if (!(await settle(page, t.settle))) warnings.add(`fonts/images still loading after ${t.settle} ms; captured anyway`);
    for (const url of await insecureReferences(page)) insecure.add(url);

    const mask = req.masks.map((s) => page.locator(`css=${s}`));
    for (const [i, locator] of mask.entries()) {
      if ((await locator.count()) === 0) warnings.add(`mask ${JSON.stringify(req.masks[i])} matched nothing`);
    }
    // Read headers from this exact response, not an async listener that can finish out of order.
    const response = mainResponse?.request() === mainRequest ? mainResponse : null;
    const version = navigationVersion;
    const [observation, headers] = await Promise.all([
      page.evaluate((phrase) => ({
        url: location.href,
        html: document.documentElement.outerHTML,
        critical: (document.body?.innerText ?? "").toLowerCase().includes(phrase),
      }), CRITICAL_ERROR_PHRASE.toLowerCase()),
      response?.allHeaders() ?? {},
    ]);
    const browserError = observation.url.startsWith("chrome-error:");
    status = browserError ? null : response?.status() ?? null;
    finalUrl = observation.url;
    criticalError = observation.critical;
    if (!response || browserError) {
      return { state: "blocked", detail: `navigation failed: ${mainRequest?.failure()?.errorText ?? "no HTTP response for the current document"}`, image: null };
    }
    const changed = () => navigating || navigationVersion !== version || mainResponse !== response;
    const unstable = { state: "blocked", detail: "main document changed during capture; retry the page", image: null } as const;
    if (changed()) return unstable;
    const challenge = status === 403 ? "HTTP 403 Forbidden" : challengeReason(headers, observation.html);
    if (challenge) return { state: "blocked", detail: challenge, image: null };
    const png = new Uint8Array(
      await page.screenshot({
        type: "png",
        fullPage: true,
        animations: "disabled",
        caret: "hide",
        style: FREEZE_CSS,
        mask,
        maskColor: MASK_COLOR,
        timeout: t.screenshot,
      }),
    );
    // A screenshot can wait for rendering while navigation replaces the document. Never pair
    // those pixels with the earlier health, nor let trace shutdown change the captured URL.
    if (changed()) return unstable;
    // PNG IHDR: width and height are big-endian uint32 at bytes 16 and 20.
    const ihdr = new DataView(png.buffer, png.byteOffset, png.byteLength);
    return { state: "captured", detail: null, image: { png, width: ihdr.getUint32(16), height: ihdr.getUint32(20) } };
  }
}

/** Scrolls down a viewport at a time until the bottom stops moving, then back to the top. False if the limit hit first. */
async function scrollThrough(page: Page, limit: number): Promise<boolean> {
  const deadline = Date.now() + limit;
  let bottom = false;
  while (!bottom && Date.now() < deadline) {
    const before = await page.evaluate(() => {
      window.scrollBy({ top: window.innerHeight, behavior: "instant" });
      return window.scrollY;
    });
    await page.waitForTimeout(Math.max(0, Math.min(150, deadline - Date.now())));
    bottom = await page.evaluate((y) => {
      const height = (document.scrollingElement ?? document.documentElement).scrollHeight;
      return window.scrollY + window.innerHeight >= height - 1 && window.scrollY === y;
    }, before);
  }
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  return bottom;
}

/** Waits for web fonts and pending images, up to `limit`. False if they had not settled. */
function settle(page: Page, limit: number): Promise<boolean> {
  return page.evaluate(
    (ms) =>
      Promise.race([
        Promise.all([
          document.fonts.ready,
          ...[...document.images]
            .filter((img) => !img.complete)
            .map((img) => new Promise((done) => ["load", "error"].forEach((ev) => img.addEventListener(ev, done, { once: true })))),
        ]).then(() => true),
        new Promise<boolean>((done) => setTimeout(() => done(false), ms)),
      ]),
    limit,
  );
}

/**
 * Absolute http: URLs in resource attributes, including ones Chromium blocks or upgrades before any
 * request is observable. Plain links are not resources. CSS url() and script-built URLs are not scanned.
 */
function insecureReferences(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const rels = ["stylesheet", "icon", "apple-touch-icon", "preload", "modulepreload", "prefetch", "manifest"];
    const sources: [string, string][] = [
      ["img, script, iframe, frame, embed, source, video, audio, track, input[type=image i]", "src"],
      ["img, source", "srcset"],
      [rels.map((r) => `link[rel~="${r}" i]`).join(", "), "href"],
      ["object", "data"],
      ["video", "poster"],
    ];
    const urls: string[] = [];
    for (const [selector, attr] of sources) {
      for (const el of document.querySelectorAll(selector)) {
        const value = el.getAttribute(attr);
        if (!value) continue;
        const refs = attr === "srcset" ? value.split(",").map((c) => c.trim().split(/\s+/)[0] ?? "") : [value];
        for (const ref of refs) {
          try {
            const url = new URL(ref, document.baseURI);
            if (url.protocol === "http:") urls.push(url.href);
          } catch {}
        }
      }
    }
    return urls;
  });
}
