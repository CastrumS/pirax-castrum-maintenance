// Keep-alive heartbeat against the 60-day scheduled-workflow inactivity disable. On a clean checkout whose
// HEAD is fresh main, when main's last commit is at least 30 days old, rewrite only HEARTBEAT_PATH, commit
// it, recheck that main has not moved and push HEAD to main normally: no force, tag or release. Not due
// means no commit. Failures carry a fixed stage, never git stderr, paths or URLs.
//
// Usage: bun scripts/reaudit/heartbeat.ts --run   (in the workflow's disposable main checkout)
//   needs GH_TOKEN for the push: the checkout persists no credentials, and git asks gh (GIT_AUTH).
// Import-safe: nothing runs on import, and tests pass a local file:// remote.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export const HEARTBEAT_PATH = ".github/audit/heartbeat.txt";
export const HEARTBEAT_DUE_MS = 30 * 86_400_000;
/** Committer/runner clocks drift; a timestamp up to this far ahead counts as now rather than as malformed. */
export const CLOCK_SKEW_MS = 5 * 60_000;
const REMOTE = "https://github.com/CastrumS/pirax-castrum-maintenance.git";
const CHILD_TIMEOUT_MS = 120_000;

export class HeartbeatError extends Error {}

const INSTANT = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/;
/** Strict ISO-8601 instant with Z or ±hh:mm (at most ±23:59); calendar-invalid fields (Feb 30, hour 24) throw. */
export function parseInstant(text: string): number {
  const m = INSTANT.exec(text);
  if (!m) throw new RangeError("malformed timestamp");
  const [y, mo, d, h, mi, s] = m.slice(1, 7).map(Number) as [number, number, number, number, number, number];
  const local = Date.UTC(y, mo - 1, d, h, mi, s);
  const check = new Date(local);
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d || check.getUTCHours() !== h || check.getUTCMinutes() !== mi || check.getUTCSeconds() !== s) throw new RangeError("malformed timestamp");
  const offset = m[7] === "Z" ? 0 : (m[7]![0] === "-" ? -1 : 1) * (Number(m[7]!.slice(1, 3)) * 60 + Number(m[7]!.slice(4))) * 60_000;
  return local - offset + Number(`0${/\.\d+/.exec(text)?.[0] ?? ""}`) * 1000;
}

/** Pure: whether a heartbeat is due for a main whose last commit was at lastCommit. Future beyond skew or a nonfinite clock throws. */
export function heartbeatDue(lastCommit: string, now: number): boolean {
  if (!Number.isFinite(now)) throw new RangeError("clock is not a finite time");
  const age = now - parseInstant(lastCommit);
  if (age < -CLOCK_SKEW_MS) throw new RangeError("last commit timestamp is in the future");
  return age >= HEARTBEAT_DUE_MS;
}

/**
 * Plan D5: checkouts persist no credentials, so every git child authenticates explicitly. An empty helper resets any
 * configured one (nothing can store the token); then gh answers for github.com only, reading GH_TOKEN from the
 * child environment. No credential value is ever on argv or written to disk.
 */
export const GIT_AUTH = ["-c", "credential.helper=", "-c", "credential.https://github.com.helper=!gh auth git-credential"];
const CHILD_NAMES = ["PATH", "HOME", "USER", "LANG", "LC_ALL", "TMPDIR", "XDG_CONFIG_HOME", "GH_TOKEN", "GITHUB_TOKEN", "GH_HOST", "SSH_AUTH_SOCK"];
/** git/gh children get only an allowlist (repository token kept; mail, vendor and signing secrets dropped) and never prompt. */
export function safeChildEnv(env: Record<string, string | undefined> = process.env): Record<string, string> {
  const out: Record<string, string> = {};
  for (const name of CHILD_NAMES) if (env[name] !== undefined) out[name] = env[name]!;
  return { ...out, GIT_TERMINAL_PROMPT: "0", GH_PROMPT_DISABLED: "1" };
}

