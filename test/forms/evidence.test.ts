import { expect, test } from "bun:test";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { secretRedactor, sanitizeTrace, findSecrets } from "../../src/forms/evidence.ts";

test("sanitizer removes raw, percent, JSON/unicode, HTML and nested encodings", () => {
  const token = 'fixture-Private+Token/=123', password = 'p@ss\\word"&<long>';
  const redact = secretRedactor(token, [password]);
  const forms = (s: string) => [s, encodeURIComponent(s), [...Buffer.from(s)].map(b => '%' + b.toString(16)).join(''), encodeURIComponent(encodeURIComponent(s)), JSON.stringify(s), s.replace(/./g, c => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0')), s.replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`)];
  for (const s of forms(token)) expect(redact(s)).toContain('<token>');
  for (const s of forms(password)) expect(redact(s)).not.toBe(s);
});
test("trace sanitation fails closed, deletes raw and unsafe output on invalid archive", async () => {
  const dir = await mkdtemp(resolve('runs/forms-evidence-'));
  const raw = join(dir, 'raw.zip'), target = join(dir, 'safe.trace.zip');
  try {
    await writeFile(raw, 'not a zip');
    await expect(sanitizeTrace(raw, target, secretRedactor('fixture-private-token'))).rejects.toThrow('Trace sanitation failed');
    expect(await readdir(dir)).toEqual([]);
    expect(await findSecrets(dir, secretRedactor('fixture-private-token'))).toEqual([]);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
