import { describe, expect, test } from "bun:test";
import type { Socket } from "bun";
import { connect as tcpConnect, type Socket as ClientSocket } from "node:net";
import { ImapFlow } from "imapflow";
import { createRequire } from "node:module";
import * as mail from "../../src/mail/imap.ts";
import type { ImapConfig } from "../../src/mail/config.ts";
import { deliveryFolders, pollDelivery, roundOutcome, subjectHasTag, subjectTag, summarizeCommand } from "../../src/mail/imap.ts";

// Deadline, TLS-downgrade and cleanup behaviour against real local TCP peers. Authenticated
// matching and read-only proof are only claimed by the real mailbox selftest, never by a mock server.
const id = "abc123def456";
const secret = "synthetic-password-value";
const HOST = "127.0.0.1";
const config = (port: number): ImapConfig => ({ host: HOST, port, secure: false, user: "synthetic-user", password: secret, folder: "Tests", spamFolder: "Spam" });

type Peer = { port: number; received: string[]; open: () => number; connections: () => number; owned: () => number; stop: () => void };
function peer(onOpen: (socket: Socket<undefined>) => void, onLine: (socket: Socket<undefined>, line: string) => void = () => {}): Peer {
  const received: string[] = [];
  const live = new Map<Socket<undefined>, number>();
  const ports = new Set<number>();
  const clients = new Set<ClientSocket>();
  let connections = 0;
  const server = Bun.listen<undefined>({
    hostname: HOST, port: 0,
    socket: {
      open(socket) { connections++; live.set(socket, socket.remotePort); onOpen(socket); },
      data(socket, data) { for (const line of data.toString().split("\r\n").filter(Boolean)) { received.push(line); onLine(socket, line); } },
      close(socket) { live.delete(socket); },
      error(socket) { live.delete(socket); },
    },
  });
  // The local moshi-hook service opens unsolicited idle probes on IPv4 AND IPv6 listeners.
  // Observe the real installed connect() without replacing its transport/auth/results. Pair its
  // actual local endpoint with the peer, rather than counting another process's TCP connection
  // as an IMAP leak. Also require the actual client close event, strengthening the old assertion.
  // Tests are sequential; restore the observer in every finally via stop().
  const connect = ImapFlow.prototype.connect;
  ImapFlow.prototype.connect = function () {
    const result = connect.call(this);
    const socket = (this as unknown as { socket?: ClientSocket }).socket;
    if (socket) {
      clients.add(socket);
      socket.once('connect', () => { if (socket.localPort) ports.add(socket.localPort); });
      socket.once('close', () => clients.delete(socket));
    }
    return result;
  };
  return { port: server.port, received,
    open: () => [...live.values()].filter(port => ports.has(port)).length + clients.size,
    connections: () => connections, owned: () => ports.size,
    stop: () => { ImapFlow.prototype.connect = connect; server.stop(true); },
  };
}
/** Server-side close events are asynchronous; allow a short bound rather than a fixed sleep. */
async function closed(server: Peer) {
  for (let i = 0; i < 40 && server.open(); i++) await Bun.sleep(50);
  return server.open();
}

