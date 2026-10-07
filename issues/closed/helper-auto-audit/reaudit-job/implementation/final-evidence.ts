// B evidence retention/scan. Environment files are never opened or copied; values enter only via Bun's loader.
import {cp,mkdir,readFile,readdir,rm,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {findSecret} from '/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/worktrees/reaudit-job/test/plugin/artifacts.ts';
import {secretValues} from '/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/worktrees/reaudit-job/scripts/reaudit/privacy.ts';
const lane='/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/worktrees/reaudit-job';
const snapshot=join(import.meta.dir,'evidence/final-before.json');
async function scopes(){const result:string[]=[];for(const root of ['artifacts/plugin','runs'])for(const e of await readdir(join(lane,root),{withFileTypes:true}).catch(()=>[]))if(e.isDirectory())result.push(`${root}/${e.name}`);return result.sort();}
if(process.argv.includes('--before')){
 await writeFile(snapshot,JSON.stringify(await scopes(),null,2)+'\n');console.log('final evidence baseline recorded');
}else{
 const old=new Set<string>(JSON.parse(await readFile(snapshot,'utf8')));
 const fresh=(await scopes()).filter(s=>!old.has(s));
 if(!fresh.some(s=>s.startsWith('artifacts/plugin/compatibility-'))||!fresh.some(s=>s.startsWith('artifacts/plugin/updates-')))throw new Error('expected final native scopes missing');
 const targetRoot=join(import.meta.dir,'evidence-final/native');let placeholders=0;
 for(const scope of fresh){
  if(!/^(?:artifacts\/plugin|runs)\/[a-zA-Z0-9_.:-]+$/.test(scope))throw new Error('invalid evidence scope');
  const source=join(lane,scope);
  for(const e of await readdir(source,{recursive:true,withFileTypes:true}))if(e.name==='.env'||e.name.startsWith('.env.')||e.isSymbolicLink())throw new Error('forbidden retention entry');
  const target=join(targetRoot,scope);await mkdir(target,{recursive:true});await cp(source,target,{recursive:true});
  if(scope.startsWith('runs/forms-report-tests-'))for(const e of await readdir(target,{recursive:true,withFileTypes:true}))if(e.isFile()&&e.name.endsWith('.zip')){
   const p=join(e.parentPath,e.name);if((await readFile(p)).equals(Buffer.from('local trace'))){await rm(p);placeholders++;}
  }
 }
 const extra=['S3_ACCESS_KEY_ID','S3_SECRET_ACCESS_KEY','SMTP_PASSWORD','SMTP_USER','FORM_TEST_ADDRESS'].flatMap(n=>process.env[n]&&process.env[n]!=='piraxcastrum@gmail.com'?[process.env[n]!]:[]);
 const values=[...new Set(secretValues(process.env,extra))];
 const scanRoots=[join(import.meta.dir,'evidence-final'),join(import.meta.dir,'evidence'),join(import.meta.dir,'evidence-u4')];
 let findings=0;for(const dir of scanRoots)findings+=(await findSecret(dir,values)).length;
 const result={nativeScopes:fresh.length,syntheticNonZipPlaceholdersOmitted:placeholders,scanRoots:scanRoots.length,valuesLoaded:values.length,findings};
 await writeFile(join(import.meta.dir,'evidence-final/retention.json'),JSON.stringify({...result,scopes:fresh},null,2)+'\n');
 console.log(JSON.stringify(result));process.exitCode=findings?1:0;
}
