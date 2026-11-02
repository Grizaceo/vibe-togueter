// Independent recurring user-manager cleanup. No creation, model calls or host candidate execution.
import fs from 'node:fs';import path from 'node:path';import {CreateOSStudioWorker} from '../src/createos-studio-worker.js';
const id=process.argv[2],root=path.resolve(new URL('..',import.meta.url).pathname);
if(process.argv.length!==3||!/^[a-f0-9-]{36}$/.test(id||''))throw Error('Expected one exact studio job ID.');
try{const state=JSON.parse(fs.readFileSync(path.join(root,'runtime','studio-worker',id,'provider.json'),'utf8'));if(state.jobId!==id||!/^sb-[a-z0-9]{20,40}$/.test(state.buildVmId))throw Error('Ownership journal invalid');const result=await new CreateOSStudioWorker(root).cleanupTest({id,buildVmId:state.buildVmId});if(result.confirmed!==true)throw Error('Provider terminal state unconfirmed');console.log('Managed test guest cleanup confirmed.');}
catch{console.error('Managed test guest still needs reconciliation; recurring cleanup remains armed.');process.exitCode=1;}
