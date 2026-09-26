import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { secretRedactor } from '/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/worktrees/form-check/src/forms/evidence.ts';
import { createStore } from '/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/worktrees/form-check/src/store.ts';
const started = Date.parse('2026-09-26T16:45:40Z');
const out = '/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/open/site-checks/form-check/implementation/evidence/b-final';
const directories = [out];
for (const parent of ['runs', 'artifacts/plugin']) for (const e of await readdir(parent, {withFileTypes:true})) {
  const path = join(parent,e.name);
  if (e.isDirectory() && (await stat(path)).birthtimeMs >= started) directories.push(path);
}
const redact = secretRedactor();
let files=0,archives=0,uploadExclusionSentinels=0,unsafe=0;
const roots=new Set<string>();
const summaries:string[]=[];
for (const dir of directories) for (const e of await readdir(dir,{recursive:true,withFileTypes:true})) {
  if (!e.isFile()) continue;
  const path=join(e.parentPath,e.name);
  if (path===join(out,'audit.ts') || path===join(out,'audit.json')) continue;
  files++;
  let text:string;
  if (e.name.endsWith('.zip') && await Bun.file(path).text() === 'local trace') {
    // Explicit reportAssets upload-exclusion fixture, not browser evidence; scan its text too.
    uploadExclusionSentinels++; text='local trace';
  } else if (e.name.endsWith('.zip')) {
    archives++;
    const p=Bun.spawn(['unzip','-p',path],{stdout:'pipe',stderr:'ignore'});
    text=await new Response(p.stdout).text();
    if (await p.exited!==0) throw new Error('Archive audit failed');
  } else text=await Bun.file(path).text();
  if (redact(text)!==text || redact(path)!==path || /X-Amz-(?:Signature|Credential)=/i.test(text)) unsafe++;
  if (e.name==='summary.json') {
    summaries.push(path);
    const data=JSON.parse(text);
    if(typeof data.root==='string') {
      if(!/^test\/(?:forms|visual)-[A-Za-z0-9.-]+\/$/.test(data.root)) throw new Error('Unsafe audit root');
      roots.add(data.root);
    }
  }
}
const cleanup=[];
for(const root of roots) cleanup.push({root,remaining:(await createStore({root}).list('')).length});
const result={directories,files,archives,uploadExclusionSentinels,unsafe,summaries,cleanup,ok:unsafe===0&&cleanup.every(c=>c.remaining===0)};
await Bun.write(join(out,'audit.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({files,archives,unsafe,roots:cleanup.length,remaining:cleanup.reduce((n,c)=>n+c.remaining,0),ok:result.ok}));
if(!result.ok) process.exitCode=1;
