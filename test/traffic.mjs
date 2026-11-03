import {test} from 'node:test';import assert from 'node:assert/strict';
import {ChatGate,encodeMessage,sendRoom} from '../src/traffic.js';
test('chat flood is bounded per actor and globally before side effects',()=>{
 let now=1000;const gate=new ChatGate({now:()=>now});assert.equal(gate.accept('web','a'),true);for(let n=0;n<1000;n++)assert.equal(gate.accept('web','a'),false);
 for(let n=0;n<29;n++)assert.equal(gate.accept('twitch','person'+n),true);assert.equal(gate.accept('web','new-person'),false);now+=1000;assert.equal(gate.accept('web','a'),true);
});
test('frame compaction preserves accounting precision and bounds coordinate error',()=>{
 const state={t:'state',view:{layers:[{t:'rect',x:1.23456,y:-.276}]},fund:{balance:.25}};const decoded=JSON.parse(encodeMessage(state));assert.equal(decoded.view.layers[0].x,1.2);assert.equal(decoded.view.layers[0].y,-.3);assert.equal(decoded.fund.balance,.25);
});
test('slow clients skip obsolete frames and excessive backlog disconnects',()=>{
 let sent=0,killed=0;const ws={readyState:1,bufferedAmount:200000,send(){sent++},terminate(){killed++}};
 assert.equal(sendRoom(ws,'frame',{state:true}),false);assert.equal(sent,0);assert.equal(sendRoom(ws,'notice'),true);ws.bufferedAmount=2000000;assert.equal(sendRoom(ws,'notice'),false);assert.equal(killed,1);
});

test('actual guest nested extensions cannot recurse in controller compaction',async t=>{
 const fs=await import('node:fs'),os=await import('node:os'),path=await import('node:path');const {IsolatedGameHost}=await import('../src/isolated-gamehost.js');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'va-frame-'));fs.writeFileSync(path.join(dir,'game.js'),`export function createState(){return {}};export function tick(){};export function view(){let extension={};for(let n=0;n<3000;n++)extension={nested:extension};return {layers:[{t:'text',x:10,y:10,text:'safe',extension}]}}`);
 const h=new IsolatedGameHost({gameDir:dir});t.after(()=>{h.stop();fs.rmSync(dir,{recursive:true});});assert.equal(await h.load(),true);let encoded;assert.doesNotThrow(()=>{encoded=encodeMessage({t:'state',view:h.getView()});});assert.equal(JSON.parse(encoded).view.layers[0].text,'safe');assert.ok(!encoded.includes('extension'));
});
test('external sprite URLs and invalid primitive geometry are removed before broadcast',()=>{
 const state=JSON.parse(encodeMessage({t:'state',view:{layers:[{t:'sprite',src:'https://example.test/pixel?name=viewer'},{t:'sprite',src:'/curated/test/allowed.png'},{t:'circle',r:-1}]}}));assert.equal(state.view.layers.length,1);assert.equal(state.view.layers[0].src,'/curated/test/allowed.png');
});
test('state rate follows the game tick rate, configuration overrides it, and 30 Hz is the cap',async()=>{
 const {stateHz,stateIntervalMs,MAX_STATE_HZ}=await import('../src/traffic.js');
 assert.equal(MAX_STATE_HZ,30);assert.equal(stateHz({tickRate:30}),30);assert.equal(stateHz({tickRate:20}),20);assert.equal(stateHz({tickRate:60}),30);
 assert.equal(stateHz({configuredHz:10,tickRate:30}),10);assert.equal(stateHz({configuredHz:120,tickRate:30}),30);assert.equal(stateHz({configuredHz:'nope',tickRate:15}),15);assert.equal(stateHz({}),30);
 assert.equal(Math.round(stateIntervalMs({tickRate:30})*10)/10,33.3);
});
test('optional primitive ids survive compaction only when they are short strings or int32 integers',()=>{
 const layers=JSON.parse(encodeMessage({t:'state',view:{layers:[{t:'rect',id:'player-7'},{t:'rect',id:42},{t:'rect',id:'x'.repeat(65)},{t:'rect',id:1.5},{t:'rect',id:{nested:true}},{t:'rect',id:2**40}]}})).view.layers;
 assert.deepEqual(layers.map(p=>p.id),['player-7',42,undefined,undefined,undefined,undefined]);
});
