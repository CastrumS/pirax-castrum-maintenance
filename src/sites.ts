import { readFileSync } from "node:fs";

export type Page = { path: string; mask: string[] };

export type Site = {
  slug: string;
  url: string;
  form_helper: boolean;
  mask: string[];
  max_diff_pixel_ratio: number;
  pages: Page[];
};

export class SitesConfigError extends Error {
  constructor(
    readonly site: string,
    readonly field: string,
    detail: string,
    file?: string,
  ) {
    super(`${file ? `${file}: ` : ""}${site}: ${field}: ${detail}`);
    this.name = "SitesConfigError";
  }
}

const SITE_KEYS = ["slug", "url", "form_helper", "mask", "max_diff_pixel_ratio", "pages"];
const PAGE_KEYS = ["path", "mask"];
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const TRAVERSAL = /^(\.|%2e){1,2}$/i;

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

/** Stable filename-safe key: `/` → `home`, `/a/b/` → `a-b`; other unsafe characters become %XX bytes. */
export function pageKey(path: string): string {
  const trimmed = path.replace(/^\/+|\/+$/g, "");
  if (!trimmed) return "home";
  const encode = (c: string) => [...new TextEncoder().encode(c)].map((b) => `%${b.toString(16).toUpperCase().padStart(2, "0")}`).join("");
  return trimmed
    .split("/")
    .map((segment) => segment.replace(/[^A-Za-z0-9._-]/gu, encode))
    .join("-");
}

export function loadSites(path = "sites.yaml"): Site[] {
  const fail = (site: string, field: string, detail: string): never => {
    throw new SitesConfigError(site, field, detail, path);
  };

  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch (e) {
    return fail("<root>", "<file>", `cannot read: ${(e as NodeJS.ErrnoException).code ?? (e as Error).message}`);
  }
  let root: unknown;
  try {
    root = Bun.YAML.parse(text);
  } catch (e) {
    // Bun's parser messages carry no source text, so this never echoes file contents.
    return fail("<root>", "<yaml>", (e as Error).message);
  }

  if (!isObj(root)) return fail("<root>", "sites", "file must be a mapping with a `sites` list");
  for (const key of Object.keys(root)) if (key !== "sites") fail("<root>", key, "unknown key");
  if (!Array.isArray(root.sites)) return fail("<root>", "sites", "must be a list");

  const slugs = new Set<string>();
  return root.sites.map((raw, index): Site => {
    let label = `site[${index}]`;
    if (!isObj(raw)) return fail(label, "<site>", "must be a mapping");
    const err = (field: string, detail: string) => fail(label, field, detail);

    const { slug, url, form_helper, pages } = raw;
    if (typeof slug !== "string" || !SLUG.test(slug)) return err("slug", "must be lowercase alphanumeric words joined by single hyphens");
    label = slug;
    if (slugs.has(slug)) err("slug", "duplicate slug");
    slugs.add(slug);

    for (const key of Object.keys(raw)) if (!SITE_KEYS.includes(key)) err(key, "unknown key");

    if (typeof url !== "string") return err("url", "required string");
    let parsed: URL | undefined;
    try {
      parsed = new URL(url);
    } catch {}
    if (!parsed || !/^https?:$/.test(parsed.protocol) || url !== url.trim()) return err("url", "must be an absolute http(s) URL");
    if (parsed.username || parsed.password || /[?#]/.test(url)) err("url", "must not contain credentials, query or fragment");
    if (url.endsWith("/")) err("url", 'must not end with "/"');

    if (typeof form_helper !== "boolean") return err("form_helper", "required boolean");

    const ratio = raw.max_diff_pixel_ratio === undefined ? 0.01 : raw.max_diff_pixel_ratio;
    if (typeof ratio !== "number" || !Number.isFinite(ratio) || ratio < 0 || ratio > 1) {
      return err("max_diff_pixel_ratio", "must be a number from 0 to 1");
    }

    if (!Array.isArray(pages) || pages.length === 0) return err("pages", "must be a nonempty list");
    const keys = new Map<string, string>();
    const normalized = pages.map((entry, i): Page => {
      const at = `pages[${i}]`;
      let path: unknown = entry;
      let mask: string[] = [];
      if (isObj(entry)) {
        for (const key of Object.keys(entry)) if (!PAGE_KEYS.includes(key)) err(`${at}.${key}`, "unknown key");
        path = entry.path;
        mask = masks(entry.mask, `${at}.mask`, err);
      } else if (typeof entry !== "string") {
        err(at, "must be a path string or a {path, mask} mapping");
      }
      if (typeof path !== "string") return err(`${at}.path`, "required string");
      if (!path.startsWith("/") || path.includes("//")) err(`${at}.path`, 'must start with a single "/" and have no empty segments');
      if (/[?#]/.test(path)) err(`${at}.path`, "must not contain query or fragment");
      if (path.split("/").some((s) => TRAVERSAL.test(s))) err(`${at}.path`, "must not contain . or .. segments");

      // Keys are compared case-insensitively so case-insensitive filesystems cannot overwrite either.
      const key = pageKey(path).toLowerCase();
      const clash = keys.get(key);
      if (clash !== undefined) err(`${at}.path`, clash === path ? "duplicate path" : `page key "${pageKey(path)}" collides with ${clash}`);
      keys.set(key, path);
      return { path, mask };
    });

    return {
      slug,
      url,
      form_helper,
      mask: masks(raw.mask, "mask", err),
      max_diff_pixel_ratio: ratio,
      pages: normalized,
    };
  });
}

// Only shape is checked; whether a selector is valid CSS or matches the page needs a browser.
function masks(value: unknown, field: string, err: (field: string, detail: string) => never): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) return err(field, "must be a list of CSS selectors");
  value.forEach((m, i) => {
    if (typeof m !== "string" || !m.trim()) err(`${field}[${i}]`, "must be a nonblank string");
  });
  return value as string[];
}
