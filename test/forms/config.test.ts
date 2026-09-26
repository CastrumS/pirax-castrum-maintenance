import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { EnvError, EnvFormatError } from "../../src/env.ts";
import { readFormConfig } from "../../src/forms/config.ts";
import { readImapConfig } from "../../src/mail/config.ts";
import { configurationError, safeError } from "../../src/commands/common.ts";

// Synthetic values only; real names are loaded by the mailbox selftest, never here.
const token = "Synthetic.Token_~+/=-0123456789";
const form = { FORM_TEST_TOKEN: token, FORM_TEST_ADDRESS: "tests+pirax@example.test" };
const imap = { IMAP_HOST: "imap.example.test", IMAP_PORT: "993", IMAP_USER: "tests@example.test", IMAP_PASSWORD: " synthetic pass ", IMAP_FOLDER: "Pirax tests", IMAP_SPAM_FOLDER: "[Gmail]/Spam" };

function caught(fn: () => unknown): Error {
  try { fn(); } catch (error) { return error as Error; }
  throw new Error("expected an error");
}
/** Every error names variables only: no value, prefix or suffix of any configured value. */
function valueFree(error: Error, env: Record<string, string>) {
  for (const value of Object.values(env)) if (value.trim().length >= 3) expect(error.message).not.toContain(value.trim());
}

describe("readFormConfig", () => {
  test("returns the exact token and single address without trimming or transforming", () => {
    expect(readFormConfig(form)).toEqual({ token, address: "tests+pirax@example.test" });
    expect(readFormConfig({ ...form, FORM_TEST_TOKEN: "a".repeat(16) }).token).toBe("a".repeat(16));
    expect(readFormConfig({ ...form, FORM_TEST_TOKEN: "Z".repeat(255) }).token).toBe("Z".repeat(255));
  });
  test("missing or blank names are EnvError naming each variable", () => {
    const error = caught(() => readFormConfig({ FORM_TEST_TOKEN: "   " }));
    expect(error).toBeInstanceOf(EnvError);
    expect((error as EnvError).missing).toEqual(["FORM_TEST_TOKEN", "FORM_TEST_ADDRESS"]);
  });
  test("invalid token and address formats are value-free configuration errors", () => {
    const cases: [Record<string, string>, string][] = [
      [{ ...form, FORM_TEST_TOKEN: "a".repeat(15) }, "FORM_TEST_TOKEN"],
      [{ ...form, FORM_TEST_TOKEN: "a".repeat(256) }, "FORM_TEST_TOKEN"],
      [{ ...form, FORM_TEST_TOKEN: `${token}!` }, "FORM_TEST_TOKEN"],
      [{ ...form, FORM_TEST_TOKEN: ` ${token}` }, "FORM_TEST_TOKEN"], // never trimmed into validity
      [{ ...form, FORM_TEST_TOKEN: `${token}\n` }, "FORM_TEST_TOKEN"],
      [{ ...form, FORM_TEST_ADDRESS: "one@example.test, two@example.test" }, "FORM_TEST_ADDRESS"],
      [{ ...form, FORM_TEST_ADDRESS: "one@example.test\r\nBcc: two@example.test" }, "FORM_TEST_ADDRESS"],
      [{ ...form, FORM_TEST_ADDRESS: "Name <one@example.test>" }, "FORM_TEST_ADDRESS"],
      [{ ...form, FORM_TEST_ADDRESS: "no-at-sign.example.test" }, "FORM_TEST_ADDRESS"],
      [{ ...form, FORM_TEST_ADDRESS: "one@localhost" }, "FORM_TEST_ADDRESS"],
    ];
    for (const [env, name] of cases) {
      const error = caught(() => readFormConfig(env));
      expect(error).toBeInstanceOf(EnvFormatError);
      expect((error as EnvFormatError).invalid).toEqual([name]);
      expect(error.message).toContain(name);
      valueFree(error, env);
      expect(configurationError(error)).toBe(true);
      expect(safeError(error)).toBe(error.message);
    }
  });
});

