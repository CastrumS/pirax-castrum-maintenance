import { expect, setDefaultTimeout, test } from "bun:test";
import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { runForms } from "../../src/commands/forms.ts";
import { AWAITING_AUDIT_LIMIT_MS, awaitingAuditKey, reconcileAwaitingAudit } from "../../src/forms/awaiting-audit.ts";
import { findSecrets, secretRedactor } from "../../src/forms/evidence.ts";
import type { Site } from "../../src/sites.ts";
import { createStore, type Store } from "../../src/store.ts";

setDefaultTimeout(300_000);

// Real R2 under a fresh test root. Induced failures route only the named operation to a real Store
// on a closed loopback port (actual transport error, no fake authentication); every other operation
// stays on real R2. Pure clock decisions are covered credential-free in tests/awaiting-audit.test.ts.
type Row = { outcome: string; detail: string };
const iso = (ms: number) => new Date(ms).toISOString();
const bytes = (value: unknown) => new TextEncoder().encode(typeof value === "string" ? value : JSON.stringify(value));
const text = (b: Uint8Array) => new TextDecoder().decode(b);
const awaiting = (version = "Fluent Forms 6.2.16"): Row => ({ outcome: "awaiting-audit", detail: `Pirax test blocked: awaiting audit of ${version}` });
const row = (outcome: string, detail = `${outcome} detail`): Row => ({ outcome, detail });
const leaks = ["synthetic", "127.0.0.1", "ECONNREFUSED", "state/awaiting-audit", "test/forms-awaiting"];

