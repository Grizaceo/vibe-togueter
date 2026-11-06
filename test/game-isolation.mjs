import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawn,execFileSync,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {IsolatedGameHost,sandboxArgv,binaryMounts,cgroupsAvailable} from '../src/isolated-gamehost.js';
import {buildSeccompFilter} from '../src/seccomp-filter.js';
const run=promisify(execFile);
const minimal=body=>`export const meta={name:'probe',tickRate:30};export function createState(){return {}};export function tick(){${body}};export function view(){return {hud:[{t:'text',text:'alive'}]}}`;
function fixture(t,source,opts={}){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'va-isolation-'));fs.writeFileSync(path.join(dir,'game.js'),source);const h=new IsolatedGameHost({gameDir:dir,...opts});t.after(()=>{h.stop();fs.rmSync(dir,{recursive:true,force:true});});return h;}
const wait=ms=>new Promise(r=>setTimeout(r,ms));
// Runs any command inside the real sandbox: same bwrap args, seccomp on fd 3.
const busEnv=()=>({PATH:'/usr/bin',HOME:'/tmp',LANG:'C.UTF-8',...(process.env.XDG_RUNTIME_DIR?{XDG_RUNTIME_DIR:process.env.XDG_RUNTIME_DIR}:{}),...(process.env.DBUS_SESSION_BUS_ADDRESS?{DBUS_SESSION_BUS_ADDRESS:process.env.DBUS_SESSION_BUS_ADDRESS}:{})});
const inSandbox=(argv,timeout=15000)=>new Promise(resolve=>{
 const child=spawn(argv[0],argv.slice(1),{env:busEnv(),stdio:['ignore','pipe','pipe','pipe']});
 child.stdio[3].end(buildSeccompFilter());let out='';child.stdout.on('data',d=>out+=d);
 const timer=setTimeout(()=>child.kill('SIGKILL'),timeout);
 child.on('error',e=>{clearTimeout(timer);resolve({code:-1,out:String(e)})});
 child.on('exit',code=>{clearTimeout(timer);resolve({code,out})});
});
const NO_CGROUPS='systemd-run user scope is unavailable on this host';
test('SDK callbacks run outside the controller and block the reproduced constructor escape',async t=>{
 const source=`export function createState(){let outcome;try{outcome=Object.constructor('return process')().env.VA_ISOLATION_SENTINEL}catch{outcome='blocked'};return {outcome}};export function tick(){};export function view(s){return {hud:[{t:'text',text:s.outcome||'absent'}]}}`;
 process.env.VA_ISOLATION_SENTINEL='must-not-cross';t.after(()=>delete process.env.VA_ISOLATION_SENTINEL);
 const h=fixture(t,source);assert.equal(await h.load(),true);assert.notEqual(h.pid,process.pid);assert.equal(h.getView().hud[0].text,'blocked');
 assert.match(h.sandbox,/^namespaces\+seccomp(\+cgroups)?$/);
});
test('infinite tick is terminated without stopping the controller event loop',async t=>{
 const h=fixture(t,minimal('while(true){}'));assert.equal(await h.load(),true);h.start();await wait(400);assert.match(h.error,/timeout|timed out|watchdog/);assert.equal(h.running,false);
});
test('top-level infinite loop fails load within a bounded deadline',async t=>{
 const h=fixture(t,'while(true){}');const start=Date.now();assert.equal(await h.load(),false);assert.ok(Date.now()-start<4000);assert.match(h.error,/timeout|timed out|watchdog/);
});
test('game crash emits one failure and supports a clean replacement',async t=>{
 const h=fixture(t,minimal('throw Error("broken")'));let failures=0;h.onEvent=k=>{if(k==='game-error')failures++};assert.equal(await h.load(),true);h.start();await wait(200);assert.equal(failures,1);fs.writeFileSync(path.join(h.gameDir,'game.js'),minimal(''));assert.equal(await h.load(),true);h.start();await wait(100);assert.equal(h.error,null);assert.equal(h.running,true);
});
test('stop and replacement settle pending loads without orphaned promises',async t=>{
 const h=fixture(t,minimal(''));const first=h.load();h.stop();assert.equal(await first,false);
 const replaced=h.load(),next=h.load();assert.equal(await replaced,false);assert.equal(await next,true);
});
test('a hostile view getter is timed out during guest serialization',async t=>{
 const h=fixture(t,`export function createState(){return {}};export function tick(){};export function view(){return {get layers(){while(true){}}}}`);
 assert.equal(await h.load(),false);assert.match(h.error,/timed out/);
});
test('missing source and missing watcher report failures rather than throwing',async t=>{
 const h=fixture(t,minimal(''));fs.rmSync(h.gameDir,{recursive:true});const errors=[];h.onEvent=(kind,detail)=>{if(kind==='game-error')errors.push(detail);};
 assert.equal(await h.load(),false);assert.equal(errors.length,1);assert.doesNotThrow(()=>h.startWatching());assert.equal(errors.length,2);
});

