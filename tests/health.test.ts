import { describe, expect, test } from "bun:test";
import { evaluateHealth, HealthFormatError, normalizeHealth, parseHealth, type HealthSnapshot } from "../src/health.ts";

const clean: HealthSnapshot = {
  status: 200,
  finalUrl: "https://acme.example/",
  criticalError: false,
  consoleErrors: [],
  failedRequests: [],
  mixedContent: [],
};
const snap = (over: Partial<HealthSnapshot>): HealthSnapshot => ({ ...clean, ...over });

describe("normalizeHealth", () => {
  test("deduplicates and sorts without dropping query distinctions", () => {
    const n = normalizeHealth(
      snap({
        consoleErrors: ["b", "a", "b"],
        failedRequests: [
          { url: "https://x/a.png?v=2", status: 404 },
          { url: "https://x/a.png?v=1", status: 404 },
          { url: "https://x/a.png?v=1", status: 404 },
          { url: "https://x/a.png?v=1", status: null },
          { url: "https://x/a.png?v=1", status: 500 },
        ],
        mixedContent: ["http://x/b.js", "http://x/a.js?q=1", "http://x/a.js", "http://x/b.js"],
      }),
    );
    expect(n.consoleErrors).toEqual(["a", "b"]);
    expect(n.failedRequests).toEqual([
      { url: "https://x/a.png?v=1", status: null },
      { url: "https://x/a.png?v=1", status: 404 },
      { url: "https://x/a.png?v=1", status: 500 },
      { url: "https://x/a.png?v=2", status: 404 },
    ]);
    expect(n.mixedContent).toEqual(["http://x/a.js", "http://x/a.js?q=1", "http://x/b.js"]);
    // Exact persisted shape: no extra keys.
    expect(Object.keys(n).sort()).toEqual(["consoleErrors", "criticalError", "failedRequests", "finalUrl", "mixedContent", "status"]);
  });
});

describe("evaluateHealth", () => {
  test("clean page has no findings", () => {
    expect(evaluateHealth(clean, null)).toEqual([]);
    expect(evaluateHealth(clean, clean)).toEqual([]);
  });

  test("without a baseline every console and request finding fails", () => {
    const actual = snap({ consoleErrors: ["boom"], failedRequests: [{ url: "https://x/a.css", status: 404 }, { url: "https://x/b.js", status: null }] });
    const f = evaluateHealth(actual, null);
    expect(f.map((x) => [x.kind, x.severity])).toEqual([
      ["console-error", "failure"],
      ["failed-request", "failure"],
      ["failed-request", "failure"],
    ]);
    expect(f[1]!.detail).toContain("404");
    expect(f[1]!.detail).toContain("https://x/a.css");
    expect(f[2]!.detail).toContain("transport");
  });

  test("baselined console and URL/status pairs become warnings, new ones fail, removed ones vanish", () => {
    const baseline = snap({
      consoleErrors: ["old", "gone"],
      failedRequests: [
        { url: "https://x/a.css", status: 404 },
        { url: "https://x/t.js", status: null },
        { url: "https://x/removed.png", status: 404 },
      ],
    });
    const actual = snap({
      consoleErrors: ["old", "new"],
      failedRequests: [
        { url: "https://x/a.css", status: 404 }, // same pair: warning
        { url: "https://x/a.css", status: 500 }, // same URL, different status: new
        { url: "https://x/a.css?v=2", status: 404 }, // different query: new
        { url: "https://x/t.js", status: null }, // same transport failure: warning
      ],
    });
    const f = evaluateHealth(actual, baseline);
    const view = f.map((x) => `${x.severity} ${x.kind} ${x.detail}`);
    expect(view.filter((v) => v.startsWith("warning"))).toHaveLength(3);
    expect(view.filter((v) => v.startsWith("failure"))).toHaveLength(3);
    expect(f.find((x) => x.detail.includes("old"))?.severity).toBe("warning");
    expect(f.find((x) => x.detail.includes("new"))?.severity).toBe("failure");
    expect(f.find((x) => x.detail.includes("500"))?.severity).toBe("failure");
    expect(f.find((x) => x.detail.includes("?v=2"))?.severity).toBe("failure");
    expect(view.join("\n")).not.toContain("gone");
    expect(view.join("\n")).not.toContain("removed.png");
  });

  test("HTTP >= 400, critical error and mixed content fail even when baselined", () => {
    const bad = snap({ status: 404, criticalError: true, mixedContent: ["http://x/a.js"] });
    for (const baseline of [null, bad]) {
      const f = evaluateHealth(bad, baseline);
      expect(f.map((x) => [x.kind, x.severity])).toEqual([
        ["status", "failure"],
        ["critical-error", "failure"],
        ["mixed-content", "failure"],
      ]);
    }
    expect(evaluateHealth(snap({ status: 399 }), null)).toEqual([]);
    expect(evaluateHealth(snap({ status: 500 }), null)[0]!.detail).toContain("500");
    expect(evaluateHealth(snap({ status: null }), null)).toEqual([{ severity: "failure", kind: "status", detail: expect.stringContaining("no HTTP response") }]);
  });
});

describe("parseHealth", () => {
  test("round-trips a valid snapshot and normalizes it", () => {
    const raw = snap({ consoleErrors: ["b", "a"], failedRequests: [{ url: "u", status: null }] });
    expect(parseHealth(JSON.parse(JSON.stringify(raw)))).toEqual(normalizeHealth(raw));
  });

  test("rejects malformed shapes with a field name", () => {
    const bad: [unknown, string][] = [
      [null, "<root>"],
      [[], "<root>"],
      [{ ...clean, status: "200" }, "status"],
      [{ ...clean, status: 200.5 }, "status"],
      [{ ...clean, finalUrl: 1 }, "finalUrl"],
      [{ ...clean, criticalError: "no" }, "criticalError"],
      [{ ...clean, consoleErrors: [1] }, "consoleErrors"],
      [{ ...clean, failedRequests: [{ url: "u" }] }, "failedRequests"],
      [{ ...clean, failedRequests: [{ url: "u", status: "404" }] }, "failedRequests"],
      [{ ...clean, mixedContent: "http://x" }, "mixedContent"],
      [{ ...clean, extra: 1 }, "extra"],
      [(({ mixedContent: _, ...rest }) => rest)(clean), "mixedContent"],
    ];
    for (const [value, field] of bad) {
      let caught: unknown;
      try {
        parseHealth(value);
      } catch (e) {
        caught = e;
      }
      expect(caught).toBeInstanceOf(HealthFormatError);
      expect((caught as Error).message).toContain(field);
    }
  });
});
