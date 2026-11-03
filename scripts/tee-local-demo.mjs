// Private local prototype. --verify-local uses synthetic inputs, never Twitch evidence.
import fs from 'node:fs';
import crypto from 'node:crypto';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import {createInterface} from 'node:readline';
import {nativeTeeCodec} from '../src/tee-native-codec.js';
import {TeeChatBridge} from '../src/tee-chat-bridge.js';
import {routeTeeChat} from '../src/tee-local-session.js';
import {connectTwitch} from '../src/chat/twitch.js';
const arg=(name)=>process.argv[process.argv.indexOf(name)+1];
if(!process.argv.includes('--codec')||!process.argv.includes('--pid'))throw Error('Specify --codec PATH --pid EXISTING_SERVER_PID');
const pid=arg('--pid');if(!/^\d+$/.test(pid))throw Error('Invalid pid');
const channel=process.argv.includes('--twitch')?arg('--twitch'):'local-demo';
if(!/^[a-z0-9_-]{1,25}$/.test(channel))throw Error('Invalid channel');
// Bind binary identity to the actual listening socket, not an arbitrary PID.
const inodes=new Set(fs.readdirSync('/proc/'+pid+'/fd').flatMap(name=>{
  try { const m=/^socket:\[(\d+)\]$/.exec(fs.readlinkSync('/proc/'+pid+'/fd/'+name));return m?[m[1]]:[]; } catch { return []; }
}));
const ownsListener=['/proc/net/tcp','/proc/net/tcp6'].some(file=>fs.readFileSync(file,'utf8').trim().split('\n').slice(1).some(line=>{
  const fields=line.trim().split(/\s+/);return fields[1].endsWith(':2070')&&fields[3]==='0A'&&inodes.has(fields[9]);
}));
if(!ownsListener)throw Error('PID does not own the existing game listener on 8304.');
const binary=fs.readFileSync('/proc/'+pid+'/exe');
const digest=b=>crypto.createHash('sha256').update(b).digest('hex');
const lock=path.join(os.tmpdir(),'va-tee-local-8304.lock');
const fd=fs.openSync(lock,'wx',0o600);fs.writeFileSync(fd,String(process.pid));fs.closeSync(fd);
const evidence={at:new Date().toISOString(),kind:'local external-game adapter prototype',contract:{version:1,schema:'teeworlds-rs/172cfef',sourcePin:'172cfef66565af00f75e865c60e3c91859beb039'},runtime:{binarySha256:digest(binary),sourceRevision:null,endpoint:'ws://127.0.0.1:8304/ws'},checks:[],commands:[],samples:[],limitations:['External game by Cristóbal Muñoz with Devin and Hermes; separate from judged platform code.','Native helper contract is versioned locally; external server has no negotiated wire version. Exact schema decoding and trailing-byte rejection are required.','Runtime binary identity is a hash, not a proven source revision.','One collective tee; no per-viewer characters or spectator effects.','No VM deployment, external network, human streamer interaction or real Twitch effect established by automated verification.']};
let codec,bridge,irc,server,stdin,timer,finished=false;
const check=(name,ok)=>{evidence.checks.push({name,ok:!!ok});if(!ok)throw Error(name);};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const until=async(fn)=>{for(let i=0;i<100;i++){if(fn())return;await sleep(40);}throw Error('Observation deadline');};
async function finish(error){
  if(finished)return;finished=true;
  if(error){evidence.error=error.message;process.exitCode=1;}
  clearTimeout(timer);stdin?.close();irc?.close();bridge?.stop();codec?.close();server?.close();
  fs.unlinkSync(lock);evidence.finishedAt=new Date().toISOString();
  const file='docs/evidence/tee-local-'+Date.now()+'.json';
  fs.mkdirSync('docs/evidence',{recursive:true});fs.writeFileSync(file,JSON.stringify(evidence,null,2)+'\n');
  console.log(JSON.stringify({file,checks:evidence.checks,error:evidence.error}));
}
process.once('SIGINT',()=>finish());process.once('SIGTERM',()=>finish());
try{
  codec=await nativeTeeCodec(arg('--codec'));bridge=new TeeChatBridge({codec});
  evidence.codecSha256=digest(fs.readFileSync(arg('--codec')));
  const health=await fetch('http://127.0.0.1:8304/healthz',{signal:AbortSignal.timeout(3000)});
  evidence.runtime.health={status:health.status,body:await health.text(),registryCompatible:false};
  await bridge.startLocal('ws://127.0.0.1:8304/ws',channel);
  await until(()=>bridge.status().snapshots>=3&&bridge.status().lastAck>0);
  check('real local server snapshots and input acknowledgements',bridge.status().connected);
  const sample=()=>{const s=bridge.status();evidence.samples.push({at:new Date().toISOString(),connected:s.connected,playerId:s.playerId,position:s.player?.position,ack:s.lastAck,paused:s.paused});return s;};
  if(process.argv.includes('--verify-local')){
    // Synthetic adapter inputs test transport/physics, not Twitch participation.
    evidence.inputSource='synthetic adapter verification';
    const initial=sample();check('web input rejected',!bridge.command('right',{source:'web',user:'fixture'}));
    check('bounded right pulse accepted',routeTeeChat(bridge,channel,{source:'twitch',user:'fixture',text:'!tee right'}));
    check('same user cooldown enforced',!bridge.command('jump',{source:'twitch',user:'fixture'}));
    let dx=0;for(let i=0;i<16;i++){await sleep(40);const s=sample();dx=Math.max(dx,Math.abs(s.player.position.x-initial.player.position.x));}
    evidence.maxDisplacementX=dx;check('authoritative position moved',dx>1);
    check('viewer cannot pause',!routeTeeChat(bridge,channel,{source:'twitch',user:'fixture',text:'!pause'}));
    routeTeeChat(bridge,channel,{source:'twitch',user:channel,text:'!pause'});
    check('streamer pause blocks controls',!bridge.command('left',{source:'twitch',user:'fixture'}));
    await sleep(100);sample();bridge.stop();check('disconnect closes bridge',!bridge.status().enabled);
    await bridge.startLocal('ws://127.0.0.1:8304/ws',channel);await until(()=>bridge.status().snapshots>=3&&bridge.status().lastAck>0);
    sample();check('return receives new authoritative snapshots',bridge.status().connected);
    await finish();
  }else{
    server=http.createServer((req,res)=>{
      res.setHeader('Cache-Control','no-store');
      if(req.url==='/status'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify(bridge.status()));return;}
      if(req.url!=='/'){res.writeHead(404);res.end();return;}
      res.setHeader('Content-Type','text/html; charset=utf-8');
      res.end(`<!doctype html><html lang="en"><meta charset="utf-8"><title>Vibe Togueter · external game prototype</title><style>body{margin:0;background:#121725;color:#fff;font:18px system-ui}header{padding:16px 24px}p{margin:6px 0}iframe{width:100%;height:76vh;border:0}small{color:#c9d6ee}</style><header><b>Vibe Togueter · local integration prototype</b><p>teeworlds-rs by Cristóbal Muñoz with Devin and Hermes · external game</p><small>One collective chat tee. Individual browser players use the game below. VM deployment and external access testing pending.</small><p id="status">Checking adapter…</p><a style="color:#9edcff" target="_blank" rel="noopener" href="http://127.0.0.1:8304/#viewer">Open game as individual player</a></header><iframe title="External teeworlds-rs game" src="http://127.0.0.1:8304/#viewer"></iframe><script>setInterval(async()=>{try{const s=await(await fetch('/status')).json();document.querySelector('#status').textContent='Collective adapter: '+(s.connected?'ONLINE':'DISCONNECTED')+' · '+s.snapshots+' snapshots'+(s.paused?' · PAUSED':'')+'. Verify browser ONLINE in game HUD.'}catch{}},500)</script></html>`);
    });
    await new Promise(r=>server.listen(0,'127.0.0.1',r));
    evidence.entryURL='http://127.0.0.1:'+server.address().port+'/';
    if(process.argv.includes('--twitch')){
      irc=connectTwitch(channel,async message=>{
        // Reconnection is an explicit owner action, never a viewer privilege.
        if(message.source==='twitch'&&message.user.toLowerCase()===channel.toLowerCase()&&/^!tee (on|off)$/.test(message.text.trim().toLowerCase())){
          if(message.text.trim().toLowerCase()==='!tee off')bridge.stop('owner disabled');
          else if(!bridge.status().enabled)try{await bridge.startLocal('ws://127.0.0.1:8304/ws',channel);}catch{}
          evidence.commands.push({at:new Date().toISOString(),source:'real Twitch transport',action:message.text.trim().toLowerCase(),connected:bridge.status().connected});return;
        }
        const before=sample();const accepted=routeTeeChat(bridge,channel,message);
        if(/^!(tee (left|right|jump|hook|fire|stop)|pause|resume)$/.test(message.text.trim().toLowerCase())){
          const record={at:new Date().toISOString(),source:'real Twitch transport',action:message.text.trim().toLowerCase(),accepted,before:before.player,expectedSeq:accepted?bridge.status().lastCommandSeq:null,samples:[]};evidence.commands.push(record);
          for(let i=0;i<20&&!finished;i++){await sleep(40);const s=sample();record.samples.push({at:new Date().toISOString(),ack:s.lastAck,connected:s.connected,paused:s.paused,position:s.player?.position});}
        }
      });
      evidence.limitations.push('Received Twitch messages need manual action and observed effect review before claiming real Twitch success.');
    }
    stdin=createInterface({input:process.stdin});stdin.on('line',line=>{if(line==='pause')bridge.pause();if(line==='resume')bridge.pause(false);if(line==='quit')finish();});
    // Short finite session: no unattended runtime/lease or server changes.
    timer=setTimeout(()=>finish(),10*60*1000);
    console.log(JSON.stringify({entryURL:evidence.entryURL,operator:'Private stdin: pause, resume, quit',expiresInMinutes:10}));
  }
}catch(error){await finish(error);}