describe("readImapConfig", () => {
  test("993 is implicit TLS, other ports require STARTTLS; password and folders are literal", () => {
    expect(readImapConfig(imap)).toEqual({ host: "imap.example.test", port: 993, secure: true, user: "tests@example.test", password: " synthetic pass ", folder: "Pirax tests", spamFolder: "[Gmail]/Spam" });
    expect(readImapConfig({ ...imap, IMAP_PORT: "143" })).toMatchObject({ port: 143, secure: false });
  });
  test("missing or blank names list every variable", () => {
    const error = caught(() => readImapConfig({ IMAP_HOST: "imap.example.test", IMAP_PASSWORD: "\t" }));
    expect(error).toBeInstanceOf(EnvError);
    expect((error as EnvError).missing).toEqual(["IMAP_PORT", "IMAP_USER", "IMAP_PASSWORD", "IMAP_FOLDER", "IMAP_SPAM_FOLDER"]);
    valueFree(error, imap);
  });
  test("invalid host, port, user and non-literal folders are value-free errors", () => {
    const cases: [Record<string, string>, string[]][] = [
      [{ ...imap, IMAP_PORT: "0" }, ["IMAP_PORT"]],
      [{ ...imap, IMAP_PORT: "65536" }, ["IMAP_PORT"]],
      [{ ...imap, IMAP_PORT: "99a" }, ["IMAP_PORT"]],
      [{ ...imap, IMAP_PORT: " 993" }, ["IMAP_PORT"]],
      [{ ...imap, IMAP_HOST: "imaps://imap.example.test" }, ["IMAP_HOST"]],
      [{ ...imap, IMAP_HOST: "imap.example.test:993" }, ["IMAP_HOST"]],
      [{ ...imap, IMAP_USER: "tests@example.test\r\nA1 DELETE INBOX" }, ["IMAP_USER"]],
      [{ ...imap, IMAP_FOLDER: "Pirax*" }, ["IMAP_FOLDER"]],
      [{ ...imap, IMAP_SPAM_FOLDER: "%" }, ["IMAP_SPAM_FOLDER"]],
      [{ ...imap, IMAP_FOLDER: " Pirax tests" }, ["IMAP_FOLDER"]],
      [{ ...imap, IMAP_FOLDER: "Pirax\ttests", IMAP_PORT: "-1" }, ["IMAP_PORT", "IMAP_FOLDER"]],
    ];
    for (const [env, names] of cases) {
      const error = caught(() => readImapConfig(env));
      expect(error).toBeInstanceOf(EnvFormatError);
      expect((error as EnvFormatError).invalid).toEqual(names);
      valueFree(error, env);
      expect(configurationError(error)).toBe(true);
    }
  });
});

test("importing readers needs no environment; process.env default reads lazily", () => {
  const cwd = mkdtempSync(join(tmpdir(), "forms-config-"));
  afterAll(() => rmSync(cwd, { recursive: true, force: true }));
  const src = (f: string) => JSON.stringify(resolve(import.meta.dir, "../../src", f));
  const run = (script: string, env: Record<string, string>) => Bun.spawnSync([process.execPath, "--no-env-file", "-e", script], { cwd, env });
  const imported = run(`await import(${src("forms/config.ts")}); await import(${src("mail/config.ts")}); await import(${src("mail/imap.ts")});`, {});
  expect([imported.exitCode, imported.stdout.toString(), imported.stderr.toString()]).toEqual([0, "", ""]);
  const ok = run(`const { readFormConfig } = await import(${src("forms/config.ts")}); console.log(readFormConfig().address);`, form);
  expect(ok.stdout.toString().trim()).toBe(form.FORM_TEST_ADDRESS);
  const missing = run(`const { readImapConfig } = await import(${src("mail/config.ts")}); readImapConfig();`, {});
  expect(missing.exitCode).not.toBe(0);
  expect(missing.stderr.toString()).toContain("IMAP_SPAM_FOLDER");
});
