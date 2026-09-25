import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createStore, expiredReportKeys, isRunId, StoreError } from "../src/store.ts";

// Children run outside the repo with env-file loading off, so a local .env can never leak in.
const cwd = mkdtempSync(join(tmpdir(), "store-test-"));
const bun = (args: string[], env: Record<string, string>) =>
  Bun.spawnSync([process.execPath, "--no-env-file", ...args], { cwd, env });

// Synthetic values only. The endpoint is a closed local port: a StoreError proves validation ran
// before any request, because a request would fail with a connection error instead.
const config = {
  accessKeyId: "synthetic-id",
  secretAccessKey: "synthetic-secret",
  endpoint: "http://127.0.0.1:9",
  bucket: "synthetic-bucket",
  region: "auto" as const,
};
const scoped = createStore({ config, root: "test/unit/" });

const run = (i: number) => new Date(Date.UTC(2026, 0, 1, 0, 0, i)).toISOString().replaceAll(":", "-");
const runs = Array.from({ length: 12 }, (_, i) => run(i));
const sentinels = [
  "baselines/acme/desktop/home.png",
  "baselines/acme/desktop/home.health.json",
  "reports/index.html",
  "reports/not-a-run/x.json",
  "reports/2026-01-01T00-00-00Z/x.json",
  "reports/2026-02-30T00-00-00.000Z/x.json",
  "reports/2026-01-01T00:00:00.000Z/x.json",
  "reports/2026-01-01t00-00-00.000z/x.json",
  "reports/2026-01-01T00-00-00.000Z-old/x.json",
  "reports//x.json",
  "reports-old/2020-01-01T00-00-00.000Z/x.json",
  "other/reports/2020-01-01T00-00-00.000Z/x.json",
];
const reportKeys = runs.flatMap((id) => [`reports/${id}/summary.json`, `reports/${id}/acme/desktop/home.png`]);

async function rejection(p: Promise<unknown>): Promise<unknown> {
  try {
    await p;
  } catch (e) {
    return e;
  }
  throw new Error("expected rejection");
}

describe("run IDs", () => {
  test("canonical millisecond UTC ISO with colons replaced", () => {
    expect(isRunId(new Date().toISOString().replaceAll(":", "-"))).toBe(true);
    expect(isRunId("2026-09-25T13-45-07.123Z")).toBe(true);
  });

  test("rejects noncanonical and malformed IDs", () => {
    for (const id of [
      "2026-09-25T13:45:07.123Z",
      "2026-09-25T13-45-07Z",
      "2026-09-25T13-45-07.12Z",
      "2026-02-30T00-00-00.000Z",
      "2026-09-25T24-00-00.000Z",
      "2026-09-25t13-45-07.123z",
      "+012026-09-25T13-45-07.123Z",
      "2026-09-25T13-45-07.123Z/",
      "latest",
      "",
    ])
      expect(isRunId(id)).toBe(false);
  });
});

describe("expiredReportKeys", () => {
  const all = [...sentinels, ...reportKeys].sort();

  test("keeps the newest distinct runs and removes every object of older runs", () => {
    expect(expiredReportKeys(all, 10)).toEqual(reportKeys.filter((k) => k.includes(runs[0]!) || k.includes(runs[1]!)).sort());
  });

  test("default is 10", () => {
    expect(expiredReportKeys(all)).toEqual(expiredReportKeys(all, 10));
  });

  test("zero removes all recognized reports, never sentinels", () => {
    expect(expiredReportKeys(all, 0)).toEqual([...reportKeys].sort());
  });

  test("count at or below keep is a no-op", () => {
    expect(expiredReportKeys(all, 12)).toEqual([]);
    expect(expiredReportKeys(all, 50)).toEqual([]);
    expect(expiredReportKeys(sentinels, 0)).toEqual([]);
  });

  test("input order does not matter; runs count once regardless of object count", () => {
    const shuffled = [...all].reverse();
    const extra = [...shuffled, `reports/${runs[11]}/a/b/c/d.png`];
    expect(expiredReportKeys(extra, 11)).toEqual(reportKeys.filter((k) => k.includes(runs[0]!)).sort());
  });

  test("invalid keep throws", () => {
    for (const keep of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, "3" as unknown as number])
      expect(() => expiredReportKeys(all, keep)).toThrow(StoreError);
  });
});

