export type R2Config = {
  accessKeyId: string;
  secretAccessKey: string;
  endpoint: string;
  bucket: string;
  region: "auto";
};

export class EnvError extends Error {
  constructor(readonly missing: string[]) {
    super(`Missing or blank environment variables: ${missing.join(", ")}`);
    this.name = "EnvError";
  }
}

const R2_VARS = ["S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY", "S3_ENDPOINT", "S3_BUCKET"] as const;

/** Reads R2 settings on demand; throws EnvError naming every missing/blank variable, never values. */
export function readR2Config(env: Record<string, string | undefined> = process.env): R2Config {
  const missing = R2_VARS.filter((name) => !env[name]?.trim());
  if (missing.length) throw new EnvError(missing);
  const get = (name: (typeof R2_VARS)[number]) => env[name]!;
  return {
    accessKeyId: get("S3_ACCESS_KEY_ID"),
    secretAccessKey: get("S3_SECRET_ACCESS_KEY"),
    endpoint: get("S3_ENDPOINT"),
    bucket: get("S3_BUCKET"),
    region: "auto",
  };
}

/** Present but unusable values; names only, because a partial secret is still a secret. */
export class EnvFormatError extends Error {
  constructor(readonly invalid: string[]) {
    super(`Invalid environment variables (see README for the expected format): ${invalid.join(", ")}`);
    this.name = "EnvFormatError";
  }
}

/** Shared lazy reader: EnvError for missing/blank names first, then EnvFormatError for failed checks. Values are never trimmed. */
export function readEnv<const N extends string>(env: Record<string, string | undefined>, checks: Record<N, (value: string) => boolean>): Record<N, string> {
  const names = Object.keys(checks) as N[];
  const missing = names.filter((name) => !env[name]?.trim());
  if (missing.length) throw new EnvError(missing);
  const invalid = names.filter((name) => !checks[name](env[name]!));
  if (invalid.length) throw new EnvFormatError(invalid);
  return Object.fromEntries(names.map((name) => [name, env[name]!])) as Record<N, string>;
}
