import {test} from 'node:test';import assert from 'node:assert/strict';import {EventEmitter} from 'node:events';import {teeJoin,teeInput,teeServerMessage} from '../src/tee-protocol.js';import {TeeChatBridge} from '../src/tee-chat-bridge.js';
// Golden bytes produced with Rust shared::proto::{encode_client,encode_server}, not this JS encoder.
const snapshot='01f40301070c6368617440677269735f39360000f6420000e4430000000000000000000080bf00000000ff00000000000000000001031400010000803f0000ac0200';
test('postcard codec agrees with independent Rust golden messages',()=>{
 assert.equal(teeJoin('chat@gris_96').toString('hex'),'000c6368617440677269735f3936');assert.equal(teeInput(300,{dir:-1,jump:true,fire:true,aimX:-1,weapon:2}).toString('hex'),'01ac02ff010001000080bf0000000002');
 const state=teeServerMessage(Buffer.from(snapshot,'hex'));assert.equal(state.ack,300);assert.deepEqual(state.players[0].position,{x:123,y:456});assert.equal(state.players[0].score,-2);
 assert.throws(()=>teeServerMessage(Buffer.from(snapshot.slice(0,-4),'hex')),/Truncated/);assert.throws(()=>teeInput(1,{dir:99}),/bounded/);
});
class Socket extends EventEmitter{constructor(){super();this.readyState=1;this.bufferedAmount=0;this.sent=[];Socket.last=this;}send(bytes){this.sent.push(bytes);}terminate(){this.closed=true;this.emit('close');}}
const welcome=Buffer.from([0,7,1,50,0,0]);
test('only Twitch commands affect bounded pulses, idle/stop close the crowd socket',async()=>{
 let time=1000;const bridge=new TeeChatBridge({Socket,now:()=>time,idleMs:1000});const pending=bridge.start({id:'tee',adapter:'tee',baseURL:'https://example.test'},'gris_96');const socket=Socket.last;socket.emit('open');socket.emit('message',welcome);await pending;
 try{
  assert.equal(bridge.command('left',{source:'web',user:'owner'}),false);assert.equal(bridge.command('left',{source:'twitch',user:'viewer'}),true);assert.equal(bridge.command('fire',{source:'twitch',user:'viewer'}),false);
  bridge.tick();assert.equal(socket.sent.at(-1)[2],255);time+=351;bridge.tick();assert.equal(socket.sent.at(-1)[2],0);
  socket.emit('message',Buffer.from(snapshot,'hex'));assert.equal(bridge.status().player.position.x,123);assert.equal(bridge.status().lastAck,300);
  time+=1000;bridge.tick();assert.equal(bridge.status().reason,'idle timeout');assert.equal(socket.closed,true);
 }finally{bridge.stop();}
});
test('duplicate enable and malformed server frames fail closed without reconnecting',async()=>{
 const bridge=new TeeChatBridge({Socket});const pending=bridge.start({id:'tee',adapter:'tee',baseURL:'https://example.test'},'gris_96');await assert.rejects(bridge.start({adapter:'tee',baseURL:'https://example.test'},'gris_96'),/already/);Socket.last.emit('message',Buffer.from([99]));await assert.rejects(pending,/protocol/);assert.equal(bridge.status().enabled,false);
});
