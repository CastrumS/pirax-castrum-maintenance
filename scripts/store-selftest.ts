// Real-R2 selftest of src/store.ts. Every mutation stays under a fresh test/<timestamp>-<random>/ root,
// which is deleted in `finally`. Output and the runs/ artifact carry names, counts and error classes only:
// never credentials, endpoint, bucket, signed URLs or raw error messages.
import { S3Client } from "bun";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { EnvError, readR2Config, type R2Config } from "../src/env.ts";
import { createStore, StoreError } from "../src/store.ts";

class Failure extends Error {}

const assert = (ok: boolean, message: string) => {
  if (!ok) throw new Failure(message);
};
const same = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((v, i) => v === b[i]);
const sameList = (a: string[], b: string[]) => a.length === b.length && a.every((v, i) => v === b[i]);

// Only messages this script or the store authored are printed; anything else is reduced to its class/code.
function safe(e: unknown): string {
  if (e instanceof Failure || e instanceof StoreError || e instanceof EnvError) return e.message;
  const name = e instanceof Error ? e.name : typeof e;
  const code = (e as { code?: unknown })?.code;
  return typeof code === "string" && /^[A-Za-z0-9_]{1,64}$/.test(code) ? `${name} (${code})` : name;
}

let config: R2Config;
try {
  config = readR2Config();
} catch (e) {
  console.error(`store:selftest: ${safe(e)}. No remote access attempted.`);
  process.exit(2);
}

const PAGE = 5;
const started = new Date();
const stamp = started.toISOString().replaceAll(":", "-");
const root = `test/${stamp}-${crypto.randomUUID().slice(0, 8)}/`;
const store = createStore({ config, root });
const paged = createStore({ config, root, pageSize: PAGE });
const tmp = mkdtempSync(join(tmpdir(), "store-selftest-"));

type Check = { name: string; ok: boolean; counts?: Record<string, number>; error?: string };
const checks: Check[] = [];
async function check(name: string, fn: () => Promise<Record<string, number> | void>) {
  try {
    const counts = (await fn()) ?? undefined;
    checks.push({ name, ok: true, counts });
    console.log(`ok   ${name}${counts ? " " + JSON.stringify(counts) : ""}`);
  } catch (e) {
    checks.push({ name, ok: false, error: safe(e) });
    console.log(`FAIL ${name}: ${safe(e)}`);
    throw e;
  }
}
const rejects = async (p: Promise<unknown>) => {
  try {
    await p;
    return false;
  } catch {
    return true;
  }
};

const bytes = (n: number, seed: number) => Uint8Array.from({ length: n }, (_, i) => (i * 31 + seed) % 256);
const runId = (i: number) => new Date(Date.UTC(2026, 0, 1, 0, 0, i)).toISOString().replaceAll(":", "-");
const runFiles = ["summary.json", "acme/desktop/home.png", "acme/mobile/home.png"];
const expected = new Map<string, Uint8Array>();
async function putAll(keys: string[]) {
  for (const key of keys) {
    const data = bytes(64 + expected.size, expected.size);
    expected.set(key, data);
    await store.put(key, data);
  }
}
const runKeys = (from: number, to: number) =>
  Array.from({ length: to - from }, (_, i) => runFiles.map((f) => `reports/${runId(from + i)}/${f}`)).flat();
const sentinels = [
  "baselines/acme/desktop/home.png",
  "baselines/acme/desktop/home.health.json",
  "reports/index.html",
  "reports/not-a-run/x.json",
  "reports/2026-01-01T00-00-00Z/x.json",
  "reports/2026-02-30T00-00-00.000Z/x.json",
  "reports-old/2020-01-01T00-00-00.000Z/x.json",
  "other/reports/2020-01-01T00-00-00.000Z/x.json",
];
// Asserts the listing is exactly `keys` and every object still holds its uploaded bytes.
async function expectExactly(keys: string[]) {
  const all = await paged.list("");
  const want = [...keys].sort();
  assert(sameList(all, want), `expected ${want.length} objects under root, found ${all.length} (or different keys)`);
  for (const key of want) assert(same(await store.get(key), expected.get(key)!), `bytes changed for ${key}`);
  return all.length;
}

