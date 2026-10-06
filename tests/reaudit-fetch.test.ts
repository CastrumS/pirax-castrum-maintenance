// Acquisition tests (plan D3/D4): local packages, an in-process HTTP double and a scripted stand-in for the
// official-client steps. They prove ordering, bounds, digests and cleanup handling, never GPL Vault auth.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { findSecret } from "../test/plugin/artifacts";
import { type AuditedVersions, ReauditError } from "../scripts/reaudit/detect";
import { parseCatalog } from "../scripts/reaudit/detect";
import { acquirePackages, gpg, openOfficialVault, vaultChildEnv, type Vault } from "../scripts/reaudit/fetch";

const PINS: AuditedVersions = { gf: "3.1.2", ff: "6.2.14", ff_pro: "6.2.15", cleantalk: "6.88", fluent_smtp: "2.4.1" };
const MAIN = {
  gf: "gravityforms/gravityforms.php",
  ff: "fluentform/fluentform.php",
  ff_pro: "fluentformpro/fluentformpro.php",
  cleantalk: "cleantalk-spam-protect/cleantalk.php",
  fluent_smtp: "fluent-smtp/fluent-smtp.php",
} as const;
const SLUG = { ff: "fluentform", cleantalk: "cleantalk-spam-protect", fluent_smtp: "fluent-smtp" } as const;
const PRIVATE_URL = (item: number) => `https://vault.invalid/package/${item}?X-Amz-Signature=SYNTHETIC-SIGNATURE-${item}`;
const SECRETS = { GPLVAULT_LICENSE_KEY: "SYNTHETIC-LICENSE-KEY", GPLVAULT_PRODUCT_ID: "SYNTHETIC-PRODUCT-ID" };

let scratch: string;
beforeAll(async () => void (scratch = await mkdtemp(join(tmpdir(), "reaudit-fetch-"))));
afterAll(() => rm(scratch, { recursive: true, force: true }));

let zipCount = 0;
/** A minimal plugin ZIP whose main file declares the given Version. */
async function pluginZip(main: string, version: string): Promise<Uint8Array<ArrayBuffer>> {
  const dir = join(scratch, `zip-${++zipCount}`);
  await mkdir(join(dir, main.split("/")[0]!), { recursive: true });
  await writeFile(join(dir, main), `<?php\n/**\n * Plugin Name: Synthetic\n * Version: ${version}\n */\n`);
  const proc = Bun.spawn(["zip", "-q", "-r", "-X", "-", main.split("/")[0]!], { cwd: dir, stdout: "pipe" });
  const bytes = new Uint8Array(await new Response(proc.stdout).arrayBuffer());
  if ((await proc.exited) !== 0) throw new Error("zip failed");
  return bytes;
}

const infoUrl = (slug: string) => `https://api.wordpress.org/plugins/info/1.0/${slug}.json`;
const freeUrl = (slug: string, version: string) => `https://downloads.wordpress.org/plugin/${slug}.${version}.zip`;

interface Scenario {
  latest?: Partial<AuditedVersions>;
  responses?: Record<string, () => Response | Promise<Response>>;
  vault?: Partial<Vault>;
  packageVersion?: Partial<AuditedVersions>;
}

