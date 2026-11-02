// Exercise the actual helper with fake provider/systemd executables in a temp repo.
import {test} from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {execFile} from 'node:child_process';import {promisify} from 'node:util';
const run=promisify(execFile),root=path.resolve(new URL('..',import.meta.url).pathname);
function fixture(t,extra={}) {
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'va-login-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 for(const folder of ['src','scripts','docs/evidence','runtime','bin'])fs.mkdirSync(path.join(dir,folder),{recursive:true});
 for(const file of ['src/vm-builder-preflight.js','src/controller-lock.js','src/builder-lease-control.js','scripts/builder-login.mjs','scripts/cleanup-builder-session.mjs','package.json'])fs.copyFileSync(path.join(root,file),path.join(dir,file));
 const fake=`#!${process.execPath}
import fs from 'node:fs';import path from 'node:path';
function main(){const a=process.argv.slice(2),kind=path.basename(process.argv[1]),file=process.env.FAKE_STATE;
if(kind==='systemd-run'){if(process.env.FAKE_REQUIRE_INTENT){const lease=JSON.parse(fs.readFileSync(path.join(process.env.HOME,'runtime','builder-leases',a.find(x=>/^va-build-[a-f0-9]{12}$/.test(x))+'.json')));if(lease.creationRequested!==true)process.exit(2);}if(process.env.FAKE_INTERRUPT){process.kill(process.ppid,'SIGTERM');setTimeout(()=>process.exit(1),100);return;}if(process.env.FAKE_TIMER_FAIL)process.exit(1);console.log('timer installed');return;}
if(kind==='systemctl'){console.log('active');return;}
let vm=fs.existsSync(file)?JSON.parse(fs.readFileSync(file)):null;let result;
if(a[1]==='list')result=vm?[vm]:[];
else if(a[1]==='create'){vm={id:'sb-01m6zzzzzzzzzzzzzzzzzzzzzz',name:a[a.indexOf('--name')+1],created_at:new Date().toISOString(),shape:'s-1vcpu-2gb',rootfs:'devbox:1',ingress_enabled:false,status:'running'};fs.writeFileSync(file,JSON.stringify(vm));result={id:vm.id};}
else if(a[1]==='get')result=vm;
else if(a[1]==='process')result={id:'fake-login-process'};
else if(a[1]==='rm'){vm.status='destroyed';fs.writeFileSync(file,JSON.stringify(vm));result={ok:true};}
else if(a[1]==='exec'){
 const code=a.at(-1);if(code.includes("process.stdout.write")){process.stdout.write('https://auth.openai.com/codex/device\\nFAKE-DEVICE-CODE\\n');return;}
 if(code.includes('authenticated:ok'))result={authenticated:true,method:'chatgpt-subscription'};
 else result={node:'v24.21.0',codex:'codex-cli 0.160.0',platform:'linux',arch:'x64',personalAuthPresent:false,credentialEnvironmentPresent:false};
}else throw Error('unexpected fake operation');console.log(JSON.stringify(result));}
main();
`;
 for(const name of ['createos','systemd-run','systemctl'])fs.writeFileSync(path.join(dir,'bin',name),fake,{mode:0o700});
 const env={PATH:path.join(dir,'bin')+':/usr/bin:/bin',HOME:dir,FAKE_STATE:path.join(dir,'provider.json'),...extra};
 const call=action=>run(process.execPath,['scripts/builder-login.mjs',action],{cwd:dir,env,timeout:10000});
 const cleanup=(name,due=false)=>run(process.execPath,['scripts/cleanup-builder-session.mjs',name,...(due?['--due']:[])],{cwd:dir,env,timeout:10000});return {dir,call,cleanup};
}
test('device login helper keeps codes private, verifies subscription status and releases own guest',async t=>{
 const {dir,call}=fixture(t);const prepared=await call('prepare');assert.ok(!prepared.stdout.includes('FAKE-DEVICE-CODE'));
 const file=path.join(dir,'runtime','codex-vm-device-login.txt');assert.equal(fs.statSync(file).mode&0o777,0o600);assert.match(fs.readFileSync(file,'utf8'),/FAKE-DEVICE-CODE/);
 const state=JSON.parse(fs.readFileSync(path.join(dir,'runtime','builder-session.json')));assert.equal(state.phase,'awaiting-login');assert.ok(state.expiresAt>Date.now());
 const evidence=fs.readdirSync(path.join(dir,'docs/evidence')).map(f=>fs.readFileSync(path.join(dir,'docs/evidence',f),'utf8')).join('');assert.ok(!evidence.includes('FAKE-DEVICE-CODE'));
 assert.equal(JSON.parse((await call('status')).stdout).authenticated,true);assert.equal(fs.existsSync(file),false);
 await call('release');assert.equal(JSON.parse(fs.readFileSync(path.join(dir,'provider.json'))).status,'destroyed');
});
test('failed destruction timer installation prevents guest creation',async t=>{
 const {dir,call}=fixture(t,{FAKE_TIMER_FAIL:'1'});await assert.rejects(call('prepare'));assert.equal(fs.existsSync(path.join(dir,'provider.json')),false);assert.equal(JSON.parse(fs.readFileSync(path.join(dir,'runtime','builder-session.json'))).providerTerminalStatus,'not-created');
});
test('SIGTERM during timer installation leaves no created guest',async t=>{
 const {dir,call}=fixture(t,{FAKE_INTERRUPT:'1'});await assert.rejects(call('prepare'));assert.equal(fs.existsSync(path.join(dir,'provider.json')),false);assert.equal(JSON.parse(fs.readFileSync(path.join(dir,'runtime','builder-session.json'))).providerTerminalStatus,'not-created');
});

test('pre-armed per-lease cleanup recovers a guest without the create reply ID and clears only its own session',async t=>{
 const {dir,call,cleanup}=fixture(t);await call('prepare');const file=path.join(dir,'runtime','builder-session.json'),session=JSON.parse(fs.readFileSync(file));
 const lease=JSON.parse(fs.readFileSync(path.join(dir,'runtime','builder-leases',session.name+'.json')));assert.equal(lease.id,null);assert.equal(lease.creationRequested,true);assert.equal(lease.cleanupLeaseVersion,2);
 await cleanup(session.name);assert.equal(JSON.parse(fs.readFileSync(path.join(dir,'provider.json'))).status,'destroyed');assert.equal(JSON.parse(fs.readFileSync(file)).phase,'released');assert.equal(fs.existsSync(path.join(dir,'runtime','codex-vm-device-login.txt')),false);
});

test('builder supervisor receives durable creation intent before its timer can fire',async t=>{
 const {call}=fixture(t,{FAKE_REQUIRE_INTENT:'1'});await call('prepare');await call('release');
});

test('a scheduled cleanup retains a prepared guest until its durable lease is due',async t=>{const {dir,call,cleanup}=fixture(t);await call('prepare');const state=JSON.parse(fs.readFileSync(path.join(dir,'runtime','builder-session.json')));const result=await cleanup(state.name,true);assert.match(result.stdout,/retained/);assert.equal(JSON.parse(fs.readFileSync(path.join(dir,'provider.json'))).status,'running');await call('release');});
