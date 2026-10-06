// Builds the uploadable dist/pirax-form-test.zip (rooted at pirax-form-test/) from an explicit
// allowlist of production files, then checks the archive. Anything else in the plugin directory
// fails the build, so tests, fixtures and credentials can never be packaged by accident.
// Other dist/ files (release assets) are left alone; only the ZIP is rebuilt.
// Usage: bun run build:plugin
// Import-safe: buildPlugin({ source, zip }) builds a staged copy (test fixtures) with the same checks.
import { mkdir, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "..");
const SOURCE = join(ROOT, "plugin/pirax-form-test");
const ZIP = join(ROOT, "dist/pirax-form-test.zip");
export const FILES = [
  "pirax-form-test.php",
  "uninstall.php",
  "README.md",
  "includes/settings.php",
  "includes/marker.php",
  "includes/mail.php",
  "includes/compatibility.php",
  "includes/gravity-forms.php",
  "includes/fluent-forms.php",
  "includes/cleanup.php",
  "includes/updates.php",
];
/** Environment variables whose values must never be packaged; only their names are reported. */
const SECRETS = ["FORM_TEST_TOKEN", "GRAVITY_FORMS_ZIP", "PIRAX_HELPER_SIGNING_KEY"];

/** This environment without the helper signing seed, for children that never sign (zip, unzip, browsers, Playground). */
export function withoutSigningKey(env: Record<string, string | undefined> = process.env) {
  const { PIRAX_HELPER_SIGNING_KEY: _seed, ...rest } = env;
  return rest;
}

export async function buildPlugin({ source = SOURCE, zip = ZIP }: { source?: string; zip?: string } = {}) {
  for (const tool of ["zip", "unzip"]) if (!Bun.which(tool)) throw new Error(`required tool '${tool}' is not on PATH`);

  const present = (await readdir(source, { recursive: true, withFileTypes: true }))
    .filter((e) => e.isFile())
    .map((e) => relative(source, join(e.parentPath, e.name)));
  const missing = FILES.filter((f) => !present.includes(f));
  const unlisted = present.filter((f) => !FILES.includes(f));
  if (missing.length) throw new Error(`allowlisted files missing: ${missing.join(", ")}`);
  if (unlisted.length) throw new Error(`files not in the production allowlist (add them to FILES or remove them): ${unlisted.join(", ")}`);

  const secrets = SECRETS.filter((name) => process.env[name]);
  for (const file of FILES) {
    const text = await Bun.file(join(source, file)).text();
    const leaked = secrets.filter((name) => text.includes(process.env[name]!));
    if (leaked.length) throw new Error(`${file} contains the value of ${leaked.join(", ")}`);
  }
  // The updater's trust root must be a real raw Ed25519 public key, never a placeholder.
  const key = (await Bun.file(join(source, "includes/updates.php")).text()).match(/^const UPDATE_PUBLIC_KEY = '([^']*)';$/m)?.[1] ?? "";
  if (Buffer.from(key, "base64").length !== 32 || Buffer.from(key, "base64").toString("base64") !== key)
    throw new Error("includes/updates.php UPDATE_PUBLIC_KEY is not base64 of a 32-byte public key");

  const stage = await mkdtemp(join(tmpdir(), "pirax-form-test-build-"));
  try {
    for (const file of FILES) {
      await mkdir(dirname(join(stage, "pirax-form-test", file)), { recursive: true });
      await Bun.write(join(stage, "pirax-form-test", file), Bun.file(join(source, file)));
    }
    await mkdir(dirname(zip), { recursive: true });
    await rm(zip, { force: true });
    await Bun.$`zip -q -r -X ${zip} pirax-form-test`.cwd(stage).env({ PATH: process.env.PATH, TMPDIR: process.env.TMPDIR, LANG: process.env.LANG, LC_ALL: process.env.LC_ALL }).quiet();
  } finally {
    await rm(stage, { recursive: true, force: true });
  }

  const entries = (await Bun.$`unzip -Z1 ${zip}`.env({ PATH: process.env.PATH, TMPDIR: process.env.TMPDIR, LANG: process.env.LANG, LC_ALL: process.env.LC_ALL }).text()).trim().split("\n").filter((e) => !e.endsWith("/"));
  const expected = FILES.map((f) => `pirax-form-test/${f}`).sort();
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
