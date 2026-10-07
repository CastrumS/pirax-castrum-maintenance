// Synthetic, nonpublishing B integration probes. No environment file, real auth, or vendor request.
import {mkdtemp, mkdir, writeFile, readFile, rm, chmod} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {openOfficialVault} from '/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/worktrees/reaudit-job-u4/scripts/reaudit/fetch.ts';
import {scanEvidence} from '/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/worktrees/reaudit-job-u4/scripts/reaudit/privacy.ts';
const root=await mkdtemp(join(tmpdir(),'reaudit-boundary-probe-'));
try {
  const directory=join(root,'packages');
  let enoent=false;
  try { const v=await openOfficialVault({directory,env:{GPLVAULT_UPDATER_PASSPHRASE:'SYNTHETIC-not-a-real-passphrase'}}); await v.close(); }
  catch(e) { enoent=(e as {code?:string})?.code==='ENOENT'; }
  console.log(JSON.stringify({case:'run-created-parent-only',nestedDirectoryExists:existsSync(directory),driverFailsBeforeDecryptWithENOENT:enoent}));
  const bin=join(root,'bin'), evidence=join(root,'evidence'), input=join(root,'input'), record=join(root,'archive-env');
  await Promise.all([mkdir(bin),mkdir(evidence),mkdir(input)]);
  await writeFile(join(input,'clean.txt'),'synthetic safe artifact');
  const z=Bun.spawnSync(['/usr/bin/zip','-q',join(evidence,'trace.zip'),'clean.txt'],{cwd:input});
  if(z.exitCode!==0) throw new Error('zip probe setup failed');
  await writeFile(join(bin,'unzip'),`#!/bin/sh\nif [ -n "$GPLVAULT_LICENSE_KEY" ]; then printf present; else printf absent; fi > '${record}'\nexec /usr/bin/unzip "$@"\n`);
  await chmod(join(bin,'unzip'),0o700);
  process.env.PATH=`${bin}:${process.env.PATH}`;
  process.env.GPLVAULT_LICENSE_KEY='SYNTHETIC-archive-env-sentinel';
  const hits=await scanEvidence(evidence,['SYNTHETIC-archive-env-sentinel']);
  console.log(JSON.stringify({case:'archive-child-scope',syntheticLicenseInherited:(await readFile(record,'utf8'))==='present',artifactHits:hits.length}));
} finally { await rm(root,{recursive:true,force:true}); }
