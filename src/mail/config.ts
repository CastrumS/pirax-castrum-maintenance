import { readEnv } from "../env.ts";

export type ImapConfig = {
  host: string;
  port: number;
  /** Implicit TLS on 993; every other port requires STARTTLS. Certificates are always verified. */
  secure: boolean;
  user: string;
  password: string;
  folder: string;
  spamFolder: string;
};

const host = /^(?=.{1,253}$)[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)*$/;
const noControls = (v: string) => !/[\u0000-\u001f\u007f]/.test(v);
/** Exact mailbox names: `*`/`%` would turn the library's pre-EXAMINE LIST into a wildcard listing. */
const literalFolder = (v: string) => noControls(v) && !/[*%]/.test(v) && v.trim() === v;
const port = (v: string) => /^[1-9][0-9]{0,4}$/.test(v) && Number(v) <= 65535;

/** Read before an opted-in submission; import-safe and value-free on error. */
export function readImapConfig(env: Record<string, string | undefined> = process.env): ImapConfig {
  const v = readEnv(env, {
    IMAP_HOST: (x) => host.test(x),
    IMAP_PORT: port,
    IMAP_USER: noControls,
    IMAP_PASSWORD: noControls,
    IMAP_FOLDER: literalFolder,
    IMAP_SPAM_FOLDER: literalFolder,
  });
  const p = Number(v.IMAP_PORT);
  return { host: v.IMAP_HOST, port: p, secure: p === 993, user: v.IMAP_USER, password: v.IMAP_PASSWORD, folder: v.IMAP_FOLDER, spamFolder: v.IMAP_SPAM_FOLDER };
}
