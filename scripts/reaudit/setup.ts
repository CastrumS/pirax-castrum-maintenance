// One-time, explicitly invoked re-audit provisioning (plan D5):
//   bun --env-file=<registered repository>/.env scripts/reaudit/setup.ts [--source <official updater ZIP>]
// Encrypts the operator's official GPL Vault updater ZIP (default ~/Downloads/gplvault-updater.zip) with the
// existing GPLVAULT_UPDATER_PASSPHRASE into .github/audit/gplvault-updater.zip.gpg, verifies the round trip,
// then streams that passphrase and the GPL Vault/Gmail values to repository secrets via `gh secret set` stdin.
// Never generates or rotates the passphrase, never overwrites a ciphertext it cannot reproduce, never sets the
// signing secret (it only checks that its name exists), and prints names and results only. No import side effects.
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rename, rm } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { ReauditError } from "./detect";
import { CIPHERTEXT, decryptUpdater, gpg, zipVersion } from "./fetch";

export const REPO = "CastrumS/pirax-castrum-maintenance";
/** Set by this script, each from the same-named environment variable. */
export const SECRET_NAMES = ["GPLVAULT_UPDATER_PASSPHRASE", "GPLVAULT_LICENSE_KEY", "GPLVAULT_PRODUCT_ID", "IMAP_USER", "IMAP_PASSWORD"] as const;
const SIGNING_SECRET = "PIRAX_HELPER_SIGNING_KEY";
/** gh's environment: its own configuration/auth lookup only, none of the values being provisioned. */
const GH_ENV = ["PATH", "HOME", "LANG", "XDG_CONFIG_HOME", "XDG_RUNTIME_DIR", "DBUS_SESSION_BUS_ADDRESS", "GH_CONFIG_DIR", "GH_HOST", "GH_TOKEN", "GITHUB_TOKEN"];

const refuse = (what: string, why: string) => new ReauditError("setup", what, why);
const sha256 = async (path: string) => createHash("sha256").update(await readFile(path)).digest("hex");

export async function setup({
  env = process.env,
  source = join(homedir(), "Downloads/gplvault-updater.zip"),
  ciphertext = CIPHERTEXT,
  repo = REPO,
  log = console.log,
}: { env?: Record<string, string | undefined>; source?: string; ciphertext?: string; repo?: string; log?: (line: string) => void } = {}) {
  for (const name of SECRET_NAMES) if (!env[name]) throw refuse(name, "is not set");
  const passphrase = env.GPLVAULT_UPDATER_PASSPHRASE!;
  if (passphrase.length < 16) throw refuse("GPLVAULT_UPDATER_PASSPHRASE", "is shorter than 16 characters");
  const plain = await Bun.file(source).bytes().catch(() => undefined);
  const version = plain && (await zipVersion(plain, "gplvault-updater/gplvault-updater.php"));
  if (!version) throw refuse("source", "is not a gplvault-updater ZIP");
  log(`updater: gplvault-updater ${version}`);

  const ghEnv = Object.fromEntries(GH_ENV.flatMap((n) => (env[n] === undefined ? [] : [[n, env[n]!]])));
  const gh = async (args: string[], input = "") => {
    const proc = Bun.spawn(["gh", ...args], { stdin: new Blob([input]), stdout: "pipe", stderr: "ignore", env: ghEnv });
    const [out, code] = await Promise.all([new Response(proc.stdout).text(), proc.exited]);
    if (code !== 0) throw refuse(`gh secret ${args[1]}`, "failed");
    return out;
  };
  let names: unknown;
  try {
    names = (JSON.parse(await gh(["secret", "list", "--repo", repo, "--json", "name"])) as { name: unknown }[]).map((s) => s.name);
  } catch (error) {
    throw error instanceof ReauditError ? error : refuse("gh secret list", "answer malformed");
  }
  if (!(names as unknown[]).includes(SIGNING_SECRET)) throw refuse(`repository secret ${SIGNING_SECRET}`, "is missing");

  const scratch = await mkdtemp(join(tmpdir(), "pirax-setup-"));
  try {
    const roundtrip = join(scratch, "roundtrip.zip");
    const expected = await sha256(source);
    if (existsSync(ciphertext)) {
      await decryptUpdater(ciphertext, roundtrip, passphrase).catch(() => {
        throw refuse("existing ciphertext", "does not decrypt with GPLVAULT_UPDATER_PASSPHRASE; refusing to rotate");
      });
      if ((await sha256(roundtrip)) !== expected) throw refuse("existing ciphertext", "holds a different updater ZIP; refusing to rotate");
      log("ciphertext: existing file matches the source, kept");
    } else {
      await mkdir(dirname(ciphertext), { recursive: true });
      await gpg(["--symmetric", "--cipher-algo", "AES256", "--output", `${ciphertext}.part`, source], passphrase, "encrypt");
      await decryptUpdater(`${ciphertext}.part`, roundtrip, passphrase);
      if ((await sha256(roundtrip)) !== expected) {
        await rm(`${ciphertext}.part`, { force: true });
        throw refuse("ciphertext", "round trip mismatch");
      }
      await rename(`${ciphertext}.part`, ciphertext);
      log("ciphertext: written, round trip verified");
    }
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }

  // The passphrase secret always equals the value the ciphertext was just verified against.
  for (const name of SECRET_NAMES) {
    await gh(["secret", "set", name, "--repo", repo], env[name]!);
    log(`secret ${name}: set`);
  }
  log(`secret ${SIGNING_SECRET}: present, unchanged`);
  log(`next: commit ${relative(resolve(import.meta.dir, "../.."), ciphertext)} (ciphertext only)`);
}

if (import.meta.main) {
  const at = process.argv.indexOf("--source");
  await setup(at === -1 ? {} : { source: resolve(process.argv[at + 1] ?? "") }).catch((error) => {
    console.error(error instanceof ReauditError ? error.message : "setup: failed");
    process.exit(1);
  });
}