describe("pollDelivery input and deadline", () => {
  test("rejects non-canonical IDs and deadlines before any network access", async () => {
    const server = peer(() => {});
    try {
      for (const bad of ["abc123", "ABC123DEF456", "abc123def4567", "abc123def45!", ""]) await expect(pollDelivery({ id: bad, config: config(server.port) })).rejects.toThrow(/submission id/);
      for (const timeoutMs of [0, -1, 1.5, 300_001, Number.NaN]) await expect(pollDelivery({ id, config: config(server.port), timeoutMs })).rejects.toThrow(/timeout/);
      expect(server.connections()).toBe(0);
    } finally { server.stop(); }
  });

  test("a silent server cannot outlive the deadline; the connection is closed and not reported as absent mail", async () => {
    const server = peer(() => {}); // accepts TCP, never greets
    // Deterministic reproduction of an unrelated service probe, not an IMAP/authentication mock.
    const probe = tcpConnect(server.port, HOST);
    await new Promise<void>((resolve, reject) => { probe.once('connect', resolve); probe.once('error', reject); });
    try {
      const started = performance.now();
      const result = await pollDelivery({ id, config: config(server.port), timeoutMs: 1_500 });
      const elapsed = performance.now() - started;
      expect(result.outcome).toBe("failed");
      expect(result.detail).toMatch(/did not complete/);
      expect(result.detail).not.toMatch(/no message/i);
      expect(elapsed).toBeGreaterThanOrEqual(1_450);
      expect(elapsed).toBeLessThan(2_500);
      expect(server.owned()).toBe(1); // pairing must not silently miss the client's connection
      expect(server.connections()).toBeGreaterThanOrEqual(2);
      expect(await closed(server)).toBe(0);
      expect(probe.destroyed).toBe(false); // the foreign connection is not mislabeled or closed
    } finally { probe.destroy(); server.stop(); }
  });

  test("STARTTLS is required off port 993: no credentials are ever sent in plaintext", async () => {
    const server = peer(socket => socket.write("* OK IMAP4rev1 ready\r\n"), (socket, line) => {
      const [tag, verb] = line.split(" ");
      if (verb?.toUpperCase() === "CAPABILITY") socket.write(`* CAPABILITY IMAP4rev1 AUTH=PLAIN\r\n${tag} OK done\r\n`);
      else if (verb?.toUpperCase() === "ID") socket.write(`* ID NIL\r\n${tag} OK done\r\n`);
      else socket.write(`${tag} OK done\r\n`);
    });
    try {
      const result = await pollDelivery({ id, config: config(server.port), timeoutMs: 5_000 });
      expect(result.outcome).toBe("failed");
      expect(result.detail).toMatch(/connect/);
      expect(server.received.some(line => /\b(LOGIN|AUTHENTICATE)\b/i.test(line))).toBe(false);
      expect(server.received.join("\n")).not.toContain(secret);
      expect(server.owned()).toBe(1);
      expect(await closed(server)).toBe(0);
    } finally { server.stop(); }
  });

  test("refused and dropped connections are explicit sanitized failures", async () => {
    const closed = peer(socket => socket.end());
    const port = closed.port;
    try {
      const dropped = await pollDelivery({ id, config: config(port), timeoutMs: 5_000 });
      expect(dropped.outcome).toBe("failed");
      expect(dropped.detail).toMatch(/^IMAP connect failed/);
    } finally { closed.stop(); }
    const refused = await pollDelivery({ id, config: config(port), timeoutMs: 5_000 });
    expect(refused.outcome).toBe("failed");
    expect(refused.detail).toMatch(/^IMAP connect failed/);
    for (const detail of [refused.detail]) for (const value of [secret, "synthetic-user", HOST, String(port), "Tests", "Spam"]) expect(detail).not.toContain(value);
  });
});

