// One-time setup tests (plan D5) with synthetic secrets, real gpg and a recording stand-in for gh on PATH.
// Nothing here touches GitHub or the operator's updater ZIP.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { chmod, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { decryptUpdater } from "../scripts/reaudit/fetch";
import { SECRET_NAMES, setup } from "../scripts/reaudit/setup";

const ENV = {
  GPLVAULT_UPDATER_PASSPHRASE: "SYNTHETIC-PASSPHRASE-0123456789",
  GPLVAULT_LICENSE_KEY: "SYNTHETIC-LICENSE",
  GPLVAULT_PRODUCT_ID: "SYNTHETIC-PRODUCT",
  IMAP_USER: "synthetic@example.invalid",
  IMAP_PASSWORD: "SYNTHETIC-IMAP-PASSWORD",
  PIRAX_HELPER_SIGNING_KEY: "SYNTHETIC-SIGNING-SEED",
  FORM_TEST_TOKEN: "SYNTHETIC-TOKEN",
};
const VALUES = Object.values(ENV);

let scratch: string;
let bin: string;
let source: string;
beforeAll(async () => {
  scratch = await mkdtemp(join(tmpdir(), "reaudit-setup-"));
  bin = join(scratch, "bin");
  await mkdir(bin);
  // Records argv, environment and stdin per call under $HOME; `secret list` answers from $HOME/list.json.
  await writeFile(
    join(bin, "gh"),
    `#!/bin/sh
d="$HOME/$(date +%s%N)"; mkdir -p "$d"
printf '%s\\n' "$@" > "$d/argv"; env > "$d/env"; cat > "$d/stdin"
if [ "$2" = list ]; then cat "$HOME/list.json"; fi
`,
  );
  await chmod(join(bin, "gh"), 0o755);
  const plugin = join(scratch, "plugin");
  await mkdir(join(plugin, "gplvault-updater"), { recursive: true });
  await writeFile(join(plugin, "gplvault-updater/gplvault-updater.php"), "<?php\n/*\n * Plugin Name: GPLVault Update Manager\n * Version: 5.3.9\n */\n");
  source = join(scratch, "gplvault-updater.zip");
  const zip = Bun.spawn(["zip", "-q", "-r", "-X", source, "gplvault-updater"], { cwd: plugin });
  expect(await zip.exited).toBe(0);
});
afterAll(() => rm(scratch, { recursive: true, force: true }));

async function runSetup(options: { env?: Record<string, string>; ciphertext?: string; secrets?: string[] } = {}) {
  const calls = await mkdtemp(join(scratch, "calls-"));
  const list = join(calls, "list.json");
  await writeFile(list, JSON.stringify((options.secrets ?? ["PIRAX_HELPER_SIGNING_KEY"]).map((name) => ({ name }))));
  const output: string[] = [];
  const ciphertext = options.ciphertext ?? join(await mkdtemp(join(scratch, "repo-")), "gplvault-updater.zip.gpg");
  const error = await setup({
    env: { ...(options.env ?? ENV), PATH: `${bin}:${process.env.PATH}`, HOME: calls },
    source,
    ciphertext,
    repo: "example/repo",
    log: (line) => output.push(line),
  }).then(
    () => undefined,
    (e: Error) => e,
  );
  const recorded = [];
  for (const entry of (await readdir(calls)).filter((e) => e !== "list.json").sort()) {
    const read = (f: string) => readFile(join(calls, entry, f), "utf8");
    recorded.push({ argv: (await read("argv")).trim().split("\n"), env: await read("env"), stdin: await read("stdin") });
  }
  return { error, output, recorded, ciphertext };
}

const sha = async (path: string) => createHash("sha256").update(await readFile(path)).digest("hex");

