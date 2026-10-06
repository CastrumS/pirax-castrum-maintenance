// Re-audit acquisition (plan D3/D4): resolve all five latest versions and, on a change, download all five
// packages with HTTPS/size/time bounds, main-file Version and SHA-256 checks. Paid versions and packages come
// only from GPL Vault's official updater, running in a throwaway Playground (gplvault-playground.ts) during
// one license activation that this parent always deactivates and confirms. Private package URLs, raw
// responses and credentials never leave this module: results carry versions, digests, paths and safe counts.
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rename, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { PHP_VERSION, WP_VERSION } from "../../test/plugin/harness";
import {
  assembleLatest,
  compareMatrix,
  FREE_KEYS,
  PAID_KEYS,
  parseCatalog,
  parseWordpressOrgInfo,
  PLUGINS,
  ReauditError,
  validateVersions,
  type AuditedVersions,
  type PinKey,
} from "./detect";

const ROOT = resolve(import.meta.dir, "../..");
/** The harness's version-keyed wordpress.org cache (test/plugin/harness.ts reads `<slug>.<version>.zip` here). */
export const CACHE = join(ROOT, ".cache/plugin-test");
export const CIPHERTEXT = join(ROOT, ".github/audit/gplvault-updater.zip.gpg");
const UPDATER_MAIN = "gplvault-updater/gplvault-updater.php";
const MARK = "@@pirax-gplvault@@";
const RESULT = "@@pirax-result@@";
const MAX_JSON = 2 * 2 ** 20;
const MAX_ZIP = 64 * 2 ** 20;

type Env = Record<string, string | undefined>;
type Fetch = (url: string, init: RequestInit) => Promise<Response>;

/** The official client's steps, as the parent drives them. Answers are reduced to safe facts in PHP. */
export interface Vault {
  status(): Promise<{ activated: boolean; remaining: number | null }>;
  activate(): Promise<{ activated: boolean; remaining: number | null }>;
  /** Native WordPress self-update of gplvault-updater, then a fresh request reporting the loaded version. */
  selfUpdate(): Promise<{ before: string; after: string }>;
  /** schema() with gplvault_schema_payload listing the two paid main files at these versions; `{main, product_id, version}[]`. */
  catalog(pins: { gf: string; ff_pro: string }): Promise<unknown>;
  /** download(['product_id' => item]): the private package URL, or "" when refused. */
  download(item: number): Promise<string>;
  deactivate(): Promise<{ deactivated: boolean }>;
  close(): Promise<void>;
}
export type OpenVault = (options: { directory: string; env: Env }) => Promise<Vault>;

export interface Package {
  version: string;
  sha256: string;
  /** Absolute path: free packages in the harness cache, paid ones in the caller's private directory. */
  path: string;
}
export interface Lifecycle {
  /** Set before the activation request: a lost answer can still consume a seat. */
  activationAttempted: boolean;
  activationConfirmed: boolean;
  deactivationAttempted: boolean;
  /** The official status() reports this instance inactive after deactivate() (or deactivate() said so when status is unreachable). */
  deactivationConfirmed: boolean;
  /** activations_remaining from status() before activation and after deactivation, when the client exposes it. */
  remainingBefore: number | null;
  remainingAfter: number | null;
  updater: { before: string; after: string } | null;
}
export type Acquisition =
  | { status: "unchanged"; versions: AuditedVersions; packages: null; lifecycle: Lifecycle }
  | { status: "changed"; versions: AuditedVersions; changed: PinKey[]; packages: Record<PinKey, Package>; lifecycle: Lifecycle };

const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const count = (value: unknown) => (Number.isSafeInteger(value) && (value as number) >= 0 ? (value as number) : null);
const pick = (env: Env, names: string[]) =>
  Object.fromEntries(names.flatMap((n) => (env[n] === undefined ? [] : [[n, env[n]!]]))) as Record<string, string>;
const timeout = (ms: number) => new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), ms).unref());

