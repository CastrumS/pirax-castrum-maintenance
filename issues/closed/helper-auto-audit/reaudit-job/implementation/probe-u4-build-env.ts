// Synthetic boundary probe only; no environment file or network.
import {mkdtemp, mkdir, writeFile, readFile, chmod, rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {buildPlugin} from '/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/worktrees/reaudit-job/scripts/build-plugin.ts';
const root=await mkdtemp(join(tmpdir(),'reaudit-build-env-'));
try {
  const bin=join(root,'bin'); await mkdir(bin);
  for(const tool of ['zip','unzip']) {
    await writeFile(join(bin,tool),`#!/bin/sh\nif [ -n "$GH_TOKEN" ]; then printf present; else printf absent; fi > '${join(root,tool+'.env')}'\nexec /usr/bin/${tool} "$@"\n`);
    await chmod(join(bin,tool),0o700);
  }
  process.env.PATH=`${bin}:${process.env.PATH}`;
  process.env.GH_TOKEN='ghs_SYNTHETIC_BUILD_ENV_8F19';
  await buildPlugin({source:'/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/worktrees/reaudit-job/plugin/pirax-form-test',zip:join(root,'helper.zip')});
  console.log(JSON.stringify({case:'build-archive-child-scope',zipInherited:(await readFile(join(root,'zip.env'),'utf8'))==='present',unzipInherited:(await readFile(join(root,'unzip.env'),'utf8'))==='present'}));
} finally {await rm(root,{recursive:true,force:true});}
