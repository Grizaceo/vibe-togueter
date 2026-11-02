import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import crypto from 'node:crypto';import {IdeaRounds} from '../src/idea-rounds.js';import {BuildQuarantine} from '../src/build-quarantine.js';import {StudioBuilds} from '../src/studio-builds.js';
const owner={owner:true,name:'owner',source:'twitch'},sha=v=>crypto.createHash('sha256').update(v).digest('hex'),source='// Inert synthetic source; this test never executes it.';
function fixture(t,{enabled=true,onChange=()=>{}}={}){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'va-studio-worker-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const rounds=new IdeaRounds(path.join(dir,'rounds.json'));rounds.open(owner);rounds.propose({name:'alice',source:'twitch'},'A cooperative lantern garden');rounds.startVoting(owner);rounds.vote({name:'bob',source:'twitch'},1);rounds.finishVoting(owner);rounds.approve(owner,{roundId:rounds.current().id,reviewToken:rounds.reviewToken()});
 const q=new BuildQuarantine(path.join(dir,'quarantine.json')),calls={ready:0,build:0,test:0,cleanup:0};
 const adapter={kind:'mock',ready:async()=>{calls.ready++;return {buildVmId:'mock-builder',expiresAt:Date.now()+1800000};},build:async()=>{calls.build++;return {kind:'mock',vmId:'mock-builder',source,codeSha256:sha(source),cleanupConfirmed:true,evidence:{kind:'mock-construction'}};},test:async ticket=>{calls.test++;return {kind:'mock',cleanupConfirmed:true,report:{artifactHash:ticket.artifactHash,testNonce:ticket.testNonce,testVmId:'mock-separate-tests',isolatedVmAttested:true,evidenceSha256:sha('mock-test'),checks:[{name:'synthetic check, not real VM evidence',passed:true}]},evidence:{kind:'mock-tests'}};},cleanup:async()=>{calls.cleanup++;return {confirmed:true,kind:'mock-cleanup'};}};
 const file=path.join(dir,'jobs.json'),options={enabled,adapter,rounds,quarantine:q,evidenceDir:path.join(dir,'evidence'),onChange},jobs=new StudioBuilds(file,options),grant={roundId:rounds.current().id,approvedInputHash:rounds.current().approvedInputHash};return {dir,file,options,rounds,q,calls,adapter,jobs,grant};
}
const drain=async jobs=>{if(jobs.running)await jobs.running.promise;};
test('disabled worker and stale approval cannot spend, issue a ticket or change the live round',async t=>{
 const f=fixture(t,{enabled:false});await assert.rejects(f.jobs.dispatch(f.grant),/disabled/);assert.equal(f.calls.ready,0);assert.equal(f.q.list().length,0);f.jobs.enabled=true;await assert.rejects(f.jobs.dispatch({...f.grant,approvedInputHash:'0'.repeat(64)}),/approved/);assert.equal(f.calls.build,0);assert.equal(f.rounds.current().phase,'approved');
});
test('approved inputs flow to inert quarantine, separate tests and exact reviewed evidence with explicit mock label',async t=>{
 const f=fixture(t);await f.jobs.dispatch(f.grant);await drain(f.jobs);assert.equal(f.jobs.public().phase,'tested');assert.throws(()=>f.jobs.assertRoundCanAdvance(),/exact artifact/);assert.equal(f.rounds.current().phase,'completed');const {ticket}=f.jobs.inspect(f.jobs.public().id);assert.equal(ticket.source,source);assert.equal(ticket.communityCredit.voterCount,1);assert.equal(f.calls.build,1);assert.equal(f.calls.test,1);assert.equal(f.jobs.public().liveRuntime,false);
 assert.throws(()=>f.jobs.publish(f.jobs.public().id,{artifactHash:ticket.artifactHash,reportHash:'0'.repeat(64),rightsAttested:true},owner));f.jobs.publish(f.jobs.public().id,{artifactHash:ticket.artifactHash,reportHash:ticket.reportHash,rightsAttested:true},owner);assert.equal(f.jobs.public().phase,'reviewed-publication');assert.doesNotThrow(()=>f.jobs.assertRoundCanAdvance());const published=JSON.parse(fs.readFileSync(path.join(f.dir,'evidence',f.jobs.job(f.jobs.public().id).publicationFile)));assert.equal(published.adapter,'mock');assert.equal(published.liveRuntime,false);assert.equal(published.candidateExecutedOnHost,false);
});
test('cancel remains pending until actual cleanup confirmation and rejects another writer',async t=>{
 const f=fixture(t);let cleaned;const cleanup=new Promise(r=>cleaned=r);f.adapter.build=async(_,{signal})=>new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(Error('cancel')),{once:true}));f.adapter.cleanup=async()=>cleanup;
 await f.jobs.dispatch(f.grant);const id=f.jobs.public().id;await f.jobs.cancel(id);assert.equal(f.jobs.public().phase,'cancel-requested');await assert.rejects(f.jobs.dispatch(f.grant),/slot/);cleaned({confirmed:true});await drain(f.jobs);assert.equal(f.jobs.public().phase,'cancelled');assert.equal(f.q.inspect(f.jobs.job(id).ticketId).state,'cancelled');assert.equal(f.rounds.current().phase,'awaiting-approval');
});
test('unknown cleanup blocks replacement; restart observation never reruns a model',async t=>{
 const f=fixture(t);f.adapter.cleanup=async()=>({confirmed:false});await f.jobs.dispatch(f.grant);await drain(f.jobs);assert.equal(f.jobs.public().phase,'reconcile-required');const built=f.calls.build;const restored=new StudioBuilds(f.file,f.options);assert.equal(restored.public().phase,'reconcile-required');await assert.rejects(restored.dispatch(f.grant),/slot/);assert.equal(f.calls.build,built);await assert.rejects(restored.reconcile(restored.public().id),/unconfirmed/);f.adapter.cleanup=async()=>({confirmed:true});await restored.reconcile(restored.public().id);assert.equal(restored.public().phase,'cancelled');
});
test('failed journal write does not start construction or lose canonical input approval',async t=>{
 const f=fixture(t);f.jobs.save=()=>{throw Error('disk full');};await assert.rejects(f.jobs.dispatch(f.grant),/disk full/);assert.equal(f.calls.build,0);assert.equal(f.rounds.current().phase,'approved');assert.equal(f.q.list()[0].state,'cancelled');
});
test('notification failure cannot undo a committed job; failed tests never publish',async t=>{
 const f=fixture(t,{onChange:()=>{throw Error('observer failure');}});const test=f.adapter.test;f.adapter.test=async ticket=>{const result=await test(ticket);result.report.checks[0].passed=false;return result;};await f.jobs.dispatch(f.grant);await drain(f.jobs);assert.equal(f.jobs.public().phase,'tests-failed');assert.throws(()=>f.jobs.publish(f.jobs.public().id,{},owner),/tested/);assert.equal(new StudioBuilds(f.file,f.options).public().phase,'tests-failed');
});

