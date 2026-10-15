import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { createHash } from "node:crypto";
import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { buildPlugin } from "../scripts/build-plugin";
import { compareArchives } from "../scripts/compare-deployment-build";
import { parseAuditedVersions, parseHelperVersion } from "../scripts/plugin-source";
import { auditedLine, FILES, renderCurrentVersions, renderTemplate } from "../scripts/render-plugin";
import { loadDeployment, PIN_KEYS, pinKeys, type AuditedVersions, type Deployment } from "../src/deployment";
import { FIXTURE_VERSIONS, fixtureConfig, fixtureKeys, writeDeployment } from "../test/fixtures/deployment";

// Each case runs zip/unzip and some spawn Bun; the default 5 s is too short on a loaded machine.
setDefaultTimeout(60_000);

const ROOT = resolve(import.meta.dir, "..");
const TEMPLATES = join(ROOT, "plugin/pirax-form-test");
const pirax = loadDeployment({ env: { DEPLOYMENT: "pirax" } });
/** zip/unzip and Bun children get no credentials. */
const TOOL_ENV = Object.fromEntries(["PATH", "TMPDIR", "LANG", "LC_ALL"].flatMap((name) => (process.env[name] === undefined ? [] : [[name, process.env[name]!]]))) as Record<string, string>;

/** Every file entry of a ZIP and its text, read back with unzip (independent of the renderer). */
async function unzipped(zip: string): Promise<Record<string, string>> {
  const names = (await Bun.$`unzip -Z1 ${zip}`.env(TOOL_ENV).text()).trim().split("\n").filter((e) => !e.endsWith("/"));
  return Object.fromEntries(await Promise.all(names.map(async (name) => [name, await Bun.$`unzip -p ${zip} ${name}`.env(TOOL_ENV).text()] as const)));
}

/** SHA-256 of every file below dir, by relative path: proves a build left its inputs byte-identical. */
const tree = (dir: string) =>
  Object.fromEntries(
    readdirSync(dir, { recursive: true, withFileTypes: true })
      .filter((e) => e.isFile())
      .map((e) => [relative(dir, join(e.parentPath, e.name)), createHash("sha256").update(readFileSync(join(e.parentPath, e.name))).digest("hex")])
      .sort(),
  );