describe("installed ImapFlow contract (pure command/encoding diagnostics, not authentication)", () => {
  const require = createRequire(import.meta.url);
  for (const build of ["esm", "cjs"] as const) {
    const load = async (part: string) => build === "esm" ? await import(`imapflow/lib/${part}.js`) : require(`imapflow/lib/${part}.js`);
    test(`${build}: startup discovery is opt-in suppressed, including no-NAMESPACE LIST fallback`, async () => {
      const namespace = (await load("commands/namespace")).default;
      // Execute ONLY the installed post-auth namespace block. No connection, authentication,
      // fake login or server: this diagnostic cannot establish successful authentication.
      const source = await Bun.file(`node_modules/imapflow/dist/${build}/imap-flow.js`).text();
      const block = source.slice(source.indexOf("// Make sure we have namespace set."), source.indexOf("if (this.options.verifyOnly)"));
      expect(block).toContain("NAMESPACE");
      const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
      for (const supported of [true, false]) for (const literalMailboxes of [true, false]) {
        const calls: string[] = [];
        const client: any = {
          options: { literalMailboxes }, states: { AUTHENTICATED: 1, SELECTED: 2 }, state: 1,
          capabilities: new Map(supported ? [["NAMESPACE", true]] : []), enabled: new Set(), log: { warn() {} },
          exec: async (verb: string) => { calls.push(verb); return { next() {} }; },
        };
        client.run = async () => namespace(client);
        await new AsyncFunction(block).call(client);
        expect(calls).toEqual(literalMailboxes ? [] : [supported ? "NAMESPACE" : "LIST"]);
      }
    });
    test(`${build}: literal EXAMINE skips metadata LIST, preserves encoding and has no failed-open fallback`, async () => {
      const select = (await load("commands/select")).default;
      const { decodePath } = await load("tools");
      for (const literalMailboxes of [true, false]) for (const utf8 of [false, true]) for (const path of ["Tests", "Spam", "inbox", "Test mail", "Žuta pošta & test"]) {
        const calls: string[] = [];
        const client: any = {
          options: { literalMailboxes }, states: { AUTHENTICATED: 1, SELECTED: 2 }, state: 1,
          namespace: { prefix: "INBOX.", delimiter: "." }, folders: new Map(), enabled: new Set(utf8 ? ["UTF8=ACCEPT"] : []),
          capabilities: new Map(), emit() {}, log: { warn() {} },
          run: async (verb: string) => { calls.push(verb); return []; },
          exec: async (verb: string, args: any[]) => {
            calls.push(verb);
            const expected = literalMailboxes ? path : path === "inbox" ? "INBOX" : `INBOX.${path}`;
            expect(decodePath(client, args[0].value)).toBe(expected);
            return { response: {}, next() {} };
          },
        };
        const box = await select(client, path, { readOnly: true });
        expect(box.path).toBe(literalMailboxes ? path : path === "inbox" ? "INBOX" : `INBOX.${path}`);
        expect(calls).toEqual(literalMailboxes ? ["EXAMINE"] : ["LIST", "EXAMINE"]);
        calls.length = 0;
        client.exec = async (verb: string) => { calls.push(verb); throw new Error("synthetic missing folder"); };
        await expect(select(client, path, { readOnly: true })).rejects.toThrow("synthetic missing folder");
        expect(calls).toEqual(literalMailboxes ? ["EXAMINE"] : ["LIST", "EXAMINE"]);
      }
    });
    test(`${build}: installed fetch compiler requests only candidate UID and Subject PEEK`, async () => {
      const fetch = (await load("commands/fetch")).default;
      const calls: unknown[] = [];
      const client: any = {
        states: { SELECTED: 2 }, state: 2, mailbox: {}, capabilities: new Map(), enabled: new Set(),
        exec: async (verb: string, args: unknown[]) => { calls.push([verb, args]); return { next() {} }; },
      };
      await fetch(client, "41,42", { uid: true, headers: ["SUBJECT"] }, { uid: true });
      expect(calls).toEqual([["UID FETCH", [
        { type: "SEQUENCE", value: "41,42" },
        [{ type: "ATOM", value: "UID" }, { type: "ATOM", value: "BODY.PEEK", section: [{ type: "ATOM", value: "HEADER.FIELDS" }, [{ type: "ATOM", value: "SUBJECT" }]], partial: undefined }],
      ]]]);
    });
  }
  test("unfolds and MIME-decodes one Subject, rejecting malformed/duplicate fields and near tags", () => {
    const decode = (mail as any).subjectFromHeaders;
    expect(typeof decode).toBe("function");
    const text = `${subjectTag(id)} Nova poruka – Kontakt`;
    const encoded = `=?UTF-8?B?${Buffer.from(text).toString("base64")}?=`;
    for (const value of [text, encoded, "=?UTF-8?Q?=5Bpirax-test_abc123def456=5D?=\r\n\t=?UTF-8?Q?_Nova_poruka?="]) {
      expect(subjectHasTag(decode(Buffer.from(`Subject: ${value}\r\n\r\n`)), id)).toBe(true);
    }
    for (const value of [undefined, "", `X-Other: ${text}\r\n\r\n`, `Subject: no\r\nX-Other: ${text}\r\n\r\n`,
      `Subject: no\r\nSubject: ${text}\r\n\r\n`, `Subject: ${text}\r\nsubject: no\r\n\r\n`,
      `Subject: ${text}\n\n`, `Subject: ${text}\r\n\r\nbody`, `Subject: ${text}\0\r\n\r\n`,
      "Subject: =?UTF-8?Q?=5BPIRAX-TEST_abc123def456=5D?=\r\n\r\n", "Subject: [pirax-test abc123def4567]\r\n\r\n"]) {
      expect(subjectHasTag(decode(value === undefined ? undefined : Buffer.from(value)), id)).toBe(false);
    }
  });
});

