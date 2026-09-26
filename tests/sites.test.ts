import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadSites, pageKey, SitesConfigError } from "../src/sites.ts";

const dir = mkdtempSync(join(tmpdir(), "sites-test-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));
let n = 0;
function write(yaml: string): string {
  const file = join(dir, `sites-${n++}.yaml`);
  writeFileSync(file, yaml);
  return file;
}

// A valid site as YAML lines under `sites:`; `extra` lines are appended at site level.
function site(extra = "", slug = "acme", pages = "    pages: ['/']"): string {
  return `  - slug: ${slug}\n    url: https://acme.example\n    form_helper: false\n${pages}\n${extra}`;
}

function expectError(yaml: string, site: string, field: string): SitesConfigError {
  let caught: unknown;
  try {
    loadSites(write(yaml));
  } catch (e) {
    caught = e;
  }
  expect(caught).toBeInstanceOf(SitesConfigError);
  const err = caught as SitesConfigError;
  expect({ site: err.site, field: err.field }).toEqual({ site, field });
  expect(err.message).toContain(site);
  expect(err.message).toContain(field);
  return err;
}

describe("loadSites valid input", () => {
  test("normalizes literal YAML, preserves order, applies defaults", () => {
    const file = write(`sites:
  - slug: acme
    url: https://acme.example
    form_helper: false
    mask: ['#hero-slider']
    pages:
      - /
      - /services/
      - path: /contact/
        mask: ['.cookie-banner']
      - path: /about
  - slug: beta-2
    url: http://beta.example/sub
    form_helper: true
    max_diff_pixel_ratio: 0.05
    pages: [/z/, /a/]
`);
    expect(loadSites(file)).toEqual([
      {
        slug: "acme",
        url: "https://acme.example",
        form_helper: false,
        mask: ["#hero-slider"],
        max_diff_pixel_ratio: 0.01,
        pages: [
          { path: "/", mask: [] },
          { path: "/services/", mask: [] },
          { path: "/contact/", mask: [".cookie-banner"] },
          { path: "/about", mask: [] },
        ],
      },
      {
        slug: "beta-2",
        url: "http://beta.example/sub",
        form_helper: true,
        mask: [],
        max_diff_pixel_ratio: 0.05,
        pages: [
          { path: "/z/", mask: [] },
          { path: "/a/", mask: [] },
        ],
      },
    ]);
  });

  test("empty sites list is allowed", () => {
    expect(loadSites(write("sites: []\n"))).toEqual([]);
  });

  test("ratio bounds 0 and 1 are inclusive", () => {
    const [a] = loadSites(write(`sites:\n${site("    max_diff_pixel_ratio: 0\n")}`));
    const [b] = loadSites(write(`sites:\n${site("    max_diff_pixel_ratio: 1\n")}`));
    expect([a?.max_diff_pixel_ratio, b?.max_diff_pixel_ratio]).toEqual([0, 1]);
  });

  test("shipped sites.example.yaml loads", () => {
    const sites = loadSites(join(import.meta.dir, "..", "sites.example.yaml"));
    expect(sites.length).toBeGreaterThan(0);
    for (const s of sites) expect(new URL(s.url).hostname).toMatch(/(^|\.)example\.(com|org|net)$|\.example$/);
    const pages = sites.flatMap((s) => s.pages);
    expect(pages.some((p) => p.mask.length > 0)).toBe(true);
    expect(sites.some((s) => s.test_form)).toBe(true);
  });

  test("committed sites.yaml designates exactly the operator's 12 test forms, offline", () => {
    const sites = loadSites(join(import.meta.dir, "..", "sites.yaml"));
    expect(sites).toHaveLength(13);
    expect(Object.fromEntries(sites.filter((s) => s.test_form).map((s) => [s.slug, s.test_form]))).toEqual({
      suntos: { page: "/kontakt/", plugin: "fluent", id: 4 },
      stolarijabanek: { page: "/kontakt/", plugin: "fluent", id: 1 },
      "centrum-panda": { page: "/", plugin: "gravity", id: 3 },
      "tara-garden": { page: "/about-us/", plugin: "gravity", id: 1 },
      epamalgradnja: { page: "/kontakt/", plugin: "gravity", id: 1 },
      "alu-kon": { page: "/kontakt/", plugin: "gravity", id: 1 },
      "baterije-akumulatori": { page: "/kontakt/", plugin: "gravity", id: 2 },
      bravarskiservis: { page: "/kontakt/", plugin: "fluent", id: 5 },
      "spok-ing": { page: "/kontakt/", plugin: "fluent", id: 6 },
      "laris-tcb": { page: "/", plugin: "gravity", id: 2 },
      teambuildinghrvatska: { page: "/", plugin: "gravity", id: 1 },
      // The contact form, never the listed login/registration page.
      instrukcijezasve: { page: "/kontakt/", plugin: "gravity", id: 4 },
    });
    expect("test_form" in sites.find((s) => s.slug === "downstairs")!).toBe(false);
    expect(sites.every((s) => s.form_helper === false)).toBe(true);
  });
});

describe("test_form designation", () => {
  const pages = "    pages:\n      - /\n      - path: /kontakt/\n        mask: ['.cookie']";
  const designate = (value: string, slug = "acme") => `sites:\n${site(`    test_form: ${value}\n`, slug, pages)}`;

  test("string-page and object-page designations load; absence stays absent", () => {
    const [a, b, c, d] = loadSites(write(`sites:\n${site("    test_form: { page: /, plugin: gravity, id: 3 }\n", "acme", pages)}${site("    test_form:\n      page: /kontakt/\n      plugin: fluent\n      id: 4\n", "beta", pages)}${site("", "gamma", pages)}${site("    test_form: { page: /, plugin: gravity, id: 0 }\n", "delta", pages)}`));
    expect(a?.test_form).toEqual({ page: "/", plugin: "gravity", id: 3 });
    expect(b?.test_form).toEqual({ page: "/kontakt/", plugin: "fluent", id: 4 });
    expect("test_form" in c!).toBe(false);
    // Integer schema only; detection alone decides whether such an id can match a rendered form.
    expect(d?.test_form).toEqual({ page: "/", plugin: "gravity", id: 0 });
  });
  test("page must exactly match a listed normalized path", () => {
    for (const page of ["/about/", "/kontakt", "kontakt/", "/Kontakt/", "'/kontakt/?x=1'", "3", "null"]) {
      expectError(designate(`{ page: ${page}, plugin: gravity, id: 1 }`), "acme", "test_form.page");
    }
    expectError(designate("{ plugin: gravity, id: 1 }"), "acme", "test_form.page");
  });
  test("plugin must be gravity or fluent", () => {
    for (const plugin of ["contact7", "Gravity", "unknown", "3", "null"]) {
      expectError(designate(`{ page: /kontakt/, plugin: ${plugin}, id: 1 }`), "acme", "test_form.plugin");
    }
    expectError(designate("{ page: /kontakt/, id: 1 }"), "acme", "test_form.plugin");
  });
  test("id must be a numeric integer, never a coerced string", () => {
    for (const id of ["1.5", "'4'", "null", "true", ".inf", "[4]", "9007199254740993"]) {
      expectError(designate(`{ page: /kontakt/, plugin: fluent, id: ${id} }`), "acme", "test_form.id");
    }
    expectError(designate("{ page: /kontakt/, plugin: fluent }"), "acme", "test_form.id");
  });
  test("unknown member and malformed shape name the site", () => {
    expectError(designate("{ page: /kontakt/, plugin: fluent, id: 1, submit: true }"), "acme", "test_form.submit");
    for (const bad of ["null", "''", "[]", "/kontakt/", "4", "[{ page: /kontakt/, plugin: fluent, id: 1 }]"]) {
      expectError(designate(bad), "acme", "test_form");
    }
    expectError(designate("{ page: /about/, plugin: fluent, id: 1 }", "beta-2"), "beta-2", "test_form.page");
  });
});

describe("loadSites required negative cases", () => {
  test("duplicate slug", () => {
    expectError(`sites:\n${site()}${site()}`, "acme", "slug");
  });
  test("missing url", () => {
    expectError(`sites:\n  - slug: acme\n    form_helper: false\n    pages: ['/']\n`, "acme", "url");
  });
  test("trailing-slash url", () => {
    expectError(`sites:\n  - slug: acme\n    url: https://acme.example/\n    form_helper: false\n    pages: ['/']\n`, "acme", "url");
  });
  test("empty pages", () => {
    expectError(`sites:\n${site("", "acme", "    pages: []")}`, "acme", "pages");
  });
  test("unknown site key", () => {
    expectError(`sites:\n${site("    colour: red\n")}`, "acme", "colour");
  });
  test("malformed masks", () => {
    expectError(`sites:\n${site("    mask: '#hero'\n")}`, "acme", "mask");
    expectError(`sites:\n${site("    mask: ['']\n")}`, "acme", "mask[0]");
    expectError(`sites:\n${site("    mask: ['#a', '   ']\n")}`, "acme", "mask[1]");
    expectError(`sites:\n${site("    mask: [3]\n")}`, "acme", "mask[0]");
    expectError(`sites:\n${site("", "acme", "    pages:\n      - path: /x/\n        mask: '.a'")}`, "acme", "pages[0].mask");
    expectError(`sites:\n${site("", "acme", "    pages:\n      - path: /x/\n        mask: [null]")}`, "acme", "pages[0].mask[0]");
  });
});

describe("loadSites broader validation", () => {
  test("root shape and unknown root key", () => {
    expectError("", "<root>", "sites");
    expectError("- a\n", "<root>", "sites");
    expectError("sites: 3\n", "<root>", "sites");
    expectError("sites:\n", "<root>", "sites");
    expectError("sites: []\nextra: 1\n", "<root>", "extra");
  });
  test("site entry must be a mapping", () => {
    expectError("sites:\n  - just-a-string\n", "site[0]", "<site>");
  });
  test("slug missing or malformed uses index", () => {
    expectError("sites:\n  - url: https://a.example\n    form_helper: false\n    pages: ['/']\n", "site[0]", "slug");
    for (const bad of ["Acme", "a--b", "-a", "a-", "a_b", "''", "'a b'"]) {
      expectError(`sites:\n${site("", bad)}`, "site[0]", "slug");
    }
  });
  test("url wrong type, scheme, credentials, query, fragment", () => {
    for (const bad of ["3", "not a url", "ftp://acme.example", "https://u:p@acme.example", "https://acme.example?x=1", "https://acme.example#x", "'/relative'"]) {
      expectError(`sites:\n  - slug: acme\n    url: ${bad}\n    form_helper: false\n    pages: ['/']\n`, "acme", "url");
    }
  });
  test("form_helper required boolean", () => {
    expectError("sites:\n  - slug: acme\n    url: https://acme.example\n    pages: ['/']\n", "acme", "form_helper");
    expectError("sites:\n  - slug: acme\n    url: https://acme.example\n    form_helper: 'yes'\n    pages: ['/']\n", "acme", "form_helper");
  });
  test("ratio type and bounds", () => {
    for (const bad of ["null", "-0.01", "1.01", "'0.1'", ".nan", ".inf", "1e400"]) {
      expectError(`sites:\n${site(`    max_diff_pixel_ratio: ${bad}\n`)}`, "acme", "max_diff_pixel_ratio");
    }
  });
  test("pages wrong type and bad page entries", () => {
    expectError(`sites:\n${site("", "acme", "    pages: /")}`, "acme", "pages");
    expectError(`sites:\n${site("", "acme", "    pages: [3]")}`, "acme", "pages[0]");
    expectError(`sites:\n${site("", "acme", "    pages:\n      - mask: []")}`, "acme", "pages[0].path");
    expectError(`sites:\n${site("", "acme", "    pages:\n      - path: /a/\n        wait: 3")}`, "acme", "pages[0].wait");
  });
  test("bad page paths", () => {
    for (const bad of ["a/", "", "//evil.example/", "/a//b/", "/a?x=1", "/a#top", "/../etc/", "/a/./b", "/%2e%2e/"]) {
      expectError(`sites:\n${site("", "acme", `    pages: ['/', '${bad}']`)}`, "acme", "pages[1].path");
    }
  });
  test("paths that URL resolution would normalize off-site or into traversal", () => {
    // YAML double-quoted scalars; DEL is escaped because YAML forbids it raw.
    const q = (s: string) => JSON.stringify(s).replaceAll("\u007f", "\\u007f");
    const bad = ["/\\elsewhere.example/", "/a/..\\outside/", "/a/\t../outside/", "/a/.. ", "/a/\r\n../b/", "/a\u007f/", "/a\u0000/", "/a b/", "/a/\\"];
    for (const path of bad) {
      expectError(`sites:\n${site("", "acme", `    pages: ['/', ${q(path)}]`)}`, "acme", "pages[1].path");
      expectError(`sites:\n${site("", "acme", `    pages:\n      - path: ${q(path)}`)}`, "acme", "pages[0].path");
    }
  });
  test("percent-encoded non-traversal paths stay valid", () => {
    const paths = ["/caf%C3%A9/", "/a%20b/", "/100%25/", "/%2e%2e%2e/", "/a.b/..c/"];
    const [s] = loadSites(write(`sites:\n${site("", "acme", `    pages: ${JSON.stringify(paths)}`)}`));
    expect(s?.pages.map((p) => p.path)).toEqual(paths);
  });
  test("duplicate page paths and key collisions", () => {
    expectError(`sites:\n${site("", "acme", "    pages: ['/a/', '/a/']")}`, "acme", "pages[1].path");
    expectError(`sites:\n${site("", "acme", "    pages: ['/', '/home/']")}`, "acme", "pages[1].path");
    expectError(`sites:\n${site("", "acme", "    pages: ['/a/b/', '/a-b/']")}`, "acme", "pages[1].path");
    expectError(`sites:\n${site("", "acme", "    pages: ['/a', '/a/']")}`, "acme", "pages[1].path");
    expectError(`sites:\n${site("", "acme", "    pages: ['/About/', '/about/']")}`, "acme", "pages[1].path");
  });
  test("same page across different sites is fine", () => {
    const two = `sites:\n${site()}${site("", "beta")}`;
    expect(loadSites(write(two)).map((s) => s.slug)).toEqual(["acme", "beta"]);
  });
  test("read and YAML errors are wrapped without file contents", () => {
    expectError("", "<root>", "sites");
    const missing = join(dir, "nope.yaml");
    expect(() => loadSites(missing)).toThrow(SitesConfigError);
    const err = expectError("sites: [secret_marker_value\n", "<root>", "<yaml>");
    expect(err.message).not.toContain("secret_marker_value");
    try {
      loadSites(missing);
    } catch (e) {
      expect((e as SitesConfigError).field).toBe("<file>");
      expect((e as Error).message).toContain(missing);
    }
  });
  test("default path is sites.yaml in the working directory", () => {
    const cwd = join(dir, "cwd");
    mkdirSync(cwd);
    writeFileSync(join(cwd, "sites.yaml"), `sites:\n${site()}`);
    const run = Bun.spawnSync([process.execPath, "--no-env-file", "-e", `const { loadSites } = await import(${JSON.stringify(join(import.meta.dir, "..", "src", "sites.ts"))}); console.log(loadSites()[0].slug)`], { cwd, env: {} });
    expect(run.stdout.toString().trim()).toBe("acme");
  });
});

describe("pageKey", () => {
  test("mandated examples", () => {
    expect(pageKey("/")).toBe("home");
    expect(pageKey("/a/b/")).toBe("a-b");
    expect(pageKey("/a/b")).toBe("a-b");
    expect(pageKey("/services/")).toBe("services");
  });
  test("deterministic and filename safe", () => {
    const paths = ["/café/", "/a b/", "/x:y*z?/", "/back\\slash/", "/100%/", "/.well-known/", "/Über/"];
    for (const p of paths) {
      const key = pageKey(p);
      expect(pageKey(p)).toBe(key);
      expect(key).toMatch(/^[A-Za-z0-9._%-]+$/);
      expect(key).not.toContain("/");
    }
    expect(pageKey("/100%/")).not.toBe(pageKey("/100%25/"));
    expect(pageKey("/a b/")).not.toBe(pageKey("/a_b/"));
  });
});
