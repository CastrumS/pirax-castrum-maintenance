import { mkdirSync } from "node:fs";
import { join } from "node:path";

export function startHttpsFixture(runDir: string) {
  const certDir = join(runDir, "tls");
  mkdirSync(certDir, { recursive: true });
  const generated = Bun.spawnSync(["openssl", "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1", "-subj", "/CN=127.0.0.1", "-addext", "subjectAltName=IP:127.0.0.1", "-keyout", join(certDir, "key.pem"), "-out", join(certDir, "cert.pem")], { stdout: "pipe", stderr: "pipe" });
  if (generated.exitCode !== 0) throw new Error("HTTPS fixture certificate generation failed");
  const http = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response("", { headers: { "content-type": "text/javascript" } }) });
  try {
    const resource = `http://127.0.0.1:${http.port}/mixed.js`;
    const https = Bun.serve({ hostname: "127.0.0.1", port: 0, tls: { cert: Bun.file(join(certDir, "cert.pem")), key: Bun.file(join(certDir, "key.pem")) }, fetch: () => new Response(`<!doctype html><link rel="icon" href="data:,"><h1>Mixed content fixture</h1><script src="${resource}"></script>`, { headers: { "content-type": "text/html" } }) });
    return { url: `https://127.0.0.1:${https.port}`, resource, stop() { https.stop(true); http.stop(true); } };
  } catch (e) { http.stop(true); throw e; }
}