/** Runs acquirePackages against fixture responses; returns the outcome plus every recorded call. */
async function run(scenario: Scenario = {}) {
  const latest = { ...PINS, ...scenario.latest };
  const fetched: string[] = [];
  const calls: string[] = [];
  const responses: Record<string, () => Response | Promise<Response>> = {};
  for (const key of ["ff", "cleantalk", "fluent_smtp"] as const) {
    const slug = SLUG[key];
    responses[infoUrl(slug)] = () => Response.json({ slug, version: latest[key], download_link: freeUrl(slug, latest[key]) });
    responses[freeUrl(slug, latest[key])] = async () => new Response(await pluginZip(MAIN[key], scenario.packageVersion?.[key] ?? latest[key]));
  }
  for (const [key, item] of [["gf", 29365], ["ff_pro", 1111130]] as const)
    responses[PRIVATE_URL(item)] = async () => new Response(await pluginZip(MAIN[key], scenario.packageVersion?.[key] ?? latest[key]));
  Object.assign(responses, scenario.responses);

  const fakeFetch = (async (url: string | URL) => {
    fetched.push(String(url));
    const answer = responses[String(url)];
    return answer ? answer() : new Response("not found", { status: 404 });
  }) as typeof fetch;

  let remaining = 139;
  const vault: Vault = {
    status: async () => (calls.push("status"), { activated: remaining < 139, remaining }),
    activate: async () => (calls.push("activate"), { activated: true, remaining: --remaining }),
    selfUpdate: async () => (calls.push("selfUpdate"), { before: "5.3.9", after: "5.4.0" }),
    catalog: async (pins) => (
      calls.push(`catalog ${pins.gf} ${pins.ff_pro}`),
      [
        { main: MAIN.gf, product_id: 29365, version: latest.gf },
        { main: MAIN.ff_pro, product_id: 1111130, version: latest.ff_pro },
      ]
    ),
    download: async (item) => (calls.push(`download ${item}`), PRIVATE_URL(item)),
    deactivate: async () => (calls.push("deactivate"), remaining++, { deactivated: true }),
    close: async () => void calls.push("close"),
    ...scenario.vault,
  };
  const directory = await mkdtemp(join(scratch, "private-"));
  const cache = await mkdtemp(join(scratch, "cache-"));
  const opened: Record<string, string | undefined>[] = [];
  const outcome = await acquirePackages({
    pins: PINS,
    directory,
    cache,
    env: SECRETS,
    fetch: fakeFetch,
    openVault: async ({ env }) => (opened.push(env), vault),
  }).then(
    (result) => ({ result, error: undefined }),
    (error: unknown) => ({ result: undefined, error: error as ReauditError }),
  );
  return { ...outcome, fetched, calls, directory, cache, opened };
}

const downloads = (fetched: string[]) => fetched.filter((u) => !u.startsWith("https://api.wordpress.org/"));
const sha = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

