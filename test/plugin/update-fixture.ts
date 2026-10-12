// Test release channel for the native updater (plan D4, D10): a loopback HTTP server laid out like the
// synthetic deployment's GitHub releases, ephemeral Ed25519 test keys, and staged helper ZIPs built by the
// production build from disposable deployment data (test/fixtures/deployment.ts's identity, a loopback releases
// root, a test public key and a chosen helper version). Shared templates and real deployments are only read.
//   SLUG / BASENAME / NAME                 the synthetic helper's folder, plugin basename and visible name
//   startReleaseFixture()                  real HTTP on 127.0.0.1; serve(routes) swaps the published state;
//                                          requests is a sanitized ledger (method, path, status, WordPress UA)
//   testKey()                              fresh key pair: raw public key and detached signatures, both base64
//   signedFeed(key, manifest)              manifest + .sig routes signed over the exact served bytes
//   stageHelper({ version, ... })          build a fixture helper ZIP and read its version, channel and key back
// Private test keys stay in memory; only public fingerprints may be retained.
import { createHash, generateKeyPairSync, sign, type KeyObject } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildPlugin, withoutSigningKey } from "../../scripts/build-plugin";
import { only, parseHelperVersion, type AuditedVersions } from "../../scripts/plugin-source";
import { loadDeployment } from "../../src/deployment";
import { fixtureConfig, writeDeployment } from "../fixtures/deployment";

/** The synthetic identity; its key and releases root are set per staged helper. */
const IDENTITY = fixtureConfig("");
export const SLUG = IDENTITY.plugin.slug;
export const BASENAME = `${SLUG}/${SLUG}.php`;
export const NAME = IDENTITY.plugin.name;
const REPOSITORY_PATH = `/${IDENTITY.channel.repository}/releases`;
export const MANIFEST = `latest/download/${SLUG}-manifest.json`;
export const SIGNATURE = `${MANIFEST}.sig`;
export const packagePath = (version: string) => `download/v${version}/${SLUG}.zip`;

export const sha256 = (bytes: string | Uint8Array) => createHash("sha256").update(bytes).digest("hex");

/** A served body, an HTTP error status, or a connection reset without any response. */
export type Body = string | Uint8Array | { status: number } | "reset";
export interface RequestRecord { method: string; path: string; status: number | "reset"; wordpress: boolean; time: number }

export interface ReleaseFixture {
  /** The release root a staged helper uses, e.g. http://127.0.0.1:PORT/acme-fixture/acme-form-check-channel/releases */
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
 * Write a disposable deployment (the synthetic identity on this releases root, public key, version and the given
 * audited pins), build it with the production build, and read the ZIP's folder, version, channel and key back.
 * Templates and real deployments are never written.
 */
export async function stageHelper({ version, publicKey, root, audited, out }: { version: string; publicKey: string; root: string; audited: AuditedVersions; out: string }): Promise<StagedHelper> {
  const stage = await mkdtemp(join(tmpdir(), `${SLUG}-deployment-`));
  try {
    writeDeployment(stage, "fixture", {
      config: { ...IDENTITY, channel: { ...IDENTITY.channel, releasesRoot: root, publicKey } },
      versions: { schemaVersion: 1, helperVersion: version, audited },
    });
    const deployment = loadDeployment({ root: stage, env: { DEPLOYMENT: "fixture" } });
    const zip = join(out, `${SLUG}-${version}-${sha256(publicKey).slice(0, 8)}.zip`);
    await buildPlugin({ deployment, zip });
    const bytes = await Bun.file(zip).bytes();
    const files: Record<string, string> = {};
    const text: Record<string, string> = {};
    for (const entry of (await Bun.$`unzip -Z1 ${zip}`.env(withoutSigningKey()).text()).trim().split("\n").filter((e) => !e.endsWith("/"))) {
      if (!entry.startsWith(`${SLUG}/`)) throw new Error(`stageHelper: ${entry} is outside ${SLUG}/`);
      const content = await Bun.$`unzip -p ${zip} ${entry}`.env(withoutSigningKey()).arrayBuffer().then((b) => new Uint8Array(b));
      files[entry.slice(SLUG.length + 1)] = sha256(content);
      text[entry.slice(SLUG.length + 1)] = new TextDecoder().decode(content);
    }
    const updates = text["includes/updates.php"] ?? "";
    const back = {
      basename: deployment.assets.basename,
      version: parseHelperVersion(text[`${SLUG}.php`] ?? ""),
      root: only(updates, /^const UPDATE_RELEASES_ROOT = '([^']*)';$/gm, "includes/updates.php", "UPDATE_RELEASES_ROOT"),
      key: only(updates, /^const UPDATE_PUBLIC_KEY = '([^']*)';$/gm, "includes/updates.php", "UPDATE_PUBLIC_KEY"),
    };
    if (JSON.stringify(back) !== JSON.stringify({ basename: BASENAME, version, root, key: publicKey })) throw new Error("stageHelper: the built helper did not read back its staged identity, version, channel and key");
    return { version, zip, bytes, sha256: sha256(bytes), files };
  } finally {
    await rm(stage, { recursive: true, force: true });
  }
}