/** The Playground child's whole environment: the license inputs, the decrypted ZIP path, PATH and HOME. */
export const vaultChildEnv = (env: Env, updaterZip: string): Record<string, string> => ({
  ...pick(env, ["PATH", "HOME", "GPLVAULT_LICENSE_KEY", "GPLVAULT_PRODUCT_ID"]),
  PIRAX_GPLVAULT_UPDATER_ZIP: updaterZip,
});

/** A plugin main file's Version header from ZIP bytes (unzip reads stdin), or undefined. */
export async function zipVersion(bytes: Uint8Array, main: string): Promise<string | undefined> {
  const proc = Bun.spawn(["unzip", "-p", "/dev/stdin", main], { stdin: bytes, stdout: "pipe", stderr: "ignore", env: pick(process.env, ["PATH"]) });
  const [header, code] = await Promise.all([new Response(proc.stdout).text(), proc.exited]);
  return code === 0 ? header.match(/^\s*\*?\s*Version:\s*(\S+)/m)?.[1] : undefined;
}

/** Symmetric gpg with the passphrase on stdin (never argv) in a throwaway GNUPGHOME without a passphrase cache. */
export async function gpg(args: string[], passphrase: string, stage: string) {
  const home = await mkdtemp(join(tmpdir(), "pirax-gnupg-"));
  try {
    const proc = Bun.spawn(
      ["gpg", "--batch", "--yes", "--quiet", "--no-symkey-cache", "--pinentry-mode", "loopback", "--passphrase-fd", "0", ...args],
      { stdin: new Blob([passphrase]), stdout: "ignore", stderr: "ignore", env: { ...pick(process.env, ["PATH"]), GNUPGHOME: home } },
    );
    if ((await proc.exited) !== 0) throw new ReauditError(stage, "updater", "failed");
  } finally {
    await Bun.spawn(["gpgconf", "--homedir", home, "--kill", "all"], { stdout: "ignore", stderr: "ignore", env: pick(process.env, ["PATH"]) }).exited;
    await rm(home, { recursive: true, force: true });
  }
}

export async function decryptUpdater(ciphertext: string, out: string, passphrase: string) {
  await gpg(["--output", out, "--decrypt", ciphertext], passphrase, "decrypt").catch(async (error) => {
    await rm(out, { force: true });
    throw error;
  });
}

/** Bounded HTTPS GET without redirects; failures name the stage and key only. */
async function get(fetcher: Fetch, url: string, stage: string, key: string, max: number, ms: number): Promise<Uint8Array> {
  if (!URL.canParse(url) || new URL(url).protocol !== "https:") throw new ReauditError(stage, key, "url malformed");
  let response: Response;
  try {
    response = await fetcher(url, { redirect: "error", signal: AbortSignal.timeout(ms) });
  } catch {
    throw new ReauditError(stage, key, "failed");
  }
  const oversize = new ReauditError(stage, key, "oversize");
  if (response.status !== 200 || Number(response.headers.get("content-length") ?? 0) > max) {
    await response.body?.cancel().catch(() => {});
    throw response.status !== 200 ? new ReauditError(stage, key, "status") : oversize;
  }
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for await (const chunk of response.body ?? []) {
      if ((size += chunk.byteLength) > max) throw oversize;
      chunks.push(chunk);
    }
  } catch (error) {
    throw error === oversize ? oversize : new ReauditError(stage, key, "failed");
  }
  return Buffer.concat(chunks);
}

/** Download, check the main-file Version, then atomically place the verified bytes at `path`. */
async function fetchPackage(fetcher: Fetch, key: PinKey, url: string, version: string, path: string): Promise<Package> {
  const bytes = await get(fetcher, url, "download", key, MAX_ZIP, 300_000);
  const found = await zipVersion(bytes, PLUGINS[key].main);
  if (!found) throw new ReauditError("download", key, "version unreadable");
  if (found !== version) throw new ReauditError("download", key, "version mismatch");
  await mkdir(dirname(path), { recursive: true });
  await Bun.write(`${path}.part`, bytes);
  await rename(`${path}.part`, path);
  return { version, sha256: sha256(bytes), path };
}

