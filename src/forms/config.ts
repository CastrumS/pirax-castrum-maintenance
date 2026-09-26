import { readEnv } from "../env.ts";

export type FormConfig = { token: string; address: string };

/** Same alphabet/length the Pirax Form Test settings accept, so the marker survives form sanitizing. */
export const tokenPattern = /^[A-Za-z0-9._~+/=-]{16,255}$/;
const label = "[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?";
/** One bare address with a dotted domain: no display name, list, whitespace or header injection. */
export const addressPattern = new RegExp(`^[A-Za-z0-9.!#$%&'*+/=?^_\`{|}~-]{1,64}@${label}(?:\\.${label})+$`);

/** Fill credentials, read only when a supported form is about to be filled. */
export function readFormConfig(env: Record<string, string | undefined> = process.env): FormConfig {
  const values = readEnv(env, { FORM_TEST_TOKEN: (v) => tokenPattern.test(v), FORM_TEST_ADDRESS: (v) => addressPattern.test(v) });
  return { token: values.FORM_TEST_TOKEN, address: values.FORM_TEST_ADDRESS };
}
