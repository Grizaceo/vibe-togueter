import {test} from 'node:test';import assert from 'node:assert/strict';import {EventEmitter} from 'node:events';
import {parseTwitchMessage,connectTwitch} from '../src/chat/twitch.js';
test('tagged IRC and Shared Chat room filtering',()=>{
 assert.equal(parseTwitchMessage('@id=one;room-id=1 :fan!fan@h PRIVMSG #owner :!play','owner').text,'!play');
 assert.equal(parseTwitchMessage('@source-room-id=2;room-id=1 :fan!fan@h PRIVMSG #owner :!race','owner'),null);
 assert.equal(parseTwitchMessage(':fan!fan@h PRIVMSG #other :!play','owner'),null);
});
test('stable sender reconnects, deduplicates, sanitizes and throttles messages',async()=>{
 const sockets=[];class Socket extends EventEmitter{constructor(){super();this.readyState=1;this.sent=[];sockets.push(this);}send(s){this.sent.push(s);}close(){this.readyState=3;this.emit('close');}}
 const messages=[];const auth={token:'private',validate:async()=>({login:'owner'})};
 const controller=connectTwitch('owner',m=>messages.push(m),{auth,WebSocketImpl:Socket,retryMs:5,sendIntervalMs:10});
 try{
  await new Promise(r=>setTimeout(r,1));let ws=sockets[0];ws.emit('open');ws.emit('message',Buffer.from(':tmi 001 owner :welcome\r\n'));
  ws.emit('message',Buffer.from('@id=a :fan!fan@h PRIVMSG #owner :!play\r\n'));ws.emit('message',Buffer.from('@id=a :fan!fan@h PRIVMSG #owner :!play\r\n'));assert.equal(messages.length,1);
  controller.send('one\r\nINJECT');controller.send('two');assert.equal(ws.sent.filter(x=>x.startsWith('PRIVMSG')).length,1);
  await new Promise(r=>setTimeout(r,15));assert.equal(ws.sent.filter(x=>x.startsWith('PRIVMSG')).length,2);assert.ok(!ws.sent.some(x=>x.includes('\r\nINJECT')));
  ws.close();await new Promise(r=>setTimeout(r,15));ws=sockets[1];ws.emit('open');ws.emit('message',Buffer.from(':tmi 001 owner :welcome\r\n'));assert.ok(controller.send('after reconnect'));assert.ok(ws.sent.some(x=>x.includes('after reconnect')));
 }finally{controller.close();}
});
test('only Twitch moderator tags grant moderator fallback authority',()=>{
 const message=parseTwitchMessage('@mod=1;room-id=7;id=mod-msg :real_mod!real_mod@real_mod.tmi.twitch.tv PRIVMSG #test :!fallback','test');
 assert.equal(message.isModerator,true);
 assert.equal(parseTwitchMessage(':fake_mod!fake_mod@fake_mod.tmi.twitch.tv PRIVMSG #test :!fallback','test').isModerator,undefined);
});
