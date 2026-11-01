import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {BuildQuarantine} from '../src/build-quarantine.js';
const sha=s=>crypto.createHash('sha256').update(s).digest('hex');
const owner={owner:true};
const profile={buildVmId:'build-vm',runtimeVmId:'public-vm',agentProfile:'owner-chosen'};
const round={id:'round-1',phase:'approved',selected:[1],approvedInputHash:sha('approved idea')};
// Deliberately invalid game code: none of these tests may execute it on the host.
const source='globalThis.__quarantineExecuted = true; throw Error("must not execute");';
function fixture(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'va-quarantine-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const file=path.join(dir,'store.json');const q=new BuildQuarantine(file);return {q,file};}
function receive(q){const job=q.issue(owner,round,profile);return q.receive(owner,job.id,{source,expectedCodeSha256:sha(source)});}
function report(job,extra={}){return {artifactHash:job.artifactHash,testNonce:job.testNonce,testVmId:'quarantine-vm',isolatedVmAttested:true,evidenceSha256:sha('operator evidence'),checks:[{name:'SDK smoke in guest',passed:true}],...extra};}
function tested(q){let job=receive(q);job=q.beginTest(owner,job.id,job.artifactHash);return q.recordTest(owner,job.id,report(job));}
function approve(q,job,extra={}){return q.approve(owner,job.id,{artifactHash:job.artifactHash,reportHash:job.reportHash,rightsAttested:true,...extra},round);}

test('tickets require streamer approval and distinct build/runtime VMs',t=>{
 const {q}=fixture(t);
 assert.throws(()=>q.issue({},round,profile),/Streamer/);
 assert.throws(()=>q.issue(owner,{...round,phase:'voting'},profile),/Approved/);
 assert.throws(()=>q.issue(owner,round,{...profile,buildVmId:'public-vm'}),/differ/);
 const job=q.issue(owner,round,profile);assert.equal(job.state,'awaiting-artifact');
 assert.throws(()=>q.issue(owner,round,profile),/already/);
});
test('candidate bytes remain inert, private, immutable and idempotent across restart',t=>{
 const {q,file}=fixture(t);const job=receive(q);
 assert.equal(globalThis.__quarantineExecuted,undefined);
 assert.equal(fs.statSync(file).mode&0o777,0o600);
 assert.equal(q.list()[0].source,undefined);
 assert.equal(q.receive(owner,job.id,{source,expectedCodeSha256:sha(source)}).revision,job.revision);
 assert.throws(()=>q.receive(owner,job.id,{source:source+' ',expectedCodeSha256:sha(source+' ')}),/immutable/);
 assert.equal(new BuildQuarantine(file).inspect(job.id).source,source);
});
test('wrong source hash, UTF-8 byte limit and malformed candidates fail without changing state',t=>{
 const {q}=fixture(t);const job=q.issue(owner,round,profile);
 for(const body of [{source,expectedCodeSha256:sha('other')},{source:'é'.repeat(70000),expectedCodeSha256:sha('é'.repeat(70000))},{source:{},expectedCodeSha256:sha('')}])assert.throws(()=>q.receive(owner,job.id,body));
 assert.equal(q.inspect(job.id).state,'awaiting-artifact');
});
test('approval binds exact source, round, resource manifest and test report',t=>{
 const {q,file}=fixture(t);const job=tested(q);
 for(const extra of [{artifactHash:sha('wrong')},{reportHash:sha('wrong')},{rightsAttested:false}])assert.throws(()=>approve(q,job,extra),/Review/);
 assert.throws(()=>q.approve(owner,job.id,{artifactHash:job.artifactHash,reportHash:job.reportHash,rightsAttested:true},{...round,approvedInputHash:sha('changed')}),/changed/);
 assert.equal(approve(q,job).state,'approved');
 assert.equal(new BuildQuarantine(file).inspect(job.id).state,'approved');
});
test('failed checks, missing isolation attestation and runtime/build VM tests cannot approve',t=>{
 const {q}=fixture(t);let job=receive(q);job=q.beginTest(owner,job.id,job.artifactHash);
 for(const extra of [{isolatedVmAttested:false},{testVmId:profile.buildVmId},{testVmId:profile.runtimeVmId},{checks:[]},{checks:[{name:'fake',passed:'true'}]}])assert.throws(()=>q.recordTest(owner,job.id,report(job,extra)));
 job=q.recordTest(owner,job.id,report(job,{checks:[{name:'SDK smoke',passed:false}]}));
 assert.equal(job.report.passed,false);assert.throws(()=>approve(q,job),/Review/);
});
test('restart during testing requires retest and rejects delayed success',t=>{
 const {q,file}=fixture(t);let job=receive(q);job=q.beginTest(owner,job.id,job.artifactHash);const old=report(job);
 const recovered=new BuildQuarantine(file);assert.equal(recovered.inspect(job.id).state,'reconcile-required');
 assert.throws(()=>recovered.recordTest(owner,job.id,old),/restart/);
 const next=recovered.beginTest(owner,job.id,job.artifactHash);assert.notEqual(next.testNonce,job.testNonce);
 assert.throws(()=>recovered.recordTest(owner,job.id,old),/Stale/);
 assert.equal(recovered.recordTest(owner,job.id,report(next)).state,'tested');
});
test('retesting revokes approval; cancelled/rejected tickets reject late reports and artifacts',t=>{
 const {q}=fixture(t);let job=tested(q);job=approve(q,job);
 job=q.beginTest(owner,job.id,job.artifactHash);assert.equal(job.approval,undefined);const late=report(job);
 q.close(owner,job.id,'cancelled');assert.throws(()=>q.recordTest(owner,job.id,late),/No active/);
 assert.throws(()=>q.receive(owner,job.id,{source,expectedCodeSha256:sha(source)}),/terminal/);
 const replacement=q.issue(owner,round,profile);q.close(owner,replacement.id,'cancelled');
 assert.equal(q.issue(owner,round,profile).state,'awaiting-artifact');
});
test('corrupted source or test report blocks recovery without overwriting evidence',t=>{
 const {q,file}=fixture(t);const job=tested(q);const original=fs.readFileSync(file,'utf8');
 for(const mutate of [j=>j.source+=' ',j=>j.report.checks[0].passed=false,j=>j.artifactHash=sha('changed')]){
  const data=JSON.parse(original);mutate(data.jobs[0]);fs.writeFileSync(file,JSON.stringify(data));const before=fs.readFileSync(file,'utf8');
  assert.throws(()=>new BuildQuarantine(file),/integrity|Stale/);assert.equal(fs.readFileSync(file,'utf8'),before);
 }
 assert.equal(job.state,'tested');
});
test('persistence failure rolls back the mutation and preserves retry',t=>{
 const {q,file}=fixture(t);const job=receive(q);q.file=path.dirname(file);
 assert.throws(()=>q.beginTest(owner,job.id,job.artifactHash));assert.equal(q.inspect(job.id).state,'quarantined');
 q.file=file;assert.equal(q.beginTest(owner,job.id,job.artifactHash).state,'testing');
});

test('rejection before artifact receipt is durable and permits a replacement ticket',t=>{
 const {q,file}=fixture(t);const job=q.issue(owner,round,profile);
 assert.equal(q.close(owner,job.id,'rejected').state,'rejected');
 assert.equal(new BuildQuarantine(file).inspect(job.id).state,'rejected');
 assert.equal(q.issue(owner,round,profile).state,'awaiting-artifact');
});
test('retest retains failed evidence, interrupted attempts and terminal test decisions',t=>{
 const {q,file}=fixture(t);let job=receive(q);job=q.beginTest(owner,job.id,job.artifactHash);
 job=q.recordTest(owner,job.id,report(job,{checks:[{name:'original failed smoke',passed:false}]}));const failed=job.reportHash;
 job=q.beginTest(owner,job.id,job.artifactHash);
 assert.equal(job.attempts[0].reportHash,failed);assert.equal(job.attempts[0].report.checks[0].passed,false);
 const recovered=new BuildQuarantine(file);job=recovered.inspect(job.id);
 assert.equal(job.attempts[1].state,'interrupted');
 job=recovered.beginTest(owner,job.id,job.artifactHash);job=recovered.close(owner,job.id,'cancelled');
 assert.equal(job.attempts[2].state,'cancelled');assert.match(fs.readFileSync(file,'utf8'),/original failed smoke/);
});

test('resource manifest is copied into the immutable version and checked after restart',async t=>{
 const {CreatorAssets}=await import('../src/creator-assets.js');
 const {q,file}=fixture(t);const registry=new CreatorAssets(path.join(path.dirname(file),'assets.json'));
 const manifest=registry.manifest([]);const input={...round,resourceManifest:manifest};
 let job=q.issue(owner,input,profile);manifest.fingerprints='changed outside quarantine';
 job=q.receive(owner,job.id,{source,expectedCodeSha256:sha(source)});
 assert.notEqual(job.resources.fingerprints,manifest.fingerprints);
 const other=fixture(t).q;const bare=receive(other);assert.notEqual(job.artifactHash,bare.artifactHash);
 const stored=JSON.parse(fs.readFileSync(file));stored.jobs[0].resources.fingerprints='tampered';fs.writeFileSync(file,JSON.stringify(stored));
 assert.throws(()=>new BuildQuarantine(file),/manifest was altered/);
});
