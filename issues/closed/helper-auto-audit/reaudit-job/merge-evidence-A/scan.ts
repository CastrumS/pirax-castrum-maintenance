// Merge A evidence scan: findSecret over a directory (ZIP entries included) with every known credential value
// that Bun's --env-file loader provides, selected by privacy.ts secretValues. Prints counts and the relative
// labels of any hit files, never a value.
// Usage: bun --env-file=<env file> scan.ts <worktree> <dir>
import { join } from "node:path";

const [worktree, dir] = process.argv.slice(2);
if (!worktree || !dir) throw new Error("usage: scan.ts <worktree> <dir>");
const { SECRET_NAMES, secretValues } = await import(join(worktree, "scripts/reaudit/privacy.ts"));
const { findSecret } = await import(join(worktree, "test/plugin/artifacts.ts"));
const values: string[] = secretValues(process.env);
const hits: string[] = await findSecret(dir, values);
console.log(JSON.stringify({ namesConfigured: SECRET_NAMES.length, valuesLoaded: values.length, findings: hits.length, hitFiles: hits }));
process.exit(hits.length ? 1 : 0);
