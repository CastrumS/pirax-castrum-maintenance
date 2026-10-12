// A synthetic second deployment for tests (plan D9), never a production default. Its values exercise every
// render context: an apostrophe and ampersand (PHP strings, HTML, Markdown) and regex metacharacters in the
// refusal prefix. It is written only into disposable roots; the key pair is generated per call and only its
// public half reaches config.json.
//   fixtureKeys()                       a fresh Ed25519 pair: raw 32-byte public key (base64) and the private KeyObject
//   fixtureConfig(publicKey)            a valid config.json object for the fixture channel
//   FIXTURE_VERSIONS                    a valid versions.json object, deliberately unlike Pirax's
//   writeDeployment(root, name, data)   deployments/<name>/{config.json,versions.json,sites.yaml} under root
import { generateKeyPairSync, type KeyObject } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/** DER prefix of an SPKI-wrapped raw Ed25519 public key. */
const SPKI_ED25519 = Buffer.from("302a300506032b6570032100", "hex");

export function fixtureKeys(): { publicKey: string; privateKey: KeyObject } {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  return { publicKey: publicKey.export({ format: "der", type: "spki" }).subarray(SPKI_ED25519.length).toString("base64"), privateKey };
}

export const fixtureConfig = (publicKey: string) => ({
  schemaVersion: 1,
  plugin: {
    name: "Acme & O'Neil Form Check",
    author: "Acme & O'Neil",
    description: "Sends marked Acme (QA) test submissions to the operator's mailbox, never to clients.",
    slug: "acme-form-check",
    updateUri: "https://github.com/acme-fixture/acme-form-check-channel",
  },
  channel: {
    repository: "acme-fixture/acme-form-check-channel",
    releasesRoot: "https://github.com/acme-fixture/acme-form-check-channel/releases",
    publicKey,
  },
  notice: { recipient: "audit-notices@acme.example", subjectPrefix: "[acme-audit]" },
  forms: { refusalPrefix: "Acme (QA) test blocked?:", text: "Acme Test", message: "Acme test message" },
});

export const FIXTURE_VERSIONS = {
  schemaVersion: 1,
  helperVersion: "1.4.9",
  audited: { gf: "9.1.1", ff: "9.2.2", ff_pro: "9.3.3", cleantalk: "9.4.4.4", fluent_smtp: "9.5.5" },
};

/** Writes a deployment folder (JSON as given; an empty site list) and returns its path. */
export function writeDeployment(root: string, name: string, { config, versions }: { config: unknown; versions: unknown }): string {
  const directory = join(root, "deployments", name);
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, "config.json"), `${JSON.stringify(config, null, 2)}\n`);
  writeFileSync(join(directory, "versions.json"), `${JSON.stringify(versions, null, 2)}\n`);
  writeFileSync(join(directory, "sites.yaml"), "sites: []\n");
  return directory;
}
