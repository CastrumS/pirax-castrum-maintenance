// Worker u5: preserve only this fresh worktree's evidence. Never open/copy environment files or symlinks.
import { cp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { findSecret } from "/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/worktrees/reaudit-job-u5/test/plugin/artifacts.ts";
import { secretValues } from "/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/worktrees/reaudit-job-u5/scripts/reaudit/privacy.ts";
const work = "/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/worktrees/reaudit-job-u5";
const dest = import.meta.dir;
async function safeEntries(dir: string) {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  if (entries.some(e => e.isSymbolicLink() || e.name === ".env" || e.name.startsWith(".env."))) throw new Error("forbidden evidence entry");
  return entries;
}
const scopes: string[] = [];
let omitted = 0;
for (const base of ["artifacts/plugin", "runs"]) {
  for (const e of await readdir(join(work, base), { withFileTypes: true }).catch(() => [])) {
    if (e.isSymbolicLink() || e.name === ".env" || e.name.startsWith(".env.")) throw new Error("forbidden evidence scope");
    if (!e.isDirectory()) continue;
    const scope = `${base}/${e.name}`;
    const source = join(work, scope);
    await safeEntries(source);
    const target = join(dest, "native", scope);
    await mkdir(target, { recursive: true });
    await cp(source, target, { recursive: true });
    for (const file of await safeEntries(target)) {
      if (!scope.startsWith("runs/forms-report-tests-") || !file.isFile() || !file.name.endsWith(".zip")) continue;
      const path = join(file.parentPath, file.name);
      if ((await readFile(path)).equals(Buffer.from("local trace"))) { await rm(path); omitted++; }
    }
    scopes.push(scope);
  }
}
if (!scopes.some(s => s.startsWith("artifacts/plugin/compatibility-")) || !scopes.some(s => s.startsWith("artifacts/plugin/updates-"))) throw new Error("native evidence missing");
await safeEntries(dest);
const extra = ["S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY", "SMTP_PASSWORD", "SMTP_USER", "FORM_TEST_ADDRESS"].flatMap(n => process.env[n] && process.env[n] !== "piraxcastrum@gmail.com" ? [process.env[n]!] : []);
const values = secretValues(process.env, extra);
const hits = await findSecret(dest, values);
const result = { nativeScopes: scopes.length, syntheticNonZipPlaceholdersOmitted: omitted, loadedValues: values.length, findings: hits.length };
await writeFile(join(dest, "retention.json"), JSON.stringify({ ...result, scopes }, null, 2) + "\n");
console.log(JSON.stringify(result));
process.exitCode = hits.length ? 1 : 0;
