import {cp,mkdir,readFile,readdir,rm,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
const worker='/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/worktrees/reaudit-job-u4';
const dest=join(import.meta.dir,'evidence-u4/native');
const scopes=(await readFile(join(import.meta.dir,'evidence-u4/scan-evidence-final.scopes'),'utf8')).trim().split('\n');
let placeholders=0;
for(const scope of scopes){
 if(!/^(?:artifacts\/plugin|runs)\/[a-zA-Z0-9_.:-]+$/.test(scope))throw new Error('invalid retention scope');
 const src=join(worker,scope);
 for(const e of await readdir(src,{recursive:true,withFileTypes:true})) if(e.name==='.env'||e.name.startsWith('.env.')||e.isSymbolicLink())throw new Error('forbidden retention entry');
 const target=join(dest,scope); await mkdir(target,{recursive:true}); await cp(src,target,{recursive:true});
 if(scope.startsWith('runs/forms-report-tests-')) for(const e of await readdir(target,{recursive:true,withFileTypes:true})){
   if(e.isFile()&&e.name.endsWith('.zip')){
     const p=join(e.parentPath,e.name), bytes=await readFile(p);
     if(bytes.equals(Buffer.from('local trace'))){await rm(p);placeholders++;}
   }
 }
}
await writeFile(join(dest,'retention.json'),JSON.stringify({scopes:scopes.length,syntheticNonZipPlaceholdersOmitted:placeholders,sourceCommit:'03612dff38eb361ce978a916f7a523dc1b49a70b'},null,2)+'\n');
console.log(JSON.stringify({scopes:scopes.length,syntheticNonZipPlaceholdersOmitted:placeholders}));
