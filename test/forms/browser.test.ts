import { afterAll, beforeAll, expect, setDefaultTimeout, test } from "bun:test";
import { chromium, type Browser } from "playwright";
import { resolve, join } from "node:path";
import { mkdir, readdir } from "node:fs/promises";
import { detectForms } from "../../src/forms/detect.ts";
import { fillForm, newSubmissionId } from "../../src/forms/fill.ts";
import { installFormPolicy, submitForm } from "../../src/forms/submit.ts";
import { populateForms, scanPageForms } from "../../src/forms/runner.ts";
import { findSecrets, retainTrace, secretRedactor } from "../../src/forms/evidence.ts";
import type { FormResult, FormsRunReport } from "../../src/report/model.ts";
import { pageKey, type Site, type TestForm } from "../../src/sites.ts";

// Several fresh Chromium launches plus trace repacking; allow contention with the full plugin suite.
setDefaultTimeout(60_000);
const config = { token: "fixture-Private+Token/=123", address: "checker+fixture@example.test" };
const redact = secretRedactor(config.token, [config.address]);
const runDir = resolve("runs", `forms-browser-${crypto.randomUUID()}`);
let browser: Browser;
let writes = 0, traps = 0, sockets = 0, chunkReads = 0;
const gfChunk = '/wp-content/plugins/gravityforms/assets/js/dist/vendor-theme-dompurify.b0876f45cc06deeb8174.min.js';
const gf = (id = 1, fields = '<input name="input_1" required><input name="input_2" type="email" required><textarea name="input_3"></textarea>', extra = "") => `<div class="gform_wrapper" id="gform_wrapper_${id}"><form id="gform_${id}" method="post" ${extra}><input type="hidden" name="gform_submit" value="${id}"><input type="hidden" name="nonce" value="untouched">${fields}<button type="submit">Send</button></form></div>`;
const ff = `<div class="fluentform"><form class="frm-fluent-form" id="fluentform_2" data-form_id="2"><input name="email" type="email"><textarea name="message"></textarea><button type="submit">Send</button></form></div>`;
const ffScript = `<script>document.querySelector('form').onsubmit=async e=>{e.preventDefault();const form=e.target;await fetch('/wp-admin/admin-ajax.php?t='+Date.now(),{method:'POST',body:new URLSearchParams({action:'fluentform_submit',form_id:'2',data:new URLSearchParams(new FormData(form)).toString()})});form.parentElement.insertAdjacentHTML('beforeend','<div class="ff-message-success">FF accepted</div>')};</script>`;
const trapScript = `<script>
new WebSocket('ws://'+location.host+'/socket');
fetch('/trap',{method:'POST',body:'onload'}).catch(()=>{});
const f=document.querySelector('form');
f.addEventListener('input',()=>{fetch('/trap?'+new URLSearchParams(new FormData(f))).catch(()=>{});fetch('/trap',{method:'POST',body:new FormData(f)}).catch(()=>{});const img=new Image();img.src='/trap?image='+encodeURIComponent(f.querySelector('textarea')?.value);});
f.addEventListener('change',()=>{f.method='get';f.action='/trap';f.submit();f.requestSubmit();location.assign('/trap?navigation=1');});
</script>`;
// Scope fixtures: same-number GF #2/FF #2, a search form, a GF account form and an unnumbered GF #0 login.
const scopeForms = gf() + gf(2) + ff + '<form role="search"><input name="s"></form>' + gf(5, '<input name="input_1"><input type="password" name="input_2"><textarea name="input_3"></textarea>') + '<div class="gform_wrapper"><form id="gform_0" method="post"><input name="log"><input type="password" name="pwd"><button type="submit">Log in</button></form></div>';
// Console-only browser observation of every input/change event, by document form index and id.
const recorder = `<script>for(const t of ['input','change'])document.addEventListener(t,e=>{const f=e.target.form;console.log('pirax-event '+t+' '+(f?'form-'+[...document.forms].indexOf(f)+':'+f.id:'none'))},true);</script>`;
let shifting = 0;
const server = Bun.serve({ hostname: "127.0.0.1", port: 0, async fetch(req, srv) {
  const url = new URL(req.url);
  if (url.pathname === "/socket") { sockets++; return srv.upgrade(req, { data: undefined }) ? undefined : new Response(); }
  if (url.pathname === "/trap") { traps++; return new Response("trap"); }
  if (url.pathname === gfChunk) { chunkReads++; return new Response('window.nativeChunkLoaded=true;', { headers: { 'content-type': 'text/javascript' } }); }
  if (req.method === "POST") {
    writes++;
    const data = await req.formData();
    if (url.pathname === "/reject" || url.pathname === "/reject-duplicates") return html(`<div id="gform_wrapper_1"><div id="gform_1_validation_container">Refused ${config.token} ${encodeURIComponent(config.address)}</div></div>`, 400);
    if (url.pathname === "/foreign") return html('<div id="gform_confirmation_message_99">Wrong form</div>');
    if (url.pathname === "/no-confirmation") return html("HTTP 200 is not confirmation");
    return html(`<div id="gform_confirmation_message_${data.get("gform_submit")}">GF accepted</div>`);
  }
  switch (url.pathname) {
    case "/empty": return html("No forms");
    case "/challenge": return html('<title>Just a moment...</title><script>window._cf_chl_opt={};</script>');
    case "/challenge-header": return new Response('Checking browser', { headers: { 'cf-mitigated': 'challenge' } });
    case "/firewall": return html('<title>Sucuri Website Firewall</title>');
    case "/ordinary-mentions": return html('<title>Cloudflare setup</title>CAPTCHA protects our contact form.');
    case "/missing": return html("Missing", 404);
    case "/traps": return html(gf() + trapScript);
    case "/multi": return html(gf() + gf(3) + ff + '<form><input name="search"></form>');
    case "/unrelated": return html(gf() + gf(3) + `<script>document.querySelector('button').addEventListener('click',()=>{const f=document.querySelector('#gform_3');f.submit();fetch('/trap',{method:'POST',body:'unrelated'}).catch(()=>{});fetch('/trap?get=unrelated').catch(()=>{});});</script>`);
    case "/save-trap": return html(gf() + `<script>document.querySelector('button').onclick=()=>{const i=document.createElement('input');i.type='hidden';i.name='gform_save';i.value='1';document.querySelector('form').append(i);};</script>`);
    case "/autonomous": return html(gf() + `<script>const f=document.querySelector('form');f.method='get';f.action='/trap';f.submit();f.requestSubmit();</script>`);
    case "/upload": return html(gf(1, '<textarea name="input_3"></textarea><input type="file" hidden>'));
    case "/constrained": return html(gf(1, '<textarea name="input_3" maxlength="3"></textarea>'));
    case "/ambiguous-ff": return html(ff.replace('<div class="fluentform">', '').replace('</form></div>', '</form>'));
    case "/ff": return html(ff + ffScript);
    case "/gf-ajax": return html(gf(1, '<textarea name="input_3"></textarea><input type="hidden" name="gform_submission_method" data-js="gform_submission_method_1" value="ajax">') + `<script>window.gform_theme_config={common:{form:{ajax:{ajaxurl:location.origin+'/wp-admin/admin-ajax.php'}}}};document.querySelector('form').onsubmit=async e=>{e.preventDefault();const data=new FormData(e.target);data.append('action','gform_submit_form');data.append('form_id','1');const response=await fetch('/wp-admin/admin-ajax.php',{method:'POST',body:data});const body=await response.text();await fetch('${gfChunk}?field='+encodeURIComponent(data.get('input_3'))).catch(()=>{});await fetch('${gfChunk}').catch(()=>{});await new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='${gfChunk}';s.onload=resolve;s.onerror=reject;document.head.append(s)});if(window.nativeChunkLoaded)document.body.innerHTML=body;};</script>`);
    case "/stale": return html(gf() + '<div id="gform_confirmation_message_1">Old</div>');
    case "/ff-stale": return html(ff + '<div class="ff-message-success">Foreign success</div>');
    case "/ff-foreign": return html(ff + `<script>document.querySelector('form').onsubmit=e=>{e.preventDefault();document.body.insertAdjacentHTML('beforeend','<div class="ff-message-success">Foreign</div>')}</script>`);
    case "/captcha": return html(ff.replace('<textarea', '<div class="cf-turnstile"></div><textarea'));
    case "/scope-a": case "/scope-b": return html(scopeForms + ffScript.replace("querySelector('form')", "querySelector('#fluentform_2')") + recorder);
    case "/duplicates": case "/reject-duplicates": return html(gf() + gf() + recorder);
    // The first instance changes shape between discovery and its fresh form context.
    case "/shifting": return html(gf(1, `<textarea name="input_3"></textarea>${shifting++ % 2 ? '<input name="input_4">' : ''}`) + gf() + recorder);
    default: return html(gf());
  }
}, websocket: { message() {} } });
const base = `http://127.0.0.1:${server.port}`;
function html(body: string, status = 200) { return new Response(`<!doctype html><meta charset="utf-8">${body}`, { status, headers: { "content-type": "text/html" } }); }
const local = (paths: string[], form_helper: boolean, test_form: TestForm | undefined, slug = "local"): Site =>
  ({ slug, url: base, form_helper, mask: [], max_diff_pixel_ratio: 0.01, pages: paths.map(path => ({ path, mask: [] })), ...(test_form ? { test_form } : {}) });
