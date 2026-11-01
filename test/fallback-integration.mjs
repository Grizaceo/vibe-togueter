// Runs only inside run-legacy's disposable checkout/controller.
import fs from 'node:fs';import path from 'node:path';import WebSocket from 'ws';
const base=process.env.VA_ARENA_URL;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const ok=(name,value)=>{console.log(`${value?'PASS':'FAIL'} ${name}`);if(!value)process.exitCode=1;};
const post=(route,body,extra={})=>fetch(base+route,{method:'POST',headers:{'Content-Type':'application/json',...extra},body:JSON.stringify(body)});
const status=async()=>(await fetch(base+'/admin/status')).json();
const dir=path.resolve('games/failure-fixture');fs.mkdirSync(dir,{recursive:true});
fs.writeFileSync(path.join(dir,'game.js'),`export const meta={name:'Failure fixture'};export function createState(){return {}};export function tick(){while(true){}};export function view(){return {}}`);
const ws=new WebSocket(base.replace(/^http/,'ws')+'/play?name=survivor');let fallbackFrame;
ws.on('message',b=>{const msg=JSON.parse(b);if(msg.t==='state'&&msg.fallback?.active)fallbackFrame=msg;});
await new Promise(r=>ws.once('open',r));
await post('/admin/load',{game:'failure-fixture'});
let current;for(let n=0;n<50;n++){current=await status();if(current.game?.name==='Marble Race'&&!current.error)break;await sleep(100);}
ok('hung SDK tick falls back while controller HTTP and existing socket survive',current.game?.name==='Marble Race'&&!current.error&&ws.readyState===1);
await sleep(150);ok('fallback frame visibly identifies the cause and rejoins connected players',fallbackFrame?.fallback.reason.includes('timed out')&&fallbackFrame.players.some(p=>p.name==='survivor'));
await post('/admin/load',{game:'community-grove'});ws.send(JSON.stringify({t:'chat',text:'!fallback'}));await sleep(200);
ok('web nickname cannot impersonate a Twitch moderator fallback', (await status()).game?.name==='Community Grove');
ok('forced fallback rejects missing streamer confirmation',(await post('/admin/fallback',{})).status===403);
const response=await post('/admin/fallback',{}, {'x-streamer-key':process.env.VA_STREAMER_KEY});
ok('private owner can force the same fallback',(await response.json()).active&&(await status()).game?.name==='Marble Race');
ws.close();fs.rmSync(dir,{recursive:true});

const headers={'x-streamer-key':process.env.VA_STREAMER_KEY};
ok('fallback preferences reject missing owner confirmation',(await post('/admin/fallback-order',{order:['chat-vs-streamer']})).status===403);
ok('fallback preferences reject candidate or external game IDs',(await post('/admin/fallback-order',{order:['auto-candidate']},headers)).status===400);
const preferredFile=path.resolve('games/chat-vs-streamer/game.js'),original=fs.readFileSync(preferredFile);
try{
 await post('/admin/fallback-order',{order:['chat-vs-streamer']},headers);await post('/admin/load',{game:'community-grove'});await post('/admin/fallback',{},headers);
 ok('owner-selected reviewed fallback loads before Marble',(await status()).game?.name.includes('Democracy Duel'));
 await post('/admin/load',{game:'community-grove'});fs.appendFileSync(preferredFile,'\n// unreviewed change\n');await post('/admin/fallback',{},headers);
 ok('changed preferred source is skipped and Marble remains final fallback',(await status()).game?.name==='Marble Race');
}finally{fs.writeFileSync(preferredFile,original);await post('/admin/fallback-order',{order:[]},headers);}
