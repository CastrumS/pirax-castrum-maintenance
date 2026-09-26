// Real SMTP/IMAP selftest of src/mail/imap.ts. Sends exactly one harmless tagged message to
// FORM_TEST_ADDRESS, proves production polling finds it and times out for an unsent ID, and compares
// read-only snapshots (counts, UIDNEXT/UIDVALIDITY/HIGHESTMODSEQ, tagged-candidate UID/flags) around
// both polls. Output and runs/mail-selftest-<stamp>/summary.json carry IDs, outcomes, counts, flags and
// sanitized command names only: never credentials, addresses, hosts, folder names, bodies or protocol logs.
// The sent message is intentionally left in the mailbox.
import { mkdirSync } from "node:fs";
import { join, relative } from "node:path";
import { ImapFlow } from "imapflow";
import nodemailer from "nodemailer";
import { EnvError, EnvFormatError, readEnv } from "../../src/env.ts";
import { addressPattern, readFormConfig } from "../../src/forms/config.ts";
import { readImapConfig, type ImapConfig } from "../../src/mail/config.ts";
import { DELIVERY_TIMEOUT_MS, deliveryFolders, pollDelivery, subjectTag, summarizeCommand, type DeliveryResult } from "../../src/mail/imap.ts";

class Failure extends Error {}
function safe(e: unknown): string {
  if (e instanceof Failure || e instanceof EnvError || e instanceof EnvFormatError) return e.message;
  const name = e instanceof Error ? e.name : typeof e;
  const code = (e as { code?: unknown })?.code;
  return typeof code === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(code) ? `${name} (${code})` : name;
}

let imap: ImapConfig, address: string, token: string, smtp: Record<"SMTP_HOST" | "SMTP_PORT" | "SMTP_USER" | "SMTP_PASSWORD", string>;
try {
  imap = readImapConfig();
  ({ address, token } = readFormConfig());
  const noControls = (v: string) => !/[\u0000-\u001f\u007f]/.test(v);
  smtp = readEnv(process.env, { SMTP_HOST: (v) => /^[A-Za-z0-9.-]{1,253}$/.test(v), SMTP_PORT: (v) => /^[1-9][0-9]{0,4}$/.test(v) && Number(v) <= 65535, SMTP_USER: noControls, SMTP_PASSWORD: noControls });
} catch (e) {
  console.error(`mail:selftest: ${safe(e)}. No mail sent.`);
  process.exit(2);
}

const started = new Date();
const outDir = join("runs", `mail-selftest-${started.toISOString().replaceAll(":", "-")}`);
mkdirSync(outDir, { recursive: true });
const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
/** Unbiased [a-z0-9]{12}: bytes >= 252 are rejected so every character is equally likely. */
function newId(): string {
  let id = "";
  while (id.length < 12) { const b = crypto.getRandomValues(new Uint8Array(1))[0]!; if (b < 252) id += alphabet[b % 36]; }
  return id;
}
const sentId = newId();
const unsentId = newId();

type Snapshot = { category: "inbox" | "spam"; exists: number; uidValidity: string; uidNext: number; highestModseq: string | null; readOnly: boolean | null; candidates: { tag: "sent" | "unsent"; uid: number; flags: string[] }[] };
const counts = (list: string[]) => Object.fromEntries([...new Set(list)].sort().map((c) => [c, list.filter((x) => x === c).length]));
const snapshotCommands: string[] = [];
const quiet = () => {};
const commandLogger = (sink: string[]) => ({ trace: quiet, info: quiet, warn: quiet, error: quiet, fatal: quiet, debug: (entry: { src?: unknown; msg?: unknown }) => {
  const summary = entry?.src === "c" && typeof entry.msg === "string" ? summarizeCommand(entry.msg) : null;
  if (summary) sink.push(summary);
} });

/** Independent read-only session: EXAMINE, tag search, UID/FLAGS of tagged candidates only. */
async function snapshot(): Promise<Snapshot[]> {
  const client = new ImapFlow({ host: imap.host, port: imap.port, secure: imap.secure, doSTARTTLS: imap.secure ? undefined : true, auth: { user: imap.user, pass: imap.password }, logger: commandLogger(snapshotCommands) as never, literalMailboxes: true, disableAutoIdle: true, connectionTimeout: 30_000, greetingTimeout: 30_000, socketTimeout: 60_000 });
  client.on("error", quiet);
  try {
    try { await client.connect(); }
    catch { throw new Failure("IMAP snapshot connection/authentication failed; verify IMAP_HOST/IMAP_PORT and dedicated-mailbox IMAP_USER/IMAP_PASSWORD with the provider"); }
    const result: Snapshot[] = [];
    for (const folder of deliveryFolders(imap)) {
      const box = await client.mailboxOpen(folder.path, { readOnly: true }).catch(() => {
        throw new Failure(`IMAP snapshot EXAMINE failed; verify the exact existing ${folder.spam ? "IMAP_SPAM_FOLDER" : "IMAP_FOLDER"} name with the provider (no discovery or folder creation attempted)`);
      });
      assert(box.readOnly === true, "snapshot EXAMINE did not confirm read-only access");
      const candidates: Snapshot["candidates"] = [];
      for (const [tag, id] of [["sent", sentId], ["unsent", unsentId]] as const) {
        const uids = await client.search({ subject: subjectTag(id) }, { uid: true });
        if (!Array.isArray(uids)) throw new Failure("snapshot search failed");
        if (uids.length) for (const m of await client.fetchAll(uids.join(","), { uid: true, flags: true }, { uid: true })) candidates.push({ tag, uid: m.uid, flags: [...(m.flags ?? [])].sort() });
      }
      result.push({ category: folder.spam ? "spam" : "inbox", exists: box.exists, uidValidity: String(box.uidValidity), uidNext: box.uidNext, highestModseq: box.highestModseq === undefined ? null : String(box.highestModseq), readOnly: box.readOnly ?? null, candidates: candidates.sort((a, b) => a.uid - b.uid) });
    }
    await client.logout();
    return result;
  } finally {
    client.close();
  }
}

