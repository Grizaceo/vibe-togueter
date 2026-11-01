// Real effects: creates exactly one disposable VM, probes trusted tools, destroys it.
// No game candidate, model API, credential transfer or Twitch message is involved.
import fs from 'node:fs';
import path from 'node:path';
import {VMBuilderPreflight} from '../src/vm-builder-preflight.js';
import {acquireController} from '../src/controller-lock.js';
const args=process.argv.slice(2),root=path.resolve(new URL('..',import.meta.url).pathname);
if(args.length!==1||!['--live','--recover'].includes(args[0])){
  console.error('Use --live for the authorized USD 3 VM / USD 5 AI trial, or --recover for its exact journaled VM.');process.exitCode=1;
}else {
  const unlock=await acquireController(path.join(root,'runtime','builder-preflight.lock'));
  const controller=new AbortController();const stop=()=>controller.abort();
  process.once('SIGINT',stop);process.once('SIGTERM',stop);
  const timer=setTimeout(stop,60000);let worker;
  try {
    worker=new VMBuilderPreflight(path.join(root,'runtime','builder-preflight.json'));
    const result=args[0]==='--recover'?await worker.release():await worker.preflight({signal:controller.signal});
    const evidence={at:new Date().toISOString(),sessionId:process.env.CODEX_THREAD_ID||null,kind:'real-vm-tool-preflight',result,limitations:['No approved community round was dispatched.','No Codex model call, authenticated agent, generated game, isolation test of a candidate or deployment.','Cost is not settled provider billing; no AI request occurred.']};
    const file=path.join(root,'docs','evidence','builder-vm-'+Date.now()+'.json');fs.writeFileSync(file,JSON.stringify(evidence,null,2)+'\n');
    console.log(JSON.stringify({evidence:file,phase:result?.phase,id:result?.id,result:result?.result}));
  } catch(error) {
    const file=path.join(root,'docs','evidence','builder-vm-failure-'+Date.now()+'.json');
    fs.writeFileSync(file,JSON.stringify({at:new Date().toISOString(),error:error.message,state:worker?.state||null},null,2)+'\n');
    console.error(error.message);process.exitCode=1;
  }finally{clearTimeout(timer);process.off('SIGINT',stop);process.off('SIGTERM',stop);await unlock();}
}
