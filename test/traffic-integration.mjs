import assert from 'node:assert/strict';import WebSocket from 'ws';
const base=process.env.VA_ARENA_URL,ws=new WebSocket(base.replace(/^http/,'ws')+'/spectate?name=traffic-probe');const messages=[];
ws.on('message',b=>messages.push(JSON.parse(b)));await new Promise(r=>ws.once('open',r));
try{
 assert.match(ws.extensions,/permessage-deflate/);console.log('PASS actual WebSocket connection negotiates state compression');
 const text='flood-probe-'+ 'x'.repeat(5000);
 for(let n=0;n<100;n++)ws.send(JSON.stringify({t:'chat',text}));
 await new Promise(r=>setTimeout(r,450));const feed=messages.filter(m=>m.t==='feed'&&m.kind==='chat'&&m.text.startsWith('traffic-probe:'));
 assert.equal(feed.length,1);assert.ok(feed[0].text.length<=215);console.log('PASS web flood is throttled before feed broadcast and ordinary text is capped');
 const states=messages.filter(m=>m.t==='state');assert.ok(states.length>=5&&states.length<=18,'30 Hz tick-rate cap: '+states.length+' states in ~450 ms');assert.equal((await fetch(base+'/community/state')).status,200);console.log('PASS bounded broadcast and HTTP remain responsive under chat flood');
}finally{ws.close();}
