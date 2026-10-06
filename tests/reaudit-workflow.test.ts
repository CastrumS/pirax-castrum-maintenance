// Workflow contracts (plan D8/D9): the parsed YAML of reaudit.yml and reaudit-watchdog.yml, not a grep. Triggers,
// main/fixed-repository guards, least privilege per job, secret placement per step, no expression interpolation in
// shell, pinned actions and explicit toolchain; plus the documented CLIs' usage/fallback paths, run offline. Actual
// scheduling, Actions permissions enforcement and a main-only run are post-merge evidence, not proven here.
import { afterAll, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { parseInstant } from "../scripts/reaudit/heartbeat";

const ROOT = resolve(import.meta.dir, "..");
const REPO = "CastrumS/pirax-castrum-maintenance";
const scratch = await mkdtemp(join(tmpdir(), "reaudit-workflow-"));
afterAll(() => rm(scratch, { recursive: true, force: true }));

type Step = { name?: string; uses?: string; run?: string; if?: string; id?: string; with?: Record<string, unknown>; env?: Record<string, string> };
type Job = { if?: string; needs?: string | string[]; permissions?: Record<string, string>; "timeout-minutes"?: number; "runs-on"?: string; steps: Step[]; outputs?: Record<string, string> };
type Workflow = { on: Record<string, unknown>; permissions?: unknown; concurrency?: { group: string; "cancel-in-progress": boolean }; jobs: Record<string, Job> };
const load = async (name: string) => Bun.YAML.parse(await readFile(join(ROOT, ".github/workflows", name), "utf8")) as Workflow;
const audit = await load("reaudit.yml");
const watchdog = await load("reaudit-watchdog.yml");
const ALLOWED_SECRETS = ["GPLVAULT_LICENSE_KEY", "GPLVAULT_PRODUCT_ID", "GPLVAULT_UPDATER_PASSPHRASE", "IMAP_USER", "IMAP_PASSWORD", "PIRAX_HELPER_SIGNING_KEY"];
const secretsIn = (value: unknown) => [...JSON.stringify(value ?? null).matchAll(/secrets\.([A-Za-z0-9_]+)/g)].map((m) => m[1]!);
const step = (job: Job, match: (s: Step) => boolean) => {
  const found = job.steps.filter(match);
  expect(found).toHaveLength(1);
  return found[0]!;
};
const runs = (job: Job) => job.steps.flatMap((s) => (s.run ? [s.run] : []));

test("triggers: daily off-the-hour UTC schedule and manual dispatch only; fixed repository-wide concurrency, never cancelled", () => {
  expect(Object.keys(audit.on).sort()).toEqual(["schedule", "workflow_dispatch"]);
  const cron = (audit.on.schedule as { cron: string }[])[0]!.cron;
  expect(cron).toMatch(/^([1-9]|[1-5]\d) ([0-9]|1\d|2[0-3]) \* \* \*$/);
  expect(audit.concurrency).toEqual({ group: "pirax-reaudit", "cancel-in-progress": false });
  expect(audit.permissions).toEqual({});
  expect(Object.keys(audit.jobs).sort()).toEqual(["audit", "heartbeat", "notify", "publish"]);
});

test("every job is guarded to main of the fixed repository, bounded and explicitly permissioned", () => {
  for (const [name, job] of [...Object.entries(audit.jobs), ...Object.entries(watchdog.jobs)]) {
    expect(job.if, name).toContain(`github.repository == '${REPO}'`);
    expect(job.if, name).toContain("github.ref == 'refs/heads/main'");
    expect(job["runs-on"], name).toBe("ubuntu-24.04");
    expect(job["timeout-minutes"], name).toBeGreaterThan(0);
    expect(job.permissions, name).toBeDefined();
  }
});

test("no expression is interpolated into shell; every action is pinned to a commit", () => {
  for (const wf of [audit, watchdog])
    for (const job of Object.values(wf.jobs))
      for (const s of job.steps) {
        if (s.run) expect(s.run).not.toContain("${{");
        if (s.uses) expect(s.uses).toMatch(/^[\w.-]+\/[\w.-]+@[0-9a-f]{40}$/);
      }
  const text = JSON.stringify([audit, watchdog]);
  expect(text).not.toContain("pull_request");
  for (const name of secretsIn([audit, watchdog])) expect(ALLOWED_SECRETS).toContain(name);
  expect(text).not.toMatch(/R2_|CLOUDFLARE|CHECKER|SITES_/);
});

test("audit: read-only, no persisted credentials, explicit Node 24/Bun 1.4.2/native tools/Chromium, frozen install, >=90 min budget, vendor secrets only on the audit step", () => {
  const job = audit.jobs.audit!;
  expect(job.permissions).toEqual({ contents: "read" });
  expect(job["timeout-minutes"]).toBeGreaterThanOrEqual(120);
  const checkout = step(job, (s) => !!s.uses?.startsWith("actions/checkout@"));
  expect(checkout.with).toMatchObject({ "persist-credentials": false, ref: "${{ github.sha }}" });
  expect(step(job, (s) => !!s.uses?.startsWith("actions/setup-node@")).with).toEqual({ "node-version": "24" });
  expect(step(job, (s) => !!s.uses?.startsWith("oven-sh/setup-bun@")).with).toEqual({ "bun-version": "1.4.2" });
  const scripts = runs(job).join("\n");
  for (const tool of ["build-essential", "python3", "gnupg", "zip", "unzip"]) expect(scripts).toContain(tool);
  expect(scripts).toContain("bun --no-env-file install --frozen-lockfile");
  expect(scripts).toContain("bunx playwright install --with-deps chromium");
  const run = step(job, (s) => !!s.run?.includes("scripts/reaudit/run.ts"));
  expect(run.id).toBe("run");
  expect(run.run).toContain("bun --no-env-file scripts/reaudit/run.ts --out");
  expect(secretsIn(run.env).sort()).toEqual(["GPLVAULT_LICENSE_KEY", "GPLVAULT_PRODUCT_ID", "GPLVAULT_UPDATER_PASSPHRASE"]);
  expect(run.env!.GH_TOKEN).toBe("${{ github.token }}");
  // Vendor credentials nowhere else; no signing or mail credentials anywhere in the job.
  expect(secretsIn(job.steps.filter((s) => s !== run))).toEqual([]);
  expect(job.outputs).toEqual({ outcome: "${{ steps.run.outputs.outcome }}" });
  const candidate = step(job, (s) => s.with?.name === "reaudit-candidate-${{ github.run_attempt }}");
  expect(candidate.if).toBe("steps.run.outputs.outcome == 'audited-candidate'");
  for (const s of job.steps.filter((x) => x.uses?.startsWith("actions/upload-artifact@"))) expect(String(s.with?.path)).not.toMatch(/\.cache|private|\.zip/);
});

test("plan D5: no checkout persists credentials; publish and heartbeat push with the run token on their own step only", () => {
  for (const wf of [audit, watchdog])
    for (const [name, job] of Object.entries(wf.jobs)) expect(step(job, (s) => !!s.uses?.startsWith("actions/checkout@")).with?.["persist-credentials"], name).toBe(false);
  for (const [name, script] of [["publish", "scripts/reaudit/publish.ts"], ["heartbeat", "scripts/reaudit/heartbeat.ts"]] as const) {
    const job = audit.jobs[name]!;
    expect(step(job, (s) => !!s.run?.includes(script)).env?.GH_TOKEN, name).toBe("${{ github.token }}");
    expect(job.steps.filter((s) => s.env?.GH_TOKEN), name).toHaveLength(1);
  }
});

test("publish: only after this run's successful audited candidate, write-capable, no install/vendor code, trusted checkout, signing key on one step", () => {
  const job = audit.jobs.publish!;
  expect(job.needs).toEqual("audit");
  expect(job.if).toContain("needs.audit.result == 'success'");
  expect(job.if).toContain("needs.audit.outputs.outcome == 'audited-candidate'");
  expect(job.if).not.toContain("always()");
  expect(job.permissions).toEqual({ contents: "write" });
  expect(step(job, (s) => !!s.uses?.startsWith("actions/checkout@")).with?.ref).toBe("${{ github.sha }}");
  const scripts = runs(job).join("\n");
  expect(scripts).not.toMatch(/\bbun(?: --[\w-]+)* install\b|bunx|playwright|bun test|npm|apt-get/);
  expect(scripts).toContain("--no-install");
  const download = step(job, (s) => !!s.uses?.startsWith("actions/download-artifact@"));
  expect(Object.keys(download.with!).sort()).toEqual(["name", "path"]);
  expect(download.with!.name).toBe("reaudit-candidate-${{ github.run_attempt }}");
  const publish = step(job, (s) => !!s.run?.includes("scripts/reaudit/publish.ts"));
  expect(publish.run).toContain("bun --no-env-file --no-install scripts/reaudit/publish.ts --candidate");
  expect(secretsIn(publish.env)).toEqual(["PIRAX_HELPER_SIGNING_KEY"]);
  expect(secretsIn(job.steps.filter((s) => s !== publish))).toEqual([]);
});

test("reruns keep run_id and earlier artifacts: every artifact upload/download is bound to this run attempt", () => {
  const A = "${{ github.run_attempt }}";
  const names = Object.entries(audit.jobs).flatMap(([job, j]) =>
    j.steps.filter((s) => /^actions\/(upload|download)-artifact@/.test(s.uses ?? "")).map((s) => [job, s.uses!.split("@")[0], s.with?.name ?? s.with?.pattern]),
  );
  expect(names).toEqual([
    ["audit", "actions/upload-artifact", `reaudit-candidate-${A}`],
    ["audit", "actions/upload-artifact", `reaudit-summary-${A}-audit`],
    ["audit", "actions/upload-artifact", `reaudit-evidence-${A}`],
    ["publish", "actions/download-artifact", `reaudit-candidate-${A}`],
    ["publish", "actions/upload-artifact", `reaudit-summary-${A}-publish`],
    ["notify", "actions/download-artifact", `reaudit-summary-${A}-*`],
  ]);
});

test("heartbeat: independent final job, runs even after failures, fresh main and write token only", () => {
  const job = audit.jobs.heartbeat!;
  expect(job.needs).toEqual(["audit", "publish"]);
  expect(job.if).toContain("always()");
  expect(job.permissions).toEqual({ contents: "write" });
  expect(step(job, (s) => !!s.uses?.startsWith("actions/checkout@")).with?.ref).toBe("main");
  expect(runs(job).join("\n")).toContain("bun --no-env-file --no-install scripts/reaudit/heartbeat.ts --run");
  expect(secretsIn(job)).toEqual([]);
});

test("notice: one always() job observing every other job, with mail credentials only on its send step", () => {
  const job = audit.jobs.notify!;
  expect(job.needs).toEqual(["audit", "publish", "heartbeat"]);
  expect(job.if).toContain("always()");
  expect(job.if).toContain("contains(needs.*.result, 'failure')");
  expect(job.if).toContain("contains(needs.*.result, 'cancelled')");
  expect(job.permissions).toEqual({ contents: "read" });
  const send = step(job, (s) => !!s.run?.includes("scripts/reaudit/notify.ts"));
  expect(send.run).toContain("bun --no-env-file scripts/reaudit/notify.ts --jobs");
  expect(send.env!.REAUDIT_NEEDS).toBe("${{ toJSON(needs) }}");
  expect(secretsIn(send.env).sort()).toEqual(["IMAP_PASSWORD", "IMAP_USER"]);
  expect(secretsIn(job.steps.filter((s) => s !== send))).toEqual([]);
});

test("watchdog: separate daily/manual workflow with actions:read, Gmail secrets only, its own concurrency", () => {
  expect(Object.keys(watchdog.on).sort()).toEqual(["schedule", "workflow_dispatch"]);
  expect((watchdog.on.schedule as { cron: string }[])[0]!.cron).not.toBe((audit.on.schedule as { cron: string }[])[0]!.cron);
  expect(watchdog.permissions).toEqual({});
  expect(watchdog.concurrency).toEqual({ group: "pirax-reaudit-watchdog", "cancel-in-progress": false });
  const job = Object.values(watchdog.jobs)[0]!;
  expect(job.permissions).toEqual({ actions: "read", contents: "read" });
  const run = step(job, (s) => !!s.run?.includes("scripts/reaudit/watchdog.ts"));
  expect(run.run!.trim()).toBe("bun --no-env-file scripts/reaudit/watchdog.ts");
  expect(secretsIn(watchdog).sort()).toEqual(["IMAP_PASSWORD", "IMAP_USER"]);
  expect(run.env!.GH_TOKEN).toBe("${{ github.token }}");
});

test("every referenced script exists; the initial heartbeat payload is a valid instant", async () => {
  for (const wf of [audit, watchdog])
    for (const job of Object.values(wf.jobs))
      for (const script of runs(job).join("\n").match(/scripts\/[\w/.-]+\.ts/g) ?? []) expect(existsSync(join(ROOT, script)), script).toBe(true);
  const heartbeat = await readFile(join(ROOT, ".github/audit/heartbeat.txt"), "utf8");
  expect(heartbeat).toMatch(/^\S+\n$/);
  expect(Number.isFinite(parseInstant(heartbeat.trim()))).toBe(true);
});

test("the four guides document the workflows, the manual dispatch and only scripts that exist", async () => {
  const guides = ["README.md", "plugin/pirax-form-test/README.md", "test/plugin/README.md", "test/forms/README.md"];
  const texts = await Promise.all(guides.map((g) => readFile(join(ROOT, g), "utf8")));
  for (const text of texts) for (const script of text.match(/scripts\/reaudit\/[\w-]+\.ts/g) ?? []) expect(existsSync(join(ROOT, script)), script).toBe(true);
  const readme = texts[0]!;
  expect(readme).toContain(`gh workflow run reaudit.yml --ref main --repo ${REPO}`);
  expect(readme).toContain(`gh workflow run reaudit-watchdog.yml --ref main --repo ${REPO}`);
  for (const name of ALLOWED_SECRETS) expect(readme).toContain(name);
  expect(texts[1]).toContain("scripts/reaudit/bump.ts");
  expect(texts[2]).toContain("scripts/reaudit/run.ts");
  expect(texts[3]).toContain("re-audit");
});

const cli = async (args: string[], env: Record<string, string> = {}) => {
  const proc = Bun.spawn([process.execPath, "--no-env-file", ...args], { cwd: scratch, env: { PATH: process.env.PATH!, HOME: process.env.HOME!, ...env }, stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, code] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
  return { stdout, stderr, code };
};

test("documented CLIs refuse unknown arguments with usage (exit 2) and do nothing else", async () => {
  for (const script of ["run.ts", "publish.ts"]) {
    const r = await cli([join(ROOT, "scripts/reaudit", script), "--bogus"]);
    expect(r.code, script).toBe(2);
    expect(r.stderr, script).toContain("usage:");
  }
  const r = await cli([join(ROOT, "scripts/reaudit/publish.ts"), "--candidate", join(scratch, "none.json"), "--summary", join(scratch, "s.json")]);
  expect(r.code).toBe(1);
  expect(JSON.parse(await readFile(join(scratch, "s.json"), "utf8"))).toMatchObject({ stage: "publication", reason: "candidate-invalid", publication: "not-attempted" });
});

test("notify --jobs picks the failed job's summary and, without mail credentials, fails safely before any SMTP attempt", async () => {
  const dir = join(scratch, "summaries");
  await mkdir(join(dir, "reaudit-summary-1-audit"), { recursive: true });
  await writeFile(join(dir, "reaudit-summary-1-audit/summary.json"), JSON.stringify({ stage: "audit", reason: "native-suite-failed", cleanup: "confirmed", publication: "not-attempted" }));
  const needs = JSON.stringify({ audit: { result: "failure", outputs: {} }, publish: { result: "skipped", outputs: {} }, heartbeat: { result: "success", outputs: {} } });
  const r = await cli([join(ROOT, "scripts/reaudit/notify.ts"), "--jobs", dir], { REAUDIT_NEEDS: needs, GITHUB_RUN_ATTEMPT: "1" });
  expect(r.code).toBe(1);
  expect(JSON.parse(r.stderr.trim().split("\n").at(-1)!)).toMatchObject({ smtpAttempts: 0, smtpAccepted: false, stage: "audit" });
  // Attempt 2 of the same run left no summary: the fixed audit fallback (cleanup unknown), never attempt 1's.
  for (const attempt of [{ GITHUB_RUN_ATTEMPT: "2" }, {}] as Record<string, string>[]) {
    const rerun = await cli([join(ROOT, "scripts/reaudit/notify.ts"), "--jobs", dir], { REAUDIT_NEEDS: needs, ...attempt });
    expect(rerun.code).toBe(1);
    expect(JSON.parse(rerun.stderr.trim().split("\n").at(-1)!)).toMatchObject({ smtpAttempts: 0, stage: "setup" });
  }
  const bad = await cli([join(ROOT, "scripts/reaudit/notify.ts"), "--jobs", dir], { REAUDIT_NEEDS: "{not json", GITHUB_RUN_ATTEMPT: "1" });
  expect(bad.code).toBe(1);
  expect(JSON.parse(bad.stderr.trim().split("\n").at(-1)!)).toMatchObject({ smtpAttempts: 0, stage: "unknown" });
});

test("publish and heartbeat jobs install nothing: their scripts load without node_modules", async () => {
  const dir = join(scratch, "no-deps");
  await mkdir(join(dir, "test/plugin"), { recursive: true });
  expect(Bun.spawnSync(["cp", "-r", join(ROOT, "scripts"), join(dir, "scripts")]).exitCode).toBe(0);
  expect(Bun.spawnSync(["cp", join(ROOT, "test/plugin/artifacts.ts"), join(dir, "test/plugin/artifacts.ts")]).exitCode).toBe(0);
  for (const [script, arg] of [["scripts/reaudit/publish.ts", "--bogus"], ["scripts/reaudit/heartbeat.ts", "--bogus"]] as const) {
    // --no-install: without it Bun would silently auto-install a missing package and hide the dependency.
    const r = await cli(["--no-install", join(dir, script), arg]);
    expect(r.stderr, script).toContain("usage:");
    expect(r.code, script).toBe(2);
  }
});
