// Disposable, loopback-only Plan B rehearsal. No owner config, Twitch or candidate code.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import readline from 'node:readline/promises';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const check=process.argv.includes('--check');
if(process.argv.slice(2).some(arg=>arg!=='--check'))throw Error('Usage: node scripts/demo-local.mjs [--check]');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'vibe-plan-b-'));
const key=crypto.randomBytes(24).toString('hex');
let server,terminal,base,stopping=false,serverExit;
const cleanup=async()=>{
 if(stopping)return;stopping=true;terminal?.close();
 if(server&&server.exitCode===null&&server.signalCode===null){
  server.kill('SIGTERM');const kill=setTimeout(()=>server.kill('SIGKILL'),3000);await serverExit;clearTimeout(kill);
 }
 fs.rmSync(temp,{recursive:true,force:true,maxRetries:5,retryDelay:100});
 if(check)console.log(JSON.stringify({cleanupConfirmed:!fs.existsSync(temp),childStopped:!server||server.exitCode!==null||server.signalCode!==null}));
};
process.once('SIGINT',()=>{void cleanup();});process.once('SIGTERM',()=>{void cleanup();});
try{
 for(const name of ['src','public','templates','package.json','vibe-arena.config.json'])fs.cpSync(path.join(root,name),path.join(temp,name),{recursive:true});
 for(const game of ['community-grove','marble-race','chat-vs-streamer'])fs.cpSync(path.join(root,'games',game),path.join(temp,'games',game),{recursive:true});
 fs.symlinkSync(path.join(root,'node_modules'),path.join(temp,'node_modules'),'dir');
 // Use port 0: the kernel chooses a free port without a probe/rebind race.
 server=spawn(process.execPath,['--experimental-vm-modules','src/server.js','--host','127.0.0.1','--port','0','--game-dir','games/community-grove'],{
  cwd:temp,env:{PATH:process.env.PATH,HOME:temp,LANG:'C.UTF-8',VA_STREAMER_KEY:key},stdio:['ignore','pipe','pipe'],
 });
 serverExit=new Promise(resolve=>server.once('close',resolve));
 // Do not relay server output or errors into a recording. Only the ready URL is used.
 let output='';server.stdout.on('data',chunk=>{output=(output+chunk).slice(-8192);});server.stderr.resume();
 await new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>{clearInterval(poll);reject(Error('Local demo startup deadline; check Linux bubblewrap support.'));},15000);
  const poll=setInterval(()=>{
   const match=output.match(/players\s+-> http:\/\/localhost:(\d+)\//);
   if(match&&Number(match[1])>0){base='http://127.0.0.1:'+match[1];clearInterval(poll);clearTimeout(timer);resolve();}
   else if(server.exitCode!==null||server.signalCode!==null){clearInterval(poll);clearTimeout(timer);reject(Error('Local demo server exited before readiness.'));}
  },50);
  server.once('error',()=>{clearInterval(poll);clearTimeout(timer);reject(Error('Unable to start local demo server.'));});
 });
 const request=async(route,body)=>{
  const response=await fetch(base+route,{method:body?'POST':'GET',headers:{'Content-Type':'application/json','x-streamer-key':key},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(5000)});
  if(!response.ok)throw Error('Local demo HTTP '+response.status);const text=await response.text();try{return JSON.parse(text);}catch{return text;}
 };
 await request('/community/state');
 console.log('Local Plan B rehearsal — no Twitch connection or human evidence recorded.');
 console.log('Play: '+base+'/\nStudio: '+base+'/studio.html\nOverlay: '+base+'/overlay.html');
 let reviewed=null;
 const roundAction=async body=>request('/admin/round',body);
 const review=async()=>{const state=await request('/community/state');if(state.round?.phase!=='awaiting-approval')throw Error('Close voting and select an idea before review.');reviewed=state.round;return {selected:reviewed.ideas.filter(i=>reviewed.selected.includes(i.id)).map(i=>({id:i.id,text:i.text})),resources:reviewed.resourceManifest?.assets.map(a=>a.title)||[]};};
 const approve=async()=>{if(!reviewed)throw Error('Run review before approve.');const result=await roundAction({action:'approve',roundId:reviewed.id,reviewToken:reviewed.reviewToken});reviewed=null;return result;};
 const commands={grove:['/admin/load',{game:'community-grove'}],marble:['/admin/load',{game:'marble-race'}],duel:['/admin/load',{game:'chat-vs-streamer'}],fallback:['/admin/fallback',{}],pause:['/admin/chat-effects',{paused:true}],resume:['/admin/chat-effects',{paused:false}],prediction:['/admin/prediction',{action:'open',choices:['Sun','Rain']}],lockprediction:['/admin/prediction',{action:'lock'}],sunwins:['/admin/prediction',{action:'resolve',choice:'Sun'}]};
 if(check){
  const checks=[];
  for(const [name,[route,body]] of Object.entries(commands)){await request(route,body);checks.push({name,ok:true});}
  await roundAction({action:'open'});
  await request('/admin/chat',{user:'local-fixture-proposer',text:'!idea Cooperative garden rehearsal'});
  await roundAction({action:'vote'});
  await request('/admin/chat',{user:'local-fixture-voter',text:'!vote 1'});
  const voted=await request('/community/state');
  if(voted.round?.voters!==1||voted.round.ideas[0]?.votes!==1)throw Error('Local fixture ballot was not counted');
  await roundAction({action:'close'});
  await roundAction({action:'select',ids:[1],reason:'Automated local launcher fixture'});
  await review();const approved=await approve();
  if(approved.phase!=='approved')throw Error('Studio approval check failed');
  checks.push({name:'local studio proposal/vote/review/exact-input approval',ok:true});
  const credits=await request('/community/game-credits');
  console.log(JSON.stringify({kind:'automated-disposable-local-launcher-check',checks,finalCreditsStatus:credits.status,ownerConfigRead:false,twitchConnected:false,humanRehearsal:false}));
 }else{
  terminal=readline.createInterface({input:process.stdin,output:process.stdout});
  console.log('Browser: enter a nickname, then arrows / space / click. Studio proposals and votes are local.');
  console.log('Terminal: grove, marble, duel, fallback, pause, resume, prediction, lockprediction, sunwins; studio: open, voting, close, select ID, review, approve, cancel; stop exits.');
  console.log('After a browser proposal: voting → browser vote → close → select ID → review → approve. This approves inputs only; no coding worker runs. Duel streamer unlocking uses the normal owner setup during the later real rehearsal.');
  for await(const line of terminal){
   const command=line.trim();if(command==='stop')break;
   try{
    if(Object.hasOwn(commands,command))await request(...commands[command]);
    else if(['open','voting','close','cancel'].includes(command))await roundAction({action:command==='voting'?'vote':command});
    else if(/^select [1-9][0-9]*$/.test(command))await roundAction({action:'select',ids:[Number(command.split(' ')[1])],reason:'Local operator rehearsal selection'});
    else if(command==='review')console.log(JSON.stringify(await review(),null,2));
    else if(command==='approve')await approve();
    else {console.log('Unknown command; use the commands listed above.');continue;}
    console.log('Done: '+command);
   }catch(error){console.log(error.message);}
  }
 }
}catch(error){console.error(error.message);process.exitCode=1;}
finally{await cleanup();}