/**
 * Resolve the five latest versions and, when any differs from `pins`, acquire all five packages, within one
 * official GPL Vault activation that is always deactivated. Throws ReauditError (with `.lifecycle`) on any
 * failure, including an unconfirmed deactivation after an otherwise successful run; nothing partial is returned.
 * `env` needs GPLVAULT_LICENSE_KEY, GPLVAULT_PRODUCT_ID and (for the official vault) GPLVAULT_UPDATER_PASSPHRASE.
 * `fetch`/`openVault`/`cache` exist for fixture tests; production uses the defaults.
 */
export async function acquirePackages({
  pins,
  directory,
  env = process.env,
  cache = CACHE,
  fetch: fetcher = fetch,
  openVault = openOfficialVault,
}: {
  pins: AuditedVersions;
  /** Private scratch for the decrypted updater and paid ZIPs; never an artifact directory. */
  directory: string;
  env?: Env;
  cache?: string;
  fetch?: Fetch;
  openVault?: OpenVault;
}): Promise<Acquisition> {
  pins = validateVersions(pins, "pins");
  for (const name of ["GPLVAULT_LICENSE_KEY", "GPLVAULT_PRODUCT_ID"]) if (!env[name]) throw new ReauditError("environment", name, "missing");
  directory = resolve(directory);

  const lifecycle: Lifecycle = {
    activationAttempted: false,
    activationConfirmed: false,
    deactivationAttempted: false,
    deactivationConfirmed: false,
    remainingBefore: null,
    remainingAfter: null,
    updater: null,
  };
  // A catchable signal rejects the pending step so `finally` can still deactivate; handlers stay until the end,
  // so a repeated signal cannot cut cleanup short. SIGKILL or runner loss cannot be handled (plan D12).
  let interrupt!: (error: ReauditError) => void;
  const interrupted = new Promise<never>((_, reject) => (interrupt = reject));
  interrupted.catch(() => {});
  const handlers = (["SIGINT", "SIGTERM"] as const).map((signal) => [signal, () => interrupt(new ReauditError("signal", signal, "received"))] as const);
  for (const [signal, handler] of handlers) process.on(signal, handler);
  const step = async <T>(stage: string, field: string, run: () => Promise<T>): Promise<T> => {
    try {
      return await Promise.race([run(), interrupted]);
    } catch (error) {
      throw error instanceof ReauditError ? error : new ReauditError(stage, field, "failed");
    }
  };

  let failure: unknown;
  let vault: Vault | undefined;
  let opening: Promise<Vault> | undefined;
  let latest: AuditedVersions | undefined;
  let changed: PinKey[] = [];
  const free = {} as Record<(typeof FREE_KEYS)[number], { version: string; url: string }>;
  const packages = {} as Record<PinKey, Package>;
  const paidFiles: string[] = [];
  try {
    await step("discovery", "wordpress.org", () =>
      Promise.all(
        FREE_KEYS.map(async (key) => {
          const url = `https://api.wordpress.org/plugins/info/1.0/${PLUGINS[key].slug}.json`;
          const text = new TextDecoder().decode(await get(fetcher, url, "discovery", key, MAX_JSON, 60_000));
          let body: unknown;
          try {
            body = JSON.parse(text);
          } catch {
            throw new ReauditError("discovery", key, "response malformed");
          }
          free[key] = parseWordpressOrgInfo(key, body);
        }),
      ),
    );
    vault = await step("playground", "boot", () => (opening = openVault({ directory, env })));
    const v = vault;
    lifecycle.remainingBefore = count((await step("activation", "status", () => v.status())).remaining);
    lifecycle.activationAttempted = true;
    if (!(await step("activation", "activate", () => v.activate())).activated) throw new ReauditError("activation", "activate", "refused");
    lifecycle.activationConfirmed = true;
    const updater = await step("updater", "self-update", () => v.selfUpdate());
    if (!/^\d+(\.\d+)*$/.test(updater.before) || !/^\d+(\.\d+)*$/.test(updater.after)) throw new ReauditError("updater", "version", "malformed");
    lifecycle.updater = { before: updater.before, after: updater.after };
    const catalog = parseCatalog(await step("catalog", "schema", () => v.catalog({ gf: pins.gf, ff_pro: pins.ff_pro })));
    latest = assembleLatest([
      ...FREE_KEYS.map((key) => ({ key, version: free[key].version })),
      ...PAID_KEYS.map((key) => ({ key, version: catalog[key].version })),
    ]);
    ({ changed } = compareMatrix(pins, latest));
    // Paid packages are fetched while the activation is valid; their URLs stay in this scope.
    for (const key of changed.length ? PAID_KEYS : []) {
      const url = await step("download", key, () => v.download(catalog[key].item));
      const path = join(directory, `${PLUGINS[key].slug}.${latest[key]}.zip`);
      paidFiles.push(path);
      packages[key] = await step("download", key, () => fetchPackage(fetcher, key, url, latest![key], path));
    }
  } catch (error) {
    failure = error;
  } finally {
    if (vault && lifecycle.activationAttempted) {
      lifecycle.deactivationAttempted = true;
      let deactivated = false;
      try {
        deactivated = (await vault.deactivate()).deactivated === true;
      } catch {}
      try {
        const after = await vault.status();
        lifecycle.remainingAfter = count(after.remaining);
        lifecycle.deactivationConfirmed = after.activated === false;
      } catch {
        lifecycle.deactivationConfirmed = deactivated;
      }
    }
    if (vault) await vault.close().catch(() => {});
    // Interrupted while booting: nothing was activated, but the child must not outlive this call.
    else await opening?.then((v) => v.close()).catch(() => {});
  }
  if (lifecycle.activationAttempted && !lifecycle.deactivationConfirmed) {
    const after = failure instanceof ReauditError ? ` (after ${failure.message})` : failure ? " (after a failure)" : "";
    failure = new ReauditError("cleanup", "deactivate", `unconfirmed${after}`);
  }
  // wordpress.org packages need no license, so they follow the deactivation.
  if (!failure && changed.length)
    try {
      for (const key of FREE_KEYS)
        packages[key] = await step("download", key, () =>
          fetchPackage(fetcher, key, free[key].url, latest![key], join(cache, `${PLUGINS[key].slug}.${latest![key]}.zip`)),
        );
    } catch (error) {
      failure = error;
    }
  for (const [signal, handler] of handlers) process.off(signal, handler);

  if (failure) {
    await Promise.all(paidFiles.flatMap((f) => [rm(f, { force: true }), rm(`${f}.part`, { force: true })]));
    const error = failure instanceof ReauditError ? failure : new ReauditError("acquisition", "unexpected", "failed");
    error.lifecycle = lifecycle;
    throw error;
  }
  return changed.length
    ? { status: "changed", versions: latest!, changed, packages, lifecycle }
    : { status: "unchanged", versions: latest!, packages: null, lifecycle };
}

