// Merge A post-merge release check (plan step 7), independent of the implementation's own verifier.
// Downloads exactly the tag's assets into an empty directory and checks: published, latest, three assets;
// Ed25519 signature over the exact manifest bytes with the tag commit's UPDATE_PUBLIC_KEY; manifest
// sha256/version/package/audited; ZIP entries byte-identical to the tag commit's helper source; header and
// VERSION constant; tag commit identity with origin/main and the bump diff. Prints one JSON object of facts
// and booleans. Needs an authenticated gh; loads no environment file and reads nothing secret.
// Usage: bun --no-env-file verify-release.ts <checkout> <tag> <reviewed head> <empty download dir>
import { createHash, createPublicKey, verify } from "node:crypto";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const [checkout, tag, reviewed, dir] = process.argv.slice(2);
if (!checkout || !tag || !reviewed || !dir) throw new Error("usage: verify-release.ts <checkout> <tag> <reviewed head> <empty dir>");
const REPO = "CastrumS/pirax-castrum-maintenance";
const GH = process.env.GH_BIN ?? "gh";
const ASSETS = ["pirax-form-test-manifest.json", "pirax-form-test-manifest.json.sig", "pirax-form-test.zip"];
const SPKI_ED25519 = Buffer.from("302a300506032b6570032100", "hex");
const env = { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "", GH_PROMPT_DISABLED: "1" };

function run(cmd: string[]): Buffer {
  const p = Bun.spawnSync(cmd, { env, stdout: "pipe", stderr: "pipe" });
  if (p.exitCode !== 0) throw new Error(`${cmd.slice(0, 3).join(" ")} failed (exit ${p.exitCode})`);
  return p.stdout;
}
const text = (cmd: string[]) => run(cmd).toString("utf8");

const { parseAuditedVersions, readAuditedVersions, readHelperVersion } = await import(join(checkout, "scripts/plugin-source.ts"));
const { FILES } = await import(join(checkout, "scripts/build-plugin.ts"));

const release = JSON.parse(text([GH, "release", "view", tag, "--repo", REPO, "--json", "tagName,isDraft,isPrerelease,assets,publishedAt,url"]));
const latest = JSON.parse(text([GH, "api", `repos/${REPO}/releases/latest`])).tag_name;
const ref = JSON.parse(text([GH, "api", `repos/${REPO}/git/ref/tags/${tag}`]));
const tagCommit: string = ref.object.type === "commit" ? ref.object.sha : `not-a-commit:${ref.object.type}`;
run(["git", "-C", checkout, "fetch", "-q", "origin"]);
const mainHead = text(["git", "-C", checkout, "rev-parse", "origin/main"]).trim();
const parent = text(["git", "-C", checkout, "rev-parse", `${tagCommit}^`]).trim();
const bumpFiles = text(["git", "-C", checkout, "diff", "--name-only", reviewed, tagCommit]).trim().split("\n").filter(Boolean).sort();
const show = (path: string) => run(["git", "-C", checkout, "show", `${tagCommit}:${path}`]);

run([GH, "release", "download", tag, "--repo", REPO, "--dir", dir]);
const downloaded = readdirSync(dir).sort();
const manifestBytes = readFileSync(join(dir, ASSETS[0]!));
const signature = Buffer.from(readFileSync(join(dir, ASSETS[1]!), "utf8").trim(), "base64");
const zipPath = join(dir, ASSETS[2]!);
const zip = readFileSync(zipPath);
const manifest = JSON.parse(manifestBytes.toString("utf8"));
const version = tag.replace(/^v/, "");

const publicKey = show("plugin/pirax-form-test/includes/updates.php").toString("utf8").match(/^const UPDATE_PUBLIC_KEY = '([^']*)';$/m)?.[1] ?? "";
const key = createPublicKey({ key: Buffer.concat([SPKI_ED25519, Buffer.from(publicKey, "base64")]), format: "der", type: "spki" });
const tagPins = parseAuditedVersions(show("plugin/pirax-form-test/includes/compatibility.php").toString("utf8"));

const entries = text(["unzip", "-Z1", zipPath]).trim().split("\n").filter((e) => !e.endsWith("/")).sort();
const expected = (FILES as string[]).map((f) => `pirax-form-test/${f}`).sort();
const mismatched = (FILES as string[]).filter((f) => !run(["unzip", "-p", zipPath, `pirax-form-test/${f}`]).equals(show(`plugin/pirax-form-test/${f}`)));
const extracted = mkdtempSync(join(tmpdir(), "merge-a-release-"));
let zipVersion = "";
let zipPins: unknown = null;
try {
  run(["unzip", "-q", zipPath, "-d", extracted]);
  zipVersion = readHelperVersion(join(extracted, "pirax-form-test"));
  zipPins = readAuditedVersions(join(extracted, "pirax-form-test"));
} finally {
  rmSync(extracted, { recursive: true, force: true });
}
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

console.log(JSON.stringify({
  tag,
  url: release.url,
  publishedAt: release.publishedAt,
  published: release.isDraft === false && release.isPrerelease === false,
  latest: latest === tag,
  releaseAssets: release.assets.map((a: { name: string }) => a.name).sort(),
  exactlyThreeAssets: same(release.assets.map((a: { name: string }) => a.name).sort(), [...ASSETS].sort()) && same(downloaded, [...ASSETS].sort()),
  tagCommit,
  tagIsMainHead: tagCommit === mainHead,
  tagParentIsReviewedHead: parent === reviewed,
  bumpFiles,
  signatureValid: verify(null, manifestBytes, key, signature),
  zipSha256: createHash("sha256").update(zip).digest("hex"),
  manifestShaMatches: manifest.sha256 === createHash("sha256").update(zip).digest("hex"),
  manifestVersionMatches: manifest.version === version,
  manifestPackageMatches: manifest.package === `https://github.com/${REPO}/releases/download/${tag}/pirax-form-test.zip`,
  manifestAudited: manifest.audited,
  auditedMatchesTagCommit: same(manifest.audited, tagPins),
  zipEntriesExact: same(entries, expected),
  zipFilesIdenticalToTagCommit: mismatched.length === 0,
  zipMismatchedFiles: mismatched,
  zipHelperVersion: zipVersion,
  zipVersionMatches: zipVersion === version,
  zipPinsMatchManifest: same(zipPins, manifest.audited),
}, null, 2));
