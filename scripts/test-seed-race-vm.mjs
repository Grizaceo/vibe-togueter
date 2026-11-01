// Live quarantine: never import the candidate on the host. No AI credentials go in this VM.
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
import {execFile} from 'node:child_process';import {promisify} from 'node:util';
import {BuildQuarantine} from '../src/build-quarantine.js';import {acquireController} from '../src/controller-lock.js';
const run=promisify(execFile),root=path.resolve(new URL('..',import.meta.url).pathname),sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const cli=async args=>(await run('createos',args,{timeout:45000,maxBuffer:1024*1024})).stdout;
if(process.argv.length!==3||process.argv[2]!=='--live'){console.error('Use --live for a disposable separate quarantine VM.');process.exitCode=1;}
else {
 const release=await acquireController(path.join(root,'runtime','controller.lock'));
 let vm,ownedVM=false,record={at:new Date().toISOString(),sessionId:process.env.CODEX_THREAD_ID,kind:'real-isolated-candidate-tests',checks:[],cleanupConfirmed:false};
 const registry=new BuildQuarantine(path.join(root,'runtime','build-quarantine.json')),job=JSON.parse(fs.readFileSync(path.join(root,'runtime','seed-race-job.json'))),actor={owner:true,name:'gris_96',source:'operator-test-runner'};
 try {
  const ticket=registry.inspect(job.ticketId);const source=fs.readFileSync(path.join(root,'runtime','seed-race-game.js'));
  if(sha(source)!==ticket.codeSha256)throw Error('Source bytes changed after quarantine receipt.');
  const existingJournal=path.join(root,'runtime','seed-race-test-vm.json');
  if(fs.existsSync(existingJournal)){
    const previous=JSON.parse(fs.readFileSync(existingJournal));
    if(!previous.id)throw Error('Prior creation needs reconciliation.');
    const prior=JSON.parse(await cli(['sandbox','get',previous.id]));
    if(prior.id!==previous.id||prior.name!==previous.name||prior.status!=='destroyed')throw Error('Prior test VM needs confirmed cleanup before retry.');
  }
  const before=JSON.parse(await cli(['sandbox','list','--limit','100']));const name='va-test-'+crypto.randomBytes(6).toString('hex'),requestedAt=Date.now();
  const journal=path.join(root,'runtime','seed-race-test-vm.json');fs.writeFileSync(journal,JSON.stringify({name,requestedAt,phase:'creating',existingIds:before.map(v=>v.id)})+'\n',{mode:0o600});
  const created=JSON.parse(await cli(['sandbox','create','--shape','s-1vcpu-2gb','--rootfs','devbox:1','--name',name,'--auto-pause','2m','--egress','blocked.invalid']));
  if(typeof created.id!=='string'||!/^sb-[a-z0-9]{20,40}$/.test(created.id)||before.some(v=>v.id===created.id))throw Error('Fresh quarantine VM identity required.');
  vm=JSON.parse(await cli(['sandbox','get',created.id]));
  if(vm.id!==created.id||vm.name!==name||Date.parse(vm.created_at)<requestedAt-5000)throw Error('Quarantine ownership mismatch.');
  ownedVM=true;
  if(vm.ingress_enabled!==false||vm.rootfs!=='devbox:1'||vm.shape!=='s-1vcpu-2gb'||Date.parse(vm.created_at)<requestedAt-5000||JSON.stringify(vm.egress)!==JSON.stringify(['blocked.invalid']))throw Error('Quarantine isolation settings mismatch.');
  fs.writeFileSync(journal,JSON.stringify({name,requestedAt,id:vm.id,phase:'testing'})+'\n',{mode:0o600});record.vmId=vm.id;record.buildVmId=job.vmId;
  const attempt=registry.beginTest(actor,ticket.id,ticket.artifactHash);record.testNonce=attempt.testNonce;record.artifactHash=attempt.artifactHash;
  const task=path.join(root,'runtime','seed-race-test-task.json');fs.writeFileSync(task,JSON.stringify({codeSha256:ticket.codeSha256,artifactHash:ticket.artifactHash,resources:ticket.resources})+'\n',{mode:0o600});
  for(const [local,remote] of [[path.join(root,'runtime','seed-race-game.js'),'/workspace/candidate/game.js'],[path.join(root,'src','gamehost.js'),'/workspace/gamehost.mjs'],[path.join(root,'scripts','vm-seed-check.mjs'),'/workspace/check.mjs'],[task,'/workspace/task.json']])await cli(['sandbox','push',vm.id,local,remote]);
  for(const asset of ticket.resources.assets)await cli(['sandbox','push',vm.id,path.join(root,'public',asset.sourceURL),'/workspace/assets/'+asset.sourceURL.split('/').at(-1)]);
  // The guest has no profile/credential files from the host. Entire guest is the boundary.
  await cli(['sandbox','exec',vm.id,'--','bash','-c','cd /workspace; timeout --signal=TERM --kill-after=5s 30s node --experimental-vm-modules check.mjs']);
  const output=await cli(['sandbox','exec',vm.id,'--','cat','/workspace/result.json']);const report=JSON.parse(output);
  if(report.codeSha256!==ticket.codeSha256||report.artifactHash!==ticket.artifactHash||!Array.isArray(report.checks)||report.checks.length!==12||report.checks.some(c=>typeof c.passed!=='boolean'))throw Error('Invalid candidate test receipt.');
  record={...record,report,evidenceSha256:sha(output),codeSha256:ticket.codeSha256};
  registry.recordTest(actor,ticket.id,{artifactHash:ticket.artifactHash,testNonce:attempt.testNonce,testVmId:vm.id,isolatedVmAttested:true,evidenceSha256:record.evidenceSha256,checks:report.checks});
  if(!report.passed)process.exitCode=1;
 } catch {record.failure='Quarantine trial incomplete; inspect protected journals. No host execution or automatic retry.';process.exitCode=1;}
 finally {
  if(vm&&ownedVM){try{const latest=JSON.parse(await cli(['sandbox','get',vm.id]));if(latest.name!==vm.name||latest.id!==vm.id)throw Error('Identity mismatch');await cli(['sandbox','rm',vm.id,'--force']);const ended=JSON.parse(await cli(['sandbox','get',vm.id]));record.cleanupConfirmed=ended.status==='destroyed';record.destroyedAt=ended.destroyed_at||null;if(record.cleanupConfirmed)fs.writeFileSync(path.join(root,'runtime','seed-race-test-vm.json'),JSON.stringify({id:vm.id,name:vm.name,phase:'destroyed'})+'\n',{mode:0o600});if(!record.cleanupConfirmed)process.exitCode=1;}catch{process.exitCode=1;}}
  const output=path.join(root,'docs','evidence','seed-race-quarantine-'+Date.now()+'.json');fs.writeFileSync(output,JSON.stringify(record,null,2)+'\n');console.log(JSON.stringify({evidence:output,vmId:vm?.id,checks:record.report?.checks,cleanupConfirmed:record.cleanupConfirmed}));await release();
 }
}
