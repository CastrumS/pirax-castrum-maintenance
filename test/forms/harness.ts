import { chmod, mkdir, readdir, rename } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright';
import { startHarness, type Harness } from '../plugin/harness.ts';
import { readFormConfig } from '../../src/forms/config.ts';
import { readImapConfig } from '../../src/mail/config.ts';
import { readR2Config } from '../../src/env.ts';
import { findSecrets, retainTrace, sanitizeTrace, secretRedactor } from '../../src/forms/evidence.ts';
import type { Site, TestForm } from '../../src/sites.ts';

export const ROOT = resolve(import.meta.dir, '../..');
export const lit = (v: unknown) => `json_decode('${JSON.stringify(v).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}', true)`;
export type Fixtures = { ids: Record<'gf'|'ff'|'ajax'|'upload'|'nomarker'|'client'|'server'|'requiredgf'|'requiredff'|'scope', number>; pages: Record<'primary'|'ajax'|'negative'|'required'|'scopeA'|'scopeB', string> };
export const safe = secretRedactor();
export function assert(ok: unknown, message: string): asserts ok { if (!ok) throw new Error(message); }

/** The upstream plugin harness only knows token/ZIP path. Sanitize all additional credentials
 * and fixture addresses before exposing its intermediate artifacts as retained evidence. */
