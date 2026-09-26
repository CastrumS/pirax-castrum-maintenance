import { createHash } from "node:crypto";
import { join } from "node:path";
import { chromium, type Browser, type Page } from "playwright";
import { challengeReason } from "../capture.ts";
import { EnvError, EnvFormatError } from "../env.ts";
import { readImapConfig } from "../mail/config.ts";
import { pollDelivery } from "../mail/imap.ts";
import type { AnyRunReport, FormResult } from "../report/model.ts";
import type { Site, Page as SitePage } from "../sites.ts";
import { readFormConfig } from "./config.ts";
import { detectForms, formLocator, sameForm, type FormDescriptor } from "./detect.ts";
import { retainTrace, secretRedactor } from "./evidence.ts";
import { fillForm, inspectForm, newSubmissionId } from "./fill.ts";
import { installFormPolicy, submitForm, type FormPolicy } from "./submit.ts";

export type FormsOptions = { runDir: string; navigationTimeoutMs?: number; submissionTimeoutMs?: number; deliveryTimeoutMs?: number };
const isConfig = (e: unknown) => e instanceof EnvError || e instanceof EnvFormatError;
const scanFailure = (detail: string): FormResult => ({ selector: 'page-scan', plugin: 'unknown', outcome: 'failed', detail });
const identity = (s: Site, p: SitePage) => createHash('sha256').update(s.slug + '\n' + s.url + p.path).digest('hex').slice(0, 20);

/** One desktop discovery, then a fresh isolated context for each descriptor. Never a visual capture. */
export async function scanPageForms(site: Site, listedPage: SitePage, options: FormsOptions, existingBrowser?: Browser): Promise<FormResult[]> {
  let browser = existingBrowser;
  let results: FormResult[] = [];
  const redact = secretRedactor();
  const prefix = join(options.runDir, 'traces', 'forms', identity(site, listedPage));
  async function visit<T>(label: string, work: (page: Page, policy: FormPolicy) => Promise<T>): Promise<T> {
    const context = await browser!.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, locale: 'en-US', timezoneId: 'UTC', colorScheme: 'light', reducedMotion: 'reduce', serviceWorkers: 'block', ignoreHTTPSErrors: false });
    let tracing = false;
    try {
      const policy = await installFormPolicy(context);
      await context.tracing.start({ screenshots: false, snapshots: false, sources: false }); tracing = true;
      const page = await context.newPage();
      page.setDefaultTimeout(5_000);
      const response = await page.goto(site.url + listedPage.path, { waitUntil: 'load', timeout: options.navigationTimeoutMs ?? 30_000 });
      if (!response || response.status() >= 400 || new URL(page.url()).origin !== new URL(site.url).origin) throw new Error('Page navigation failed.');
      // A bounded post-load window for ordinary plugin initialization. No submit authorization exists.
      await page.waitForTimeout(200);
      if (!/^https?:/.test(page.url()) || new URL(page.url()).origin !== new URL(site.url).origin) throw new Error('Page changed during discovery.');
      if (challengeReason(await response.allHeaders(), await page.content())) throw new Error('Page challenge/interstitial; forms were not verified.');
      return await work(page, policy);
    } finally {
      try { if (tracing) await retainTrace(context, `${prefix}-${label}.trace.zip`, redact); }
      finally { await context.close(); }
    }
  }
  try {
    browser ??= await chromium.launch({ headless: true });
    let descriptors: FormDescriptor[];
    try { descriptors = await visit('scan', page => detectForms(page)); }
    catch { return [scanFailure('Page navigation/discovery or trace sanitation failed; forms were not verified.')]; }
    for (const [index, descriptor] of descriptors.entries()) {
      const result = (outcome: FormResult['outcome'], detail: string): FormResult => ({ selector: redact(descriptor.selector), plugin: descriptor.plugin, outcome, detail: redact(detail).slice(0, 3000) });
      if (descriptor.plugin === 'unknown' || !descriptor.pluginId) { results.push(result('unsupported', 'Unknown or ambiguous form plugin identity; not filled or submitted.')); continue; }
      try {
        results.push(await visit(`form-${index + 1}`, async (page, policy) => {
          if (!await sameForm(page, descriptor)) return result('failed', 'Form identity changed since discovery; not submitted.');
          policy.freeze(); // Before even the first input/change event: all GET/POST serialization blocked.
          const preflight = await inspectForm(formLocator(page, descriptor));
          if (preflight.state !== 'ready') return result(preflight.state, preflight.detail);
          const config = readFormConfig();
          const id = newSubmissionId();
          let prepared;
          try { prepared = await fillForm(page, descriptor, config, id); }
          catch { return result(site.form_helper ? 'failed' : 'not-verified', 'Browser filling failed; no submission or delivery verification.'); }
          if (prepared.state !== 'prepared') return result(prepared.state, prepared.detail);
          if (!site.form_helper) return result('not-verified', `Helper not enabled; filled without submission. ${prepared.validation} Delivery not verified.`);
          // Preparation is still fully write-blocked. Require mailbox config only for an eligible
          // opted-in submission, never a no-helper or newly discovered unsupported constraint.
          const imap = readImapConfig();
          const submitted = await submitForm(page, prepared, policy, { timeoutMs: options.submissionTimeoutMs, redact });
          if (submitted.state !== 'confirmed') return result(submitted.state, submitted.detail);
          const delivery = await pollDelivery({ id: submitted.id, config: imap, timeoutMs: options.deliveryTimeoutMs });
          return result(delivery.outcome, `${submitted.detail} Submission ${submitted.id}. ${delivery.detail}`);
        }));
      } catch (error) {
        if (isConfig(error)) throw error;
        results.push(result('failed', 'Browser/form operation or trace sanitation failed; unsafe evidence deleted.'));
      }
    }
  } catch (error) {
    if (isConfig(error)) throw error;
    results.push(scanFailure('Forms browser operation failed.'));
  } finally {
    if (!existingBrowser && browser) try { await browser.close(); } catch { results.push(scanFailure('Forms browser close failed.')); }
  }
  return results;
}

/** Attaches one forms array per listed page to either strict report mode. */
export async function populateForms(sites: Site[], report: AnyRunReport, options: FormsOptions): Promise<void> {
  if (!sites.length) return;
  let browser: Browser | undefined;
  try { browser = await chromium.launch({ headless: true }); } catch { /* explicit failed page results below */ }
  try {
    for (const site of sites) for (const page of site.pages) {
      const target = report.sites.find(s => s.slug === site.slug)?.pages.find(p => p.path === page.path);
      if (!target) throw new Error('Forms report identity mismatch.');
      target.forms = browser ? await scanPageForms(site, page, options, browser) : [scanFailure('Forms browser launch failed.')];
    }
  } finally {
    if (browser) try { await browser.close(); }
    catch { report.sites[0]?.pages[0]?.forms?.push(scanFailure('Forms browser close failed.')); }
  }
}
