// Real WordPress Playground harness for plugin tests (plan D10–D12).
//
// startHarness() boots a disposable loopback WordPress (via playground.ts under Node) with the
// licensed Gravity Forms ZIP (GRAVITY_FORMS_ZIP) and Fluent Forms FF_VERSION from wordpress.org,
// installs the test-only mu-plugin, seeds native fixtures (fixtures.php) and returns a Harness:
//   url, token, versions, users, fixtures      site facts
//   php(code)                                   run PHP (after wp-load) via Playground's run() API; returns the code's JSON result
//   mail() / feeds() / siteverify()             final wp_mail arguments, native feed executions, siteverify calls
//   entries()                                   GF/FF entry counts and rows
//   queues() / drainQueues()                    native GF background / Action Scheduler / FF queue state; process it over HTTP
//   browser(name) / closeBrowser(context)       headless Chromium context with an action trace (no video/screenshots/snapshots)
//                                               and a request/response ledger (method, URL, status, resource type only)
//   uploadPlugin(page, zip)                     install + activate a plugin ZIP through wp-admin's upload form; its digest goes in the manifest
//   saveEvidence() / artifactDir                redacted mail/feed/entry/network logs, manifest and traces under artifacts/plugin/<run>/
//   stop()                                      close browser and Playground; idempotent
// Credential values (FORM_TEST_TOKEN, the GRAVITY_FORMS_ZIP path) are redacted from all retained output and errors.
import { createHash } from "node:crypto";
import { existsSync, statSync } from "node:fs";
import { mkdir, rename, writeFile } from "node:fs/promises";
import { basename, isAbsolute, join, relative, resolve } from "node:path";
import { chromium, type Browser, type BrowserContext, type Page, type Request } from "playwright";
import { redact, sanitizeZip } from "./artifacts";

export const FF_VERSION = "6.2.14";
export const WP_VERSION = "7.1.2";
export const PHP_VERSION = "8.3";

const ROOT = resolve(import.meta.dir, "../..");
const CACHE = join(ROOT, ".cache/plugin-test");
const MARK = "@@pirax-playground@@";
const RESULT = "@@pirax-result@@";

export interface MailRecord { to: string[]; subject: string; message: string; headers: string[]; attachments: string[]; request: string; time: number }
export interface FeedRecord { plugin: "gf" | "ff" | "gf-direct" | "ff-direct"; form: number; entry: number; feed: number; request: string; time: number }
export interface QueueState {
  gf: Record<string, { active: boolean; nonce: string }>;
  actionScheduler: { pending: number; running: number; nonce: string };
  ff: { statuses: Record<string, number>; nonce: string };
}
interface User { id?: number; login: string; password: string }

export interface Harness {
  url: string;
  token: string;
  artifactDir: string;
  versions: { gf: string; ff: string; wp: string; php: string };
  users: { admin: User; editor: User; subscriber: User };
  fixtures: {
    gf: number;
    ff: number;
    page: string;
    feeds: { gf: number };
    async: { gf: boolean };
    /** reCAPTCHA v2 forms (GF captcha field with honeypot abort; FF recaptcha element) on one page. */
    captcha: { gf: number; ff: number; page: string };
    /** GF form with a post field and FF payment form: side effects outside the feed paths. */
    unsupported: { gf: number; ff: number; page: string };
  };
  php<T = unknown>(code: string): Promise<T>;
  mail(): Promise<MailRecord[]>;
  feeds(): Promise<FeedRecord[]>;
  siteverify(): Promise<{ url: string; request: string }[]>;
  entries(): Promise<{ gf: number; ff: number; rows: { plugin: string; id: number; form: number; created: string }[] }>;
  queues(): Promise<QueueState>;
  drainQueues(maxRounds?: number): Promise<QueueState>;
  /** Make these scheduled WP-Cron hooks due (other due events move an hour later) and run them via a real wp-cron.php request. */
  runCron(hooks: string[]): Promise<void>;
  browser(name: string): Promise<{ context: BrowserContext; page: Page }>;
  closeBrowser(context: BrowserContext): Promise<string>;
  uploadPlugin(page: Page, zip: string): Promise<void>;
  saveEvidence(): Promise<{ trace?: string; redacted: number; files: string[] }>;
  stop(): Promise<void>;
}