async function inScratch<T>(body: (dir: string) => Promise<T>): Promise<T> {
  const dir = mkdtempSync(join(tmpdir(), "deployment-build-test-"));
  try {
    return await body(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** The ZIP entry paths a deployment's build must hold: everything under its slug, the main file renamed. */
const expectedEntries = (d: Deployment) => FILES.map((f) => (f === "pirax-form-test.php" ? d.assets.basename : `${d.config.plugin.slug}/${f}`)).sort();

/** Internal identifiers that every deployment's build keeps exactly as Pirax's does. */
const INTERNAL = [
  "namespace Pirax\\FormTest;",
  "'pirax_form_test_token'",
  "'pirax_form_test_redirect'",
  "'pirax_form_test_last_block'",
  "'pirax_form_test_sweep'",
  "'pirax_form_test_save'",
  "'pirax_form_test_update'",
  "'pirax_form_test_marker'",
  "'pirax_form_test_config'",
  "'pirax_form_test_mail'",
  "'_pirax_form_test'",
  "'X-Pirax-Form-Test: '",
  "x-pirax-form-test",
  "[pirax-test ",
  "const PAGE            = 'pirax-form-test';",
  "$_GET['pirax-form-test']",
  "add_query_arg( 'pirax-form-test'",
  'id="pirax-form-test-settings"',
  'class="pirax-form-test-rejected"',
  "PIRAX_HELPER_SIGNING_KEY",
  "<!-- pirax:current-versions:start -->",
  "<!-- pirax:current-versions:end -->",
];
const count = (text: string, needle: string) => text.split(needle).length - 1;

describe("Pirax build", () => {
  test("renders all eleven allowlisted files with the literal pins, version and key of deployments/pirax", async () => {
    await inScratch(async (dir) => {
      expect(FILES).toHaveLength(11);
      const { zip, entries } = await buildPlugin({ deployment: pirax, zip: join(dir, pirax.assets.zip) });
      expect([...entries].sort()).toEqual(expectedEntries(pirax));
      const files = await unzipped(zip);
      expect(Object.keys(files).sort()).toEqual(expectedEntries(pirax));
      const slug = pirax.config.plugin.slug;
      expect(parseAuditedVersions(files[`${slug}/includes/compatibility.php`]!)).toEqual(pirax.versions.audited);
      expect(parseHelperVersion(files[pirax.assets.basename]!)).toBe(pirax.versions.helperVersion);
      expect(files[`${slug}/includes/updates.php`]).toContain(`\nconst UPDATE_PUBLIC_KEY = '${pirax.config.channel.publicKey}';\n`);
      expect(files[`${slug}/README.md`]).toContain(
        `<!-- pirax:current-versions:start -->\n${renderCurrentVersions(pirax.versions.audited, pirax.versions.helperVersion)}<!-- pirax:current-versions:end -->\n`,
      );
      for (const [name, text] of Object.entries(files)) expect({ name, token: /\{\{|\}\}/.test(text) }).toEqual({ name, token: false });
    });
  });

  test("the PHP templates hold no current audited pin or helper version literal", () => {
    const php = FILES.filter((f) => f.endsWith(".php")).map((f) => [f, readFileSync(join(TEMPLATES, f), "utf8")] as const);
    const literals = [...pinKeys(pirax.versions.audited).map((k) => pirax.versions.audited[k]!), pirax.versions.helperVersion];
    const found = php.flatMap(([file, text]) => literals.filter((v) => new RegExp(`(?<![\\w.])${v.replace(/\./g, "\\.")}(?![\\w.])`).test(text)).map((v) => `${file}: ${v}`));
    expect(found).toEqual([]);
    expect(readFileSync(join(TEMPLATES, "includes/compatibility.php"), "utf8")).toContain("\nconst AUDITED_VERSIONS = array(\n{{raw:auditedVersions}}\n);\n");
  });
});

describe("second deployment", () => {
  test("a fixture deployment brands, channels and names its build from config while internal identifiers stay", async () => {
    await inScratch(async (dir) => {
      const { publicKey, privateKey } = fixtureKeys();
      writeDeployment(dir, "fixture", { config: fixtureConfig(publicKey), versions: FIXTURE_VERSIONS });
      const fixture = loadDeployment({ root: dir, env: { DEPLOYMENT: "fixture" } });
      const before = { templates: tree(TEMPLATES), deployments: tree(join(ROOT, "deployments")), fixture: tree(join(dir, "deployments")) };
      const { zip, entries } = await buildPlugin({ deployment: fixture, zip: join(dir, "out", fixture.assets.zip) });
      const piraxZip = (await buildPlugin({ deployment: pirax, zip: join(dir, "out", pirax.assets.zip) })).zip;
      expect({ templates: tree(TEMPLATES), deployments: tree(join(ROOT, "deployments")), fixture: tree(join(dir, "deployments")) }).toEqual(before);

      expect([...entries].sort()).toEqual(expectedEntries(fixture));
      expect(entries).toContain("acme-form-check/acme-form-check.php");
      const files = await unzipped(zip);
      const file = (name: string) => files[`acme-form-check/${name}`]!;
      const main = file("acme-form-check.php");
      for (const line of [
        " * Plugin Name:       Acme & O'Neil Form Check",
        " * Description:       Sends marked Acme (QA) test submissions to the operator's mailbox, never to clients.",
        " * Version:           1.4.9",
        " * Author:            Acme & O'Neil",
        " * Update URI:        https://github.com/acme-fixture/acme-form-check-channel",
        "const VERSION = '1.4.9';",
      ])
        expect(main).toContain(`\n${line}\n`);
      expect(parseHelperVersion(main)).toBe("1.4.9");
      expect(parseAuditedVersions(file("includes/compatibility.php"))).toEqual(FIXTURE_VERSIONS.audited);

      const updates = file("includes/updates.php");
      for (const line of [
        "const UPDATE_RELEASES_ROOT = 'https://github.com/acme-fixture/acme-form-check-channel/releases';",
        `const UPDATE_PUBLIC_KEY = '${publicKey}';`,
        "const UPDATE_BASENAME = 'acme-form-check/acme-form-check.php';",
        "const UPDATE_SLUG = 'acme-form-check';",
        "const UPDATE_ERROR = 'pirax_form_test_update';",
        "\treturn UPDATE_RELEASES_ROOT . '/download/v' . $version . '/acme-form-check.zip';",
        "\t\t$manifest  = UPDATE_RELEASES_ROOT . '/latest/download/acme-form-check-manifest.json';",
        "\t$installed = get_file_data( dirname( __DIR__ ) . '/acme-form-check.php', array( 'Version' => 'Version' ) )['Version'];",
        "\t\treturn new \\WP_Error( UPDATE_ERROR, 'No verified Acme & O\\'Neil Form Check update is available.' );",
        "\t\t'name'          => 'Acme & O\\'Neil Form Check',",
        "\t\t'author'        => 'Acme & O\\'Neil',",
        "\t\t\t'description' => '<p>' . esc_html( 'Signed release ' . $release['version'] . ' of the Acme & O\\'Neil form test helper.' ) . '</p>',",
        " * The latest release carries acme-form-check-manifest.json, {\"version\",\"package\",\"sha256\",\"audited\"},",
        " * and acme-form-check-manifest.json.sig, the base64 of the 64-byte detached Ed25519 signature over the",
      ])
        expect(updates).toContain(`\n${line}\n`);
      expect(updates).toContain("'acme-form-check.zip' === basename( (string) wp_parse_url( $package, PHP_URL_PATH ) );");
      expect(updates).toContain("return new \\WP_Error( UPDATE_ERROR, 'Acme & O\\'Neil Form Check update refused: ' . $why );");

      const settings = file("includes/settings.php");
      expect(settings).toContain("add_options_page( 'Acme & O\\'Neil Form Check', 'Acme & O\\'Neil Form Check', 'manage_options', PAGE, __NAMESPACE__ . '\\render_settings' );");
      expect(settings).toContain("<h1>Acme &amp; O&#039;Neil Form Check</h1>");
      expect(settings).toContain(" * Settings → Acme & O'Neil Form Check: the shared marker token,");
      const marker = file("includes/marker.php");
      for (const line of [
        "const BLOCKED_MESSAGE = 'Acme (QA) test blocked?: integrations could not be suppressed';",
        "const MARKER_MESSAGE  = 'Acme (QA) test blocked?: invalid test marker';",
        "const CONFIG_MESSAGE  = 'Acme (QA) test blocked?: test configuration is invalid';",
        "const AWAITING_MESSAGE_PREFIX = 'Acme (QA) test blocked?: awaiting audit of ';",
      ])
        expect(marker).toContain(`\n${line}\n`);
      expect(file("uninstall.php")).toContain(" * Removes Acme & O'Neil Form Check's options and scheduled events.");

      const readme = file("README.md");
      expect(readme.startsWith("# Acme \\& O\\'Neil Form Check\n")).toBe(true);
      for (const span of [
        "Build `dist/acme-form-check.zip` with `bun run build:plugin`",
        "take `acme-form-check.zip` from a published release",
        "Go to Settings → Acme \\& O\\'Neil Form Check and set both values",
        "from the GitHub releases of `acme-fixture/acme-form-check-channel`.",
        "`releases/latest/download/acme-form-check-manifest.json`",
        "`…/releases/download/v<version>/acme-form-check.zip`",
        "`dist/` then holds `acme-form-check.zip`, `acme-form-check-manifest.json` and `acme-form-check-manifest.json.sig`.",
        "`gh api --method POST repos/acme-fixture/acme-form-check-channel/git/refs",
        "`gh release create v<version> --repo acme-fixture/acme-form-check-channel --verify-tag",
        "| Rejected: `Acme (QA) test blocked?: invalid test marker` |",
        "for example `Acme (QA) test blocked?: awaiting audit of Fluent Forms Pro 6.2.16`",
        "Settings → Acme \\& O\\'Neil Form Check shows a read-only",
        `<!-- pirax:current-versions:start -->\n${renderCurrentVersions(FIXTURE_VERSIONS.audited, "1.4.9")}<!-- pirax:current-versions:end -->`,
      ])
        expect(readme).toContain(span);

      // Internal identifiers occur exactly as often as in Pirax's build; no visible Pirax identity is left.
      const all = Object.values(files).join("\n");
      const piraxAll = Object.values(await unzipped(piraxZip)).join("\n");
      for (const id of INTERNAL) expect({ id, fixture: count(all, id) }).toEqual({ id, fixture: count(piraxAll, id) });
      for (const id of INTERNAL) expect({ id, present: count(all, id) > 0 }).toEqual({ id, present: true });
      expect(all.match(/(?<![\w\\-])Pirax(?![\w\\-])/g) ?? []).toEqual([]);
      for (const visible of ["CastrumS", "castrum", "pirax-form-test.zip", "pirax-form-test-manifest", "pirax-form-test.php", pirax.config.channel.publicKey, pirax.config.forms.refusalPrefix, pirax.config.plugin.name])
        expect({ visible, present: all.includes(visible) }).toEqual({ visible, present: false });

      // Only the public half of the fixture key is packaged.
      const privateForms = [privateKey.export({ format: "der", type: "pkcs8" }).subarray(-32).toString("base64"), privateKey.export({ format: "der", type: "pkcs8" }).toString("base64")];
      expect(privateForms.some((secret) => all.includes(secret))).toBe(false);
      expect(all.includes(publicKey)).toBe(true);
    });
  });
});

describe("four-key deployment", () => {
  test("a deployment that does not audit Gravity Forms ships gf as null and leaves it out of the guide's table", async () => {
    await inScratch(async (dir) => {
      const { gf: _gf, ...audited } = FIXTURE_VERSIONS.audited;
      writeDeployment(dir, "four", { config: { ...fixtureConfig(fixtureKeys().publicKey), audited: ["ff", "ff_pro", "cleantalk", "fluent_smtp"] }, versions: { ...FIXTURE_VERSIONS, audited } });
      const four = loadDeployment({ root: dir, env: { DEPLOYMENT: "four" } });
      const files = await unzipped((await buildPlugin({ deployment: four, zip: join(dir, four.assets.zip) })).zip);
      const compatibility = files[`${four.config.plugin.slug}/includes/compatibility.php`]!;
      expect(compatibility).toContain(`\nconst AUDITED_VERSIONS = array(\n\t'gf'          => null,\n\t'ff'          => '${audited.ff}',\n`);
      expect(parseAuditedVersions(compatibility)).toEqual(audited);
      expect(Object.keys(parseAuditedVersions(compatibility))).toEqual(["ff", "ff_pro", "cleantalk", "fluent_smtp"]);
      const readme = files[`${four.config.plugin.slug}/README.md`]!;
      const section = readme.slice(readme.indexOf("<!-- pirax:current-versions:start -->"), readme.indexOf("<!-- pirax:current-versions:end -->"));
      expect(section).not.toContain("| Gravity Forms |");
      expect(section).toContain(`| Fluent Forms (free) | ${audited.ff} | FF |`);
      expect(section).toContain(" Gravity Forms is not audited by this build: while it is active, marked submissions of the adapters it applies to are rejected as awaiting audit. ");
    });
  });
});

describe("renderer", () => {
  test("the current-versions paragraph names only the listed optional plugins and the unlisted ones", () => {
    const pins = FIXTURE_VERSIONS.audited;
    const tail = "An active plugin whose version cannot be read counts as not audited. A new version is supported only after it is re-audited. Ordinary submissions still work with any version. The plugin also loads without either form plugin; each adapter is simply inactive.";
    const patch = "This includes later patch releases such as FluentSMTP 9.5.6 or CleanTalk 9.4.4.4.1: 9.5.5 is the only audited FluentSMTP release, not 9.5.x.";
    const paragraph = (audited: AuditedVersions) => renderCurrentVersions(audited, "1.4.9").split("\n").at(-2);
    const only = (...keys: (keyof typeof pins)[]) => Object.fromEntries(keys.map((k) => [k, pins[k]])) as AuditedVersions;
    expect(paragraph(pins)).toBe(`Pro, CleanTalk and FluentSMTP are optional: a site without them is checked against the core rows only. When one is active at any other version, marked submissions of the adapters it applies to are rejected. ${patch} ${tail}`);
    expect(paragraph(only("gf", "ff", "ff_pro"))).toBe(
      `Pro is optional: a site without it is checked against the core rows only. When it is active at any other version, marked submissions of the adapters it applies to are rejected. Anti-Spam by CleanTalk and FluentSMTP are not audited by this build: while one is active, marked submissions of the adapters it applies to are rejected as awaiting audit. ${tail}`,
    );
    expect(paragraph(only("gf", "cleantalk", "fluent_smtp"))).toBe(
      `CleanTalk and FluentSMTP are optional: a site without them is checked against the core rows only. When one is active at any other version, marked submissions of the adapters it applies to are rejected. ${patch} Fluent Forms (free) and Fluent Forms Pro are not audited by this build: while one is active, marked submissions of the adapters it applies to are rejected as awaiting audit. ${tail}`,
    );
    expect(paragraph(only("gf"))).toBe(`Fluent Forms (free), Fluent Forms Pro, Anti-Spam by CleanTalk and FluentSMTP are not audited by this build: while one is active, marked submissions of the adapters it applies to are rejected as awaiting audit. ${tail}`);
    expect(renderCurrentVersions(only("ff", "fluent_smtp"), "1.4.9").split("\n").filter((l) => l.startsWith("| ") && !l.startsWith("| Plugin"))).toEqual(["| Fluent Forms (free) | 9.2.2 | FF |", "| FluentSMTP | 9.5.5 | GF and FF, when active |"]);
  });

  const values = { "plugin.name": "O'Neil & Sons \\ \"Q\" <b>", "assets.zip": "acme.zip", "x.dollar": "$& $1 $$" };

  test("each context escapes for where its token sits", () => {
    expect(renderTemplate("'{{php:plugin.name}}'", values, "f.php")).toBe("'O\\'Neil & Sons \\\\ \"Q\" <b>'");
    expect(renderTemplate("<h1>{{html:plugin.name}}</h1>", values, "f.php")).toBe("<h1>O&#039;Neil &amp; Sons \\ &quot;Q&quot; &lt;b&gt;</h1>");
    expect(renderTemplate("# {{md:plugin.name}}", values, "f.md")).toBe("# O\\'Neil \\& Sons \\\\ \\\"Q\\\" \\<b\\>");
    expect(renderTemplate(" * Name: {{raw:plugin.name}}", values, "f.php")).toBe(" * Name: O'Neil & Sons \\ \"Q\" <b>");
    // Values are inserted literally and once: no replacement patterns, no second expansion.
    expect(renderTemplate("{{raw:x.dollar}}/{{raw:assets.zip}}", values, "f")).toBe("$& $1 $$/acme.zip");
  });

  test("unknown contexts, unknown names and anything left unresolved are refused", () => {
    expect(() => renderTemplate("{{js:plugin.name}}", values, "f.php")).toThrow("f.php: unknown template token {{js:plugin.name}}");
    expect(() => renderTemplate("{{php:plugin.slug}}", values, "f.php")).toThrow("f.php: unknown template token {{php:plugin.slug}}");
    expect(() => renderTemplate("{{php:plugin.name", values, "f.php")).toThrow("f.php: unresolved template token");
    expect(() => renderTemplate("{{ php:plugin.name }}", values, "f.php")).toThrow("f.php: unresolved template token");
    expect(() => renderTemplate("x }}", values, "f.php")).toThrow("f.php: unresolved template token");
    expect(() => renderTemplate("{{raw:assets.zip}}", { "assets.zip": "{{php:plugin.name}}" }, "f")).toThrow("f: unresolved template token");
  });
});

describe("build guards", () => {
  /** A copy of the templates with edits, built for Pirax; returns the build's refusal. */
  const refusalWith = (edit: (dir: string) => void) =>
    inScratch(async (dir) => {
      const source = join(dir, "templates");
      cpSync(TEMPLATES, source, { recursive: true });
      edit(source);
      const error = await buildPlugin({ deployment: pirax, source, zip: join(dir, "out.zip") }).then(
        () => null,
        (e: Error) => e.message,
      );
      expect(readdirSync(dir).includes("out.zip")).toBe(false);
      return error;
    });

  test("unlisted, missing, literal or unknown-token template content is refused before a ZIP exists", async () => {
    expect(await refusalWith((s) => writeFileSync(join(s, "includes/extra.php"), "<?php\n"))).toBe(
      "files not in the production allowlist (add them to FILES or remove them): includes/extra.php",
    );
    expect(await refusalWith((s) => rmSync(join(s, "uninstall.php")))).toBe("allowlisted files missing: uninstall.php");
    const edit = (file: string, from: string, to: string) => (s: string) => {
      const text = readFileSync(join(s, file), "utf8");
      expect(text.split(from)).toHaveLength(2);
      writeFileSync(join(s, file), text.replace(from, to));
    };
    // A template that ships its own value instead of the deployment's no longer agrees with the deployment data.
    expect(await refusalWith(edit("includes/compatibility.php", "{{raw:auditedVersions}}", PIN_KEYS.map((k) => auditedLine(k, "1.0")).join("\n")))).toBe("rendered includes/compatibility.php does not hold the deployment's audited versions");
    expect(await refusalWith(edit("pirax-form-test.php", "const VERSION = '{{php:versions.helperVersion}}';", "const VERSION = '9.9.9';"))).toBe(
      "pirax-form-test.php: Version header and VERSION constant differ",
    );
    expect(await refusalWith(edit("includes/updates.php", "'{{php:channel.publicKey}}'", `'${Buffer.alloc(32, 9).toString("base64")}'`))).toBe(
      "rendered includes/updates.php does not hold the deployment's public key",
    );
    expect(await refusalWith(edit("uninstall.php", "{{raw:plugin.name}}", "{{raw:plugin.nickname}}"))).toBe("uninstall.php: unknown template token {{raw:plugin.nickname}}");
  });

  test("build:plugin selects its deployment from DEPLOYMENT, refuses a bad selection or a packaged secret, and writes only dist/<slug>.zip", async () => {
    await inScratch(async (dir) => {
      for (const path of ["src", "scripts", "plugin/pirax-form-test"]) cpSync(join(ROOT, path), join(dir, path), { recursive: true });
      const { publicKey } = fixtureKeys();
      writeDeployment(dir, "fixture", { config: fixtureConfig(publicKey), versions: FIXTURE_VERSIONS });
      const inputs = () => ({ plugin: tree(join(dir, "plugin")), deployments: tree(join(dir, "deployments")) });
      const before = inputs();
      const run = async (env: Record<string, string>) => {
        const proc = Bun.spawn([process.execPath, "--no-env-file", "scripts/build-plugin.ts"], { cwd: dir, env: { ...TOOL_ENV, ...env }, stdout: "pipe", stderr: "pipe" });
        const [stdout, stderr, exit] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
        return { stdout, stderr, exit };
      };
      for (const [env, message] of [
        [{}, "build:plugin: DEPLOYMENT is not set\n"],
        [{ DEPLOYMENT: "" }, "build:plugin: DEPLOYMENT is not set\n"],
        [{ DEPLOYMENT: "missing" }, "build:plugin: DEPLOYMENT names no deployment folder\n"],
        [{ DEPLOYMENT: "../fixture" }, "build:plugin: DEPLOYMENT is not a valid deployment name\n"],
      ] as const) {
        expect(await run(env)).toEqual({ stdout: "", stderr: message, exit: 1 });
        expect(readdirSync(dir).includes("dist")).toBe(false);
      }
      // A known secret's value in any rendered byte stops the build; the error names the variable, not the value.
      const leaked = await run({ DEPLOYMENT: "fixture", FORM_TEST_TOKEN: "acme-fixture/acme-form-check-channel" });
      expect(leaked).toEqual({ stdout: "", stderr: expect.stringMatching(/^build:plugin: [\w./-]+ contains the value of FORM_TEST_TOKEN\n$/), exit: 1 });
      expect(leaked.stderr).not.toContain("acme-fixture");
      const slugLeak = await run({ DEPLOYMENT: "fixture", FORM_TEST_TOKEN: "acme-form-check" });
      expect(JSON.stringify(slugLeak).includes("acme-form-check")).toBe(false);
      expect(readdirSync(dir).includes("dist")).toBe(false);

      const built = await run({ DEPLOYMENT: "fixture" });
      expect(built.exit).toBe(0);
      expect(built.stdout).toMatch(/^dist\/acme-form-check\.zip \(11 files, sha256 [0-9a-f]{64}\)\n$/);
      expect(readdirSync(join(dir, "dist"))).toEqual(["acme-form-check.zip"]);
      expect(Object.keys(await unzipped(join(dir, "dist/acme-form-check.zip"))).sort()).toEqual(expectedEntries(loadDeployment({ root: dir, env: { DEPLOYMENT: "fixture" } })));
      expect(inputs()).toEqual(before);
    });
  });
});

describe("comparator", () => {
  test("two builds of the same deployment compare identical; an altered, missing or extra entry fails", async () => {
    await inScratch(async (dir) => {
      const first = (await buildPlugin({ deployment: pirax, zip: join(dir, "first.zip") })).zip;
      const second = (await buildPlugin({ deployment: pirax, zip: join(dir, "second.zip") })).zip;
      const same = await compareArchives(first, second);
      expect(same.identical).toBe(true);
      expect(same.differences).toEqual([]);
      expect(same.base.map((e) => e.path)).toEqual(same.branch.map((e) => e.path));
      expect(same.base.filter((e) => !e.path.endsWith("/")).map((e) => e.path)).toEqual(expectedEntries(pirax));

      // Rebuild the archive from extracted bytes with one deliberate change each.
      const variant = async (name: string, change: (tree: string) => void) => {
        const tree = join(dir, name);
        mkdirSync(tree);
        await Bun.$`unzip -q ${first} -d ${tree}`.env(TOOL_ENV);
        change(tree);
        await Bun.$`zip -q -r -X ${join(dir, `${name}.zip`)} .`.cwd(tree).env(TOOL_ENV);
        return compareArchives(first, join(dir, `${name}.zip`));
      };
      const readme = `${pirax.config.plugin.slug}/README.md`;
      const altered = await variant("altered", (t) => writeFileSync(join(t, readme), `${readFileSync(join(t, readme), "utf8")} `));
      expect(altered.identical).toBe(false);
      expect(altered.differences).toEqual([{ path: readme, base: expect.stringMatching(/^[0-9a-f]{64}$/), branch: expect.stringMatching(/^[0-9a-f]{64}$/) }]);
      const uninstall = `${pirax.config.plugin.slug}/uninstall.php`;
      const missing = await variant("missing", (t) => rmSync(join(t, uninstall)));
      expect(missing.differences).toEqual([{ path: uninstall, base: expect.stringMatching(/^[0-9a-f]{64}$/), branch: null }]);
      const extra = await variant("extra", (t) => writeFileSync(join(t, pirax.config.plugin.slug, "extra.txt"), "x"));
      expect(extra.differences).toEqual([{ path: `${pirax.config.plugin.slug}/extra.txt`, base: null, branch: expect.stringMatching(/^[0-9a-f]{64}$/) }]);
    });
  });
});
