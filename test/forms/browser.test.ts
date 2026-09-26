import { afterAll, beforeAll, expect, setDefaultTimeout, test } from "bun:test";
import { chromium, type Browser } from "playwright";
import { resolve, join } from "node:path";
import { mkdir, readdir } from "node:fs/promises";
import { detectForms } from "../../src/forms/detect.ts";
import { fillForm, newSubmissionId } from "../../src/forms/fill.ts";
import { installFormPolicy, submitForm } from "../../src/forms/submit.ts";
import { scanPageForms } from "../../src/forms/runner.ts";
import { findSecrets, retainTrace, secretRedactor } from "../../src/forms/evidence.ts";

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
const server = Bun.serve({ hostname: "127.0.0.1", port: 0, async fetch(req, srv) {
  const url = new URL(req.url);
  if (url.pathname === "/socket") { sockets++; return srv.upgrade(req, { data: undefined }) ? undefined : new Response(); }
  if (url.pathname === "/trap") { traps++; return new Response("trap"); }
  if (url.pathname === gfChunk) { chunkReads++; return new Response('window.nativeChunkLoaded=true;', { headers: { 'content-type': 'text/javascript' } }); }
  if (req.method === "POST") {
    writes++;
    const data = await req.formData();
    if (url.pathname === "/reject") return html(`<div id="gform_wrapper_1"><div id="gform_1_validation_container">Refused ${config.token} ${encodeURIComponent(config.address)}</div></div>`, 400);
    if (url.pathname === "/foreign") return html('<div id="gform_confirmation_message_99">Wrong form</div>');
    if (url.pathname === "/no-confirmation") return html("HTTP 200 is not confirmation");
    return html(`<div id="gform_confirmation_message_${data.get("gform_submit")}">GF accepted</div>`);
  }
  switch (url.pathname) {
    case "/empty": return html("No forms");
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
    default: return html(gf());
  }
}, websocket: { message() {} } });
const base = `http://127.0.0.1:${server.port}`;
function html(body: string, status = 200) { return new Response(`<!doctype html><meta charset="utf-8">${body}`, { status, headers: { "content-type": "text/html" } }); }
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
  const site = { slug: "local", url: base, form_helper: false, mask: [], max_diff_pixel_ratio: 0.01, pages: [{ path: "/traps", mask: [] }] };
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
test("scanner no forms is empty, navigation error is failed, CAPTCHA is not-verified, later forms continue", async () => {
  const site = { slug: "local", url: base, form_helper: false, mask: [], max_diff_pixel_ratio: 0.01, pages: [] };
  expect(await scanPageForms(site, { path: "/empty", mask: [] }, { runDir })).toEqual([]);
  expect((await scanPageForms(site, { path: "/missing", mask: [] }, { runDir }))[0]?.outcome).toBe("failed");
  expect((await scanPageForms({ ...site, form_helper: true }, { path: "/captcha", mask: [] }, { runDir }))[0]?.outcome).toBe("not-verified");
  const old = { token: process.env.FORM_TEST_TOKEN, address: process.env.FORM_TEST_ADDRESS };
  process.env.FORM_TEST_TOKEN = config.token; process.env.FORM_TEST_ADDRESS = config.address;
  try { const results = await scanPageForms(site, { path: "/multi", mask: [] }, { runDir }); expect(results.map(r => r.outcome)).toEqual(["not-verified", "not-verified", "not-verified", "unsupported"]); }
  finally { restore("FORM_TEST_TOKEN", old.token); restore("FORM_TEST_ADDRESS", old.address); }
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
  const site = { slug: 'local', url: base, form_helper: true, mask: [], max_diff_pixel_ratio: 0.01, pages: [] };
  const before = writes;
  try {
    names.forEach(name => delete process.env[name]);
    expect((await scanPageForms(site, { path: '/upload', mask: [] }, { runDir }))[0]?.outcome).toBe('unsupported');
    expect((await scanPageForms(site, { path: '/ambiguous-ff', mask: [] }, { runDir }))[0]?.outcome).toBe('unsupported');
    process.env.FORM_TEST_TOKEN = config.token; process.env.FORM_TEST_ADDRESS = config.address;
    expect((await scanPageForms(site, { path: '/constrained', mask: [] }, { runDir }))[0]?.outcome).toBe('unsupported');
    await expect(scanPageForms(site, { path: '/plain', mask: [] }, { runDir })).rejects.toThrow('IMAP_HOST');
    expect(writes).toBe(before);
  } finally { names.forEach((name, i) => restore(name, old[i])); }
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
