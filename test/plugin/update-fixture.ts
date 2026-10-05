// Test release channel for updates.test.ts (plan D4): a loopback HTTP server laid out like the
// repository's GitHub releases, ephemeral Ed25519 test keys, and staged helper ZIPs whose release
// root and public key are replaced only in a disposable copy of the plugin source.
//   startReleaseFixture()                  real HTTP on 127.0.0.1; serve(routes) swaps the published state;
//                                          requests is a sanitized ledger (method, path, status, WordPress UA)
//   testKey()                              fresh key pair: raw public key and detached signatures, both base64
//   signedFeed(key, manifest)              manifest + .sig routes signed over the exact served bytes
//   stageHelper({ version, ... })          build a fixture helper ZIP with the shipping build's allowlist
// Private test keys stay in memory; only public fingerprints may be retained.
import { createHash, generateKeyPairSync, sign, type KeyObject } from "node:crypto";
import { cp, mkdtemp, rm } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { buildPlugin, withoutSigningKey } from "../../scripts/build-plugin";

export const REPOSITORY_PATH = "/CastrumS/pirax-castrum-maintenance/releases";
export const MANIFEST = "latest/download/pirax-form-test-manifest.json";
export const SIGNATURE = `${MANIFEST}.sig`;
export const packagePath = (version: string) => `download/v${version}/pirax-form-test.zip`;

const SOURCE = resolve(import.meta.dir, "../../plugin/pirax-form-test");
export const sha256 = (bytes: string | Uint8Array) => createHash("sha256").update(bytes).digest("hex");

/** A served body, an HTTP error status, or a connection reset without any response. */
export type Body = string | Uint8Array | { status: number } | "reset";
export interface RequestRecord { method: string; path: string; status: number | "reset"; wordpress: boolean; time: number }

export interface ReleaseFixture {
  /** The release root a staged helper uses, e.g. http://127.0.0.1:PORT/CastrumS/pirax-castrum-maintenance/releases */
  root: string;
  port: number;
  requests: RequestRecord[];
  /** Replace the published state; keys are paths under the release root. */
  serve(routes: Record<string, Body>): void;
  stop(): Promise<void>;
}

/**
 * Package downloads answer with a redirect to a separate asset path, as GitHub's release CDN does,
 * so WordPress's own redirect handling is part of every download.
 */
