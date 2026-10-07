// AC2 probe (synthetic only). Simulates a regressed seed strip (identity instead of withoutSigningKey) for
// the old env-dump assertion (baseline db2cba1) and the new presence-only line taken verbatim from
// test/plugin/updates.test.ts, each in a fresh `bun --no-env-file test` child whose whole environment is
// PATH/HOME plus generated canaries. Prints exit codes, booleans and the kind of value the matcher printed.
// (The seed literal itself is in the generated test source, so Bun's code frame shows it in both shapes.)
// Run from the worktree: bun --no-env-file <this file>
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const source = await Bun.file("test/plugin/updates.test.ts").text();
const line = source.split("\n").find((l) => l.includes("const seen = await Bun.$`sh -c"))!;
const shapes = {
  old: `const names = await Bun.$\`env\`.env(((e) => e)({ ...process.env, PIRAX_HELPER_SIGNING_KEY: "synthetic-seed-for-env-test" })).text();\n  expect(names).not.toContain("PIRAX_HELPER_SIGNING_KEY");`,
  new: `${line.replaceAll("withoutSigningKey(", "((e) => e)(")}\n  expect(seen.trim()).toBe("");`,
};
const token = `synthetic-form-token-canary-${crypto.randomUUID()}`;
const dir = await mkdtemp(join(tmpdir(), "pirax-ac2-"));
const result: Record<string, unknown> = { newLineFromUpdatesTest: Boolean(line) };
try {
  for (const [name, body] of Object.entries(shapes)) {
    const file = join(dir, `${name}.test.ts`);
    await writeFile(file, `import { expect, test } from "bun:test";\ntest("${name}", async () => {\n  ${body}\n});\n`);
    const proc = Bun.spawnSync([process.execPath, "--no-env-file", "test", file], {
      cwd: dir,
      env: { PATH: process.env.PATH, HOME: process.env.HOME, FORM_TEST_TOKEN: token },
      stdout: "pipe",
      stderr: "pipe",
    });
    const out = proc.stdout.toString() + proc.stderr.toString();
    result[name] = { exit: proc.exitCode, assertionFailed: out.includes("(fail)"), canaryPrinted: out.includes(token), received: out.includes('Received: "present"') ? "presence only" : out.includes("PIRAX_HELPER_SIGNING_KEY=") ? "environment dump" : "other" };
  }
} finally {
  await rm(dir, { recursive: true, force: true });
}
console.log(JSON.stringify(result, null, 2));
