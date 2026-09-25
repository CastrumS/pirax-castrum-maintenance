// Secret-safe artifact helpers: every retained file passes through redact(); traces are
// unpacked, scrubbed and repacked. Uses the system zip/unzip (checked by harness preflight).
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";

export const REDACTED = "[REDACTED]";

const variants = (secrets: string[]) =>
  [...new Set(secrets.filter(Boolean).flatMap((s) => [s, encodeURIComponent(s), JSON.stringify(s).slice(1, -1)]))]
    // Longest first so an encoded form is not half-replaced by a shorter one.
    .sort((a, b) => b.length - a.length);

/** Replace every secret (and its URL/JSON-encoded forms) in text; returns the text and count. */
export function redact(text: string, secrets: string[]): { text: string; count: number } {
  let count = 0;
  for (const secret of variants(secrets)) {
    const parts = text.split(secret);
    count += parts.length - 1;
    text = parts.join(REDACTED);
  }
  return { text, count };
}

function redactBytes(bytes: Buffer, secrets: string[]): { bytes: Buffer; count: number } {
  let count = 0;
  for (const secret of variants(secrets)) {
    const needle = Buffer.from(secret);
    const chunks: Buffer[] = [];
    let from = 0;
    for (let at = bytes.indexOf(needle); at !== -1; at = bytes.indexOf(needle, from)) {
      chunks.push(bytes.subarray(from, at), Buffer.from(REDACTED));
      from = at + needle.length;
      count++;
    }
    chunks.push(bytes.subarray(from));
    bytes = Buffer.concat(chunks);
  }
  return { bytes, count };
}

async function files(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  return entries.filter((e) => e.isFile()).map((e) => join(e.parentPath, e.name));
}

async function run(cmd: string[], cwd?: string) {
  const proc = Bun.spawn(cmd, { cwd, stdout: "ignore", stderr: "pipe" });
  if ((await proc.exited) !== 0) throw new Error(`${cmd[0]} failed: ${await new Response(proc.stderr).text()}`);
}

async function withUnzipped<T>(zip: string, fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), "pirax-artifact-"));
  try {
    await run(["unzip", "-q", zip, "-d", dir]);
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** Scrub secrets from every entry of a zip (e.g. a Playwright trace) in place; returns replacements made. */
export async function sanitizeZip(zip: string, secrets: string[]): Promise<number> {
  return withUnzipped(zip, async (dir) => {
    let total = 0;
    for (const file of await files(dir)) {
      const { bytes, count } = redactBytes(await readFile(file), secrets);
      if (count) await writeFile(file, bytes);
      total += count;
    }
    await rm(zip, { force: true });
    await run(["zip", "-q", "-r", "-X", zip, "."], dir);
    return total;
  });
}

/** Files (zip entries included, as `archive.zip!entry`) under dir that still contain a secret. */
export async function findSecret(dir: string, secrets: string[]): Promise<string[]> {
  const needles = variants(secrets).map((s) => Buffer.from(s));
  const hits: string[] = [];
  const scan = async (root: string, label: (file: string) => string) => {
    for (const file of await files(root)) {
      if (file.endsWith(".zip")) {
        await withUnzipped(file, (inner) => scan(inner, (f) => `${label(file)}!${relative(inner, f)}`));
        continue;
      }
      const bytes = await readFile(file);
      if (needles.some((n) => bytes.includes(n))) hits.push(label(file));
    }
  };
  await scan(dir, (f) => relative(dir, f));
  return hits;
}
