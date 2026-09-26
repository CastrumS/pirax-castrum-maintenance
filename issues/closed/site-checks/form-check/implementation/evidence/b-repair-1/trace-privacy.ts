import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { readImapConfig } from '/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/worktrees/form-check/src/mail/config.ts';
import { secretRedactor, sanitizeTrace, findSecrets } from '/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/worktrees/form-check/src/forms/evidence.ts';
const dir=await mkdtemp(join(tmpdir(),'review-unicode-trace-'));
const credential='private-review-\u{1f512}-credential';
const encoded=credential.split('').map(c=>'\\u'+c.charCodeAt(0).toString(16).padStart(4,'0')).join('');
try {
 const raw=join(dir,'raw.zip'), safeDir=join(dir,'retained'); await mkdir(safeDir);
 // Valid JSON encoding of a synthetic action parameter, using standard UTF-16 surrogate escapes.
 await Bun.write(join(dir,'trace.trace'),'\u007b"type":"before","callId":"call@1","apiName":"page.fill","params":{"value":"'+encoded+'"}}\n');
 const zip=Bun.spawn(['zip','-q',raw,'trace.trace'],{cwd:dir,stdout:'ignore',stderr:'ignore'});
 if(await zip.exited!==0) throw new Error('fixture zip failed');
 const redact=secretRedactor('review-synthetic-token',[credential]);
 const target=join(safeDir,'trace.zip');
 await sanitizeTrace(raw,target,redact);
 const child=Bun.spawn(['unzip','-p',target,'trace.trace'],{stdout:'pipe',stderr:'ignore'});
 const text=await new Response(child.stdout).text(); if(await child.exited!==0) throw new Error('fixture unzip failed');
 const validConfig=readImapConfig({IMAP_HOST:'imap.example.test',IMAP_PORT:'993',IMAP_USER:'review@example.test',IMAP_PASSWORD:credential,IMAP_FOLDER:'Tests',IMAP_SPAM_FOLDER:'Spam'});
 const facts={configuredUnicodePasswordAccepted:validConfig.password===credential,sanitizeTraceRetainedArchive:true,decodedRetainedParameterStillEqualsCredential:JSON.parse(text).params.value===credential,findSecretsHits:(await findSecrets(safeDir,redact)).length,expected:'credential removed, or unsafe archive rejected'};
 await Bun.write(join(import.meta.dir,'trace-privacy.json'),JSON.stringify(facts,null,2)+'\n');
 console.log(JSON.stringify(facts));
 if(facts.decodedRetainedParameterStillEqualsCredential) process.exitCode=1;
} finally {await rm(dir,{recursive:true,force:true});}
