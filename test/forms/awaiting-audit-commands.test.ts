import { expect, setDefaultTimeout, test } from "bun:test";
import { mkdirSync } from "node:fs";
import { copyFile, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, relative, resolve } from "node:path";
import type { Socket } from "node:net";
import { ImapFlow } from "imapflow";
import { chromium, type Browser } from "playwright";
import { runBaseline } from "../../src/commands/baseline.ts";
import { runCheck } from "../../src/commands/check.ts";
import { runForms } from "../../src/commands/forms.ts";
import { awaitingAuditKey } from "../../src/forms/awaiting-audit.ts";
import { findSecrets, retainTrace, secretRedactor, type Redactor } from "../../src/forms/evidence.ts";
import { reportStatus } from "../../src/report/html.ts";
import { parsePublishedManifest } from "../../src/report/manifest.ts";
import type { AnyRunReport, FormResult } from "../../src/report/model.ts";
import type { Site, TestForm } from "../../src/sites.ts";
import { createStore } from "../../src/store.ts";

// Checker behavior evidence only: loopback GF/FF fixtures render the helper's locked refusal text into
// production commands with a real scoped Store. Not evidence that a released helper emits that text.
setDefaultTimeout(900_000);
const awaiting = "Pirax test blocked: awaiting audit of ";
const synthetic = { FORM_TEST_TOKEN: "fixture-Commands+Token/=456", FORM_TEST_ADDRESS: "checker+commands@example.test", IMAP_HOST: "127.0.0.1", IMAP_USER: "fixture-imap-user", IMAP_PASSWORD: "fixture-imap-password", IMAP_FOLDER: "Tests", IMAP_SPAM_FOLDER: "Spam" };

// Mutable fixture behavior; page HTML is static so visual baselines stay stable.
let reply: "awaiting" | "generic" | "confirm" = "awaiting", version = "Fluent Forms Pro 6.2.16", posts = 0;
const gf = (id: number) => `<div class="gform_wrapper" id="gform_wrapper_${id}"><form id="gform_${id}" method="post"><input type="hidden" name="gform_submit" value="${id}"><input name="input_1"><textarea name="input_3"></textarea><button type="submit">Send</button></form></div>`;
const ff = `<div class="fluentform"><form class="frm-fluent-form" id="fluentform_2" data-form_id="2"><input name="email" type="email"><textarea name="message"></textarea><button type="submit">Send</button></form></div>`;
const ffScript = `<script>document.querySelector('#fluentform_2').onsubmit=async e=>{e.preventDefault();const form=e.target;const r=await fetch('/wp-admin/admin-ajax.php?t='+Date.now(),{method:'POST',body:new URLSearchParams({action:'fluentform_submit',form_id:'2',data:new URLSearchParams(new FormData(form)).toString()})});const j=await r.json();form.parentElement.insertAdjacentHTML('beforeend',j.success?'<div class="ff-message-success">FF accepted</div>':'<div class="ff-errors-in-stack"><div class="error text-danger" role="alert"><span class="error-text">'+j.message+'</span></div></div>')};</script>`;
const refusal = () => reply === "generic" ? "Pirax test blocked: integrations could not be suppressed" : awaiting + version;
const html = (body: string) => new Response(`<!doctype html><meta charset="utf-8"><title>Fixture</title>${body}`, { headers: { "content-type": "text/html" } });
// Started, with the mailbox listener and ImapFlow observer, only inside the test's cleanup protection.
const fixture = async (req: Request) => {
  const url = new URL(req.url);
  if (req.method === "POST") {
    posts++;
    if (url.pathname === "/wp-admin/admin-ajax.php") return Response.json(reply === "confirm" ? { success: true } : { success: false, message: refusal() });
    const id = (await req.formData()).get("gform_submit");
    return reply === "confirm" ? html(`<div id="gform_confirmation_message_${id}">GF accepted</div>`)
      : html(`<div class="gform_wrapper" id="gform_wrapper_${id}"><div class="gform_validation_errors" id="gform_${id}_validation_container"><h2 class="gform_submission_error">There was a problem with your submission.</h2></div><p class="pirax-form-test-rejected">${refusal()}</p></div>`);
  }
  // The designated GF #1 is followed by a skipped duplicate and an undesignated FF; /other is all skipped.
  if (url.pathname === "/gf/") return html(gf(1) + gf(1) + ff);
  if (url.pathname === "/ff/") return html(ff + gf(1) + ffScript);
  if (url.pathname === "/other/") return html(gf(3) + gf(4));
  if (url.pathname === "/empty/") return html("<p>No forms</p>");
  if (url.pathname === "/favicon.ico") return new Response(null, { status: 204 });
  return new Response("missing", { status: 404 });
};
let base = "";
// A real loopback mailbox listener. A local desktop service also probes listeners (see imap.test.ts), so a
// connection counts as the checker's only when its peer port is a local port of the installed ImapFlow
// client's socket; connect() is observed, not replaced. Foreign probes are recorded, not asserted.
const peers: number[] = [], clientPorts = new Set<number>();
let clientConnects = 0;
const observe = (connect: ImapFlow["connect"]): ImapFlow["connect"] => function (this: ImapFlow) {
  clientConnects++;
  const result = connect.call(this);
  const socket = (this as unknown as { socket?: Socket }).socket;
  socket?.once("connect", () => { if (socket.localPort) clientPorts.add(socket.localPort); });
  return result;
};
const owned = () => peers.filter(p => clientPorts.has(p)).length;