/** Validate prerequisites; errors name the missing credential, never its value. */
export function preflight(env: Record<string, string | undefined> = process.env) {
  const problems: string[] = [];
  const gfZip = env.GRAVITY_FORMS_ZIP ?? "";
  const token = env.FORM_TEST_TOKEN ?? "";
  if (!gfZip) problems.push("GRAVITY_FORMS_ZIP is not set (absolute path to the licensed Gravity Forms ZIP)");
  else if (!isAbsolute(gfZip) || !existsSync(gfZip) || !statSync(gfZip).isFile())
    problems.push("GRAVITY_FORMS_ZIP does not name an existing absolute file");
  if (!token) problems.push("FORM_TEST_TOKEN is not set");
  for (const tool of ["node", "zip", "unzip"]) if (!Bun.which(tool)) problems.push(`required tool '${tool}' is not on PATH`);
  if (problems.length)
    throw new Error(
      `Plugin test prerequisites missing:\n- ${problems.join("\n- ")}\n` +
        "Run with bun --env-file=<registered repository>/.env; see plan D10.",
    );
  return { gfZip, token };
}

async function sh(cmd: string[]): Promise<string> {
  const proc = Bun.spawn(cmd, { stdout: "pipe", stderr: "pipe" });
  const [out, code] = await Promise.all([new Response(proc.stdout).text(), proc.exited]);
  if (code !== 0) throw new Error(`${cmd[0]} ${cmd[1]} exited ${code}`);
  return out;
}

async function pluginVersion(zip: string, file: string, label: string): Promise<string> {
  const header = await sh(["unzip", "-p", zip, file]).catch(() => "");
  const version = header.match(/^\s*\*?\s*Version:\s*(\S+)/m)?.[1];
  if (!version) throw new Error(`${label} does not contain ${file} with a Version header`);
  return version;
}

