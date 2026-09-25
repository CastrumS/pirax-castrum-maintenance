// Run with Node, never Bun: PHP WASM requires Node's runtime. Control stays on stdin.
import { readFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { runCLI } from "@wp-playground/cli";
import { wpCLI, type BlueprintV1Declaration } from "@wp-playground/blueprints";

const reply = (value: unknown) => process.stdout.write(`VISUAL ${JSON.stringify(value)}\n`);
const blueprint = JSON.parse(readFileSync(new URL("./blueprint.json", import.meta.url), "utf8")) as BlueprintV1Declaration;
// No R2 environment is passed to this process. Only sanitized protocol replies are retained.
const server = await runCLI({ command: "server", port: Number(process.argv[2]), wp: "6.8.3", php: "8.3", blueprint, workers: 1, quiet: true });
try {
  // This CLI release initially binds all interfaces; confine the disposable fixture before readiness.
  await new Promise<void>((resolve, reject) => server.server.close(e => e ? reject(e) : resolve()));
  await new Promise<void>((resolve, reject) => server.server.listen(Number(process.argv[2]), "127.0.0.1", resolve).once("error", reject));
  await server.playground.mkdir("/wordpress/wp-content/mu-plugins");
  const plugin = readFileSync(new URL("./fixture-plugin.php", import.meta.url), "utf8");
  await server.playground.writeFile("/wordpress/wp-content/mu-plugins/visual-fixture.php", plugin);
  if (await server.playground.readFileAsText("/wordpress/wp-content/mu-plugins/visual-fixture.php") !== plugin) throw new Error("Fixture plugin bytes differ after installation");
  reply({ ready: true, url: server.serverUrl });
  for await (const line of createInterface({ input: process.stdin })) {
    const request = JSON.parse(line);
    try {
      if (request.op === "stop") { reply({ id: request.id, ok: true }); break; }
      if (request.op === "counts") {
        const value = await server.playground.readFileAsText("/tmp/visual-counts.json");
        reply({ id: request.id, ok: true, value: JSON.parse(value) });
      } else {
        const response = await wpCLI(server.playground, { command: request.command });
        reply({ id: request.id, ok: response.exitCode === 0, value: response.text });
      }
    } catch { reply({ id: request.id, ok: false }); }
  }
} finally {
  await server[Symbol.asyncDispose]();
}
