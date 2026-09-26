import { afterAll, beforeAll, expect, setDefaultTimeout, test } from 'bun:test';
import { mkdir, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright';
import { scanPageForms } from '../../src/forms/runner.ts';
import { findSecrets, retainTrace, secretRedactor } from '../../src/forms/evidence.ts';
import { runForms } from '../../src/commands/forms.ts';
import { runBaseline } from '../../src/commands/baseline.ts';
import { runCheck } from '../../src/commands/check.ts';
import { reportStatus } from '../../src/report/html.ts';
import { createStore, type Store } from '../../src/store.ts';
import type { FormResult, FormsManifest } from '../../src/report/model.ts';
import { assert, cli, safe, siteFor, startFormsHarness } from './harness.ts';

setDefaultTimeout(180_000);
const workspace = resolve('runs', `forms-playground-${crypto.randomUUID()}`);
const root = `test/forms-native-${new Date().toISOString().replaceAll(':','-')}-${crypto.randomUUID().slice(0,8)}/`;
const store = createStore({ root });
let harness: Awaited<ReturnType<typeof startFormsHarness>>;
const summary: Record<string, unknown> = { workspace, root, cleanup: { ok: false }, cases: {} };
const cases = summary.cases as Record<string, unknown>;
const timing = { deliveryTimeoutMs: 1_000, submissionTimeoutMs: 15_000 };
beforeAll(async () => {
  await mkdir(workspace, { recursive: true, mode: 0o700 });
  harness = await startFormsHarness(workspace);
  summary.versions = harness.h.versions;
  summary.pluginArtifacts = harness.h.artifactDir;
  summary.fixtureReadback = 'exact installed PHP and page content; served native-v1 marker verified';
}, 600_000);
afterAll(async () => {
  let deleted = 0;
  try { if (harness) await harness.stop(); }
  finally {
    for (const key of await store.list('')) { await store.delete(key); deleted++; }
    const remaining = (await store.list('')).length;
    summary.cleanup = { ok: remaining === 0, deleted, remaining, stopped: !!harness };
    await Bun.write(join(workspace, 'summary.json'), safe(JSON.stringify(summary, null, 2)) + '\n');
    // All trace archives are unpacked (including visual captures, whose safe pre-fill content is
    // checked bytewise rather than accepted by the stricter forms action-only archive parser).
    let files = 0, archives = 0;
    const redact = secretRedactor(undefined, [harness?.h.users.admin.password ?? '']);
    for (const entry of await readdir(workspace, { recursive: true, withFileTypes: true })) if (entry.isFile()) {
      const file = join(entry.parentPath, entry.name); files++;
      let text: string;
      if (file.endsWith('.zip')) {
        archives++;
        const child = Bun.spawn(['unzip','-p',file], { stdout:'pipe', stderr:'ignore' });
        text = await new Response(child.stdout).text();
        assert(await child.exited === 0, 'Privacy scan could not unpack trace');
      } else text = await Bun.file(file).text();
      assert(redact(text) === text && !/X-Amz-(?:Signature|Credential)=/i.test(text), 'Retained evidence contains a secret or bearer URL');
    }
    summary.privacy = { files, archives, unsafe: 0 };
    await Bun.write(join(workspace, 'summary.json'), safe(JSON.stringify(summary, null, 2)) + '\n');
    expect(remaining).toBe(0);
    console.log(`Native forms evidence: ${join(workspace,'summary.json')}`);
  }
}, 120_000);
const observe = async () => ({ mail: await harness.h.mail(), entries: await harness.h.entries(), feeds: await harness.h.feeds() });
const scan = (url: string, helper = true) => { const s = siteFor(url, helper); return scanPageForms(s, s.pages[0]!, { runDir: workspace, ...timing }); };
function confirmed(results: FormResult[]) {
  expect(results.map(f=>f.plugin)).toEqual(['gravity','fluent']);
  for (const f of results) {
    expect(f.outcome).toBe('failed');
    expect(f.detail).toContain('confirmation:');
    expect(f.detail).toMatch(/Submission [a-z0-9]{12}\./);
    expect(f.detail).toMatch(/Mailbox check did not complete|No message tagged/);
  }
}
async function redirected(before: Awaited<ReturnType<typeof observe>>, results: FormResult[]) {
  const after = await observe();
  expect(after.entries).toEqual(before.entries);
  expect(after.feeds).toEqual(before.feeds);
  const ids = results.map(f=>f.detail.match(/Submission ([a-z0-9]{12})\./)?.[1]);
  const mail = after.mail.slice(before.mail.length);
  expect(ids.every(Boolean)).toBe(true); expect(new Set(ids).size).toBe(ids.length);
  for (const id of ids) {
    const matching = mail.filter(m=>m.subject.startsWith(`[pirax-test ${id}] `));
    expect(matching).toHaveLength(2);
    for (const m of matching) {
      assert(m.to.length === 1 && m.to[0] === process.env.FORM_TEST_ADDRESS, 'Native mail redirect differs');
      expect(m.headers.filter(h=>/^X-Pirax-Form-Test:/i.test(h))).toEqual([`X-Pirax-Form-Test: ${id}`]);
      expect(m.headers.some(h=>/^(?:To|Cc|Bcc|Resent-To|Resent-Cc|Resent-Bcc):/i.test(h))).toBe(false);
    }
  }
  return { ids, mailCount: mail.length, entriesBefore: before.entries, entriesAfter: after.entries, feedsUnchanged: true };
}

test('helper false fills native forms without changing mail, entries or feeds; warning-only publication never accesses baselines', async () => {
  const before = await observe();
  const accesses: string[] = [], puts: string[] = [];
  const noBaseline = (key: string) => { accesses.push(key); assert(!key.startsWith('baselines'), 'Forms touched a baseline'); };
  const scoped: Store = { ...store,
    async get(key) { noBaseline(key); return store.get(key); },
    async list(key) { noBaseline(key); return store.list(key); },
    async put(key,data) { noBaseline(key); puts.push(key); return store.put(key,data); },
  };
  const result = await runForms([siteFor(harness.fixtures.pages.primary, false)], scoped, { runsDir: join(workspace,'warnings'), log:()=>{} });
  expect(result.exitCode).toBe(0);
  const forms = result.report!.sites[0]!.pages[0]!.forms;
  expect(forms.map(f=>[f.plugin,f.outcome])).toEqual([['gravity','not-verified'],['fluent','not-verified']]);
  expect(forms.every(f=>f.detail.includes('Native client validation passed'))).toBe(true);
  expect(await observe()).toEqual(before);
  expect(reportStatus(result.report!)).toBe('warning');
  expect(puts).toEqual([`reports/${result.report!.runId}/index.html`,`reports/${result.report!.runId}/manifest.json`]);
  cases.noHelper = { forms, report: result.localPath, exitCode: result.exitCode, mailEntriesFeedsUnchanged: true, baselineAccesses: 0, puts, accesses };
});

test('native upload/no-marker are unsupported; required client/server rejection continues to later FF', async () => {
  const before = await observe();
  const forms = await scan(harness.fixtures.pages.negative);
  cases.negative = forms;
  await Bun.write(join(workspace,'negative.json'), safe(JSON.stringify(forms,null,2)));
  expect(forms.map(f=>f.outcome)).toEqual(['unsupported','unsupported','rejected','rejected','failed']);
  expect(forms[0]!.detail).toMatch(/upload/i);
  expect(forms[1]!.detail).toMatch(/marker field/i);
  expect(forms[2]!.detail).toMatch(/Control|check/i);
  expect(forms[3]!.detail).toMatch(/required|selection/i);
  expect(forms[4]!.detail).toContain('Native Fluent Forms confirmation:');
  cases.negativeCleanup = await redirected(before, forms.slice(4));
});

test('native required GF checkbox/consent and FF checkbox/terms confirm, redirect and clean entries; helper false never submits', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext();
    await context.tracing.start({ screenshots: false, snapshots: false, sources: false });
    try {
      const page = await context.newPage(); await page.goto(harness.fixtures.pages.required);
      const markers = await page.locator('input[type=checkbox]').evaluateAll(es => es.map(e => ({
        required: (e as HTMLInputElement).required, aria: e.getAttribute('aria-required'),
        gravityRequired: !!e.closest('.gfield_contains_required'), name: (e as HTMLInputElement).name,
      })));
      expect(markers.length).toBe(7); // GF two choices + consent; FF three choices + terms.
      expect(markers.every(m => !m.required)).toBe(true);
      expect(markers.every(m => m.gravityRequired || m.aria === 'true')).toBe(true);
      cases.requiredMarkup = markers;
    } finally { await retainTrace(context, join(workspace, 'required-markup.trace.zip'), secretRedactor()); await context.close(); }
  } finally { await browser.close(); }
  const before = await observe();
  const noHelper = await scan(harness.fixtures.pages.required, false);
  expect(noHelper.map(f => f.outcome)).toEqual(['not-verified', 'not-verified']);
  expect(await observe()).toEqual(before);
  const forms = await scan(harness.fixtures.pages.required);
  cases.required = { forms, noHelper, helperFalseUnchanged: true };
  await Bun.write(join(workspace, 'required.json'), safe(JSON.stringify(forms, null, 2)));
  confirmed(forms);
  cases.requiredCleanup = await redirected(before, forms);
});

