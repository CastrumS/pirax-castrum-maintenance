import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { scanPageForms } from '/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/worktrees/form-check/src/forms/runner.ts';
import { reportStatus } from '/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/worktrees/form-check/src/report/html.ts';
import { challengeReason } from '/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/worktrees/form-check/src/capture.ts';
import { secretRedactor } from '/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/worktrees/form-check/src/forms/evidence.ts';
const out=import.meta.dir;
await mkdir(out,{recursive:true});
const body='<!doctype html><title>Just a moment...</title><script>window._cf_chl_opt={};</script><p>Checking your browser before accessing the site</p>';
const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch:()=>new Response(body,{headers:{'content-type':'text/html'}})});
try {
 const site={slug:'local',url:`http://127.0.0.1:${server.port}`,form_helper:false,mask:[],max_diff_pixel_ratio:0.01,pages:[{path:'/',mask:[]}]};
 const forms=await scanPageForms(site,site.pages[0]!,{runDir:join(out,'challenge'),navigationTimeoutMs:5000});
 const report={mode:'forms' as const,runId:'2026-09-26T18-00-00.000Z',sites:[{slug:site.slug,url:site.url,pages:[{path:'/',pageKey:'home',forms}]}]};
 const result={existingCaptureChallenge:challengeReason({},body),forms,status:reportStatus(report),expected:'explicit failed page-scan, not empty/pass'};
 await Bun.write(join(out,'challenge.json'),JSON.stringify(result,null,2)+'\n');
 console.log(JSON.stringify(result));
 if(result.status==='pass') process.exitCode=1;
} finally {server.stop(true);}
// Synthetic strings only; disclose booleans, never the plaintext or escaped credential.
const token='review-synthetic-token', credential='private-review-\u{1f512}-credential';
const unicode=credential.split('').map(c=>'\\u'+c.charCodeAt(0).toString(16).padStart(4,'0')).join('');
const redact=secretRedactor(token,[credential]);
const privacy={rawCredentialRedacted:redact(credential)!==credential,jsonEscapedSurrogateCredentialRedacted:redact(unicode)!==unicode,expected:'both true'};
await Bun.write(join(out,'unicode-privacy.json'),JSON.stringify(privacy,null,2)+'\n');
console.log(JSON.stringify(privacy));
if(!privacy.jsonEscapedSurrogateCredentialRedacted) process.exitCode=1;
