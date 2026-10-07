// Unit 4 retained-evidence scan: real values come only from Bun's env-file loader and are never printed.
import { findSecret } from '/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/worktrees/reaudit-job/test/plugin/artifacts.ts';
const names = ['GPLVAULT_LICENSE_KEY', 'GPLVAULT_PRODUCT_ID', 'GPLVAULT_UPDATER_PASSPHRASE', 'IMAP_PASSWORD', 'PIRAX_HELPER_SIGNING_KEY', 'FORM_TEST_TOKEN', 'GRAVITY_FORMS_ZIP', 'FLUENT_FORMS_PRO_ZIP'];
const values = names.flatMap((name) => (process.env[name] ? [process.env[name]!] : []));
// The prescribed recipient is public task data; do not classify that literal as a leaked username.
const user = process.env.IMAP_USER;
if (user && user !== 'piraxcastrum@gmail.com') values.push(user);
const dirs = process.argv.slice(2);
let findings = 0;
for (const dir of dirs) findings += (await findSecret(dir, values)).length;
console.log(JSON.stringify({ scopes: dirs.length, configuredNames: names.length + 1, valuesLoaded: values.length, findings }));
process.exit(findings ? 1 : 0);