test('native GF modern AJAX and FF AJAX retain separate confirmations and native cleanup', async () => {
  const before = await observe();
  const browser = await chromium.launch({ headless: true });
  const requests: unknown[] = [];
  const makeContext = browser.newContext.bind(browser);
  browser.newContext = async options => {
    const context = await makeContext(options);
    context.on('request', r => {
      if (r.method() === 'POST') {
        const body = r.postData() ?? '';
        requests.push({ path: new URL(r.url()).pathname, type: r.headers()['content-type'],
          fields: [...body.matchAll(/name="([A-Za-z0-9_]+)"/g)].map(m=>m[1]),
          action: /gform_submit_form/.test(body), marker: body.includes(harness.h.token) });
      }
    });
    context.on('requestfailed', r => requests.push({ failed: new URL(r.url()).pathname, reason: r.failure()?.errorText }));
    context.on('page', page => page.on('console', m => { if (m.type() === 'error') requests.push({ console: safe(m.text()) }); }));
    return context;
  };
  const site = siteFor(harness.fixtures.pages.ajax);
  let forms: FormResult[];
  try { forms = await scanPageForms(site, site.pages[0]!, { runDir: workspace, ...timing }, browser); }
  finally { await browser.close(); await Bun.write(join(workspace,'ajax-requests.json'), safe(JSON.stringify(requests,null,2))); }
  cases.ajax = forms;
  await Bun.write(join(workspace,'ajax.json'), safe(JSON.stringify(forms,null,2)));
  confirmed(forms);
  cases.ajaxCleanup = await redirected(before, forms);
});

