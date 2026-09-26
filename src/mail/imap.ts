import { ImapFlow } from "imapflow";
import { decodeText } from "imapflow/lib/tools.js";
import type { ImapConfig } from "./config.ts";

export type DeliveryResult = { outcome: "delivered" | "delivered-spam" | "failed"; detail: string };
export type DeliveryFolder = { path: string; spam: boolean };
export type PollOptions = {
  id: string;
  config: ImapConfig;
  /** Production default is five minutes, including connection and command waits; shorter only for internal tests. */
  timeoutMs?: number;
  /** Receives sanitized command names (and FETCH data items) only; never arguments, responses or auth. */
  onCommand?: (summary: string) => void;
};

export const DELIVERY_TIMEOUT_MS = 300_000;
const POLL_INTERVAL_MS = 15_000;
const LOGOUT_MS = 2_000;

export const subjectTag = (id: string) => `[pirax-test ${id}]`;
/** IMAP SUBJECT search is a case-insensitive substring match; recheck the exact tag on the decoded subject. */
export const subjectHasTag = (subject: string | undefined, id: string) => !!subject?.includes(subjectTag(id));

/** Decode only a single well-formed Subject-only header block, never arbitrary headers/body text. */
export function subjectFromHeaders(headers: Buffer | undefined): string | undefined {
  if (!headers) return undefined;
  try {
    const raw = new TextDecoder("utf-8", { fatal: true }).decode(headers);
    const field = /^subject:([^\r\n]*(?:\r\n[ \t]+[^\r\n]*)*)\r\n\r\n$/i.exec(raw)?.[1];
    if (field === undefined) return undefined;
    const unfolded = field.replace(/\r\n[ \t]+/g, " ").trim();
    if (/[\u0000-\u0008\u000b-\u001f\u007f]/.test(unfolded)) return undefined;
    const subject = decodeText(unfolded);
    // The MIME decoder is intentionally tolerant; do not accept leftover malformed words/controls.
    return /[\u0000-\u001f\u007f]|=\?/.test(subject) ? undefined : subject;
  } catch { return undefined; }
}

/** Only the two configured names; equal names are opened once and counted as spam. */
export function deliveryFolders(config: ImapConfig): DeliveryFolder[] {
  return config.folder === config.spamFolder ? [{ path: config.spamFolder, spam: true }] : [{ path: config.folder, spam: false }, { path: config.spamFolder, spam: true }];
}

/** One polling round inspects every folder; any spam-folder match wins. */
export function roundOutcome(folders: DeliveryFolder[], found: boolean[]): "delivered" | "delivered-spam" | null {
  if (folders.some((f, i) => found[i] && f.spam)) return "delivered-spam";
  return found.some(Boolean) ? "delivered" : null;
}

/** Reduces a client-sent protocol line to its command (and FETCH items); null for literals/continuations. */
export function summarizeCommand(line: string): string | null {
  const words = line.split(" ");
  const verb = words[1]?.toUpperCase() ?? "";
  if (!/^[A-Z]+$/.test(verb)) return null;
  const name = verb === "UID" && /^[A-Z]+$/i.test(words[2] ?? "") ? `UID ${words[2]!.toUpperCase()}` : verb;
  if (!name.endsWith("FETCH")) return name;
  // Tag, command word(s) and sequence set precede the data items.
  const items = words.slice(name.split(" ").length + 2).join(" ").replace(/^\((.*)\)$/, "$1");
  return /^[A-Z0-9.[\]() -]+$/i.test(items) ? `${name} (${items.toUpperCase()})` : `${name} (unparsed)`;
}

function failure(phase: string, error: unknown): string {
  const e = (error ?? {}) as { authenticationFailed?: unknown; mailboxMissing?: unknown; code?: unknown; serverResponseCode?: unknown; tlsFailed?: unknown };
  if (e.authenticationFailed) return "IMAP authentication failed; check the IMAP_USER/IMAP_PASSWORD names.";
  if (phase === "open") return "IMAP folder could not be opened read-only; check the IMAP_FOLDER/IMAP_SPAM_FOLDER names.";
  const code = [e.serverResponseCode, e.code].find((c): c is string => typeof c === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(c));
  return `IMAP ${phase} failed${e.tlsFailed ? " (TLS)" : code ? ` (${code})` : ""}.`;
}

