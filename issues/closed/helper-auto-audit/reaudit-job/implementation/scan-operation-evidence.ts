import { findSecret } from '/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/worktrees/reaudit-job/test/plugin/artifacts.ts';
const names = ['GPLVAULT_LICENSE_KEY', 'GPLVAULT_PRODUCT_ID', 'GPLVAULT_UPDATER_PASSPHRASE', 'IMAP_PASSWORD', 'PIRAX_HELPER_SIGNING_KEY', 'FORM_TEST_TOKEN', 'GRAVITY_FORMS_ZIP', 'FLUENT_FORMS_PRO_ZIP'];
const values = names.flatMap(name => process.env[name] ? [process.env[name]!] : []);
// The prescribed recipient is public task data; do not classify that literal as a leaked username.
const user = process.env.IMAP_USER;
if (user && user !== 'piraxcastrum@gmail.com') values.push(user);
const hits = await findSecret('/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/open/helper-auto-audit/reaudit-job/implementation/evidence-u3', values);
console.log(JSON.stringify({scope:'evidence-u3 including repair logs', configuredNames: names.length, findings:hits.length}));
process.exit(hits.length ? 1 : 0);
