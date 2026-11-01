// Explicit protocol rehearsal against the owner's configured, existing runtimes.
// Creates a public lobby; does not provision VMs, run code agents or send Twitch chat.
import fs from 'node:fs';import {WebSocket} from 'ws';import {loadEnv} from '../src/auth/twitch.js';
if(!process.argv.includes('--live'))throw Error('Use --live to create/start a room on the configured demo VM.');
loadEnv('.env');const base=process.env.VA_ARENA_URL||'http://127.0.0.1:8420';if(!['localhost','127.0.0.1','[::1]'].includes(new URL(base).hostname))throw Error('Owner administration must use local loopback.');
const headers={'Content-Type':'application/json',Authorization:'Bearer '+process.env.VA_ADMIN_TOKEN,'x-streamer-key':process.env.VA_STREAMER_KEY};
const result={at:new Date().toISOString(),kind:'automated remote protocol rehearsal, not human/browser gameplay',checks:[],timingsMs:{}};const sockets=[];
const check=(name,ok)=>{result.checks.push({name,ok:!!ok});if(!ok)throw Error(name);};
const action=async body=>{const t=performance.now();const response=await fetch(base+'/admin/remote-games',{method:'POST',headers,body:JSON.stringify(body),signal:AbortSignal.timeout(15000)});const text=await response.text();if(!response.ok)throw Error('Owner action '+body.action+': '+response.status+' '+text);(result.timingsMs[body.action]||=[]).push(Math.round(performance.now()-t));return JSON.parse(text);};
const until=async(fn,label)=>{const end=Date.now()+12000;while(Date.now()<end){if(fn())return;await new Promise(r=>setTimeout(r,50));}throw Error('Timeout '+label);};
try{
 const catalog=await(await fetch(base+'/community/games')).json();const game=catalog.games.find(g=>g.adapter==='t99');if(!game)throw Error('No falling-blocks runtime configured.');
 result.runtime=game.baseURL;result.health=await action({action:'inspect',gameId:game.id});check('remote health API responds',result.health.ok);
 const tee=catalog.games.find(g=>g.adapter==='tee');if(tee){const status=await action({action:'inspect',gameId:tee.id});check('tee runtime health API responds',status.ok);}
 const requestId='rehearsal-'+Date.now();const session=await action({action:'create',gameId:game.id,requestId});result.session={id:session.id,code:session.code,joinURL:session.joinURL};check('lobby link waits for streamer start',!new URL(session.joinURL).searchParams.has('autostart'));
 const again=await action({action:'create',gameId:game.id,requestId});check('repeated create returns same session',again.id===session.id);
 const rejected=await fetch(base+'/admin/remote-games',{method:'POST',headers,body:JSON.stringify({action:'start',sessionId:session.id})});check('empty lobby cannot start',rejected.status===400);
 const str=s=>{const bytes=Buffer.from(s);return Buffer.concat([Buffer.from([bytes.length]),bytes]);};
 const clients=[];
 for(const name of ['VA-protocol-A','VA-protocol-B']){
  const ws=new WebSocket(game.baseURL.replace('https:','wss:')+'/ws');sockets.push(ws);const got={welcome:false,begin:false,snapshots:0};clients.push(got);
  ws.on('error',()=>{});ws.on('message',bytes=>{const b=Buffer.from(bytes);if(b[0]===1)got.welcome=true;if(b[0]===3)got.begin=true;if(b[0]===4)got.snapshots++;});
  await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(Error('WS open timeout')),10000);ws.once('open',()=>{clearTimeout(timeout);resolve();});ws.once('error',e=>{clearTimeout(timeout);reject(e);});});
  ws.send(Buffer.concat([Buffer.from([1,2]),str(name)]));ws.send(Buffer.concat([Buffer.from([2]),str(session.code)]));await until(()=>got.welcome,'protocol v2 Welcome');
 }
 const lobby=await action({action:'inspect',gameId:game.id});check('two automated players joined correct room',lobby.details.list.find(r=>r.code===session.code)?.humans===2);
 const started=await action({action:'start',sessionId:session.id});check('owner start confirmed',started.state==='started');await until(()=>clients.every(c=>c.begin&&c.snapshots>=3),'Begin and snapshots');result.protocol=clients;check('both clients received Begin and live snapshots',clients.every(c=>c.begin&&c.snapshots>=3));
 for(const ws of sockets)ws.close();await until(()=>sockets.every(ws=>ws.readyState===WebSocket.CLOSED),'socket cleanup');
 const reconciled=await action({action:'reconcile',sessionId:session.id});check('closed room reconciles as missing',reconciled.state==='missing');
}catch(error){result.error=error.message;process.exitCode=1;}finally{for(const ws of sockets)ws.terminate();fs.mkdirSync('docs/evidence',{recursive:true});const output='docs/evidence/remote-games-'+Date.now()+'.json';fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({output,...result},null,2));}