/**
 * Read-only delivery check for one submission ID: EXAMINE only the configured folders, UID SEARCH
 * the full subject tag, and fetch only UID/Subject PEEK for those candidates (never a body, never a flag
 * write). Auth, folder and connection errors are `failed`, not absent mail. No retries or reconnects.
 */
export async function pollDelivery({ id, config, timeoutMs = DELIVERY_TIMEOUT_MS, onCommand }: PollOptions): Promise<DeliveryResult> {
  if (!/^[a-z0-9]{12}$/.test(id)) throw new TypeError("submission id must be 12 lowercase alphanumeric characters");
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > DELIVERY_TIMEOUT_MS) throw new RangeError(`timeoutMs must be an integer from 1 to ${DELIVERY_TIMEOUT_MS}`);
  const started = Date.now();
  const deadline = started + timeoutMs;
  const tag = subjectTag(id);
  const folders = deliveryFolders(config);
  const seconds = () => Math.round((Date.now() - started) / 1000);
  const silent = () => {};
  const client = new ImapFlow({
    host: config.host, port: config.port, secure: config.secure, doSTARTTLS: config.secure ? undefined : true,
    auth: { user: config.user, pass: config.password },
    logger: onCommand ? { trace: silent, info: silent, warn: silent, error: silent, fatal: silent, debug: (entry: { src?: unknown; msg?: unknown }) => {
      const summary = entry?.src === "c" && typeof entry.msg === "string" ? summarizeCommand(entry.msg) : null;
      if (summary) onCommand(summary);
    } } as never : false,
    literalMailboxes: true, disableAutoIdle: true, connectionTimeout: timeoutMs, greetingTimeout: timeoutMs, socketTimeout: timeoutMs,
  });
  // Socket errors also reject the awaited command; the event only needs a listener.
  client.on("error", silent);
  const stop = new AbortController();
  let phase = "connect";
  let rounds = 0;

  const work = (async (): Promise<DeliveryResult> => {
    await client.connect();
    for (;;) {
      const found: boolean[] = [];
      for (const folder of folders) {
        phase = "open";
        // The pinned dependency patch suppresses startup discovery, path rewriting and metadata LIST.
        // mailboxOpen (not getMailboxLock) also avoids the latter's failed-open LIST probe.
        await client.mailboxOpen(folder.path, { readOnly: true });
        phase = "search";
        const uids = await client.search({ subject: tag }, { uid: true });
        if (!Array.isArray(uids)) throw new Error("search returned no result");
        let match = false;
        if (uids.length) {
          phase = "fetch";
          // Installed fetch compiler emits BODY.PEEK[HEADER.FIELDS (SUBJECT)], never a body/Seen write.
          for (const message of await client.fetchAll(uids.join(","), { uid: true, headers: ["SUBJECT"] }, { uid: true })) match ||= subjectHasTag(subjectFromHeaders(message.headers), id);
        }
        found.push(match);
      }
      rounds++;
      const outcome = roundOutcome(folders, found);
      if (outcome) return { outcome, detail: `Tagged message found in the configured ${outcome === "delivered-spam" ? "spam" : "inbox"} folder after ${seconds()} s.` };
      phase = "wait";
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, Math.max(0, Math.min(POLL_INTERVAL_MS, deadline - Date.now())));
        stop.signal.addEventListener("abort", () => { clearTimeout(timer); resolve(); }, { once: true });
      });
      if (stop.signal.aborted) throw new Error("stopped");
    }
  })();
  work.catch(silent);
  let timer: Timer | undefined;
  try {
    const expired = new Promise<"expired">((resolve) => { timer = setTimeout(() => resolve("expired"), timeoutMs); });
    const result = await Promise.race([work, expired]);
    if (result !== "expired") return result;
    return { outcome: "failed", detail: rounds ? `No message tagged ${tag} arrived in the configured folders within ${Math.round(timeoutMs / 1000)} s.` : `Mailbox check did not complete within ${Math.round(timeoutMs / 1000)} s (${phase}).` };
  } catch (error) {
    return { outcome: "failed", detail: failure(phase, error) };
  } finally {
    clearTimeout(timer);
    stop.abort();
    const remaining = Math.min(LOGOUT_MS, deadline - Date.now());
    if (client.usable && remaining > 0) await Promise.race([client.logout().catch(silent), Bun.sleep(remaining)]);
    client.close();
  }
}
