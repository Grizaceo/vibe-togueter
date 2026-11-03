// Individual-player entry prototype. Replies only to a real user's explicit !join.
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {createInterface} from 'node:readline';
import {TwitchAuth} from '../src/auth/twitch.js';
import {connectTwitch} from '../src/chat/twitch.js';
import {teeEntryURL,localTeeJoinReply} from '../src/tee-join.js';
const option=name=>process.argv[process.argv.indexOf(name)+1];
if(!process.argv.includes('--twitch')||!process.argv.includes('--auth-file')||!process.argv.includes('--pid'))throw Error('Use --twitch CHANNEL --auth-file PRIVATE_PATH --pid EXISTING_GAME_PID');
const channel=option('--twitch'),pid=option('--pid');
if(!/^[a-z0-9_]{1,25}$/.test(channel)||!/^\d+$/.test(pid))throw Error('Invalid channel/PID');
if(fs.existsSync(path.join(os.tmpdir(),'va-tee-local-8304.lock')))throw Error('Stop the collective prototype first; do not reset its lock.');
const inodes=new Set(fs.readdirSync('/proc/'+pid+'/fd').flatMap(name=>{try{const m=/^socket:\[(\d+)\]$/.exec(fs.readlinkSync('/proc/'+pid+'/fd/'+name));return m?[m[1]]:[];}catch{return [];}}));
if(!['/proc/net/tcp','/proc/net/tcp6'].some(file=>fs.readFileSync(file,'utf8').trim().split('\n').slice(1).some(line=>{const f=line.trim().split(/\s+/);return f[1].endsWith(':2070')&&f[3]==='0A'&&inodes.has(f[9]);})))throw Error('PID is not the game listener.');
const auth=new TwitchAuth({file:option('--auth-file')});
let info;try{info=await auth.validate({force:true});}catch{throw Error('Existing Twitch authorization unavailable. No login started.');}
if(info.login!==channel)throw Error('Local demonstration replies are limited to the owner channel.');
const lock=path.join(os.tmpdir(),'va-tee-individual-8304.lock');fs.closeSync(fs.openSync(lock,'wx',0o600));
const evidence={at:new Date().toISOString(),kind:'manual Twitch !join to individual browser player',runtime:{binarySha256:crypto.createHash('sha256').update(fs.readFileSync('/proc/'+pid+'/exe')).digest('hex'),sourceRevision:null,endpoint:'http://127.0.0.1:8304/'},commands:[],replies:[],entries:[],limitations:['Local prototype only; VM deployment and external access testing pending.','A join request/reply is not evidence of ONLINE gameplay; inspect browser snapshots/HUD separately.','Display names are not Twitch identity binding or authenticated game roles.','teeworlds-rs is external owner code developed with Devin and Hermes.','No collective tee is started and no chat movement commands are handled.']};
const game={id:'tee-local',adapter:'tee',baseURL:'http://127.0.0.1:8304',localPrototype:true};
const server=http.createServer((req,res)=>{
  res.setHeader('Cache-Control','no-store');
  const url=new URL(req.url,'http://127.0.0.1');
  if(url.pathname==='/community/games'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({games:[game]}));return;}
  if(url.pathname==='/status'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({individualEntry:true,receivedJoins:evidence.commands.length,observedReplies:evidence.replies.length,entries:evidence.entries.length}));return;}
  if(url.pathname==='/' ){res.writeHead(302,{Location:teeEntryURL(base,game.id,url.searchParams.get('name'))});res.end();return;}
  if(['/tee-play.html','/tee-play.js'].includes(url.pathname)){
    if(url.pathname.endsWith('.html'))evidence.entries.push({at:new Date().toISOString(),kind:'HTTP entry page requested; not a confirmed player'});
    res.setHeader('Content-Type',url.pathname.endsWith('.js')?'application/javascript':'text/html; charset=utf-8');res.end(fs.readFileSync('public'+url.pathname));return;
  }
  res.writeHead(404);res.end();
});
let irc,timer,stdin,done=false,base;
function finish(){
  if(done)return;done=true;clearTimeout(timer);stdin?.close();irc?.close();server.close();fs.unlinkSync(lock);evidence.finishedAt=new Date().toISOString();
  const file='docs/evidence/tee-individual-join-'+Date.now()+'.json';fs.writeFileSync(file,JSON.stringify(evidence,null,2)+'\n');console.log(JSON.stringify({file,joins:evidence.commands.length,observedReplies:evidence.replies.length,entries:evidence.entries.length}));
}
process.once('SIGINT',finish);process.once('SIGTERM',finish);
try{
  const port=process.argv.includes('--port')?Number(option('--port')):0;
  if(!Number.isInteger(port)||port<0||port>65535)throw Error('Invalid local port');
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});base='http://127.0.0.1:'+server.address().port;
  evidence.entryBase=base;
  const cooldowns=new Map();let lastReply=-Infinity;
  irc=connectTwitch(channel,message=>{
    if(message.source!=='twitch')return;
    if(message.user===channel&&message.text.startsWith('Local prototype, this PC only: ')){evidence.replies.push({at:new Date().toISOString(),kind:'own-channel reply observed on actual Twitch transport'});return;}
    if(message.text.trim().toLowerCase()!=='!join')return;
    const now=Date.now(),user=message.user.toLowerCase();
    if(now-(cooldowns.get(user)??-Infinity)<10000||now-lastReply<2000||cooldowns.size>=128)return;
    cooldowns.set(user,now);lastReply=now;
    const reply=localTeeJoinReply(base),entry=reply.entryURL;
    const queued=irc.send(reply.text);
    evidence.commands.push({at:new Date().toISOString(),command:'!join',source:'real Twitch transport',replyQueued:queued,entryURL:entry});
    console.log(JSON.stringify({joinReceived:true,replyQueued:queued,entryURL:entry}));
  },{auth});
  stdin=createInterface({input:process.stdin});stdin.on('line',line=>{if(line==='quit')finish();});
  timer=setTimeout(finish,10*60*1000);
  console.log(JSON.stringify({streamerEntry:teeEntryURL(base,game.id,'streamer'),individualPlayers:true,collectiveTee:false,expiresInMinutes:10}));
}catch{finish();process.exitCode=1;}
