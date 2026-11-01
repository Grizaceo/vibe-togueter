// Disposable controller verifies invalidation, including WebSocket notification.
import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import WebSocket from 'ws';
const base=process.env.VA_ARENA_URL,headers={'Content-Type':'application/json','x-streamer-key':process.env.VA_STREAMER_KEY};
await fetch(base+'/admin/load',{method:'POST',headers,body:JSON.stringify({game:'community-grove'})});
const credit=async()=>(await fetch(base+'/community/game-credits')).json(),wait=async condition=>{for(let n=0;n<100;n++){if(await condition())return;await new Promise(r=>setTimeout(r,30));}throw Error('Credit invalidation deadline');};
const ws=new WebSocket(base.replace(/^http/,'ws')+'/spectate?name=credit-cache-observer'),updates=[];ws.on('message',raw=>{const msg=JSON.parse(raw);if(msg.t==='credits')updates.push(msg.publication);});await new Promise(r=>ws.once('open',r));
const image=path.resolve('public/curated/kenney-background-elements/sky.png'),source=path.resolve('games/community-grove/game.js'),originalImage=fs.readFileSync(image),originalCode=fs.readFileSync(source);
try{
 const initial=await credit();assert.equal(initial.status,'published');await wait(()=>updates.some(c=>c.codeSha256===initial.codeSha256));console.log('PASS WebSocket initial credits match the HTTP snapshot and loaded version');
 fs.appendFileSync(image,'invalidated fixture');await wait(async()=>(await credit()).status==='unavailable');await wait(()=>updates.some(c=>c.status==='unavailable'));console.log('PASS changed resource bytes invalidate cached attribution and notify clients');
 fs.writeFileSync(image,originalImage);await wait(async()=>(await credit()).status==='published');console.log('PASS restored exact resource bytes recover the verified snapshot');
 fs.appendFileSync(source,'\n// version change fixture\n');await wait(async()=>{const c=await credit();return c.codeSha256!==initial.codeSha256&&c.status==='unreviewed'&&c.contributors===null;});console.log('PASS changed game source cannot reuse prior game, art or idea attribution');
}finally{fs.writeFileSync(image,originalImage);fs.writeFileSync(source,originalCode);ws.close();await wait(async()=>(await credit()).status==='published');}
