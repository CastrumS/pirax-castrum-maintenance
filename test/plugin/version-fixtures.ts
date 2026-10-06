// Version fixtures derived from the shipping source (plan D2), so native tests follow pin and helper
// bumps instead of hard-coding today's versions:
//   PINS / HELPER_VERSION                     AUDITED_VERSIONS and the helper version, via scripts/plugin-source.ts
//   nextPatch(v)                              last dotted component + 1 (3.1.2 → 3.1.3, 6.88 → 6.89, 3.1.9 → 3.1.10)
//   nearMisses(pin)                           versions an exact string comparison must reject, all different from pin
//   exactMatrix(pin, extra?)                  { pin: true, each near miss (and extra): false }, an exact comparison's expected result
//   pinLine(key, version?)                    an AUDITED_VERSIONS line exactly as compatibility.php writes it
//   withHelperVersion(to, from?)              edit of pirax-form-test.php's header and VERSION, each matched exactly once
//   withAlteredFile(h, file, search, replace, body)  an installed plugin file edited (search exactly once) during body, then restored
import { expect } from "bun:test";
import type { Harness } from "./harness";
import { readAuditedVersions, readHelperVersion, type AuditedVersions } from "../../scripts/plugin-source";

export const PINS = readAuditedVersions();
export const HELPER_VERSION = readHelperVersion();

/** e.g. `\t'gf'          => '3.1.2',`: keys padded so every arrow lines up. */
export const pinLine = (key: keyof AuditedVersions, version = PINS[key]) => `\t${`'${key}'`.padEnd(14)}=> '${version}',`;

export const nextPatch = (version: string) => version.replace(/\d+$/, (n) => String(Number(n) + 1));

/**
 * For 3.1.2: 3.1.3, 3.1.20, 3.1, 3.1.2.1, 3.1.2-beta, 3.1.2-rc1 and 3.2.0; a multi-digit last component
 * also gets its one-character string prefix (6.2.1 for 6.2.14, 6.8 for 6.88). Throws if any equals pin.
 */
export function nearMisses(pin: string) {
  const parts = pin.split(".");
  const nextMinor = [...parts.slice(0, -2), String(Number(parts.at(-2)) + 1), "0"].join(".");
  const misses = [nextPatch(pin), `${pin}0`, parts.slice(0, -1).join("."), `${pin}.1`, `${pin}-beta`, `${pin}-rc1`, nextMinor];
  if (parts.at(-1)!.length > 1) misses.push(pin.slice(0, -1));
  if (new Set([pin, ...misses]).size !== misses.length + 1) throw new Error(`nearMisses(${pin}) produced a duplicate or the pin itself`);
  return misses;
}

export const exactMatrix = (pin: string, extra: string[] = []): Record<string, boolean> =>
  Object.fromEntries([pin, ...nearMisses(pin), ...extra].map((version) => [version, version === pin]));

/** Sets the helper header and VERSION constant from `from` to `to`; throws unless each declaration of `from` matches exactly once. */
export const withHelperVersion = (to: string, from = HELPER_VERSION) => (text: string) => {
  const quoted = from.replace(/\./g, "\\.");
  const edits: [RegExp, string][] = [
    [new RegExp(`^( \\* Version:\\s+)${quoted}$`, "gm"), `$1${to}`],
    [new RegExp(`^const VERSION = '${quoted}';$`, "gm"), `const VERSION = '${to}';`],
  ];
  for (const [pattern, replacement] of edits) {
    const matches = text.match(pattern)?.length ?? 0;
    if (matches !== 1) throw new Error(`withHelperVersion: ${pattern} matched ${matches} times, expected exactly once`);
    text = text.replace(pattern, replacement);
  }
  return text;
};

/** A PHP expression decoding a JSON value (single-quoted literal, so `$` and `\` stay literal). */
const lit = (v: unknown) => `json_decode('${JSON.stringify(v).replace(/\\/g, "\\\\").replace(/'/g, "\\'")}', true)`;

/**
 * Replace `search` (exactly once) in an installed plugin file, run `body` with fresh requests, then restore it
 * and require the original bytes back. `body` receives the original and altered SHA-256.
 *
 * Each edit uses a new backup name: Playground's workers share the site directory, but each caches file names
 * it has seen, so a fixed name another worker already renamed away makes this worker's copy() fail with ENOENT.
 * Every write is read back, so a failed backup, edit or restore throws instead of leaving the edit installed.
 */
export async function withAlteredFile(
  h: Pick<Harness, "php">,
  file: string,
  search: string,
  replace: string,
  body: (hashes: { original: string; altered: string }) => Promise<void>,
) {
  const backup = `${file}.pirax-original-${crypto.randomUUID()}`;
  const hashes = await h.php<{ original: string; altered: string }>(`
    $file = WP_PLUGIN_DIR . '/' . ${lit(file)};
    $backup = WP_PLUGIN_DIR . '/' . ${lit(backup)};
    $source = file_get_contents($file);
    if (1 !== substr_count($source, ${lit(search)})) throw new RuntimeException('fixture search string not found exactly once');
    $altered = str_replace(${lit(search)}, ${lit(replace)}, $source);
    if (!copy($file, $backup) || hash_file('sha256', $backup) !== hash('sha256', $source)) throw new RuntimeException('fixture backup failed');
    if (file_put_contents($file, $altered) !== strlen($altered) || hash_file('sha256', $file) !== hash('sha256', $altered)) throw new RuntimeException('fixture edit failed');
    if (function_exists('opcache_invalidate')) opcache_invalidate($file, true);
    return ['original' => hash('sha256', $source), 'altered' => hash('sha256', $altered)];
  `);
  try {
    await body(hashes);
  } finally {
    const restored = await h.php<string>(`
      $file = WP_PLUGIN_DIR . '/' . ${lit(file)};
      if (!rename(WP_PLUGIN_DIR . '/' . ${lit(backup)}, $file)) throw new RuntimeException('fixture restore failed');
      if (function_exists('opcache_invalidate')) opcache_invalidate($file, true);
      return hash_file('sha256', $file);
    `);
    expect(restored).toBe(hashes.original);
  }
}