test('reconciliation is idempotent across a terminal quarantine ticket and an interrupted round write',async t=>{
 const f=fixture(t);f.adapter.build=async()=>{throw Error('synthetic build failure');};const finish=f.rounds.finishBuild.bind(f.rounds);let failOnce=true;f.rounds.finishBuild=(...args)=>{if(failOnce){failOnce=false;throw Error('synthetic round disk failure');}return finish(...args);};
 await f.jobs.dispatch(f.grant);await drain(f.jobs);const id=f.jobs.public().id;assert.equal(f.jobs.public().phase,'reconcile-required');assert.equal(f.q.inspect(f.jobs.job(id).ticketId).state,'rejected');
 await f.jobs.reconcile(id);assert.equal(f.jobs.public().phase,'cancelled');assert.equal(f.q.inspect(f.jobs.job(id).ticketId).state,'rejected');assert.equal(f.rounds.current().phase,'awaiting-approval');
});

test('one owner spending approval cannot silently fund another job',async t=>{
 const f=fixture(t),ready=f.adapter.ready;f.adapter.ready=async()=>({...await ready(),approvalId:'single-owner-allocation'});await f.jobs.dispatch(f.grant);await drain(f.jobs);
 f.rounds.open(owner);f.rounds.propose({name:'carol',source:'twitch'},'A new marble idea');f.rounds.startVoting(owner);f.rounds.finishVoting(owner);f.rounds.select(owner,[1]);f.rounds.approve(owner,{roundId:f.rounds.current().id,reviewToken:f.rounds.reviewToken()});
 await assert.rejects(f.jobs.dispatch({roundId:f.rounds.current().id,approvedInputHash:f.rounds.current().approvedInputHash}),/spending approval/);assert.equal(f.calls.build,1);
});
test('cancellation can retry after quarantine closure succeeded but the worker journal write failed',async t=>{
 const f=fixture(t);await f.jobs.dispatch(f.grant);await drain(f.jobs);const id=f.jobs.public().id,save=f.jobs.save.bind(f.jobs);let once=true;f.jobs.save=()=>{if(once){once=false;throw Error('interrupted studio journal write');}return save();};
 await assert.rejects(f.jobs.cancel(id));assert.equal(f.q.inspect(f.jobs.job(id).ticketId).state,'cancelled');await f.jobs.cancel(id);assert.equal(f.jobs.public().phase,'cancelled');
});
test('exact approval survives evidence-write interruption without requiring a different artifact approval',async t=>{
 const f=fixture(t);await f.jobs.dispatch(f.grant);await drain(f.jobs);const id=f.jobs.public().id,{ticket}=f.jobs.inspect(id),approval={artifactHash:ticket.artifactHash,reportHash:ticket.reportHash,rightsAttested:true};
 const evidenceDir=f.jobs.evidenceDir;f.jobs.evidenceDir=f.file;assert.throws(()=>f.jobs.publish(id,approval,owner));assert.equal(f.q.inspect(ticket.id).state,'approved');f.jobs.evidenceDir=evidenceDir;f.jobs.publish(id,approval,owner);assert.equal(f.jobs.public().phase,'reviewed-publication');
});
