// Archive children never receive the helper signing seed (plan D8), while the parent still scans for it.
// A fresh Bun child starts with a synthetic seed and wrapped zip/unzip first on PATH; the wrappers log
// only whether the variable reached them, then run the real tools. No credentials needed:
// bun --no-env-file test test/plugin/artifacts.test.ts
import { expect, test } from "bun:test";
import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { withoutSigningKey } from "../../scripts/build-plugin";

test("findSecret and sanitizeZip keep the signing seed for scanning but not for their zip/unzip children", async () => {
  const dir = await mkdtemp(join(tmpdir(), "pirax-archive-env-"));
  try {
    const bin = join(dir, "bin");
    const log = join(dir, "children.log");
    await mkdir(bin);
    for (const tool of ["zip", "unzip"]) {
      const wrapper = join(bin, tool);
      await writeFile(wrapper, `#!/bin/sh\n[ -n "\${PIRAX_HELPER_SIGNING_KEY+x}" ] && p=true || p=false\necho "${tool} $p" >> '${log}'\nexec '${Bun.which(tool)}' "$@"\n`);
      await chmod(wrapper, 0o755);
    }
    const seed = `synthetic-signing-canary-${crypto.randomUUID()}`;
    await mkdir(join(dir, "scan"));
    await writeFile(join(dir, "entry.txt"), `before ${seed} after\n`);
    await Bun.$`zip -q ${join(dir, "scan/archive.zip")} entry.txt`.cwd(dir).env(withoutSigningKey());

    const child = `
      import { findSecret, sanitizeZip } from ${JSON.stringify(join(import.meta.dir, "artifacts.ts"))};
      const key = process.env.PIRAX_HELPER_SIGNING_KEY;
      const scan = ${JSON.stringify(join(dir, "scan"))};
      const before = (await findSecret(scan, [key])).length;
      const scrubbed = await sanitizeZip(scan + "/archive.zip", [key]);
      const after = (await findSecret(scan, [key])).length;
      console.log(JSON.stringify({ before, scrubbed, after, parentKept: process.env.PIRAX_HELPER_SIGNING_KEY === key }));`;
    const proc = Bun.spawn([process.execPath, "--no-env-file", "-e", child], {
      cwd: dir,
      env: { PATH: `${bin}:${process.env.PATH}`, HOME: process.env.HOME, PIRAX_HELPER_SIGNING_KEY: seed },
      stdout: "pipe",
      stderr: "inherit",
    });
    // Assertions see only counts and presence booleans, never the seed.
    expect(await proc.exited).toBe(0);
    expect(JSON.parse(await new Response(proc.stdout).text())).toEqual({ before: 1, scrubbed: 1, after: 0, parentKept: true });
    expect((await Bun.file(log).text()).trim().split("\n")).toEqual(["unzip false", "unzip false", "zip false", "unzip false"]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
