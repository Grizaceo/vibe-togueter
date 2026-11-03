import {test} from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {TeeChatBridge} from '../src/tee-chat-bridge.js';
import {routeTeeChat} from '../src/tee-local-session.js';
import {teeInput,teeServerMessage} from '../src/tee-protocol.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {nativeTeeCodec} from '../src/tee-native-codec.js';
import {teeEntryURL,localTeeJoinReply} from '../src/tee-join.js';
import {createChatCommands} from '../src/server/chat-commands.js';
import {RemoteGames} from '../src/remote-games.js';
class Socket extends EventEmitter {
  constructor(){super();this.readyState=1;this.bufferedAmount=0;this.sent=[];Socket.last=this;}
  send(bytes){this.sent.push(bytes);}terminate(){this.closed=true;}
}
test('strict legacy codec rejects unknown input fields and unconsumed welcome/pong bytes',()=>{
  assert.throws(()=>teeInput(1,{dash:true}),/bounded/);
  assert.throws(()=>teeInput(1,{aimX:1e300}),/bounded/);
  assert.throws(()=>teeServerMessage(Buffer.from([0,7,1,50,0,0])),/Truncated/);
  assert.throws(()=>teeServerMessage(Buffer.from([0,7,1,50,0,0,2,0,99])),/Unexpected/);
  assert.throws(()=>teeServerMessage(Buffer.from([2,1,1,99])),/Unexpected/);
});
test('local contract admission, Twitch authority, global/user cooldown, pulse expiry and pause',async()=>{
  let time=1000;
  const codec={version:'teeworlds-rs/172cfef',join:()=>Buffer.from([0]),input:(seq,input)=>({seq,...input}),decode:bytes=>JSON.parse(bytes)};
  const bridge=new TeeChatBridge({Socket,now:()=>time,codec});
  await assert.rejects(bridge.startLocal('ws://example.test/ws','owner'),/loopback/);
  await assert.rejects(bridge.startLocal('ws://127.0.0.1/ws?token=bad','owner'),/loopback/);
  const pending=bridge.startLocal('ws://127.0.0.1:8304/ws','owner');
  Socket.last.emit('message',JSON.stringify({type:'welcome',playerId:1}));await pending;
  try{
    assert.equal(routeTeeChat(bridge,'owner',{source:'web',user:'owner',text:'!tee right'}),false);
    assert.equal(routeTeeChat(bridge,'owner',{source:'twitch',user:'viewer',text:'!tee right'}),true);
    assert.equal(bridge.command('left',{source:'twitch',user:'another'}),false);
    time+=101;assert.equal(bridge.command('left',{source:'twitch',user:'viewer'}),false);
    bridge.tick();assert.equal(Socket.last.sent.at(-1).dir,1);
    time+=251;bridge.tick();assert.equal(Socket.last.sent.at(-1).dir,undefined);
    assert.equal(routeTeeChat(bridge,'owner',{source:'twitch',user:'viewer',text:'!pause'}),false);
    assert.equal(routeTeeChat(bridge,'owner',{source:'twitch',user:'mod',isModerator:true,text:'!pause'}),true);
    assert.equal(bridge.command('fire',{source:'twitch',user:'viewer'}),false);
    assert.equal(bridge.status().paused,true);
    assert.equal(routeTeeChat(bridge,'owner',{source:'twitch',user:'owner',text:'!resume'}),true);
    assert.equal(bridge.command('jump',{source:'twitch',user:'viewer'}),true);
    assert.equal(bridge.status().participation,'collective-tee');
  }finally{bridge.stop();}
});
test('unknown native message types and snapshots before welcome fail closed',async()=>{
  for(const message of [{type:'future'},{type:'snapshot',players:[]}]){
    const codec={version:'teeworlds-rs/172cfef',decode:async()=>message};
    const bridge=new TeeChatBridge({Socket,codec});const pending=bridge.startLocal('ws://127.0.0.1:8304/ws','owner');
    Socket.last.emit('message',Buffer.from([0]));await assert.rejects(pending,/protocol/);
    assert.equal(Socket.last.closed,true);
  }
});
function helper(handshake,reply={ok:{type:'pong',tick:1}}){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'va-codec-fixture-')),file=path.join(dir,'codec');
  fs.writeFileSync(file,'#!/usr/bin/env node\n'+`console.log(${JSON.stringify(JSON.stringify(handshake))});\nprocess.stdin.on('data',()=>console.log(${JSON.stringify(JSON.stringify(reply))}));`,{mode:0o700});
  return {file,close:()=>fs.rmSync(dir,{recursive:true,force:true})};
}
test('native helper refuses unknown versions and contract fields before connection',async()=>{
  const base={version:1,schema:'teeworlds-rs/172cfef',capabilities:['collective-tee','bounded-input','authoritative-position']};
  for(const handshake of [{...base,version:2},{...base,extra:true}]){
    const fixture=helper(handshake);try{await assert.rejects(nativeTeeCodec(fixture.file),/contract/);}finally{fixture.close();}
  }
});
test('native input uses advanced Rust golden bytes and rejects unknown reply fields',async()=>{
  const fixture=helper({version:1,schema:'teeworlds-rs/172cfef',capabilities:['collective-tee','bounded-input','authoritative-position']},{ok:{type:'pong'},extra:true});
  const codec=await nativeTeeCodec(fixture.file);
  try{
    assert.equal(codec.input(300,{dir:-1,jump:true,fire:true,aimX:-1,weapon:2}).toString('hex'),'01ac02ff010001000080bf0000000002000000');
    await assert.rejects(codec.decode(Buffer.from([0])),/fields/);
  }finally{codec.close();fixture.close();}
});
test('individual join replies with platform entry and never starts a collective tee',()=>{
  const replies=[];
  const handle=createChatCommands({ROOT:'/tmp/fixture',TWITCH_CHANNEL:'owner',getPublicURL:()=> 'https://platform.example',replies:{twitch:text=>replies.push(text)},chatEffects:{command:()=>({handled:false}),blocked:false},host:{gameDir:'other'},feed:()=>{},remoteGames:{entries:[{id:'tee-example',adapter:'tee',joinByDefault:true}]},teeBridge:{start:()=>{throw Error('Must not start collective bridge');}}});
  handle({source:'twitch',user:'viewer',text:'!join'});
  assert.equal(replies.length,1);
  const entry=new URL(replies[0].split(' ').at(-1));
  assert.equal(entry.origin,'https://platform.example');assert.equal(entry.pathname,'/tee-play.html');
  // The reply is public chat: it must not carry the requester's name (the page asks).
  assert.equal(entry.searchParams.get('game'),'tee-example');assert.equal(entry.searchParams.get('name'),null);
  assert.deepEqual([...entry.searchParams.keys()],['game']);assert.ok(!replies[0].includes('viewer'));
});
test('join URL cannot carry credentials and only one Tee may be selected for default entry',()=>{
  assert.throws(()=>teeEntryURL('https://secret:token@example.test','tee','viewer'),/Invalid/);
  assert.throws(()=>teeEntryURL('http://public.example','tee','viewer'),/Invalid/);
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'va-join-test-'));
  try{
    assert.throws(()=>new RemoteGames([{id:'one',adapter:'tee',baseURL:'https://a.test',joinByDefault:true},{id:'two',adapter:'tee',baseURL:'https://b.test',joinByDefault:true}],path.join(dir,'sessions.json')),/at most one/);
    assert.throws(()=>new RemoteGames([{id:'one',adapter:'t99',baseURL:'https://a.test',joinByDefault:true}],path.join(dir,'sessions.json')),/at most one/);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('local Twitch reply avoids filename linkification and instructs full-address copy',()=>{
  const reply=localTeeJoinReply('http://127.0.0.1:40661');
  assert.equal(reply.entryURL,'http://127.0.0.1:40661/');
  assert.match(reply.text,/COPY the entire address/);assert.ok(!reply.text.includes('.html'));
  assert.throws(()=>localTeeJoinReply('http://secret:token@127.0.0.1:40661'),/private/);
});
