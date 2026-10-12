// The native updater session and the channel-isolation scenario (plan D10), shared by updates.test.ts (generated
// keys only) and scripts/deployment-selftest.ts --updates (the production deployment's real key). Everything runs
// against real WordPress, fetching the loopback release fixture over HTTP; nothing here signs with a private key
// itself: a Signer answers detached signatures only.
//   allowChannelPort(h, fixture)     admit the fixture's loopback port to WordPress's safe HTTP API (test-only mu-plugin)
//   updateSession(h, fixture)        login, refresh (native wp_update_plugins, optional stale offer), installed
//                                    state, Plugin_Upgrader upgrade and the fixture ledger since a request count
//   refuseForeign({ ... })           a foreign signer's signature over the otherwise valid manifest, and a valid
//                                    signature over a foreign package URL: no offer, a stale offer dropped, the
//                                    native install refused and the installed bytes unchanged, each case separately
//   browserUpdate(session, page, h, target)  an authenticated admin updates through plugins.php; target is installed
// Failures throw with versions, hashes and request lines only, never key material.
import type { Page } from "playwright";
import type { Harness } from "./harness";
import { BASENAME, MANIFEST, SIGNATURE, SLUG, manifestFor, packagePath, type Body, type ReleaseFixture, type StagedHelper } from "./update-fixture";

export interface Signer {
  /** sha256 of the raw public key: safe to retain. */
  fingerprint: string;
  /** base64 detached signature over the exact bytes. */
  sign(bytes: string | Uint8Array): string;
}
export interface InstalledState { version: string; header: string; files: Record<string, string>; active: boolean; temps: string[] }
export interface ScenarioCase { name: string; offered: boolean; installed?: string; error?: string[]; requests?: string[] }

/** A PHP expression decoding a JSON value (single-quoted literal, so `$` and `\` stay literal). */
export const lit = (v: unknown) => `json_decode('${JSON.stringify(v).replace(/\\/g, "\\\\").replace(/'/g, "\\'")}', true)`;

const same = (what: string, actual: unknown, expected: unknown) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${what}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
};

/**
 * WordPress's safe HTTP API admits only ports 80/443/8080 besides the site's own; the fixture's port is admitted
 * by a test-only mu-plugin in this disposable site, for its exact host and port.
 */
export const allowChannelPort = (h: Harness, fixture: ReleaseFixture) =>
  h.php(`
    file_put_contents(WPMU_PLUGIN_DIR . '/pirax-update-fixture-port.php', "<?php\\nadd_filter('http_allowed_safe_ports', static fn(\\$p, \\$host) => '127.0.0.1' === \\$host ? array_merge((array) \\$p, [${fixture.port}]) : \\$p, 10, 2);\\n");
    return true;
  `);

export function updateSession(h: Harness, fixture: ReleaseFixture) {
  const session = {
    async login(page: Page) {
      await page.goto(`${h.url}/wp-login.php`);
      await page.fill("#user_login", h.users.admin.login);
      await page.fill("#user_pass", h.users.admin.password);
      await page.click("#wp-submit");
      await page.waitForURL(/\/wp-admin\/?/);
    },
    /** Native refresh: the stored transient is made due (optionally carrying a stale offer) and wp_update_plugins() runs. */
    refresh: (stale?: object) =>
      h.php<{ offer: Record<string, any> | null }>(`
        $t = get_site_transient('update_plugins');
        if (!is_object($t)) $t = new stdClass();
        $t->last_checked = 0;
        $stale = ${lit(stale ?? null)};
        if ($stale) { $t->response = (array) ($t->response ?? []); $t->response['${BASENAME}'] = (object) $stale; }
        update_option('_site_transient_update_plugins', $t); // raw write: no filter runs here
        wp_update_plugins();
        $after = get_site_transient('update_plugins');
        return ['offer' => isset($after->response['${BASENAME}']) ? (array) $after->response['${BASENAME}'] : null];
      `),
    /** What a fresh request loads: the helper's own constant and header, every installed file's digest, temp leftovers. */
    state: () =>
      h.php<InstalledState>(`
        require_once ABSPATH . 'wp-admin/includes/plugin.php';
        $dir = WP_PLUGIN_DIR . '/${SLUG}';
        $files = [];
        foreach (new RecursiveIteratorIterator(new RecursiveDirectoryIterator($dir, FilesystemIterator::SKIP_DOTS)) as $f) $files[substr($f->getPathname(), strlen($dir) + 1)] = hash_file('sha256', $f->getPathname());
        ksort($files);
        return [
          'version' => \\Pirax\\FormTest\\VERSION,
          'header' => get_plugin_data(WP_PLUGIN_DIR . '/${BASENAME}', false, false)['Version'],
          'files' => $files,
          'active' => is_plugin_active('${BASENAME}'),
          'temps' => array_values(array_map('basename', glob(get_temp_dir() . '${SLUG}-*.tmp') ?: [])),
        ];
      `),
    /** Plugin_Upgrader::bulk_upgrade(), exactly as wp_ajax_update_plugin() runs it; returns the skin's error codes. */
    nativeUpgrade: () =>
      h.php<{ codes: string[]; result: unknown }>(`
        require_once ABSPATH . 'wp-admin/includes/admin.php';
        require_once ABSPATH . 'wp-admin/includes/class-wp-upgrader.php';
        wp_set_current_user(1);
        $skin = new WP_Ajax_Upgrader_Skin();
        $result = (new Plugin_Upgrader($skin))->bulk_upgrade(['${BASENAME}']);
        return ['codes' => $skin->get_errors()->get_error_codes(), 'result' => is_array($result) ? array_map(fn($r) => is_wp_error($r) ? $r->get_error_code() : (bool) $r, $result) : $result];
      `),
    since: (n: number) => fixture.requests.slice(n).map((r) => `${r.status} ${r.path.startsWith(`${new URL(fixture.root).pathname}/`) ? r.path.slice(new URL(fixture.root).pathname.length + 1) : r.path}`),
    /** Throws unless exactly helper's version and bytes are installed, active and without temp leftovers. */
    async installedIs(helper: StagedHelper, what: string) {
      const s = await session.state();
      same(`${what}: installed helper`, { version: s.version, header: s.header, active: s.active, temps: s.temps }, { version: helper.version, header: helper.version, active: true, temps: [] });
      same(`${what}: installed files`, s.files, Object.fromEntries(Object.entries(helper.files).sort(([a], [b]) => a.localeCompare(b))));
    },
  };
  return session;
}
export type UpdateSession = ReturnType<typeof updateSession>;

