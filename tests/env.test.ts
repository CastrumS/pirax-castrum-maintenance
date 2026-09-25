import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EnvError, readR2Config } from "../src/env.ts";

// Children run outside the repo with env-file loading off, so a local .env can never leak in.
const cwd = mkdtempSync(join(tmpdir(), "env-test-"));
const bun = (script: string, env: Record<string, string>) =>
  Bun.spawnSync([process.execPath, "--no-env-file", "-e", script], { cwd, env });

const full = {
  S3_ACCESS_KEY_ID: "synthetic-id",
  S3_SECRET_ACCESS_KEY: "synthetic-secret",
  S3_ENDPOINT: "https://synthetic.r2.example",
  S3_BUCKET: "synthetic-bucket",
};

describe("readR2Config", () => {
  test("maps the four variables explicitly with region auto", () => {
    expect(readR2Config(full)).toEqual({
      accessKeyId: "synthetic-id",
      secretAccessKey: "synthetic-secret",
      endpoint: "https://synthetic.r2.example",
      bucket: "synthetic-bucket",
      region: "auto",
    });
  });

  test("names every missing or blank variable, never values", () => {
    let caught: unknown;
    try {
      readR2Config({ S3_ACCESS_KEY_ID: "synthetic-id", S3_SECRET_ACCESS_KEY: "   ", S3_ENDPOINT: "" });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(EnvError);
    const err = caught as EnvError;
    expect(err.missing).toEqual(["S3_SECRET_ACCESS_KEY", "S3_ENDPOINT", "S3_BUCKET"]);
    for (const name of err.missing) expect(err.message).toContain(name);
    expect(err.message).not.toContain("S3_ACCESS_KEY_ID");
    expect(err.message).not.toContain("synthetic-id");
  });

  test("empty env names all four", () => {
    expect(() => readR2Config({})).toThrow(/S3_ACCESS_KEY_ID.*S3_SECRET_ACCESS_KEY.*S3_ENDPOINT.*S3_BUCKET/);
  });

  test("defaults to process.env; importing helpers needs no credentials", () => {
    const src = (f: string) => JSON.stringify(join(import.meta.dir, "..", "src", f));
    const script = `await import(${src("sites.ts")}); const { readR2Config } = await import(${src("env.ts")}); console.log(readR2Config().bucket); readR2Config();`;
    const ok = bun(script, { ...full });
    expect([ok.exitCode, ok.stdout.toString().trim()]).toEqual([0, "synthetic-bucket"]);
    const importOnly = bun(`await import(${src("sites.ts")}); await import(${src("env.ts")})`, {});
    expect(importOnly.exitCode).toBe(0);
    const missing = bun(script, {});
    expect(missing.exitCode).not.toBe(0);
    expect(missing.stderr.toString()).toContain("S3_BUCKET");
  });
});
