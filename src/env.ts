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