test("awaiting-audit clock persists, ages, clears and degrades against real scoped R2", async () => {
  const dir = resolve("runs", `forms-awaiting-${crypto.randomUUID()}`);
  const root = `test/forms-awaiting-audit-${new Date().toISOString().replaceAll(":", "-")}-${crypto.randomUUID().slice(0, 8)}/`;
  const real = createStore({ root });
  const dead = createStore({ root, config: { accessKeyId: "synthetic-id", secretAccessKey: "synthetic-secret", endpoint: "http://127.0.0.1:9", bucket: "synthetic-bucket", region: "auto" } });
  const failing = (op: "list" | "get" | "put" | "delete"): Store => ({ ...real, [op]: dead[op] });
  const evidence: Record<string, any> = { root, directory: dir, scenarios: {} };
  const record = (name: string, facts: unknown) => { evidence.scenarios[name] = facts; };
  const key = awaitingAuditKey("acme"), other = awaitingAuditKey("other");
  const stored = async (k = key) => ((await real.list(k)).includes(k) ? text(await real.get(k)) : null);
  const seed = (ms: number, k = key) => real.put(k, bytes({ firstSeen: iso(ms) }));
  const now = Date.now() - 60_000;
  try {
    // First sighting: exact JSON object with JSON content type; fresh Store keeps it unchanged.
    const first = [row("skipped"), awaiting(), row("skipped")];
    expect(await reconcileAwaitingAudit("acme", first, real, now)).toEqual([]);
    expect(await stored()).toBe(JSON.stringify({ firstSeen: iso(now) }));
    const response = await fetch(real.presign(key, 60));
    const contentType = response.headers.get("content-type");
    await response.arrayBuffer();
    expect(contentType).toStartWith("application/json");
    expect(first[1]).toEqual({ outcome: "awaiting-audit", detail: expect.stringContaining(iso(now)) });
    expect(first[1]!.detail).toStartWith(awaiting().detail + " ");
    const again = [awaiting("Gravity Forms 3.1.3, Fluent Forms 6.2.16")];
    expect(await reconcileAwaitingAudit("acme", again, createStore({ root }), now + 5_000)).toEqual([]);
    expect(again[0]!.outcome).toBe("awaiting-audit");
    expect(again[0]!.detail).toContain("Gravity Forms 3.1.3, Fluent Forms 6.2.16");
    expect(await stored()).toBe(JSON.stringify({ firstSeen: iso(now) }));
    record("first-and-repeat", { stored: await stored(), contentType, changedVersionRetainedClock: true });

    // Exact boundaries with real stored objects; bytes stay unchanged because the clock is valid.
    const base = now - 10 * AWAITING_AUDIT_LIMIT_MS;
    const boundaries: Record<string, string> = {};
    for (const [label, offset, outcome] of [["minus-1ms", -1, "awaiting-audit"], ["exact", 0, "awaiting-audit"], ["plus-1ms", 1, "failed"]] as const) {
      await seed(base);
      const before = await stored();
      const rows = [awaiting()];
      await reconcileAwaitingAudit("acme", rows, real, base + AWAITING_AUDIT_LIMIT_MS + offset);
      expect(rows[0]!.outcome).toBe(outcome);
      expect(rows[0]!.detail).toContain(awaiting().detail);
      expect(rows[0]!.detail).toContain("72 hours");
      expect(await stored()).toBe(before);
      boundaries[label] = rows[0]!.outcome;
    }
    // Repeated escalations never restart the clock, alongside unrelated failures and skips.
    const escalated = [row("failed", "Unrelated visual failure"), row("skipped"), awaiting(), row("skipped")];
    await reconcileAwaitingAudit("acme", escalated, real, base + 2 * AWAITING_AUDIT_LIMIT_MS);
    const repeat = [awaiting("Fluent Forms 6.2.17")];
    await reconcileAwaitingAudit("acme", repeat, real, base + 3 * AWAITING_AUDIT_LIMIT_MS);
    expect([escalated[0]!.outcome, escalated[2]!.outcome, repeat[0]!.outcome]).toEqual(["failed", "failed", "failed"]);
    expect(escalated[0]!.detail).toBe("Unrelated visual failure");
    expect(repeat[0]!.detail).toContain("9d 0h 0m 0.000s");
    expect(await stored()).toBe(JSON.stringify({ firstSeen: iso(base) }));
    record("boundaries-and-escalation", { boundaries, repeatedEscalationKeptFirstSeen: iso(base) });

    // Every non-awaiting observation clears only its own site's key; a later sighting starts fresh.
    const cleared: string[] = [];
    for (const [label, rows] of Object.entries({
      rejected: [row("rejected", "Pirax test blocked: integrations could not be suppressed")], failed: [row("failed")], "not-verified": [row("not-verified")],
      unsupported: [row("unsupported")], delivered: [row("delivered")], "delivered-spam": [row("delivered-spam")], "skipped-only": [row("skipped")],
      "designation-missing": [row("skipped"), row("failed", "test form not found")], "no-forms": [] as Row[],
    })) {
      await seed(base);
      await seed(base, other);
      expect(await reconcileAwaitingAudit("acme", rows, real, now)).toEqual([]);
      expect(await stored()).toBeNull();
      expect(await stored(other)).toBe(JSON.stringify({ firstSeen: iso(base) }));
      cleared.push(label);
    }
    const fresh = [awaiting()];
    await reconcileAwaitingAudit("acme", fresh, real, now);
    expect(fresh[0]!.outcome).toBe("awaiting-audit");
    expect(await stored()).toBe(JSON.stringify({ firstSeen: iso(now) }));
    record("clearing", { cleared, otherSiteUntouched: true, freshClockAfterClear: iso(now) });

    // Unusable stored state is a first sighting that is replaced, never an escalation.
    const replaced: string[] = [];
    for (const [label, value] of Object.entries({ "not-json": "{", "wrong-shape": { started: iso(base) }, "extra-field": { firstSeen: iso(base), x: 1 }, noncanonical: { firstSeen: "2020-01-01T00:00:00Z" }, future: { firstSeen: iso(now + 1) } })) {
      await real.put(key, bytes(value));
      const rows = [awaiting()];
      expect(await reconcileAwaitingAudit("acme", rows, real, now)).toEqual([expect.stringContaining("invalid")]);
      expect(rows[0]!.outcome).toBe("awaiting-audit");
      expect(rows[0]!.detail).toContain("invalid");
      expect(await stored()).toBe(JSON.stringify({ firstSeen: iso(now) }));
      replaced.push(label);
    }
    record("malformed", { replaced });

    // Induced operation failures: warnings with safe diagnostics, never thrown or escalated.
    const failures: Record<string, unknown> = {};
    for (const op of ["list", "get"] as const) {
      await seed(base);
      const rows = [awaiting()];
      const diagnostics = await reconcileAwaitingAudit("acme", rows, failing(op), now);
      expect(rows[0]!.outcome).toBe("awaiting-audit");
      expect(rows[0]!.detail).toContain("could not be read");
      expect(await stored()).toBe(JSON.stringify({ firstSeen: iso(now) }));
      failures[op] = { diagnostics, replacementWritten: true };
    }
    await real.delete(key);
    const unsaved = [awaiting()];
    const putDiagnostics = await reconcileAwaitingAudit("acme", unsaved, failing("put"), now);
    expect(unsaved[0]!.outcome).toBe("awaiting-audit");
    expect(unsaved[0]!.detail).toContain("could not be saved");
    expect(await stored()).toBeNull();
    failures.put = { diagnostics: putDiagnostics, objectWritten: false };
    for (const op of ["list", "delete"] as const) {
      await seed(base);
      const rows = [row("rejected")];
      const diagnostics = await reconcileAwaitingAudit("acme", rows, failing(op), now);
      expect(diagnostics).toEqual([expect.stringContaining("could not be cleared")]);
      expect(rows[0]!.detail).toBe(`rejected detail ${diagnostics[0]}`);
      expect(await stored()).toBe(JSON.stringify({ firstSeen: iso(base) }));
      const noForms: Row[] = [];
      expect(await reconcileAwaitingAudit("acme", noForms, failing(op), now)).toEqual(diagnostics);
      expect(noForms).toEqual([]);
      expect(await reconcileAwaitingAudit("acme", [row("rejected")], real, now)).toEqual([]);
      expect(await stored()).toBeNull();
      failures[`clear-${op}`] = { diagnostics, oldObjectRetained: true, retryCleared: true };
    }
    for (const text of JSON.stringify(failures).split("\"")) for (const leak of leaks) expect(text).not.toContain(leak);
    record("induced-failures", failures);

    // Report pruning never touches state.
    await seed(base);
    for (const runId of ["2026-01-01T00-00-00.000Z", "2026-01-02T00-00-00.000Z"]) await real.put(`reports/${runId}/manifest.json`, bytes({}));
    await real.pruneReports(0);
    expect(await real.list("reports/")).toEqual([]);
    expect(await stored()).toBe(JSON.stringify({ firstSeen: iso(base) }));
    record("pruning", { reportsRemaining: 0, stateRetained: true });

    // Production forms command: a completed no-form pass clears its own site only.
    const server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response("<html><body>No forms</body></html>", { headers: { "content-type": "text/html" } }) });
    try {
      await seed(base, other);
      const logs: string[] = [];
      const local: Site = { slug: "acme", url: `http://127.0.0.1:${server.port}`, form_helper: true, mask: [], max_diff_pixel_ratio: 0.01, pages: [{ path: "/", mask: [] }, { path: "/b/", mask: [] }] };
      const result = await runForms([local], real, { runsDir: join(dir, "command"), log: line => logs.push(line) });
      expect(result.exitCode).toBe(0);
      expect(await stored()).toBeNull();
      expect(await stored(other)).toBe(JSON.stringify({ firstSeen: iso(base) }));
      expect((await real.list("")).filter(k => k.startsWith("reports/")).length).toBe(2);
      expect(await findSecrets(join(dir, "command"), secretRedactor())).toEqual([]);
      record("run-forms-clear", { exitCode: result.exitCode, localPath: result.localPath, otherSiteUntouched: true, logs });
    } finally { server.stop(true); }
  } finally {
    let deleted = 0;
    for (const k of await real.list("")) { await real.delete(k); deleted++; }
    const remaining = await real.list("");
    evidence.cleanup = { deleted, remaining: remaining.length };
    mkdirSync(dir, { recursive: true });
    await Bun.write(join(dir, "summary.json"), JSON.stringify(evidence, null, 2) + "\n");
    console.log(`Awaiting-audit state evidence: ${join(dir, "summary.json")}`);
    expect(remaining).toEqual([]);
  }
});
