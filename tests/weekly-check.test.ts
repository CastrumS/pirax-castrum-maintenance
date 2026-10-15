import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadDeployment, type Deployment } from "../src/deployment.ts";
import { subjectTag } from "../src/mail/imap.ts";
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