/** Manifest and signature routes for exact manifest bytes signed by signer. */
const feed = (signer: Signer, text: string): Record<string, Body> => ({ [MANIFEST]: text, [SIGNATURE]: signer.sign(text) });

/**
 * With `installed` active and `target` published, a foreign signature over the same valid manifest bytes and a
 * channel-key signature over a foreign package URL are each refused at refresh (no offer, stale offer dropped, no
 * package request) and at install time (native upgrade refused); installed bytes stay those of `installed`.
 */
export async function refuseForeign({ h, fixture, session, installed, target, key, foreign, foreignPackage, audited }: {
  h: Harness;
  fixture: ReleaseFixture;
  session: UpdateSession;
  installed: StagedHelper;
  target: StagedHelper;
  key: Signer;
  foreign: { label: string; signer: Signer };
  foreignPackage: { label: string; url: string };
  audited: Record<string, string>;
}): Promise<ScenarioCase[]> {
  const cases: ScenarioCase[] = [];
  const valid = JSON.stringify(manifestFor(fixture.root, target.version, target.bytes, audited));
  const routes = (manifest: Record<string, Body>) => ({ ...manifest, [packagePath(target.version)]: target.bytes });
  const variants: [string, Record<string, Body>][] = [
    [`same manifest signed by ${foreign.label}`, routes(feed(foreign.signer, valid))],
    [`channel key signs ${foreignPackage.label}`, routes(feed(key, JSON.stringify({ ...JSON.parse(valid), package: foreignPackage.url })))],
  ];
  const offerValid = async (what: string) => {
    fixture.serve(routes(feed(key, valid)));
    const { offer } = await session.refresh();
    same(`${what}: channel-signed offer`, { version: offer?.new_version, package: offer?.package }, { version: target.version, package: `${fixture.root}/${packagePath(target.version)}` });
    return offer!;
  };
  for (const [name, served] of variants) {
    const stale = await offerValid(name);
    fixture.serve(served);
    let n = fixture.requests.length;
    const refreshed = await session.refresh(stale);
    cases.push({ name: `refresh: ${name}`, offered: refreshed.offer !== null, requests: session.since(n) });
    same(`refresh: ${name}: offer`, refreshed.offer, null);
    same(`refresh: ${name}: package requested`, session.since(n).some((r) => r.includes(".zip")), false);
    await session.installedIs(installed, `refresh: ${name}`);

    await offerValid(name);
    fixture.serve(served);
    n = fixture.requests.length;
    const upgrade = await session.nativeUpgrade();
    cases.push({ name: `install: ${name}`, offered: true, installed: (await session.state()).version, error: upgrade.codes, requests: session.since(n) });
    same(`install: ${name}: refused`, upgrade.codes.includes("pirax_form_test_update"), true);
    await session.installedIs(installed, `install: ${name}`);
  }
  // The foreign package URL handed straight to the install path: the offer itself names it.
  await offerValid(foreignPackage.label);
  await h.php(`$t = get_site_transient('update_plugins'); $t->response['${BASENAME}']->package = ${lit(foreignPackage.url)}; update_option('_site_transient_update_plugins', $t); return true;`);
  const n = fixture.requests.length;
  const upgrade = await session.nativeUpgrade();
  const name = `install: offer edited to ${foreignPackage.label}`;
  cases.push({ name, offered: true, installed: (await session.state()).version, error: upgrade.codes, requests: session.since(n) });
  same(`${name}: refused`, upgrade.codes.includes("pirax_form_test_update"), true);
  await session.installedIs(installed, name);
  return cases;
}

/** An authenticated admin's plugins.php update of the offered target; returns the fixture requests it caused. */
export async function browserUpdate(session: UpdateSession, page: Page, h: Harness, fixture: ReleaseFixture, target: StagedHelper) {
  const n = fixture.requests.length;
  await page.goto(`${h.url}/wp-admin/plugins.php`);
  const row = page.locator(`tr.plugin-update-tr[data-plugin="${BASENAME}"]`);
  await row.locator("a.update-link").click();
  await row.locator(".update-message.updated-message").waitFor({ timeout: 120_000 });
  await session.installedIs(target, "browser update");
  return session.since(n);
}
