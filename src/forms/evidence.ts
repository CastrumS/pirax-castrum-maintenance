import { chmod, mkdir, mkdtemp, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import type { BrowserContext } from "playwright";

export type Redactor = (text: string) => string;
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const html = (s: string) => s.replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
/** Match mixed encodings too (e.g. a URL with only '/' escaped), without decoding unrelated text. */
export function secretRedactor(token = process.env.FORM_TEST_TOKEN ?? "", secrets: string[] = []): Redactor {
  const envNames = /^(?:FORM_TEST_ADDRESS|IMAP_(?:HOST|USER|PASSWORD|FOLDER|SPAM_FOLDER)|SMTP_(?:HOST|USER|PASSWORD)|S3_(?:ACCESS_KEY_ID|SECRET_ACCESS_KEY|ENDPOINT|BUCKET)|GRAVITY_FORMS_ZIP)$/;
  const pairs = [...new Set([token, ...secrets, ...Object.entries(process.env).filter(([k]) => envNames.test(k)).map(([, v]) => v ?? "")].filter(Boolean))]
    .sort((a, b) => b.length - a.length).map(s => {
      const variants = new Set([s, html(s), s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!), s.replace(/\//g, "\\/")]);
      for (let i = 0; i < 2; i++) for (const v of [...variants]) { variants.add(encodeURIComponent(v)); variants.add(new URLSearchParams({ v }).toString().slice(2)); variants.add(JSON.stringify(v).slice(1, -1)); }
      const mixed = [...s].map(c => {
        const hex = c.charCodeAt(0).toString(16).padStart(4, "0");
        const percent = [...Buffer.from(c)].map(b => '%' + b.toString(16).padStart(2, '0').toUpperCase()).join('');
        const choices = [c, encodeURIComponent(c), percent, encodeURIComponent(percent), `\\u${hex}`, `\\u${hex.toUpperCase()}`, `&#${c.charCodeAt(0)};`, `&#x${c.charCodeAt(0).toString(16)};`];
        return `(?:${[...new Set(choices)].map(v => escape(v).replace(/%([0-9A-F]{2})/g, (_, h: string) => '%' + [...h].map(c => /[A-F]/.test(c) ? `[${c}${c.toLowerCase()}]` : c).join(''))).join("|")})`;
      }).join("");
      return { replacement: s === token ? "<token>" : "<redacted>", variants: [...variants].sort((a,b) => b.length-a.length), mixed: new RegExp(mixed, "g") };
    });
  return text => {
    for (const { replacement, variants, mixed } of pairs) {
      for (const v of variants) {
        // Percent hex is case-insensitive; the secret's actual letter case is not.
        const pattern = escape(v).replace(/%([0-9A-F]{2})/g, (_, h: string) => '%' + [...h].map(c => /[A-F]/.test(c) ? `[${c}${c.toLowerCase()}]` : c).join(''));
        text = text.replace(new RegExp(pattern, 'g'), () => replacement);
      }
      text = text.replace(mixed, () => replacement);
    }
    return text;
  };
}

async function command(args: string[], cwd?: string): Promise<string> {
  const child = Bun.spawn(args, { cwd, stdout: "pipe", stderr: "ignore" });
  const output = await new Response(child.stdout).text();
  if (await child.exited !== 0) throw new Error("Trace archive operation failed.");
  return output;
}
async function files(root: string) { return (await readdir(root, { recursive: true, withFileTypes: true })).filter(e => e.isFile()).map(e => join(e.parentPath, e.name)); }
async function unpack(raw: string, dir: string) {
  const names = (await command(["unzip", "-Z1", resolve(raw)])).trim().split("\n");
  // Only Playwright action-only files. No resources (screenshots, sources, DOM or response bodies).
  if (!names.length || names.some(n => !/^[A-Za-z0-9_.-]+\.(trace|network|stacks)$/.test(n))) throw new Error("Unsafe trace entry.");
  await command(["unzip", "-q", resolve(raw), "-d", dir]);
  return names;
}
/** Owns raw: deletes it and all temporary files even on failure; publishes only verified action traces. */
export async function sanitizeTrace(raw: string, destination: string, redact: Redactor): Promise<void> {
  let temp: string | undefined;
  try {
    temp = await mkdtemp(join(tmpdir(), "pirax-forms-scrub-"));
    const extracted = join(temp, "entries"); await mkdir(extracted, { mode: 0o700 });
    const names = await unpack(raw, extracted);
    for (const name of names) {
      if (redact(name) !== name) throw new Error("Unsafe trace name.");
      const file = join(extracted, name);
      const text = new TextDecoder("utf-8", { fatal: true }).decode(await readFile(file));
      if (name.endsWith(".network") && text.trim()) throw new Error("Network snapshots forbidden.");
      const clean = redact(text);
      if (redact(clean) !== clean) throw new Error("Trace verification failed.");
      if (name.endsWith(".trace")) for (const line of clean.split("\n").filter(Boolean)) {
        const event = JSON.parse(line);
        if (["screencast-frame", "frame-snapshot", "resource-snapshot"].includes(event.type)) throw new Error("Snapshots forbidden.");
      }
      await writeFile(file, clean, { mode: 0o600 });
    }
    const packed = join(temp, "safe.zip");
    await command(["zip", "-q", "-X", packed, ...names], extracted);
    await chmod(packed, 0o600);
    await mkdir(dirname(destination), { recursive: true, mode: 0o700 });
    // Copy through a private sibling so even a cross-filesystem tmpdir is safe and atomic.
    const sibling = destination + ".tmp";
    try { await writeFile(sibling, await readFile(packed), { mode: 0o600 }); await rename(sibling, destination); }
    finally { await rm(sibling, { force: true }); }
  } catch {
    await rm(destination, { force: true });
    throw new Error("Trace sanitation failed; unsafe evidence deleted.");
  } finally {
    await rm(raw, { force: true });
    if (temp) await rm(temp, { recursive: true, force: true });
  }
}
/** Stop tracing to a private transient directory, never the report's retained directory. */
export async function retainTrace(context: BrowserContext, destination: string, redact: Redactor): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), "pirax-forms-raw-"));
  try {
    const raw = join(dir, "trace.zip");
    await context.tracing.stop({ path: raw });
    await sanitizeTrace(raw, destination, redact);
  } catch { await rm(destination, { force: true }); throw new Error("Trace sanitation failed; unsafe evidence deleted."); }
  finally { await rm(dir, { recursive: true, force: true }); }
}
/** Returns only safe ordinal labels, never secret-bearing filenames or matching content. */
export async function findSecrets(root: string, redact: Redactor): Promise<string[]> {
  const hits: string[] = [];
  for (const [i, file] of (await files(root)).entries()) {
    if (redact(relative(root, file)) !== relative(root, file)) hits.push(`file-${i}:name`);
    if (file.endsWith(".zip")) {
      const dir = await mkdtemp(join(tmpdir(), "pirax-forms-verify-"));
      try { await unpack(file, dir); if ((await findSecrets(dir, redact)).length) hits.push(`file-${i}:archive`); }
      finally { await rm(dir, { recursive: true, force: true }); }
    } else {
      const text = (await readFile(file)).toString("utf8");
      if (redact(text) !== text) hits.push(`file-${i}:content`);
    }
  }
  return hits;
}
