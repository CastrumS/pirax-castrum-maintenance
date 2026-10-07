// B's one-off acquisition proof. Emits only controlled version/digest/lifecycle facts; no URLs, paths or secrets.
import {mkdtemp, rm, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {acquirePackages, openOfficialVault, CIPHERTEXT} from "/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/worktrees/reaudit-job/scripts/reaudit/fetch.ts";
import {ReauditError} from "/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/worktrees/reaudit-job/scripts/reaudit/detect.ts";
import {readAuditedVersions} from "/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/worktrees/reaudit-job/scripts/plugin-source.ts";
const unchangedProbe = process.argv.includes("--observed-matrix");
const strictProof = process.argv.includes("--strict-boundary-proof");
const observed = unchangedProbe ? (await Bun.file(join(import.meta.dir, "evidence/live-acquisition.json")).json()).versions : undefined;
const directory = await mkdtemp(join(tmpdir(), "pirax-real-acquisition-"));
const started = new Date().toISOString();
let facts: object;
try {
  const result = await acquirePackages({
    pins: observed ?? readAuditedVersions(), directory,
    openVault: opts => openOfficialVault({...opts, ciphertext: CIPHERTEXT}),
  });
  const countsMatch = result.lifecycle.remainingBefore !== null && result.lifecycle.remainingBefore === result.lifecycle.remainingAfter;
  facts = {started, completed:new Date().toISOString(), outcome:result.status, versions:result.versions, lifecycle:result.lifecycle, activationCountsUnchanged:countsMatch,
    ...(result.status === "changed" ? {packages:Object.fromEntries(Object.entries(result.packages).map(([key,p]) => [key,{version:p.version,sha256:p.sha256}]))} : {})};
  if (!countsMatch || !result.lifecycle.deactivationConfirmed) process.exitCode = 1;
} catch (e) {
  facts = {started, completed:new Date().toISOString(), outcome:"failed", reason:e instanceof ReauditError ? e.message : "acquisition failed", ...(e instanceof ReauditError ? {lifecycle:e.lifecycle} : {})};
  process.exitCode = 1;
} finally {
  await rm(directory, {recursive:true, force:true});
}
await writeFile(join(import.meta.dir, strictProof ? "evidence/live-acquisition-strict.json" : unchangedProbe ? "evidence/live-acquisition-unchanged.json" : "evidence/live-acquisition.json"), JSON.stringify(facts,null,2)+"\n");
console.log(JSON.stringify(facts));
