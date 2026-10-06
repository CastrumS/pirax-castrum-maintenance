// Archive children never receive the helper signing seed (plan D8) or any other credential (plan D10), while the
// parent still scans for the seed. A fresh Bun child starts with synthetic credentials and wrapped zip/unzip first
// on PATH; the wrappers log only which credential names reached them, then run the real tools. No credentials needed:
// bun --no-env-file test test/plugin/artifacts.test.ts
import { expect, test } from "bun:test";
import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { withoutSigningKey } from "../../scripts/build-plugin";

const CREDENTIALS = ["PIRAX_HELPER_SIGNING_KEY", "GPLVAULT_LICENSE_KEY", "GPLVAULT_UPDATER_PASSPHRASE", "IMAP_PASSWORD", "GH_TOKEN", "GITHUB_TOKEN", "FORM_TEST_TOKEN"];

test("findSecret and sanitizeZip keep the signing seed for scanning but give their zip/unzip children no credential", async () => {
  const dir = await mkdtemp(join(tmpdir(), "pirax-archive-env-"));
  try {
    const bin = join(dir, "bin");
    const log = join(dir, "children.log");
    await mkdir(bin);
    for (const tool of ["zip", "unzip"]) {
      const wrapper = join(bin, tool);
      const names = CREDENTIALS.map((n) => `[ -n "\${${n}+x}" ] && p="$p ${n}"`).join("\n");
      await writeFile(wrapper, `#!/bin/sh\np=""\n${names}\necho "${tool}\${p:- none}" >> '${log}'\nexec '${Bun.which(tool)}' "$@"\n`);
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
      env: { ...Object.fromEntries(CREDENTIALS.map((n) => [n, `synthetic-${n}`])), PATH: `${bin}:${process.env.PATH}`, HOME: process.env.HOME, PIRAX_HELPER_SIGNING_KEY: seed },
      stdout: "pipe",
      stderr: "inherit",
    });
    // Assertions see only counts and presence booleans, never the seed.
    expect(await proc.exited).toBe(0);
    expect(JSON.parse(await new Response(proc.stdout).text())).toEqual({ before: 1, scrubbed: 1, after: 0, parentKept: true });
    expect((await Bun.file(log).text()).trim().split("\n")).toEqual(["unzip none", "unzip none", "zip none", "unzip none"]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
