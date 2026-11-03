// Reuse the existing ownership-checked release path; never prepare a builder/model.
import fs from 'node:fs';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {VMBuilderPreflight} from '../src/vm-builder-preflight.js';
const file=process.argv[2],run=promisify(execFile);
if(!file)throw Error('Exact private lease file required');
const lease=new VMBuilderPreflight(file,{run:(cmd,args,options)=>run(cmd,['-o','json',...args],options)});
if(lease.state?.purpose!=='tee-cloudflare-trial'||!lease.state.authorizationReceived||!Number.isFinite(lease.state.expiresAt))throw Error('Trial ownership/authorization missing');
if(!process.argv.includes('--now')&&Date.now()<lease.state.expiresAt)process.exit(0);
try{
  const result=await lease.release();
  if(!['destroyed','not-created'].includes(result.providerTerminalStatus))throw Error('Cleanup not confirmed');
  console.log(JSON.stringify({cleanupConfirmed:true,status:result.providerTerminalStatus}));
}catch{console.error('Exact Tee VM cleanup uncertain; recurring reconciliation remains armed.');process.exitCode=1;}