const designate = (plugin: TestForm["plugin"], page = plugin === "gravity" ? "/gf/" : "/ff/"): TestForm => ({ page, plugin, id: plugin === "gravity" ? 1 : 2 });
const site = (slug: string, paths: string[], test_form?: TestForm, form_helper = true): Site =>
  ({ slug, url: base, form_helper, mask: [], max_diff_pixel_ratio: 0.01, pages: paths.map(path => ({ path, mask: [] })), ...(test_form ? { test_form } : {}) });
const shape = (report: AnyRunReport) => report.sites.flatMap(s => s.pages.map(p => (p.forms ?? []).map(f => `${f.plugin}:${f.outcome}`).join(",")));
/** findSecrets per retained file, except visual capture traces, which keep screenshots/snapshots by design. */
async function scan(dir: string, redact: Redactor) {
  const hits: string[] = [];
  let captureTraces = 0;
  for (const [i, file] of (await readdir(dir, { recursive: true, withFileTypes: true })).filter(e => e.isFile()).map(e => join(e.parentPath, e.name)).entries()) {
    if (/\/traces\/(?!forms\/)[^/]+\/(desktop|mobile)\/[^/]+\.trace\.zip$/.test(file)) { captureTraces++; continue; }
    if (redact(relative(dir, file)) !== relative(dir, file)) hits.push(`file-${i}:name`);
    const one = await mkdtemp(join(tmpdir(), "awaiting-scan-"));
    try { await copyFile(file, join(one, basename(file))); hits.push(...(await findSecrets(one, redact)).map(h => `file-${i}:${h}`)); }
    finally { await rm(one, { recursive: true, force: true }); }
  }
  return { hits, captureTraces };
}
const designated = (report: AnyRunReport): FormResult => report.sites.flatMap(s => s.pages.flatMap(p => p.forms ?? [])).find(f => f.outcome !== "skipped")!;

