// Re-audit discovery (plan D3): pure normalization of upstream answers and complete five-key version
// comparison. Never best-effort: any missing, duplicate, malformed, downgraded or ambiguous value fails
// the whole decision. Errors name the stage and field only, never a value.

export const PIN_KEYS = ["gf", "ff", "ff_pro", "cleantalk", "fluent_smtp"] as const;
export type PinKey = (typeof PIN_KEYS)[number];
/** Structurally identical to scripts/plugin-source.ts's AuditedVersions. */
export type AuditedVersions = Record<PinKey, string>;

/** Where each pin comes from, and its main file inside the plugin ZIP. */
export const PLUGINS = {
  gf: { source: "gplvault", slug: "gravityforms", main: "gravityforms/gravityforms.php" },
  ff: { source: "wordpress.org", slug: "fluentform", main: "fluentform/fluentform.php" },
  ff_pro: { source: "gplvault", slug: "fluentformpro", main: "fluentformpro/fluentformpro.php" },
  cleantalk: { source: "wordpress.org", slug: "cleantalk-spam-protect", main: "cleantalk-spam-protect/cleantalk.php" },
  fluent_smtp: { source: "wordpress.org", slug: "fluent-smtp", main: "fluent-smtp/fluent-smtp.php" },
} as const satisfies Record<PinKey, { source: "gplvault" | "wordpress.org"; slug: string; main: string }>;
export const FREE_KEYS = PIN_KEYS.filter((k) => PLUGINS[k].source === "wordpress.org") as ("ff" | "cleantalk" | "fluent_smtp")[];
export const PAID_KEYS = PIN_KEYS.filter((k) => PLUGINS[k].source === "gplvault") as ("gf" | "ff_pro")[];

/** A failure naming its stage and field (plus a fixed reason word); `lifecycle` is attached by acquisition. */
export class ReauditError extends Error {
  lifecycle?: unknown;
  constructor(
    readonly stage: string,
    readonly field: string,
    readonly reason: string,
  ) {
    super(`${stage}: ${field} ${reason}`);
    this.name = "ReauditError";
  }
}

const STABLE = /^(0|[1-9]\d*)(\.(0|[1-9]\d*))*$/;
const isStable = (value: unknown): value is string => typeof value === "string" && STABLE.test(value);

/** Numeric order of stable dotted versions; missing trailing components count as 0 ("6.2" == "6.2.0"). */
export function compareVersions(a: string, b: string): -1 | 0 | 1 {
  if (!isStable(a) || !isStable(b)) throw new ReauditError("version", "value", "malformed");
  const [x, y] = [a.split("."), b.split(".")];
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    // Digit strings without leading zeros: longer is larger, else lexical. No float/integer coercion.
    const [p, q] = [x[i] ?? "0", y[i] ?? "0"];
    if (p.length !== q.length) return p.length > q.length ? 1 : -1;
    if (p !== q) return p > q ? 1 : -1;
  }
  return 0;
}

/** Exactly the five pin keys, each a stable version string. */
export function validateVersions(record: unknown, stage: string): AuditedVersions {
  if (!record || typeof record !== "object" || Array.isArray(record)) throw new ReauditError(stage, "record", "malformed");
  for (const key of Object.keys(record)) if (!(PIN_KEYS as readonly string[]).includes(key)) throw new ReauditError(stage, key, "unknown");
  const out = {} as AuditedVersions;
  for (const key of PIN_KEYS) {
    const value = (record as Record<string, unknown>)[key];
    if (value === undefined) throw new ReauditError(stage, key, "missing");
    if (!isStable(value)) throw new ReauditError(stage, key, "malformed");
    out[key] = value;
  }
  return out;
}

/** A complete matrix from per-product observations; duplicates and unknown products are refused. */
export function assembleLatest(observations: { key: string; version: unknown }[]): AuditedVersions {
  const out: Record<string, unknown> = {};
  for (const { key, version } of observations) {
    if (!(PIN_KEYS as readonly string[]).includes(key)) throw new ReauditError("discovery", key, "unknown");
    if (key in out) throw new ReauditError("discovery", key, "duplicate");
    out[key] = version;
  }
  return validateVersions(out, "discovery");
}

/** Exact string equality is the only unchanged pin; numerically equal respellings and downgrades fail. */
export function compareMatrix(pins: AuditedVersions, latest: AuditedVersions): { status: "unchanged" | "changed"; changed: PinKey[] } {
  pins = validateVersions(pins, "pins");
  latest = validateVersions(latest, "latest");
  const changed: PinKey[] = [];
  for (const key of PIN_KEYS) {
    if (pins[key] === latest[key]) continue;
    const order = compareVersions(latest[key], pins[key]);
    if (order === 0) throw new ReauditError("discovery", key, "ambiguous");
    if (order < 0) throw new ReauditError("discovery", key, "downgrade");
    changed.push(key);
  }
  return { status: changed.length ? "changed" : "unchanged", changed };
}

/** wordpress.org plugin info 1.0 (`version`, `download_link`); the link must be the selected version's HTTPS ZIP. */
export function parseWordpressOrgInfo(key: PinKey, body: unknown): { version: string; url: string } {
  const plugin = PLUGINS[key];
  if (plugin.source !== "wordpress.org") throw new ReauditError("discovery", key, "unknown");
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new ReauditError("discovery", key, "response malformed");
  const { slug, version, download_link } = body as Record<string, unknown>;
  if (slug !== plugin.slug) throw new ReauditError("discovery", key, "slug mismatch");
  if (!isStable(version)) throw new ReauditError("discovery", key, "malformed");
  if (download_link !== `https://downloads.wordpress.org/plugin/${plugin.slug}.${version}.zip`)
    throw new ReauditError("discovery", key, "download link malformed");
  return { version, url: download_link };
}

/**
 * Paid versions and GPL Vault item ids from the official client's schema() plugins catalog, already reduced
 * by gplvault-playground's PHP step to `{main, product_id, version}` entries (no URLs).
 */
export function parseCatalog(entries: unknown): Record<"gf" | "ff_pro", { version: string; item: number }> {
  if (!Array.isArray(entries)) throw new ReauditError("catalog", "response", "malformed");
  const out = {} as Record<"gf" | "ff_pro", { version: string; item: number }>;
  for (const key of PAID_KEYS) {
    const matches = entries.filter((e) => e && typeof e === "object" && (e as { main?: unknown }).main === PLUGINS[key].main);
    if (!matches.length) throw new ReauditError("catalog", key, "missing");
    if (matches.length > 1) throw new ReauditError("catalog", key, "duplicate");
    const { product_id, version } = matches[0] as Record<string, unknown>;
    const item = typeof product_id === "string" && /^[1-9]\d{0,14}$/.test(product_id) ? Number(product_id) : product_id;
    if (typeof item !== "number" || !Number.isSafeInteger(item) || item < 1) throw new ReauditError("catalog", key, "item malformed");
    if (!isStable(version)) throw new ReauditError("catalog", key, "malformed");
    out[key] = { version, item };
  }
  return out;
}
