// Repair-pass retention; values enter only through Bun's loader, never environment-file IO.
import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { findSecret } from '/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/worktrees/reaudit-job/test/plugin/artifacts.ts';
import { secretValues } from '/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/worktrees/reaudit-job/scripts/reaudit/privacy.ts';
const [mode, label] = process.argv.slice(2);
if (!['--before', '--retain'].includes(mode!) || !/^repair-[1-3]$/.test(label!)) throw new Error('usage: repair-evidence.ts --before|--retain repair-N');
const lane = '/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/worktrees/reaudit-job';
const snapshot = join(import.meta.dir, 'evidence', `${label}-before.json`);
const targetRoot = join(import.meta.dir, `evidence-${label}-final`);
async function scopes() {
  const result: string[] = [];
  for (const root of ['artifacts/plugin', 'runs'])
    for (const e of await readdir(join(lane, root), { withFileTypes: true }).catch(() => []))
      if (e.isDirectory()) result.push(`${root}/${e.name}`);
  return result.sort();
}
if (mode === '--before') {
  await writeFile(snapshot, JSON.stringify(await scopes(), null, 2) + '\n');
  console.log('repair final evidence baseline recorded');
} else {
  const old = new Set<string>(JSON.parse(await readFile(snapshot, 'utf8')));
  const fresh = (await scopes()).filter(s => !old.has(s));
  if (!fresh.some(s => s.startsWith('artifacts/plugin/compatibility-')) || !fresh.some(s => s.startsWith('artifacts/plugin/updates-'))) throw new Error('expected final native scopes missing');
  let placeholders = 0;
  for (const scope of fresh) {
    if (!/^(?:artifacts\/plugin|runs)\/[a-zA-Z0-9_.:-]+$/.test(scope)) throw new Error('invalid evidence scope');
    const source = join(lane, scope);
    for (const e of await readdir(source, { recursive: true, withFileTypes: true }))
      if (e.name === '.env' || e.name.startsWith('.env.') || e.isSymbolicLink()) throw new Error('forbidden retention entry');
    const target = join(targetRoot, 'native', scope);
    await mkdir(target, { recursive: true });
    await cp(source, target, { recursive: true });
    if (scope.startsWith('runs/forms-report-tests-'))
      for (const e of await readdir(target, { recursive: true, withFileTypes: true }))
        if (e.isFile() && e.name.endsWith('.zip')) {
          const path = join(e.parentPath, e.name);
          if ((await readFile(path)).equals(Buffer.from('local trace'))) { await rm(path); placeholders++; }
        }
  }
  const extra = ['S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY', 'SMTP_PASSWORD', 'SMTP_USER', 'FORM_TEST_ADDRESS'].flatMap(n => process.env[n] && process.env[n] !== 'piraxcastrum@gmail.com' ? [process.env[n]!] : []);
  const values = [...new Set(secretValues(process.env, extra))];
  const roots = [targetRoot, join(import.meta.dir, 'evidence'), join(import.meta.dir, 'evidence-u5')];
  let findings = 0;
  for (const root of roots) findings += (await findSecret(root, values)).length;
  const result = { nativeScopes: fresh.length, syntheticNonZipPlaceholdersOmitted: placeholders, scanRoots: roots.length, valuesLoaded: values.length, findings };
  await writeFile(join(targetRoot, 'retention.json'), JSON.stringify({ ...result, scopes: fresh }, null, 2) + '\n');
  console.log(JSON.stringify(result));
  process.exitCode = findings ? 1 : 0;
}
