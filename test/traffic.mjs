import {test} from 'node:test';import assert from 'node:assert/strict';
import {ChatGate,encodeMessage,sendRoom} from '../src/traffic.js';
test('chat flood is bounded per actor and globally before side effects',()=>{
 let now=1000;const gate=new ChatGate({now:()=>now});assert.equal(gate.accept('web','a'),true);for(let n=0;n<1000;n++)assert.equal(gate.accept('web','a'),false);
 for(let n=0;n<29;n++)assert.equal(gate.accept('twitch','person'+n),true);assert.equal(gate.accept('web','new-person'),false);now+=1000;assert.equal(gate.accept('web','a'),true);
});
test('frame compaction preserves accounting precision and bounds coordinate error',()=>{
 const state={t:'state',view:{layers:[{x:1.23456,y:-.276}]},fund:{balance:.25}};const decoded=JSON.parse(encodeMessage(state));assert.equal(decoded.view.layers[0].x,1.2);assert.equal(decoded.view.layers[0].y,-.3);assert.equal(decoded.fund.balance,.25);
});
test('slow clients skip obsolete frames and excessive backlog disconnects',()=>{
 let sent=0,killed=0;const ws={readyState:1,bufferedAmount:200000,send(){sent++},terminate(){killed++}};
 assert.equal(sendRoom(ws,'frame',{state:true}),false);assert.equal(sent,0);assert.equal(sendRoom(ws,'notice'),true);ws.bufferedAmount=2000000;assert.equal(sendRoom(ws,'notice'),false);assert.equal(killed,1);
});
