// Version fixtures derived from the shipping source (plan D2), so native tests follow pin and helper
// bumps instead of hard-coding today's versions:
//   PINS / HELPER_VERSION                     AUDITED_VERSIONS and the helper version, via scripts/plugin-source.ts
//   nextPatch(v)                              last dotted component + 1 (3.1.2 → 3.1.3, 6.88 → 6.89, 3.1.9 → 3.1.10)
//   nearMisses(pin)                           versions an exact string comparison must reject, all different from pin
//   exactMatrix(pin, extra?)                  { pin: true, each near miss (and extra): false }, an exact comparison's expected result
//   pinLine(key, version?)                    an AUDITED_VERSIONS line exactly as compatibility.php writes it
//   withHelperVersion(to, from?)              edit of pirax-form-test.php's header and VERSION, each matched exactly once
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
