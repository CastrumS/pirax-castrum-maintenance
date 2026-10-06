// Node-side throwaway WordPress with real networking and only GPL Vault's official updater installed
// (plan D4), spawned by fetch.ts. Runs under Node for the same reason as test/plugin/playground.ts
// (erasable TS only). Protocol: stdout lines prefixed with MARK are JSON messages; stdin takes one JSON
// {id, code, credentials?} per line and answers via playground.run(). The parent drives every lifecycle
// step and owns cleanup, so catchable signals are ignored here: the parent ends this process by closing stdin.
// Inputs come only from the environment: PIRAX_GPLVAULT_UPDATER_ZIP (decrypted ZIP, read once at boot) and
// GPLVAULT_LICENSE_KEY / GPLVAULT_PRODUCT_ID, which reach PHP as request environment only when asked for.
import { readFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { runCLI } from "@wp-playground/cli";

const MARK = "@@pirax-gplvault@@";
const config: { wp: string; php: string } = JSON.parse(process.argv[2]!);
const send = (message: object) => process.stdout.write(`${MARK}${JSON.stringify(message)}\n`);
for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) process.on(signal, () => {});

const zip = process.env.PIRAX_GPLVAULT_UPDATER_ZIP;
if (!zip) throw new Error("PIRAX_GPLVAULT_UPDATER_ZIP is not set");
const credentials = {
  GPLVAULT_LICENSE_KEY: process.env.GPLVAULT_LICENSE_KEY ?? "",
  GPLVAULT_PRODUCT_ID: process.env.GPLVAULT_PRODUCT_ID ?? "",
};

const server = await runCLI({
  command: "server",
  port: 0,
  quiet: true,
  php: config.php as any,
  wp: config.wp,
  blueprint: {
    features: { networking: true },
    // No cron: nothing runs except the parent's requests. The updater's own log stays off.
    constants: { DISABLE_WP_CRON: true, GPLVAULT_DISABLE_LOG: true },
    steps: [
      {
        step: "installPlugin",
        pluginData: { resource: "literal", name: "gplvault-updater.zip", contents: new Uint8Array(readFileSync(zip)) },
        options: { activate: true },
      },
    ],
  } as any,
});
send({ ready: true });

let stopping = false;
const input = createInterface({ input: process.stdin });
input.on("close", async () => {
  if (stopping) return;
  stopping = true;
  await server[Symbol.asyncDispose]();
  process.exit(0);
});
input.on("line", async (line) => {
  const { id, code, credentials: withCredentials } = JSON.parse(line);
  try {
    const result = await server.playground.run({ code, ...(withCredentials && { env: credentials }) });
    send({ id, text: result.text });
  } catch {
    send({ id, failed: true });
  }
});