let passed = false;
let cleanup: { ok: boolean; deleted: number; remaining: number | null; error?: string } = { ok: false, deleted: 0, remaining: null };
console.log(`store:selftest root ${root}`);
try {
  await check("binary roundtrip", async () => {
    await putAll(["probe/bytes.bin"]);
    assert(same(await store.get("probe/bytes.bin"), expected.get("probe/bytes.bin")!), "downloaded bytes differ");
    return { bytes: expected.get("probe/bytes.bin")!.length };
  });

  await check("file roundtrip", async () => {
    const data = Uint8Array.from({ length: 256 }, (_, i) => 255 - i);
    const path = join(tmp, "upload.bin");
    await Bun.write(path, data);
    await store.put("probe/file.bin", Bun.file(path));
    expected.set("probe/file.bin", data);
    assert(same(await store.get("probe/file.bin"), data), "downloaded bytes differ");
    return { bytes: data.length };
  });

  await check("list", async () => {
    const keys = await store.list("probe/");
    assert(sameList(keys, ["probe/bytes.bin", "probe/file.bin"]), "probe listing differs");
    return { keys: keys.length };
  });

  await check("signed GET", async () => {
    const res = await fetch(store.presign("probe/bytes.bin", 60));
    assert(res.status === 200, `signed GET returned HTTP ${res.status}`);
    assert(same(new Uint8Array(await res.arrayBuffer()), expected.get("probe/bytes.bin")!), "signed GET bytes differ");
    let invalid = 0;
    for (const s of [0, -1, 1.5, Number.NaN, 604801])
      if (await rejects((async () => store.presign("probe/bytes.bin", s))())) invalid++;
    assert(invalid === 5, "invalid presign expiry accepted");
    return { status: res.status, invalidExpiriesRejected: invalid };
  });

  await check("missing get rejects", async () => {
    assert(await rejects(store.get("probe/missing.bin")), "get of a missing key resolved");
  });

  await check("service honours small page size", async () => {
    await putAll([...sentinels, ...runKeys(0, 12)]);
    const client = new S3Client(config);
    const first = await client.list({ prefix: root, maxKeys: PAGE });
    assert((first.contents?.length ?? 0) <= PAGE && first.isTruncated === true, "list page size not honoured");
    const all = await paged.list("");
    assert(sameList(all, await store.list("")), "paged and unpaged listings differ");
    assert(all.length === expected.size, "listing is incomplete");
    return { objects: all.length, pageSize: PAGE, minPages: Math.ceil(all.length / PAGE) };
  });

  const probes = ["probe/bytes.bin", "probe/file.bin"];
  await check("invalid keep rejects and deletes nothing", async () => {
    let invalid = 0;
    for (const keep of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) if (await rejects(paged.pruneReports(keep))) invalid++;
    assert(invalid === 4, "invalid keep accepted");
    return { invalidKeepsRejected: invalid, objects: await expectExactly([...probes, ...sentinels, ...runKeys(0, 12)]) };
  });

  await check("prune 12 runs to 10", async () => {
    await paged.pruneReports(10);
    const gone = await paged.list(`reports/${runId(0)}/`);
    assert(gone.length === 0, "oldest run survived");
    return { runs: 10, objects: await expectExactly([...probes, ...sentinels, ...runKeys(2, 12)]) };
  });

  await check("no-op when count <= keep", async () => {
    await paged.pruneReports(10);
    await paged.pruneReports(50);
    return { objects: await expectExactly([...probes, ...sentinels, ...runKeys(2, 12)]) };
  });

  await check("default keep is 10", async () => {
    await putAll(runKeys(12, 14));
    await paged.pruneReports();
    return { runs: 10, objects: await expectExactly([...probes, ...sentinels, ...runKeys(4, 14)]) };
  });

  await check("keep 0 removes all recognized runs", async () => {
    await paged.pruneReports(0);
    return { runs: 0, objects: await expectExactly([...probes, ...sentinels]) };
  });
  passed = true;
} catch {
  // Recorded by check(); cleanup and the artifact still run.
} finally {
  try {
    const keys = await paged.list("");
    for (const key of keys) await store.delete(key);
    const remaining = (await paged.list("")).length;
    cleanup = { ok: remaining === 0, deleted: keys.length, remaining };
    if (remaining) cleanup.error = "objects remain under the test root";
  } catch (e) {
    cleanup = { ...cleanup, ok: false, error: safe(e) };
  }
  try {
    rmSync(tmp, { recursive: true, force: true });
  } catch (e) {
    cleanup = { ...cleanup, ok: false, error: `local temp cleanup: ${safe(e)}` };
  }
}

const ok = passed && cleanup.ok;
console.log(cleanup.ok ? `ok   cleanup ${root} (deleted ${cleanup.deleted})` : `FAIL cleanup ${root}: ${cleanup.error}`);
const runsDir = join(import.meta.dir, "..", "runs");
mkdirSync(runsDir, { recursive: true });
const artifact = join(runsDir, `store-selftest-${stamp}.json`);
await Bun.write(
  artifact,
  JSON.stringify({ command: "store:selftest", startedAt: started.toISOString(), finishedAt: new Date().toISOString(), root, result: ok ? "pass" : "fail", checks, cleanup }, null, 2) + "\n",
);
console.log(`${ok ? "PASS" : "FAIL"} artifact ${relative(process.cwd(), artifact)}`);
process.exit(ok ? 0 : 1);