// PHP steps for the official client. Each runs as its own request (after wp-load), so the self-updated client
// code is what later steps load. They return only booleans, counts, versions and item ids — except download,
// whose private URL goes straight to fetchPackage.
const PHP = {
  configure: `
    $key = getenv('GPLVAULT_LICENSE_KEY'); $product = getenv('GPLVAULT_PRODUCT_ID');
    if (!$key || !$product) throw new Exception('credentials');
    gv_settings_manager()->save_api_settings(['api_key' => $key, 'product_id' => $product]);
    return true;`,
  status: `
    $r = gv_api_manager()->set_initials()->status();
    if (is_wp_error($r) || !isset($r['data']) || !is_array($r['data'])) throw new Exception('status');
    return ['activated' => !empty($r['data']['activated']), 'remaining' => $r['data']['activations_remaining'] ?? null];`,
  activate: `
    $r = gv_api_manager()->set_initials()->activate();
    if (is_wp_error($r) || empty($r['activated'])) return ['activated' => false, 'remaining' => null];
    gv_settings_manager()->enable_activation_status();
    return ['activated' => true, 'remaining' => $r['data']['activations_remaining'] ?? null];`,
  selfUpdate: `
    require_once ABSPATH . 'wp-admin/includes/admin.php';
    require_once ABSPATH . 'wp-admin/includes/class-wp-upgrader.php';
    $file = '${UPDATER_MAIN}';
    $before = get_plugin_data(WP_PLUGIN_DIR . '/' . $file, false, false)['Version'];
    $schema = gv_api_manager()->set_initials()->client_schema();
    if (is_wp_error($schema) || empty($schema['data']) || !is_array($schema['data'])) throw new Exception('client-schema');
    gv_settings_manager()->save_client_schema($schema['data']);
    // Setting the transient runs the client's own pre_set_site_transient_update_plugins offer of itself.
    delete_site_transient('update_plugins');
    set_site_transient('update_plugins', (object) ['last_checked' => time(), 'checked' => [], 'response' => []]);
    $offer = get_site_transient('update_plugins')->response[$file] ?? null;
    if (!$offer) return ['before' => $before, 'updated' => false];
    if ((new Plugin_Upgrader(new Automatic_Upgrader_Skin()))->upgrade($file) !== true) throw new Exception('upgrade');
    return ['before' => $before, 'updated' => true];`,
  // A fresh request: the upgrade deactivates the plugin, so reactivate it, then report the loaded version.
  reactivate: `
    require_once ABSPATH . 'wp-admin/includes/plugin.php';
    if (!is_plugin_active('${UPDATER_MAIN}') && is_wp_error(activate_plugin('${UPDATER_MAIN}'))) throw new Exception('reactivate');
    return true;`,
  refresh: `
    gv_settings_manager()->enable_activation_status();
    return get_plugin_data(WP_PLUGIN_DIR . '/${UPDATER_MAIN}', false, false)['Version'];`,
  catalog: (pins: { gf: string; ff_pro: string }) => `
    $want = json_decode('${JSON.stringify({ [PLUGINS.gf.main]: pins.gf, [PLUGINS.ff_pro.main]: pins.ff_pro })}', true);
    $payload = fn() => ['plugins' => $want, 'themes' => []];
    add_filter('gplvault_schema_payload', $payload, PHP_INT_MAX);
    $schema = gv_api_manager()->set_initials()->schema();
    remove_filter('gplvault_schema_payload', $payload, PHP_INT_MAX);
    if (is_wp_error($schema) || !isset($schema['plugins']) || !is_array($schema['plugins'])) throw new Exception('schema');
    $scalar = fn($v) => is_scalar($v) ? $v : null;
    $out = [];
    foreach ($schema['plugins'] as $file => $entry) {
      if (!is_array($entry)) continue;
      $main = isset($want[$file]) ? $file : $scalar($entry['plugin_basename'] ?? null);
      if (is_string($main) && isset($want[$main])) $out[] = ['main' => $main, 'product_id' => $scalar($entry['product_id'] ?? null), 'version' => $scalar($entry['version'] ?? null)];
    }
    return $out;`,
  download: (item: number) => `
    $url = gv_api_manager()->set_initials()->download(['product_id' => ${item}]);
    return is_string($url) ? $url : '';`,
  deactivate: `
    $r = gv_api_manager()->set_initials()->deactivate();
    return ['deactivated' => !is_wp_error($r) && !empty($r['deactivated'])];`,
};

