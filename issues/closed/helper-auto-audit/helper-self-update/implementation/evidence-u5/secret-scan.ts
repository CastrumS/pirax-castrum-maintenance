// Unit-5 privacy scan: findSecret over the given directories (ZIP entries included) for every env-loaded
// credential, and the signing seed in base64/hex/base64url forms. Prints names, paths and counts only.
// bun --env-file=/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/.env <this file> <dir>...
import { copyFile, mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { withoutSigningKey } from "/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/worktrees/helper-self-update-u5/scripts/build-plugin.ts";
import { findSecret, redact } from "/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/worktrees/helper-self-update-u5/test/plugin/artifacts.ts";

const names = ["FORM_TEST_TOKEN", "GRAVITY_FORMS_ZIP", "FLUENT_FORMS_PRO_ZIP", "PIRAX_HELPER_SIGNING_KEY", "IMAP_USER", "IMAP_PASSWORD", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY", "GPLVAULT_LICENSE_KEY"];
const seed = process.env.PIRAX_HELPER_SIGNING_KEY ?? "";
const raw = Buffer.from(seed, "base64");
const needles = [...names.map((n) => process.env[n] ?? ""), raw.toString("hex"), raw.toString("base64url")].filter(Boolean);
const dirs = process.argv.slice(2);
const hits: string[] = [];
const fallback: { dir: string; nonZipStubs: string[] }[] = [];
// A directory holding a `.zip` that is not a ZIP (test/forms/report.test.ts writes 11-byte "local trace"
// placeholders) makes findSecret's unzip fail. Fall back: raw bytes of every file, plus findSecret of each
// valid ZIP on its own.
for (const dir of dirs) {
  try {
    hits.push(...(await findSecret(dir, needles)).map((h) => `${dir}: ${h}`));
  } catch {
    const stubs: string[] = [];
    const all = (await readdir(dir, { recursive: true, withFileTypes: true })).filter((e) => e.isFile()).map((e) => join(e.parentPath, e.name));
    for (const file of all) {
      const bytes = await readFile(file);
      if (needles.some((n) => bytes.includes(Buffer.from(n)))) hits.push(`${dir}: ${file} (raw)`);
      if (!file.endsWith(".zip")) continue;
      if (Bun.spawnSync(["unzip", "-tq", file], { env: withoutSigningKey(), stdout: "ignore", stderr: "ignore" }).exitCode !== 0) { stubs.push(`${file} (${bytes.length} bytes)`); continue; }
      const one = await mkdtemp(join(tmpdir(), "pirax-u5-scan-"));
      try {
        await copyFile(file, join(one, basename(file)));
        hits.push(...(await findSecret(one, needles)).map((h) => `${file}: ${h}`));
      } finally {
        await rm(one, { recursive: true, force: true });
      }
    }
    fallback.push({ dir, nonZipStubs: stubs });
  }
}
const log = `${import.meta.dir}/changed.log`;
console.log(JSON.stringify({
  scanned: dirs,
  variablesPresent: Object.fromEntries(names.map((n) => [n, Boolean(process.env[n])])),
  signingKeyForms: ["base64", "hex", "base64url"],
  hits,
  fallback,
  changedLogRedactions: (await Bun.file(log).exists()) ? redact(await Bun.file(log).text(), needles).count : null,
}, null, 2));
