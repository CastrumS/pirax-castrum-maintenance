// Re-audit privacy boundary (plan D5/D10), shared by run.ts and publish.ts:
//   secretValues(env, extra?)      every known credential value (plus run-private values such as ZIP paths)
//   scopedEnv(env, names, extra?)  a child's whole environment: a small base allowlist plus the named inputs
//   bunCommand(...args)            Bun with --no-env-file, so a local .env can never refill a filtered environment
//   sanitizeLine(line, secrets)    redact secrets (raw/URL/JSON forms) and URL credentials/queries, then rescan
//   runChild(cmd, options)         bounded child; every output line is sanitized and rescanned before it is
//                                  echoed or written to the log
//   scanEvidence(dir, secrets)     findSecret over files and ZIP entries; files with a hit are withheld (deleted)
// A clean scan is known-secret evidence only, not proof that nothing private was retained.
// Import-safe; no dependencies outside this repository.
import { appendFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { findSecret, redact, REDACTED } from "../../test/plugin/artifacts.ts";

type Env = Record<string, string | undefined>;

export const SECRET_NAMES = [
  "GPLVAULT_LICENSE_KEY",
  "GPLVAULT_PRODUCT_ID",
  "GPLVAULT_UPDATER_PASSPHRASE",
  "IMAP_USER",
  "IMAP_PASSWORD",
  "PIRAX_HELPER_SIGNING_KEY",
  "FORM_TEST_TOKEN",
  "GRAVITY_FORMS_ZIP",
  "FLUENT_FORMS_PRO_ZIP",
  "GH_TOKEN",
  "GITHUB_TOKEN",
] as const;
/** The fixed notice recipient (notify.ts RECIPIENT) is public task data, not a secret username. */
const PUBLIC_ADDRESS = "piraxcastrum@gmail.com";
const BASE_ENV = ["PATH", "HOME", "USER", "LANG", "LC_ALL", "TMPDIR", "XDG_CONFIG_HOME", "XDG_CACHE_HOME", "CI", "GITHUB_ACTIONS", "PLAYWRIGHT_BROWSERS_PATH"];

export function secretValues(env: Env, extra: string[] = []): string[] {
  const values = SECRET_NAMES.flatMap((name) => (env[name] && !(name === "IMAP_USER" && env[name] === PUBLIC_ADDRESS) ? [env[name]!] : []));
  return [...new Set([...values, ...extra.filter(Boolean)])];
}

/** The base allowlist present in env, plus each named input (which must be set), plus extra values. */
export function scopedEnv(env: Env, names: string[], extra: Record<string, string> = {}): Record<string, string> {
  const out: Record<string, string> = {};
  for (const name of BASE_ENV) if (env[name] !== undefined) out[name] = env[name]!;
  for (const name of names) {
    if (!env[name]) throw new Error(`${name} is not set`);
    out[name] = env[name]!;
  }
  return { ...out, ...extra };
}

export const bunCommand = (...args: string[]) => [process.execPath, "--no-env-file", ...args];

/** URL userinfo, query and fragment removed: a vendor or signed URL keeps only its host and path. */
const URL_PATTERN = /\b(https?:\/\/)(?:[^\s/?#@"'<>]*@)?([^\s/?#"'<>]+[^\s?#"'<>]*)([?#][^\s"'<>]*)?/g;
export function sanitizeLine(line: string, secrets: string[]): string {
  const text = redact(line, secrets).text.replace(URL_PATTERN, (_m, scheme: string, rest: string, query?: string) => `${scheme}${rest}${query ? `?${REDACTED}` : ""}`);
  return redact(text, secrets).count ? REDACTED : text;
}

type ChildOptions = { cwd: string; env: Record<string, string>; secrets: string[]; log: string; timeoutMs: number; echo?: (line: string) => void };
/** Runs cmd with exactly env; returns its exit code and sanitized output. Raw output is never stored or printed. */
export async function runChild(cmd: string[], { cwd, env, secrets, log, timeoutMs, echo = (l) => console.log(l) }: ChildOptions) {
  const proc = Bun.spawn(cmd, { cwd, env, stdin: "ignore", stdout: "pipe", stderr: "pipe" });
  let timedOut = false;
  const timer = setTimeout(() => ((timedOut = true), proc.kill("SIGTERM"), setTimeout(() => proc.kill("SIGKILL"), 10_000).unref()), timeoutMs);
  const lines: string[] = [];
  let pending = Promise.resolve();
  const emit = (raw: string) => {
    const line = sanitizeLine(raw, secrets);
    lines.push(line);
    echo(line);
    pending = pending.then(() => appendFile(log, `${line}\n`));
  };
  const pump = async (stream: ReadableStream<BufferSource>) => {
    let buffer = "";
    for await (const chunk of stream.pipeThrough(new TextDecoderStream())) {
      const parts = (buffer + chunk).split("\n");
      buffer = parts.pop()!;
      parts.forEach(emit);
    }
    if (buffer) emit(buffer);
  };
  await Promise.all([pump(proc.stdout), pump(proc.stderr), proc.exited]);
  clearTimeout(timer);
  await pending;
  return { code: timedOut ? null : proc.exitCode, timedOut, output: lines.join("\n") + (lines.length ? "\n" : "") };
}

/** Files under dir (ZIP entries as `zip!entry`) holding a secret; every such file is deleted before returning. */
export async function scanEvidence(dir: string, secrets: string[]): Promise<string[]> {
  const hits = await findSecret(dir, secrets);
  for (const hit of new Set(hits.map((h) => h.split("!")[0]!))) await rm(join(dir, hit), { force: true });
  return hits;
}
