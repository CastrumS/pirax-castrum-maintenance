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
import type { TestForm } from '../../src/sites.ts';
import { assert, cli, designate, safe, siteFor, startFormsHarness } from './harness.ts';

setDefaultTimeout(180_000);
const workspace = resolve('runs', `forms-playground-${crypto.randomUUID()}`);
const root = `test/forms-native-${new Date().toISOString().replaceAll(':','-')}-${crypto.randomUUID().slice(0,8)}/`;
const store = createStore({ root });
let harness: Awaited<ReturnType<typeof startFormsHarness>>;
const summary: Record<string, unknown> = { workspace, root, cleanup: { ok: false }, cases: {} };
const cases = summary.cases as Record<string, unknown>;
const cliCases: Record<string, Record<string, unknown>> = {};
cases.cli = cliCases;
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
/** One explicitly designated form on one listed page; the production scanner skips every other form. */
const scan = (url: string, helper: boolean, plugin: TestForm['plugin'], id: number) => { const s = siteFor(url, helper, designate(url, plugin, id)); return scanPageForms(s, s.pages[0]!, { runDir: workspace, ...timing }); };
/** Exactly one attempted result, at `index`; every other discovered form was skipped. */
function only(forms: FormResult[], index: number): FormResult {
  expect(forms.map(f => f.outcome === 'skipped')).toEqual(forms.map((_, i) => i !== index));
  return forms[index]!;
}
function confirmed(results: FormResult[], plugins: FormResult['plugin'][]) {
  expect(results.map(f=>f.plugin)).toEqual(plugins);
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
  // Exact delta: the fixtures' TWO native notifications per submission, tagged only with these IDs.
  // Remaining entries cannot count submissions (the helper deletes them); the unique tags can.
  expect(mail.map(m => /^\[pirax-test ([a-z0-9]{12})\] /.exec(m.subject)?.[1] ?? 'untagged').sort()).toEqual(ids.flatMap(id => [id!, id!]).sort());
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

test('helper false fills only each designated native form without changing mail, entries or feeds; warning-only publication never accesses baselines', async () => {
  const before = await observe();
  const accesses: string[] = [], puts: string[] = [];
  const noBaseline = (key: string) => { accesses.push(key); assert(!key.startsWith('baselines'), 'Forms touched a baseline'); };
  const scoped: Store = { ...store,
    async get(key) { noBaseline(key); return store.get(key); },
    async list(key) { noBaseline(key); return store.list(key); },
    async put(key,data) { noBaseline(key); puts.push(key); return store.put(key,data); },
  };
  const { pages, ids } = harness.fixtures;
  // Two independent sites in one invocation, each designating a different form on the same page.
  const sites = [siteFor(pages.primary, false, designate(pages.primary, 'gravity', ids.gf)), { ...siteFor(pages.primary, false, designate(pages.primary, 'fluent', ids.ff)), slug: 'local-fluent' }];
  const result = await runForms(sites, scoped, { runsDir: join(workspace,'warnings'), log:()=>{} });
  expect(result.exitCode).toBe(0);
  const forms = result.report!.sites.flatMap(s => s.pages[0]!.forms);
  expect(forms.map(f=>[f.plugin,f.outcome])).toEqual([['gravity','not-verified'],['fluent','skipped'],['gravity','skipped'],['fluent','not-verified']]);
  expect([forms[0]!, forms[3]!].every(f=>f.detail.includes('Native client validation passed'))).toBe(true);
  expect(await observe()).toEqual(before);
  expect(reportStatus(result.report!)).toBe('warning');
  expect(puts).toEqual([`reports/${result.report!.runId}/index.html`,`reports/${result.report!.runId}/manifest.json`]);
  cases.noHelper = { forms, report: result.localPath, exitCode: result.exitCode, mailEntriesFeedsUnchanged: true, baselineAccesses: 0, puts, accesses };
});

test('native upload/no-marker are unsupported; required client/server rejection; a separately designated FF run still confirms', async () => {
  const before = await observe();
  const { pages, ids } = harness.fixtures;
  // Each selection is its own run with every other form skipped: no fallback within a site.
  const selections: [TestForm['plugin'], number][] = [['gravity', ids.upload], ['gravity', ids.nomarker], ['gravity', ids.client], ['gravity', ids.server], ['fluent', ids.ff]];
  const forms: FormResult[] = [];
  for (const [index, [plugin, id]] of selections.entries()) forms.push(only(await scan(pages.negative, true, plugin, id), index));
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
  const { pages, ids } = harness.fixtures;
  const noHelper = [only(await scan(pages.required, false, 'gravity', ids.requiredgf), 0), only(await scan(pages.required, false, 'fluent', ids.requiredff), 1)];
  expect(noHelper.map(f => f.outcome)).toEqual(['not-verified', 'not-verified']);
  expect(await observe()).toEqual(before);
  const forms = [only(await scan(pages.required, true, 'gravity', ids.requiredgf), 0), only(await scan(pages.required, true, 'fluent', ids.requiredff), 1)];
  cases.required = { forms, noHelper, helperFalseUnchanged: true };
  await Bun.write(join(workspace, 'required.json'), safe(JSON.stringify(forms, null, 2)));
  confirmed(forms, ['gravity', 'fluent']);
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
  const { pages, ids } = harness.fixtures;
  const forms: FormResult[] = [];
  try {
    for (const [index, plugin, id] of [[0, 'gravity', ids.ajax], [1, 'fluent', ids.ff]] as const) {
      const site = siteFor(pages.ajax, true, designate(pages.ajax, plugin, id));
      forms.push(only(await scanPageForms(site, site.pages[0]!, { runDir: workspace, ...timing }, browser), index));
    }
  } finally { await browser.close(); await Bun.write(join(workspace,'ajax-requests.json'), safe(JSON.stringify(requests,null,2))); }
  cases.ajax = forms;
  await Bun.write(join(workspace,'ajax.json'), safe(JSON.stringify(forms,null,2)));
  confirmed(forms, ['gravity', 'fluent']);
  cases.ajaxCleanup = await redirected(before, forms);
});

test('native FF designation over both repeated scope pages: production forms run submits once and skips five (short internal deadline)', async () => {
  const { pages, ids } = harness.fixtures;
  const before = await observe();
  const site = siteFor([pages.scopeA, pages.scopeB], true, designate(pages.scopeA, 'fluent', ids.ff));
  const result = await runForms([site], store, { runsDir: join(workspace,'fluent-scope'), log:()=>{}, forms: timing });
  expect(result.exitCode).toBe(1);
  const report = result.report!.sites[0]!.pages;
  expect(report.map(p => pairs(p.forms))).toEqual([[['gravity','skipped'],['gravity','skipped'],['fluent','failed']], skippedAll]);
  const selected = report[0]!.forms[2]!;
  confirmed([selected], ['fluent']);
  cases.fluentScope = { report: result.localPath, runDir: result.runDir, exitCode: result.exitCode, forms: report, cleanup: await redirected(before, [selected]) };
});

/** A real package CLI run over both scope pages, published to the scoped root, with its own evidence directory. */
async function scoped(scenario: string, helper: boolean, test_form: TestForm | undefined) {
  const before = await observe();
  const { scopeA, scopeB } = harness.fixtures.pages;
  const invocation = await cli(workspace, root, siteFor([scopeA, scopeB], helper, test_form), scenario);
  const manifest = await Bun.file(invocation.manifest).json() as FormsManifest;
  expect(manifest.command).toBe('forms');
  const pages = manifest.report.sites[0]!.pages;
  const keys = await store.list(`reports/${manifest.report.runId}/`);
  expect(keys).toEqual([`reports/${manifest.report.runId}/index.html`,`reports/${manifest.report.runId}/manifest.json`]);
  const remote = await store.get(`reports/${manifest.report.runId}/index.html`);
  expect(remote).toEqual(await Bun.file(invocation.report).bytes());
  await Bun.write(join(invocation.runDir,'remote-index.html'), remote);
  const traces = (await readdir(join(invocation.runDir, 'traces', 'forms'))).sort();
  const record: Record<string, unknown> = { ...invocation, test_form: test_form ?? null, helper, forms: pages.map(p => ({ path: p.path, forms: p.forms })), traces, reportTrace: join(invocation.runDir, 'report.trace.zip') };
  cliCases[scenario] = record;
  return { invocation, pages, before, remote, record, traces };
}
/** Fetched private HTML rendered as local content (never a signed bearer URL), with a sanitized action trace. */
async function rendered(html: Uint8Array, runDir: string) {
  const browser = await chromium.launch({ headless:true });
  try {
    const context = await browser.newContext();
    await context.tracing.start({ screenshots:false, snapshots:false, sources:false });
    try {
      const page = await context.newPage();
      await page.setContent(new TextDecoder().decode(html));
      return { title: await page.locator('h1').innerText(), text: await page.locator('body').innerText(), images: await page.locator('img,figure').count(), outcomes: await page.locator('td strong').allInnerTexts() };
    } finally { await retainTrace(context, join(runDir,'report.trace.zip'), secretRedactor()); await context.close(); }
  } finally { await browser.close(); }
}
const pairs = (forms: FormResult[]): string[][] => forms.map(f => [f.plugin, f.outcome]);
const skippedAll = [['gravity','skipped'],['gravity','skipped'],['fluent','skipped']];

test('scoped CLI without a designation, with a missing designated ID, or with helper false submits nothing and publishes truthful reports', async () => {
  const { pages, ids } = harness.fixtures;
  {
    const { invocation, pages: report, before, remote, traces } = await scoped('none', true, undefined);
    expect(invocation.exitCode).toBe(0);
    expect(report.map(p => pairs(p.forms))).toEqual([skippedAll, skippedAll]);
    expect(report.flatMap(p => p.forms).every(f => f.detail === 'No test form configured; not filled or submitted.')).toBe(true);
    expect(traces.every(t => t.endsWith('-scan.trace.zip'))).toBe(true);
    expect(await observe()).toEqual(before);
    const view = await rendered(remote, invocation.runDir);
    expect(view.text).toContain('local — pass');
    expect(view.outcomes).toEqual(Array(6).fill('skipped'));
    expect(view.text).toContain('No test form configured; not filled or submitted.');
  }
  {
    const { invocation, pages: report, before, remote, traces } = await scoped('missing', true, designate(pages.scopeB, 'gravity', 999_999));
    expect(invocation.exitCode).toBe(1);
    expect(report.map(p => pairs(p.forms))).toEqual([skippedAll, [...skippedAll, ['gravity','failed']]]);
    expect(report[1]!.forms[3]).toEqual({ selector: 'test-form:gravity:999999', plugin: 'gravity', outcome: 'failed', detail: 'test form not found' });
    expect(traces.every(t => t.endsWith('-scan.trace.zip'))).toBe(true);
    expect(await observe()).toEqual(before);
    const view = await rendered(remote, invocation.runDir);
    expect(view.text).toContain('local — failure');
    expect(view.outcomes).toEqual([...Array(6).fill('skipped'), 'failed']);
    expect(view.text).toContain('test form not found');
  }
  {
    const { invocation, pages: report, before, remote, traces } = await scoped('helper-false', false, designate(pages.scopeB, 'gravity', ids.gf));
    expect(invocation.exitCode).toBe(0);
    expect(report.map(p => pairs(p.forms))).toEqual([skippedAll, [['gravity','not-verified'],['gravity','skipped'],['fluent','skipped']]]);
    expect(report[1]!.forms[0]!.detail).toContain('Helper not enabled; filled without submission.');
    expect(traces.filter(t => t.includes('-form-'))).toHaveLength(1);
    expect(await observe()).toEqual(before);
    const view = await rendered(remote, invocation.runDir);
    expect(view.text).toContain('local — warning');
    expect(view.outcomes).toEqual(['skipped','skipped','skipped','not-verified','skipped','skipped']);
  }
}, 300_000);

test('scoped production bun run forms local CLI submits only the designated form on the second listed page, once, and truthfully fails after one default five-minute deadline', async () => {
  const { pages, ids } = harness.fixtures;
  const { invocation, pages: report, before, remote, record, traces } = await scoped('selected', true, designate(pages.scopeB, 'gravity', ids.gf));
  expect(invocation.exitCode).toBe(1);
  expect(report.map(p => pairs(p.forms))).toEqual([skippedAll, [['gravity','failed'],['gravity','skipped'],['fluent','skipped']]]);
  expect(report[0]!.forms.every(f => f.detail === 'Not the designated test form on this page; not filled or submitted.')).toBe(true);
  const selected = report[1]!.forms[0]!;
  confirmed([selected], ['gravity']);
  expect(selected.detail).toContain('within 300 s');
  // One real production mailbox deadline, not two and not a shortened one.
  expect(invocation.elapsedMs).toBeGreaterThanOrEqual(300_000);
  expect(invocation.elapsedMs).toBeLessThan(600_000);
  expect(traces.filter(t => t.includes('-form-'))).toHaveLength(1);
  expect(reportStatus((await Bun.file(invocation.manifest).json() as FormsManifest).report)).toBe('failure');
  record.cleanup = await redirected(before, [selected]);
  const view = await rendered(remote, invocation.runDir);
  expect(view.title).toBe('Form check');
  expect(view.text).toContain('local — failure');
  expect(view.images).toBe(0);
  expect(view.text).toContain('within 300 s');
  expect(view.outcomes).toEqual(['skipped','skipped','skipped','failed','skipped','skipped']);
  expect(view.text).toContain('Not the designated test form on this page; not filled or submitted.');
  expect(await findSecrets(join(workspace,'cli'), secretRedactor())).toEqual([]);
}, 660_000);

test('production check captures both widths unchanged on both scope pages and applies the same selection: one submission, five skips', async () => {
  const { pages, ids } = harness.fixtures;
  const site = siteFor([pages.scopeA, pages.scopeB], true, designate(pages.scopeB, 'gravity', ids.gf));
  const options = { runsDir:join(workspace,'check'), log:()=>{}, forms:timing };
  const baseline = await runBaseline([site], store, options);
  expect(baseline.exitCode).toBe(0);
  const before = await observe();
  const result = await runCheck([site], store, options);
  cases.check = { exitCode:result.exitCode, report:result.localPath, runDir:result.runDir, data:result.report };
  expect(result.exitCode).toBe(1);
  const report = result.report!.sites[0]!.pages;
  expect(report.map(p => pairs(p.forms!))).toEqual([skippedAll, [['gravity','failed'],['gravity','skipped'],['fluent','skipped']]]);
  for (const page of report) for (const v of Object.values(page.viewports)) {
    expect(v.capture.state).toBe('captured');
    expect(v.visual.state).toBe('same');
    assert(!!v.artifacts.actualPng, 'Missing unchanged visual evidence');
  }
  expect(reportStatus(result.report!)).toBe('failure');
  const selected = report[1]!.forms![0]!;
  confirmed([selected], ['gravity']);
  cases.checkCleanup = await redirected(before, [selected]);
}, 360_000);
