import {test} from 'node:test';import assert from 'node:assert/strict';import crypto from 'node:crypto';
import {decodeTwitchEvent,rewardCommand} from '../src/twitch-events.js';
import {subscriptionBody,subscribe} from '../scripts/twitch-eventsub-subscribe.mjs';
const secret='testSecret1234567890';
function headers(raw,at=Date.now()){const id='delivery-1',ts=new Date(at).toISOString();return {'twitch-eventsub-message-id':id,'twitch-eventsub-message-timestamp':ts,'twitch-eventsub-message-type':'notification','twitch-eventsub-message-signature':'sha256='+crypto.createHmac('sha256',secret).update(id+ts+raw).digest('hex')};}
test('valid signatures, bad signatures, stale timestamps and malformed JSON',()=>{
 const raw='{"event":{}}';assert.equal(decodeTwitchEvent(headers(raw),raw,secret).status,200);
 assert.equal(decodeTwitchEvent(headers(raw),raw+' ',secret).status,403);
 assert.equal(decodeTwitchEvent(headers(raw,Date.now()-700000),raw,secret).status,403);
 assert.equal(decodeTwitchEvent(headers('{'),'{',secret).status,400);
 assert.equal(decodeTwitchEvent(headers('null'),'null',secret).status,400);
});
test('reward titles map exactly to configured bounded game commands',()=>{
 assert.equal(rewardCommand({reward:{title:'Join'}},{Join:'!play'}),'!play');
 assert.equal(rewardCommand({reward:{title:'__proto__'}},{}),null);
 assert.equal(rewardCommand({reward:{title:'Join'}},{Join:'!play\n!race'}),null);
 assert.equal(rewardCommand({reward:{title:'Unknown'}},{Join:'!play'}),null);
});
test('EventSub uses app token, broadcaster condition and both requested types plus optional points',async()=>{
 const calls=[];const auth={validate:async()=>({user_id:'123'}),appToken:async()=> 'app-test-token',require:()=> 'client-test'};
 await subscribe({auth,callback:'https://example.test/webhook/twitch',secret,points:true,fetchImpl:async(url,opts)=>{calls.push(opts);return new Response(JSON.stringify({data:[{id:'one',status:'enabled'}]}),{status:202});}});
 assert.equal(calls.length,3);assert.ok(calls.every(x=>x.headers.Authorization==='Bearer app-test-token'));
 assert.deepEqual(calls.map(x=>JSON.parse(x.body).type),['channel.subscribe','channel.bits.use','channel.channel_points_custom_reward_redemption.add']);
 assert.equal(JSON.parse(calls[0].body).condition.broadcaster_user_id,'123');
 assert.throws(()=>subscriptionBody('x','123','http://example.test/hook',secret),/HTTPS/);
 assert.throws(()=>subscriptionBody('x','123','https://example.test/hook','cambia-esto-tambien'),/private/);
});