test('production bun run forms local CLI waits two default five-minute deadlines and publishes truthful failed private report', async () => {
  const before = await observe();
  const invocation = await cli(workspace, root, siteFor(harness.fixtures.pages.primary));
  cases.cli = invocation;
  expect(invocation.exitCode).toBe(1);
  const manifest = await Bun.file(invocation.manifest).json() as FormsManifest;
  expect(manifest.command).toBe('forms');
  const forms = manifest.report.sites[0]!.pages[0]!.forms;
  cases.cliForms = forms;
  confirmed(forms);
  for (const f of forms) expect(f.detail).toContain('within 300 s');
  expect(invocation.elapsedMs).toBeGreaterThanOrEqual(600_000);
  expect(invocation.elapsedMs).toBeLessThan(900_000);
  expect(reportStatus(manifest.report)).toBe('failure');
  cases.cliCleanup = await redirected(before, forms);
  const keys = await store.list(`reports/${manifest.report.runId}/`);
  expect(keys).toEqual([`reports/${manifest.report.runId}/index.html`,`reports/${manifest.report.runId}/manifest.json`]);
  const remote = await store.get(`reports/${manifest.report.runId}/index.html`);
  expect(remote).toEqual(await Bun.file(invocation.report).bytes());
  await Bun.write(join(invocation.runDir,'remote-index.html'), remote);
  const browser = await chromium.launch({ headless:true });
  try {
    const context = await browser.newContext();
    await context.tracing.start({ screenshots:false, snapshots:false, sources:false });
    try {
      const page = await context.newPage();
      await page.setContent(new TextDecoder().decode(remote)); // never navigate a signed bearer URL
      expect(await page.locator('h1').innerText()).toBe('Form check');
      expect(await page.locator('body').innerText()).toContain('local — failure');
      expect(await page.locator('img,figure').count()).toBe(0);
      expect(await page.locator('body').innerText()).toContain('within 300 s');
    } finally { await retainTrace(context, join(invocation.runDir,'report.trace.zip'), secretRedactor()); await context.close(); }
  } finally { await browser.close(); }
  expect(await findSecrets(join(workspace,'cli'), secretRedactor())).toEqual([]);
}, 900_000);

test('production check captures both widths unchanged, attaches native failed forms and preserves failure status', async () => {
  const site = siteFor(harness.fixtures.pages.negative);
  const options = { runsDir:join(workspace,'check'), log:()=>{}, forms:timing };
  const baseline = await runBaseline([site], store, options);
  expect(baseline.exitCode).toBe(0);
  const before = await observe();
  const result = await runCheck([site], store, options);
  cases.check = { exitCode:result.exitCode, report:result.localPath, runDir:result.runDir, data:result.report };
  expect(result.exitCode).toBe(1);
  const page = result.report!.sites[0]!.pages[0]!;
  expect(page.forms!.map(f=>f.outcome)).toEqual(['unsupported','unsupported','rejected','rejected','failed']);
  for (const v of Object.values(page.viewports)) {
    expect(v.capture.state).toBe('captured');
    expect(v.visual.state).toBe('same');
    assert(!!v.artifacts.actualPng, 'Missing unchanged visual evidence');
  }
  expect(reportStatus(result.report!)).toBe('failure');
  cases.checkCleanup = await redirected(before, page.forms!.slice(4));
}, 240_000);