test("production forms/check age, escalate, share and clear the awaiting-audit clock against real scoped R2", async () => {
  const dir = resolve("runs", `forms-awaiting-commands-${crypto.randomUUID()}`);
  const root = `test/forms-awaiting-audit-commands-${new Date().toISOString().replaceAll(":", "-")}-${crypto.randomUUID().slice(0, 8)}/`;
  const real = createStore({ root });
  const key = awaitingAuditKey("awaiting-a"), other = awaitingAuditKey("awaiting-b");
  const stored = async (k = key) => ((await real.list(k)).includes(k) ? new TextDecoder().decode(await real.get(k)) : null);
  const seed = (ms: number, k = key) => real.put(k, new Blob([JSON.stringify({ firstSeen: new Date(ms).toISOString() })], { type: "application/json" }));
  const evidence: Record<string, any> = { note: "Checker behavior evidence from loopback fixtures; not released-helper audit evidence.", root, directory: dir, scenarios: {} };
  const names = Object.keys(synthetic).concat("IMAP_PORT");
  const saved = names.map(n => process.env[n]);
  const connect = ImapFlow.prototype.connect;
  let server: ReturnType<typeof Bun.serve> | undefined, mailbox: Bun.TCPSocketListener<undefined> | undefined, browser: Browser | undefined;
  let n = 0;
  /** One production invocation; retains safe facts and renders the fetched remote and local report bodies. */
  async function run(name: string, command: "forms" | "check" | "baseline", sites: Site[], expected: { exit: 0 | 1; status?: string; texts?: string[] }) {
    const before = { posts, owned: owned(), clientConnects, peers: peers.length };
    const logs: string[] = [];
    const runsDir = join(dir, `${String(++n).padStart(2, "0")}-${name}`);
    const options = { runsDir, log: (l: string) => logs.push(l), forms: { submissionTimeoutMs: 10_000, deliveryTimeoutMs: 2_000 } };
    const result = command === "forms" ? await runForms(sites, createStore({ root }), options) : command === "check" ? await runCheck(sites, createStore({ root }), options) : await runBaseline(sites, createStore({ root }), options);
    const facts: Record<string, any> = { command, exitCode: result.exitCode, runDir: result.runDir, posts: posts - before.posts, mailboxConnections: owned() - before.owned, imapClientConnects: clientConnects - before.clientConnects, foreignProbes: peers.length - before.peers - (owned() - before.owned), logs };
    evidence.scenarios[name] = facts; // Never the returned bearer URL.
    expect(`${name}: ${result.exitCode}`).toBe(`${name}: ${expected.exit}`);
    if (command === "baseline") return result;
    const report = result.report!;
    facts.shape = shape(report); facts.designated = designated(report); facts.localPath = result.localPath; facts.status = reportStatus(report);
    if (expected.status) expect(facts.status).toBe(expected.status);
    // Otherwise healthy, unchanged captures: only the forms result decides a check's status and exit.
    if (command === "check") for (const p of result.report!.sites[0]!.pages) for (const v of Object.values((p as any).viewports) as any[])
      expect({ capture: v.capture.state, visual: v.visual.state, health: v.health, warnings: v.warnings }).toEqual({ capture: "captured", visual: "same", health: [], warnings: [] });
    const remote = parsePublishedManifest(JSON.parse(new TextDecoder().decode(await real.get(`reports/${report.runId}/manifest.json`))), report.runId);
    expect(remote.report).toEqual(report);
    const bodies = { remote: new TextDecoder().decode(await real.get(`reports/${report.runId}/index.html`)), local: await Bun.file(result.localPath!).text() };
    const context = await browser!.newContext();
    const requests: string[] = [];
    await context.tracing.start({ screenshots: false, snapshots: false, sources: false });
    try {
      const page = await context.newPage();
      page.on("request", r => { if (/^https?:/.test(r.url())) requests.push(r.url()); });
      for (const [label, body] of Object.entries(bodies)) {
        await page.setContent(body);
        const text = await page.locator("body").innerText();
        for (const t of [`awaiting-a — ${facts.status}`, ...expected.texts ?? []]) expect(`${name} ${label} shows ${t}: ${text.includes(t)}`).toBe(`${name} ${label} shows ${t}: true`);
      }
      expect(requests).toEqual([]);
    } finally { await retainTrace(context, join(runsDir, "report-render.trace.zip"), secretRedactor()); await context.close(); }
    facts.renderTrace = join(runsDir, "report-render.trace.zip");
    return result;
  }
  try {
    server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: fixture });
    base = `http://127.0.0.1:${server.port}`;
    const listener = mailbox = Bun.listen<undefined>({ hostname: "127.0.0.1", port: 0, socket: { open(s) { peers.push(s.remotePort); s.end(); }, data() {} } });
    ImapFlow.prototype.connect = observe(connect);
    Object.assign(process.env, synthetic, { IMAP_PORT: String(listener.port) });
    browser = await chromium.launch({ headless: true });
    await seed(Date.UTC(2026, 0, 1), other);
    const otherBytes = await stored(other);
    const a = (paths: string[], test_form?: TestForm, helper?: boolean) => site("awaiting-a", paths, test_form, helper);
    const gfSite = a(["/other/", "/gf/"], designate("gravity"));

    // First sighting through production forms: warning exit 0, one POST, no mailbox connection, real object.
    const start = Date.now();
    const first = await run("forms-first", "forms", [gfSite, site("awaiting-b", ["/empty/"])], { exit: 0, status: "warning", texts: ["awaiting-audit", awaiting + version, "fails after 72 hours"] });
    expect(evidence.scenarios["forms-first"].shape).toEqual(["gravity:skipped,gravity:skipped", "gravity:awaiting-audit,gravity:skipped,fluent:skipped", ""]);
    const firstSeen = await stored();
    expect(Date.parse(JSON.parse(firstSeen!).firstSeen)).toBeGreaterThanOrEqual(start);
    expect(first.report!.sites[0]!.pages[1]!.forms![0]!.detail).toContain(JSON.parse(firstSeen!).firstSeen);
    // awaiting-b's own completed pass had no awaiting result, so it cleared; reseed it as the isolation sentinel.
    expect(await stored(other)).toBeNull();
    await seed(Date.UTC(2026, 0, 1), other);

    // Fresh Store/run, reversed page order, then a mode/plugin/version switch (FF) and check: same clock.
    await run("forms-repeat-reversed", "forms", [a(["/gf/", "/other/"], designate("gravity"))], { exit: 0, status: "warning" });
    expect(await stored()).toBe(firstSeen);
    version = "Fluent Forms Pro 6.2.17, FluentSMTP 2.4.2";
    await run("forms-ff-new-version", "forms", [a(["/other/", "/ff/"], designate("fluent"))], { exit: 0, status: "warning", texts: [awaiting + version] });
    expect(evidence.scenarios["forms-ff-new-version"].shape).toEqual(["gravity:skipped,gravity:skipped", "fluent:awaiting-audit,gravity:skipped"]);
    expect(await stored()).toBe(firstSeen);
    await run("baseline", "baseline", [gfSite], { exit: 0 });
    await run("check-warning", "check", [gfSite], { exit: 0, status: "warning", texts: ["awaiting-audit", awaiting + version] });
    expect(await stored()).toBe(firstSeen);

    // Comfortably old clock: both commands fail with version and elapsed detail; repeats never reset it.
    const old = Date.now() - 100 * 60 * 60 * 1000;
    await seed(old);
    const oldBytes = await stored();
    for (const [name, command] of [["forms-escalated", "forms"], ["forms-escalated-repeat", "forms"], ["check-escalated", "check"]] as const) {
      const r = await run(name, command, [gfSite], { exit: 1, status: "failure", texts: [awaiting + version, "exceeding the threshold of 72 hours"] });
      const row = designated(r.report!);
      expect(row.outcome).toBe("failed");
      expect(row.detail).toContain(`Awaiting audit for 4d 4h `);
      expect(row.detail).toContain(new Date(old).toISOString());
      expect(await stored()).toBe(oldBytes);
    }

    // Every non-awaiting completed pass clears only this site; the next awaiting sighting starts fresh.
    const clears: Record<string, [Site, 0 | 1, string]> = {
      "normal-rejection": [gfSite, 1, "gravity:skipped,gravity:skipped|gravity:rejected,gravity:skipped,fluent:skipped"],
      "confirmed-undelivered": [gfSite, 1, "gravity:skipped,gravity:skipped|gravity:failed,gravity:skipped,fluent:skipped"],
      "helper-false": [a(["/gf/"], designate("gravity"), false), 0, "gravity:not-verified,gravity:skipped,fluent:skipped"],
      "no-designation": [a(["/gf/"]), 0, "gravity:skipped,gravity:skipped,fluent:skipped"],
      "empty-scan": [a(["/empty/"]), 0, ""],
    };
    for (const [name, [s, exit, shown]] of Object.entries(clears)) {
      await seed(old);
      reply = name === "normal-rejection" ? "generic" : name === "confirmed-undelivered" ? "confirm" : "awaiting";
      const r = await run(`clear-${name}`, "forms", [s], { exit });
      expect(shape(r.report!).join("|")).toBe(shown);
      expect(await stored()).toBeNull();
      expect(await stored(other)).toBe(otherBytes);
    }
    reply = "awaiting";
    const restart = Date.now();
    await run("check-fresh-after-clear", "check", [gfSite], { exit: 0, status: "warning" });
    expect(Date.parse(JSON.parse((await stored())!).firstSeen)).toBeGreaterThanOrEqual(restart);

    // One native POST per designated attempt; only the confirmed submission ever touched the mailbox.
    const s = evidence.scenarios;
    for (const [name, f] of Object.entries<any>(s)) {
      expect(`${name}: ${f.posts}`).toBe(`${name}: ${["baseline", "clear-helper-false", "clear-no-designation", "clear-empty-scan"].includes(name) ? 0 : 1}`);
      const mailed = name === "clear-confirmed-undelivered";
      expect(`${name}: ${f.mailboxConnections > 0} ${f.imapClientConnects > 0}`).toBe(`${name}: ${mailed} ${mailed}`);
    }
    expect(await stored(other)).toBe(otherBytes);
    const fixturePrivacy = await scan(dir, secretRedactor(synthetic.FORM_TEST_TOKEN, [synthetic.FORM_TEST_ADDRESS, synthetic.IMAP_USER, synthetic.IMAP_PASSWORD]));
    evidence.privacy = { fixtureHits: fixturePrivacy.hits, skippedCaptureTraces: fixturePrivacy.captureTraces };
    expect(fixturePrivacy.hits).toEqual([]);
    expect(fixturePrivacy.captureTraces).toBeGreaterThan(0);
  } finally {
    // Synchronous restoration first, so no later cleanup failure can leave a patched client or changed environment.
    ImapFlow.prototype.connect = connect;
    names.forEach((name, i) => { if (saved[i] === undefined) delete process.env[name]; else process.env[name] = saved[i]; });
    server?.stop(true); mailbox?.stop(true);
    try { await browser?.close(); }
    finally {
      let deleted = 0;
      for (const k of await real.list("")) { await real.delete(k); deleted++; }
      const remaining = await real.list("");
      evidence.cleanup = { deleted, remaining: remaining.length };
      mkdirSync(dir, { recursive: true });
      await Bun.write(join(dir, "summary.json"), JSON.stringify(evidence, null, 2) + "\n");
      console.log(`Awaiting-audit command evidence: ${join(dir, "summary.json")}`);
      expect(remaining).toEqual([]);
    }
  }
  // Real credentials restored: no environment value leaked into retained evidence.
  expect((await scan(dir, secretRedactor())).hits).toEqual([]);
});
