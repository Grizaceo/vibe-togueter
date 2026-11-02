import {test} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {WebSocket,WebSocketServer} from 'ws';
import {createGateway} from '../scripts/tee-vm-gateway.mjs';
const listen=s=>new Promise(r=>s.listen(0,'127.0.0.1',()=>r('http://127.0.0.1:'+s.address().port)));
test('gateway blocks administration/workshop and health requires the game process',async()=>{
  let calls=0,healthy=true;
  const upstream=http.createServer((req,res)=>{calls++;if(req.url==='/healthz'){res.end(healthy?'ok':'not healthy');return;}res.end('game');});
  const target=await listen(upstream),gateway=createGateway({origin:'https://trial.example',upstream:target,manifest:{contractVersion:1,schema:'teeworlds-rs/172cfef'}}),base=await listen(gateway.server);
  try{
    for(const url of ['/admin?cmd=bots','/admin/status','/api/maps','/unknown']){const r=await fetch(base+url);assert.ok([403,404].includes(r.status));}
    assert.equal(calls,0);
    assert.equal((await fetch(base+'/game',{method:'POST'})).status,403);
    const ok=await(await fetch(base+'/healthz')).json();assert.equal(ok.data.up,true);
    healthy=false;const failed=await fetch(base+'/healthz');assert.equal(failed.status,503);assert.equal((await failed.json()).data.up,false);
    const catalog=await(await fetch(base+'/community/games')).json();assert.equal(catalog.games[0].playPath,'/game');
    const entry=await fetch(base+'/?name=viewer',{redirect:'manual'});assert.equal(entry.status,302);assert.ok(entry.headers.get('location').includes('name=viewer'));
  }finally{gateway.close();upstream.close();}
});
test('gateway refuses unknown contracts, public credentials and cross-origin WebSocket requests',async()=>{
  assert.throws(()=>createGateway({origin:'https://u:p@example.test',manifest:{}}),/canonical/);
  assert.throws(()=>createGateway({origin:'https://example.test',manifest:{contractVersion:2,schema:'future'}}),/contract/);
  const gateway=createGateway({origin:'https://trial.example',manifest:{contractVersion:1,schema:'teeworlds-rs/172cfef'}}),base=await listen(gateway.server);
  try{
    await new Promise((resolve,reject)=>{const ws=new WebSocket(base.replace('http:','ws:')+'/ws',{origin:'https://evil.example'});ws.on('open',()=>{ws.terminate();reject(Error('Unexpected admission'));});ws.on('unexpected-response',(req,res)=>{res.resume();req.destroy();assert.equal(res.statusCode,403);resolve();});ws.on('error',()=>{});});
  }finally{gateway.close();}
});
test('gateway relays bounded binary play frames but closes text and forbidden upgrade paths',async()=>{
  const upstream=http.createServer(),echo=new WebSocketServer({server:upstream});
  echo.on('connection',ws=>ws.on('message',(bytes,binary)=>ws.send(bytes,{binary})));
  const target=await listen(upstream),gateway=createGateway({origin:'https://trial.example',upstream:target,manifest:{contractVersion:1,schema:'teeworlds-rs/172cfef'}}),base=await listen(gateway.server);
  try{
    const ws=new WebSocket(base.replace('http:','ws:')+'/ws',{origin:'https://trial.example'});
    await new Promise((r,j)=>{ws.once('open',r);ws.once('error',j);});
    const message=new Promise(r=>ws.once('message',(bytes,binary)=>r({bytes,binary})));ws.send(Buffer.from([0,1,65]));
    const result=await message;assert.equal(result.binary,true);assert.deepEqual(result.bytes,Buffer.from([0,1,65]));
    const closed=new Promise(r=>ws.once('close',r));ws.send('not binary');await closed;
    await new Promise((r,j)=>{const bad=new WebSocket(base.replace('http:','ws:')+'/admin');bad.on('open',()=>j(Error('admin upgraded')));bad.on('unexpected-response',(req,res)=>{assert.equal(res.statusCode,403);res.resume();req.destroy();r();});bad.on('error',()=>{});});
  }finally{gateway.close();echo.close();upstream.close();}
});