describe("tag matching and folder policy", () => {
  test("rechecks the exact tag because IMAP SUBJECT search is a case-insensitive substring match", () => {
    expect(subjectTag(id)).toBe("[pirax-test abc123def456]");
    expect(subjectHasTag("[pirax-test abc123def456] New enquiry", id)).toBe(true);
    expect(subjectHasTag("[SPAM] [pirax-test abc123def456] Nova poruka – Kontakt", id)).toBe(true);
    for (const subject of ["[pirax-test abc123def4567] x", "[pirax-test xabc123def456] x", "[PIRAX-TEST abc123def456] x", "[pirax-test ABC123DEF456] x", "pirax-test abc123def456", "", undefined])
      expect(subjectHasTag(subject, id)).toBe(false);
  });
  test("equal configured names are opened once and treated conservatively as spam", () => {
    expect(deliveryFolders({ ...config(1), folder: "Tests", spamFolder: "Spam" })).toEqual([{ path: "Tests", spam: false }, { path: "Spam", spam: true }]);
    expect(deliveryFolders({ ...config(1), folder: "Tests", spamFolder: "Tests" })).toEqual([{ path: "Tests", spam: true }]);
  });
  test("a match in both folders favors spam; no match waits", () => {
    const folders = deliveryFolders(config(1));
    expect(roundOutcome(folders, [true, true])).toBe("delivered-spam");
    expect(roundOutcome(folders, [false, true])).toBe("delivered-spam");
    expect(roundOutcome(folders, [true, false])).toBe("delivered");
    expect(roundOutcome(folders, [false, false])).toBeNull();
  });
  test("protocol evidence keeps only command names and fetch data items", () => {
    expect(summarizeCommand('A2 LOGIN "synthetic-user" "synthetic-password-value"')).toBe("LOGIN");
    expect(summarizeCommand('A7 EXAMINE "Tests"')).toBe("EXAMINE");
    expect(summarizeCommand('A8 UID SEARCH SUBJECT "[pirax-test abc123def456]"')).toBe("UID SEARCH");
    expect(summarizeCommand("A9 UID FETCH 41,42 (UID ENVELOPE MODSEQ)")).toBe("UID FETCH (UID ENVELOPE MODSEQ)");
    expect(summarizeCommand("A9 UID FETCH 41 (UID FLAGS BODY.PEEK[HEADER.FIELDS (SUBJECT)])")).toBe("UID FETCH (UID FLAGS BODY.PEEK[HEADER.FIELDS (SUBJECT)])");
    expect(summarizeCommand("A9 FETCH 1:* BODY[]")).toBe("FETCH (BODY[])");
    expect(summarizeCommand("(* 12B continuation *)")).toBeNull();
    expect(summarizeCommand("dGVzdA==")).toBeNull();
  });
});