describe("acquirePackages", () => {
  test("no change: complete lifecycle, no form package downloaded", async () => {
    const { result, error, fetched, calls } = await run();
    expect(error).toBeUndefined();
    expect(result!.status).toBe("unchanged");
    expect(result!.versions).toEqual(PINS);
    expect(result!.packages).toBeNull();
    expect(downloads(fetched)).toEqual([]);
    expect(calls).toEqual(["status", "activate", "selfUpdate", "catalog 3.1.2 6.2.15", "deactivate", "status", "close"]);
    expect(result!.lifecycle).toEqual({
      activationAttempted: true,
      activationConfirmed: true,
      deactivationAttempted: true,
      deactivationConfirmed: true,
      remainingBefore: 139,
      remainingAfter: 139,
      updater: { before: "5.3.9", after: "5.4.0" },
    });
  });

  test("FF 6.2.14 → 6.2.15: all five packages, version-keyed free cache, private paid paths, digests", async () => {
    const { result, error, fetched, calls, directory, cache } = await run({ latest: { ff: "6.2.15" } });
    expect(error).toBeUndefined();
    expect(result!.status).toBe("changed");
    if (result!.status !== "changed") throw new Error("unreachable");
    expect(result!.changed).toEqual(["ff"]);
    expect(result!.versions).toEqual({ ...PINS, ff: "6.2.15" });
    expect(calls).toEqual(["status", "activate", "selfUpdate", "catalog 3.1.2 6.2.15", "download 29365", "download 1111130", "deactivate", "status", "close"]);
    expect(downloads(fetched).sort()).toEqual(
      [PRIVATE_URL(29365), PRIVATE_URL(1111130), freeUrl("fluentform", "6.2.15"), freeUrl("cleantalk-spam-protect", "6.88"), freeUrl("fluent-smtp", "2.4.1")].sort(),
    );
    const { packages } = result!;
    expect(packages.ff.path).toBe(join(cache, "fluentform.6.2.15.zip"));
    expect(packages.cleantalk.path).toBe(join(cache, "cleantalk-spam-protect.6.88.zip"));
    expect(packages.fluent_smtp.path).toBe(join(cache, "fluent-smtp.2.4.1.zip"));
    expect(packages.gf.path.startsWith(directory + "/")).toBe(true);
    expect(packages.ff_pro.path.startsWith(directory + "/")).toBe(true);
    for (const [key, pkg] of Object.entries(packages)) {
      expect(pkg.version).toBe(result!.versions[key as keyof AuditedVersions]);
      expect(pkg.sha256).toBe(sha(await Bun.file(pkg.path).bytes()));
    }
    expect(await readdir(cache)).toHaveLength(3); // no .part leftovers
    // Public metadata carries no private URL or credential.
    const evidence = join(directory, "evidence");
    await mkdir(evidence);
    await writeFile(join(evidence, "result.json"), JSON.stringify(result));
    expect(await findSecret(evidence, [PRIVATE_URL(29365), PRIVATE_URL(1111130), "SYNTHETIC-SIGNATURE", ...Object.values(SECRETS)])).toEqual([]);
  });

  test("the official-client child gets only its own inputs", () => {
    const env = vaultChildEnv(
      { ...SECRETS, PATH: "/bin", HOME: "/home/x", IMAP_PASSWORD: "SYNTHETIC-IMAP", PIRAX_HELPER_SIGNING_KEY: "SYNTHETIC-SEED", FORM_TEST_TOKEN: "t", GRAVITY_FORMS_ZIP: "/z" },
      "/private/updater.zip",
    );
    expect(env).toEqual({ ...SECRETS, PATH: "/bin", HOME: "/home/x", PIRAX_GPLVAULT_UPDATER_ZIP: "/private/updater.zip" });
  });

  test("missing credentials fail before any activation, naming the variable", async () => {
    const error = await acquirePackages({ pins: PINS, directory: scratch, env: {}, openVault: () => Promise.reject(new Error("must not open")) }).catch((e) => e);
    expect(error).toBeInstanceOf(ReauditError);
    expect(error.message).toBe("environment: GPLVAULT_LICENSE_KEY missing");
  });

  test("a lost activation response still triggers confirmed deactivation, then fails", async () => {
    const { error, calls } = await run({ vault: { activate: () => Promise.reject(new Error(`raw body ${SECRETS.GPLVAULT_LICENSE_KEY}`)) } });
    expect(error!.message).toBe("activation: activate failed");
    expect(error!.lifecycle).toMatchObject({ activationAttempted: true, activationConfirmed: false, deactivationConfirmed: true });
    expect(calls).toEqual(["status", "deactivate", "status", "close"]);
  });

  test("a refused activation is a failure, with cleanup", async () => {
    const { error, calls } = await run({ vault: { activate: async () => ({ activated: false, remaining: null }) } });
    expect(error!.message).toBe("activation: activate refused");
    expect(calls.slice(-3)).toEqual(["deactivate", "status", "close"]);
  });

  test("a GPL Vault refusal during discovery fails closed with cleanup", async () => {
    const { error, calls, fetched } = await run({ latest: { gf: "3.1.3" }, vault: { catalog: () => Promise.reject(new Error("gv refusal")) } });
    expect(error!.message).toBe("catalog: schema failed");
    expect(downloads(fetched)).toEqual([]);
    expect(calls.slice(-3)).toEqual(["deactivate", "status", "close"]);
  });

  test("a refused or unconfirmed deactivation fails even when acquisition succeeded, and removes paid files", async () => {
    const { error, directory } = await run({
      latest: { ff: "6.2.15" },
      vault: { deactivate: async () => ({ deactivated: false }), status: async () => ({ activated: true, remaining: 138 }) },
    });
    expect(error!.message).toBe("cleanup: deactivate unconfirmed");
    expect(error!.lifecycle).toMatchObject({ deactivationAttempted: true, deactivationConfirmed: false });
    expect((await readdir(directory)).filter((f) => f.endsWith(".zip"))).toEqual([]);
  });

  test("deactivation is confirmed by status when its own answer is lost", async () => {
    let active = false;
    const { error, result } = await run({
      vault: {
        status: async () => ({ activated: active, remaining: active ? 138 : 139 }),
        activate: async () => ((active = true), { activated: true, remaining: 138 }),
        deactivate: async () => ((active = false), Promise.reject(new Error("timeout"))),
      },
    });
    expect(error).toBeUndefined();
    expect(result!.lifecycle.deactivationConfirmed).toBe(true);
  });

  test("a failure plus a failed cleanup reports cleanup as the stage", async () => {
    const { error } = await run({
      vault: { catalog: () => Promise.reject(new Error("x")), deactivate: () => Promise.reject(new Error("y")), status: async () => ({ activated: true, remaining: 1 }) },
    });
    expect(error!.message).toBe("cleanup: deactivate unconfirmed (after catalog: schema failed)");
  });

  test.each([
    ["HTTP error", { [freeUrl("fluentform", "6.2.15")]: () => new Response("x", { status: 503 }) }, "download: ff status"],
    [
      "declared oversize",
      { [freeUrl("fluentform", "6.2.15")]: () => new Response("x", { headers: { "content-length": String(200 * 2 ** 20) } }) },
      "download: ff oversize",
    ],
    [
      "streamed oversize",
      {
        [freeUrl("fluentform", "6.2.15")]: () => {
          const chunk = new Uint8Array(2 ** 20);
          let sent = 0;
          return new Response(new ReadableStream({ pull: (c) => (sent++ > 80 ? c.close() : c.enqueue(chunk)) }));
        },
      },
      "download: ff oversize",
    ],
    ["network error", { [freeUrl("fluentform", "6.2.15")]: () => Promise.reject(new Error(`ECONNRESET ${PRIVATE_URL(1)}`)) }, "download: ff failed"],
    ["not a ZIP", { [freeUrl("fluentform", "6.2.15")]: () => new Response("<html>") }, "download: ff version unreadable"],
    ["a paid HTTP error", { [PRIVATE_URL(29365)]: () => new Response("denied", { status: 403 }) }, "download: gf status"],
    ["malformed wordpress.org info", { [infoUrl("fluent-smtp")]: () => new Response("{") }, "discovery: fluent_smtp response malformed"],
    ["oversize wordpress.org info", { [infoUrl("fluent-smtp")]: () => new Response("x".repeat(3 * 2 ** 20)) }, "discovery: fluent_smtp oversize"],
  ])("%s fails closed", async (_label, responses, message) => {
    const { error } = await run({ latest: { ff: "6.2.15" }, responses });
    expect(error!.message).toBe(message);
    expect(error!.message).not.toContain("SYNTHETIC");
  });

  test("a main-file Version that differs from the selected version fails, and never substitutes the old package", async () => {
    const { error, cache } = await run({ latest: { ff: "6.2.15" }, packageVersion: { ff: "6.2.14" } });
    expect(error!.message).toBe("download: ff version mismatch");
    expect(existsSync(join(cache, "fluentform.6.2.15.zip"))).toBe(false);
    expect(await readdir(cache)).not.toContain("fluentform.6.2.14.zip");
  });

  test("a paid package with the wrong main-file Version fails", async () => {
    const { error } = await run({ latest: { ff_pro: "6.2.16" }, packageVersion: { ff_pro: "6.2.15" } });
    expect(error!.message).toBe("download: ff_pro version mismatch");
  });

  test("a non-HTTPS package URL from the official client is refused before any request", async () => {
    const { error, fetched } = await run({ latest: { gf: "3.1.3" }, vault: { download: async () => "http://vault.invalid/package" } });
    expect(error!.message).toBe("download: gf url malformed");
    expect(fetched).not.toContain("http://vault.invalid/package");
  });

  test("an empty package URL (official client refusal) fails", async () => {
    const { error } = await run({ latest: { gf: "3.1.3" }, vault: { download: async () => "" } });
    expect(error!.message).toBe("download: gf url malformed");
  });

  test("a catchable signal interrupts the pending step and still deactivates", async () => {
    const { error, calls } = await run({ vault: { catalog: () => (process.emit("SIGTERM"), new Promise(() => {})) } });
    expect(error!.message).toBe("signal: SIGTERM received");
    expect(calls.slice(-3)).toEqual(["deactivate", "status", "close"]);
    expect(process.listenerCount("SIGTERM")).toBe(0);
  });

  test("a downgrade from the official catalog fails closed after cleanup", async () => {
    const { error, calls } = await run({ latest: { gf: "3.1.1" } });
    expect(error!.message).toBe("discovery: gf downgrade");
    expect(calls).not.toContain("download 29365");
    expect(calls.slice(-3)).toEqual(["deactivate", "status", "close"]);
  });
});

