// Production-key isolation proof for a second deployment's helper (plan D10; AC3), run on demand, never by bun test
// or the audit job (they have no production signing seed).
//   --updates   Real WordPress (test/plugin/harness.ts) gets the synthetic fixture deployment's 0.3.0 helper through
//               an authenticated wp-admin upload. The shared scenario (test/plugin/update-scenario.ts) then serves
//               the fixture's otherwise valid 0.3.1 manifest signed by the selected deployment's real signing key,
//               and, separately, a fixture-key signature over the selected deployment's own package URL: each must
//               leave no offer, drop a stale one, be refused by the native install and leave the installed bytes
//               unchanged. Finally the fixture-signed 0.3.1 installs through plugins.php.
// The seed (PIRAX_HELPER_SIGNING_KEY) is read in this process only, must match the selected deployment's
// config.channel.publicKey, and signs in memory; WordPress, the browser and the loopback HTTP fixture receive only
// manifests, signatures and ZIPs, and every child gets an environment without it. Retained evidence is scanned for
// its private representations. Nothing is published, pushed or mailed.
// Evidence: artifacts/deployment-folder/selftest-<time>/summary.json (fingerprints, cases, request lines) and the
// harness's artifacts/plugin/deployment-selftest-<time>/ (trace, network ledger, update-requests.jsonl).
// Usage: DEPLOYMENT=pirax bun --env-file=.env scripts/deployment-selftest.ts --updates
//        (also needs the native harness prerequisites: GRAVITY_FORMS_ZIP, FORM_TEST_TOKEN, node, zip, unzip)
import { createHash, sign } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { loadDeployment } from "../src/deployment.ts";
import { findSecret } from "../test/plugin/artifacts.ts";
import { allowChannelPort, browserUpdate, refuseForeign, updateSession, type Signer } from "../test/plugin/update-scenario.ts";
import { manifestFor, packagePath, signedFeed, stageHelper, startReleaseFixture, testKey } from "../test/plugin/update-fixture.ts";
import { readAuditedVersions } from "./plugin-source.ts";
import { rawPublicKey, signingKey } from "./release-plugin.ts";

const ROOT = resolve(import.meta.dir, "..");
const KEY = "PIRAX_HELPER_SIGNING_KEY";

async function updates() {
  const production = loadDeployment();
  const productionKey = signingKey();
  const publicKey = rawPublicKey(productionKey);
  if (publicKey !== production.config.channel.publicKey) throw new Error(`${KEY} does not match config.channel.publicKey of deployment ${production.name}`);
  const seed = Buffer.from(process.env[KEY]!, "base64");
  const privateForms = [seed.toString("base64"), seed.toString("base64url"), seed.toString("hex")];
  const foreign: Signer = {
    fingerprint: createHash("sha256").update(Buffer.from(publicKey, "base64")).digest("hex"),
    sign: (bytes) => sign(null, Buffer.from(bytes), productionKey).toString("base64"),
  };
  const evidence = join(ROOT, "artifacts/deployment-folder", `selftest-${new Date().toISOString().replace(/[:.]/g, "-")}`);
  await mkdir(evidence, { recursive: true });

  // The harness reads the selected deployment's pins when it loads, so it is loaded only after selection succeeded.
  const { startHarness } = await import("../test/plugin/harness.ts");
  const [h, fixture] = await Promise.all([startHarness({ run: "deployment-selftest" }), startReleaseFixture()]);
  const out = await mkdtemp(join(tmpdir(), "deployment-selftest-"));
  try {
    const key = testKey();
    // The harness boots the selected deployment's audited vendor versions; the fixture helper audits the same.
    const audited = readAuditedVersions();
    const stage = (version: string) => stageHelper({ version, publicKey: key.publicKey, root: fixture.root, audited, out });
    const [installed, target] = await Promise.all([stage("0.3.0"), stage("0.3.1")]);
    await allowChannelPort(h, fixture);
    const session = updateSession(h, fixture);
    const admin = await h.browser("deployment-selftest-upload-update");
    await session.login(admin.page);
    await h.uploadPlugin(admin.page, installed.zip);
    await session.installedIs(installed, "upload");

    const cases = await refuseForeign({
      h,
      fixture,
      session,
      installed,
      target,
      key,
      foreign: { label: `the ${production.name} signing key`, signer: foreign },
      foreignPackage: { label: `the ${production.name} package URL`, url: `${production.config.channel.releasesRoot}/download/v${target.version}/${production.assets.zip}` },
      audited,
    });
    const manifest = manifestFor(fixture.root, target.version, target.bytes, audited);
    fixture.serve({ ...signedFeed(key, manifest), [packagePath(target.version)]: target.bytes });
    if ((await session.refresh()).offer?.new_version !== target.version) throw new Error("the fixture-signed release was not offered");
    const requests = await browserUpdate(session, admin.page, h, fixture, target);
    cases.push({ name: `browser update: fixture-signed ${target.version}`, offered: true, installed: target.version, requests });
    await h.closeBrowser(admin.context);

    await h.saveEvidence();
    await writeFile(join(h.artifactDir, "update-requests.jsonl"), fixture.requests.map((r) => JSON.stringify(r) + "\n").join(""));
    const summaryPath = join(evidence, "summary.json");
    await writeFile(
      summaryPath,
      `${JSON.stringify(
        {
          deployment: production.name,
          keys: { fixture: key.fingerprint, [production.name]: foreign.fingerprint, [`${production.name}MatchesConfig`]: true, format: "sha256 of the raw 32-byte Ed25519 public key" },
          root: fixture.root,
          helpers: { installed: { version: installed.version, sha256: installed.sha256 }, target: { version: target.version, sha256: target.sha256 } },
          manifest,
          cases,
          harness: relative(ROOT, h.artifactDir),
          traces: (await Bun.file(join(h.artifactDir, "manifest.json")).json()).artifacts.traces,
        },
        null,
        2,
      )}\n`,
    );
    const secrets = [...privateForms, ...key.secrets(), h.token];
    const leaks = [...(await findSecret(evidence, secrets)), ...(await findSecret(h.artifactDir, secrets))];
    if (leaks.length) throw new Error(`private material in retained evidence: ${leaks.join(", ")}`);
    console.log(`deployment-selftest: updates passed (${cases.length} cases); ${relative(ROOT, summaryPath)}, ${relative(ROOT, h.artifactDir)}`);
  } finally {
    await h.stop();
    await fixture.stop();
    await rm(out, { recursive: true, force: true });
  }
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  if (args.length !== 1 || args[0] !== "--updates") {
    console.error("usage: bun scripts/deployment-selftest.ts --updates");
    process.exit(2);
  }
  try {
    await updates();
  } catch (error) {
    console.error(`deployment-selftest: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}
