// Builds the selected deployment's uploadable helper, dist/<slug>.zip rooted at <slug>/, from the templates in
// plugin/pirax-form-test/ rendered by render-plugin.ts, with the main file renamed to <slug>.php. Only the explicit
// allowlist may be in the template directory, so tests, fixtures and credentials can never be packaged by accident.
// Before anything is written, the final bytes are checked: read back by plugin-source.ts's strict parsers, the
// pins, helper version and public key must be the deployment's, and no known secret's value may appear.
// Templates and deployment data are only read. Other dist/ files (release assets) are left alone.
// Usage: DEPLOYMENT=<name> bun run build:plugin   (DEPLOYMENT unset, empty or unknown is a configuration error)
// Import-safe: buildPlugin({ deployment, source, zip }) builds a loaded deployment, or a template copy (test
// fixtures), with the same checks.
import { mkdir, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { loadDeployment, PIN_KEYS, type Deployment } from "../src/deployment.ts";
import { only, parseAuditedVersions, parseHelperVersion } from "./plugin-source.ts";
import { FILES, renderPlugin, SOURCE } from "./render-plugin.ts";

export { FILES };
const ROOT = resolve(import.meta.dir, "..");
/** Environment variables whose values must never be packaged; only their names are reported. */
const SECRETS = ["FORM_TEST_TOKEN", "GRAVITY_FORMS_ZIP", "PIRAX_HELPER_SIGNING_KEY"];

/** This environment without the helper signing seed, for children that never sign (zip, unzip, browsers, Playground). */
export function withoutSigningKey(env: Record<string, string | undefined> = process.env) {
  const { PIRAX_HELPER_SIGNING_KEY: _seed, ...rest } = env;
  return rest;
}

export async function buildPlugin({ deployment = loadDeployment(), source = SOURCE, zip = join(ROOT, "dist", deployment.assets.zip) }: { deployment?: Deployment; source?: string; zip?: string } = {}) {
  for (const tool of ["zip", "unzip"]) if (!Bun.which(tool)) throw new Error(`required tool '${tool}' is not on PATH`);

  const present = (await readdir(source, { recursive: true, withFileTypes: true }))
    .filter((e) => e.isFile())
    .map((e) => relative(source, join(e.parentPath, e.name)));
  const missing = FILES.filter((f) => !present.includes(f));
  const unlisted = present.filter((f) => !FILES.includes(f));
  if (missing.length) throw new Error(`allowlisted files missing: ${missing.join(", ")}`);
  if (unlisted.length) throw new Error(`files not in the production allowlist (add them to FILES or remove them): ${unlisted.join(", ")}`);

  const files = renderPlugin(deployment, source);
  const rendered = (file: string) => files.find((f) => f.file === file)!.contents;
  if (parseHelperVersion(rendered("pirax-form-test.php")) !== deployment.versions.helperVersion) throw new Error("rendered pirax-form-test.php does not hold the deployment's helper version");
  const audited = parseAuditedVersions(rendered("includes/compatibility.php"));
  if (PIN_KEYS.some((key) => audited[key] !== deployment.versions.audited[key])) throw new Error("rendered includes/compatibility.php does not hold the deployment's audited versions");
  // The updater's trust root.
  if (only(rendered("includes/updates.php"), /^const UPDATE_PUBLIC_KEY = '([^']*)';$/gm, "includes/updates.php", "UPDATE_PUBLIC_KEY") !== deployment.config.channel.publicKey)
    throw new Error("rendered includes/updates.php does not hold the deployment's public key");
  const secrets = SECRETS.filter((name) => process.env[name]);
  for (const { path, contents } of files) {
    const leaked = secrets.filter((name) => contents.includes(process.env[name]!));
    if (leaked.length) throw new Error(`${path} contains the value of ${leaked.join(", ")}`);
  }

  const slug = deployment.config.plugin.slug;
  const stage = await mkdtemp(join(tmpdir(), `${slug}-build-`));
  try {
    for (const { path, contents } of files) {
      await mkdir(dirname(join(stage, path)), { recursive: true });
      await Bun.write(join(stage, path), contents);
    }
    await mkdir(dirname(zip), { recursive: true });
    await rm(zip, { force: true });
    await Bun.$`zip -q -r -X ${zip} ${slug}`.cwd(stage).env({ PATH: process.env.PATH, TMPDIR: process.env.TMPDIR, LANG: process.env.LANG, LC_ALL: process.env.LC_ALL }).quiet();
  } finally {
    await rm(stage, { recursive: true, force: true });
  }

  const entries = (await Bun.$`unzip -Z1 ${zip}`.env({ PATH: process.env.PATH, TMPDIR: process.env.TMPDIR, LANG: process.env.LANG, LC_ALL: process.env.LC_ALL }).text()).trim().split("\n").filter((e) => !e.endsWith("/"));
  const expected = files.map((f) => f.path).sort();
  if (JSON.stringify(entries.sort()) !== JSON.stringify(expected)) throw new Error(`archive contents differ from the allowlist: ${entries.join(", ")}`);

  const sha256 = new Bun.CryptoHasher("sha256").update(await Bun.file(zip).bytes()).digest("hex");
  return { zip, entries, sha256 };
}

if (import.meta.main) {
  try {
    const { zip, entries, sha256 } = await buildPlugin();
    console.log(`${relative(ROOT, zip)} (${entries.length} files, sha256 ${sha256})`);
  } catch (error) {
    console.error(`build:plugin: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}
