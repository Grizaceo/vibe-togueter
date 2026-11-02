// Private Twitch receiver/replier. No token is sent to the remote game service.
import fs from 'node:fs';
import {WebSocket} from 'ws';
import {createInterface} from 'node:readline';
import {TwitchAuth} from '../src/auth/twitch.js';
import {connectTwitch} from '../src/chat/twitch.js';
import {teeEntryURL} from '../src/tee-join.js';
import {nativeTeeCodec} from '../src/tee-native-codec.js';
const opt=name=>process.argv[process.argv.indexOf(name)+1];
for(const name of ['--url','--game-revision','--codec','--twitch','--auth-file'])if(!process.argv.includes(name))throw Error('Missing required operator option '+name);
const url=new URL(opt('--url')),channel=opt('--twitch');
if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||url.pathname!=='/'||!url.hostname.endsWith('.up.railway.app'))throw Error('Use the exact reviewed Railway HTTPS origin');
const base=url.origin;
const get=async endpoint=>{const r=await fetch(base+endpoint,{redirect:'error',signal:AbortSignal.timeout(8000)});if(!r.ok)throw Error('Remote gate failed');const text=await r.text();if(text.length>65536)throw Error('Remote metadata size');return JSON.parse(text);};
const manifest=await get('/trial-manifest.json');
const allowed=['contractVersion','schema','gameBaseRevision','gameRevision','platformRevision','credits','platformCustomDomain','temporaryGameTrial','serverSha256','wasmSha256','builtAt'];
if(Object.keys(manifest).some(k=>!allowed.includes(k))||manifest.contractVersion!==1||manifest.schema!=='teeworlds-rs/172cfef'||manifest.gameRevision!==opt('--game-revision')||!['serverSha256','wasmSha256'].every(k=>/^[a-f0-9]{64}$/.test(manifest[k])))throw Error('Unknown or unpinned remote contract');
if((await get('/healthz')).data?.up!==true)throw Error('Game backend is not healthy');
const codec=await nativeTeeCodec(opt('--codec'));
const socket=new WebSocket(base.replace('https:','wss:')+'/ws',{origin:base,maxPayload:1048576,handshakeTimeout:8000});
let playerId,seq=0,snapshots=0,lastAck=0,timer;
try{
  await new Promise((resolve,reject)=>{
    const timeout=setTimeout(()=>reject(Error('WSS protocol gate timeout')),10000);
    const done=(error)=>{clearTimeout(timeout);error?reject(error):resolve();};
    socket.once('error',()=>done(Error('WSS unavailable')));
    socket.on('open',()=>socket.send(codec.join('VT-protocol-probe')));
    socket.on('message',async raw=>{try{
      const msg=await codec.decode(raw);
      if(msg.type==='welcome'){playerId=msg.playerId;timer=setInterval(()=>{if(socket.readyState===1)socket.send(codec.input(++seq,{}));},20);}
      if(msg.type==='snapshot'){snapshots++;lastAck=msg.ack;if(playerId&&snapshots>=3&&lastAck>0)done();}
    }catch{done(Error('Remote protocol rejected'));}});
  });
}finally{clearInterval(timer);socket.terminate();codec.close();}
const auth=new TwitchAuth({file:opt('--auth-file')});let info;
try{info=await auth.validate({force:true});}catch{throw Error('Existing owner Twitch authorization unavailable');}
if(info.login!==channel)throw Error('Owner channel only');
const evidence={at:new Date().toISOString(),kind:'manual Twitch entry to remote individual Tee',baseURL:base,manifest,protocol:{snapshots,lastAck},commands:[],limitations:['One automated neutral-input protocol probe is not a human player.','Manual received link and ONLINE movement still need owner confirmation.','Provider hostname is a temporary game trial; platform custom domain/definitive hosting pending.','Names grant no authenticated game role.']};
let irc,finished=false,expiry;const stdin=createInterface({input:process.stdin});
const close=()=>{if(finished)return;finished=true;clearTimeout(expiry);irc?.close();stdin.close();const file='docs/evidence/tee-remote-join-'+Date.now()+'.json';fs.writeFileSync(file,JSON.stringify({...evidence,finishedAt:new Date().toISOString()},null,2)+'\n');console.log(JSON.stringify({file,commands:evidence.commands.length}));};
const users=new Map();let last=-Infinity;
irc=connectTwitch(channel,message=>{
  if(message.source!=='twitch'||message.text.trim().toLowerCase()!=='!join')return;
  const now=Date.now();if(now-last<2000||now-(users.get(message.user)??-Infinity)<10000||users.size>=128)return;
  users.set(message.user,now);last=now;const entryURL=teeEntryURL(base,'tee-vm',message.user),queued=irc.send('Join with your own tee: '+entryURL+' · external teeworlds-rs trial');
  evidence.commands.push({at:new Date().toISOString(),command:'!join',source:'real Twitch transport',entryURL,replyQueued:queued});console.log(JSON.stringify({joinReceived:true,entryURL,replyQueued:queued}));
},{auth});
stdin.on('line',line=>{if(line==='quit')close();});process.on('SIGINT',close);process.on('SIGTERM',close);expiry=setTimeout(close,10*60*1000);
console.log(JSON.stringify({remoteProtocolVerified:true,ownerEntry:teeEntryURL(base,'tee-vm','streamer'),humanEntryPending:true}));