type HeartbeatOptions = { cwd: string; now: number; remoteUrl?: string; env?: Record<string, string | undefined>; beforeRecheck?: () => void };
export type HeartbeatResult = { outcome: "not-due" | "pushed"; base: string; commit?: string };

/** The operation for the final independent workflow job. Throws HeartbeatError with a fixed stage message. */
export function runHeartbeat({ cwd, now, remoteUrl = REMOTE, env = process.env, beforeRecheck }: HeartbeatOptions): HeartbeatResult {
  if (!Number.isFinite(now)) throw new HeartbeatError("heartbeat: refusing a nonfinite clock");
  const childEnv = safeChildEnv(env);
  const git = (stage: string, args: string[]) => {
    const p = Bun.spawnSync(["git", ...GIT_AUTH, "-c", "core.hooksPath=/dev/null", ...args], { cwd, env: childEnv, stdout: "pipe", stderr: "pipe", timeout: CHILD_TIMEOUT_MS });
    if (p.exitCode !== 0) throw new HeartbeatError(`heartbeat: git ${stage} failed (exit ${p.exitCode ?? "timeout"})`);
    // trimEnd, not trim: porcelain status lines start with a significant space (" M path").
    return p.stdout.toString().trimEnd();
  };
  const status = () => git("status", ["status", "--porcelain", "--untracked-files=all"]);
  if (status() !== "") throw new HeartbeatError("heartbeat: refusing a dirty checkout");
  const branch = git("branch", ["branch", "--show-current"]);
  if (branch !== "" && branch !== "main") throw new HeartbeatError("heartbeat: refusing a checkout on a branch other than main");
  git("fetch", ["fetch", "--no-tags", "--quiet", remoteUrl, "refs/heads/main"]);
  const base = git("rev-parse", ["rev-parse", "--verify", "FETCH_HEAD^{commit}"]);
  if (git("rev-parse", ["rev-parse", "--verify", "HEAD^{commit}"]) !== base) throw new HeartbeatError("heartbeat: HEAD is not fresh main");
  let due: boolean;
  try { due = heartbeatDue(git("log", ["log", "-1", "--format=%cI", base]), now); }
  catch (e) { throw e instanceof HeartbeatError ? e : new HeartbeatError("heartbeat: main's last commit time is malformed or in the future"); }
  if (!due) return { outcome: "not-due", base };

  const file = join(cwd, HEARTBEAT_PATH);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${new Date(now).toISOString()}\n`);
  const changed = status().split("\n").map((line) => line.slice(3));
  if (changed.length !== 1 || changed[0] !== HEARTBEAT_PATH) throw new HeartbeatError("heartbeat: refusing changes outside the heartbeat file");
  git("add", ["add", "--", HEARTBEAT_PATH]);
  const identity = ["-c", "user.name=github-actions[bot]", "-c", "user.email=41898282+github-actions[bot]@users.noreply.github.com", "-c", "commit.gpgsign=false"];
  git("commit", [...identity, "commit", "--quiet", "--no-verify", "-m", "chore: audit schedule heartbeat"]);
  const commit = git("rev-parse", ["rev-parse", "HEAD"]);
  beforeRecheck?.();
  const remoteMain = git("ls-remote", ["ls-remote", "--exit-code", remoteUrl, "refs/heads/main"]).split(/\s/)[0];
  if (remoteMain !== base) throw new HeartbeatError("heartbeat: main advanced since fetch; not pushed");
  git("push", ["push", "--quiet", "--no-verify", remoteUrl, "HEAD:refs/heads/main"]);
  return { outcome: "pushed", base, commit };
}

if (import.meta.main) {
  if (process.argv.slice(2).join(" ") !== "--run") {
    console.error("usage: bun scripts/reaudit/heartbeat.ts --run");
    process.exit(2);
  }
  try {
    console.log(JSON.stringify(runHeartbeat({ cwd: process.cwd(), now: Date.now() })));
  } catch (e) {
    console.error(e instanceof HeartbeatError ? e.message : "heartbeat: failed");
    process.exit(1);
  }
}