export async function sanitizeArtifacts(dir: string, h?: Harness) {
  const redact = secretRedactor(undefined, [h?.users.admin.password ?? '', h?.users.editor.password ?? '', h?.users.subscriber.password ?? '',
    'owner@client.test','owner-2@client.test','owner-3@client.test','cc@client.test','bcc@client.test','wordpress@site.test']);
  for (const entry of await readdir(dir, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const file = join(entry.parentPath, entry.name);
    if (file.endsWith('.zip')) {
      const raw = file + '.raw'; await rename(file, raw);
      await sanitizeTrace(raw, file, text => redact(text.replaceAll('[REDACTED]', '<token>')));
    } else {
      await Bun.write(file, redact((await Bun.file(file).text()).replaceAll('[REDACTED]', '<token>')));
      await chmod(file, 0o600);
    }
  }
  assert((await findSecrets(dir, redact)).length === 0, 'Retained evidence privacy scan failed');
}

export async function startFormsHarness(workspace: string): Promise<{ h: Harness; fixtures: Fixtures; stop(): Promise<void> }> {
  // Missing/invalid prerequisites fail before boot or mutations, by name only.
  const config = readFormConfig(); readImapConfig(); readR2Config();
  const h = await startHarness({ run: 'forms-checker' });
  await chmod(h.artifactDir, 0o700);
  const stop = async () => {
    try { await h.saveEvidence(); }
    finally { try { await h.stop(); } finally { await sanitizeArtifacts(h.artifactDir, h); } }
  };
  try {
    assert(h.versions.gf === '3.1.2' && h.versions.ff === '6.2.14', 'Licensed GF 3.1.2 and FF 6.2.14 required');
    // Use a unique real fixture credential, not the generic word "password" (which also occurs
    // in untouched visual JS resources). Authentication still goes through WordPress wp-login.
    h.users.admin.password = `PiraxNative-${crypto.randomUUID()}`;
    await h.php<boolean>(`wp_set_password(${lit(h.users.admin.password)}, 1); return true;`);
    const browser = await chromium.launch({ headless: true });
    try {
      const context = await browser.newContext();
      await context.tracing.start({ screenshots: false, snapshots: false, sources: false });
      try {
        const page = await context.newPage();
        await page.goto(h.url + '/wp-login.php');
        await page.fill('#user_login', h.users.admin.login);
        await page.fill('#user_pass', h.users.admin.password);
        await page.click('#wp-submit'); await page.waitForURL(/\/wp-admin\/?/);
        await h.uploadPlugin(page, join(ROOT, 'dist/pirax-form-test.zip'));
        await page.goto(h.url + '/wp-admin/options-general.php?page=pirax-form-test');
        await page.fill('#pirax_form_test_token', config.token);
        await page.fill('#pirax_form_test_redirect', config.address);
        await page.click('#submit'); await page.locator('.notice-success').waitFor();
        assert(/is set/i.test(await page.locator('#pirax-form-test-token-status').innerText()), 'Settings did not confirm saved token');
        assert(await page.inputValue('#pirax_form_test_token') === '', 'Settings exposed saved token');
        const saved = await h.php<boolean>(`return hash_equals((string)get_option('pirax_form_test_token'), ${lit(config.token)}) && get_option('pirax_form_test_redirect') === ${lit(config.address)};`);
        assert(saved, 'Native settings readback mismatch');
      } finally {
        await retainTrace(context, join(workspace, 'admin.trace.zip'), secretRedactor(undefined, [h.users.admin.password]));
        await context.close();
      }
    } finally { await browser.close(); }
    const source = await Bun.file(join(import.meta.dir, 'fixtures.php')).text();
    const installed = await h.php<boolean>(`$text = base64_decode('${Buffer.from(source).toString('base64')}'); $file = WPMU_PLUGIN_DIR . '/forms-checker.php'; file_put_contents($file, $text); return file_get_contents($file) === $text;`);
    assert(installed, 'Installed native fixture text differs');
    const fixtures = await h.php<Fixtures>(`return pirax_checker_seed(${h.fixtures.gf}, ${h.fixtures.ff});`);
    for (const url of Object.values(fixtures.pages)) {
      const body = await (await fetch(url)).text();
      assert(body.includes('data-forms-fixture="native-v1"'), 'Native fixture served marker missing');
    }
    return { h, fixtures, stop };
  } catch (error) { await stop(); throw new Error(secretRedactor(undefined, [h.users.admin.password])(error instanceof Error ? error.message : 'Harness startup failed')); }
}

/** Explicit designation only: `undefined` means no test_form (every form skipped), never a guessed default. */
export function siteFor(urls: string | string[], helper: boolean, test_form: TestForm | undefined): Site {
  const pages = [urls].flat().map(url => new URL(url));
  assert(pages.every(u => u.origin === pages[0]!.origin), 'One site origin required');
  return { slug: 'local', url: pages[0]!.origin, form_helper: helper, mask: [], max_diff_pixel_ratio: 0.01, pages: pages.map(u => ({ path: u.pathname, mask: [] })), ...(test_form ? { test_form } : {}) };
}
export const designate = (url: string, plugin: TestForm['plugin'], id: number): TestForm => ({ page: new URL(url).pathname, plugin, id });

/** Real package-script invocation, differing only in scoped storage/evidence and muted bearer URL.
 * Each scenario gets its own package/runs directory, so exactly one report belongs to it. */
export async function cli(workspace: string, root: string, site: Site, scenario: string) {
  const dir = join(workspace, 'cli', scenario);
  const cwd = join(dir, 'package'); await mkdir(cwd, { recursive: true });
  const runsDir = join(dir, 'runs'); const list = join(cwd, 'sites.json');
  await Bun.write(list, JSON.stringify({ sites: [site] }));
  await Bun.write(join(cwd, 'package.json'), JSON.stringify({ private: true, scripts: {
    forms: [process.execPath, '--no-env-file', join(ROOT, 'test/fixtures/cli.ts'), root, runsDir, 'forms'].map(s => JSON.stringify(s)).join(' '),
  } }));
  const argv = [process.execPath, 'run', 'forms', 'local', '--sites', list];
  const started = performance.now();
  const child = Bun.spawn(argv, { cwd, stdout: 'pipe', stderr: 'pipe' });
  const [out, err, exitCode] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
  await Bun.write(join(dir, 'cli.log'), safe(out + err));
  const ids = (await readdir(runsDir)).filter(n => /^\d{4}-/.test(n));
  assert(ids.length === 1, 'CLI must retain exactly one report');
  const runDir = join(runsDir, ids[0]!);
  return { argv, cwd, exitCode, elapsedMs: Math.round(performance.now() - started), runDir, manifest: join(runDir, 'manifest.json'), report: join(runDir, 'index.html') };
}
