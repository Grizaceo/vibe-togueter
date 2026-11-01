// Fresh subscription login inside a private VM. Never copy host Codex/auth profiles.
import fs from 'node:fs';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {VMBuilderPreflight} from '../src/vm-builder-preflight.js';
import {acquireController} from '../src/controller-lock.js';
const run=promisify(execFile),root=path.resolve(new URL('..',import.meta.url).pathname);
const action=process.argv[2];
const file=path.join(root,'runtime','builder-session.json');
const deviceFile=path.join(root,'runtime','codex-vm-device-login.txt');
const evidence=result=>{
  const safe={at:new Date().toISOString(),sessionId:process.env.CODEX_THREAD_ID||null,...result};
  fs.writeFileSync(path.join(root,'docs','evidence','builder-login-'+Date.now()+'.json'),JSON.stringify(safe,null,2)+'\n');
};
if(process.argv.length!==3||!['prepare','status','release'].includes(action)){
 console.error('Usage: node scripts/builder-login.mjs prepare|status|release');process.exitCode=1;
}else {
 const unlock=await acquireController(path.join(root,'runtime','builder-preflight.lock'));
 const controller=new AbortController();const stop=()=>controller.abort();process.once('SIGINT',stop);process.once('SIGTERM',stop);
 const worker=new VMBuilderPreflight(file);let prepared=false;let retained=false;
 try {
  if(action==='prepare') {
   const result=await worker.preflight({retainForLogin:true,signal:AbortSignal.any([controller.signal,AbortSignal.timeout(60000)])});prepared=true;
   // A separate user-manager timer survives this helper exiting or being interrupted.
   const unit='vibe-arena-builder-'+result.name.slice(-12);
   worker.state.cleanupUnit=unit;worker.state.expiresAt=Date.now()+30*60*1000;worker.save();
   controller.signal.throwIfAborted();
   await run('systemd-run',['--user','--unit='+unit,'--on-active=30m','--timer-property=AccuracySec=1s',path.join(process.env.HOME,'.local','bin','createos'),'sandbox','rm',result.id,'--force'],{timeout:10000,signal:controller.signal});
   await run('systemctl',['--user','is-active',unit+'.timer'],{timeout:10000,signal:controller.signal});
   const login='umask 077; mkdir -p /opt/vibe-codex; chmod 700 /opt/vibe-codex; export CODEX_HOME=/opt/vibe-codex; exec codex -c \'forced_login_method="chatgpt"\' -c \'cli_auth_credentials_store="file"\' login --device-auth > /opt/vibe-codex/device-login.txt 2>&1';
   controller.signal.throwIfAborted();
   await worker.cli(['sandbox','process','run','--no-follow',result.id,'--','bash','-c',login],{signal:controller.signal});
   const readLog="const fs=require('node:fs');const file='/opt/vibe-codex/device-login.txt';process.stdout.write(fs.existsSync(file)?fs.readFileSync(file,'utf8'):'');";
   let output='';
   for(let i=0;i<20;i++){
     controller.signal.throwIfAborted();
     output=await worker.cli(['sandbox','exec',result.id,'--','node','-e',readLog],{signal:controller.signal});
     if(/https:\/\/auth\.openai\.com\//.test(output))break;
     await new Promise(resolve=>setTimeout(resolve,500));
   }
   if(!/https:\/\/auth\.openai\.com\//.test(output))throw Error('Device login did not produce the expected official sign-in instructions.');
   // Do not send the one-time code to model/tool output or tracked evidence.
   fs.writeFileSync(deviceFile,output.replace(/\x1b\[[0-9;]*m/g,''),{mode:0o600});fs.chmodSync(deviceFile,0o600);
   evidence({kind:'fresh-guest-device-login-prepared',vmId:result.id,model:'gpt-6.1-terra',ingress:false,authentication:'chatgpt-subscription',authenticated:false,cleanupUnit:unit,expiresAt:new Date(worker.state.expiresAt).toISOString(),codeOrTokensRecorded:false});
   controller.signal.throwIfAborted();retained=true;
   console.log(JSON.stringify({vmId:result.id,instructionsFile:deviceFile,expiresAt:new Date(worker.state.expiresAt).toISOString(),authenticated:false}));
  } else if(action==='status') {
   if(!worker.state||worker.state.phase!=='awaiting-login')throw Error('No active login session.');
   const vm=worker.owned(JSON.parse(await worker.cli(['sandbox','get',worker.state.id])));
   if(vm.status!=='running')throw Error('Login VM is not running; inspect its expiry before recovery.');
   const status="const cp=require('node:child_process'),os=require('node:os');let ok=false;try{cp.execFileSync('codex',['-c','forced_login_method=\"chatgpt\"','login','status'],{env:{PATH:process.env.PATH,HOME:os.homedir(),CODEX_HOME:'/opt/vibe-codex'},stdio:'pipe',timeout:15000});ok=true;}catch{}console.log(JSON.stringify({authenticated:ok,method:'chatgpt-subscription'}));";
   const result=JSON.parse(await worker.cli(['sandbox','exec',vm.id,'--','node','-e',status]));
   // Drop the device-code instructions when authentication is complete.
   if(result.authenticated&&fs.existsSync(deviceFile))fs.unlinkSync(deviceFile);
   evidence({kind:'guest-login-status',vmId:vm.id,...result,modelUsed:false});console.log(JSON.stringify(result));
  } else {
   const result=await worker.release();
   if(result?.cleanupUnit)await run('systemctl',['--user','stop',result.cleanupUnit+'.timer'],{timeout:10000,signal:controller.signal});
   if(fs.existsSync(deviceFile))fs.unlinkSync(deviceFile);
   evidence({kind:'guest-login-released',vmId:result?.id,phase:result?.phase,providerTerminalStatus:result?.providerTerminalStatus});console.log(JSON.stringify({phase:result?.phase,id:result?.id}));
  }
 } catch(error) {
  if(prepared){try{await worker.release();}catch{}}
  evidence({kind:'guest-login-failure',vmId:worker.state?.id||null,phase:worker.state?.phase||null,message:'Login preparation/status failed; inspect protected diagnostics. No model call attempted.'});
  console.error('Guest login action failed; inspect the protected journal and retained evidence.');process.exitCode=1;
 } finally {if(prepared&&!retained&&worker.state?.phase!=='released'){try{await worker.release();}catch{}}process.off('SIGINT',stop);process.off('SIGTERM',stop);await unlock();}
}