// The real Playground child and PHP steps, against a synthetic stand-in exposing the official client's
// gv_api_manager()/gv_settings_manager() method names. Proves the protocol, request isolation and the
// environment-only credential channel; it is not evidence about GPL Vault itself.
const STAND_IN = `<?php
/*
 * Plugin Name: Synthetic GPL Vault client stand-in (test only)
 * Version: 5.3.9
 */
final class Pirax_Stand_In_Settings {
  function save_api_settings($v) { update_option('stand_in_api', $v); }
  function enable_activation_status() { update_option('stand_in_enabled', 'yes'); }
  function save_client_schema($s) { update_option('stand_in_client_schema', $s); }
}
final class Pirax_Stand_In_Api {
  function set_initials() { return $this; }
  private function authorized() {
    $s = get_option('stand_in_api');
    return is_array($s) && $s['api_key'] === '${SECRETS.GPLVAULT_LICENSE_KEY}' && $s['product_id'] === '${SECRETS.GPLVAULT_PRODUCT_ID}';
  }
  private function active() { return get_option('stand_in_active') === 'yes'; }
  function status() { return ['data' => ['activated' => $this->active(), 'activations_remaining' => $this->active() ? 138 : 139]]; }
  function activate() {
    if (!$this->authorized() || getenv('GPLVAULT_LICENSE_KEY')) return new WP_Error('refused', 'refused');
    update_option('stand_in_active', 'yes');
    return ['activated' => true, 'data' => ['activations_remaining' => 138]];
  }
  function client_schema() { return ['data' => ['slug' => 'gplvault-updater']]; }
  function schema() {
    if (get_option('stand_in_enabled') !== 'yes') return new WP_Error('inactive', 'inactive');
    $p = apply_filters('gplvault_schema_payload', [])['plugins'];
    return ['plugins' => [
      'gravityforms/gravityforms.php' => ['product_id' => 29365, 'version' => $p['gravityforms/gravityforms.php'], 'package' => 'https://private.invalid/x'],
      'renamed/fluentformpro.php' => ['plugin_basename' => 'fluentformpro/fluentformpro.php', 'product_id' => '1111130', 'version' => $p['fluentformpro/fluentformpro.php']],
      'other/other.php' => ['product_id' => 5, 'version' => '1.0'],
    ], 'themes' => []];
  }
  function download($a) { return 'https://private.invalid/package/' . $a['product_id']; }
  function deactivate() { update_option('stand_in_active', 'no'); return ['deactivated' => true]; }
}
function gv_api_manager() { static $a; return $a ??= new Pirax_Stand_In_Api(); }
function gv_settings_manager() { static $s; return $s ??= new Pirax_Stand_In_Settings(); }
`;