/** Decrypt the committed official updater, boot it in a throwaway Playground and return its driver. */
export async function openOfficialVault({ directory, env, ciphertext = CIPHERTEXT }: { directory: string; env: Env; ciphertext?: string }): Promise<Vault> {
  const passphrase = env.GPLVAULT_UPDATER_PASSPHRASE;
  if (!passphrase) throw new ReauditError("environment", "GPLVAULT_UPDATER_PASSPHRASE", "missing");
  const scratch = await mkdtemp(join(directory, "updater-"));
  const zip = join(scratch, "gplvault-updater.zip");
  const child = await decryptUpdater(ciphertext, zip, passphrase)
    .then(async () => {
      if (!(await zipVersion(await Bun.file(zip).bytes(), UPDATER_MAIN))) throw new ReauditError("decrypt", "updater", "malformed");
      return Bun.spawn(["node", join(import.meta.dir, "gplvault-playground.ts"), JSON.stringify({ wp: WP_VERSION, php: PHP_VERSION })], {
        cwd: ROOT,
        env: vaultChildEnv(env, zip),
        stdin: "pipe",
        stdout: "pipe",
        stderr: "ignore",
      });
    })
    .catch(async (error) => {
      await rm(scratch, { recursive: true, force: true });
      throw error;
    });

  // Child output is never printed: only MARK lines are parsed, everything else is dropped.
  const pending = new Map<number, (message: any) => void>();
  let ready!: () => void;
  const booted = new Promise<void>((r) => (ready = r));
  void (async () => {
    let buffer = "";
    for await (const chunk of child.stdout.pipeThrough(new TextDecoderStream())) {
      const lines = (buffer + chunk).split("\n");
      buffer = lines.pop()!;
      for (const line of lines) {
        if (!line.startsWith(MARK)) continue;
        const message = JSON.parse(line.slice(MARK.length));
        if (message.ready) ready();
        else pending.get(message.id)?.(message), pending.delete(message.id);
      }
    }
  })().catch(() => {});
  const close = async () => {
    child.stdin.end();
    await Promise.race([child.exited, timeout(60_000)]).catch(() => child.kill("SIGKILL"));
  };
  try {
    await Promise.race([booted, child.exited.then(() => Promise.reject()), timeout(480_000)]);
  } catch {
    child.kill("SIGKILL");
    throw new ReauditError("playground", "boot", "failed");
  } finally {
    // The child read the ZIP at boot; the plaintext does not outlive it.
    await rm(scratch, { recursive: true, force: true });
  }

  let nextId = 1;
  let queue: Promise<unknown> = Promise.resolve();
  // Playground's run() evaluates via a fixed /internal/eval.php, so requests are serialized.
  const php = <T>(code: string, { credentials = false, ms = 120_000 } = {}): Promise<T> => {
    const result = queue.then(async () => {
      const id = nextId++;
      const answer = new Promise<any>((r) => pending.set(id, r));
      const wrapped =
        `<?php clearstatcache(true); require '/wordpress/wp-load.php';\n` +
        `try { $pirax_result = (function () {\n${code}\n})(); echo "\\n${RESULT}" . wp_json_encode(['ok' => true, 'value' => $pirax_result]); }\n` +
        `catch (Throwable $e) { echo "\\n${RESULT}" . wp_json_encode(['ok' => false]); }`;
      child.stdin.write(JSON.stringify({ id, code: wrapped, credentials }) + "\n");
      child.stdin.flush();
      const message = await Promise.race([answer, child.exited.then(() => Promise.reject(new Error("exited"))), timeout(ms)]);
      const text: string = message.text ?? "";
      const at = text.lastIndexOf(RESULT);
      const parsed = at === -1 ? undefined : JSON.parse(text.slice(at + RESULT.length));
      if (!parsed?.ok) throw new Error("php step failed");
      return parsed.value as T;
    });
    queue = result.catch(() => {});
    return result;
  };

  try {
    await php(PHP.configure, { credentials: true });
  } catch {
    await close();
    throw new ReauditError("playground", "configure", "failed");
  }
  return {
    status: () => php(PHP.status),
    activate: () => php(PHP.activate),
    selfUpdate: async () => {
      const { before } = await php<{ before: string }>(PHP.selfUpdate, { ms: 300_000 });
      await php(PHP.reactivate);
      return { before, after: await php<string>(PHP.refresh) };
    },
    catalog: (pins) => php(PHP.catalog(pins)),
    download: (item) => php(PHP.download(item)),
    deactivate: () => php(PHP.deactivate, { ms: 60_000 }),
    close,
  };
}