const emptyReport = (...sites: Site[]): FormsRunReport => ({ mode: "forms", runId: "2026-09-26T00-00-00.000Z", sites: sites.map(s => ({ slug: s.slug, url: s.url, pages: s.pages.map(p => ({ path: p.path, pageKey: pageKey(p.path), forms: [] })) })) });
const shape = (forms: FormResult[] | undefined) => (forms ?? []).map(f => `${f.plugin}:${f.outcome}`);
const allSkipped = ["gravity:skipped", "gravity:skipped", "fluent:skipped", "unknown:skipped", "gravity:skipped", "gravity:skipped"];
const notDesignated = "Not the designated test form on this page; not filled or submitted.";
const missing = (plugin: TestForm["plugin"], id: number): FormResult => ({ selector: `test-form:${plugin}:${id}`, plugin, outcome: "failed", detail: "test form not found" });
// An unreachable loopback mailbox: confirmed submissions truthfully end as failed IMAP connections.
const refused = Bun.listen({ hostname: "127.0.0.1", port: 0, socket: { data() {} } });
const refusedPort = refused.port; refused.stop(true);
const fill = { FORM_TEST_TOKEN: config.token, FORM_TEST_ADDRESS: config.address };
const mailbox = { ...fill, IMAP_HOST: "127.0.0.1", IMAP_PORT: String(refusedPort), IMAP_USER: "fixture-imap-user", IMAP_PASSWORD: "fixture-imap-password", IMAP_FOLDER: "Tests", IMAP_SPAM_FOLDER: "Spam" };
const credentialNames = ["FORM_TEST_TOKEN", "FORM_TEST_ADDRESS", "IMAP_HOST", "IMAP_PORT", "IMAP_USER", "IMAP_PASSWORD", "IMAP_FOLDER", "IMAP_SPAM_FOLDER"];
/** Exactly these form/mail variables for the duration of `fn`; `{}` means none at all. */
async function withEnv<T>(values: Record<string, string>, fn: () => Promise<T>): Promise<T> {
  const old = credentialNames.map(name => process.env[name]);
  credentialNames.forEach(name => delete process.env[name]);
  Object.assign(process.env, values);
  try { return await fn(); } finally { credentialNames.forEach((name, i) => restore(name, old[i])); }
}
/** Production scanner on a dedicated browser whose contexts only listen to the recorder's console events. */
async function watched(site: Site, path: string) {
  const own = await chromium.launch({ headless: true });
  const events: string[] = [];
  const make = own.newContext.bind(own);
  own.newContext = async options => {
    const context = await make(options);
    context.on("console", m => { if (m.text().startsWith("pirax-event ")) events.push(m.text().slice(12)); });
    return context;
  };
  try { return { results: await scanPageForms(site, { path, mask: [] }, { runDir, deliveryTimeoutMs: 2_000 }, own), events }; }
  finally { await own.close(); }
}
beforeAll(async () => { await mkdir(runDir, { recursive: true }); browser = await chromium.launch(); });
afterAll(async () => { await browser?.close(); server.stop(true); });
let sequence = 0;
async function visit(path: string, fn: (page: import("playwright").Page, policy: Awaited<ReturnType<typeof installFormPolicy>>) => Promise<void>, content?: string) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: "block" });
  const policy = await installFormPolicy(context);
  await context.tracing.start({ screenshots: false, snapshots: false, sources: false });
  try { const page = await context.newPage(); page.setDefaultTimeout(2000); await page.goto(base + path); if (content) await page.setContent(content); await fn(page, policy); }
  finally { await retainTrace(context, join(runDir, `${sequence++}.trace.zip`), redact); await context.close(); }
}

