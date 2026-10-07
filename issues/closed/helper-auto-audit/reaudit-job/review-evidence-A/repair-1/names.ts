// Review A repair recheck probe. Builds the helper ZIP from a disposable copy and reports, per known secret
// name, absent/present and whether the release CLI's pre-publication scan (secretValues + findSecret) would hit
// that ZIP. Prints names and booleans only, never a value.
// Usage: bun --env-file=<env file> names.ts <copy root> <empty out dir>
import { join } from "node:path";

const [copy, out] = process.argv.slice(2);
if (!copy || !out) throw new Error("usage: names.ts <copy root> <out dir>");
const { SECRET_NAMES, secretValues } = await import(join(copy, "scripts/reaudit/privacy.ts"));
const { findSecret } = await import(join(copy, "test/plugin/artifacts.ts"));
const { buildPlugin } = await import(join(copy, "scripts/build-plugin.ts"));

await buildPlugin({ source: join(copy, "plugin/pirax-form-test"), zip: join(out, "pirax-form-test.zip") });
const scanned = new Set<string>(secretValues(process.env));
let hits = 0;
for (const name of SECRET_NAMES as readonly string[]) {
  const value = process.env[name];
  if (!value) {
    console.log(`${name}: absent`);
    continue;
  }
  const hit = scanned.has(value) && (await findSecret(out, [value])).length > 0;
  if (hit) hits++;
  console.log(`${name}: present, ${hit ? "HIT" : "no hit"}`);
}
console.log(`names with a hit: ${hits}`);