test('global context constructor cannot escape to the guest process or spoof its IPC',async t=>{
 const h=fixture(t,`export function createState(){try{return {outcome:globalThis.constructor.constructor('return process')().pid}}catch{return {outcome:'blocked'}}};export function tick(){};export function view(s){return {hud:[{t:'text',text:s.outcome}]}}`);
 assert.equal(await h.load(),true);assert.equal(h.getView().hud[0].text,'blocked');
});
test('isolated frames follow the game tick, and slow-tick games keep a heartbeat',async t=>{
 const counter=rate=>`export const meta={name:'cadence',tickRate:${rate}};export function createState(){return {n:0}};export function tick(s){s.n++};export function view(s){return {hud:[{t:'text',text:String(s.n)}]}}`;
 for(const [rate,min,max] of [[30,20,36],[5,7,13]]){
  const h=fixture(t,counter(rate));assert.equal(await h.load(),true);let frames=0;h.onFrame=()=>frames++;h.start();await wait(1000);h.stop();
  assert.ok(frames>=min&&frames<=max,`tickRate ${rate}: ${frames} frames/s`);
 }
});
test('the seccomp filter denies nested user namespaces and non-Unix sockets',async t=>{
 // Nested user namespace creation must fail (unshare + CLONE_NEWUSER denied).
 const unshare=await inSandbox(sandboxArgv({cgroups:false,command:['/usr/bin/unshare','--user','--map-root-user','true'],extraBinds:binaryMounts('/usr/bin/unshare')}));
 assert.notEqual(unshare.code,0,'unshare --user unexpectedly succeeded inside the sandbox: '+unshare.out);
 // socket(AF_INET) gets EAFNOSUPPORT, observed by the guest node itself.
 const probe=`const s=require('net').connect(80,'127.0.0.1');s.on('error',e=>process.exit(e.code==='EAFNOSUPPORT'?0:9));setTimeout(()=>process.exit(9),3000)`;
 const socket=await inSandbox(sandboxArgv({cgroups:false,command:['/usr/bin/node','-e',probe]}));
 assert.equal(socket.code,0,'AF_INET socket did not fail with EAFNOSUPPORT: '+socket.out);
});
test('the cgroup scope applies memory and process limits to the sandboxed process',async t=>{
 if(!(await cgroupsAvailable()))return t.skip(NO_CGROUPS);
 const unit='va-isotest-'+crypto.randomBytes(4).toString('hex');
 const argv=sandboxArgv({unit,cgroups:true,command:['/usr/bin/node','-e','setTimeout(()=>{},5000)']});
 const child=spawn(argv[0],argv.slice(1),{env:busEnv(),stdio:['ignore','ignore','ignore','pipe']});
 t.after(()=>child.kill('SIGKILL'));
 child.stdio[3].end(buildSeccompFilter());
 let group='';
 for(let n=0;n<100&&!group;n++){try{const {stdout}=await run('systemctl',['--user','show',unit+'.scope','-p','ControlGroup','--value'],{timeout:5000});if(stdout.trim())group=stdout.trim();}catch{}await wait(100);}
 assert.ok(group,'scope cgroup never appeared');
 const base='/sys/fs/cgroup'+group;
 assert.equal(fs.readFileSync(base+'/memory.max','utf8').trim(),'268435456');
 assert.equal(fs.readFileSync(base+'/pids.max','utf8').trim(),'32');
 child.kill('SIGKILL');
});
test('missing cgroup support degrades to namespaces+seccomp with a visible warning',async t=>{
 const warnings=[];const h=fixture(t,minimal(''),{cgroupsProbe:async()=>false,onEvent:(k,d)=>{if(k==='sandbox-warning')warnings.push(d)}});
 assert.equal(await h.load(),true);
 assert.equal(h.sandbox,'namespaces+seccomp');assert.match(h.sandboxWarning,/Cgroup limits unavailable/);assert.equal(warnings.length,1);
});
test('a non-x86_64 architecture fails closed before spawning anything',async t=>{
 const h=fixture(t,minimal(''),{seccompArch:'arm64'});
 assert.equal(await h.load(),false);assert.match(h.error,/x86_64|seccomp|Sandbox prerequisites/);assert.equal(h.child??null,null);
});
test('stop leaves no sandboxed node process behind',async t=>{
 const h=fixture(t,minimal(''));assert.equal(await h.load(),true);h.start();h.stop();await wait(400);
 let alive='';try{alive=execFileSync('pgrep',['-f','/app/game-worker.js'],{encoding:'utf8'});}catch{}
 assert.equal(alive.trim(),'');
});
