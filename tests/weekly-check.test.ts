import { describe, expect, test } from "bun:test";
import { copyFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { loadDeployment, type Deployment } from "../src/deployment.ts";
import { subjectTag } from "../src/mail/imap.ts";
import { weeklyExitCode } from "../scripts/weekly/check.ts";
import { formatWeekly, selftestInput } from "../scripts/weekly/summary.ts";
import { FIXTURE_VERSIONS, fixtureConfig, fixtureKeys, writeDeployment } from "../test/fixtures/deployment.ts";

const PIRAX = loadDeployment({ env: { DEPLOYMENT: "pirax" } });
const FIXTURE = (() => {
  const root = mkdtempSync(join(tmpdir(), "weekly-summary-deployment-"));
  writeDeployment(root, "fixture", { config: fixtureConfig(fixtureKeys().publicKey), versions: FIXTURE_VERSIONS });
  return loadDeployment({ root, env: { DEPLOYMENT: "fixture" } });
})();
const RUN_ID = "2026-10-10T07-00-00.000Z";
const RAN_AT = new Date("2026-10-10T07:00:00.000Z");
const SENTINEL = "sk-stand-in-0123456789abcdef";
const runTime = (d: Deployment) => {
  const zone = d.config.weeklyCheck.timeZone;
  return `Run time: ${new Intl.DateTimeFormat("en-GB", { timeZone: zone, dateStyle: "full", timeStyle: "short" }).format(RAN_AT)} (${zone}), ${RAN_AT.toISOString()} UTC`;
};
const count = (text: string, part: string) => text.split(part).length - 1;

describe("weekly summary email", () => {
  for (const deployment of [PIRAX, FIXTURE]) {
    const p = deployment.config.notice.subjectPrefix;

    test(`${deployment.name}: subjects per outcome are distinct and the selftest subject is tagged`, () => {
      const subjects = [
        formatWeekly(deployment, { exitCode: 0 }, RAN_AT).subject,
        formatWeekly(deployment, { exitCode: 1 }, RAN_AT).subject,
        formatWeekly(deployment, { exitCode: 2 }, RAN_AT).subject,
        formatWeekly(deployment, "garbage", RAN_AT).subject,
      ];
      expect(subjects).toEqual([`${p} weekly check passed`, `${p} weekly check found problems`, `${p} weekly check could not run`, `${p} weekly check result unreadable`]);
      expect(new Set(subjects).size).toBe(4);
      const selftest = formatWeekly(deployment, selftestInput(RUN_ID), RAN_AT, "abc123");
      expect(selftest.subject).toBe(`${p} SELFTEST weekly check found problems ${subjectTag("abc123")}`);
    });

    test(`${deployment.name}: selftest body has run time, site counts and one link`, () => {
      const input = selftestInput(RUN_ID);
      const { text, valid } = formatWeekly(deployment, input, RAN_AT, "abc123");
      expect(valid).toBe(true);
      expect(text).toBe([
        "SELFTEST: synthetic result, no check ran.",
        "",
        runTime(deployment),
        "Result: exit 1, problems found, see the report",
        "Sites: 2 (pass 1, warning 0, failure 1, blocked 0)",
        "",
        "selftest-alpha: pass (1 pages: 1 pass)",
        "selftest-beta: failure (1 pages: 1 failure)",
        "",
        `Report (7 days): ${input.url}`,
        "This link is private. Do not forward it.",
        "",
      ].join("\n"));
      expect(count(text, input.url)).toBe(1);
    });
  }

  test("privacy: link parts appear once, inside the link line, and site URLs never appear", () => {
    const url = `https://stand-in-endpoint.example/stand-in-bucket/reports/${RUN_ID}/index.html?X-Amz-Signature=stand-in-signature`;
    const { text, valid } = formatWeekly(PIRAX, { ...selftestInput(RUN_ID), url }, RAN_AT);
    expect(valid).toBe(true);
    const linkLine = text.split("\n").find((line) => line.startsWith("Report (7 days): "));
    expect(linkLine).toBe(`Report (7 days): ${url}`);
    for (const part of ["stand-in-bucket", "stand-in-endpoint", "stand-in-signature"]) expect(count(text, part)).toBe(1);
    expect(text.includes("selftest-alpha.invalid")).toBe(false);
    expect(text.includes("selftest-beta.invalid")).toBe(false);
  });

  const valid = () => selftestInput(RUN_ID);
  const malformed: [string, () => unknown][] = [
    ["non-object", () => SENTINEL],
    ["exitCode 3", () => ({ ...valid(), exitCode: 3 })],
    ["exitCode string", () => ({ ...valid(), exitCode: "0" })],
    ["unknown key named SENTINEL", () => ({ ...valid(), [SENTINEL]: 1 })],
    ["report with an extra field", () => ({ ...valid(), report: { ...valid().report, extra: SENTINEL } })],
    ["http url", () => ({ ...valid(), url: valid().url.replace("https:", "http:") })],
    ["url for another runId", () => ({ ...valid(), url: valid().url.replace(RUN_ID, "2026-10-03T07-00-00.000Z") })],
    ["url without a query", () => ({ ...valid(), url: valid().url.split("?")[0] })],
    ["url without a report", () => ({ exitCode: 0, url: valid().url })],
    ["url with SENTINEL in a wrong path", () => ({ ...valid(), url: `https://weekly.example/reports/${RUN_ID}/${SENTINEL}/index.htm?x=1` })],
  ];
  for (const [name, input] of malformed) {
    test(`malformed input (${name}) gives the fixed fallback without echo`, () => {
      const message = formatWeekly(PIRAX, input(), RAN_AT);
      expect(message.valid).toBe(false);
      expect(message.subject).toBe(`${PIRAX.config.notice.subjectPrefix} weekly check result unreadable`);
      expect(message.text).toBe(`${runTime(PIRAX)}\nThe weekly check result could not be read, so this email has no site details. See the Actions run log.\n`);
      expect(message.subject.includes(SENTINEL) || message.text.includes(SENTINEL)).toBe(false);
    });
  }

  test("exit 2 without a report has no sites and no link", () => {
    const { text, valid } = formatWeekly(FIXTURE, { exitCode: 2 }, RAN_AT);
    expect(valid).toBe(true);
    expect(text).toBe(`${runTime(FIXTURE)}\nResult: exit 2, the check could not run\nSites: not available\n\nReport link: not available\nThis link is private. Do not forward it.\n`);
  });
});

type Step = { name?: string; id?: string; uses?: string; run?: string; with?: Record<string, unknown>; env?: Record<string, string> };
type Job = { if?: string; needs?: string | string[]; permissions?: Record<string, string>; "runs-on"?: string; outputs?: Record<string, string>; steps: Step[] };
type Workflow = { on: Record<string, unknown>; env?: Record<string, string>; permissions?: unknown; jobs: Record<string, Job> };
const ROOT = resolve(import.meta.dir, "..");
const WORKFLOW = Bun.YAML.parse(readFileSync(join(ROOT, ".github/workflows/weekly-check.yml"), "utf8")) as Workflow;
const WEEKLY_SECRETS = ["S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY", "S3_ENDPOINT", "S3_BUCKET", "IMAP_USER", "IMAP_PASSWORD", "IMAP_HOST", "IMAP_PORT", "IMAP_FOLDER", "IMAP_SPAM_FOLDER", "FORM_TEST_ADDRESS", "FORM_TEST_TOKEN"];
const secretsIn = (value: unknown) => [...JSON.stringify(value ?? null).matchAll(/secrets\.([A-Za-z0-9_]+)/g)].map((m) => m[1]!);
const steps = () => Object.values(WORKFLOW.jobs).flatMap((job) => job.steps);
const cli = async (cwd: string, args: string[], env: Record<string, string> = {}) => {
  const proc = Bun.spawn([process.execPath, "--no-env-file", ...args], { cwd, env: { PATH: process.env.PATH!, HOME: process.env.HOME!, ...env }, stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, code] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
  return { stdout, stderr, code };
};
const lastJson = (text: string) => JSON.parse(text.trim().split("\n").at(-1)!) as Record<string, unknown>;

describe("weekly-check workflow", () => {
  test("Friday 15:00 Zagreb schedule and manual dispatch only; no permissions; DEPLOYMENT from vars", () => {
    expect(Object.keys(WORKFLOW.on).sort()).toEqual(["schedule", "workflow_dispatch"]);
    expect(WORKFLOW.on.schedule).toEqual([{ cron: "0 15 * * 5", timezone: "Europe/Zagreb" }]);
    expect(WORKFLOW.permissions).toEqual({});
    expect(WORKFLOW.env).toEqual({ DEPLOYMENT: "${{ vars.DEPLOYMENT }}" });
  });

  test("jobs gate and check, read-only on ubuntu-24.04; check runs only when the gate is enabled", () => {
    expect(Object.keys(WORKFLOW.jobs).sort()).toEqual(["check", "gate"]);
    for (const [name, job] of Object.entries(WORKFLOW.jobs)) {
      expect(job["runs-on"], name).toBe("ubuntu-24.04");
      expect(job.permissions, name).toEqual({ contents: "read" });
    }
    const { gate, check } = WORKFLOW.jobs as { gate: Job; check: Job };
    expect(gate.outputs).toEqual({ enabled: "${{ steps.gate.outputs.enabled }}" });
    expect(gate.steps.find((s) => s.id === "gate")?.run).toBe('bun --no-env-file --no-install scripts/weekly/gate.ts >> "$GITHUB_OUTPUT"');
    expect(check.needs).toBe("gate");
    expect(check.if).toBe("needs.gate.outputs.enabled == 'true'");
  });

  test("every secret is on the Weekly check step only, exactly the 12 names; the gate job has none", () => {
    const weekly = WORKFLOW.jobs.check!.steps.filter((s) => s.name === "Weekly check");
    expect(weekly).toHaveLength(1);
    expect(weekly[0]!.run).toBe("bun --no-env-file scripts/weekly/check.ts");
    expect(secretsIn(weekly[0]!.env).sort()).toEqual([...WEEKLY_SECRETS].sort());
    expect(Object.entries(weekly[0]!.env!).every(([name, value]) => value === `\${{ secrets.${name} }}`)).toBe(true);
    expect(secretsIn(steps().filter((s) => s !== weekly[0]))).toEqual([]);
    expect(secretsIn(WORKFLOW.jobs.gate)).toEqual([]);
    expect(secretsIn(WORKFLOW).sort()).toEqual([...WEEKLY_SECRETS].sort());
  });

  test("no expression in shell, pinned actions, no artifact upload, no persisted credentials, named scripts exist", () => {
    for (const s of steps()) {
      if (s.run) expect(s.run).not.toContain("${{");
      if (s.uses) expect(s.uses).toMatch(/^[\w.-]+\/[\w.-]+@[0-9a-f]{40}$/);
      expect(s.uses ?? "").not.toContain("upload-artifact");
      if (s.uses?.startsWith("actions/checkout@")) expect(s.with?.["persist-credentials"]).toBe(false);
      for (const [script] of (s.run ?? "").matchAll(/scripts\/\S+\.ts/g)) expect(existsSync(join(ROOT, script)), script).toBe(true);
    }
    expect(steps().filter((s) => s.uses?.startsWith("actions/checkout@"))).toHaveLength(2);
  });
});

describe("weekly gate CLI without node_modules", () => {
  const dir = mkdtempSync(join(tmpdir(), "weekly-gate-"));
  for (const file of ["scripts/weekly/gate.ts", "scripts/reaudit/heartbeat.ts", "src/deployment.ts", "src/forms/config.ts", "src/env.ts"]) {
    mkdirSync(dirname(join(dir, file)), { recursive: true });
    copyFileSync(join(ROOT, file), join(dir, file));
  }
  cpSync(join(ROOT, "deployments/pirax"), join(dir, "deployments/pirax"), { recursive: true });
  writeDeployment(dir, "enabled", { config: { ...fixtureConfig(fixtureKeys().publicKey), weeklyCheck: { enabled: true, timeZone: "America/New_York" } }, versions: FIXTURE_VERSIONS });
  // --no-install: without it Bun would silently auto-install a missing package and hide the dependency.
  const gate = (args: string[], env: Record<string, string>) => cli(dir, ["--no-install", join(dir, "scripts/weekly/gate.ts"), ...args], env);

  test("pirax (the real config) is enabled", async () => {
    expect(await gate([], { DEPLOYMENT: "pirax" })).toMatchObject({ stdout: "enabled=true\n", code: 0 });
  });
  test("an enabled deployment is enabled", async () => {
    expect(await gate([], { DEPLOYMENT: "enabled" })).toMatchObject({ stdout: "enabled=true\n", code: 0 });
  });
  test("unset or unknown DEPLOYMENT fails with empty stdout", async () => {
    for (const env of [{}, { DEPLOYMENT: "nope" }] as Record<string, string>[]) {
      const r = await gate([], env);
      expect(r).toMatchObject({ stdout: "", code: 1 });
      expect(r.stderr).toStartWith("gate: DEPLOYMENT ");
    }
  });
  test("an Actions run of another repository fails with empty stdout", async () => {
    const r = await gate([], { DEPLOYMENT: "pirax", GITHUB_ACTIONS: "true", GITHUB_REPOSITORY: "other/repo" });
    expect(r).toMatchObject({ stdout: "", code: 1 });
    expect(r.stderr).toBe("gate: GITHUB_REPOSITORY is not the selected deployment's repository\n");
  });
  test("any argument prints usage and exits 2", async () => {
    const r = await gate(["--bogus"], { DEPLOYMENT: "pirax" });
    expect(r).toMatchObject({ stdout: "", code: 2 });
    expect(r.stderr).toContain("usage:");
  });
});

describe("weekly check CLI, offline", () => {
  const weekly = (args: string[], env: Record<string, string>) => cli(ROOT, [join(ROOT, "scripts/weekly/check.ts"), ...args], env);

  test("an unknown argument prints usage and exits 2", async () => {
    const r = await weekly(["--bogus"], { DEPLOYMENT: "pirax" });
    expect(r.code).toBe(2);
    expect(r.stderr).toContain("usage:");
  });
  test("no DEPLOYMENT exits 2 before any send", async () => {
    const r = await weekly([], {});
    expect(r.code).toBe(2);
    expect(lastJson(r.stderr)).toMatchObject({ smtpAttempts: 0, smtpAccepted: false });
  });
  test("an Actions run of another repository exits 2 before any check or send", async () => {
    const r = await weekly([], { DEPLOYMENT: "pirax", GITHUB_ACTIONS: "true", GITHUB_REPOSITORY: "other/repo" });
    expect(r.code).toBe(2);
    expect(lastJson(r.stderr)).toMatchObject({ smtpAttempts: 0, smtpAccepted: false });
  });
  test("selftest without mail credentials makes no SMTP attempt, exits 1 and prints no message content", async () => {
    const r = await weekly(["--selftest"], { DEPLOYMENT: "pirax" });
    expect(r.code).toBe(1);
    expect(lastJson(r.stderr)).toMatchObject({ smtpAttempts: 0, smtpAccepted: false, valid: true });
    for (const part of ["weekly-selftest.invalid", "selftest-alpha"]) expect(r.stdout.includes(part) || r.stderr.includes(part)).toBe(false);
  });
});

test("weeklyExitCode: the check's code when sent and valid, else at least 1", () => {
  const cases: [number, boolean, boolean, 0 | 1 | 2][] = [[0, true, true, 0], [1, true, true, 1], [2, true, true, 2], [0, false, true, 1], [2, false, true, 2], [0, true, false, 1], [1, true, false, 1]];
  for (const [code, valid, sent, expected] of cases) expect(weeklyExitCode(code, valid, sent)).toBe(expected);
});