describe("store validation before any request", () => {
  test("createStore validates root and page size", () => {
    for (const root of ["", "test/", "test/2026-01-01T00-00-00.000Z-ab12/"]) expect(() => createStore({ config, root })).not.toThrow();
    for (const root of ["test", "/test/", "a//b/", "../", "a/../b/", "./", "a/./", "a\\b/", "a\u0000/", "/"])
      expect(() => createStore({ config, root })).toThrow(StoreError);
    for (const pageSize of [1, 2, 1000]) expect(() => createStore({ config, pageSize })).not.toThrow();
    for (const pageSize of [0, -1, 1.5, 1001, Number.NaN]) expect(() => createStore({ config, pageSize })).toThrow(StoreError);
  });

  test("unsafe keys reject with StoreError, not a network error", async () => {
    const bad = ["", "/a", "a/", "a//b", "..", "a/../b", "./a", "a/.", "a\\b", "a\u0000b", "a\nb", "x".repeat(1025)];
    for (const key of bad) {
      expect(await rejection(scoped.put(key, new Uint8Array([1])))).toBeInstanceOf(StoreError);
      expect(await rejection(scoped.get(key))).toBeInstanceOf(StoreError);
      expect(await rejection(scoped.delete(key))).toBeInstanceOf(StoreError);
      expect(() => scoped.presign(key, 60)).toThrow(StoreError);
    }
    for (const prefix of ["/", "//", "/a", "a//", "../", "a/../", "a\\"])
      expect(await rejection(scoped.list(prefix))).toBeInstanceOf(StoreError);
  });

  test("root counts toward the key length limit", async () => {
    const deep = createStore({ config, root: `${"r".repeat(1000)}/` });
    expect(await rejection(deep.get("x".repeat(30)))).toBeInstanceOf(StoreError);
  });

  test("presign validates expiry and signs the scoped key for GET", () => {
    for (const seconds of [0, -5, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 604801])
      expect(() => scoped.presign("a.png", seconds)).toThrow(StoreError);
    const url = new URL(scoped.presign("reports/x/a.png", 60));
    expect(url.pathname.endsWith("/test/unit/reports/x/a.png")).toBe(true);
    expect(url.searchParams.get("X-Amz-Expires")).toBe("60");
    expect(scoped.presign("a.png", 604800)).toContain("X-Amz-Expires=604800");
  });

  test("invalid keep rejects before listing", async () => {
    for (const keep of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])
      expect(await rejection(scoped.pruneReports(keep))).toBeInstanceOf(StoreError);
  });
});

describe("lazy environment", () => {
  const src = JSON.stringify(join(import.meta.dir, "..", "src", "store.ts"));

  test("importing store needs no env; first use names missing variables", () => {
    expect(bun(["-e", `await import(${src})`], {}).exitCode).toBe(0);
    const use = bun(["-e", `const { store } = await import(${src}); store.presign("a", 60)`], {});
    expect(use.exitCode).not.toBe(0);
    expect(use.stderr.toString()).toContain("S3_BUCKET");
  });
});

describe("store:selftest missing configuration", () => {
  const script = join(import.meta.dir, "..", "scripts", "store-selftest.ts");
  const blank = { S3_ACCESS_KEY_ID: "", S3_SECRET_ACCESS_KEY: " ", S3_ENDPOINT: "", S3_BUCKET: "" };

  test("all blank: nonzero, names all four, no artifact", () => {
    const r = bun([script], blank);
    const out = r.stdout.toString() + r.stderr.toString();
    expect(r.exitCode).not.toBe(0);
    for (const name of Object.keys(blank)) expect(out).toContain(name);
    expect(out).not.toContain("runs/");
    expect(existsSync(join(cwd, "runs"))).toBe(false);
  });

  test("one blank: names only it and prints no values", () => {
    const r = bun([script], {
      S3_ACCESS_KEY_ID: "synthetic-id",
      S3_SECRET_ACCESS_KEY: "synthetic-secret",
      S3_ENDPOINT: "http://127.0.0.1:9",
      S3_BUCKET: "",
    });
    const out = r.stdout.toString() + r.stderr.toString();
    expect(r.exitCode).not.toBe(0);
    expect(out).toContain("S3_BUCKET");
    for (const leak of ["S3_ACCESS_KEY_ID", "synthetic-id", "synthetic-secret", "127.0.0.1"]) expect(out).not.toContain(leak);
  });
});
