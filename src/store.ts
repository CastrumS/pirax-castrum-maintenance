import { S3Client } from "bun";
import { readR2Config, type R2Config } from "./env.ts";

export class StoreError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StoreError";
  }
}

export type Store = {
  put(key: string, data: Uint8Array | Blob): Promise<void>;
  /** Rejects when the object does not exist. */
  get(key: string): Promise<Uint8Array>;
  /** Every key under `prefix` (all pages), relative to the store root, sorted. */
  list(prefix: string): Promise<string[]>;
  /** Signed GET URL valid for 1–604800 whole seconds. */
  presign(key: string, seconds: number): string;
  delete(key: string): Promise<void>;
  /** Deletes every object of all but the `keep` newest `reports/<runId>/` directories. */
  pruneReports(keep?: number): Promise<void>;
};

export type StoreOptions = {
  /** Defaults to `readR2Config()`, read on first use rather than at creation. */
  config?: R2Config;
  /** Key namespace, `""` or ending in `/`. All keys and results are relative to it. */
  root?: string;
  /** Keys per list request, 1–1000. Defaults to the service maximum. */
  pageSize?: number;
};

const MAX_KEY_BYTES = 1024;
const MAX_PRESIGN_SECONDS = 7 * 24 * 60 * 60;
const RUN_ID = /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.\d{3}Z$/;

/** True for `new Date().toISOString().replaceAll(":", "-")` output, which sorts chronologically. */
export function isRunId(id: string): boolean {
  if (!RUN_ID.test(id)) return false;
  const iso = `${id.slice(0, 13)}:${id.slice(14, 16)}:${id.slice(17)}`;
  const date = new Date(iso);
  return !Number.isNaN(date.getTime()) && date.toISOString() === iso;
}

function checkKeep(keep: number): void {
  if (!Number.isInteger(keep) || keep < 0) throw new StoreError("keep must be a nonnegative integer");
}

/** Keys (relative to a store root) of every object in report runs older than the `keep` newest. */
export function expiredReportKeys(keys: string[], keep = 10): string[] {
  checkKeep(keep);
  const byRun = new Map<string, string[]>();
  for (const key of keys) {
    const [top, runId, ...rest] = key.split("/");
    if (top !== "reports" || runId === undefined || !rest.length || !isRunId(runId)) continue;
    const run = byRun.get(runId);
    if (run) run.push(key);
    else byRun.set(runId, [key]);
  }
  const expired = [...byRun.keys()].sort().reverse().slice(keep);
  return expired.flatMap((runId) => byRun.get(runId)!).sort();
}

const safePath = (path: string) =>
  !/[\u0000-\u001f\u007f\\]/.test(path) && path.split("/").every((s) => s !== "" && s !== "." && s !== "..");

export function createStore({ config, root = "", pageSize }: StoreOptions = {}): Store {
  if (root !== "" && !(root.endsWith("/") && safePath(root.slice(0, -1))))
    throw new StoreError(`unsafe store root ${JSON.stringify(root)}`);
  if (pageSize !== undefined && !(Number.isInteger(pageSize) && pageSize >= 1 && pageSize <= 1000))
    throw new StoreError("pageSize must be an integer from 1 to 1000");

  let client: S3Client | undefined;
  const s3 = () => (client ??= new S3Client(config ?? readR2Config()));

  const full = (key: string) => {
    const path = root + key;
    if (typeof key !== "string" || !key || !safePath(key) || Buffer.byteLength(path) > MAX_KEY_BYTES)
      throw new StoreError(`unsafe key ${JSON.stringify(key)}`);
    return path;
  };

  const list = async (prefix: string) => {
    const bare = prefix.endsWith("/") ? prefix.slice(0, -1) : prefix;
    if (typeof prefix !== "string" || (prefix !== "" && !(bare && safePath(bare))))
      throw new StoreError(`unsafe list prefix ${JSON.stringify(prefix)}`);
    const keys: string[] = [];
    let continuationToken: string | undefined;
    do {
      const page = await s3().list({ prefix: root + prefix, maxKeys: pageSize, continuationToken });
      for (const { key } of page.contents ?? []) {
        if (!key.startsWith(root)) throw new StoreError("listing returned a key outside the store root");
        keys.push(key.slice(root.length));
      }
      continuationToken = page.isTruncated ? page.nextContinuationToken : undefined;
      if (page.isTruncated && !continuationToken) throw new StoreError("truncated listing without continuation token");
    } while (continuationToken);
    return keys.sort();
  };

  return {
    async put(key, data) {
      await s3().write(full(key), data);
    },
    async get(key) {
      return s3().file(full(key)).bytes();
    },
    list,
    presign(key, seconds) {
      const path = full(key);
      if (!Number.isInteger(seconds) || seconds < 1 || seconds > MAX_PRESIGN_SECONDS)
        throw new StoreError(`presign seconds must be an integer from 1 to ${MAX_PRESIGN_SECONDS}`);
      return s3().presign(path, { expiresIn: seconds, method: "GET" });
    },
    async delete(key) {
      await s3().delete(full(key));
    },
    async pruneReports(keep = 10) {
      checkKeep(keep);
      // ponytail: one DELETE per object, sequentially; switch to batched deletes if report runs grow large.
      for (const key of expiredReportKeys(await list("reports/"), keep)) await s3().delete(full(key));
    },
  };
}

/** Unscoped store over the whole bucket; credentials are read on first use. */
export const store: Store = createStore();
