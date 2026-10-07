// Publisher (plan D7) against a disposable checkout of the shipping scripts/helper source with a TEST signing key,
// a local bare git remote standing in for origin/main, and a gh wrapper on PATH. The wrapper forwards only exact
// read-only lookups to the real authenticated gh while no fake remote state exists; every mutation (ref claim,
// release create) is intercepted and recorded, and later reads of that synthetic release are answered from it.
// Nothing here creates a real ref, tag, release or main commit. Remote states seeded by the wrapper are SYNTHETIC.
// bun --no-env-file test tests/reaudit-publish.test.ts   (needs network and an authenticated gh, like release.test.ts)
import { afterAll, expect, setDefaultTimeout, test } from "bun:test";
import { chmod, cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { buildPlugin, FILES, withoutSigningKey } from "/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/worktrees/reaudit-job/scripts/build-plugin";
import { readAuditedVersions, readHelperVersion } from "/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/worktrees/reaudit-job/scripts/plugin-source";
import { bumpSources, changesDigest, planBump, readBumpSources, BUMP_FILES } from "/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/worktrees/reaudit-job/scripts/reaudit/bump";
import { decideAudit, type Candidate } from "/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/worktrees/reaudit-job/scripts/reaudit/decide";
import { GIT_AUTH } from "/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/worktrees/reaudit-job/scripts/reaudit/heartbeat";
import { parseFailureSummary } from "/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/worktrees/reaudit-job/scripts/reaudit/notify";
import { publish, PublishError, verifyRelease } from "/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/worktrees/reaudit-job/scripts/reaudit/publish";
import { testKey } from "/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/worktrees/reaudit-job/test/plugin/update-fixture";

setDefaultTimeout(120_000);
const ROOT = "/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/worktrees/reaudit-job";
const REPO = "CastrumS/pirax-castrum-maintenance";
const PRODUCTION_KEY = "D8BfOn8TZC3jD+Hv5Q+p7SGPNGIYISVcMCqQWU0Dh9w=";
const REAL_GH = Bun.which("gh")!;
const RUN = "4242424242";
const ATTEMPT = "3";
const GIT = ["-c", "user.name=Publish Test", "-c", "user.email=publish@test.invalid", "-c", "commit.gpgsign=false", "-c", "core.hooksPath=/dev/null"];
const scratch = await mkdtemp(join(tmpdir(), "reaudit-publish-"));
afterAll(() => rm(scratch, { recursive: true, force: true }));

const git = (cwd: string, ...args: string[]) => {
  const p = Bun.spawnSync(["git", ...GIT, ...args], { cwd, env: withoutSigningKey(), stdout: "pipe", stderr: "pipe" });
  if (p.exitCode !== 0) throw new Error(`git ${args[0]} failed`);
  return p.stdout.toString().trim();
};

const WRAPPER = `#!/bin/sh
S="\${0%/*}/state"
# Stand-in token for the publisher's git children only; real read-only lookups keep the operator's gh auth.
[ "$GH_TOKEN" = synthetic-unused-gh-token ] && unset GH_TOKEN
printf '%s\\n' "$@" --- >> "$S/calls"
tag_of() { printf '%s' "\${1##*/}"; }
if [ "$1" = api ] && [ "$2" = --include ] && [ "$#" = 3 ]; then
  case "$3" in
    repos/${REPO}/git/ref/tags/*)
      if [ -f "$S/tag" ]; then printf 'HTTP/2.0 200 OK\\n\\n{"ref":"refs/tags/%s","object":{"type":"commit","sha":"%s"}}\\n' "$(tag_of "$3")" "$(cat "$S/tag")"; exit 0; fi
      exec "$REAL_GH" "$@";;
    repos/${REPO}/releases/tags/*|repos/${REPO}/releases/latest)
      if [ -f "$S/release.json" ]; then printf 'HTTP/2.0 200 OK\\n\\n'; cat "$S/release.json"; exit 0; fi
      exec "$REAL_GH" "$@";;
  esac
fi
if [ "$1" = api ] && [ "$2" = --paginate ] && [ "$#" = 5 ] && [ "$4" = --jq ] && [ "$5" = '.[].tag_name' ]; then
  if [ -f "$S/release.json" ]; then sed -n 's/.*"tag_name":"\\([^"]*\\)".*/\\1/p' "$S/release.json"; exit 0; fi
  exec "$REAL_GH" "$@"
fi
if [ "$1" = api ] && [ "$2" = --method ] && [ "$3" = POST ]; then
  for a in "$@"; do case "$a" in sha=*) printf '%s' "\${a#sha=}" > "$S/tag";; esac; done
  echo '{"synthesized":true}'; exit 0
fi
if [ "$1" = release ] && [ "$2" = create ]; then
  [ -f "$S/fail-release" ] && { echo 'HTTP 502: Bad Gateway' >&2; exit 1; }
  mkdir -p "$S/assets"
  for a in "$@"; do case "$a" in /*) cp "$a" "$S/assets/";; esac; done
  [ -f "$S/tamper-manifest" ] && sed -i 's/"version": "/"version": "9/' "$S/assets/pirax-form-test-manifest.json"
  printf '{"tag_name":"%s","draft":false,"prerelease":false,"assets":[{"name":"pirax-form-test-manifest.json"},{"name":"pirax-form-test-manifest.json.sig"},{"name":"pirax-form-test.zip"}]}\\n' "$3" > "$S/release.json"
  echo '{"synthesized":true}'; exit 0
fi
if [ "$1" = release ] && [ "$2" = download ]; then
  dir=""; prev=""; for a in "$@"; do [ "$prev" = --dir ] && dir="$a"; prev="$a"; done
  [ -d "$S/assets" ] || { echo 'release not found' >&2; exit 1; }
  cp "$S/assets/"* "$dir/"; exit 0
fi
echo "unexpected gh call" >&2; exit 1
`;

let count = 0;
/** A committed checkout whose origin/main is a local bare remote, plus its gh wrapper state; test signing key. */
async function fixture(leak = false) {
  const id = ++count;
  const dir = join(scratch, `checkout-${id}`);
  const files = ["scripts/build-plugin.ts", "scripts/plugin-source.ts", "scripts/release-plugin.ts", ...FILES.map((f) => `plugin/pirax-form-test/${f}`)];
  for (const file of files) {
    await mkdir(dirname(join(dir, file)), { recursive: true });
    await cp(join(ROOT, file), join(dir, file));
  }
  const key = testKey();
  const updates = join(dir, "plugin/pirax-form-test/includes/updates.php");
  await writeFile(updates, (await readFile(updates, "utf8")).replace(PRODUCTION_KEY, key.publicKey));
  if (leak) {
    const doc = join(dir, "plugin/pirax-form-test/README.md");
    await writeFile(doc, (await readFile(doc, "utf8")) + "\n" + encodeURIComponent(key.secrets()[0]!) + "\n");
  }
  await writeFile(join(dir, ".gitignore"), "dist/\n");
  git(dir, "init", "-q", "-b", "main");
  git(dir, "add", "-A");
  git(dir, "commit", "-q", "-m", "fixture");
  const remote = join(scratch, `remote-${id}.git`);
  git(scratch, "init", "-q", "--bare", remote);
  git(dir, "push", "-q", remote, "HEAD:refs/heads/main");
  // The wrapper finds its state next to itself: the publisher passes its children a scoped environment only.
  const bin = join(scratch, `bin-${id}`);
  const state = join(bin, "state");
  await mkdir(state, { recursive: true });
  await writeFile(join(bin, "gh"), WRAPPER.replaceAll("$REAL_GH", REAL_GH));
  await chmod(join(bin, "gh"), 0o755);
  // Records each publisher git call's argv and whether GH_TOKEN reached it (never its value), then runs real git.
  // With state/unreadable-commit, `rev-parse --verify HEAD` after the local commit answers nothing (a failed read).
  const gitLog = join(state, "git-calls");
  await writeFile(join(bin, "git"), `#!/bin/sh\nprintf '%s|token=%s\\n' "$*" "\${GH_TOKEN:+yes}" >> '${gitLog}'\ncase "$*" in *" rev-parse --verify HEAD") [ -f '${join(state, "unreadable-commit")}' ] && grep -q " commit --quiet " '${gitLog}' && exit 128;; esac\nexec '${Bun.which("git")}' "$@"\n`);
  await chmod(join(bin, "git"), 0o755);
  const base = git(dir, "rev-parse", "HEAD");
  const pins = readAuditedVersions(join(dir, "plugin/pirax-form-test"));
  const helper = readHelperVersion(join(dir, "plugin/pirax-form-test"));
  const next = { ...pins, ff: pins.ff.replace(/\d+$/, (x) => String(Number(x) + 1)), cleantalk: pins.cleantalk.replace(/\d+$/, (x) => String(Number(x) + 1)) };
  const plan = planBump(pins, next, helper);
  const decision = decideAudit({
    runId: RUN,
    runAttempt: ATTEMPT,
    base,
    helper,
    oldPins: pins,
    acquisition: { status: "changed", versions: next, packages: Object.fromEntries(Object.entries(next).map(([k, v]) => [k, { version: v, sha256: "0".repeat(64) }])) as never },
    cleanup: "confirmed",
    native: "passed",
    manifests: "verified",
    final: "passed",
    privacy: "passed",
    changes: { to: plan.to, digest: changesDigest(bumpSources(readBumpSources(dir), plan)) },
  });
  if (decision.outcome !== "audited-candidate") throw new Error("fixture candidate");
  const candidatePath = join(state, "candidate.json");
  await writeFile(candidatePath, JSON.stringify(decision.candidate));
  const env = { ...withoutSigningKey(), PATH: `${bin}:${process.env.PATH}`, PIRAX_HELPER_SIGNING_KEY: key.secrets()[0]!, GH_TOKEN: process.env.GH_TOKEN ?? "synthetic-unused-gh-token" };
  const calls = async () => (await readFile(join(state, "calls"), "utf8").catch(() => "")).split("---\n").filter(Boolean).map((c) => c.trimEnd().split("\n"));
  return { dir, remote, state, env, base, plan, candidate: decision.candidate as Candidate, candidatePath, calls, publicKey: key.publicKey, key, seed: key.secrets()[0]! };
}

const remoteMain = (remote: string) => git(scratch, "--git-dir", remote, "rev-parse", "refs/heads/main");
const mutations = (calls: string[][]) => calls.filter((c) => (c[0] === "api" && c.includes("--method")) || (c[0] === "release" && c[1] !== "download"));
async function failure(run: Promise<unknown>) {
  const error = await run.then(() => undefined, (e: unknown) => e);
  expect(error).toBeInstanceOf(PublishError);
  return parseFailureSummary((error as PublishError).summary);
}


test("control: clean assets publish and independently verify at intercepted boundaries", async () => {
  const f = await fixture();
  const result = await publish({ root: f.dir, candidatePath: f.candidatePath, runId: RUN, runAttempt: ATTEMPT, env: f.env, remoteUrl: f.remote });
  expect(result.outcome).toBe("published");
  console.log(JSON.stringify({ control: result.outcome, interceptedMutations: mutations(await f.calls()).length }));
});
test("known encoded signing seed must be refused before tag/release mutation", async () => {
  const f = await fixture(true);
  const s = await failure(publish({ root: f.dir, candidatePath: f.candidatePath, runId: RUN, runAttempt: ATTEMPT, env: f.env, remoteUrl: f.remote }));
  const calls = mutations(await f.calls());
  const p = Bun.spawnSync(["unzip", "-p", join(f.state, "assets/pirax-form-test.zip"), "pirax-form-test/README.md"], { env: { PATH: process.env.PATH }, stdout: "pipe", stderr: "pipe" });
  console.log(JSON.stringify({ reason: s.reason, publication: s.publication, interceptedMutations: calls.length, uploadedZipContainsEncodedSeed: p.stdout.toString().includes(encodeURIComponent(f.seed)) }));
  expect(calls.length).toBe(0);
});
