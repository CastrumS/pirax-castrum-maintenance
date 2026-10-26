// The checker side of the helper's version answer (plugin/pirax-form-test/includes/settings.php). The header name and
// action are a kept second copy of the PHP ones; test/plugin/version.test.ts is the agreement test. The token travels
// only in the request header: no URL holds it, and the probe context is never traced.
import { chromium, type Browser } from "playwright";
import { STABLE_VERSION } from "./deployment.ts";
import { readEnv } from "./env.ts";
import { tokenPattern } from "./forms/config.ts";
import type { HelperAnswer } from "./report/model.ts";
import type { Site } from "./sites.ts";

export const HELPER_TOKEN_HEADER = "X-Pirax-Helper-Token";
export const VERSION_ACTION = "pirax_form_test_version";
export const versionUrl = (siteUrl: string): string => `${siteUrl}/wp-admin/admin-ajax.php?action=${VERSION_ACTION}`;

const TIMEOUT_MS = 15_000;
// Fulfilled locally, so the probe page has the site's origin and the site sees only the version request.
const PROBE_PATH = "/.helper-version-probe";

/** FORM_TEST_TOKEN, the token configured on every helper site; EnvError or EnvFormatError name it, never its value. */
export function readHelperToken(env: Record<string, string | undefined> = process.env): string {
  return readEnv(env, { FORM_TEST_TOKEN: (value) => tokenPattern.test(value) }).FORM_TEST_TOKEN;
}

type Probe = { kind: "timeout" | "network" | "redirect" } | { kind: "response"; status: number; body: string };
const DETAILS = { timeout: `no answer within ${TIMEOUT_MS / 1000} s`, network: "no answer", redirect: "redirected; not followed" } as const;

/** The version of a body that is exactly one `version` key holding a stable version, else null. */
function versionOf(body: string): string | null {
  let value: unknown;
  try {
    value = JSON.parse(body);
  } catch (error) {
    if (error instanceof SyntaxError) return null;
    throw error;
  }
  return typeof value === "object" && value !== null && !Array.isArray(value) && Object.keys(value).length === 1 && "version" in value && typeof value.version === "string" && STABLE_VERSION.test(value.version) ? value.version : null;
}

function classify(probe: Probe): HelperAnswer {
  if (probe.kind !== "response") return { state: "unknown", detail: DETAILS[probe.kind] };
  if (probe.status !== 200) return { state: "unknown", detail: `HTTP ${probe.status}` };
  const version = versionOf(probe.body);
  return version === null ? { state: "unknown", detail: "answer holds no version" } : { state: "version", version };
}

/** One same-origin request from a fresh context: redirects are not followed, and no cookie or referrer is sent. */
async function ask(browser: Browser, site: Site, token: string, ignoreHTTPSErrors: boolean): Promise<HelperAnswer> {
  const context = await browser.newContext({ serviceWorkers: "block", ignoreHTTPSErrors });
  try {
    const origin = new URL(site.url).origin;
    await context.route(origin + PROBE_PATH, (route) => route.fulfill({ status: 200, contentType: "text/html", body: "" }));
    const page = await context.newPage();
    await page.goto(origin + PROBE_PATH);
    const probe = await page.evaluate(async ({ url, header, token, timeoutMs }): Promise<Probe> => {
      try {
        const response = await fetch(url, { headers: { [header]: token }, redirect: "manual", credentials: "omit", cache: "no-store", referrerPolicy: "no-referrer", signal: AbortSignal.timeout(timeoutMs) });
        return response.type === "opaqueredirect" ? { kind: "redirect" } : { kind: "response", status: response.status, body: await response.text() };
      } catch (error) {
        return { kind: error instanceof DOMException && error.name === "TimeoutError" ? "timeout" : "network" };
      }
    }, { url: versionUrl(site.url), header: HELPER_TOKEN_HEADER, token, timeoutMs: TIMEOUT_MS });
    return classify(probe);
  } finally {
    await context.close();
  }
}

/** One answer per site, in input order; a `helper: false` site gets { state: "no-helper" } and no request. A site's failure is its `unknown` answer, never a throw. */
export async function askHelpers(sites: Site[], token: string, options: { ignoreHTTPSErrors: boolean }): Promise<HelperAnswer[]> {
  // Launched only when some site is asked; a failed launch is every asked site's answer.
  const browser = sites.some((site) => site.helper !== false) ? await chromium.launch({ headless: true }).catch(() => null) : null;
  try {
    const answers: HelperAnswer[] = [];
    for (const site of sites) {
      answers.push(
        site.helper === false ? { state: "no-helper" }
        : browser === null ? { state: "unknown", detail: "browser unavailable" }
        : await ask(browser, site, token, options.ignoreHTTPSErrors).catch((): HelperAnswer => ({ state: "unknown", detail: "browser operation failed" })),
      );
    }
    return answers;
  } finally {
    await browser?.close();
  }
}
