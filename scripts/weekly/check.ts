// Weekly check (weekly-check.yml): runs `check all` for the selected deployment and sends exactly one summary email
// (scripts/weekly/summary.ts) to its configured recipient over the shared one-attempt SMTP send. The email is the only
// place the private report link goes: this script never prints or writes the subject, body, report URL or any address,
// only counts, exit codes and safe error text. An unusable DEPLOYMENT or an Actions run of another repository exits 2
// before any check or credential read. A failed send is never retried. The exit code is the check's own, raised to at
// least 1 when the result was unreadable or the email was not accepted.
//
// Usage (every form needs DEPLOYMENT):
//   bun --no-env-file scripts/weekly/check.ts                 the weekly run: check all, then one summary email
//   bun --env-file=.env scripts/weekly/check.ts --selftest    no check: one clearly labeled synthetic summary email,
//                                                              then a read-only mailbox lookup of its subject tag; writes
//                                                              runs/weekly-selftest-<stamp>.json and exits 0 only when
//                                                              it arrived (inbox or spam)
// Import-safe: nothing runs on import.
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { runCommand } from "../../src/commands/common.ts";
import { DeploymentConfigError, loadDeployment, type Deployment } from "../../src/deployment.ts";
import { EnvError, EnvFormatError } from "../../src/env.ts";
import { readImapConfig } from "../../src/mail/config.ts";
import { pollDelivery } from "../../src/mail/imap.ts";
import { repositoryMismatch } from "../reaudit/heartbeat.ts";
import { newId, safeError, sendMessage } from "../reaudit/notify.ts";
import { formatWeekly, selftestInput } from "./summary.ts";

/** Plan D7: the check's code when its summary was valid and accepted, else at least 1. */
export function weeklyExitCode(checkExitCode: number, valid: boolean, sent: boolean): 0 | 1 | 2 {
  const code = checkExitCode === 0 || checkExitCode === 1 || checkExitCode === 2 ? checkExitCode : 1;
  return valid && sent ? code : (Math.max(code, 1) as 1 | 2);
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  if (args.length > 1 || (args.length === 1 && args[0] !== "--selftest")) {
    console.error("usage: bun scripts/weekly/check.ts [--selftest]");
    process.exit(2);
  }
  const selftest = args.length === 1;
  let deployment: Deployment;
  try {
    deployment = loadDeployment();
  } catch (e) {
    if (!(e instanceof DeploymentConfigError)) throw e;
    console.error(JSON.stringify({ smtpAttempts: 0, smtpAccepted: false, error: e.message }));
    process.exit(2);
  }
  if (repositoryMismatch(deployment, process.env)) {
    console.error(JSON.stringify({ smtpAttempts: 0, smtpAccepted: false, error: "GITHUB_REPOSITORY is not the selected deployment's repository" }));
    process.exit(2);
  }
  const ranAt = new Date();
  const selftestId = selftest ? newId() : undefined;
  const runId = new Date().toISOString().replaceAll(":", "-");
  const input = selftest
    ? selftestInput(runId)
    : await runCommand("check", ["all"]).then(({ exitCode, report, url }) => ({ exitCode, ...(report && { report }), ...(url && { url }) }));
  const checkExitCode = [0, 1, 2].includes(input.exitCode) ? input.exitCode : 1;
  const message = formatWeekly(deployment, input, ranAt, selftestId);
  const facts = await sendMessage(deployment, { subject: message.subject, text: message.text }).then(
    (sent) => ({ smtpAttempts: 1, smtpAccepted: true, sent }),
    (e) => ({ smtpAttempts: e instanceof EnvError || e instanceof EnvFormatError ? 0 : 1, smtpAccepted: false, error: safeError(e) }),
  );
  const status = { smtpAttempts: facts.smtpAttempts, smtpAccepted: facts.smtpAccepted, checkExitCode, valid: message.valid };
  const selftestFacts = selftestId ? { selftestId } : {};
  if (!("sent" in facts) || !selftestId) {
    const exitCode = weeklyExitCode(checkExitCode, message.valid, "sent" in facts);
    const line = JSON.stringify({ ...status, exitCode, ...selftestFacts, ...("error" in facts && { error: facts.error }) });
    if (exitCode === 0) console.log(line);
    else console.error(line);
    process.exit(exitCode);
  }
  let config: ReturnType<typeof readImapConfig>;
  try {
    config = readImapConfig();
  } catch (e) {
    if (!(e instanceof EnvError || e instanceof EnvFormatError)) throw e;
    console.error(JSON.stringify({ ...status, exitCode: 1, ...selftestFacts, error: e.message }));
    process.exit(1);
  }
  // The summary goes to the recipient's INBOX; IMAP_FOLDER is the form-test folder, so only the spam folder is reused.
  const delivery = await pollDelivery({ id: selftestId, config: { ...config, folder: "INBOX" } });
  mkdirSync(resolve("runs"), { recursive: true });
  const artifact = join(resolve("runs"), `weekly-selftest-${runId}.json`);
  writeFileSync(artifact, `${JSON.stringify({ selftestId, smtpAccepted: true, accepted: facts.sent.accepted, rejected: facts.sent.rejected, delivery: delivery.outcome, startedAt: ranAt.toISOString() }, null, 2)}\n`);
  const exitCode = delivery.outcome === "failed" ? 1 : 0;
  const line = JSON.stringify({ ...status, exitCode, ...selftestFacts, artifact });
  if (exitCode === 0) console.log(line);
  else console.error(line);
  process.exit(exitCode);
}