test("the official-vault driver runs every PHP step in a real Playground child", async () => {
  const dir = await mkdtemp(join(scratch, "stand-in-"));
  await mkdir(join(dir, "gplvault-updater"));
  await writeFile(join(dir, "gplvault-updater/gplvault-updater.php"), STAND_IN);
  expect(await Bun.spawn(["zip", "-q", "-r", "-X", "updater.zip", "gplvault-updater"], { cwd: dir }).exited).toBe(0);
  const passphrase = "SYNTHETIC-PASSPHRASE-0123456789";
  const ciphertext = join(dir, "updater.zip.gpg");
  await gpg(["--symmetric", "--output", ciphertext, join(dir, "updater.zip")], passphrase, "encrypt");
  const directory = await mkdtemp(join(scratch, "private-"));
  const env = { ...SECRETS, GPLVAULT_UPDATER_PASSPHRASE: passphrase, PATH: process.env.PATH, HOME: process.env.HOME };

  const vault = await openOfficialVault({ directory, env, ciphertext });
  try {
    expect(await readdir(directory)).toEqual([]); // decrypted ZIP removed once the child booted
    expect(await vault.status()).toEqual({ activated: false, remaining: 139 });
    expect(await vault.activate()).toEqual({ activated: true, remaining: 138 });
    expect(await vault.selfUpdate()).toEqual({ before: "5.3.9", after: "5.3.9" });
    const catalog = await vault.catalog({ gf: "3.1.2", ff_pro: "6.2.15" });
    expect(JSON.stringify(catalog)).not.toContain("private.invalid");
    expect(parseCatalog(catalog)).toEqual({ gf: { version: "3.1.2", item: 29365 }, ff_pro: { version: "6.2.15", item: 1111130 } });
    expect(await vault.download(1111130)).toBe("https://private.invalid/package/1111130");
    expect(await vault.deactivate()).toEqual({ deactivated: true });
    expect(await vault.status()).toEqual({ activated: false, remaining: 139 });
  } finally {
    await vault.close();
  }
}, 600_000);
