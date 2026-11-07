import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {VMBuilderPreflight,TRIAL_PROFILE} from '../src/vm-builder-preflight.js';
import crypto from 'node:crypto';
const id='sb-01m6yyyyyyyyyyyyyyyyyyyyyy';
function fixture(t,{receipt={},ambiguous=false,deleteFails=false,mismatch=false,initialStatus='running'}={}){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'va-vm-probe-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 let vm;const calls=[];
 const run=async(command,args)=>{
  assert.equal(command,'createos');calls.push(args);
  let result;
  if(args[1]==='list')result=vm?[vm]:[];
  else if(args[1]==='create'){
   vm={id,name:args[args.indexOf('--name')+1],created_at:new Date().toISOString(),shape:TRIAL_PROFILE.shape,rootfs:TRIAL_PROFILE.rootfs,ingress_enabled:false,status:initialStatus};
   if(ambiguous)throw Error('lost create reply');result=vm;
  }else if(args[1]==='exec')result={platform:'linux',arch:'x64',node:'v24.1.0',codex:'codex-cli 0.166.0',personalAuthPresent:false,credentialEnvironmentPresent:false,...receipt};
  else if(args[1]==='get')result=mismatch?{...vm,name:'foreign-game'}:vm;
  else if(args[1]==='rm'){if(deleteFails)throw Error('network failed');vm.status='destroyed';result={ok:true};}
  else throw Error('Unexpected CLI operation');
  return {stdout:JSON.stringify(result)};
 };
 const file=path.join(dir,'probe.json');return {worker:new VMBuilderPreflight(file,{run}),file,run,calls};
}
test('fresh private VM preflight runs only fixed probe and confirms destruction',async t=>{
 const {worker,calls,file}=fixture(t);const result=await worker.preflight();
 assert.equal(result.phase,'released');assert.equal(result.providerTerminalStatus,'destroyed');assert.equal(result.result.modelRequested,'gpt-6.1-terra');assert.equal(result.result.modelAuthenticated,false);
 const create=calls.find(a=>a[1]==='create');assert.ok(create[create.indexOf('--name')+1].length<=22,'provider accepts at most 22 characters');assert.ok(!create.includes('--ingress'));assert.ok(!create.includes('--env'));assert.equal(create.filter(a=>a==='--egress').length,4);
 assert.equal(calls.filter(a=>a[1]==='rm').length,1);assert.equal(fs.statSync(file).mode&0o777,0o600);
});
test('failed guest checks still destroy the exact fresh VM',async t=>{
 const {worker,calls}=fixture(t,{receipt:{personalAuthPresent:true}});await assert.rejects(worker.preflight(),/incomplete/);
 assert.equal(worker.state.phase,'released');assert.equal(calls.filter(a=>a[1]==='rm').length,1);
});
test('lost creation response reconciles by unique journaled name without a second create',async t=>{
 const {worker,calls}=fixture(t,{ambiguous:true});await assert.rejects(worker.preflight(),/incomplete/);
 assert.equal(worker.state.phase,'released');assert.equal(calls.filter(a=>a[1]==='create').length,1);assert.equal(worker.state.id,id);
});
test('cleanup failure survives restart and blocks automatic replacement',async t=>{
 const {worker,file,run,calls}=fixture(t,{deleteFails:true});await assert.rejects(worker.preflight(),/cleanup/);
 const recovered=new VMBuilderPreflight(file,{run});assert.equal(recovered.state.phase,'cleanup-required');await assert.rejects(recovered.preflight(),/Unreconciled/);
 assert.equal(calls.filter(a=>a[1]==='create').length,1);
});
test('provider identity mismatch cannot destroy a foreign VM',async t=>{
 const {worker,calls}=fixture(t,{mismatch:true});await assert.rejects(worker.preflight(),/cleanup/);assert.equal(calls.filter(a=>a[1]==='rm').length,0);
});
test('pre-cancelled preflight makes no provider mutation or journal',async t=>{
 const {worker,file,calls}=fixture(t);const controller=new AbortController();controller.abort();await assert.rejects(worker.preflight({signal:controller.signal}));
 assert.equal(calls.length,0);assert.equal(fs.existsSync(file),false);
});

test('failed provider VM still needs explicit destruction before release',async t=>{
 const {worker,calls}=fixture(t,{initialStatus:'failed'});const result=await worker.preflight();
 assert.equal(calls.filter(a=>a[1]==='rm').length,1);assert.equal(result.providerTerminalStatus,'destroyed');
});

test('explicit login preparation retains only the fresh VM and restart can release it',async t=>{
 const {worker,file,run,calls}=fixture(t);const session=await worker.preflight({retainForLogin:true});
 assert.equal(session.phase,'awaiting-login');assert.equal(calls.filter(a=>a[1]==='rm').length,0);
 const recovered=new VMBuilderPreflight(file,{run});await assert.rejects(recovered.preflight(),/Unreconciled/);
 assert.equal((await recovered.release()).phase,'released');assert.equal(calls.filter(a=>a[1]==='rm').length,1);
});

test('journal failure after successful probe cannot retain an unconfirmed login VM',async t=>{
 const {worker,calls}=fixture(t);const save=worker.save.bind(worker);
 worker.save=()=>{if(worker.state?.phase==='awaiting-login')throw Error('disk write failed');save();};
 await assert.rejects(worker.preflight({retainForLogin:true}));
 assert.equal(calls.filter(a=>a[1]==='rm').length,1);assert.equal(worker.state.phase,'released');
});

