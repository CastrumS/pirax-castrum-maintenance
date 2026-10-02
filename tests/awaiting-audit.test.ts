import { describe, expect, test } from "bun:test";
import { AWAITING_AUDIT_LIMIT_MS, awaitingAuditKey, describeAwaiting, formatElapsed, parseFirstSeen, reconcileAwaitingAudit } from "../src/forms/awaiting-audit.ts";
import { createStore } from "../src/store.ts";

// Credential-free: pure decisions, plus a store whose every request hits a closed local port, so
// storage failures are real transport errors rather than a fake backend.
const encode = (value: unknown) => new TextEncoder().encode(typeof value === "string" ? value : JSON.stringify(value));
const now = Date.UTC(2026, 9, 2, 12, 0, 0, 0);
const iso = (ms: number) => new Date(ms).toISOString();

describe("state key", () => {
  test("accepts configured slugs only", () => {
    expect(awaitingAuditKey("acme")).toBe("state/awaiting-audit/acme.json");
    expect(awaitingAuditKey("a1-b2")).toBe("state/awaiting-audit/a1-b2.json");
    for (const slug of ["", "Acme", "a--b", "-a", "a-", "a/b", "../a", "a.json", "a b"]) expect(() => awaitingAuditKey(slug)).toThrow();
  });
});

describe("stored firstSeen", () => {
  test("canonical, past or present timestamps are accepted", () => {
    expect(parseFirstSeen(encode({ firstSeen: iso(now) }), now)).toBe(now);
    expect(parseFirstSeen(encode({ firstSeen: iso(now - 5) }), now)).toBe(now - 5);
  });

  test("malformed, wrong-shape, noncanonical and future values are rejected", () => {
    const bad: unknown[] = [
      "", "not json", "null", "[]", "\"2026-10-02T12:00:00.000Z\"", {}, { firstSeen: null }, { firstSeen: now },
      { firstSeen: iso(now), extra: 1 }, { firstSeen: "2026-10-02T12:00:00Z" }, { firstSeen: "2026-10-02T12:00:00.000+00:00" },
      { firstSeen: "2026-02-30T00:00:00.000Z" }, { firstSeen: "2026-10-02t12:00:00.000z" }, { firstSeen: "Invalid Date" },
      { firstSeen: iso(now + 1) },
    ];
    for (const value of bad) expect(parseFirstSeen(encode(value), now)).toBeNull();
    expect(parseFirstSeen(new Uint8Array([0xff, 0xfe]), now)).toBeNull();
  });
});

describe("72-hour decision", () => {
  test("strictly greater than 72 hours fails", () => {
    expect(AWAITING_AUDIT_LIMIT_MS).toBe(259_200_000);
    expect(describeAwaiting(now - AWAITING_AUDIT_LIMIT_MS + 1, now).failed).toBe(false);
    expect(describeAwaiting(now - AWAITING_AUDIT_LIMIT_MS, now).failed).toBe(false);
    expect(describeAwaiting(now - AWAITING_AUDIT_LIMIT_MS - 1, now).failed).toBe(true);
    expect(describeAwaiting(now, now).failed).toBe(false);
  });

  test("notes state firstSeen, elapsed duration and threshold, distinguishing the boundary", () => {
    const at = describeAwaiting(now - AWAITING_AUDIT_LIMIT_MS, now).note;
    const over = describeAwaiting(now - AWAITING_AUDIT_LIMIT_MS - 1, now).note;
    expect(at).toContain(iso(now - AWAITING_AUDIT_LIMIT_MS));
    expect(at).toContain("3d 0h 0m 0.000s");
    expect(at).toContain("72 hours");
    expect(over).toContain("3d 0h 0m 0.001s");
    expect(over).toContain("72 hours");
    expect(over).not.toBe(at);
  });

  test("elapsed formatting", () => {
    expect(formatElapsed(0)).toBe("0d 0h 0m 0.000s");
    expect(formatElapsed(((26 * 60 + 3) * 60 + 4) * 1000 + 56)).toBe("1d 2h 3m 4.056s");
  });
});

describe("unavailable storage", () => {
  const config = { accessKeyId: "synthetic-id", secretAccessKey: "synthetic-secret", endpoint: "http://127.0.0.1:9", bucket: "synthetic-bucket", region: "auto" as const };
  const dead = createStore({ config, root: "test/unit/" });
  const leaks = ["synthetic", "127.0.0.1", "ECONNREFUSED", "state/awaiting-audit", "test/unit"];

  test("a sighting stays a first-sighting warning with safe diagnostics", async () => {
    const results = [{ outcome: "skipped", detail: "Not the designated test form." }, { outcome: "awaiting-audit", detail: "Pirax test blocked: awaiting audit of Fluent Forms 6.2.16" }];
    const diagnostics = await reconcileAwaitingAudit("acme", results, dead, now);
    expect(results[1]!.outcome).toBe("awaiting-audit");
    expect(results[1]!.detail).toStartWith("Pirax test blocked: awaiting audit of Fluent Forms 6.2.16 ");
    expect(results[1]!.detail).toContain(iso(now));
    expect(results[1]!.detail).toContain("could not be read");
    expect(results[1]!.detail).toContain("could not be saved");
    expect(results[0]!.detail).toBe("Not the designated test form.");
    expect(diagnostics.length).toBe(2);
    for (const text of [...diagnostics, results[1]!.detail]) for (const leak of leaks) expect(text).not.toContain(leak);
  });

  test("clearing failure is disclosed on an existing row and returned; never fabricates rows", async () => {
    const results = [{ outcome: "rejected", detail: "Pirax test blocked: integrations could not be suppressed" }];
    const diagnostics = await reconcileAwaitingAudit("acme", results, dead, now);
    expect(diagnostics).toEqual([expect.stringContaining("could not be cleared")]);
    expect(results).toEqual([{ outcome: "rejected", detail: `Pirax test blocked: integrations could not be suppressed ${diagnostics[0]}` }]);
    const empty: { outcome: string; detail: string }[] = [];
    expect(await reconcileAwaitingAudit("acme", empty, dead, now)).toEqual(diagnostics);
    expect(empty).toEqual([]);
    for (const leak of leaks) expect(diagnostics[0]).not.toContain(leak);
  });
});
