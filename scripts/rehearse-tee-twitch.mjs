// Sends real commands on the owner's own Twitch channel to the existing Tee VM.
import fs from 'node:fs';import {TwitchAuth,readEnv} from '../src/auth/twitch.js';import {connectTwitch} from '../src/chat/twitch.js';
if(!process.argv.includes('--live'))throw Error('Use --live to send !tee commands on your own channel.');
const env=readEnv(),auth=new TwitchAuth(),info=await auth.validate({force:true}),channel=env.VA_TWITCH_CHANNEL;if(info.login!==channel)throw Error('Owner channel only.');
const base='http://127.0.0.1:8420',evidence={startedAt:new Date().toISOString(),channel,checks:[],observed:[],commands:[],samples:[],limitations:['Automated commands from the owner account, not independent viewers.','No browser rendering, human play, OBS broadcast or video is established by this script.']};
const observer=connectTwitch(channel,message=>{if(message.user===channel&&(message.text.startsWith('!tee ')||message.text.startsWith('Tee crowd ready')))evidence.observed.push({at:new Date().toISOString(),...message});});
const sender=connectTwitch(channel,()=>{},{auth});const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const until=async(fn,label)=>{const end=Date.now()+18000;while(Date.now()<end){if(await fn())return;await sleep(100);}throw Error('Timeout: '+label);};
const state=async()=>{const r=await fetch(base+'/community/games');if(!r.ok)throw Error('State unavailable');return (await r.json()).teeBridge;};
const check=(name,ok)=>{evidence.checks.push({name,ok:!!ok});if(!ok)throw Error(name);};
const command=async text=>{await until(()=>sender.ready,'sender ready');const queued=sender.send(text);evidence.commands.push({at:new Date().toISOString(),text,queued});check('Twitch command queued: '+text,queued);await until(()=>evidence.observed.some(m=>m.text===text),'actual IRC observation '+text);};
try{
 await until(()=>sender.ready&&observer.ready,'IRC ready');const streams=await auth.helix('streams?user_id='+info.user_id);evidence.broadcastLive=streams.data.length>0;
 if((await state()).enabled)throw Error('Bridge already in use; do not interrupt it.');
 await command('!tee on');await until(async()=>{const s=await state();return s.connected&&s.snapshots>2&&s.lastAck>0;},'remote welcome and snapshots');const initial=await state();evidence.initial=initial;check('remote authoritative snapshot received',initial.player&&initial.lastAck>0);
 await sleep(1700);await command('!tee right');let maxDX=0;const end=Date.now()+1800;while(Date.now()<end){const s=await state();evidence.samples.push({at:new Date().toISOString(),position:s.player?.position,lastAck:s.lastAck,commands:s.commands,lastAction:s.lastAction});if(s.player)maxDX=Math.max(maxDX,s.player.position.x-initial.player.position.x);await sleep(80);}check('real Twitch right command moved the crowd player',maxDX>1);evidence.maxRightDisplacement=maxDX;
 await sleep(1600);await command('!tee jump');await until(async()=>(await state()).lastAction==='jump','jump received');await sleep(1700);await command('!tee fire');await until(async()=>{const s=await state();return s.lastAction==='fire'&&s.lastAck>=s.lastCommandSeq;},'fire received and input acknowledged');evidence.final=await state();check('real Twitch actions reached acknowledged remote input',evidence.final.commands>=3);
 await sleep(1700);await command('!tee off');await until(async()=>!(await state()).enabled,'owner stop');check('owner command closed crowd connection',!(await state()).enabled);
}catch(error){evidence.error=error.message;process.exitCode=1;}finally{
 // Only close the bridge enabled by this rehearsal, never an already-active one.
 if(evidence.initial){try{await fetch(base+'/admin/tee-bridge',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+env.VA_ADMIN_TOKEN,'x-streamer-key':env.VA_STREAMER_KEY},body:JSON.stringify({action:'disable'})});}catch{}}
 sender.close();observer.close();evidence.finishedAt=new Date().toISOString();const file='docs/evidence/tee-twitch-'+Date.now()+'.json';fs.mkdirSync('docs/evidence',{recursive:true});fs.writeFileSync(file,JSON.stringify(evidence,null,2)+'\n');console.log(JSON.stringify({file,checks:evidence.checks,broadcastLive:evidence.broadcastLive,maxRightDisplacement:evidence.maxRightDisplacement,error:evidence.error},null,2));
}
