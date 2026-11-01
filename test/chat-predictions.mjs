import {test} from 'node:test';import assert from 'node:assert/strict';import {ChatPredictions} from '../src/chat-predictions.js';
const owner={owner:true,source:'twitch',name:'owner'},viewer=name=>({source:'twitch',name});
test('one latest ballot per actor, closed voting and streamer-reported winners',()=>{
 const p=new ChatPredictions({enabled:true});p.open(owner,['Left','Right']);p.vote(viewer('alice'),'left');p.vote(viewer('ALICE'),'RIGHT');p.vote(viewer('bob'),'Right');assert.equal(p.public().participants,2);assert.deepEqual(p.public().choices.map(c=>c.count),[0,2]);
 assert.throws(()=>p.resolve(owner,'Right'),/Lock/);p.lock(owner);assert.throws(()=>p.vote(viewer('carol'),'Right'),/open/);p.resolve(owner,'Right');assert.equal(p.public().winnerCount,2);assert.equal(p.public().resolution,'streamer-reported');
 p.open(owner,['Sun','Rain']);assert.equal(p.public().participants,0);
});
test('untrusted owners, malformed choices, expired windows and disabled features fail closed',()=>{
 let now=10000;const p=new ChatPredictions({enabled:true,now:()=>now});assert.throws(()=>p.open({...owner,source:'web'},['a','b']),/streamer/);
 for(const choices of [['a','A'],['a'],['a',''],['a','b\n']])assert.throws(()=>p.open(owner,choices));p.open(owner,['a','b']);assert.throws(()=>p.lock(viewer('mod')),/streamer/);now+=60000;assert.equal(p.public().phase,'locked');assert.throws(()=>p.vote(viewer('late'),'a'));assert.throws(()=>p.resolve(owner,'missing'));p.cancel(owner);
 const disabled=new ChatPredictions({enabled:false});assert.throws(()=>disabled.open(owner,['a','b']),/disabled/);assert.equal(disabled.public(),null);
});
