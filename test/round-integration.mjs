import assert from 'node:assert/strict';import WebSocket from 'ws';
const base=process.env.VA_ARENA_URL,headers={'Content-Type':'application/json','x-streamer-key':process.env.VA_STREAMER_KEY};
const action=async(data,custom=headers)=>{const r=await fetch(base+'/admin/round',{method:'POST',headers:custom,body:JSON.stringify(data)});return {status:r.status,text:await r.text()};};
const state=async()=>(await (await fetch(base+'/community/state')).json());
await action({action:'cancel'});assert.equal((await action({action:'open',settings:{maxIdeas:2,maxWords:5,voteSeconds:5}})).status,200);
assert.equal((await action({action:'approve'},{'Content-Type':'application/json'})).status,403);
const sockets=[];const connect=async(name)=>{const ws=new WebSocket(base.replace(/^http/,'ws')+'/spectate?name='+name);sockets.push(ws);await new Promise(r=>ws.once('open',r));return text=>ws.send(JSON.stringify({t:'chat',text}));};
const wait=async(fn)=>{for(let i=0;i<100;i++){if(await fn())return;await new Promise(r=>setTimeout(r,25));}throw new Error('Round state did not arrive');};
try{
 const one=await connect('owner'),two=await connect('other');one('!idea First cooperative game');two('!idea Second cooperative game');await wait(async()=>(await state()).round.phase==='voting');
 await new Promise(r=>setTimeout(r,300));one('!vote 1');await new Promise(r=>setTimeout(r,300));one('!vote 2');two('!vote 2');await wait(async()=>(await state()).round.ideas[1].votes===2);
 assert.equal((await action({action:'close'})).status,200);assert.deepEqual((await state()).round.selected,[2]);
 one('!build approve');await new Promise(r=>setTimeout(r,75));assert.equal((await state()).round.phase,'awaiting-approval');
 assert.equal((await action({action:'approve',roundId:(await state()).round.id,reviewToken:(await state()).round.reviewToken})).status,200);assert.equal((await state()).round.phase,'approved');assert.match((await state()).round.approvedInputHash,/^[a-f0-9]{64}$/);
 const blocked=await fetch(base+'/admin/generate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({idea:'unapproved different game'})});assert.equal((await blocked.json()).code,'round_approval_required');
 console.log('PASS generation rejects an arbitrary unapproved prompt');
 console.log('PASS community intake and replacement ballots reach streamer decision');console.log('PASS forged web owner cannot approve a round');console.log('PASS approved artifact input has a durable content fingerprint');
}finally{for(const ws of sockets)ws.close();}
