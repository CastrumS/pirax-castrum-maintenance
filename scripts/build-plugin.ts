// Builds the uploadable dist/pirax-form-test.zip (rooted at pirax-form-test/) from an explicit
// allowlist of production files, then checks the archive. Anything else in the plugin directory
// fails the build, so tests, fixtures and credentials can never be packaged by accident.
// Usage: bun run build:plugin
import { mkdir, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "..");
const SOURCE = join(ROOT, "plugin/pirax-form-test");
const ZIP = join(ROOT, "dist/pirax-form-test.zip");
const FILES = [
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
];

const fail = (message: string): never => {
  console.error(`build:plugin: ${message}`);
  process.exit(1);
};

for (const tool of ["zip", "unzip"]) if (!Bun.which(tool)) fail(`required tool '${tool}' is not on PATH`);

const present = (await readdir(SOURCE, { recursive: true, withFileTypes: true }))
  .filter((e) => e.isFile())
  .map((e) => relative(SOURCE, join(e.parentPath, e.name)));
const missing = FILES.filter((f) => !present.includes(f));
const unlisted = present.filter((f) => !FILES.includes(f));
if (missing.length) fail(`allowlisted files missing: ${missing.join(", ")}`);
if (unlisted.length) fail(`files not in the production allowlist (add them to FILES or remove them): ${unlisted.join(", ")}`);

// Credential values from the environment must never be packaged; only their names are reported.
const secrets = ["FORM_TEST_TOKEN", "GRAVITY_FORMS_ZIP"].filter((name) => process.env[name]);
for (const file of FILES) {
  const text = await Bun.file(join(SOURCE, file)).text();
  const leaked = secrets.filter((name) => text.includes(process.env[name]!));
  if (leaked.length) fail(`${file} contains the value of ${leaked.join(", ")}`);
}

const stage = await mkdtemp(join(tmpdir(), "pirax-form-test-build-"));
try {
  for (const file of FILES) {
    await mkdir(dirname(join(stage, "pirax-form-test", file)), { recursive: true });
    await Bun.write(join(stage, "pirax-form-test", file), Bun.file(join(SOURCE, file)));
  }
  await mkdir(dirname(ZIP), { recursive: true });
  await rm(ZIP, { force: true });
  await Bun.$`zip -q -r -X ${ZIP} pirax-form-test`.cwd(stage);
} finally {
  await rm(stage, { recursive: true, force: true });
}

const entries = (await Bun.$`unzip -Z1 ${ZIP}`.text()).trim().split("\n").filter((e) => !e.endsWith("/"));
const expected = FILES.map((f) => `pirax-form-test/${f}`).sort();
if (JSON.stringify(entries.sort()) !== JSON.stringify(expected)) fail(`archive contents differ from the allowlist: ${entries.join(", ")}`);

const digest = new Bun.CryptoHasher("sha256").update(await Bun.file(ZIP).bytes()).digest("hex");
console.log(`${relative(ROOT, ZIP)} (${entries.length} files, sha256 ${digest})`);
