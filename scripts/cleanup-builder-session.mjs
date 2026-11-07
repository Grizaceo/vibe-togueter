// Pre-armed recurring cleanup uses a per-lease journal, so it cannot target a replacement session.
import fs from 'node:fs';import path from 'node:path';import {execFile} from 'node:child_process';import {promisify} from 'node:util';import {BuilderLeaseControl} from '../src/builder-lease-control.js';
import {VMBuilderPreflight} from '../src/vm-builder-preflight.js';
const name=process.argv[2],root=path.resolve(new URL('..',import.meta.url).pathname),run=promisify(execFile);
if(![3,4].includes(process.argv.length)||(process.argv.length===4&&process.argv[3]!=='--due')||!/^va-build-[a-f0-9]{12}$/.test(name||''))throw Error('Expected an exact builder lease name.');
try{
 const lease=new VMBuilderPreflight(path.join(root,'runtime','builder-leases',name+'.json'));if(lease.state?.name!==name)throw Error('Lease ownership mismatch');const deadline=new BuilderLeaseControl(root,name);
 // Provider pause is only a cost fuse: a paused guest is destroyed, never resumed. A failed observation keeps the expiry-only behavior.
 if(process.argv[3]==='--due'){let paused=false;if(lease.state.id){try{paused=lease.owned(JSON.parse(await lease.cli(['sandbox','get',lease.state.id]))).status==='paused';}catch{}}if(!deadline.beginClose(paused?{pausedByProvider:true}:{})){console.log('Exact builder lease retained until approved deadline.');process.exit(0);}}
 if(process.argv[3]!=='--due')deadline.beginClose({explicit:true,allowClaimed:true});const result=await lease.release();
 if(result.providerTerminalStatus==='destroyed'){const ended=lease.owned(JSON.parse(await lease.cli(['sandbox','get',result.id])));if(ended.status!=='destroyed')throw Error('Terminal state unconfirmed');}
 else if(result.providerTerminalStatus!=='not-created')throw Error('Terminal state unconfirmed');
 const current=new VMBuilderPreflight(path.join(root,'runtime','builder-session.json'));if(current.state?.name===name&&(!current.state.id||current.state.id===result.id)){current.state={...current.state,id:result.id||current.state.id,phase:'released',releasedAt:Date.now(),providerTerminalStatus:result.providerTerminalStatus};current.save();const device=path.join(root,'runtime','codex-vm-device-login.txt');if(fs.existsSync(device))fs.unlinkSync(device);}
 await run('systemctl',['--user','stop','vibe-arena-builder-'+name.slice(-12)+'.timer'],{timeout:10000});console.log('Exact builder lease cleanup confirmed.');
}catch{console.error('Builder lease cleanup remains uncertain; recurring reconciliation stays armed.');process.exitCode=1;}
