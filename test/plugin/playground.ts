// Node-side WordPress Playground process, spawned by harness.ts. Bun cannot load the native
// fs-ext module @wp-playground/cli needs, so this runs under Node (type stripping, erasable TS only).
// Protocol: lines on stdout prefixed with MARK are JSON messages; stdin takes one JSON
// {id, code} per line and answers via playground.run(), the CLI's own PHP execution API.
import { readFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { runCLI } from "@wp-playground/cli";

const MARK = "@@pirax-playground@@";
const config: { ffZip: string; muPlugin: string; wp: string; php: string } = JSON.parse(process.argv[2]!);
const send = (message: object) => process.stdout.write(`${MARK}${JSON.stringify(message)}\n`);
const literal = (name: string, path: string) => ({
  resource: "literal",
  name,
  contents: new Uint8Array(readFileSync(path)),
});

// GRAVITY_FORMS_ZIP is read here, never passed on the command line (it would show in process lists).
const gfZip = process.env.GRAVITY_FORMS_ZIP;
if (!gfZip) throw new Error("GRAVITY_FORMS_ZIP is not set");

const server = await runCLI({
  command: "server",
  port: 0,
  quiet: true,
  php: config.php as any,
  wp: config.wp,
  blueprint: {
    // Queues are driven explicitly by the harness in separate HTTP requests.
    constants: { DISABLE_WP_CRON: true },
    steps: [
      { step: "installPlugin", pluginData: literal("gravityforms.zip", gfZip), options: { activate: true } },
      { step: "installPlugin", pluginData: literal("fluentform.zip", config.ffZip), options: { activate: true } },
      {
        step: "writeFile",
        path: "/wordpress/wp-content/mu-plugins/pirax-harness.php",
        data: readFileSync(config.muPlugin, "utf8"),
      },
    ],
  } as any,
});
send({ ready: server.serverUrl });

let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  await server[Symbol.asyncDispose]();
  process.exit(0);
}
process.on("SIGTERM", stop);
process.on("SIGINT", stop);

const input = createInterface({ input: process.stdin });
input.on("close", stop);
input.on("line", async (line) => {
  const { id, code } = JSON.parse(line);
  try {
    const result = await server.playground.run({ code });
    send({ id, text: result.text, exitCode: result.exitCode, errors: result.errors });
  } catch (error) {
    send({ id, error: error instanceof Error ? error.message : String(error) });
  }
});
