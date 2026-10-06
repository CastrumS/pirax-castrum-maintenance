// Fixture tests for re-audit discovery (plan D3). Fixtures are parsing evidence only, not GPL Vault auth proof.
import { describe, expect, test } from "bun:test";
import {
  assembleLatest,
  compareMatrix,
  compareVersions,
  parseCatalog,
  parseWordpressOrgInfo,
  ReauditError,
  validateVersions,
  type AuditedVersions,
} from "../scripts/reaudit/detect";

const PINS: AuditedVersions = { gf: "3.1.2", ff: "6.2.14", ff_pro: "6.2.15", cleantalk: "6.88", fluent_smtp: "2.4.1" };
const SENTINEL = "SYNTHETIC-SECRET-1234";

const failure = (fn: () => unknown) => {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(ReauditError);
    return (error as ReauditError).message;
  }
  throw new Error("expected a ReauditError");
};

describe("compareVersions", () => {
  test("orders numeric components, including multi-digit ones", () => {
    expect(compareVersions("6.2.15", "6.2.14")).toBe(1);
    expect(compareVersions("6.10", "6.9")).toBe(1);
    expect(compareVersions("10.0", "9.99")).toBe(1);
    expect(compareVersions("2.4.10", "2.4.9")).toBe(1);
    expect(compareVersions("6.88", "6.100")).toBe(-1);
    expect(compareVersions("3.1.2", "3.1.2")).toBe(0);
    expect(compareVersions("6.2", "6.2.0")).toBe(0);
    expect(compareVersions("99999999999999999999.1", "99999999999999999999.0")).toBe(1);
  });

  test.each(["", "6..2", "v6.2", "06.2", "6.02", " 6.2", "6.2 ", "6.2.15-beta", "6.2.15.", "1e3", "6,2", "-1.0"])(
    "refuses unstable spelling %p",
    (bad) => void failure(() => compareVersions(bad, "1.0")),
  );
});

describe("validateVersions", () => {
  test("accepts exactly the five keys", () => expect(validateVersions({ ...PINS }, "pins")).toEqual(PINS));

  test("refuses missing, unknown, non-string and malformed values, naming the field only", () => {
    const { ff: _ff, ...missing } = PINS;
    expect(failure(() => validateVersions(missing, "pins"))).toBe("pins: ff missing");
    expect(failure(() => validateVersions({ ...PINS, extra: "1.0" }, "pins"))).toBe("pins: extra unknown");
    expect(failure(() => validateVersions({ ...PINS, gf: 3.12 }, "pins"))).toBe("pins: gf malformed");
    expect(failure(() => validateVersions({ ...PINS, cleantalk: SENTINEL }, "pins"))).toBe("pins: cleantalk malformed");
    expect(failure(() => validateVersions(null, "pins"))).toBe("pins: record malformed");
    expect(failure(() => validateVersions([PINS], "pins"))).toBe("pins: record malformed");
  });
});

describe("assembleLatest", () => {
  const observations = Object.entries(PINS).map(([key, version]) => ({ key, version }));

  test("builds a complete matrix", () => expect(assembleLatest(observations)).toEqual(PINS));

  test("refuses missing, duplicate and unknown products", () => {
    expect(failure(() => assembleLatest(observations.slice(1)))).toBe("discovery: gf missing");
    expect(failure(() => assembleLatest([...observations, { key: "ff", version: "6.2.16" }]))).toBe("discovery: ff duplicate");
    expect(failure(() => assembleLatest([...observations, { key: "woo", version: "1.0" }]))).toBe("discovery: woo unknown");
    expect(failure(() => assembleLatest([...observations.slice(1), { key: "gf", version: SENTINEL }]))).toBe("discovery: gf malformed");
  });
});

