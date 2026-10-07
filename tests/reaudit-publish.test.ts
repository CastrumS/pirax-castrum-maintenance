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
import { buildPlugin, FILES, withoutSigningKey } from "../scripts/build-plugin";
import { readAuditedVersions, readHelperVersion } from "../scripts/plugin-source";
import { bumpSources, changesDigest, planBump, readBumpSources, BUMP_FILES } from "../scripts/reaudit/bump";
import { decideAudit, type Candidate } from "../scripts/reaudit/decide";
import { GIT_AUTH } from "../scripts/reaudit/heartbeat";
import { parseFailureSummary } from "../scripts/reaudit/notify";
import { publish, PublishError, verifyRelease } from "../scripts/reaudit/publish";
import { testKey } from "../test/plugin/update-fixture";

setDefaultTimeout(120_000);
const ROOT = resolve(import.meta.dir, "..");
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
async function fixture(encodedSeed = false) {
  const id = ++count;
  const dir = join(scratch, `checkout-${id}`);
  const files = ["scripts/build-plugin.ts", "scripts/plugin-source.ts", "scripts/release-plugin.ts", "scripts/reaudit/privacy.ts", "test/plugin/artifacts.ts", ...FILES.map((f) => `plugin/pirax-form-test/${f}`)];
  for (const file of files) {
    await mkdir(dirname(join(dir, file)), { recursive: true });
    await cp(join(ROOT, file), join(dir, file));
  }
  const key = testKey();
  const updates = join(dir, "plugin/pirax-form-test/includes/updates.php");
  await writeFile(updates, (await readFile(updates, "utf8")).replace(PRODUCTION_KEY, key.publicKey));
  if (encodedSeed) {
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

test("real read-only lookup: an absent release is reported missing, never healthy", async () => {
  const r = await verifyRelease({ tag: "v999.0.0", version: "999.0.0", pins: readAuditedVersions(), publicKey: PRODUCTION_KEY, env: withoutSigningKey() });
  expect(r).toEqual({ status: "missing", reason: "release-missing" });
});

test("publishes this run's candidate: reconstructed allowlisted commit, normal push, existing release CLI, independent verification", async () => {
  const f = await fixture();
  const result = await publish({ root: f.dir, candidatePath: f.candidatePath, runId: RUN, runAttempt: ATTEMPT, env: f.env, remoteUrl: f.remote });
  const tag = `v${f.plan.to}`;
  expect(result).toMatchObject({ outcome: "published", tag, base: f.base });
  expect(remoteMain(f.remote)).toBe(result.commit);
  expect(git(f.dir, "rev-parse", `${result.commit}^`)).toBe(f.base);
  expect(git(f.dir, "diff", "--name-only", f.base, result.commit).split("\n").sort()).toEqual([...BUMP_FILES].sort());
  expect(readAuditedVersions(join(f.dir, "plugin/pirax-form-test"))).toEqual(f.plan.newPins);
  const calls = await f.calls();
  const muts = mutations(calls);
  expect(muts).toHaveLength(2);
  expect(muts[0]).toEqual(["api", "--method", "POST", `repos/${REPO}/git/refs`, "-f", `ref=refs/tags/${tag}`, "-f", `sha=${result.commit}`]);
  expect(muts[1]!.slice(0, 3)).toEqual(["release", "create", tag]);
  expect(calls.flat().join(" ")).not.toMatch(/--force|--clobber|delete/);
  expect(JSON.stringify(calls)).not.toContain(f.seed);
  // Plan D5: the checkout persists no credentials; remote git calls get gh's helper and GH_TOKEN, never argv secrets.
  const gitCalls = (await readFile(join(f.state, "git-calls"), "utf8")).trim().split("\n");
  for (const op of [" ls-remote ", " push "])
    for (const call of gitCalls.filter((c) => c.includes(op))) {
      expect(call.startsWith(GIT_AUTH.join(" "))).toBe(true);
      expect(call.endsWith("|token=yes")).toBe(true);
    }
  expect(gitCalls.filter((c) => c.includes(" push "))).toHaveLength(1);
  expect(gitCalls.some((c) => c.includes(f.env.GH_TOKEN) || c.includes(f.seed))).toBe(false);
});

test("encoded signing seed in final ZIP is withheld before any tag or release mutation", async () => {
  const f = await fixture(true);
  const s = await failure(publish({ root: f.dir, candidatePath: f.candidatePath, runId: RUN, runAttempt: ATTEMPT, env: f.env, remoteUrl: f.remote }));
  expect(mutations(await f.calls()).length).toBe(0);
  expect(s).toMatchObject({ stage: "publication", reason: "release-cli-failed", publication: "main-pushed", commit: remoteMain(f.remote), tag: `v${f.plan.to}` });
  expect(await Bun.file(join(f.state, "assets/pirax-form-test.zip")).exists()).toBe(false);
  expect(await Bun.file(join(f.dir, "dist/pirax-form-test.zip")).exists()).toBe(false);
});

test("main advanced since the audit: nothing is committed, pushed, claimed or released", async () => {
  const f = await fixture();
  const other = join(scratch, "racer");
  git(scratch, "clone", "-q", "-b", "main", f.remote, other);
  await writeFile(join(other, "unrelated.txt"), "x\n");
  git(other, "add", "-A");
  git(other, "commit", "-q", "-m", "unrelated");
  git(other, "push", "-q", "origin", "HEAD:refs/heads/main");
  await rm(other, { recursive: true });
  const advanced = remoteMain(f.remote);
  const s = await failure(publish({ root: f.dir, candidatePath: f.candidatePath, runId: RUN, runAttempt: ATTEMPT, env: f.env, remoteUrl: f.remote }));
  expect(s).toMatchObject({ stage: "push", reason: "main-advanced", publication: "not-attempted", tag: `v${f.plan.to}` });
  expect(remoteMain(f.remote)).toBe(advanced);
  expect(git(f.dir, "rev-parse", "HEAD")).toBe(f.base);
  expect(mutations(await f.calls())).toEqual([]);
});

test("main advancing between the preflight and the push is refused by the normal push", async () => {
  const f = await fixture();
  let racer = "";
  const s = await failure(
    publish({
      root: f.dir,
      candidatePath: f.candidatePath,
      runId: RUN,
      runAttempt: ATTEMPT,
      env: f.env,
      remoteUrl: f.remote,
      beforePush: () => {
        const other = join(scratch, "racer-late");
        git(scratch, "clone", "-q", "-b", "main", f.remote, other);
        Bun.spawnSync(["sh", "-c", "echo y > late.txt"], { cwd: other });
        git(other, "add", "-A");
        git(other, "commit", "-q", "-m", "late");
        git(other, "push", "-q", "origin", "HEAD:refs/heads/main");
        racer = git(other, "rev-parse", "HEAD");
      },
    }),
  );
  expect(s).toMatchObject({ stage: "push", publication: "not-attempted" });
  expect(remoteMain(f.remote)).toBe(racer);
  expect(mutations(await f.calls())).toEqual([]);
});

test("an existing target tag (synthetic remote state) publishes nothing", async () => {
  const f = await fixture();
  await writeFile(join(f.state, "tag"), "b".repeat(40));
  const s = await failure(publish({ root: f.dir, candidatePath: f.candidatePath, runId: RUN, runAttempt: ATTEMPT, env: f.env, remoteUrl: f.remote }));
  expect(s).toMatchObject({ stage: "publication", reason: "tag-exists", publication: "not-attempted" });
  expect(remoteMain(f.remote)).toBe(f.base);
  expect(mutations(await f.calls())).toEqual([]);
});

test("a candidate from another run, a corrupt candidate or a changed source publishes nothing", async () => {
  const f = await fixture();
  expect((await failure(publish({ root: f.dir, candidatePath: f.candidatePath, runId: "1", runAttempt: ATTEMPT, env: f.env, remoteUrl: f.remote }))).reason).toBe("candidate-invalid");
  await writeFile(join(f.state, "corrupt.json"), "{not json");
  expect((await failure(publish({ root: f.dir, candidatePath: join(f.state, "corrupt.json"), runId: RUN, runAttempt: ATTEMPT, env: f.env, remoteUrl: f.remote }))).reason).toBe("candidate-invalid");
  const forged = { ...f.candidate, changes: { digest: "f".repeat(64) } };
  await writeFile(join(f.state, "forged.json"), JSON.stringify(forged));
  expect((await failure(publish({ root: f.dir, candidatePath: join(f.state, "forged.json"), runId: RUN, runAttempt: ATTEMPT, env: f.env, remoteUrl: f.remote }))).reason).toBe("reconstruction-mismatch");
  expect(remoteMain(f.remote)).toBe(f.base);
  expect(mutations(await f.calls())).toEqual([]);
});

test("a rerun attempt never publishes an earlier attempt's candidate of the same run", async () => {
  const f = await fixture();
  const s = await failure(publish({ root: f.dir, candidatePath: f.candidatePath, runId: RUN, runAttempt: String(Number(ATTEMPT) + 1), env: f.env, remoteUrl: f.remote }));
  expect(s).toMatchObject({ stage: "publication", reason: "candidate-invalid", publication: "not-attempted" });
  expect(remoteMain(f.remote)).toBe(f.base);
  expect(git(f.dir, "rev-parse", "HEAD")).toBe(f.base);
  expect(mutations(await f.calls())).toEqual([]);
});

test("an unreadable new commit is refused before any push: no empty commit can disable the tag-commit check", async () => {
  const f = await fixture();
  await writeFile(join(f.state, "unreadable-commit"), "");
  const s = await failure(publish({ root: f.dir, candidatePath: f.candidatePath, runId: RUN, runAttempt: ATTEMPT, env: f.env, remoteUrl: f.remote }));
  expect(s).toMatchObject({ stage: "bump", reason: "commit-unreadable", publication: "not-attempted", tag: `v${f.plan.to}` });
  expect(s.commit).toBeUndefined();
  expect(remoteMain(f.remote)).toBe(f.base);
  expect((await readFile(join(f.state, "git-calls"), "utf8")).split("\n").filter((c) => c.includes(" push "))).toEqual([]);
  expect(mutations(await f.calls())).toEqual([]);
});

test("a release failure after the claim reports the pushed commit and claimed tag as uncertain, without retry or deletion", async () => {
  const f = await fixture();
  await writeFile(join(f.state, "fail-release"), "");
  const s = await failure(publish({ root: f.dir, candidatePath: f.candidatePath, runId: RUN, runAttempt: ATTEMPT, env: f.env, remoteUrl: f.remote }));
  const commit = remoteMain(f.remote);
  expect(commit).not.toBe(f.base);
  expect(s).toMatchObject({ stage: "publication", reason: "release-cli-failed", publication: "tag-claimed", commit, tag: `v${f.plan.to}` });
  const muts = mutations(await f.calls());
  expect(muts.filter((c) => c[0] === "release")).toHaveLength(1);
  expect(JSON.stringify(muts)).not.toMatch(/delete|--clobber|--force/);
});

test("a published release whose manifest does not verify is reported incomplete", async () => {
  const f = await fixture();
  await writeFile(join(f.state, "tamper-manifest"), "");
  const s = await failure(publish({ root: f.dir, candidatePath: f.candidatePath, runId: RUN, runAttempt: ATTEMPT, env: f.env, remoteUrl: f.remote }));
  expect(s).toMatchObject({ stage: "publication", publication: "release-incomplete", commit: remoteMain(f.remote), tag: `v${f.plan.to}` });
  expect(s.reason).toMatch(/^release-/);
});

// Independent package check (integration finding): a correctly signed, hash-consistent release whose ZIP main-file
// Version header disagrees with the manifest and VERSION constant must not verify. SYNTHETIC releases built from the
// fixture source with the test key and served by the gh wrapper; the matching control proves the same path verifies.
test("a signed, hash-consistent release whose plugin Version header disagrees is refused; the matching control verifies", async () => {
  const results: Record<string, unknown> = {};
  for (const header of ["matching", "mismatched"] as const) {
    const f = await fixture();
    const source = join(f.state, "source");
    await cp(join(f.dir, "plugin/pirax-form-test"), source, { recursive: true });
    const version = readHelperVersion(source);
    const tag = `v${version}`;
    const main = join(source, "pirax-form-test.php");
    if (header === "mismatched") await writeFile(main, (await readFile(main, "utf8")).replace(/^( \* Version:[ \t]*).*$/m, `$1${version}.1`));
    const assets = join(f.state, "assets");
    await mkdir(assets);
    const { sha256 } = await buildPlugin({ source, zip: join(assets, "pirax-form-test.zip") });
    const manifest = Buffer.from(`${JSON.stringify({ version, package: `https://github.com/${REPO}/releases/download/${tag}/pirax-form-test.zip`, sha256, audited: readAuditedVersions(source) }, null, 2)}\n`);
    await writeFile(join(assets, "pirax-form-test-manifest.json"), manifest);
    await writeFile(join(assets, "pirax-form-test-manifest.json.sig"), f.key.sign(manifest));
    await writeFile(join(f.state, "tag"), f.base);
    await writeFile(join(f.state, "release.json"), `{"tag_name":"${tag}","draft":false,"prerelease":false,"assets":[{"name":"pirax-form-test-manifest.json"},{"name":"pirax-form-test-manifest.json.sig"},{"name":"pirax-form-test.zip"}]}\n`);
    results[header] = await verifyRelease({ tag, version, pins: readAuditedVersions(source), publicKey: f.publicKey, commit: f.base, env: f.env });
  }
  expect(results).toEqual({ matching: { status: "verified" }, mismatched: { status: "incomplete", reason: "release-package" } });
});