async function fluentFormsZip(): Promise<string> {
  const zip = join(CACHE, `fluentform.${FF_VERSION}.zip`);
  if (!existsSync(zip)) {
    await mkdir(CACHE, { recursive: true });
    const url = `https://downloads.wordpress.org/plugin/fluentform.${FF_VERSION}.zip`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Downloading Fluent Forms ${FF_VERSION} failed: HTTP ${response.status} from ${url}`);
    await Bun.write(`${zip}.part`, response);
    await rename(`${zip}.part`, zip);
  }
  const version = await pluginVersion(zip, "fluentform/fluentform.php", "Fluent Forms ZIP");
  if (version !== FF_VERSION) throw new Error(`Fluent Forms ZIP is ${version}, expected ${FF_VERSION}`);
  return zip;
}

async function eachLine(stream: ReadableStream<Uint8Array>, onLine: (line: string) => void) {
  let buffer = "";
  for await (const chunk of stream.pipeThrough(new TextDecoderStream())) {
    const lines = (buffer + chunk).split("\n");
    buffer = lines.pop()!;
    lines.forEach(onLine);
  }
  if (buffer) onLine(buffer);
}

/** Rejects after ms without keeping the process alive (unlike a pending Bun.sleep). */
const timeout = (ms: number, error: () => Error) =>
  new Promise<never>((_, reject) => setTimeout(() => reject(error()), ms).unref());

const sha256 = async (path: string) => createHash("sha256").update(await Bun.file(path).bytes()).digest("hex");

export async function startHarness({ run = "run" }: { run?: string } = {}): Promise<Harness> {
  const { gfZip, token } = preflight();
  const secrets = [token, gfZip];
  const clean = (text: string) => redact(text, secrets).text;
  const artifactDir = join(ROOT, "artifacts/plugin", `${run}-${new Date().toISOString().replace(/[:.]/g, "-")}`);
  await mkdir(artifactDir, { recursive: true });

  const [gfVersion, ffZip] = await Promise.all([
    pluginVersion(gfZip, "gravityforms/gravityforms.php", "GRAVITY_FORMS_ZIP"),
    fluentFormsZip(),
  ]);
  const versions = { gf: gfVersion, ff: FF_VERSION, wp: WP_VERSION, php: PHP_VERSION };

  // The child needs GRAVITY_FORMS_ZIP but never the token.
  const { FORM_TEST_TOKEN: _omit, ...childEnv } = process.env;
  const child = Bun.spawn(
    [
      "node",
      join(import.meta.dir, "playground.ts"),
      JSON.stringify({ ffZip, muPlugin: join(import.meta.dir, "mu-plugin.php"), wp: WP_VERSION, php: PHP_VERSION }),
    ],
    { cwd: ROOT, env: childEnv, stdin: "pipe", stdout: "pipe", stderr: "pipe" },
  );
  const killChild = () => child.kill("SIGKILL");
  process.once("exit", killChild);

  const log: string[] = [];
  const pending = new Map<number, (message: any) => void>();
  let ready!: (url: string) => void;
  const readyUrl = new Promise<string>((r) => (ready = r));
  const onLine = (line: string) => {
    if (!line.startsWith(MARK)) return void log.push(clean(line));
    const message = JSON.parse(line.slice(MARK.length));
    if (message.ready) ready(message.ready);
    else pending.get(message.id)?.(message), pending.delete(message.id);
  };
  const streams = Promise.all([eachLine(child.stdout, onLine), eachLine(child.stderr, (l) => log.push(clean(l)))]);
  const writeLog = () => writeFile(join(artifactDir, "playground.log"), log.join("\n") + "\n");
  const failure = (what: string) => new Error(`${what}\n--- playground.log (redacted, tail) ---\n${log.slice(-30).join("\n")}`);

  const url = await Promise.race([
    readyUrl,
    child.exited.then((code) => Promise.reject(failure(`Playground exited with code ${code} before it was ready`))),
    timeout(480_000, () => failure("Playground was not ready within 480s")),
  ]).catch(async (error) => {
    killChild();
    await writeLog();
    throw error;
  });

  let nextId = 1;
  // Playground's run() evaluates via a fixed /internal/eval.php, so concurrent calls corrupt each other: serialize.
  let phpQueue: Promise<unknown> = Promise.resolve();
  const php = <T,>(code: string, timeoutMs?: number): Promise<T> => {
    const result = phpQueue.then(() => runPhp<T>(code, timeoutMs));
    phpQueue = result.catch(() => {});
    return result;
  };
  const runPhp = async <T,>(code: string, timeoutMs = 120_000): Promise<T> => {
    const id = nextId++;
    const body = code.replace(/^\s*<\?php/, "");
    const wrapped =
      `<?php require '/wordpress/wp-load.php';\n` +
      `try { $pirax_result = (function () {\n${body}\n})(); echo "\\n${RESULT}" . wp_json_encode(['ok' => true, 'value' => $pirax_result]); }\n` +
      `catch (Throwable $e) { echo "\\n${RESULT}" . wp_json_encode(['ok' => false, 'error' => get_class($e) . ': ' . $e->getMessage()]); }`;
    const answer = new Promise<any>((r) => pending.set(id, r));
    child.stdin.write(JSON.stringify({ id, code: wrapped }) + "\n");
    child.stdin.flush();
    const message = await Promise.race([answer, timeout(timeoutMs, () => new Error(`PHP execution timed out after ${timeoutMs}ms`))]);
    if (message.error) throw new Error(clean(message.error));
    const text: string = message.text ?? "";
    const at = text.lastIndexOf(RESULT);
    if (at === -1)
      throw new Error(clean(`PHP execution failed (exit ${message.exitCode}): ${text.slice(-2000)}\n${message.errors ?? ""}`));
    const result = JSON.parse(text.slice(at + RESULT.length));
    if (!result.ok) throw new Error(clean(`PHP error: ${result.error}`));
    return result.value as T;
  };

  const readLog = <T,>(name: string) =>
    php<T[]>(`
      $file = WP_CONTENT_DIR . '/pirax-harness/${name}.jsonl';
      return file_exists($file) ? array_map(fn($l) => json_decode($l, true), file($file, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES)) : [];
    `);

  const fixtureData = await php<any>(await Bun.file(join(import.meta.dir, "fixtures.php")).text()).catch(async (error) => {
    killChild();
    await writeLog();
    throw error;
  });

  let browserPromise: Promise<Browser> | undefined;
  const traces = new Map<BrowserContext, string>();
  const closedTraces: string[] = [];
  let lastTrace: string | undefined;
  // Playwright records network in traces only together with DOM snapshots, which would retain typed
  // secrets (plan D11), so requests are ledgered separately. Listeners are synchronous: nothing can
  // still be pending when the context closes.
  const network: { context: string; method: string; url: string; status: number | null; type: string; failure?: string }[] = [];
  const scenarios: string[] = [];
  const uploads: { file: string; sha256: string }[] = [];
  let redacted = 0;
  let stopped = false;

  const queues = () =>
    php<QueueState>(`
      global $wpdb;
      $gf = [];
      $container = GFForms::get_service_container();
      $processors = array_map([$container, 'get'], ['notifications_processor', 'feeds_processor']); // GF_Background_Process_Service_Provider::NOTIFICATIONS / ::FEEDS
      // GF 3.x also runs each feed add-on's asynchronous feeds in its own processor.
      foreach (GFAddOn::get_registered_addons(true) as $addon) if ($addon instanceof GFFeedAddOn) $processors[] = gf_feed_processor($addon);
      foreach ($processors as $processor) {
        $identifier = (fn() => $this->identifier)->call($processor);
        $gf[$identifier] = ['active' => $processor->is_active(), 'nonce' => wp_create_nonce($identifier)];
      }
      // Only due actions: recurring maintenance actions scheduled in the future are not a backlog.
      $count = fn($status) => count(as_get_scheduled_actions(['status' => $status, 'date' => as_get_datetime_object(), 'date_compare' => '<=', 'per_page' => -1], 'ids'));
      $statuses = [];
      foreach ($wpdb->get_results("SELECT status, COUNT(*) AS n FROM {$wpdb->prefix}ff_scheduled_actions GROUP BY status") as $row) {
        $statuses[$row->status] = (int) $row->n;
      }
      return [
        'gf' => $gf,
        'actionScheduler' => [
          'pending' => $count(ActionScheduler_Store::STATUS_PENDING),
          'running' => $count(ActionScheduler_Store::STATUS_RUNNING),
          'nonce' => wp_create_nonce('as_async_request_queue_runner'),
        ],
        'ff' => ['statuses' => (object) $statuses, 'nonce' => wp_create_nonce('fluentform_background_process')],
      ];
    `);

  // Each native runner is invoked by its own anonymous admin-ajax request, as its loopback dispatch would.
  const ajax = async (action: string, nonce: string) => {
    const response = await fetch(`${url}/wp-admin/admin-ajax.php?action=${action}&nonce=${nonce}`, { method: "POST" });
    await response.text();
  };

  const h: Harness = {
    url,
    token,
    artifactDir,
    versions,
    users: { admin: { id: 1, login: "admin", password: "password" }, ...fixtureData.users },
    fixtures: (({ users: _users, ...fixtures }) => fixtures)(fixtureData),
    php: (code) => php(code),
    mail: () => readLog<MailRecord>("mail"),
    feeds: () => readLog<FeedRecord>("feeds"),
    siteverify: () => readLog<{ url: string; request: string }>("siteverify"),
    entries: () =>
      php(`
        global $wpdb;
        $gf = $wpdb->get_results("SELECT 'gf' AS plugin, id, form_id AS form, date_created AS created FROM {$wpdb->prefix}gf_entry", ARRAY_A);
        $ff = $wpdb->get_results("SELECT 'ff' AS plugin, id, form_id AS form, created_at AS created FROM {$wpdb->prefix}fluentform_submissions", ARRAY_A);
        $rows = array_map(fn($r) => ['id' => (int) $r['id'], 'form' => (int) $r['form']] + $r, array_merge($gf, $ff));
        return ['gf' => count($gf), 'ff' => count($ff), 'rows' => $rows];
      `),
    queues,
    async drainQueues(maxRounds = 10) {
      let state = await queues();
      for (let round = 0; round < maxRounds; round++) {
        const gfActive = Object.entries(state.gf).filter(([, p]) => p.active);
        const as = state.actionScheduler.pending + state.actionScheduler.running;
        // Only pending FF rows can be advanced by a runner. FF leaves a finished queued email job
        // 'processing' (its email action reports no result), and retries 'failed' rows on WP-Cron.
        const ffOpen = state.ff.statuses.pending ?? 0;
        if (!gfActive.length && !as && !ffOpen) return state;
        for (const [identifier, p] of gfActive) await ajax(identifier, p.nonce);
        if (as) await ajax("as_async_request_queue_runner", state.actionScheduler.nonce);
        else if (ffOpen) await ajax("fluentform_background_process", state.ff.nonce);
        state = await queues();
      }
      throw new Error(`Native queues still busy after ${maxRounds} rounds: ${clean(JSON.stringify({ ...state, gf: Object.fromEntries(Object.entries(state.gf).map(([k, v]) => [k, v.active])) }))}`);
    },
    async runCron(hooks) {
      const set = JSON.stringify(JSON.stringify(hooks));
      const missing = await php<string[]>(`
        $hooks = json_decode(${set}, true); $now = time(); $crons = []; $found = [];
        foreach (_get_cron_array() as $ts => $events) {
          foreach ($events as $hook => $instances) {
            $due = in_array($hook, $hooks, true);
            if ($due) $found[] = $hook;
            $at = $due ? $now - 1 : ($ts <= $now ? $now + HOUR_IN_SECONDS : $ts);
            foreach ($instances as $key => $event) $crons[$at][$hook][$key] = $event;
          }
        }
        ksort($crons);
        _set_cron_array($crons);
        delete_transient('doing_cron');
        return array_values(array_diff($hooks, $found));
      `);
      if (missing.length) throw new Error(`runCron: not scheduled: ${missing.join(", ")}`);
      const response = await fetch(`${url}/wp-cron.php`);
      await response.text();
      const stillDue = await php<string[]>(`
        $hooks = json_decode(${set}, true); $due = [];
        foreach (_get_cron_array() as $ts => $events) foreach ($events as $hook => $_) if ($ts <= time() - 1 && in_array($hook, $hooks, true)) $due[] = $hook;
        return $due;
      `);
      if (stillDue.length) throw new Error(`runCron: wp-cron.php did not run ${stillDue.join(", ")} (HTTP ${response.status})`);
    },
    async browser(name) {
      const browser = await (browserPromise ??= chromium.launch({ headless: true }));
      const context = await browser.newContext({ baseURL: url });
      scenarios.push(name);
      const entry = (r: Request) => ({ context: name, method: r.method(), url: r.url(), type: r.resourceType() });
      context.on("response", (r) => network.push({ ...entry(r.request()), status: r.status() }));
      context.on("requestfailed", (r) => network.push({ ...entry(r), status: null, failure: r.failure()?.errorText ?? "failed" }));
      // Screenshots/snapshots/sources would capture typed secrets in unscrubbable form (plan D11).
      await context.tracing.start({ name, title: name, screenshots: false, snapshots: false, sources: false });
      traces.set(context, join(artifactDir, `${name}.trace.zip`));
      return { context, page: await context.newPage() };
    },
    async closeBrowser(context) {
      const path = traces.get(context);
      if (!path) throw new Error("closeBrowser: context was not created by harness.browser()");
      traces.delete(context);
      await context.tracing.stop({ path });
      await context.close();
      redacted += await sanitizeZip(path, secrets);
      closedTraces.push(path);
      return (lastTrace = path);
    },
    async uploadPlugin(page, zip) {
      uploads.push({ file: zip.startsWith(ROOT) ? relative(ROOT, zip) : basename(zip), sha256: await sha256(zip) });
      await page.goto(`${url}/wp-admin/plugin-install.php?tab=upload`);
      await page.setInputFiles("#pluginzip", zip);
      await page.click("#install-plugin-submit");
      const activate = page.locator("#wpbody-content a.button-primary", { hasText: "Activate Plugin" });
      try {
        await activate.waitFor({ timeout: 60_000 });
      } catch {
        throw new Error(clean(`Plugin upload did not offer activation: ${(await page.locator("#wpbody-content").innerText()).slice(0, 1000)}`));
      }
      await activate.click();
      await page.waitForURL(/plugins\.php/);
      const notice = await page.locator("#message, .notice").first().innerText().catch(() => "");
      if (!/activated/i.test(notice)) throw new Error(clean(`Plugin activation not confirmed: ${notice.slice(0, 500)}`));
    },
    async saveEvidence() {
      const write = async (name: string, text: string) => {
        const result = redact(text, secrets);
        redacted += result.count;
        await writeFile(join(artifactDir, name), result.text);
        return name;
      };
      const [mail, feeds, entries] = await Promise.all([h.mail(), h.feeds(), h.entries()]);
      const jsonl = (rows: unknown[]) => rows.map((r) => JSON.stringify(r) + "\n").join("");
      const artifacts = {
        mail: await write("mail.jsonl", jsonl(mail)),
        feeds: await write("feeds.jsonl", jsonl(feeds)),
        entries: await write("entries.json", JSON.stringify(entries.rows, null, 2)),
        network: await write("network.jsonl", jsonl(network)),
        traces: closedTraces.map((t) => relative(artifactDir, t)),
      };
      const files = [artifacts.mail, artifacts.feeds, artifacts.entries, artifacts.network];
      files.push(
        await write(
          "manifest.json",
          JSON.stringify(
            {
              suite: run,
              scenarios,
              url,
              versions,
              fixtures: h.fixtures,
              zips: { gravityforms: await sha256(gfZip), fluentform: await sha256(ffZip) },
              uploads,
              artifacts,
            },
            null,
            2,
          ),
        ),
      );
      return { trace: lastTrace, redacted, files };
    },
    async stop() {
      if (stopped) return;
      stopped = true;
      for (const context of traces.keys()) await h.closeBrowser(context).catch(() => {});
      if (browserPromise) await (await browserPromise).close();
      child.stdin.end();
      await Promise.race([child.exited, timeout(30_000, () => new Error("Playground did not exit"))]).catch(killChild);
      await child.exited;
      await streams.catch(() => {});
      process.off("exit", killChild);
      await writeLog();
    },
  };
  return h;
}