describe("compareMatrix", () => {
  test("an identical matrix is unchanged", () => expect(compareMatrix(PINS, { ...PINS })).toEqual({ status: "unchanged", changed: [] }));

  test("Fluent Forms 6.2.14 → 6.2.15 is a change", () =>
    expect(compareMatrix(PINS, { ...PINS, ff: "6.2.15" })).toEqual({ status: "changed", changed: ["ff"] }));

  test("multi-digit upgrades are changes in pin-key order", () =>
    expect(compareMatrix(PINS, { ...PINS, cleantalk: "6.100", gf: "3.1.10" })).toEqual({ status: "changed", changed: ["gf", "cleantalk"] }));

  test("refuses downgrades and ambiguous equal spellings", () => {
    expect(failure(() => compareMatrix(PINS, { ...PINS, ff_pro: "6.2.9" }))).toBe("discovery: ff_pro downgrade");
    expect(failure(() => compareMatrix(PINS, { ...PINS, cleantalk: "6.88.0" }))).toBe("discovery: cleantalk ambiguous");
    expect(failure(() => compareMatrix({ ...PINS, gf: "3.1" }, { ...PINS, gf: "3.1.0" }))).toBe("discovery: gf ambiguous");
  });

  test("refuses incomplete inputs instead of a partial decision", () => {
    const { fluent_smtp: _s, ...partial } = PINS;
    expect(failure(() => compareMatrix(PINS, partial as AuditedVersions))).toBe("latest: fluent_smtp missing");
  });
});

describe("parseWordpressOrgInfo", () => {
  const info = (version: string, link = `https://downloads.wordpress.org/plugin/fluentform.${version}.zip`) => ({
    name: "Fluent Forms",
    slug: "fluentform",
    version,
    download_link: link,
  });

  test("reads version and the selected plugin's HTTPS download link", () =>
    expect(parseWordpressOrgInfo("ff", info("6.2.15"))).toEqual({
      version: "6.2.15",
      url: "https://downloads.wordpress.org/plugin/fluentform.6.2.15.zip",
    }));

  test.each([
    ["not an object", null],
    ["an array", [info("6.2.15")]],
    ["the not-found answer", { error: "Plugin not found." }],
    ["a missing version", { ...info("6.2.15"), version: undefined }],
    ["an unstable version", info("6.2.15-rc1", "https://downloads.wordpress.org/plugin/fluentform.6.2.15-rc1.zip")],
    ["another slug", { ...info("6.2.15"), slug: "fluentformpro" }],
    ["plain HTTP", info("6.2.15", "http://downloads.wordpress.org/plugin/fluentform.6.2.15.zip")],
    ["another host", info("6.2.15", "https://downloads.example.org/plugin/fluentform.6.2.15.zip")],
    ["another plugin's link", info("6.2.15", "https://downloads.wordpress.org/plugin/fluent-smtp.6.2.15.zip")],
    ["a link to another version", info("6.2.15", "https://downloads.wordpress.org/plugin/fluentform.6.2.14.zip")],
    ["a link with a query", info("6.2.15", `https://downloads.wordpress.org/plugin/fluentform.6.2.15.zip?t=${SENTINEL}`)],
  ])("refuses %s", (_label, body) => expect(failure(() => parseWordpressOrgInfo("ff", body))).not.toContain(SENTINEL));

  test("refuses paid keys", () => expect(failure(() => parseWordpressOrgInfo("gf", info("1.0")))).toBe("discovery: gf unknown"));
});

describe("parseCatalog", () => {
  const entry = (main: string, product_id: unknown, version: unknown) => ({ main, product_id, version });
  const catalog = [entry("gravityforms/gravityforms.php", 29365, "3.1.2"), entry("fluentformpro/fluentformpro.php", "1111130", "6.2.15")];

  test("normalizes the official client's catalog entries", () =>
    expect(parseCatalog(catalog)).toEqual({ gf: { version: "3.1.2", item: 29365 }, ff_pro: { version: "6.2.15", item: 1111130 } }));

  test("refuses missing, duplicate and malformed products, naming the field only", () => {
    expect(failure(() => parseCatalog(catalog.slice(1)))).toBe("catalog: gf missing");
    expect(failure(() => parseCatalog([...catalog, entry("gravityforms/gravityforms.php", 2, "3.1.3")]))).toBe("catalog: gf duplicate");
    expect(failure(() => parseCatalog([catalog[0], entry("fluentformpro/fluentformpro.php", 0, "6.2.15")]))).toBe("catalog: ff_pro item malformed");
    expect(failure(() => parseCatalog([catalog[0], entry("fluentformpro/fluentformpro.php", SENTINEL, "6.2.15")]))).toBe(
      "catalog: ff_pro item malformed",
    );
    expect(failure(() => parseCatalog([catalog[0], entry("fluentformpro/fluentformpro.php", 1, SENTINEL)]))).toBe("catalog: ff_pro malformed");
    expect(failure(() => parseCatalog({ plugins: catalog }))).toBe("catalog: response malformed");
  });

  test("ignores unrelated catalog products", () =>
    expect(parseCatalog([...catalog, entry("other/other.php", 7, "1.0")])).toEqual(parseCatalog(catalog)));
});
