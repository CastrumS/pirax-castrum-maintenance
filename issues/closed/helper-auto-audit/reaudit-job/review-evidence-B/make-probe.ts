// Reuse the committed publication fixture, not a mock of publish/release/build/scanner.
// Its local bare remote and gh wrapper intercept every mutation. Read-only lookups remain real.
import { readFile, writeFile } from 'node:fs/promises';
const root = '/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/worktrees/reaudit-job';
let source = (await readFile(`${root}/tests/reaudit-publish.test.ts`, 'utf8')).split('test("real read-only lookup:')[0]!;
source = source.replace(/from "\.\.\/([^"]+)"/g, (_m, path) => `from "${root}/${path}"`);
source = source.replace('const ROOT = resolve(import.meta.dir, "..");', `const ROOT = ${JSON.stringify(root)};`);
source = source.replace('async function fixture() {', 'async function fixture(leak = false) {');
source = source.replace('  await writeFile(join(dir, ".gitignore"), "dist/\\n");', `  if (leak) {
    const doc = join(dir, "plugin/pirax-form-test/README.md");
    await writeFile(doc, (await readFile(doc, "utf8")) + "\\n" + encodeURIComponent(key.secrets()[0]!) + "\\n");
  }
  await writeFile(join(dir, ".gitignore"), "dist/\\n");`);
source += `
test("control: clean assets publish and independently verify at intercepted boundaries", async () => {
  const f = await fixture();
  const result = await publish({ root: f.dir, candidatePath: f.candidatePath, runId: RUN, runAttempt: ATTEMPT, env: f.env, remoteUrl: f.remote });
  expect(result.outcome).toBe("published");
  console.log(JSON.stringify({ control: result.outcome, interceptedMutations: mutations(await f.calls()).length }));
});
test("known encoded signing seed must be refused before tag/release mutation", async () => {
  const f = await fixture(true);
  const s = await failure(publish({ root: f.dir, candidatePath: f.candidatePath, runId: RUN, runAttempt: ATTEMPT, env: f.env, remoteUrl: f.remote }));
  const calls = mutations(await f.calls());
  const p = Bun.spawnSync(["unzip", "-p", join(f.state, "assets/pirax-form-test.zip"), "pirax-form-test/README.md"], { env: { PATH: process.env.PATH }, stdout: "pipe", stderr: "pipe" });
  console.log(JSON.stringify({ reason: s.reason, publication: s.publication, interceptedMutations: calls.length, uploadedZipContainsEncodedSeed: p.stdout.toString().includes(encodeURIComponent(f.seed)) }));
  expect(calls.length).toBe(0);
});
`;
await writeFile(new URL('./prepublication.test.ts', import.meta.url), source);
console.log('wrote synthetic publication probe');