test("detects actual distinct plugin forms once and preserves unknown identities", async () => {
  await visit("/multi", async page => {
    const forms = await detectForms(page);
    expect(forms.map(f => f.plugin)).toEqual(["gravity", "gravity", "fluent", "unknown"]);
    expect(new Set(forms.map(f => f.selector)).size).toBe(4);
    expect(page.viewportSize()).toEqual({ width: 1440, height: 900 });
  });
});
test("fills basic controls with full random marker, preserving hidden/honeypot data", async () => {
  const ids = new Set(Array.from({ length: 100 }, newSubmissionId));
  expect(ids.size).toBe(100); expect([...ids].every(id => /^[a-z0-9]{12}$/.test(id))).toBe(true);
  await visit("/plain", async (page, policy) => {
    policy.freeze(); const d = (await detectForms(page))[0]!;
    const prepared = await fillForm(page, d, config, newSubmissionId());
    expect(prepared.state).toBe("prepared");
    expect(await page.locator('[name="input_2"]').inputValue()).toBe(config.address);
    expect(await page.locator('textarea').inputValue()).toMatch(new RegExp('^'+config.token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')+'-[a-z0-9]{12}$'));
    expect(await page.locator('[name="nonce"]').inputValue()).toBe("untouched");
  });
});
test("native required checkbox groups choose one usable option; individual required and optional choices are preserved", async () => {
  const boxes = `<div class="gfield gfield_contains_required">
    <input type="checkbox" name="input_4.1" disabled><input type="checkbox" name="input_4.2" hidden>
    <input type="checkbox" name="input_4.3"><input type="checkbox" name="input_4.4"></div>
    <div class="gfield"><input type="checkbox" name="input_5.1" aria-required="true"></div>
    <div class="gfield"><input type="checkbox" name="input_6.1"></div>
    <div class="gfield gfield_contains_required"><input type="checkbox" name="input_7.1"><input type="checkbox" name="input_7.2" required><input type="checkbox" name="input_7.3" required></div>`;
  const ffBoxes = `<div class="ff-el-group"><input type="checkbox" name="choices[]" disabled aria-required="true"><input type="checkbox" name="choices[]" aria-required="true"><input type="checkbox" name="choices[]" aria-required="true"></div>
    <div class="ff-el-group"><input type="checkbox" name="terms" aria-required="true"></div>
    <div class="ff-el-group"><input type="checkbox" name="optional[]" aria-required="false"></div>`;
  for (const [markup, expected] of [[gf(1, '<textarea name="input_3"></textarea>' + boxes), [false,false,true,false,true,false,false,true,true]], [ff.replace('<textarea', ffBoxes + '<textarea'), [false,true,false,true,false]]] as const) {
    await visit('/plain', async (page, policy) => {
      policy.freeze(); const before = writes;
      expect((await fillForm(page, (await detectForms(page))[0]!, config, newSubmissionId())).state).toBe('prepared');
      expect(await page.locator('input[type=checkbox]').evaluateAll(es => es.map(e => (e as HTMLInputElement).checked))).toEqual([...expected]);
      expect(writes).toBe(before);
    }, markup);
  }
});

test("HTTP-200 explicit challenges fail discovery, ordinary CAPTCHA/Cloudflare mentions remain empty", async () => {
  const site = { slug: 'local', url: base, form_helper: false, mask: [], max_diff_pixel_ratio: 0.01, pages: [] };
  for (const path of ['/challenge', '/challenge-header', '/firewall']) {
    const results = await scanPageForms(site, { path, mask: [] }, { runDir });
    expect(results).toHaveLength(1);
    expect(results[0]?.selector).toBe('page-scan');
    expect(results[0]?.outcome).toBe('failed');
  }
  expect(await scanPageForms(site, { path: '/ordinary-mentions', mask: [] }, { runDir })).toEqual([]);
});

test("preinspects whole form: hidden upload, marker constraints and custom flows never type", async () => {
  const cases = [
    '<textarea name="input_3"></textarea><input type="file" style="display:none">',
    '<input type="email" name="input_2">', '<textarea name="input_3" maxlength="4"></textarea>',
    '<input name="input_3" pattern="[a-z]{2}">', '<textarea name="input_3" readonly></textarea>',
    '<textarea name="input_3"></textarea><input type="password" name="pw">',
    '<textarea name="input_3"></textarea><div contenteditable="true"></div>',
    '<textarea name="input_3"></textarea><div class="gform_page"></div>',
  ];
  for (const fields of cases) await visit("/plain", async (page, policy) => {
    policy.freeze(); const result = await fillForm(page, (await detectForms(page))[0]!, config, newSubmissionId());
    expect(result.state).toBe("unsupported");
    expect(await page.locator('textarea,input:not([type=hidden])').evaluateAll(es => es.every(e => !(e as HTMLInputElement).value))).toBe(true);
  }, gf(1, fields));
});
test("no-helper blocks autonomous input/change GET/POST/image/navigation and sockets", async () => {
  const before = { writes, traps, sockets };
  const site = local(["/traps"], false, { page: "/traps", plugin: "gravity", id: 1 });
  const old = { token: process.env.FORM_TEST_TOKEN, address: process.env.FORM_TEST_ADDRESS };
  process.env.FORM_TEST_TOKEN = config.token; process.env.FORM_TEST_ADDRESS = config.address;
  try {
    const results = await scanPageForms(site, site.pages[0]!, { runDir });
    expect(results[0]?.outcome).toBe("not-verified");
  } finally { restore("FORM_TEST_TOKEN", old.token); restore("FORM_TEST_ADDRESS", old.address); }
  expect({ writes, traps, sockets }).toEqual(before);
});
function restore(name: string, value: string | undefined) { if (value === undefined) delete process.env[name]; else process.env[name] = value; }
test("specific new GF and associated FF confirmations; errors sanitized; no retry", async () => {
  for (const [path, expected] of [["/plain", "confirmed"], ["/ff", "confirmed"], ["/gf-ajax", "confirmed"], ["/save-trap", "failed"], ["/reject", "rejected"], ["/foreign", "failed"], ["/no-confirmation", "failed"], ["/stale", "failed"], ["/ff-stale", "failed"], ["/ff-foreign", "failed"]] as const) {
    await visit(path, async (page, policy) => {
      policy.freeze(); const prepared = await fillForm(page, (await detectForms(page))[0]!, config, newSubmissionId());
      expect(prepared.state).toBe("prepared"); if (prepared.state !== "prepared") return;
      const before = writes, chunksBefore = chunkReads;
      const result = await submitForm(page, prepared, policy, { timeoutMs: 600, redact });
      console.log(`Submission fixture ${path}: ${result.state}`);
      expect(result.state).toBe(expected); expect(writes - before).toBeLessThanOrEqual(1);
      if (path === '/save-trap') expect(writes).toBe(before);
      if (path === '/gf-ajax') expect(chunkReads - chunksBefore).toBe(1); // script only, never fetch/query serialization
      expect(redact(result.detail)).toBe(result.detail);
      if (path === "/reject") expect(result.detail).toContain("<token>");
    });
  }
});
test("marker changed after preparation is never submitted; native invalidity is rejection", async () => {
  await visit("/plain", async (page, policy) => {
    policy.freeze(); const p = await fillForm(page, (await detectForms(page))[0]!, config, newSubmissionId());
    if (p.state !== "prepared") throw new Error("not prepared");
    await page.locator('textarea').fill("changed"); const before = writes;
    expect((await submitForm(page, p, policy, { timeoutMs: 500, redact })).state).toBe("failed");
    expect(writes).toBe(before);
  });
  await visit("/plain", async (page, policy) => {
    policy.freeze(); const p = await fillForm(page, (await detectForms(page))[0]!, config, newSubmissionId());
    if (p.state !== "prepared") throw new Error("not prepared");
    await page.locator('[type=email]').evaluate((el: HTMLInputElement) => el.setCustomValidity("Refused " + el.value));
    const before = writes; const result = await submitForm(page, p, policy, { redact });
    expect(result.state).toBe("rejected"); expect(result.detail).not.toContain(config.address); expect(writes).toBe(before);
  });
});
test("scanner no forms is empty, navigation error is failed, CAPTCHA is not-verified, each designation is filled in its own scan", async () => {
  const site = local([], false, undefined);
  expect(await scanPageForms(site, { path: "/empty", mask: [] }, { runDir })).toEqual([]);
  expect((await scanPageForms(site, { path: "/missing", mask: [] }, { runDir }))[0]?.outcome).toBe("failed");
  expect(shape(await scanPageForms(local(["/captcha"], true, { page: "/captcha", plugin: "fluent", id: 2 }), { path: "/captcha", mask: [] }, { runDir }))).toEqual(["fluent:not-verified"]);
  await withEnv(fill, async () => {
    for (const [test_form, expected] of [
      [{ page: "/multi", plugin: "gravity", id: 1 }, ["gravity:not-verified", "gravity:skipped", "fluent:skipped", "unknown:skipped"]],
      [{ page: "/multi", plugin: "gravity", id: 3 }, ["gravity:skipped", "gravity:not-verified", "fluent:skipped", "unknown:skipped"]],
      [{ page: "/multi", plugin: "fluent", id: 2 }, ["gravity:skipped", "gravity:skipped", "fluent:not-verified", "unknown:skipped"]],
    ] as const) expect(shape(await scanPageForms(local(["/multi"], false, test_form), { path: "/multi", mask: [] }, { runDir }))).toEqual([...expected]);
  });
});
test("selected submit blocks unrelated same-origin writes/GETs and autonomous native GET submit", async () => {
  const before = traps;
  await visit('/autonomous', async page => { expect(await page.locator('form').count()).toBe(1); });
  await visit('/unrelated', async (page, policy) => {
    policy.freeze(); const p = await fillForm(page, (await detectForms(page))[0]!, config, newSubmissionId());
    if (p.state !== 'prepared') throw new Error('not prepared');
    const beforeWrites = writes;
    expect((await submitForm(page, p, policy, { timeoutMs: 1000, redact })).state).toBe('confirmed');
    expect(writes - beforeWrites).toBe(1);
  });
  expect(traps).toBe(before);
});

test("no-marker/unknown/upload requires no credentials; opted-in IMAP preflight happens before POST", async () => {
  const names = ['FORM_TEST_TOKEN', 'FORM_TEST_ADDRESS', 'IMAP_HOST'];
  const old = names.map(name => process.env[name]);
  // Each scan explicitly designates its form, so these reach the selected-form gates rather than a skip.
  const site = (path: string, plugin: TestForm['plugin'] = 'gravity', id = 1) => local([path], true, { page: path, plugin, id });
  const before = writes;
  try {
    names.forEach(name => delete process.env[name]);
    expect((await scanPageForms(site('/upload'), { path: '/upload', mask: [] }, { runDir }))[0]?.outcome).toBe('unsupported');
    expect((await scanPageForms(site('/ambiguous-ff', 'fluent', 2), { path: '/ambiguous-ff', mask: [] }, { runDir }))[0]?.outcome).toBe('unsupported');
    process.env.FORM_TEST_TOKEN = config.token; process.env.FORM_TEST_ADDRESS = config.address;
    expect((await scanPageForms(site('/constrained'), { path: '/constrained', mask: [] }, { runDir }))[0]?.outcome).toBe('unsupported');
    await expect(scanPageForms(site('/plain'), { path: '/plain', mask: [] }, { runDir })).rejects.toThrow('IMAP_HOST');
    expect(writes).toBe(before);
  } finally { names.forEach((name, i) => restore(name, old[i])); }
});

test("omitted designation skips every form, helper true or false, with no credentials, typing or POST", async () => {
  const before = { writes, traps };
  for (const helper of [true, false]) await withEnv({}, async () => {
    const { results, events } = await watched(local(["/scope-a"], helper, undefined), "/scope-a");
    expect(shape(results)).toEqual(allSkipped);
    expect(results.map(r => r.detail)).toEqual(Array(6).fill("No test form configured; not filled or submitted."));
    expect(events).toEqual([]);
    const site = local(["/scope-a", "/scope-b"], helper, undefined);
    const report = emptyReport(site);
    await populateForms([site], report, { runDir: join(runDir, `scope-omitted-${helper}`) });
    expect(report.sites[0]!.pages.map(p => shape(p.forms))).toEqual([allSkipped, allSkipped]);
    // Skips get no browser context at all: only the two discovery traces exist.
    expect((await readdir(join(runDir, `scope-omitted-${helper}`, "traces", "forms"))).map(f => f.replace(/^[0-9a-f]{20}-/, "")).sort()).toEqual(["scan.trace.zip", "scan.trace.zip"]);
  });
  expect({ writes, traps }).toEqual(before);
});

test("the designated form on the second listed page is the only attempt, in either page order", async () => {
  const test_form: TestForm = { page: "/scope-b", plugin: "gravity", id: 2 };
  for (const paths of [["/scope-a", "/scope-b"], ["/scope-b", "/scope-a"]]) await withEnv(mailbox, async () => {
    const site = local(paths, true, test_form);
    const report = emptyReport(site);
    const dir = join(runDir, `scope-${paths.join("").replaceAll("/", "")}`);
    const before = { writes, traps };
    await populateForms([site], report, { runDir: dir, deliveryTimeoutMs: 2_000 });
    const page = (path: string) => report.sites[0]!.pages.find(p => p.path === path)!.forms;
    expect(shape(page("/scope-a"))).toEqual(allSkipped);
    expect(page("/scope-a").every(f => f.detail === notDesignated)).toBe(true);
    expect(shape(page("/scope-b"))).toEqual(["gravity:skipped", "gravity:failed", "fluent:skipped", "unknown:skipped", "gravity:skipped", "gravity:skipped"]);
    const selected = page("/scope-b")[1]!;
    expect(selected.selector).toBe("#gform_2");
    // A real confirmed submission; the unreachable mailbox is reported, never inferred as delivery.
    expect(selected.detail).toMatch(/^Native Gravity Forms confirmation: GF accepted Submission [a-z0-9]{12}\. IMAP connect failed/);
    expect(writes - before.writes).toBe(1);
    expect(traps).toBe(before.traps);
    const traces = (await readdir(join(dir, "traces", "forms"))).map(f => f.replace(/^[0-9a-f]{20}-/, "")).sort();
    expect(traces).toEqual(["form-2.trace.zip", "scan.trace.zip", "scan.trace.zip"]);
  });
});

test("helper false fills only the designated plugin/id: same-number GF/FF differ, other forms get no events or POST", async () => {
  const before = { writes, traps };
  await withEnv(fill, async () => {
    for (const [test_form, index, form] of [
      [{ page: "/scope-a", plugin: "gravity", id: 2 }, 1, "form-1:gform_2"],
      [{ page: "/scope-a", plugin: "fluent", id: 2 }, 2, "form-2:fluentform_2"],
      [{ page: "/scope-a", plugin: "gravity", id: 1 }, 0, "form-0:gform_1"],
    ] as const) {
      const { results, events } = await watched(local(["/scope-a"], false, test_form), "/scope-a");
      expect(shape(results)).toEqual(allSkipped.map((s, i) => i === index ? s.replace("skipped", "not-verified") : s));
      expect(results[index]!.detail).toContain("Helper not enabled; filled without submission.");
      expect(results.filter((_, i) => i !== index).every(f => f.detail === notDesignated)).toBe(true);
      // Positive control: the recorder sees the designated form's typing, and nothing else.
      expect(events.length).toBeGreaterThan(0);
      expect(new Set(events.map(e => e.split(" ")[1]))).toEqual(new Set([form]));
    }
  });
  expect({ writes, traps }).toEqual(before);
});

test("missing, wrong-plugin, elsewhere-only, GF #0 and empty-page designations fail once on their page; scan failures stay scan failures", async () => {
  const before = writes;
  await withEnv({}, async () => {
    const cases: [TestForm, string[][]][] = [
      [{ page: "/scope-a", plugin: "gravity", id: 9 }, [[...allSkipped, "gravity:failed"], ["gravity:skipped"], []]],
      [{ page: "/scope-a", plugin: "fluent", id: 1 }, [[...allSkipped, "fluent:failed"], ["gravity:skipped"], []]],
      [{ page: "/scope-a", plugin: "gravity", id: 0 }, [[...allSkipped, "gravity:failed"], ["gravity:skipped"], []]],
      [{ page: "/plain", plugin: "fluent", id: 2 }, [allSkipped, ["gravity:skipped", "fluent:failed"], []]],
      [{ page: "/empty", plugin: "gravity", id: 1 }, [allSkipped, ["gravity:skipped"], ["gravity:failed"]]],
    ];
    for (const [test_form, expected] of cases) {
      // Helper true with no form/mail credentials: nothing selected, so nothing needs them.
      const site = local(["/scope-a", "/plain", "/empty"], true, test_form);
      const report = emptyReport(site);
      await populateForms([site], report, { runDir });
      const pages = report.sites[0]!.pages;
      expect(pages.map(p => shape(p.forms))).toEqual(expected);
      const target = pages.find(p => p.path === test_form.page)!.forms;
      expect(target.at(-1)).toEqual(missing(test_form.plugin, test_form.id));
      expect(pages.flatMap(p => p.forms).filter(f => f.outcome === "failed")).toHaveLength(1);
    }
    for (const path of ["/challenge", "/missing"]) {
      const site = local([path], true, { page: path, plugin: "gravity", id: 1 });
      const results = await scanPageForms(site, site.pages[0]!, { runDir });
      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({ selector: "page-scan", outcome: "failed" });
    }
  });
  expect(writes).toBe(before);
});

test("duplicate designated instances: only the first is attempted; rejected, unsupported and changed selections never fall through", async () => {
  await withEnv(mailbox, async () => {
    for (const [path, test_form, expected, posts, form] of [
      ["/duplicates", { page: "/duplicates", plugin: "gravity", id: 1 }, ["gravity:failed", "gravity:skipped"], 1, "form-0:gform_1"],
      ["/reject-duplicates", { page: "/reject-duplicates", plugin: "gravity", id: 1 }, ["gravity:rejected", "gravity:skipped"], 1, "form-0:gform_1"],
      ["/shifting", { page: "/shifting", plugin: "gravity", id: 1 }, ["gravity:failed", "gravity:skipped"], 0, null],
      ["/scope-a", { page: "/scope-a", plugin: "gravity", id: 5 }, ["gravity:skipped", "gravity:skipped", "fluent:skipped", "unknown:skipped", "gravity:unsupported", "gravity:skipped"], 0, null],
    ] as const) {
      const before = { writes, traps };
      const { results, events } = await watched(local([path], true, test_form), path);
      expect(shape(results)).toEqual([...expected]);
      expect(writes - before.writes).toBe(posts);
      expect(traps).toBe(before.traps);
      expect(new Set(events.map(e => e.split(" ")[1]))).toEqual(new Set(form ? [form] : []));
      const skipped = results.filter(r => r.outcome === "skipped");
      if (path === "/scope-a") expect(skipped.every(r => r.detail === notDesignated)).toBe(true);
      else expect(skipped.map(r => r.detail)).toEqual(["Duplicate of the designated test form (only the first is attempted); not filled or submitted."]);
      if (path === "/duplicates") expect(results[0]!.detail).toMatch(/Submission [a-z0-9]{12}\. IMAP connect failed/);
      if (path === "/shifting") expect(results[0]!.detail).toBe("Form identity changed since discovery; not submitted.");
      if (path === "/scope-a") expect(results[4]!.detail).toMatch(/password/);
    }
  });
});

test("distinct sites and a second invocation each keep their own single attempt", async () => {
  await withEnv(mailbox, async () => {
    const test_form: TestForm = { page: "/plain", plugin: "gravity", id: 1 };
    const sites = [local(["/plain"], true, test_form, "alpha"), local(["/plain"], true, test_form, "beta")];
    for (let invocation = 0; invocation < 2; invocation++) {
      const before = writes;
      const report = emptyReport(...sites);
      await populateForms(sites, report, { runDir, deliveryTimeoutMs: 2_000 });
      expect(report.sites.map(s => shape(s.pages[0]!.forms))).toEqual([["gravity:failed"], ["gravity:failed"]]);
      expect(report.sites.every(s => /Submission [a-z0-9]{12}\./.test(s.pages[0]!.forms[0]!.detail))).toBe(true);
      expect(writes - before).toBe(2);
    }
  });
});

test("encoded URLs and browser exceptions are scrubbed from retained action traces", async () => {
  await visit('/empty?private=' + encodeURIComponent(config.token), async page => {
    let thrown = false;
    try { await page.evaluate(s => { throw new Error(s); }, config.token + ' ' + JSON.stringify(config.address)); } catch { thrown = true; }
    expect(thrown).toBe(true);
  });
});

test("direct forms command writes a truthful local report without form credentials or visual/baseline access", async () => {
  const code = `const {runForms} = await import(${JSON.stringify(resolve('src/commands/forms.ts'))}); const {createStore} = await import(${JSON.stringify(resolve('src/store.ts'))}); const r = await runForms([{slug:'local',url:${JSON.stringify(base)},form_helper:true,mask:[],max_diff_pixel_ratio:0.01,pages:[{path:'/empty',mask:[]}]}],createStore(),{runsDir:${JSON.stringify(join(runDir, 'commands'))},log:()=>{}}); console.log(JSON.stringify({exitCode:r.exitCode,report:r.report,runDir:r.runDir,localPath:r.localPath}));`;
  const child = Bun.spawn([process.execPath, '--no-env-file', '-e', code], { cwd: runDir, env: { PATH: process.env.PATH!, HOME: process.env.HOME! }, stdout: 'pipe', stderr: 'pipe' });
  const [stdout, stderr, exit] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
  expect(exit).toBe(0); expect(stderr).toBe('');
  const result = JSON.parse(stdout);
  expect(result.exitCode).toBe(2); // Missing R2 config at publication, not browser/forms preflight.
  expect(result.report.mode).toBe('forms'); expect(result.report.sites[0].pages[0].forms).toEqual([]);
  expect(result.report.sites[0].pages[0].viewports).toBeUndefined();
  const files = await readdir(result.runDir, { recursive: true });
  expect(files).toContain('index.html'); expect(files).toContain('manifest.json');
  expect(files.some(p => /actual|baseline|diff|\\.png$/.test(p))).toBe(false);
  const manifest = await Bun.file(join(result.runDir, 'manifest.json')).json(); expect(manifest.command).toBe('forms');
});

test("retained action traces are secret-free with no image/DOM/source payloads", async () => {
  expect((await readdir(runDir)).some(p => p.endsWith('.trace.zip'))).toBe(true);
  expect(await findSecrets(runDir, redact)).toEqual([]);
  console.log(`Forms browser evidence: ${runDir}`);
});