test('persistent disk outage cannot prevent remote destruction of the verified trial VM',async t=>{
 const {worker,calls}=fixture(t);const save=worker.save.bind(worker);let broken=false;
 worker.save=()=>{if(worker.state?.phase==='probing')broken=true;if(broken)throw Error('persistent disk outage');save();};
 await assert.rejects(worker.preflight({retainForLogin:true}),/cleanup/);
 assert.equal(calls.filter(a=>a[1]==='rm').length,1);assert.equal(worker.state.phase,'cleanup-required');assert.equal(worker.state.providerTerminalStatus,'destroyed');
});

test('build dispatch rejects absent/nonfinite expiry and unconfirmed timer identity',async()=>{
 const {validateBuildSession}=await import('../src/vm-builder-preflight.js');const now=Date.now();const good={phase:'awaiting-login',expiresAt:now+15*60*1000,cleanupUnit:'vibe-arena-builder-123456789abc'};
 assert.equal(validateBuildSession(good,now),good.cleanupUnit);
 for(const extra of [{expiresAt:undefined},{expiresAt:NaN},{expiresAt:Infinity},{expiresAt:now+100},{phase:'released'},{cleanupUnit:'other-service'}])assert.throws(()=>validateBuildSession({...good,...extra},now));
});

test('a trusted independent-lease hook runs before provider creation and a failed hook creates nothing',async t=>{
 const first=fixture(t);let armed=false;const run=first.worker.run;first.worker.run=async(command,args,options)=>{if(args[1]==='create')assert.equal(armed,true);return run(command,args,options);};await first.worker.preflight({beforeCreate:async state=>{assert.equal(state.creationRequested,false);assert.equal(first.calls.some(c=>c[1]==='create'),false);armed=true;}});
 const second=fixture(t);await assert.rejects(second.worker.preflight({beforeCreate:async()=>{throw Error('lease supervisor unavailable');}}),/incomplete/);assert.equal(second.calls.some(c=>c[1]==='create'),false);assert.equal(second.worker.state.phase,'released');assert.equal(second.worker.state.providerTerminalStatus,'not-created');
});
test('a failing CLI call retains only sizes and hashes, never raw output',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'va-vm-diag-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const file=path.join(dir,'probe.json'),secret='sk-fixture-SECRET-7f3a',stdout='out '+secret+' out',stderr='err '+secret+' err';
 const run=async()=>{const e=Error('cli failed');e.code=7;e.signal='SIGKILL';e.killed=true;e.stdout=stdout;e.stderr=stderr;throw e;};
 const worker=new VMBuilderPreflight(file,{run});
 await assert.rejects(worker.cli(['sandbox','get','sb-x']));
 const text=fs.readFileSync(file+'.diagnostic.json','utf8');
 assert.ok(!text.includes(secret));
 const diag=JSON.parse(text);
 assert.equal(diag.operation,'get');assert.equal(diag.exit,7);assert.equal(diag.signal,'SIGKILL');assert.equal(diag.killed,true);
 assert.equal(diag.stdoutBytes,Buffer.byteLength(stdout));assert.equal(diag.stderrBytes,Buffer.byteLength(stderr));
 assert.equal(diag.stdoutSha256,crypto.createHash('sha256').update(stdout).digest('hex'));
 assert.equal(diag.stderrSha256,crypto.createHash('sha256').update(stderr).digest('hex'));
 assert.equal(fs.existsSync(file+'.exec-output.txt'),false);
});
test('successful exec/create calls never write a raw exec-output file',async t=>{
 const {worker,file}=fixture(t);await worker.preflight();
 assert.equal(fs.existsSync(file+'.exec-output.txt'),false);
});
test('a probe receipt with an extra key or wrong type fails without storing raw values',async t=>{
 const extra=fixture(t,{receipt:{unexpected:'value'}});await assert.rejects(extra.worker.preflight(),/incomplete/);
 assert.equal(extra.worker.state.probeReceipt,undefined);assert.equal(extra.calls.filter(a=>a[1]==='rm').length,1);
 const wrong=fixture(t,{receipt:{node:123}});await assert.rejects(wrong.worker.preflight(),/incomplete/);
 assert.equal(wrong.worker.state.probeReceipt,undefined);assert.equal(wrong.calls.filter(a=>a[1]==='rm').length,1);
});
test('destruction observes the same VM through pending and empty replies without a second delete',async t=>{
 const f=fixture(t);await f.worker.preflight({retainForLogin:true});const run=f.worker.run;let deleted=false,reads=0;f.worker.run=async(command,args,options)=>{const response=await run(command,args,options);if(args[1]==='rm')deleted=true;if(deleted&&args[1]==='get'){assert.equal(args[2],id);reads++;if(reads===1)return {stdout:JSON.stringify({...JSON.parse(response.stdout),status:'destroying'})};if(reads===2)return {stdout:''};}return response;};assert.equal((await f.worker.release()).providerTerminalStatus,'destroyed');assert.equal(reads,3);assert.equal(f.calls.filter(a=>a[1]==='rm').length,1);assert.equal(f.calls.filter(a=>a[1]==='create').length,1);
});
