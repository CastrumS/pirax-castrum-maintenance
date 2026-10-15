import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { loadDeployment } from "../src/deployment.ts";
import { GIT_AUTH, heartbeatDue, heartbeatPath, parseInstant, runHeartbeat, safeChildEnv } from "../scripts/reaudit/heartbeat.ts";
import { formatFailure, NoticeError, parseFailureSummary, runUrlFromEnv, safeError, sendFailure, sendMessage, type FailureSummary } from "../scripts/reaudit/notify.ts";
import { decideWatchdog, normalizeWatchdogFacts, observe, runWatchdog, type Gh } from "../scripts/reaudit/watchdog.ts";
import { FIXTURE_VERSIONS, fixtureConfig, fixtureKeys, writeDeployment } from "../test/fixtures/deployment.ts";

// Credential-free: synthetic stand-ins for secrets, injected clocks, a throwing/hanging transport double
// for error handling only (real SMTP proof is the separate --selftest), and local temp git remotes.
// Child Bun processes run with --no-env-file from a temp directory so a checkout .env is never loaded.
const ROOT = resolve(import.meta.dir, "..");
const DAY = 86_400_000;
const HOUR = 3_600_000;
const now = Date.UTC(2026, 9, 6, 12, 0, 0, 0);
const iso = (ms: number) => new Date(ms).toISOString();
const SECRET = "synthetic-Secret-9f8e7d";
/** Credential-shaped yet purely alphabetic: a format-only "looks safe" rule would echo it. */
const ALPHA_SECRET = "SyntheticTokenQzXwVb";
const PRIVATE_URL = `https://dl.example.invalid/pkg.zip?key=${SECRET}`;
const pins = { gf: "3.1.2", ff: "6.2.14", ff_pro: "6.2.15", cleantalk: "6.88", fluent_smtp: "2.4.1" };
const REPO = "CastrumS/pirax-castrum-maintenance";
const RUN = `https://github.com/${REPO}/actions/runs/123456789`;
const PIRAX = loadDeployment({ env: { DEPLOYMENT: "pirax" } });
const RECIPIENT = PIRAX.config.notice.recipient;
/** A second deployment in a disposable root: its own recipient, subject prefix and repository. */
const FIXTURE = (() => {
  const root = mkdtempSync(join(tmpdir(), "reaudit-notice-deployment-"));
  writeDeployment(root, "fixture", { config: fixtureConfig(fixtureKeys().publicKey), versions: FIXTURE_VERSIONS });
  return loadDeployment({ root, env: { DEPLOYMENT: "fixture" } });
})();
const offlineEnv = { PATH: process.env.PATH ?? "/usr/bin:/bin", HOME: process.env.HOME ?? "/tmp" };