describe("setup", () => {
  test("encrypts the official updater, verifies the round trip and streams each secret on stdin", async () => {
    const { error, output, recorded, ciphertext } = await runSetup();
    expect(error).toBeUndefined();
    const plain = join(scratch, "roundtrip.zip");
    await decryptUpdater(ciphertext, plain, ENV.GPLVAULT_UPDATER_PASSPHRASE);
    expect(await sha(plain)).toBe(await sha(source));
    expect(await readFile(ciphertext)).not.toContain(Buffer.from("GPLVault Update Manager"));

    const sets = recorded.filter((c) => c.argv[1] === "set");
    expect(sets.map((c) => c.argv)).toEqual(SECRET_NAMES.map((name) => ["secret", "set", name, "--repo", "example/repo"]));
    expect(SECRET_NAMES).not.toContain("PIRAX_HELPER_SIGNING_KEY");
    for (const call of sets) expect(call.stdin).toBe(ENV[call.argv[2] as keyof typeof ENV]);
    // No secret reaches gh's argv or environment, nor the console.
    for (const call of recorded) for (const value of VALUES) expect(call.argv.join(" ") + call.env).not.toContain(value);
    for (const value of VALUES) expect(output.join("\n")).not.toContain(value);
    expect(output.join("\n")).toContain("5.3.9");
  });

  test("rerunning with the same passphrase and source keeps the ciphertext byte-identical", async () => {
    const first = await runSetup();
    const before = await sha(first.ciphertext);
    const second = await runSetup({ ciphertext: first.ciphertext });
    expect(second.error).toBeUndefined();
    expect(await sha(first.ciphertext)).toBe(before);
  });

  test("refuses an existing ciphertext that the passphrase cannot open, without writing anything", async () => {
    const first = await runSetup();
    const before = await sha(first.ciphertext);
    const { error, recorded } = await runSetup({ ciphertext: first.ciphertext, env: { ...ENV, GPLVAULT_UPDATER_PASSPHRASE: "SYNTHETIC-OTHER-PASSPHRASE-XYZ" } });
    expect(error!.message).toBe("setup: existing ciphertext does not decrypt with GPLVAULT_UPDATER_PASSPHRASE; refusing to rotate");
    expect(recorded.filter((c) => c.argv[1] === "set")).toEqual([]);
    expect(await sha(first.ciphertext)).toBe(before);
  });

  test("refuses an existing ciphertext holding a different updater", async () => {
    const other = join(scratch, "other.gpg");
    await writeFile(join(scratch, "other.zip"), "not the same updater");
    const gpg = Bun.spawn(
      ["gpg", "--batch", "--yes", "--pinentry-mode", "loopback", "--passphrase-fd", "0", "--no-symkey-cache", "--symmetric", "--output", other, join(scratch, "other.zip")],
      { stdin: new Blob([ENV.GPLVAULT_UPDATER_PASSPHRASE]), env: { PATH: process.env.PATH!, GNUPGHOME: await mkdtemp(join(scratch, "gnupg-")) }, stderr: "ignore" },
    );
    expect(await gpg.exited).toBe(0);
    const { error, recorded } = await runSetup({ ciphertext: other });
    expect(error!.message).toBe("setup: existing ciphertext holds a different updater ZIP; refusing to rotate");
    expect(recorded.filter((c) => c.argv[1] === "set")).toEqual([]);
  });

  test("refuses when the repository signing secret is absent, and never sets it", async () => {
    const { error, recorded } = await runSetup({ secrets: [] });
    expect(error!.message).toBe("setup: repository secret PIRAX_HELPER_SIGNING_KEY is missing");
    expect(recorded.filter((c) => c.argv[1] === "set")).toEqual([]);
  });

  test("refuses missing or weak inputs by name only", async () => {
    const { IMAP_PASSWORD: _p, ...missing } = ENV;
    expect((await runSetup({ env: missing })).error!.message).toBe("setup: IMAP_PASSWORD is not set");
    expect((await runSetup({ env: { ...ENV, GPLVAULT_UPDATER_PASSPHRASE: "short" } })).error!.message).toBe(
      "setup: GPLVAULT_UPDATER_PASSPHRASE is shorter than 16 characters",
    );
  });

  test("refuses a ZIP that is not the official updater", async () => {
    const saved = source;
    source = join(scratch, "fake.zip");
    await Bun.write(source, "PK not a zip");
    try {
      expect((await runSetup()).error!.message).toBe("setup: source is not a gplvault-updater ZIP");
    } finally {
      source = saved;
    }
  });

  test("decryptUpdater with a wrong passphrase fails without naming it", async () => {
    const { ciphertext } = await runSetup();
    const error = await decryptUpdater(ciphertext, join(scratch, "x.zip"), "SYNTHETIC-WRONG").catch((e: Error) => e);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe("decrypt: updater failed");
  });
});
