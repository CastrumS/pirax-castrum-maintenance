// Re-audit privacy boundaries (plan D5/D10): per-child environment scoping, captured output that is sanitized and
// rescanned before it reaches a log, and findSecret over retained native evidence and ZIP entries. Every secret
// here is a SYNTHETIC stand-in; real credentials are never passed to a matcher.
import { afterAll, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { bunCommand, runChild, sanitizeLine, scanEvidence, scopedEnv, secretValues } from "../scripts/reaudit/privacy";

const scratch = await mkdtemp(join(tmpdir(), "reaudit-privacy-"));
afterAll(() => rm(scratch, { recursive: true, force: true }));

const SECRET = "SYNTHETIC-license-Kq93/+=x";
const TOKEN = "SYNTHETIC_token_8f2Lw";
const SEED = "U1lOVEhFVElDLXNlZWQtMzItYnl0ZXMtLS0tLS0tLS0=";
const ENV = {
  PATH: process.env.PATH,
  HOME: process.env.HOME,
  GPLVAULT_LICENSE_KEY: SECRET,
  GPLVAULT_PRODUCT_ID: "SYNTHETIC-product-77",
  GPLVAULT_UPDATER_PASSPHRASE: "SYNTHETIC-passphrase-123456",
  IMAP_USER: "synthetic.sender@example.invalid",
  IMAP_PASSWORD: "SYNTHETIC-app-password",
  PIRAX_HELPER_SIGNING_KEY: SEED,
  FORM_TEST_TOKEN: TOKEN,
  GH_TOKEN: "ghs_SYNTHETICtoken000000000000000000",
  UNRELATED: "kept-out",
};

test("secretValues names every credential class; the public recipient address is not a secret", () => {
  const values = secretValues(ENV);
  for (const name of ["GPLVAULT_LICENSE_KEY", "GPLVAULT_PRODUCT_ID", "GPLVAULT_UPDATER_PASSPHRASE", "IMAP_USER", "IMAP_PASSWORD", "PIRAX_HELPER_SIGNING_KEY", "FORM_TEST_TOKEN", "GH_TOKEN"] as const)
    expect(values).toContain(ENV[name]);
  expect(values).not.toContain("kept-out");
  expect(secretValues({ IMAP_USER: "piraxcastrum@gmail.com" })).toEqual([]);
  expect(secretValues(ENV, ["/private/scratch/gf.zip", ""])).toContain("/private/scratch/gf.zip");
});

test("scopedEnv passes only the base allowlist plus the named inputs", () => {
  const env = scopedEnv(ENV, ["GPLVAULT_LICENSE_KEY"], { FORM_TEST_TOKEN: "per-run" });
  expect(Object.keys(env).sort()).toEqual(["FORM_TEST_TOKEN", "GPLVAULT_LICENSE_KEY", "HOME", "PATH"]);
  expect(env.FORM_TEST_TOKEN).toBe("per-run");
  expect(() => scopedEnv(ENV, ["NOT_SET_ANYWHERE"])).toThrow("NOT_SET_ANYWHERE is not set");
});

test("Bun children never load a local environment file", () => {
  const cmd = bunCommand("test", "test/plugin");
  expect(cmd).toEqual([process.execPath, "--no-env-file", "test", "test/plugin"]);
});

test("sanitizeLine redacts raw, URL-encoded and JSON-escaped secrets, private URL credentials and queries", () => {
  const secrets = secretValues(ENV);
  const line = `key=${SECRET} enc=${encodeURIComponent(SECRET)} json=${JSON.stringify(SECRET).slice(1, -1)} https://user:pw@vault.invalid/pkg/1.zip?X-Amz-Signature=abc&token=def#frag http://127.0.0.1:8080/wp-admin/?nonce=1 https://downloads.wordpress.org/plugin/fluentform.6.2.15.zip`;
  const clean = sanitizeLine(line, secrets);
  for (const s of [SECRET, encodeURIComponent(SECRET), "user:pw", "X-Amz-Signature", "abc&token", "frag", "nonce=1"]) expect(clean).not.toContain(s);
  expect(clean).toContain("https://vault.invalid/pkg/1.zip?[REDACTED]");
  expect(clean).toContain("https://downloads.wordpress.org/plugin/fluentform.6.2.15.zip");
});

test("runChild captures, sanitizes and rescans output before writing its log, with the scoped environment only", async () => {
  const log = join(scratch, "child.log");
  const printed: string[] = [];
  const script = `console.log("lic", process.env.GPLVAULT_LICENSE_KEY); console.error("url https://vault.invalid/p.zip?sig=${encodeURIComponent(SECRET)}"); console.log(JSON.stringify(Object.keys(process.env).sort()));`;
  const r = await runChild(bunCommand("-e", script), {
    cwd: scratch,
    env: scopedEnv(ENV, ["GPLVAULT_LICENSE_KEY"]),
    secrets: secretValues(ENV),
    log,
    timeoutMs: 30_000,
    echo: (line) => printed.push(line),
  });
  expect(r.code).toBe(0);
  const text = await readFile(log, "utf8");
  expect(text).not.toContain(SECRET);
  expect(text).not.toContain(encodeURIComponent(SECRET));
  expect(text).toContain("lic [REDACTED]");
  expect(text).toContain("https://vault.invalid/p.zip?[REDACTED]");
  expect(printed.join("\n")).toBe(r.output.trimEnd());
  expect(r.output).not.toContain(SECRET);
  const names: string[] = JSON.parse(r.output.split("\n").find((l) => l.startsWith("["))!);
  for (const name of ["IMAP_PASSWORD", "PIRAX_HELPER_SIGNING_KEY", "GH_TOKEN", "FORM_TEST_TOKEN", "UNRELATED"]) expect(names).not.toContain(name);
});

test("runChild bounds a hung child and reports the timeout", async () => {
  const r = await runChild(bunCommand("-e", "setInterval(() => {}, 1000)"), { cwd: scratch, env: scopedEnv(ENV, []), secrets: [], log: join(scratch, "hung.log"), timeoutMs: 500, echo: () => {} });
  expect(r.timedOut).toBe(true);
  expect(r.code).not.toBe(0);
});

test("scanEvidence finds secrets in files and inside ZIP entries (traces) and withholds those files", async () => {
  const dir = join(scratch, "evidence");
  await mkdir(join(dir, "trace"), { recursive: true });
  await writeFile(join(dir, "clean.json"), "{}");
  await writeFile(join(dir, "leak.jsonl"), `{"x":"${encodeURIComponent(SECRET)}"}\n`);
  await writeFile(join(dir, "trace/inner.txt"), `token ${TOKEN}`);
  expect(Bun.spawnSync(["zip", "-q", "-r", "-X", join(dir, "trace.zip"), "inner.txt"], { cwd: join(dir, "trace") }).exitCode).toBe(0);
  await rm(join(dir, "trace"), { recursive: true });
  const hits = await scanEvidence(dir, secretValues(ENV));
  expect(hits.sort()).toEqual(["leak.jsonl", "trace.zip!inner.txt"]);
  expect(existsSync(join(dir, "leak.jsonl"))).toBe(false);
  expect(existsSync(join(dir, "trace.zip"))).toBe(false);
  expect(existsSync(join(dir, "clean.json"))).toBe(true);
  expect(await scanEvidence(dir, secretValues(ENV))).toEqual([]);
});

// Integration finding: a clean scan proves nothing about inheritance. The child scanner runs with synthetic
// credentials in its own environment and a wrapped unzip that records only which credential names reached it.
test("scanEvidence's unzip child inherits no credential, even when the scan finds nothing", async () => {
  const dir = join(scratch, "archive-env");
  const bin = join(dir, "bin");
  const record = join(dir, "unzip.names");
  await mkdir(join(dir, "evidence"), { recursive: true });
  await mkdir(bin);
  await writeFile(join(dir, "clean.txt"), "synthetic safe artifact");
  expect(Bun.spawnSync(["zip", "-q", join(dir, "evidence/trace.zip"), "clean.txt"], { cwd: dir }).exitCode).toBe(0);
  const names = Object.keys(ENV).filter((n) => n !== "PATH" && n !== "HOME");
  await writeFile(join(bin, "unzip"), `#!/bin/sh\n${names.map((n) => `[ -n "\${${n}+x}" ] && echo ${n} >> '${record}'`).join("\n")}\necho checked >> '${record}'\nexec '${Bun.which("unzip")}' "$@"\n`);
  await chmod(join(bin, "unzip"), 0o755);
  const child = `
    import { scanEvidence, secretValues } from ${JSON.stringify(join(import.meta.dir, "../scripts/reaudit/privacy.ts"))};
    console.log((await scanEvidence(${JSON.stringify(join(dir, "evidence"))}, secretValues(process.env))).length);`;
  const proc = Bun.spawn(bunCommand("-e", child), { cwd: dir, env: { ...ENV, PATH: `${bin}:${process.env.PATH}` }, stdout: "pipe", stderr: "inherit" });
  expect(await proc.exited).toBe(0);
  expect((await new Response(proc.stdout).text()).trim()).toBe("0");
  expect((await readFile(record, "utf8")).trim().split("\n")).toEqual(["checked"]);
});
