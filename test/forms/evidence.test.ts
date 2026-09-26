import { expect, test } from "bun:test";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { readImapConfig } from "../../src/mail/config.ts";
import { secretRedactor, sanitizeTrace, findSecrets } from "../../src/forms/evidence.ts";

test("sanitizer removes raw, percent, JSON/unicode, HTML and nested encodings", () => {
  const token = 'fixture-Private+Token/=123', password = 'p@ss\\word"&<long>';
  const redact = secretRedactor(token, [password]);
  const forms = (s: string) => [s, encodeURIComponent(s), [...Buffer.from(s)].map(b => '%' + b.toString(16)).join(''), encodeURIComponent(encodeURIComponent(s)), JSON.stringify(s), s.replace(/./g, c => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0')), s.replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`)];
  for (const s of forms(token)) expect(redact(s)).toContain('<token>');
  for (const s of forms(password)) expect(redact(s)).not.toBe(s);
});
test("automatic redaction distinguishes credentials from nonsecret configuration labels", () => {
  const labels = ['IMAP_HOST', 'IMAP_FOLDER', 'IMAP_SPAM_FOLDER', 'SMTP_HOST', 'S3_ENDPOINT', 'S3_BUCKET', 'GRAVITY_FORMS_ZIP'];
  const credentials = ['FORM_TEST_ADDRESS', 'IMAP_USER', 'IMAP_PASSWORD', 'SMTP_USER', 'SMTP_PASSWORD', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY'];
  const names = [...labels, ...credentials];
  const old = names.map(n => process.env[n]);
  try {
    for (const name of names) process.env[name] = `synthetic-${name}-value`;
    const redact = secretRedactor('synthetic-private-token');
    expect(labels.every(n => redact(process.env[n]!) === process.env[n])).toBe(true);
    expect(credentials.every(n => redact(process.env[n]!) === '<redacted>')).toBe(true);
    expect(redact('synthetic-private-token')).toBe('<token>');
  } finally { names.forEach((n, i) => { if (old[i] === undefined) delete process.env[n]; else process.env[n] = old[i]; }); }
});

test("sanitized trace JSON independently decodes without astral or mixed-escaped credentials", async () => {
  const dir = await mkdtemp(resolve('runs/forms-evidence-'));
  const credential = 'private-🔒-é-credential';
  const unit = (c: string) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0');
  const escaped = credential.split('').map(unit).join('');
  const mixed = [...credential].map((c, i) => i % 2 ? c : c.split('').map(unit).join('')).join('');
  const variants = [escaped, escaped.replace(/[a-f]/g, c => c.toUpperCase()), credential.replace('🔒', '\\ud83D\\uDd12'), mixed];
  expect(readImapConfig({ IMAP_HOST: 'imap.example.test', IMAP_PORT: '993', IMAP_USER: 'synthetic-user', IMAP_PASSWORD: credential, IMAP_FOLDER: 'Tests', IMAP_SPAM_FOLDER: 'Spam' }).password === credential).toBe(true);
  const raw = join(dir, 'raw.zip'), target = join(dir, 'safe.trace.zip');
  try {
    const lines = variants.map(v => '{"type":"before","params":{"value":"prefix ' + v + ' suffix"}}').join('\n');
    await writeFile(join(dir, 'trace.trace'), lines);
    const zip = Bun.spawn(['zip', '-q', raw, 'trace.trace'], { cwd: dir, stdout: 'ignore', stderr: 'ignore' });
    expect(await zip.exited).toBe(0);
    await sanitizeTrace(raw, target, secretRedactor('fixture-private-token', [credential]));
    const unzip = Bun.spawn(['unzip', '-p', target, 'trace.trace'], { stdout: 'pipe', stderr: 'ignore' });
    const retained = await new Response(unzip.stdout).text(); expect(await unzip.exited).toBe(0);
    const decoded = retained.split('\n').map(line => JSON.parse(line).params.value as string);
    expect(decoded.every(value => !value.includes(credential))).toBe(true);
    expect(decoded).toEqual(variants.map(() => 'prefix <redacted> suffix'));
    expect(await Bun.file(raw).exists()).toBe(false);
  } finally { await rm(dir, { recursive: true, force: true }); }
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