type Check = { name: string; ok: boolean; facts?: Record<string, unknown>; error?: string };
const checks: Check[] = [];
const summary: Record<string, unknown> = { startedAt: started.toISOString(), ids: { sent: sentId, unsent: unsentId }, smtpAttempts: 0, smtpAccepted: false, checks };
async function check(name: string, fn: () => Promise<Record<string, unknown> | void>) {
  try {
    const facts = (await fn()) ?? undefined;
    checks.push({ name, ok: true, facts });
    console.log(`ok   ${name}${facts ? " " + JSON.stringify(facts) : ""}`);
  } catch (e) {
    checks.push({ name, ok: false, error: safe(e) });
    console.log(`FAIL ${name}: ${safe(e)}`);
    throw e;
  }
}
const assert = (ok: boolean, message: string) => { if (!ok) throw new Failure(message); };
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const found = (s: Snapshot[]) => s.filter((f) => f.candidates.some((c) => c.tag === "sent"));
async function poll(id: string, sink: string[]): Promise<DeliveryResult & { elapsedMs: number }> {
  const t = performance.now();
  const result = await pollDelivery({ id, config: imap, onCommand: (c) => sink.push(c) });
  return { ...result, elapsedMs: Math.round(performance.now() - t) };
}

const pollCommands = { sent: [] as string[], unsent: [] as string[] };
let exitCode = 0;
try {
  await check("real IMAP authentication and both exact folders are usable before sending", async () => {
    await snapshot();
  });
  await check("smtp sends exactly one harmless tagged message", async () => {
    const transport = nodemailer.createTransport({ host: smtp.SMTP_HOST, port: Number(smtp.SMTP_PORT), secure: smtp.SMTP_PORT === "465", requireTLS: smtp.SMTP_PORT !== "465", auth: { user: smtp.SMTP_USER, pass: smtp.SMTP_PASSWORD }, logger: false, debug: false, connectionTimeout: 30_000, greetingTimeout: 30_000, socketTimeout: 60_000 });
    try {
      summary.smtpAttempts = 1;
      const info = await transport.sendMail({
        from: addressPattern.test(smtp.SMTP_USER) ? smtp.SMTP_USER : address, to: address,
        subject: `${subjectTag(sentId)} Pirax Castrum mailbox selftest`,
        text: "Harmless Pirax Castrum mailbox selftest. It carries no form data or secrets and is intentionally left in this mailbox.",
        headers: { "X-Pirax-Form-Test": sentId },
      });
      summary.smtpAccepted = info.accepted.length === 1 && info.rejected.length === 0;
      assert(summary.smtpAccepted === true, "SMTP did not accept exactly one recipient");
      return { accepted: info.accepted.length, rejected: info.rejected.length };
    } finally { transport.close(); }
  });

  let before: Snapshot[] = [];
  await check("message arrives before the before-snapshot (arrival settles)", async () => {
    const t = performance.now();
    for (;;) {
      if (found(await snapshot()).length) break;
      assert(performance.now() - t < DELIVERY_TIMEOUT_MS, "sent message did not arrive within five minutes");
      await Bun.sleep(10_000);
    }
    const arrivalMs = Math.round(performance.now() - t);
    // Allow provider filing/labelling to finish; require two identical consecutive snapshots.
    for (let previous = await snapshot(); ; previous = before) {
      await Bun.sleep(10_000);
      before = await snapshot();
      if (same(previous, before)) break;
      assert(performance.now() - t < DELIVERY_TIMEOUT_MS * 2, "mailbox did not settle");
    }
    summary.snapshotBefore = before;
    return { arrivalMs, categories: found(before).map((f) => f.category) };
  });

  let sent!: DeliveryResult & { elapsedMs: number };
  await check("production poll finds the sent tag in the expected folder category", async () => {
    sent = await poll(sentId, pollCommands.sent);
    summary.sentPoll = sent;
    const categories = found(before).map((f) => f.category);
    assert(sent.outcome === (categories.includes("spam") ? "delivered-spam" : "delivered"), `unexpected outcome ${sent.outcome}`);
    return { outcome: sent.outcome, elapsedMs: sent.elapsedMs };
  });

  let afterSent: Snapshot[] = [];
  await check("mailbox unchanged by the delivered poll (counts, UIDs, modseq, candidate flags)", async () => {
    afterSent = await snapshot();
    summary.snapshotAfterSent = afterSent;
    assert(same(before, afterSent), "snapshot changed across the delivered poll (inconclusive or mutated; see summary)");
    return { seenBefore: found(before).some((f) => f.candidates.some((c) => c.flags.includes("\\Seen"))), seenAfter: found(afterSent).some((f) => f.candidates.some((c) => c.flags.includes("\\Seen"))) };
  });

  await check("unsent ID runs the full default deadline to failed", async () => {
    const unsent = await poll(unsentId, pollCommands.unsent);
    summary.unsentPoll = unsent;
    assert(unsent.outcome === "failed" && unsent.detail.startsWith(`No message tagged ${subjectTag(unsentId)}`), `unexpected unsent result ${unsent.outcome}`);
    assert(unsent.elapsedMs >= DELIVERY_TIMEOUT_MS - 50 && unsent.elapsedMs <= DELIVERY_TIMEOUT_MS + 5_000, `deadline not honoured (${unsent.elapsedMs} ms)`);
    return { outcome: unsent.outcome, elapsedMs: unsent.elapsedMs };
  });

  await check("mailbox unchanged by the timeout poll", async () => {
    const afterUnsent = await snapshot();
    summary.snapshotAfterUnsent = afterUnsent;
    assert(same(afterSent, afterUnsent), "snapshot changed across the timeout poll (inconclusive or mutated; see summary)");
  });

  await check("wire commands are read-only: EXAMINE, UID SEARCH, Subject-only BODY.PEEK; no discovery", async () => {
    const all = [...pollCommands.sent, ...pollCommands.unsent];
    const allowed = new Set(["CAPABILITY", "ID", "STARTTLS", "LOGIN", "AUTHENTICATE", "COMPRESS", "ENABLE", "EXAMINE", "UID SEARCH", "LOGOUT", "NOOP"]);
    const fetches = all.filter((c) => c.startsWith("UID FETCH"));
    const other = all.filter((c) => !allowed.has(c) && !c.startsWith("UID FETCH"));
    assert(other.length === 0, `unexpected commands: ${[...new Set(other)].join(", ")}`);
    assert(fetches.length > 0 && fetches.every((c) => /^UID FETCH \(UID(?: (?:MODSEQ|EMAILID|X-GM-MSGID))* BODY\.PEEK\[HEADER\.FIELDS \(SUBJECT\)\]\)$/.test(c)), "FETCH requested more than candidate UID/Subject-only PEEK metadata");
    assert(!pollCommands.unsent.some((c) => c.includes("FETCH")), "unsent search unexpectedly fetched candidates");
    assert(all.includes("EXAMINE") && !all.includes("SELECT"), "folders were not opened with EXAMINE only");
    const snapshotOther = snapshotCommands.filter((c) => !allowed.has(c) && !/^UID FETCH \((?:UID|FLAGS|MODSEQ|EMAILID|X-GM-MSGID)(?: (?:UID|FLAGS|MODSEQ|EMAILID|X-GM-MSGID))*\)$/.test(c));
    assert(snapshotOther.length === 0, "selftest snapshot session used a non-read-only command");
    summary.commands = { sentPoll: counts(pollCommands.sent), unsentPoll: counts(pollCommands.unsent), snapshotSessions: counts(snapshotCommands) };
    return { sentPoll: counts(pollCommands.sent) };
  });
} catch {
  exitCode = 1;
} finally {
  summary.finishedAt = new Date().toISOString();
  summary.commands ??= { sentPoll: counts(pollCommands.sent), unsentPoll: counts(pollCommands.unsent), snapshotSessions: counts(snapshotCommands) };
  summary.limitations = "Read-only IMAP cannot prevent other clients/providers from changing the mailbox; unchanged snapshots show a quiet interval, not exclusive control. Any sent message is left in the mailbox by design. The pinned literalMailboxes patch disables startup discovery and select-time LIST/path normalization.";
  const text = JSON.stringify(summary, null, 2) + "\n";
  // Privacy gate on the retained artifact, compared in memory; only pass/fail is printed.
  const secrets = [token, imap.password, imap.user, imap.host, smtp.SMTP_PASSWORD, smtp.SMTP_USER, smtp.SMTP_HOST, address].filter((s) => s.length >= 4);
  const leaked = secrets.some((s) => [s, encodeURIComponent(s), JSON.stringify(s).slice(1, -1)].some((v) => text.includes(v)));
  if (leaked) { exitCode = 1; console.log("FAIL summary privacy scan"); await Bun.write(join(outDir, "summary.json"), JSON.stringify({ privacyScan: "failed; summary withheld" }) + "\n"); }
  else { console.log("ok   summary privacy scan"); await Bun.write(join(outDir, "summary.json"), text); }
  console.log(`Summary: ${relative(process.cwd(), join(outDir, "summary.json"))}`);
}
process.exit(exitCode);
