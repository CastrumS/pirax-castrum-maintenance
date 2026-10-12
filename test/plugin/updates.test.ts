// Signed helper self-updates against real WordPress (plan D2–D4, D10; AC1, AC2, AC3): a 0.3.0 helper of the
// synthetic second deployment (its own name, slug and loopback channel, built from disposable deployment data by
// the production build) is offered 0.3.1 through the native update transient, plugins_api and auto_update_plugin,
// and installs it through Plugin_Upgrader from an authenticated wp-admin session. Every invalid feed or package,
// a foreign key's signature and the Pirax channel's package URL included, leaves no offer and the installed bytes
// unchanged. No update or auth HTTP is mocked: WordPress fetches the fixture over real loopback HTTP. Keys are
// generated here; the production key's refusal is scripts/deployment-selftest.ts --updates.
// The Pirax helper is never installed next to the fixture helper: both share the internal namespace.
// bun --env-file=/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/.env test test/plugin/updates.test.ts
import { afterAll, beforeAll, expect, setDefaultTimeout, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { BrowserContext, Page } from "playwright";
import { withoutSigningKey } from "../../scripts/build-plugin";
import { loadDeployment } from "../../src/deployment";
import { findSecret } from "./artifacts";
import { FF_VERSION, startHarness, type Harness } from "./harness";
import { allowChannelPort, browserUpdate, lit, refuseForeign, updateSession, type ScenarioCase, type UpdateSession } from "./update-scenario";
import {
  BASENAME,
  MANIFEST,
  NAME,
  SIGNATURE,
  SLUG,
  manifestFor,
  packagePath,
  sha256,
  signedFeed,
  stageHelper,
  startReleaseFixture,
  testKey,
  type Body,
  type ReleaseFixture,
  type StagedHelper,
  type TestKey,
} from "./update-fixture";
import { PINS } from "./version-fixtures";

setDefaultTimeout(180_000);

const ROOT = resolve(import.meta.dir, "../..");
const SOURCE = join(ROOT, "plugin/pirax-form-test");
const B = BASENAME;
const F = "\\Pirax\\FormTest\\";
/** The Pirax channel, independently written down: the fixture helper must never accept it. */
const PRODUCTION_ROOT = "https://github.com/CastrumS/pirax-castrum-maintenance/releases";
const PRODUCTION_KEY = "D8BfOn8TZC3jD+Hv5Q+p7SGPNGIYISVcMCqQWU0Dh9w=";
const pirax = loadDeployment({ env: { DEPLOYMENT: "pirax" } });
/** Another plugin's real wordpress.org package URL, which the helper's download filter must leave alone. */
const UNRELATED = `https://downloads.wordpress.org/plugin/fluentform.${FF_VERSION}.zip`;
/** Shared templates and every real deployment's data, committed and working-tree state: staging must not touch them. */
const sourceDigest = async () =>
  createHash("sha256")
    .update(await Bun.$`git ls-files -s -- ${SOURCE} deployments`.cwd(ROOT).env(withoutSigningKey()).text())
    .update(await Bun.$`git diff --no-ext-diff -- ${SOURCE} deployments`.cwd(ROOT).env(withoutSigningKey()).text())
    .digest("hex");

let h: Harness;
let fixture: ReleaseFixture;
let key: TestKey;
let other: TestKey;
let out: string;
let audited: Record<string, string>;
let installed: StagedHelper; // 0.3.0, the updater-equipped starting point
let target: StagedHelper; // 0.3.1, the signed release
let newer: StagedHelper; // 0.3.2, a later release that appears between offer and download
let hostile: StagedHelper; // 0.3.1 built with another key: a valid, installable but unsigned package
let admin: { context: BrowserContext; page: Page };
let sourceBefore: string;
let session: UpdateSession;
const cases: ScenarioCase[] = [];

beforeAll(async () => {
  sourceBefore = await sourceDigest();
  [h, fixture] = await Promise.all([startHarness({ run: "updates" }), startReleaseFixture()]);
  key = testKey();
  other = testKey();
  out = await mkdtemp(join(tmpdir(), "pirax-update-zips-"));
  // Vendor pins are the selected deployment's, matching the licensed ZIPs the harness boots with.
  const stage = (version: string, k: TestKey) => stageHelper({ version, publicKey: k.publicKey, root: fixture.root, audited: PINS, out });
  [installed, target, newer, hostile] = await Promise.all([stage("0.3.0", key), stage("0.3.1", key), stage("0.3.2", key), stage("0.3.1", other)]);
  await allowChannelPort(h, fixture);
  session = updateSession(h, fixture);
  admin = await h.browser("updates-listing-install");
  await login(admin.page);
  await h.uploadPlugin(admin.page, installed.zip);
  audited = await h.php<Record<string, string>>(`return ${F}AUDITED_VERSIONS;`);
}, 600_000);

afterAll(async () => {
  await h?.stop();
  await fixture?.stop();
  if (out) await rm(out, { recursive: true, force: true });
}, 60_000);

const login = (page: Page) => session.login(page);

const valid = (release = target, k = key) => ({
  ...signedFeed(k, manifestFor(fixture.root, release.version, release.bytes, audited)),
  [packagePath(release.version)]: release.bytes,
});

const refresh = (stale?: object) => session.refresh(stale);
const state = () => session.state();
const expectInstalled = async (helper: StagedHelper) => {
  const s = await state();
  expect({ version: s.version, header: s.header, active: s.active, temps: s.temps }).toEqual({ version: helper.version, header: helper.version, active: true, temps: [] });
  expect(s.files).toEqual(Object.fromEntries(Object.entries(helper.files).sort(([a], [b]) => a.localeCompare(b))));
};
const nativeUpgrade = () => session.nativeUpgrade();
const since = (n: number) => session.since(n);

test("staged helpers carry only the fixture deployment's identity and channel; templates and Pirax keep the production trust root", async () => {
  const updates = await Bun.file(join(SOURCE, "includes/updates.php")).text();
  const main = await Bun.file(join(SOURCE, "pirax-form-test.php")).text();
  // The templates hold the channel and key as deployment tokens only, and nothing can replace them at runtime.
  expect(updates).toContain("\nconst UPDATE_RELEASES_ROOT = '{{php:channel.releasesRoot}}';\n");
  expect(updates).toContain("\nconst UPDATE_PUBLIC_KEY = '{{php:channel.publicKey}}';\n");
  expect(main).toContain("\n * Update URI:        {{raw:plugin.updateUri}}\n");
  expect(main).toContain("require_once __DIR__ . '/includes/updates.php';");
  expect(updates).not.toMatch(/apply_filters|get_option|getenv|\$_(GET|POST|REQUEST|SERVER|COOKIE)|defined\s*\(\s*'PIRAX/);
  // Pirax's own data still names the production channel and key.
  expect([pirax.config.channel.releasesRoot, pirax.config.channel.publicKey, pirax.config.plugin.updateUri]).toEqual([PRODUCTION_ROOT, PRODUCTION_KEY, "https://github.com/CastrumS/pirax-castrum-maintenance"]);

  const unzip = (zip: string, file: string) => Bun.$`unzip -p ${zip} ${`${SLUG}/${file}`}`.env(withoutSigningKey()).text();
  const staged = await unzip(installed.zip, "includes/updates.php");
  for (const line of [`const UPDATE_RELEASES_ROOT = '${fixture.root}';`, `const UPDATE_PUBLIC_KEY = '${key.publicKey}';`, `const UPDATE_BASENAME = '${B}';`, `const UPDATE_SLUG = '${SLUG}';`, "const UPDATE_ERROR = 'pirax_form_test_update';"])
    expect(staged).toContain(`\n${line}\n`);
  expect(staged).not.toContain(PRODUCTION_ROOT);
  expect(staged).not.toContain(PRODUCTION_KEY);
  const stagedMain = await unzip(installed.zip, `${SLUG}.php`);
  expect(stagedMain).toContain("\nnamespace Pirax\\FormTest;\n");
  expect(stagedMain).not.toMatch(/CastrumS|Pirax Form Test/);
  expect(Object.keys(installed.files).sort()).toEqual(Object.keys(target.files).sort());
  await expectInstalled(installed);
  expect(await sourceDigest()).toBe(sourceBefore);

  // Installed: the configured basename and name, the internal namespace, hooks and error code unchanged, and no
  // second helper (they would share that namespace).
  const site = await h.php<any>(`
    require_once ABSPATH . 'wp-admin/includes/plugin.php';
    return [
      'helpers' => array_values(array_filter(get_option('active_plugins'), fn($p) => str_ends_with($p, '/${SLUG}.php') || str_starts_with($p, 'pirax-form-test/'))),
      'name' => get_plugin_data(WP_PLUGIN_DIR . '/${B}', false, false)['Name'],
      'hooks' => [10 === has_filter('pre_set_site_transient_update_plugins', 'Pirax\\FormTest\\offer_update'), PHP_INT_MAX === has_filter('upgrader_pre_download', 'Pirax\\FormTest\\download_update')],
      'error' => ${F}UPDATE_ERROR,
      'pirax' => is_dir(WP_PLUGIN_DIR . '/pirax-form-test'),
    ];
  `);
  expect(site).toEqual({ helpers: [B], name: NAME, hooks: [true, true], error: "pirax_form_test_update", pirax: false });

  // Children that never sign do not receive a (synthetic) seed. The child reports presence only, so a
  // failure cannot print any other variable of this environment.
  const seen = await Bun.$`sh -c ${'echo "${PIRAX_HELPER_SIGNING_KEY+present}"'}`.env(withoutSigningKey({ ...process.env, PIRAX_HELPER_SIGNING_KEY: "synthetic-seed-for-env-test" })).text();
  expect(seen.trim()).toBe("");
});

test("a verified newer release is offered natively; every invalid feed offers nothing and drops a stale offer", async () => {
  fixture.serve(valid());
  const first = fixture.requests.length;
  const { offer } = await refresh();
  expect(offer).toMatchObject({ slug: SLUG, plugin: B, new_version: "0.3.1", package: `${fixture.root}/${packagePath("0.3.1")}` });
  // The refresh fetched the signed feed only (once per request), never the package.
  expect(since(first)).toEqual([`200 ${MANIFEST}`, `200 ${SIGNATURE}`]);
  const stale = offer!;

  const m = (patch: object) => ({ ...manifestFor(fixture.root, "0.3.1", target.bytes, audited), ...patch });
  const pkg = (url: string) => signedFeed(key, m({ package: url }));
  const good = signedFeed(key, m({}));
  const flip = (sig: string) => {
    const raw = Buffer.from(sig, "base64");
    raw[10]! ^= 1;
    return raw.toString("base64");
  };
  const origin = new URL(fixture.root);
  const invalid: [string, Record<string, Body>][] = [
    ["unsigned (no .sig)", { [MANIFEST]: good[MANIFEST]! }],
    ["signature not base64", { ...good, [SIGNATURE]: "!!not-base64!!" }],
    ["signature of 63 bytes", { ...good, [SIGNATURE]: Buffer.alloc(63, 7).toString("base64") }],
    ["corrupted signature byte", { ...good, [SIGNATURE]: flip(good[SIGNATURE] as string) }],
    ["signed by another key", signedFeed(other, m({}))],
    ["manifest bytes changed after signing", { ...good, [MANIFEST]: `${good[MANIFEST]} ` }],
    ["equal version", signedFeed(key, manifestFor(fixture.root, "0.3.0", installed.bytes, audited))],
    ["older version", signedFeed(key, manifestFor(fixture.root, "0.2.9", installed.bytes, audited))],
    ["signed non-JSON", signedFeed(key, "{not json")],
    ["signed JSON list", signedFeed(key, JSON.stringify([m({})]))],
    ["missing sha256", signedFeed(key, (({ sha256: _s, ...rest }) => rest)(m({})))],
    ["extra field", signedFeed(key, m({ trusted: true }))],
    ["uppercase sha256", signedFeed(key, m({ sha256: target.sha256.toUpperCase() }))],
    ["short sha256", signedFeed(key, m({ sha256: target.sha256.slice(1) }))],
    ["prerelease version", signedFeed(key, m({ version: "0.3.1-beta", package: `${fixture.root}/${packagePath("0.3.1-beta")}` }))],
    ["v-prefixed version", signedFeed(key, m({ version: "v0.3.1", package: `${fixture.root}/${packagePath("v0.3.1")}` }))],
    ["numeric version", signedFeed(key, m({ version: 31 }))],
    ["audited as a list", signedFeed(key, m({ audited: Object.values(audited) }))],
    ["audited with a non-string version", signedFeed(key, m({ audited: { ...audited, gravityforms: 3 } }))],
    ["package on another host", pkg(`http://127.0.0.2:${origin.port}${origin.pathname}/${packagePath("0.3.1")}`)],
    ["package on another port", pkg(`http://127.0.0.1:${Number(origin.port) + 1}${origin.pathname}/${packagePath("0.3.1")}`)],
    ["package at the production origin", pkg(`${PRODUCTION_ROOT}/${packagePath("0.3.1")}`)],
    ["package at the Pirax channel's own package URL", pkg(`${PRODUCTION_ROOT}/download/v0.3.1/${pirax.assets.zip}`)],
    ["Pirax's asset name on this channel", pkg(`${fixture.root}/download/v0.3.1/${pirax.assets.zip}`)],
    ["package with userinfo", pkg(`http://user@127.0.0.1:${origin.port}${origin.pathname}/${packagePath("0.3.1")}`)],
    ["package with a query", pkg(`${fixture.root}/${packagePath("0.3.1")}?x=1`)],
    ["package with a fragment", pkg(`${fixture.root}/${packagePath("0.3.1")}#x`)],
    ["package path traversal", pkg(`${fixture.root}/download/v0.3.1/../v0.3.1/${SLUG}.zip`)],
    ["package encoded traversal", pkg(`${fixture.root}/download/v0.3.1/%2e%2e/v0.3.1/${SLUG}.zip`)],
    ["package in a lookalike repository", pkg(fixture.root.replace(/\/releases$/, "-evil/releases") + `/${packagePath("0.3.1")}`)],
    ["package for another version", pkg(`${fixture.root}/${packagePath("0.3.2")}`)],
    ["package with another asset name", pkg(`${fixture.root}/download/v0.3.1/other.zip`)],
    ["manifest HTTP 500", { ...good, [MANIFEST]: { status: 500 } }],
    ["manifest connection reset", { ...good, [MANIFEST]: "reset" }],
    ["signature connection reset", { ...good, [SIGNATURE]: "reset" }],
    ["release missing (404)", {}],
  ];
  for (const [name, routes] of invalid) {
    fixture.serve(routes);
    const n = fixture.requests.length;
    const result = await refresh(stale);
    cases.push({ name: `refresh: ${name}`, offered: result.offer !== null, requests: since(n) });
    expect({ name, offer: result.offer }).toEqual({ name, offer: null });
    expect(since(n).some((r) => r.includes(".zip"))).toBe(false);
  }
  await expectInstalled(installed);

  // Unrelated entries pass through the same filter untouched, while a stale helper offer is removed.
  const unrelated = { slug: "other", plugin: "other/other.php", new_version: "9.9", package: "https://downloads.wordpress.org/plugin/other.9.9.zip" };
  const filtered = await h.php<any>(`
    $value = (object) ['last_checked' => time(), 'response' => ['other/other.php' => (object) ${lit(unrelated)}, '${B}' => (object) ${lit(stale)}], 'no_update' => [], 'checked' => []];
    $after = apply_filters('pre_set_site_transient_update_plugins', $value, 'update_plugins');
    return ['keys' => array_keys($after->response), 'other' => (array) $after->response['other/other.php'], 'scalar' => ${F}offer_update(false)];
  `);
  expect(filtered).toEqual({ keys: ["other/other.php"], other: unrelated, scalar: false });
});

test("plugins_api answers only this helper's details, with inert escaped text, and never falls through to wordpress.org", async () => {
  fixture.serve({ ...valid(), ...signedFeed(key, manifestFor(fixture.root, "0.3.1", target.bytes, { ...audited, "<b>x</b>": "<script>1</script>" })) });
  const api = await h.php<any>(`
    require_once ABSPATH . 'wp-admin/includes/plugin-install.php';
    $r = plugins_api('plugin_information', ['slug' => '${SLUG}']);
    $sentinel = (object) ['untouched' => true];
    return [
      'ours' => is_wp_error($r) ? $r->get_error_code() : ['name' => $r->name, 'slug' => $r->slug, 'version' => $r->version, 'download_link' => $r->download_link, 'external' => $r->external, 'sections' => $r->sections],
      'otherSlug' => apply_filters('plugins_api', $sentinel, 'plugin_information', (object) ['slug' => 'akismet']) === $sentinel,
      'otherAction' => apply_filters('plugins_api', false, 'query_plugins', (object) ['slug' => '${SLUG}']),
    ];
  `);
  expect(api.ours).toMatchObject({ name: NAME, slug: SLUG, version: "0.3.1", download_link: `${fixture.root}/${packagePath("0.3.1")}`, external: true });
  const sections = JSON.stringify(api.ours.sections);
  expect(sections).not.toMatch(/<script|<b>/);
  expect(sections).toContain("&lt;script&gt;1&lt;/script&gt;");
  expect([api.otherSlug, api.otherAction]).toEqual([true, false]);

  // An invalid feed is an error for this slug, not `false` (which would ask wordpress.org about a same-named plugin).
  fixture.serve({ ...valid(), [SIGNATURE]: other.sign("x") });
  expect(await h.php<string>(`require_once ABSPATH . 'wp-admin/includes/plugin-install.php'; $r = plugins_api('plugin_information', ['slug' => '${SLUG}']); return is_wp_error($r) ? $r->get_error_code() : 'offered';`)).toBe("pirax_form_test_update");
});

test("auto_update_plugin opts in this exact helper only and preserves every other decision", async () => {
  fixture.serve(valid());
  await refresh();
  const decisions = await h.php<any>(`
    require_once ABSPATH . 'wp-admin/includes/admin.php';
    require_once ABSPATH . 'wp-admin/includes/class-wp-upgrader.php';
    $updater = new WP_Automatic_Updater();
    $helper = get_site_transient('update_plugins')->response['${B}'];
    $item = fn($plugin) => (object) ['plugin' => $plugin, 'slug' => dirname($plugin), 'new_version' => '1.0'];
    return [
      'nativeHelper' => $updater->should_update('plugin', $helper, WP_PLUGIN_DIR),
      'nativeUnrelated' => $updater->should_update('plugin', $item('fluentform/fluentform.php'), WP_PLUGIN_DIR),
      'helperFalse' => apply_filters('auto_update_plugin', false, $item('${B}')),
      'unrelatedFalse' => apply_filters('auto_update_plugin', false, $item('fluentform/fluentform.php')),
      'unrelatedTrue' => apply_filters('auto_update_plugin', true, $item('fluentform/fluentform.php')),
      'unrelatedNull' => apply_filters('auto_update_plugin', null, $item('fluentform/fluentform.php')),
      'lookalike' => apply_filters('auto_update_plugin', false, $item('${SLUG}-evil/${SLUG}.php')),
      'noPlugin' => apply_filters('auto_update_plugin', false, (object) ['slug' => '${SLUG}']),
    ];
  `);
  expect(decisions).toEqual({ nativeHelper: true, nativeUnrelated: false, helperFalse: true, unrelatedFalse: false, unrelatedTrue: true, unrelatedNull: null, lookalike: false, noPlugin: false });
});

test("the download boundary refuses unverified helper packages and leaves the installed bytes unchanged", async () => {
  // A valid, installable package that is not the signed one: refused in the real browser update.
  fixture.serve(valid());
  expect((await refresh()).offer).toMatchObject({ new_version: "0.3.1" });
  fixture.serve({ ...valid(), [packagePath("0.3.1")]: hostile.bytes });
  const browser = await h.browser("updates-hash-mismatch");
  try {
    await login(browser.page);
    let n = fixture.requests.length;
    await browser.page.goto(`${h.url}/wp-admin/plugins.php`);
    const row = browser.page.locator(`tr.plugin-update-tr[data-plugin="${B}"]`);
    await row.locator("a.update-link").click();
    const message = row.locator(".update-message.notice-error");
    await message.waitFor({ timeout: 120_000 });
    expect(await message.innerText()).toMatch(/Update failed/i);
    expect(since(n)).toContain(`302 ${packagePath("0.3.1")}`);
    cases.push({ name: "browser update: hash mismatch", offered: true, installed: (await state()).version, requests: since(n) });
  } finally {
    await h.closeBrowser(browser.context);
  }
  await expectInstalled(installed);

  // Each case starts from a fresh, verified offer of 0.3.1, then changes something before the download.
  const attempts: [string, () => Promise<void>][] = [
    ["hash mismatch", async () => fixture.serve({ ...valid(), [packagePath("0.3.1")]: hostile.bytes })],
    ["feed moved to a newer release", async () => fixture.serve(valid(newer))],
    ["same version re-signed for other bytes", async () => fixture.serve({ ...signedFeed(key, manifestFor(fixture.root, "0.3.1", hostile.bytes, audited)), [packagePath("0.3.1")]: hostile.bytes })],
    ["feed unreachable at install time", async () => fixture.serve({ ...valid(), [MANIFEST]: { status: 500 } })],
    ["feed no longer signed", async () => fixture.serve({ ...valid(), [SIGNATURE]: other.sign("x") })],
    ["package download fails", async () => fixture.serve({ ...valid(), [packagePath("0.3.1")]: "reset" })],
    ["offer edited to a hostile package", async () => void (await h.php(`$t = get_site_transient('update_plugins'); $t->response['${B}']->package = 'https://example.com/${SLUG}.zip'; update_option('_site_transient_update_plugins', $t); return true;`))],
    ["offer edited to another version", async () => void (await h.php(`$t = get_site_transient('update_plugins'); $t->response['${B}']->new_version = '0.3.2'; update_option('_site_transient_update_plugins', $t); return true;`))],
  ];
  for (const [name, change] of attempts) {
    fixture.serve(valid());
    expect((await refresh()).offer).toMatchObject({ new_version: "0.3.1" });
    await change();
    const n = fixture.requests.length;
    const upgrade = await nativeUpgrade();
    cases.push({ name: `install: ${name}`, offered: true, installed: (await state()).version, error: upgrade.codes, requests: since(n) });
    expect({ name, codes: upgrade.codes }).toEqual({ name, codes: expect.arrayContaining(["pirax_form_test_update"]) });
    await expectInstalled(installed);
  }

  // Direct use of the download filter: no helper download without a verified manifest and offer, and
  // a refusal is always an error, never `false` (which would let WordPress download unchecked).
  fixture.serve(valid());
  await refresh();
  const direct = await h.php<any>(`
    require_once ABSPATH . 'wp-admin/includes/admin.php';
    require_once ABSPATH . 'wp-admin/includes/class-wp-upgrader.php';
    $u = new Plugin_Upgrader(new Automatic_Upgrader_Skin());
    $canonical = ${lit(`${fixture.root}/${packagePath("0.3.1")}`)};
    $code = fn($r) => is_wp_error($r) ? $r->get_error_code() : $r;
    $existing = new WP_Error('earlier_filter', 'kept');
    return [
      'hostileForHelper' => $code($u->download_package('https://example.com/x.zip', false, ['plugin' => '${B}'])),
      'localFileForHelper' => $code($u->download_package(__FILE__, false, ['plugin' => '${B}'])),
      'helperPackageAsInstall' => $code($u->download_package($canonical, false, ['type' => 'plugin', 'action' => 'install'])),
      'helperPackageForOtherPlugin' => $code($u->download_package($canonical, false, ['plugin' => 'fluentform/fluentform.php'])),
      'prepopulatedForHelper' => $code(apply_filters('upgrader_pre_download', '/tmp/elsewhere.zip', $canonical, $u, ['plugin' => '${B}'])),
      'errorKept' => apply_filters('upgrader_pre_download', $existing, $canonical, $u, ['plugin' => '${B}']) === $existing,
      'unrelatedFalse' => apply_filters('upgrader_pre_download', false, ${lit(UNRELATED)}, $u, ['plugin' => 'fluentform/fluentform.php']),
      'unrelatedReply' => apply_filters('upgrader_pre_download', '/tmp/other.zip', '${fixture.root}/download/v1.0/another-plugin.zip', $u, ['plugin' => 'fluentform/fluentform.php']),
      'unrelatedNoContext' => apply_filters('upgrader_pre_download', false, ${lit(UNRELATED)}, $u, []),
      'temps' => array_values(array_map('basename', glob(get_temp_dir() . '${SLUG}-*.tmp') ?: [])),
    ];
  `);
  expect(direct).toEqual({
    hostileForHelper: "pirax_form_test_update",
    localFileForHelper: "pirax_form_test_update",
    helperPackageAsInstall: "pirax_form_test_update",
    helperPackageForOtherPlugin: "pirax_form_test_update",
    prepopulatedForHelper: "pirax_form_test_update",
    errorKept: true,
    unrelatedFalse: false,
    unrelatedReply: "/tmp/other.zip",
    unrelatedNoContext: false,
    temps: [],
  });
  await expectInstalled(installed);
}, 600_000);

test("channel isolation: another key's signature over the valid manifest and the Pirax package URL are each refused at refresh and install", async () => {
  const isolation = await refuseForeign({
    h,
    fixture,
    session,
    installed,
    target,
    key,
    foreign: { label: "another generated key", signer: other },
    foreignPackage: { label: "the Pirax package URL", url: `${pirax.config.channel.releasesRoot}/download/v${target.version}/${pirax.assets.zip}` },
    audited,
  });
  expect(isolation.map((c) => c.name)).toEqual([
    "refresh: same manifest signed by another generated key",
    "install: same manifest signed by another generated key",
    "refresh: channel key signs the Pirax package URL",
    "install: channel key signs the Pirax package URL",
    "install: offer edited to the Pirax package URL",
  ]);
  expect(isolation.every((c) => (c.name.startsWith("refresh:") ? !c.offered : c.installed === installed.version))).toBe(true);
  cases.push(...isolation);
  await expectInstalled(installed);
}, 600_000);

test("an authenticated admin lists, inspects and installs the signed release through native WordPress", async () => {
  const { page } = admin;
  fixture.serve(valid());
  await h.php(`delete_site_transient('update_plugins'); return true;`);
  const n = fixture.requests.length;

  // plugins.php itself refreshes the emptied transient (load-plugins.php → wp_update_plugins()).
  await page.goto(`${h.url}/wp-admin/plugins.php`);
  const row = page.locator(`tr.plugin-update-tr[data-plugin="${B}"]`);
  await row.waitFor();
  expect(await row.innerText()).toMatch(new RegExp(`new version of ${NAME.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} available.*View version 0\\.3\\.1 details`, "s"));

  // The details modal's own URL, rendered from plugins_api().
  const details = await row.locator("a.open-plugin-details-modal").getAttribute("href");
  expect(details).toContain(`plugin-install.php?tab=plugin-information&plugin=${SLUG}`);
  const info = await h.browser("updates-details");
  try {
    await login(info.page);
    await info.page.goto(details!.replace(/&TB_iframe=.*$/, ""));
    expect(await info.page.locator("#plugin-information-title").innerText()).toContain(NAME);
    expect(await info.page.locator(".fyi").innerText()).toMatch(/Version:\s*0\.3\.1/);
    // WordPress 7.1 gives the modal's update button the install id.
    expect(await info.page.locator("#plugin_install_from_iframe").innerText()).toMatch(/Update Now/i);
  } finally {
    await h.closeBrowser(info.context);
  }

  // The install re-verifies the signed feed before it downloads the package; target's bytes are then installed.
  const requests = [...since(n), ...(await browserUpdate(session, page, h, fixture, target))];
  expect(requests).toContain(`200 ${MANIFEST}`);
  expect(requests).toContain(`200 ${SIGNATURE}`);
  expect(requests).toContain(`302 ${packagePath("0.3.1")}`);
  expect(requests).toContain(`200 /assets/${encodeURIComponent(packagePath("0.3.1"))}`);
  expect(fixture.requests.slice(n).every((r) => r.wordpress)).toBe(true);

  // A fresh request loads the new files.
  await expectInstalled(target);
  await page.goto(`${h.url}/wp-admin/plugins.php`);
  expect(await page.locator(`tr[data-plugin="${B}"] .plugin-version-author-uri`).innerText()).toContain("Version 0.3.1");
  expect(await page.locator(`tr.plugin-update-tr[data-plugin="${B}"]`).count()).toBe(0);
  // The installed 0.3.1 now treats the same release as current.
  expect((await refresh()).offer).toBeNull();
  cases.push({ name: "browser update: signed 0.3.1", offered: true, installed: (await state()).version, requests });
}, 600_000);

test("evidence: summary, request ledger and traces are retained without private key material", async () => {
  await h.closeBrowser(admin.context);
  await h.saveEvidence();
  await writeFile(join(h.artifactDir, "update-requests.jsonl"), fixture.requests.map((r) => JSON.stringify(r) + "\n").join(""));
  await writeFile(
    join(h.artifactDir, "update-summary.json"),
    JSON.stringify(
      {
        keys: { test: key.fingerprint, other: other.fingerprint, format: "sha256 of the raw 32-byte Ed25519 public key" },
        root: fixture.root,
        helpers: Object.fromEntries([installed, target, newer, hostile].map((s, i) => [["installed", "target", "newer", "hostile"][i], { version: s.version, sha256: s.sha256 }])),
        manifest: manifestFor(fixture.root, "0.3.1", target.bytes, audited),
        cases,
        traces: (await Bun.file(join(h.artifactDir, "manifest.json")).json()).artifacts.traces,
      },
      null,
      2,
    ),
  );
  expect(cases.filter((c) => c.name.startsWith("install:") || c.name.startsWith("browser update: hash")).every((c) => c.installed === "0.3.0")).toBe(true);
  expect(cases.at(-1)).toMatchObject({ name: "browser update: signed 0.3.1", installed: "0.3.1" });
  expect(await findSecret(h.artifactDir, [h.token, ...key.secrets(), ...other.secrets()])).toEqual([]);
  expect(await sourceDigest()).toBe(sourceBefore);
}, 120_000);
