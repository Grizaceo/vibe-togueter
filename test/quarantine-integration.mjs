// Actual HTTP transport against the harness's temporary controller, not live Twitch/VMs.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const run=promisify(execFile);
const base=process.env.VA_ARENA_URL;
const headers={'Content-Type':'application/json','x-streamer-key':process.env.VA_STREAMER_KEY};
const post=(route,data,extra=headers)=>fetch(base+route,{method:'POST',headers:extra,body:JSON.stringify(data)});
const call=async(data)=>{const r=await post('/admin/build-quarantine',data);assert.equal(r.status,200,await r.clone().text());return r.json();};
const action=async(data)=>{const r=await post('/admin/round',data);assert.equal(r.status,200,await r.clone().text());return r.json();};
const check=(name,ok)=>{assert.ok(ok,name);console.log('PASS '+name);};
const source='globalThis.__quarantineExecuted=true; throw Error("do not run this candidate");';
const sha=s=>crypto.createHash('sha256').update(s).digest('hex');
const hostFile=fs.readFileSync('games/community-grove/game.js');
await action({action:'cancel'});await action({action:'open'});
assert.equal((await post('/admin/chat',{user:'candidate-proposer',text:'!idea Cooperative garden from community artwork'})).status,200);
await action({action:'vote'});await action({action:'close'});await action({action:'select',ids:[1]});
let state=(await(await fetch(base+'/community/state')).json()).round;
state=await action({action:'approve',roundId:state.id,reviewToken:state.reviewToken});
check('quarantine rejects missing streamer key and public forwarded requests',
 (await post('/admin/build-quarantine',{action:'issue'},{'Content-Type':'application/json'})).status===403 &&
 (await post('/admin/build-quarantine',{action:'issue'},{...headers,'x-forwarded-for':'203.0.113.1'})).status===403);
let job=await call({action:'issue',buildVmId:'fixture-builder',runtimeVmId:'fixture-runtime',agentProfile:'fixture-no-agent'});
check('HTTP build ticket pins approved community input',job.inputHash===state.approvedInputHash&&job.state==='awaiting-artifact');
job=await call({action:'receive',id:job.id,source,expectedCodeSha256:sha(source)});
check('candidate arrives as inert data outside public game paths',job.state==='quarantined'&&
 (await fetch(base+'/runtime/build-quarantine.json')).status===404&&
 (await(await fetch(base+'/community/state')).json()).liveGame==='Community Grove');
const list=await(await fetch(base+'/admin/build-quarantine',{headers})).json();
check('owner listing omits candidate source and private reports',list.every(j=>!('source'in j)&&!('report'in j)));
check('candidate cannot approve itself before testing',(await post('/admin/build-quarantine',{action:'approve',id:job.id,artifactHash:job.artifactHash,rightsAttested:true})).status===400);
job=await call({action:'begin-test',id:job.id,artifactHash:job.artifactHash});
job=await call({action:'record-test',id:job.id,report:{artifactHash:job.artifactHash,testNonce:job.testNonce,testVmId:'fixture-test-vm',isolatedVmAttested:true,evidenceSha256:sha('mock report only'),checks:[{name:'fixture only; no guest execution',passed:true}]}});
check('test receipt is explicitly operator-attested, not verified VM evidence',job.report.verification==='operator-attested'&&job.report.passed);
job=await call({action:'approve',id:job.id,artifactHash:job.artifactHash,reportHash:job.reportHash,rightsAttested:true});
check('exact approval never deploys or overwrites the trusted live game',job.state==='approved'&&fs.readFileSync('games/community-grove/game.js').equals(hostFile));
job=await call({action:'begin-test',id:job.id,artifactHash:job.artifactHash});
job=await call({action:'record-test',id:job.id,report:{artifactHash:job.artifactHash,testNonce:job.testNonce,testVmId:'fixture-test-vm',isolatedVmAttested:true,evidenceSha256:sha('second mock receipt'),checks:[{name:'fixture only',passed:true}]}});
await action({action:'cancel'});
check('cancelled community decision blocks later artifact approval',(await post('/admin/build-quarantine',{action:'approve',id:job.id,artifactHash:job.artifactHash,reportHash:job.reportHash,rightsAttested:true})).status===400);
await call({action:'cancel',id:job.id});
check('terminal ticket rejects a delayed report',(await post('/admin/build-quarantine',{action:'record-test',id:job.id,report:job.report})).status===400);

const requestFile='runtime/fixture-quarantine-inspect.json',reviewFile='runtime/fixture-quarantine-review.json';
fs.writeFileSync(requestFile,JSON.stringify({action:'inspect',id:job.id}),{mode:0o600});
const helper=await run(process.execPath,['scripts/quarantine-admin.mjs',requestFile],{env:process.env});
check('operator helper omits candidate source from console output',!helper.stdout.includes('__quarantineExecuted')&&JSON.parse(helper.stdout).id===job.id);
await run(process.execPath,['scripts/quarantine-admin.mjs',requestFile,'--save-review',reviewFile],{env:process.env});
check('operator can export exact source and reports to a new protected review file',JSON.parse(fs.readFileSync(reviewFile)).source===source&&(fs.statSync(reviewFile).mode&0o777)===0o600);
await assert.rejects(run(process.execPath,['scripts/quarantine-admin.mjs',requestFile,'--save-review',reviewFile],{env:process.env}));
check('operator helper refuses remote origins and review overwrite',await run(process.execPath,['scripts/quarantine-admin.mjs','list'],{env:{...process.env,VA_ARENA_URL:'https://example.com'}}).then(()=>false,()=>true));