export async function startReleaseFixture(): Promise<ReleaseFixture> {
  let routes: Record<string, Body> = {};
  const requests: RequestRecord[] = [];
  const server: Server = createServer((req, res) => {
    const path = new URL(req.url ?? "/", "http://fixture").pathname;
    const record = (status: RequestRecord["status"]) =>
      requests.push({ method: req.method ?? "", path, status, wordpress: /^WordPress\//.test(req.headers["user-agent"] ?? ""), time: Date.now() });
    const prefix = `${REPOSITORY_PATH}/`;
    const asset = path.startsWith("/assets/");
    const key = asset ? decodeURIComponent(path.slice("/assets/".length)) : path.startsWith(prefix) ? path.slice(prefix.length) : null;
    const body = key === null ? undefined : routes[key];
    if (body === "reset") return record("reset"), req.socket.destroy();
    if (body === undefined || (typeof body === "object" && "status" in body)) {
      const status = body === undefined ? 404 : body.status;
      record(status);
      return res.writeHead(status).end();
    }
    if (!asset && key!.startsWith("download/")) {
      record(302);
      return res.writeHead(302, { location: `/assets/${encodeURIComponent(key!)}` }).end();
    }
    record(200);
    res.writeHead(200, { "content-type": "application/octet-stream" }).end(body);
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as { port: number }).port;
  return {
    root: `http://127.0.0.1:${port}${REPOSITORY_PATH}`,
    port,
    requests,
    serve: (next) => void (routes = next),
    stop: () => new Promise<void>((r) => server.close(() => r())),
  };
}

export interface TestKey {
  /** base64 of the 32 raw public key bytes, the format embedded in updates.php */
  publicKey: string;
  /** sha256 of the raw public key: safe to retain */
  fingerprint: string;
  /** base64 detached signature (64 raw bytes) over the exact bytes */
  sign(bytes: string | Uint8Array): string;
  /** Private representations, only for findSecret() scans of retained evidence. */
  secrets(): string[];
}

export function testKey(): TestKey {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const raw = Buffer.from(publicKey.export({ format: "jwk" }).x!, "base64url");
  const key: KeyObject = privateKey;
  return {
    publicKey: raw.toString("base64"),
    fingerprint: sha256(raw),
    sign: (bytes) => sign(null, Buffer.from(bytes), key).toString("base64"),
    secrets: () => {
      const seed = Buffer.from(key.export({ format: "jwk" }).d!, "base64url");
      return [seed.toString("base64"), seed.toString("base64url"), seed.toString("hex")];
    },
  };
}

export interface Manifest { version: string; package: string; sha256: string; audited: Record<string, string> }

export const manifestFor = (root: string, version: string, zip: Uint8Array, audited: Record<string, string>): Manifest => ({
  version,
  package: `${root}/${packagePath(version)}`,
  sha256: sha256(zip),
  audited,
});

/** Manifest and signature routes; a string manifest is served (and signed) byte for byte. */
export function signedFeed(key: TestKey, manifest: object | string): Record<string, Body> {
  const text = typeof manifest === "string" ? manifest : JSON.stringify(manifest);
  return { [MANIFEST]: text, [SIGNATURE]: key.sign(text) };
}

export interface StagedHelper { version: string; zip: string; bytes: Uint8Array; sha256: string; files: Record<string, string> }

/**
 * Copy the production plugin, set its version and the updater's release root and public key in the
 * copy only (each declaration must match exactly once and read back), and build it with the
 * production allowlist. The source tree is never written.
 */
export async function stageHelper({ version, publicKey, root, out }: { version: string; publicKey: string; root: string; out: string }): Promise<StagedHelper> {
  const stage = await mkdtemp(join(tmpdir(), "pirax-update-stage-"));
  try {
    await cp(SOURCE, stage, { recursive: true });
    const replace = async (file: string, edits: [RegExp, string][]) => {
      let text = await Bun.file(join(stage, file)).text();
      for (const [pattern, line] of edits) {
        const matches = text.match(new RegExp(pattern.source, "gm"))?.length ?? 0;
        if (matches !== 1) throw new Error(`stageHelper: ${file} has ${matches} matches for ${pattern}, expected 1`);
        text = text.replace(new RegExp(pattern.source, "m"), line);
      }
      await Bun.write(join(stage, file), text);
      const back = await Bun.file(join(stage, file)).text();
      for (const [, line] of edits) if (!back.includes(line)) throw new Error(`stageHelper: ${file} did not read back ${line}`);
    };
    await replace("pirax-form-test.php", [
      [/^ \* Version: {11}\S+$/, ` * Version:           ${version}`],
      [/^const VERSION = '[^']*';$/, `const VERSION = '${version}';`],
    ]);
    await replace("includes/updates.php", [
      [/^const UPDATE_RELEASES_ROOT = '[^']*';$/, `const UPDATE_RELEASES_ROOT = '${root}';`],
      [/^const UPDATE_PUBLIC_KEY = '[^']*';$/, `const UPDATE_PUBLIC_KEY = '${publicKey}';`],
    ]);
    const zip = join(out, `pirax-form-test-${version}-${sha256(publicKey).slice(0, 8)}.zip`);
    await buildPlugin({ source: stage, zip });
    const bytes = await Bun.file(zip).bytes();
    const files: Record<string, string> = {};
    for (const entry of (await Bun.$`unzip -Z1 ${zip}`.env(withoutSigningKey()).text()).trim().split("\n").filter((e) => !e.endsWith("/")))
      files[entry.replace(/^pirax-form-test\//, "")] = sha256(await Bun.$`unzip -p ${zip} ${entry}`.env(withoutSigningKey()).arrayBuffer().then((b) => new Uint8Array(b)));
    return { version, zip, bytes, sha256: sha256(bytes), files };
  } finally {
    await rm(stage, { recursive: true, force: true });
  }
}
