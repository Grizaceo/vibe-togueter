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
// Negotiated frame formats against the real controller: binary and JSON deltas, legacy and none.
{
 const {createFrameDecoder}=await import('../public/frame-codec.js');
 const open=async fmt=>{const sock=new WebSocket(base.replace(/^http/,'ws')+'/spectate?name=fmt-probe'+(fmt?'&frames='+fmt:''));sock.binaryType='arraybuffer';const got=[];sock.on('message',(data,isBinary)=>got.push(isBinary?data:data.toString()));await new Promise(r=>sock.once('open',r));return {sock,got};};
 const clients=Object.fromEntries(await Promise.all(['b1,d1','d1','none',null].map(async f=>[String(f),await open(f)])));
 await new Promise(r=>setTimeout(r,600));
 try{
  const welcome=c=>JSON.parse(c.got.find(m=>typeof m==='string'&&m.startsWith('{"t":"welcome"')));
  const states=c=>{const d=createFrameDecoder();return c.got.filter(m=>typeof m!=='string'||/^\{"t":"(k|d|state)"/.test(m)).map(m=>d.decode(m));};
  const bin=clients['b1,d1'],json=clients.d1,none=clients.none,legacy=clients.null;
  const b=states(bin),j=states(json);
  assert.equal(welcome(bin).frames,'b1');assert.ok(bin.got.some(m=>typeof m!=='string'),'binary frames arrive');
  assert.ok(b.length>=5&&b.every(m=>m.t==='state'&&Array.isArray(m.view.layers)),'binary keyframe+deltas rebuild full states');
  assert.equal(welcome(json).frames,'d1');assert.ok(json.got.some(m=>m.startsWith?.('{"t":"d"')),'JSON deltas arrive');assert.ok(j.every(m=>m.t==='state'));
  assert.deepEqual(b.at(-1).view.hud.length>0||b.at(-1).view.layers.length>0,true);
  console.log('PASS controller negotiates binary and JSON keyframe/delta frames that rebuild full states');
  assert.equal(welcome(legacy).frames,'full');assert.ok(legacy.got.some(m=>typeof m==='string'&&m.startsWith('{"t":"state"')),'legacy full JSON still sent');
  assert.equal(welcome(none).frames,'none');assert.ok(!none.got.some(m=>typeof m!=='string'||/^\{"t":"(k|d|state)"/.test(m)),'no state frames for non-drawing sockets');
  console.log('PASS clients that ask nothing keep legacy full state; frames=none receives none');
  const before=bin.got.length;bin.sock.send(JSON.stringify({t:'resync'}));await new Promise(r=>setTimeout(r,150));
  const after=bin.got.slice(before).filter(m=>typeof m!=='string').map(m=>new Uint8Array(m)[0]&0x7f);
  assert.ok(after.includes(1),'resync answered with a binary keyframe');
  console.log('PASS resync request is answered with a keyframe');
 }finally{for(const c of Object.values(clients))c.sock.close();}
}
