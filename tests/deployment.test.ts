import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { DeploymentConfigError, formatVersions, loadDeployment, parseConfig, parseVersions, PIN_KEYS, type Deployment } from "../src/deployment";
import { FIXTURE_VERSIONS, fixtureConfig, fixtureKeys, writeDeployment } from "../test/fixtures/deployment";

const ROOT = resolve(import.meta.dir, "..");
/** Planted in rejected input: no error may repeat it. */
const SENTINEL = "sk_live_deployment_sentinel";
type Config = ReturnType<typeof fixtureConfig>;
type Versions = typeof FIXTURE_VERSIONS;

const refusal = (f: () => unknown) => {
  try {
    f();
  } catch (error) {
    if (!(error instanceof DeploymentConfigError)) throw error;
    return { field: error.field, message: error.message };
  }
  throw new Error("expected a DeploymentConfigError");
};

/** A disposable repository root holding the given deployments; removed after body. */
function withRoot(body: (root: string) => void) {
  const root = mkdtempSync(join(tmpdir(), "deployment-test-"));
  try {
    body(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

const fixture = (publicKey = fixtureKeys().publicKey) => ({ config: fixtureConfig(publicKey), versions: FIXTURE_VERSIONS });

describe("selection", () => {
  test("DEPLOYMENT is mandatory: unset, empty, malformed and unknown names fail naming only the variable", () => {
    const cases: [Record<string, string | undefined>, string][] = [
      [{}, "DEPLOYMENT is not set"],
      [{ DEPLOYMENT: undefined }, "DEPLOYMENT is not set"],
      [{ DEPLOYMENT: "" }, "DEPLOYMENT is not set"],
      ...["../pirax", "pirax/", "deployments/pirax", "Pirax", " pirax", "pirax ", "pi rax", ".", "..", ".pirax", "pirax--x", "-pirax", "pirax-", "pirax\n", "/tmp", `${SENTINEL}/../x`].map(
        (name): [Record<string, string>, string] => [{ DEPLOYMENT: name }, "DEPLOYMENT is not a valid deployment name"],
      ),
      [{ DEPLOYMENT: "sk-live-deployment-sentinel" }, "DEPLOYMENT names no deployment folder"],
    ];
    for (const [env, expected] of cases) {
      const { field, message } = refusal(() => loadDeployment({ env }));
      expect({ env, field, message }).toEqual({ env, field: "DEPLOYMENT", message: expected });
      expect(message).not.toContain("sentinel");
    }
  });

  test("there is no fallback: selection comes only from the given environment, never a default deployment", () => {
    withRoot((root) => {
      writeDeployment(root, "pirax", fixture());
      expect(refusal(() => loadDeployment({ root, env: {} })).message).toBe("DEPLOYMENT is not set");
      expect(loadDeployment({ root, env: { DEPLOYMENT: "pirax" } }).name).toBe("pirax");
    });
  });

  test("the deployment folder and its data files must be plain entries inside the repository's deployments/", () => {
    withRoot((root) => {
      const outside = mkdtempSync(join(tmpdir(), "deployment-outside-"));
      try {
        writeDeployment(root, "fixture", fixture());
        writeDeployment(outside, "elsewhere", fixture());
        symlinkSync(join(root, "deployments/fixture"), join(root, "deployments/alias"));
        symlinkSync(join(outside, "deployments/elsewhere"), join(root, "deployments/escape"));
        const linked = (name: string, file: string, target: string) => {
          writeDeployment(root, name, fixture());
          rmSync(join(root, "deployments", name, file));
          symlinkSync(target, join(root, "deployments", name, file));
        };
        linked("versions-out", "versions.json", join(outside, "deployments/elsewhere/versions.json"));
        linked("config-in", "config.json", join(root, "deployments/fixture/config.json"));
        linked("sites-out", "sites.yaml", join(outside, "deployments/elsewhere/sites.yaml"));
        writeDeployment(root, "no-sites", fixture());
        rmSync(join(root, "deployments/no-sites/sites.yaml"));
        writeDeployment(root, "config-dir", fixture());
        rmSync(join(root, "deployments/config-dir/config.json"));
        mkdirSync(join(root, "deployments/config-dir/config.json"));
        writeFileSync(join(root, "deployments/not-a-folder"), "x");

        const cases: [string, string][] = [
          ["alias", "DEPLOYMENT is a link or outside its folder"],
          ["escape", "DEPLOYMENT is a link or outside its folder"],
          ["versions-out", "versions is a link or outside its folder"],
          ["config-in", "config is a link or outside its folder"],
          ["sites-out", "sites is a link or outside its folder"],
          ["no-sites", "sites cannot be read"],
          ["config-dir", "config cannot be read"],
          ["not-a-folder", "DEPLOYMENT names no deployment folder"],
        ];
        for (const [name, expected] of cases) expect({ name, message: refusal(() => loadDeployment({ root, env: { DEPLOYMENT: name } })).message }).toEqual({ name, message: expected });
        expect(loadDeployment({ root, env: { DEPLOYMENT: "fixture" } }).directory).toBe(join(realpathSync(root), "deployments/fixture"));
      } finally {
        rmSync(outside, { recursive: true, force: true });
      }
    });
    withRoot((root) => expect(refusal(() => loadDeployment({ root, env: { DEPLOYMENT: "pirax" } })).message).toBe("DEPLOYMENT names no deployment folder"));
    withRoot((root) => {
      const outside = mkdtempSync(join(tmpdir(), "deployment-outside-"));
      try {
        writeDeployment(outside, "fixture", fixture());
        symlinkSync(join(outside, "deployments"), join(root, "deployments"));
        expect(refusal(() => loadDeployment({ root, env: { DEPLOYMENT: "fixture" } })).message).toBe("DEPLOYMENT is a link or outside its folder");
      } finally {
        rmSync(outside, { recursive: true, force: true });
      }
    });
  });

  test("importing is side-effect free and the default root is the repository, not the working directory", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "deployment-cwd-"));
    try {
      const run = async (code: string, env: Record<string, string>) => {
        const proc = Bun.spawn([process.execPath, "--no-env-file", "-e", code], { cwd, env: { PATH: process.env.PATH!, ...env }, stdout: "pipe", stderr: "pipe" });
        const [stdout, stderr, exit] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
        return { stdout, stderr, exit };
      };
      const module = JSON.stringify(join(ROOT, "src/deployment.ts"));
      expect(await run(`await import(${module})`, {})).toEqual({ stdout: "", stderr: "", exit: 0 });
      const read = await run(`const m = await import(${module}); console.log(JSON.stringify(m.loadDeployment().versions))`, { DEPLOYMENT: "pirax" });
      expect(read.exit).toBe(0);
      expect(JSON.parse(read.stdout)).toEqual(loadDeployment({ env: { DEPLOYMENT: "pirax" } }).versions);
      const unset = await run(`const m = await import(${module}); try { m.loadDeployment(); } catch (e) { console.log(e.name + ": " + e.message); }`, {});
      expect(unset.stdout).toBe("DeploymentConfigError: DEPLOYMENT is not set\n");
      expect(existsSync(join(cwd, "deployments"))).toBe(false);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});

describe("Pirax data", () => {
  const pirax = loadDeployment({ env: { DEPLOYMENT: "pirax" } });

  test("deployments/pirax holds the five audited pins, the helper version and the public identity, channel, notice and filler", () => {
    expect(pirax.name).toBe("pirax");
    expect(pirax.directory).toBe(join(realpathSync(ROOT), "deployments/pirax"));
    expect(Object.keys(pirax.versions.audited)).toEqual([...PIN_KEYS]);
    expect(pirax.assets.basename).toBe(`${pirax.config.plugin.slug}/${pirax.config.plugin.slug}.php`);
    expect(pirax.config.channel.releasesRoot).toBe(`https://github.com/${pirax.config.channel.repository}/releases`);
    for (const value of [pirax.config.notice.recipient, pirax.config.notice.subjectPrefix, pirax.config.forms.text, pirax.config.forms.message, pirax.config.forms.refusalPrefix]) expect(value.trim()).toBe(value);
  });

  test("the committed versions.json is in canonical form, so a bump rewrites only changed values", () => {
    expect(readFileSync(pirax.paths.versions, "utf8")).toBe(formatVersions(pirax.versions));
  });

  test("the site list and its example moved into the deployment; the repository root has neither", () => {
    expect(pirax.paths.sites).toBe(join(pirax.directory, "sites.yaml"));
    expect(existsSync(pirax.paths.sites)).toBe(true);
    expect(existsSync(join(pirax.directory, "sites.example.yaml"))).toBe(true);
    expect(existsSync(join(ROOT, "sites.yaml"))).toBe(false);
    expect(existsSync(join(ROOT, "sites.example.yaml"))).toBe(false);
  });
});

describe("snapshot", () => {
  test("names, paths and URLs derive from the configured slug and channel", () => {
    withRoot((root) => {
      const { publicKey } = fixtureKeys();
      writeDeployment(root, "fixture", fixture(publicKey));
      const d: Deployment = loadDeployment({ root, env: { DEPLOYMENT: "fixture" } });
      const directory = join(realpathSync(root), "deployments/fixture");
      expect({ name: d.name, root: d.root, directory: d.directory, paths: d.paths, assets: d.assets, packageUrl: d.packageUrl, remote: d.remote }).toEqual({
        name: "fixture",
        root: realpathSync(root),
        directory,
        paths: { config: join(directory, "config.json"), versions: join(directory, "versions.json"), sites: join(directory, "sites.yaml") },
        assets: {
          main: "acme-form-check.php",
          basename: "acme-form-check/acme-form-check.php",
          zip: "acme-form-check.zip",
          manifest: "acme-form-check-manifest.json",
          signature: "acme-form-check-manifest.json.sig",
        },
        packageUrl: "https://github.com/acme-fixture/acme-form-check-channel/releases/download/v1.4.9/acme-form-check.zip",
        remote: "https://github.com/acme-fixture/acme-form-check-channel.git",
      });
      expect(d.config).toEqual(fixtureConfig(publicKey) as Deployment["config"]);
      expect(d.versions).toEqual(FIXTURE_VERSIONS as Deployment["versions"]);
    });
  });

  test("two deployments load independently in one process, and each snapshot is immutable", () => {
    withRoot((root) => {
      writeDeployment(root, "fixture", fixture());
      const beta = fixtureConfig(fixtureKeys().publicKey);
      beta.plugin.slug = "beta-form-check";
      writeDeployment(root, "beta", { config: beta, versions: { ...FIXTURE_VERSIONS, helperVersion: "2.0.1" } });
      const a = loadDeployment({ root, env: { DEPLOYMENT: "fixture" } });
      const pirax = loadDeployment({ env: { DEPLOYMENT: "pirax" } });
      const b = loadDeployment({ root, env: { DEPLOYMENT: "beta" } });
      expect([a.assets.zip, b.assets.zip, loadDeployment({ root, env: { DEPLOYMENT: "fixture" } }).assets.zip]).toEqual(["acme-form-check.zip", "beta-form-check.zip", "acme-form-check.zip"]);
      expect([a.versions.helperVersion, b.versions.helperVersion]).toEqual(["1.4.9", "2.0.1"]);
      expect(pirax.config.plugin.slug).not.toBe(a.config.plugin.slug);
      for (const frozen of [a, a.config, a.config.plugin, a.versions, a.versions.audited, a.paths, a.assets]) expect(Object.isFrozen(frozen)).toBe(true);
      expect(() => {
        (a.versions.audited as { gf: string }).gf = "0.0.1";
      }).toThrow(TypeError);
      expect(loadDeployment({ root, env: { DEPLOYMENT: "fixture" } }).versions.audited.gf).toBe("9.1.1");
    });
  });
});

describe("schema", () => {
  const valid = fixtureConfig(fixtureKeys().publicKey);
  const config = (edit: (c: Config & Record<string, unknown>) => void) => {
    const c = structuredClone(valid) as Config & Record<string, unknown>;
    edit(c);
    return JSON.stringify(c);
  };
  const versions = (edit: (v: Versions & Record<string, unknown>) => void) => {
    const v = structuredClone(FIXTURE_VERSIONS) as Versions & Record<string, unknown>;
    edit(v);
    return JSON.stringify(v);
  };
  const drop = (o: object, key: string) => delete (o as Record<string, unknown>)[key];
  const set = (o: object, key: string, value: unknown) => ((o as Record<string, unknown>)[key] = value);

  test("valid files parse to exactly their values", () => {
    expect(parseConfig(JSON.stringify(valid))).toEqual(valid as ReturnType<typeof parseConfig>);
    expect(parseVersions(JSON.stringify(FIXTURE_VERSIONS))).toEqual(FIXTURE_VERSIONS as ReturnType<typeof parseVersions>);
    const loopback = config((c) => (c.channel.releasesRoot = "http://127.0.0.1:8123/acme-fixture/acme-form-check-channel/releases"));
    expect(parseConfig(loopback).channel.releasesRoot).toBe("http://127.0.0.1:8123/acme-fixture/acme-form-check-channel/releases");
    // Key order in the file does not matter; the parsed record is canonical.
    const reordered = JSON.stringify({ audited: Object.fromEntries(Object.entries(FIXTURE_VERSIONS.audited).reverse()), helperVersion: "1.4.9", schemaVersion: 1 });
    expect(formatVersions(parseVersions(reordered))).toBe(`${JSON.stringify(FIXTURE_VERSIONS, null, 2)}\n`);
  });

  test("config refusals name the schema field and a fixed reason, never the rejected content", () => {
    const cases: Record<string, [string, string]> = {
      "malformed JSON": [`{"plugin": "${SENTINEL}`, "config is not valid JSON"],
      "not an object": ["[]", "config is invalid"],
      "unknown top-level field": [config((c) => set(c, SENTINEL, "x")), "config has an unknown field"],
      "private key field": [config((c) => set(c.channel, "privateKey", SENTINEL)), "config.channel has an unknown field"],
      "unknown plugin field": [config((c) => set(c.plugin, "version", "1.0")), "config.plugin has an unknown field"],
      "schema version": [config((c) => set(c, "schemaVersion", 2)), "config.schemaVersion is invalid"],
      "no schema version": [config((c) => drop(c, "schemaVersion")), "config.schemaVersion is missing"],
      "plugin not an object": [config((c) => set(c, "plugin", [SENTINEL])), "config.plugin is invalid"],
      "no notice": [config((c) => drop(c, "notice")), "config.notice is missing"],
      "no name": [config((c) => drop(c.plugin, "name")), "config.plugin.name is missing"],
      "blank name": [config((c) => (c.plugin.name = "   ")), "config.plugin.name is invalid"],
      "name with a newline": [config((c) => (c.plugin.name = `Acme\n * Plugin Name: ${SENTINEL}`)), "config.plugin.name is invalid"],
      "name with markup": [config((c) => (c.plugin.name = `<b>${SENTINEL}</b>`)), "config.plugin.name is invalid"],
      "name with a backtick": [config((c) => (c.plugin.name = "Acme `x`")), "config.plugin.name is invalid"],
      "name padded": [config((c) => (c.plugin.name = " Acme")), "config.plugin.name is invalid"],
      "author not a string": [config((c) => set(c.plugin, "author", 5)), "config.plugin.author is invalid"],
      "description closing a comment": [config((c) => (c.plugin.description = "Ends the header */ early")), "config.plugin.description is invalid"],
      "description with a carriage return": [config((c) => (c.plugin.description = "One\rTwo")), "config.plugin.description is invalid"],
      "uppercase slug": [config((c) => (c.plugin.slug = "Acme-form")), "config.plugin.slug is invalid"],
      "double-hyphen slug": [config((c) => (c.plugin.slug = "acme--form")), "config.plugin.slug is invalid"],
      "traversal slug": [config((c) => (c.plugin.slug = "../acme")), "config.plugin.slug is invalid"],
      "plain-http Update URI": [config((c) => (c.plugin.updateUri = "http://github.com/acme-fixture/acme-form-check-channel")), "config.plugin.updateUri is invalid"],
      "Update URI with credentials": [config((c) => (c.plugin.updateUri = `https://user:${SENTINEL}@github.com/acme-fixture/x`)), "config.plugin.updateUri is invalid"],
      "Update URI with a query": [config((c) => (c.plugin.updateUri = `https://github.com/acme-fixture/x?token=${SENTINEL}`)), "config.plugin.updateUri is invalid"],
      "Update URI with a fragment": [config((c) => (c.plugin.updateUri = "https://github.com/acme-fixture/x#y")), "config.plugin.updateUri is invalid"],
      "Update URI not canonical": [config((c) => (c.plugin.updateUri = "https://GitHub.com/acme-fixture/x")), "config.plugin.updateUri is invalid"],
      "Update URI not a URL": [config((c) => (c.plugin.updateUri = SENTINEL)), "config.plugin.updateUri is invalid"],
      "Update URI closing the header comment": [config((c) => (c.plugin.updateUri = "https://github.com/acme-fixture/x*/phpinfo();/*")), "config.plugin.updateUri is invalid"],
      "Update URI with a quote": [config((c) => (c.plugin.updateUri = "https://github.com/acme-fixture/x'y")), "config.plugin.updateUri is invalid"],
      "repository without owner": [config((c) => (c.channel.repository = "acme-form-check-channel")), "config.channel.repository is invalid"],
      "repository with a path": [config((c) => (c.channel.repository = "acme-fixture/acme/x")), "config.channel.repository is invalid"],
      "repository dot name": [config((c) => (c.channel.repository = "acme-fixture/..")), "config.channel.repository is invalid"],
      "releases root of another repository": [config((c) => (c.channel.releasesRoot = "https://github.com/CastrumS/pirax-castrum-maintenance/releases")), "config.channel.releasesRoot is invalid"],
      "releases root with a trailing slash": [config((c) => (c.channel.releasesRoot = `${valid.channel.releasesRoot}/`)), "config.channel.releasesRoot is invalid"],
      "plain-http releases root off loopback": [config((c) => (c.channel.releasesRoot = "http://github.com/acme-fixture/acme-form-check-channel/releases")), "config.channel.releasesRoot is invalid"],
      "loopback releases root with another path": [config((c) => (c.channel.releasesRoot = "http://127.0.0.1:8123/other/repo/releases")), "config.channel.releasesRoot is invalid"],
      "releases root with credentials": [config((c) => (c.channel.releasesRoot = `https://x:${SENTINEL}@github.com/acme-fixture/acme-form-check-channel/releases`)), "config.channel.releasesRoot is invalid"],
      "31-byte public key": [config((c) => (c.channel.publicKey = Buffer.alloc(31, 7).toString("base64"))), "config.channel.publicKey is invalid"],
      "noncanonical public key": [config((c) => (c.channel.publicKey = `${valid.channel.publicKey.slice(0, -1)} `)), "config.channel.publicKey is invalid"],
      "url-safe public key": [config((c) => (c.channel.publicKey = Buffer.alloc(32, 251).toString("base64url"))), "config.channel.publicKey is invalid"],
      "two recipients": [config((c) => (c.notice.recipient = "a@acme.example, b@acme.example")), "config.notice.recipient is invalid"],
      "recipient with a display name": [config((c) => (c.notice.recipient = "Acme <a@acme.example>")), "config.notice.recipient is invalid"],
      "recipient with a header": [config((c) => (c.notice.recipient = `a@acme.example\r\nBcc: ${SENTINEL}@x.example`)), "config.notice.recipient is invalid"],
      "subject prefix with a header": [config((c) => (c.notice.subjectPrefix = `[acme]\r\nBcc: ${SENTINEL}`)), "config.notice.subjectPrefix is invalid"],
      "blank subject prefix": [config((c) => (c.notice.subjectPrefix = "")), "config.notice.subjectPrefix is invalid"],
      "refusal prefix ending in a space": [config((c) => (c.forms.refusalPrefix = "Acme test blocked: ")), "config.forms.refusalPrefix is invalid"],
      "refusal prefix with a pipe": [config((c) => (c.forms.refusalPrefix = "Acme | blocked:")), "config.forms.refusalPrefix is invalid"],
      "blank filler text": [config((c) => (c.forms.text = "")), "config.forms.text is invalid"],
      "multi-line filler message": [config((c) => (c.forms.message = "line\nline")), "config.forms.message is invalid"],
    };
    for (const [name, [text, expected]] of Object.entries(cases)) {
      const { field, message } = refusal(() => parseConfig(text));
      expect({ name, message, field: message.startsWith(field) }).toEqual({ name, message: expected, field: true });
      expect(message).not.toContain(SENTINEL);
    }
  });

  test("versions refusals keep the fixed five keys and the stable dotted-numeric rule", () => {
    const cases: Record<string, [string, string]> = {
      "malformed JSON": [`{"audited": ${SENTINEL}`, "versions is not valid JSON"],
      "missing pin": [versions((v) => drop(v.audited, "fluent_smtp")), "versions.audited.fluent_smtp is missing"],
      "sixth pin": [versions((v) => set(v.audited, SENTINEL, "1.0")), "versions.audited has an unknown field"],
      "prerelease pin": [versions((v) => (v.audited.ff = "9.2.2-beta")), "versions.audited.ff is invalid"],
      "leading zero": [versions((v) => (v.audited.gf = "09.1")), "versions.audited.gf is invalid"],
      "five components": [versions((v) => (v.audited.cleantalk = "1.2.3.4.5")), "versions.audited.cleantalk is invalid"],
      "one component": [versions((v) => (v.audited.ff_pro = "9")), "versions.audited.ff_pro is invalid"],
      "numeric pin": [versions((v) => set(v.audited, "gf", 9.1)), "versions.audited.gf is invalid"],
      "private text as a pin": [versions((v) => (v.audited.gf = SENTINEL)), "versions.audited.gf is invalid"],
      "v-prefixed helper": [versions((v) => (v.helperVersion = "v1.4.9")), "versions.helperVersion is invalid"],
      "no helper version": [versions((v) => drop(v, "helperVersion")), "versions.helperVersion is missing"],
      "string schema version": [versions((v) => set(v, "schemaVersion", "1")), "versions.schemaVersion is invalid"],
      "extra field": [versions((v) => set(v, "notes", SENTINEL)), "versions has an unknown field"],
      "audited not an object": [versions((v) => set(v, "audited", null)), "versions.audited is invalid"],
    };
    for (const [name, [text, expected]] of Object.entries(cases)) {
      const { message } = refusal(() => parseVersions(text));
      expect({ name, message }).toEqual({ name, message: expected });
      expect(message).not.toContain(SENTINEL);
    }
  });

  test("a deployment with an invalid file is refused by the loader with the same field", () => {
    withRoot((root) => {
      writeDeployment(root, "fixture", { config: { ...valid, plugin: { ...valid.plugin, slug: "Bad" } }, versions: FIXTURE_VERSIONS });
      writeDeployment(root, "pins", { config: valid, versions: { ...FIXTURE_VERSIONS, audited: { ...FIXTURE_VERSIONS.audited, gf: "x" } } });
      expect(refusal(() => loadDeployment({ root, env: { DEPLOYMENT: "fixture" } }))).toEqual({ field: "config.plugin.slug", message: "config.plugin.slug is invalid" });
      expect(refusal(() => loadDeployment({ root, env: { DEPLOYMENT: "pins" } }))).toEqual({ field: "versions.audited.gf", message: "versions.audited.gf is invalid" });
    });
  });
});