describe("failure summary validation", () => {
  const full: FailureSummary = { stage: "audit", reason: "plugin-suite-failed", oldVersions: pins, candidateVersions: { ...pins, ff: "6.2.15" }, runUrl: RUN, cleanup: "confirmed", publication: "not-attempted" };

  test("accepts complete safe facts and renders every one", () => {
    const s = parseFailureSummary(REPO, JSON.parse(JSON.stringify(full)));
    const { subject, text } = formatFailure(PIRAX, s);
    expect(subject.startsWith("[pirax-audit] ")).toBe(true);
    expect(subject).toContain("audit");
    for (const fact of ["plugin-suite-failed", RUN, "6.2.14", "6.2.15", "ff_pro", "fluent_smtp", "confirmed"]) expect(text).toContain(fact);
    expect(text).toContain("No publication step was attempted");
    expect(RECIPIENT).toBe("piraxcastrum@gmail.com");
  });

  test("another deployment's notice uses its own subject prefix and accepts only its own repository's run URLs", () => {
    const own = `https://github.com/${FIXTURE.config.channel.repository}/actions/runs/123456789`;
    const { subject, text } = formatFailure(FIXTURE, { ...full, runUrl: own });
    expect(subject.startsWith("[acme-audit] re-audit failed at audit")).toBe(true);
    expect(subject).not.toContain("pirax");
    expect(text).toContain(own);
    expect(() => formatFailure(FIXTURE, full)).toThrow("invalid failure summary: runUrl");
    expect(() => parseFailureSummary(REPO, { ...full, runUrl: own })).toThrow("invalid failure summary: runUrl");
    expect(runUrlFromEnv(FIXTURE.config.channel.repository, { GITHUB_SERVER_URL: "https://github.com", GITHUB_REPOSITORY: FIXTURE.config.channel.repository, GITHUB_RUN_ID: "123456789" })).toBe(own);
    expect(runUrlFromEnv(FIXTURE.config.channel.repository, { GITHUB_SERVER_URL: "https://github.com", GITHUB_REPOSITORY: REPO, GITHUB_RUN_ID: "123456789" })).toBeUndefined();
    // A repository name is matched literally: "." is not a wildcard.
    expect(() => parseFailureSummary("a/b.c", { ...full, runUrl: "https://github.com/a/bxc/actions/runs/1" })).toThrow("invalid failure summary: runUrl");
    expect(parseFailureSummary("a/b.c", { ...full, runUrl: "https://github.com/a/b.c/actions/runs/1" }).runUrl).toBe("https://github.com/a/b.c/actions/runs/1");
  });

  test("a loopback throwaway site is rendered as recovery guidance; any other site is refused", () => {
    const site = "http://127.0.0.1:41234";
    const { text } = formatFailure(PIRAX, parseFailureSummary(REPO, { ...full, stage: "cleanup", reason: "cleanup-failed", cleanup: "failed", site }));
    expect(text).toContain(`Throwaway site: ${site}`);
    for (const bad of [PRIVATE_URL, "http://example.com:80", "http://127.0.0.1:0", "http://127.0.0.1:65536", "http://127.0.0.1:8080/wp-admin", 8080])
      expect(() => parseFailureSummary(REPO, { ...full, site: bad })).toThrow("invalid failure summary: site");
  });

  test("absent cleanup/publication are explicit unknowns, never 'nothing published'", () => {
    const { text } = formatFailure(PIRAX, parseFailureSummary(REPO, { stage: "unknown", reason: "invalid-summary" }));
    expect(text).toMatch(/Publication: unknown/);
    expect(text).toMatch(/Cleanup: unknown/);
    expect(text).toMatch(/inspect main, tags and releases/i);
    expect(text).not.toMatch(/nothing (was )?published|no publication/i);
  });

  test("partial publication states carry inspection guidance", () => {
    for (const publication of ["main-pushed", "tag-claimed", "release-incomplete"] as const) {
      expect(formatFailure(PIRAX, { stage: "publication", reason: "release-create-failed", publication }).text).toMatch(/do not retry or delete blindly/);
    }
  });

  test("rejects injection, private URLs, unknown keys and nonnumeric versions", () => {
    const bad: unknown[] = [
      null, [], "audit", {}, { stage: "audit" }, { reason: "x" },
      { ...full, extra: 1 }, { ...full, error: SECRET }, { ...full, stage: "deploy" }, { ...full, stage: "Audit" },
      { ...full, reason: "has space" }, { ...full, reason: "line\nBcc: a@b.c" }, { ...full, reason: "Upper" }, { ...full, reason: "x".repeat(65) }, { ...full, reason: "" },
      { ...full, runUrl: PRIVATE_URL }, { ...full, runUrl: `${RUN}?token=${SECRET}` }, { ...full, runUrl: `${RUN}#x` },
      { ...full, runUrl: RUN.replace("https", "http") }, { ...full, runUrl: RUN.replace("github.com/", `user:${SECRET}@github.com/`) },
      { ...full, runUrl: RUN.replace("CastrumS", "Other") }, { ...full, runUrl: `${RUN}/../../x` }, { ...full, runUrl: `${RUN}\n` },
      { ...full, oldVersions: { ...pins, gf: "3.1.2\r\nBcc: x@y.z" } }, { ...full, oldVersions: { ...pins, gf: "3.1.2-beta" } },
      { ...full, oldVersions: { ...pins, gf: "03.1" } }, { ...full, oldVersions: { ...pins, gf: 3.1 } }, { ...full, oldVersions: { ...pins, gf: "3" } },
      { ...full, candidateVersions: { ...pins, extra: "1.0" } }, { ...full, candidateVersions: { gf: "1.0" } }, { ...full, oldVersions: [] },
      { ...full, cleanup: "probably" }, { ...full, publication: "none" }, { ...full, publication: "nothing" },
    ];
    for (const value of bad) expect(() => parseFailureSummary(REPO, value)).toThrow();
  });

  test("validation errors name fields, never the rejected value", () => {
    try { parseFailureSummary(REPO, { ...full, runUrl: PRIVATE_URL }); throw new Error("accepted"); }
    catch (e) { expect((e as Error).message).toContain("runUrl"); expect((e as Error).message.includes(SECRET)).toBe(false); }
  });

  test("unknown keys are never echoed, even purely alphabetic ones", () => {
    for (const key of [ALPHA_SECRET, SECRET]) {
      try { parseFailureSummary(REPO, { ...full, [key]: 1 }); throw new Error("accepted"); }
      catch (e) { expect((e as Error).message).toBe("invalid failure summary: unknown keys"); }
    }
  });

  test("intended commit and tag for partial publication are validated and rendered", () => {
    const commit = "0123456789abcdef0123456789abcdef01234567";
    const s = parseFailureSummary(REPO, { ...full, stage: "publication", publication: "main-pushed", commit, tag: "v1.4.2" });
    expect([s.commit, s.tag]).toEqual([commit, "v1.4.2"]);
    const { text } = formatFailure(PIRAX, s);
    expect(text).toContain(`Intended commit: ${commit}`);
    expect(text).toContain("Intended tag: v1.4.2");
    expect(formatFailure(PIRAX, full).text).not.toMatch(/Intended/);
    const bad: unknown[] = [
      commit.toUpperCase(), commit.slice(1), `${commit}0`, `${commit}\n`, "g".repeat(40), ` ${commit}`, 1234, null,
    ].map((c) => ({ ...full, commit: c }));
    for (const tag of ["1.4.2", "v1", "v1.4.2-rc1", "v01.4", "V1.4.2", "v1.4.2\nBcc: x@y.z", `v1.4.2 ${SECRET}`, "refs/tags/v1.4.2", "v1.2.3.4.5", "", 1.4]) bad.push({ ...full, tag });
    for (const value of bad) {
      try { parseFailureSummary(REPO, value); throw new Error("accepted"); }
      catch (e) { expect((e as Error).message).toMatch(/^invalid failure summary: (commit|tag)$/); }
    }
  });

  test("run URL comes only from the fixed official repository", () => {
    expect(runUrlFromEnv(REPO, { GITHUB_SERVER_URL: "https://github.com", GITHUB_REPOSITORY: "CastrumS/pirax-castrum-maintenance", GITHUB_RUN_ID: "123456789" })).toBe(RUN);
    expect(runUrlFromEnv(REPO, { GITHUB_SERVER_URL: "https://github.com", GITHUB_REPOSITORY: "CastrumS/pirax-castrum-maintenance", GITHUB_RUN_ID: "123456789", GITHUB_RUN_ATTEMPT: "2" })).toBe(`${RUN}/attempts/2`);
    for (const env of [{}, { GITHUB_SERVER_URL: "https://evil.example", GITHUB_REPOSITORY: "CastrumS/pirax-castrum-maintenance", GITHUB_RUN_ID: "1" }, { GITHUB_SERVER_URL: "https://github.com", GITHUB_REPOSITORY: "a/b", GITHUB_RUN_ID: "1" }, { GITHUB_SERVER_URL: "https://github.com", GITHUB_REPOSITORY: "CastrumS/pirax-castrum-maintenance", GITHUB_RUN_ID: "1?x" }]) expect(runUrlFromEnv(REPO, env)).toBeUndefined();
  });
});

describe("sendFailure", () => {
  const creds = { IMAP_USER: "notice-sender@example.com", IMAP_PASSWORD: SECRET };
  const summary: FailureSummary = { stage: "download", reason: "download-failed", runUrl: RUN };
  type Mail = { from: string; to: string; subject: string; text: string };
  function fakeTransport(send: (mail: Mail) => Promise<unknown>) {
    const calls = { create: [] as Record<string, unknown>[], send: [] as Mail[], close: 0 };
    const create = ((options: Record<string, unknown>) => { calls.create.push(options); return { sendMail: (m: Mail) => { calls.send.push(m); return send(m); }, close: () => { calls.close++; } }; }) as never;
    return { calls, create };
  }

  test("missing credentials fail by name before any transport", async () => {
    const t = fakeTransport(async () => ({ accepted: [RECIPIENT], rejected: [] }));
    const error = await sendFailure(PIRAX, summary, { IMAP_PASSWORD: SECRET }, { createTransport: t.create }).catch((e: Error) => e);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain("IMAP_USER");
    expect((error as Error).message.includes(SECRET)).toBe(false);
    expect(t.calls.create.length).toBe(0);
  });

  test("fixed Gmail implicit TLS, bounded timeouts, no logging, fixed recipient, one attempt", async () => {
    const t = fakeTransport(async () => ({ accepted: [RECIPIENT], rejected: [] }));
    expect(await sendFailure(PIRAX, summary, creds, { createTransport: t.create })).toEqual({ accepted: 1, rejected: 0 });
    const o = t.calls.create[0]!;
    expect([o.host, o.port, o.secure, o.logger, o.debug]).toEqual(["smtp.gmail.com", 465, true, false, false]);
    for (const k of ["connectionTimeout", "greetingTimeout", "socketTimeout"]) expect(o[k] as number).toBeLessThanOrEqual(60_000);
    expect(t.calls.send.length).toBe(1);
    expect(t.calls.send[0]!.to).toBe(RECIPIENT);
    expect(t.calls.send[0]!.subject.startsWith("[pirax-audit] ")).toBe(true);
    expect(t.calls.close).toBe(1);
  });

  test("another deployment's notice goes only to its configured recipient", async () => {
    const t = fakeTransport(async () => ({ accepted: [FIXTURE.config.notice.recipient], rejected: [] }));
    expect(await sendFailure(FIXTURE, { stage: "download", reason: "download-failed" }, creds, { createTransport: t.create })).toEqual({ accepted: 1, rejected: 0 });
    expect(t.calls.send.map((m) => [m.to, m.subject.split(" ")[0]])).toEqual([["audit-notices@acme.example", "[acme-audit]"]]);
  });

  test("transport errors become safe codes: no raw message, secret, URL or retry", async () => {
    const t = fakeTransport(async () => { throw Object.assign(new Error(`535 auth failed for ${SECRET} at ${PRIVATE_URL}`), { code: "EAUTH", response: `535 ${SECRET}` }); });
    const error = (await sendFailure(PIRAX, summary, creds, { createTransport: t.create }).catch((e: Error) => e)) as Error;
    expect(error.message).toContain("EAUTH");
    for (const leak of [SECRET, "dl.example", "535"]) expect(error.message.includes(leak)).toBe(false);
    expect(t.calls.send.length).toBe(1);
    expect(t.calls.close).toBe(1);
  });

  test("unsafe error codes are dropped", async () => {
    const t = fakeTransport(async () => { throw Object.assign(new Error("x"), { code: `E ${SECRET}\n` }); });
    const error = (await sendFailure(PIRAX, summary, creds, { createTransport: t.create }).catch((e: Error) => e)) as Error;
    expect(error.message.includes(SECRET)).toBe(false);
  });

  test("only allowlisted public codes and built-in error names are reported", async () => {
    for (const thrown of [Object.assign(new Error("x"), { code: ALPHA_SECRET }), Object.assign(new Error("x"), { code: "E_SYNTHETIC_TOKEN_9f8e" }), Object.assign(new Error("x"), { name: ALPHA_SECRET })]) {
      const t = fakeTransport(async () => { throw thrown; });
      const error = (await sendFailure(PIRAX, summary, creds, { createTransport: t.create }).catch((e: Error) => e)) as Error;
      expect(error.message).toBe("notice: SMTP send failed: Error");
    }
    expect(safeError(Object.assign(new TypeError("x"), { code: "ECONNRESET" }))).toBe("TypeError (ECONNRESET)");
  });

  test("a hanging send is bounded and closed", async () => {
    const t = fakeTransport(() => new Promise(() => {}));
    const error = (await sendFailure(PIRAX, summary, creds, { createTransport: t.create, timeoutMs: 50 }).catch((e: Error) => e)) as Error;
    expect(error.message).toMatch(/timed out/);
    expect(t.calls.close).toBe(1);
  });

  test("a recipient not accepted is a failure", async () => {
    const t = fakeTransport(async () => ({ accepted: [], rejected: [RECIPIENT] }));
    expect(sendFailure(PIRAX, summary, creds, { createTransport: t.create })).rejects.toThrow(/accept/);
  });

  test("sendMessage sends the exact subject and text once; a transport rejection is one call and no secret", async () => {
    const ok = fakeTransport(async () => ({ accepted: [RECIPIENT], rejected: [] }));
    expect(await sendMessage(PIRAX, { subject: "synthetic subject", text: "synthetic body\n" }, creds, { createTransport: ok.create })).toEqual({ accepted: 1, rejected: 0 });
    expect(ok.calls.send).toEqual([{ from: creds.IMAP_USER, to: RECIPIENT, subject: "synthetic subject", text: "synthetic body\n" }]);
    const failing = fakeTransport(async () => { throw Object.assign(new Error(`rejected with ${SECRET}`), { code: "EAUTH" }); });
    const error = await sendMessage(PIRAX, { subject: "synthetic subject", text: "synthetic body\n" }, creds, { createTransport: failing.create }).catch((e: Error) => e);
    expect(error).toBeInstanceOf(NoticeError);
    expect(failing.calls.send.length).toBe(1);
    expect((error as Error).message).toBe("notice: SMTP send failed: Error (EAUTH)");
    expect((error as Error).message.includes(SECRET)).toBe(false);
  });

  test("CLI: usage, invalid summary and missing credentials exit nonzero by name only", async () => {
    const dir = mkdtempSync(join(tmpdir(), "reaudit-notify-"));
    try {
      const run = (args: string[], env: Record<string, string> = { ...offlineEnv, DEPLOYMENT: "pirax" }) => {
        const p = Bun.spawnSync([process.execPath, "--no-env-file", join(ROOT, "scripts/reaudit/notify.ts"), ...args], { cwd: dir, env, stdout: "pipe", stderr: "pipe", timeout: 30_000 });
        return { code: p.exitCode, out: p.stdout.toString() + p.stderr.toString() };
      };
      expect(run([]).code).toBe(2);
      const good = join(dir, "good.json");
      writeFileSync(good, JSON.stringify(summary));
      // An unusable selection aborts before credentials are read or a transport exists: it names DEPLOYMENT only.
      for (const [selection, message] of [[{}, "DEPLOYMENT is not set"], [{ DEPLOYMENT: "" }, "DEPLOYMENT is not set"], [{ DEPLOYMENT: "absent" }, "DEPLOYMENT names no deployment folder"], [{ DEPLOYMENT: "../pirax" }, "DEPLOYMENT is not a valid deployment name"]] as const) {
        for (const args of [[good], ["--selftest"], ["--jobs", dir]]) {
          const r = run(args, { ...offlineEnv, ...selection, IMAP_PASSWORD: SECRET });
          expect(r.code).toBe(1);
          expect(r.out).toContain(message);
          expect(r.out).not.toContain("IMAP_USER");
          expect(JSON.parse(r.out.trim().split("\n").at(-1)!)).toEqual({ smtpAttempts: 0, smtpAccepted: false, error: message });
        }
      }
      // An Actions run of another repository aborts before the summary, credentials or a transport: zero attempts.
      const context = "GITHUB_REPOSITORY is not the selected deployment's repository";
      for (const actions of [{ GITHUB_ACTIONS: "true", GITHUB_REPOSITORY: "other/repo" }, { GITHUB_ACTIONS: "true" }] as Record<string, string>[]) {
        for (const args of [[good], ["--selftest"], ["--jobs", dir]]) {
          const r = run(args, { ...offlineEnv, ...actions, DEPLOYMENT: "pirax", IMAP_PASSWORD: SECRET });
          expect(r.code).toBe(1);
          expect(r.out).not.toContain("IMAP_USER");
          expect(r.out.includes(SECRET)).toBe(false);
          expect(JSON.parse(r.out.trim())).toEqual({ smtpAttempts: 0, smtpAccepted: false, error: context });
        }
      }
      const matching = run([good], { ...offlineEnv, GITHUB_ACTIONS: "true", GITHUB_REPOSITORY: REPO, DEPLOYMENT: "pirax", IMAP_PASSWORD: SECRET });
      expect(matching.code).toBe(1);
      expect(matching.out).toContain("IMAP_USER");
      const missing = run([good], { ...offlineEnv, DEPLOYMENT: "pirax", IMAP_PASSWORD: SECRET });
      expect(missing.code).toBe(1);
      expect(missing.out).toContain("IMAP_USER");
      expect(missing.out.includes(SECRET)).toBe(false);
      const bad = join(dir, "bad.json");
      writeFileSync(bad, JSON.stringify({ ...summary, runUrl: PRIVATE_URL }));
      const invalid = run([bad], { ...offlineEnv, DEPLOYMENT: "pirax", IMAP_PASSWORD: SECRET });
      expect(invalid.code).toBe(1);
      expect(invalid.out).toMatch(/invalid.*runUrl/i);
      expect(invalid.out).toMatch(/fallback/i);
      expect(invalid.out.includes(SECRET) || invalid.out.includes("dl.example")).toBe(false);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});

describe("time parsing", () => {
  test("strict ISO instants with offsets", () => {
    expect(parseInstant("2026-10-06T01:41:26+02:00")).toBe(Date.UTC(2026, 9, 5, 23, 41, 26));
    expect(parseInstant("2026-10-06T12:00:00Z")).toBe(now);
    expect(parseInstant("2026-10-06T12:00:00.000Z")).toBe(now);
    expect(parseInstant("2026-10-06T12:00:00+23:59")).toBe(now - (23 * 60 + 59) * 60_000);
    expect(parseInstant("2026-10-06T12:00:00-23:59")).toBe(now + (23 * 60 + 59) * 60_000);
    for (const bad of ["2026-10-06T12:00:00+99:99", "2026-10-06T12:00:00+00:99", "2026-10-06T12:00:00+24:00", "2026-10-06T12:00:00-00:60"]) expect(() => parseInstant(bad)).toThrow();
    for (const bad of ["", "yesterday", "2026-10-06", "2026-10-06 12:00:00Z", "2026-02-30T00:00:00Z", "2026-13-01T00:00:00Z", "2026-10-06T24:00:00Z", "2026-10-06T12:00:00", "2026-10-06T12:00:00+2", "2026-10-06t12:00:00z", "1760000000", " 2026-10-06T12:00:00Z"]) expect(() => parseInstant(bad)).toThrow();
  });
});

describe("heartbeat due predicate", () => {
  test("due at exactly 30 days, not one millisecond before", () => {
    expect(heartbeatDue(iso(now - 30 * DAY), now)).toBe(true);
    expect(heartbeatDue(iso(now - 30 * DAY + 1), now)).toBe(false);
    expect(heartbeatDue(iso(now - 400 * DAY), now)).toBe(true);
    expect(heartbeatDue(iso(now), now)).toBe(false);
  });
  test("small clock skew is not due; real future and malformed dates fail closed", () => {
    expect(heartbeatDue(iso(now + 60_000), now)).toBe(false);
    expect(() => heartbeatDue(iso(now + HOUR), now)).toThrow();
    expect(() => heartbeatDue("not a date", now)).toThrow();
  });
  test("a nonfinite injected clock throws rather than answering not due", () => {
    for (const clock of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) expect(() => heartbeatDue(iso(now - 400 * DAY), clock)).toThrow();
  });
});

describe("safe child environment", () => {
  test("only allowlisted names reach git/gh children, prompts disabled", () => {
    const env = safeChildEnv({ PATH: "/bin", HOME: "/h", GH_TOKEN: "t", IMAP_PASSWORD: SECRET, IMAP_USER: SECRET, GPLVAULT_LICENSE_KEY: SECRET, PIRAX_HELPER_SIGNING_KEY: SECRET, S3_SECRET_ACCESS_KEY: SECRET, FORM_TEST_TOKEN: SECRET });
    expect(Object.keys(env).sort()).toEqual(["GH_PROMPT_DISABLED", "GH_TOKEN", "GIT_TERMINAL_PROMPT", "HOME", "PATH"]);
    expect(Object.values(env).includes(SECRET)).toBe(false);
  });
});

// Plan D5: checkouts persist no credentials, so pushes authenticate explicitly. GIT_AUTH resets every configured
// helper (none can store the token) and asks gh, which reads GH_TOKEN from the child environment, for github.com
// only. Synthetic token; a real push is post-merge evidence.
describe("git authentication without persisted credentials", () => {
  test("git gets github.com credentials from gh and GH_TOKEN; other helpers are reset and nothing is stored", () => {
    const home = mkdtempSync(join(tmpdir(), "reaudit-git-auth-"));
    try {
      const store = join(home, "store");
      writeFileSync(join(home, ".gitconfig"), `[credential]\n\thelper = store --file=${store}\n`);
      writeFileSync(store, "https://x-access-token:stale-synthetic@github.com\n");
      const credential = (op: string, input: string) =>
        Bun.spawnSync(["git", ...GIT_AUTH, "credential", op], { env: { ...safeChildEnv({ PATH: process.env.PATH, HOME: home, GH_TOKEN: SECRET }), GIT_CONFIG_NOSYSTEM: "1" }, stdin: Buffer.from(input), stdout: "pipe", stderr: "pipe" });
      const fill = credential("fill", "protocol=https\nhost=github.com\n\n");
      expect(fill.exitCode).toBe(0);
      expect(fill.stdout.toString().includes(`password=${SECRET}\n`)).toBe(true);
      expect(fill.stdout.toString().includes("stale-synthetic")).toBe(false);
      expect(credential("approve", fill.stdout.toString() + "\n").exitCode).toBe(0);
      expect(readFileSync(store, "utf8").includes(SECRET)).toBe(false);
      expect(GIT_AUTH.join(" ").includes(SECRET)).toBe(false);
    } finally { rmSync(home, { recursive: true, force: true }); }
  });
});

describe("heartbeat operation against a local temp remote", () => {
  const git = (cwd: string, args: string[], env: Record<string, string> = {}) => {
    const p = Bun.spawnSync(["git", ...args], { cwd, env: { ...offlineEnv, GIT_CONFIG_NOSYSTEM: "1", GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@example.com", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@example.com", ...env }, stdout: "pipe", stderr: "pipe" });
    if (p.exitCode !== 0) throw new Error(`git ${args[0]} failed: ${p.stderr}`);
    return p.stdout.toString().trim();
  };
  /** The selected (fixture) deployment's heartbeat; the checkout also holds another deployment's. */
  const HEARTBEAT_PATH = "deployments/fixture/heartbeat.txt";
  function fixture(lastCommitMs: number, trackedHeartbeat: boolean | "sibling-link" | "outside-link" | "directory" = false) {
    const dir = mkdtempSync(join(tmpdir(), "reaudit-heartbeat-"));
    const remote = join(dir, "remote.git");
    const seed = join(dir, "seed");
    git(dir, ["init", "--bare", "-b", "main", remote]);
    git(dir, ["init", "-b", "main", seed]);
    writeFileSync(join(seed, "README.md"), "x\n");
    writeDeployment(seed, "fixture", { config: fixtureConfig(fixtureKeys().publicKey), versions: FIXTURE_VERSIONS });
    writeDeployment(seed, "other", { config: fixtureConfig(fixtureKeys().publicKey), versions: FIXTURE_VERSIONS });
    writeFileSync(join(seed, "deployments/other/heartbeat.txt"), `${iso(lastCommitMs)}\n`);
    git(seed, ["add", "README.md", "deployments"]);
    if (trackedHeartbeat) {
      const destination = join(seed, HEARTBEAT_PATH);
      if (trackedHeartbeat === "sibling-link") symlinkSync("../other/heartbeat.txt", destination);
      else if (trackedHeartbeat === "outside-link") {
        writeFileSync(join(dir, "outside.txt"), "outside sentinel\n");
        symlinkSync("../../../outside.txt", destination);
      } else if (trackedHeartbeat === "directory") {
        mkdirSync(destination);
        writeFileSync(join(destination, "sentinel.txt"), "directory sentinel\n");
      } else writeFileSync(destination, `${iso(lastCommitMs)}\n`);
      git(seed, ["add", HEARTBEAT_PATH]);
    }
    const date = iso(lastCommitMs);
    git(seed, ["commit", "-m", "base"], { GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date });
    git(seed, ["push", remote, "main"]);
    const work = join(dir, "work");
    git(dir, ["clone", "-b", "main", remote, work]);
    const url = `file://${remote}`;
    const deployment = loadDeployment({ root: work, env: { DEPLOYMENT: "fixture" } });
    return { dir, remote, seed, work, url, deployment, base: git(remote, ["rev-parse", "main"]), cleanup: () => rmSync(dir, { recursive: true, force: true }) };
  }

  test("due: commits only the heartbeat file and fast-forwards remote main without tags", () => {
    const f = fixture(now - 31 * DAY);
    try {
      expect(heartbeatPath(f.deployment)).toBe(HEARTBEAT_PATH);
      expect(heartbeatPath(PIRAX)).toBe("deployments/pirax/heartbeat.txt");
      const result = runHeartbeat({ deployment: f.deployment, now, remoteUrl: f.url, env: offlineEnv });
      expect(result.outcome).toBe("pushed");
      const head = git(f.remote, ["rev-parse", "main"]);
      expect(head).toBe(result.commit!);
      expect(git(f.remote, ["rev-parse", "main^"])).toBe(f.base);
      expect(git(f.remote, ["diff", "--name-only", f.base, "main"])).toBe(HEARTBEAT_PATH);
      expect(git(f.remote, ["tag", "--list"])).toBe("");
      expect(readFileSync(join(f.work, HEARTBEAT_PATH), "utf8")).toBe(`${iso(now)}\n`);
    } finally { f.cleanup(); }
  });

  test("due: remote git commands carry GIT_AUTH and GH_TOKEN in their environment, never the token on argv", () => {
    const f = fixture(now - 31 * DAY);
    try {
      const bin = join(f.dir, "bin");
      const log = join(f.dir, "git.log");
      mkdirSync(bin);
      writeFileSync(join(bin, "git"), `#!/bin/sh\nprintf '%s|token=%s\\n' "$*" "\${GH_TOKEN:+yes}" >> '${log}'\nexec '${Bun.which("git")}' "$@"\n`, { mode: 0o755 });
      expect(runHeartbeat({ deployment: f.deployment, now, remoteUrl: f.url, env: { ...offlineEnv, PATH: `${bin}:${offlineEnv.PATH}`, GH_TOKEN: SECRET } }).outcome).toBe("pushed");
      const calls = readFileSync(log, "utf8").trim().split("\n");
      for (const op of [" fetch ", " ls-remote ", " push "]) {
        const call = calls.find((c) => c.includes(op))!;
        expect(call.startsWith(GIT_AUTH.join(" "))).toBe(true);
        expect(call.endsWith("|token=yes")).toBe(true);
      }
      expect(calls.some((c) => c.includes(SECRET))).toBe(false);
    } finally { f.cleanup(); }
  });

  test("due with an already tracked heartbeat: updates only that file and pushes without tags", () => {
    const f = fixture(now - 31 * DAY, true);
    try {
      const result = runHeartbeat({ deployment: f.deployment, now, remoteUrl: f.url, env: offlineEnv });
      expect(result.outcome).toBe("pushed");
      expect(git(f.remote, ["rev-parse", "main"])).toBe(result.commit!);
      expect(git(f.remote, ["rev-parse", "main^"])).toBe(f.base);
      expect(git(f.remote, ["diff", "--name-status", f.base, "main"])).toBe(`M\t${HEARTBEAT_PATH}`);
      expect(git(f.remote, ["show", `main:${HEARTBEAT_PATH}`])).toBe(iso(now));
      expect(git(f.remote, ["tag", "--list"])).toBe("");
      expect(git(f.work, ["status", "--porcelain"])).toBe("");
    } finally { f.cleanup(); }
  });

  for (const kind of ["sibling-link", "outside-link", "directory"] as const) {
    test(`due: refuses committed ${kind} before changing destination or target`, () => {
      const f = fixture(now - 31 * DAY, kind);
      try {
        const destination = join(f.work, HEARTBEAT_PATH);
        const target = kind === "sibling-link" ? join(f.work, "deployments/other/heartbeat.txt")
          : kind === "outside-link" ? join(f.dir, "outside.txt") : join(destination, "sentinel.txt");
        const before = readFileSync(target);
        const link = kind === "directory" ? null : readlinkSync(destination);
        let refusal: unknown;
        try { runHeartbeat({ deployment: f.deployment, now, remoteUrl: f.url, env: offlineEnv }); }
        catch (error) { refusal = error; }
        // Check bytes first: a post-write status refusal is too late to protect the target.
        expect(readFileSync(target).equals(before)).toBe(true);
        expect(git(f.remote, ["rev-parse", "HEAD"])).toBe(f.base);
        expect(git(f.work, ["rev-parse", "HEAD"])).toBe(f.base);
        expect(git(f.work, ["status", "--porcelain"])).toBe("");
        if (link !== null) expect(readlinkSync(destination)).toBe(link);
        expect(refusal).toBeInstanceOf(Error);
        expect((refusal as Error).message).toBe("heartbeat: destination is not a writable regular file");
      } finally { f.cleanup(); }
    });
  }

  test("an Actions run in a repository other than the selected deployment's is refused before any git operation", () => {
    const f = fixture(now - 31 * DAY);
    try {
      for (const env of [{ ...offlineEnv, GITHUB_ACTIONS: "true", GITHUB_REPOSITORY: REPO }, { ...offlineEnv, GITHUB_ACTIONS: "true" }])
        expect(() => runHeartbeat({ deployment: f.deployment, now, remoteUrl: f.url, env })).toThrow("heartbeat: GITHUB_REPOSITORY is not the selected deployment's repository");
      expect(git(f.remote, ["rev-parse", "main"])).toBe(f.base);
      expect(git(f.work, ["status", "--porcelain"])).toBe("");
      const own = { ...offlineEnv, GITHUB_ACTIONS: "true", GITHUB_REPOSITORY: f.deployment.config.channel.repository };
      expect(runHeartbeat({ deployment: f.deployment, now, remoteUrl: f.url, env: own }).outcome).toBe("pushed");
    } finally { f.cleanup(); }
  });

  test("a nonfinite clock is refused before any commit", () => {
    const f = fixture(now - 31 * DAY, true);
    try {
      expect(() => runHeartbeat({ deployment: f.deployment, now: Number.NaN, remoteUrl: f.url, env: offlineEnv })).toThrow(/clock/);
      expect(git(f.remote, ["rev-parse", "main"])).toBe(f.base);
    } finally { f.cleanup(); }
  });

  test("not due: no commit, remote unchanged", () => {
    const f = fixture(now - 29 * DAY);
    try {
      expect(runHeartbeat({ deployment: f.deployment, now, remoteUrl: f.url, env: offlineEnv }).outcome).toBe("not-due");
      expect(git(f.remote, ["rev-parse", "main"])).toBe(f.base);
      expect(git(f.work, ["status", "--porcelain"])).toBe("");
    } finally { f.cleanup(); }
  });

  test("dirty checkout, other branch and stale HEAD are refused without pushing", () => {
    const f = fixture(now - 31 * DAY);
    try {
      writeFileSync(join(f.work, "README.md"), "dirty\n");
      expect(() => runHeartbeat({ deployment: f.deployment, now, remoteUrl: f.url, env: offlineEnv })).toThrow(/dirty/);
      git(f.work, ["checkout", "--", "README.md"]);
      git(f.work, ["checkout", "-b", "feature"]);
      expect(() => runHeartbeat({ deployment: f.deployment, now, remoteUrl: f.url, env: offlineEnv })).toThrow(/branch/);
      git(f.work, ["checkout", "main"]);
      writeFileSync(join(f.seed, "README.md"), "y\n");
      git(f.seed, ["commit", "-am", "advance"], { GIT_AUTHOR_DATE: iso(now - 31 * DAY), GIT_COMMITTER_DATE: iso(now - 31 * DAY) });
      git(f.seed, ["push", f.remote, "main"]);
      const advanced = git(f.remote, ["rev-parse", "main"]);
      expect(() => runHeartbeat({ deployment: f.deployment, now, remoteUrl: f.url, env: offlineEnv })).toThrow(/not fresh main/);
      expect(git(f.remote, ["rev-parse", "main"])).toBe(advanced);
    } finally { f.cleanup(); }
  });

  test("main advancing before push is refused; nothing force-pushed", () => {
    const f = fixture(now - 31 * DAY);
    try {
      let advanced = "";
      const beforeRecheck = () => {
        writeFileSync(join(f.seed, "README.md"), "z\n");
        git(f.seed, ["commit", "-am", "race"]);
        git(f.seed, ["push", f.remote, "main"]);
        advanced = git(f.remote, ["rev-parse", "main"]);
      };
      expect(() => runHeartbeat({ deployment: f.deployment, now, remoteUrl: f.url, env: offlineEnv, beforeRecheck })).toThrow(/main advanced/);
      expect(git(f.remote, ["rev-parse", "main"])).toBe(advanced);
    } finally { f.cleanup(); }
  });

  test("git failures report a fixed stage, not stderr or paths", () => {
    const f = fixture(now - 31 * DAY);
    try {
      const missing = `file://${join(f.dir, `missing-${SECRET}.git`)}`;
      try { runHeartbeat({ deployment: f.deployment, now, remoteUrl: missing, env: offlineEnv }); throw new Error("accepted"); }
      catch (e) { expect((e as Error).message).toMatch(/fetch/); expect((e as Error).message.includes(SECRET)).toBe(false); }
    } finally { f.cleanup(); }
  });
});

describe("watchdog", () => {
  const workflow = (over: Record<string, unknown> = {}) => ({ id: 1, name: "reaudit", path: ".github/workflows/reaudit.yml", state: "active", created_at: iso(now - 10 * DAY), ...over });
  const run = (event: string, startedMs: number, conclusion: string | null = "success") => ({ id: startedMs, event, head_branch: "main", status: "completed", conclusion, run_started_at: iso(startedMs) });
  const runs = (...list: unknown[]) => ({ total_count: list.length, workflow_runs: list });

  test("latest started schedule/manual run decides overdue at >48h exactly", () => {
    const at = (started: number) => decideWatchdog(normalizeWatchdogFacts(workflow(), runs(run("schedule", started)), now), now);
    expect(at(now - 48 * HOUR)).toEqual({ healthy: true, reason: "healthy" });
    expect(at(now - 48 * HOUR - 1)).toEqual({ healthy: false, reason: "audit-overdue" });
  });

  test("newest schedule or manual run counts; other events are ignored; a failed audit means the scheduler is alive", () => {
    const facts = normalizeWatchdogFacts(workflow(), runs(run("push", now - HOUR), run("schedule", now - 3 * DAY), run("workflow_dispatch", now - 5 * HOUR, "failure")), now);
    expect(facts.lastStartedAt).toBe(now - 5 * HOUR);
    expect(decideWatchdog(facts, now)).toEqual({ healthy: true, reason: "healthy" });
    const onlyPush = normalizeWatchdogFacts(workflow(), runs(run("push", now - HOUR)), now);
    expect(onlyPush.lastStartedAt).toBeNull();
  });

  test("disabled workflow alerts even with a recent run", () => {
    for (const state of ["disabled_manually", "disabled_inactivity"]) {
      expect(decideWatchdog(normalizeWatchdogFacts(workflow({ state }), runs(run("schedule", now - HOUR)), now), now)).toEqual({ healthy: false, reason: `workflow-${state.replace("_", "-")}` as never });
    }
  });

  test("no history: initial installation grace for 48h, then alert", () => {
    expect(decideWatchdog(normalizeWatchdogFacts(workflow({ created_at: iso(now - 47 * HOUR) }), runs(), now), now)).toEqual({ healthy: true, reason: "awaiting-first-run" });
    expect(decideWatchdog(normalizeWatchdogFacts(workflow({ created_at: iso(now - 49 * HOUR) }), runs(), now), now)).toEqual({ healthy: false, reason: "no-audit-history" });
  });

  test("malformed, unknown or future facts are not healthy", () => {
    const bad: [unknown, unknown][] = [
      [null, runs()], [workflow({ state: undefined }), runs()], [workflow({ state: "paused" }), runs()], [workflow({ path: ".github/workflows/other.yml" }), runs()],
      [workflow({ created_at: "soon" }), runs()], [workflow(), { workflow_runs: null }], [workflow(), {}], [workflow(), runs({ event: "schedule" })],
      [workflow(), runs({ ...run("schedule", now), run_started_at: "2026-02-30T00:00:00Z" })], [workflow(), runs(run("schedule", now + DAY))],
      [workflow(), runs({ ...run("schedule", now), event: 5 })],
      [workflow(), runs({ ...run("schedule", now), head_branch: undefined })],
      [workflow({ created_at: "2026-10-06T12:00:00+99:99" }), runs()], [workflow(), runs({ ...run("schedule", now), run_started_at: "2026-10-06T11:00:00+00:99" })],
    ];
    for (const [w, r] of bad) expect(() => normalizeWatchdogFacts(w, r, now)).toThrow();
  });

  test("a nonfinite injected clock is never healthy", () => {
    for (const clock of [Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => normalizeWatchdogFacts(workflow(), runs(run("schedule", now - HOUR)), clock)).toThrow();
      expect(() => decideWatchdog({ state: "active", createdAt: now - DAY, lastStartedAt: null }, clock)).toThrow();
      expect(() => decideWatchdog({ state: "active", createdAt: now - DAY, lastStartedAt: now - HOUR }, clock)).toThrow();
    }
  });

  const gh = (responses: Record<string, { code: number; stdout: string }>): Gh & { calls: string[][] } => {
    const calls: string[][] = [];
    const fn = ((args: string[]) => { calls.push(args); const key = Object.keys(responses).find((k) => args.join(" ").includes(k)); return key ? responses[key]! : { code: 1, stdout: "" }; }) as Gh & { calls: string[][] };
    fn.calls = calls;
    return fn;
  };
  const http = (status: number, body: unknown) => ({ code: status === 200 ? 0 : 1, stdout: `HTTP/2.0 ${status} X\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(body)}` });

  test("observe uses read-only GET lookups on the fixed repository", () => {
    const g = gh({ "workflows/reaudit.yml/runs": http(200, runs(run("schedule", now - HOUR))), "workflows/reaudit.yml": http(200, workflow()) });
    expect(observe(REPO, g, now)).toEqual({ healthy: true, reason: "healthy" });
    for (const args of g.calls) {
      expect(args[0]).toBe("api");
      expect(args.join(" ")).toContain("repos/CastrumS/pirax-castrum-maintenance/actions/workflows/reaudit.yml");
      expect(args.some((a) => /^(-X|--method|-f|-F|--field|--raw-field|--input)$/.test(a))).toBe(false);
    }
  });

  test("another deployment's watchdog observes only its own repository", () => {
    const g = gh({ "workflows/reaudit.yml/runs": http(200, runs(run("schedule", now - HOUR))), "workflows/reaudit.yml": http(200, workflow()) });
    expect(observe(FIXTURE.config.channel.repository, g, now)).toEqual({ healthy: true, reason: "healthy" });
    for (const args of g.calls) {
      expect(args.join(" ")).toContain("repos/acme-fixture/acme-form-check-channel/actions/workflows/reaudit.yml");
      expect(args.join(" ")).not.toContain("CastrumS");
    }
  });

  test("recent skipped non-main dispatch cannot mask overdue main; requests main history", () => {
    const g = gh({
      "workflows/reaudit.yml/runs": http(200, runs(
        { ...run("workflow_dispatch", now - HOUR, "skipped"), head_branch: "feature" },
        run("schedule", now - 3 * DAY),
      )),
      "workflows/reaudit.yml": http(200, workflow()),
    });
    expect(observe(REPO, g, now)).toEqual({ healthy: false, reason: "audit-overdue" });
    const url = new URL(g.calls[1]!.at(-1)!, "https://api.github.com/");
    expect(url.searchParams.get("branch")).toBe("main");
    const failedMain = gh({ "workflows/reaudit.yml/runs": http(200, runs(run("workflow_dispatch", now - HOUR, "failure"))), "workflows/reaudit.yml": http(200, workflow()) });
    expect(observe(REPO, failedMain, now)).toEqual({ healthy: true, reason: "healthy" });
  });

  test("missing workflow, API failure and unparsable output are unhealthy", () => {
    expect(observe(REPO, gh({ "workflows/reaudit.yml": http(404, { message: "Not Found" }) }), now)).toEqual({ healthy: false, reason: "workflow-missing" });
    expect(observe(REPO, gh({}), now)).toEqual({ healthy: false, reason: "actions-query-failed" });
    expect(observe(REPO, gh({ "workflows/reaudit.yml/runs": http(500, {}), "workflows/reaudit.yml": http(200, workflow()) }), now)).toEqual({ healthy: false, reason: "actions-query-failed" });
    expect(observe(REPO, gh({ "workflows/reaudit.yml/runs": { code: 0, stdout: "HTTP/2.0 200 OK\r\n\r\n{not json" }, "workflows/reaudit.yml": http(200, workflow()) }), now)).toEqual({ healthy: false, reason: "actions-response-invalid" });
  });

  test("healthy sends nothing; unhealthy sends one safe notice; notice failure is reported without retry", async () => {
    const healthy = gh({ "workflows/reaudit.yml/runs": http(200, runs(run("schedule", now - HOUR))), "workflows/reaudit.yml": http(200, workflow()) });
    const sent: FailureSummary[] = [];
    const notify = async (s: FailureSummary) => { sent.push(s); return { accepted: 1, rejected: 0 }; };
    expect(await runWatchdog({ deployment: PIRAX, now, gh: healthy, notify, env: {} })).toEqual({ healthy: true, reason: "healthy", notice: "not-needed" });
    expect(sent.length).toBe(0);
    const disabled = gh({ "workflows/reaudit.yml/runs": http(200, runs()), "workflows/reaudit.yml": http(200, workflow({ state: "disabled_inactivity" })) });
    const env = { GITHUB_SERVER_URL: "https://github.com", GITHUB_REPOSITORY: "CastrumS/pirax-castrum-maintenance", GITHUB_RUN_ID: "123456789" };
    expect(await runWatchdog({ deployment: PIRAX, now, gh: disabled, notify, env })).toEqual({ healthy: false, reason: "workflow-disabled-inactivity", notice: "sent" });
    expect(sent).toEqual([{ stage: "watchdog", reason: "workflow-disabled-inactivity", runUrl: RUN, cleanup: "not-applicable", publication: "not-attempted" }]);
    expect(() => parseFailureSummary(REPO, sent[0])).not.toThrow();
    let attempts = 0;
    const failing = async () => { attempts++; throw new Error(SECRET); };
    const result = await runWatchdog({ deployment: PIRAX, now, gh: disabled, notify: failing, env });
    expect(result).toEqual({ healthy: false, reason: "workflow-disabled-inactivity", notice: "failed" });
    expect(attempts).toBe(1);
  });

  test("an Actions run of another repository is refused before gh or any notifier, --no-notify included", async () => {
    const context = "watchdog: GITHUB_REPOSITORY is not the selected deployment's repository";
    const disabled = gh({ "workflows/reaudit.yml/runs": http(200, runs()), "workflows/reaudit.yml": http(200, workflow({ state: "disabled_inactivity" })) });
    const sent: FailureSummary[] = [];
    const notify = async (s: FailureSummary) => { sent.push(s); return { accepted: 1, rejected: 0 }; };
    for (const env of [{ GITHUB_ACTIONS: "true", GITHUB_REPOSITORY: FIXTURE.config.channel.repository }, { GITHUB_ACTIONS: "true" }])
      for (const n of [notify, null, undefined])
        await expect(runWatchdog({ deployment: PIRAX, now, gh: disabled, notify: n, env })).rejects.toThrow(context);
    expect(disabled.calls).toEqual([]);
    expect(sent).toEqual([]);
    const own = { GITHUB_ACTIONS: "true", GITHUB_SERVER_URL: "https://github.com", GITHUB_REPOSITORY: REPO, GITHUB_RUN_ID: "123456789" };
    expect(await runWatchdog({ deployment: PIRAX, now, gh: disabled, notify, env: own })).toEqual({ healthy: false, reason: "workflow-disabled-inactivity", notice: "sent" });

    const dir = mkdtempSync(join(tmpdir(), "reaudit-watchdog-"));
    try {
      const marker = join(dir, "gh-called");
      mkdirSync(join(dir, "bin"));
      writeFileSync(join(dir, "bin/gh"), `#!/bin/sh\ntouch '${marker}'\nexit 1\n`, { mode: 0o755 });
      for (const args of [[], ["--no-notify"]]) {
        const p = Bun.spawnSync([process.execPath, "--no-env-file", join(ROOT, "scripts/reaudit/watchdog.ts"), ...args], {
          cwd: dir,
          env: { ...offlineEnv, PATH: `${join(dir, "bin")}:${offlineEnv.PATH}`, GITHUB_ACTIONS: "true", GITHUB_REPOSITORY: "other/repo", DEPLOYMENT: "pirax", IMAP_USER: "notice-sender@example.com", IMAP_PASSWORD: SECRET },
          stdout: "pipe", stderr: "pipe", timeout: 30_000,
        });
        expect({ code: p.exitCode, out: p.stdout.toString() + p.stderr.toString() }).toEqual({ code: 1, out: `${context}\n` });
      }
      expect(existsSync(marker)).toBe(false);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});

describe("imports are inert", () => {
  test("no output, network, mail or git on import", () => {
    for (const file of ["notify", "heartbeat", "watchdog"]) {
      const p = Bun.spawnSync([process.execPath, "--no-env-file", "-e", `await import(${JSON.stringify(join(ROOT, "scripts/reaudit", `${file}.ts`))})`], { cwd: tmpdir(), env: { PATH: "/nonexistent", HOME: offlineEnv.HOME }, stdout: "pipe", stderr: "pipe", timeout: 30_000 });
      expect({ file, code: p.exitCode, out: p.stdout.toString() + p.stderr.toString() }).toEqual({ file, code: 0, out: "" });
    }
  });
});
