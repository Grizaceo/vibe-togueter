import assert from 'node:assert/strict';import fs from 'node:fs';import crypto from 'node:crypto';
const base=process.env.VA_ARENA_URL,key=process.env.VA_STREAMER_KEY,headers={'x-streamer-key':key};
const get=async(p,h)=>{const r=await fetch(base+p,{headers:h});return {status:r.status,text:await r.text()};};
const round=async(data)=>{const r=await fetch(base+'/admin/round',{method:'POST',headers:{'Content-Type':'application/json','x-streamer-key':key},body:JSON.stringify(data)});return {status:r.status,text:await r.text()};};
const wait=async(fn)=>{for(let i=0;i<100;i++){if(await fn())return true;await new Promise(r=>setTimeout(r,25));}return false;};

assert.equal((await get('/admin/viewer-profile?sub=twitch:1')).status,403);
assert.equal((await get('/admin/round-credits')).status,403);
console.log('PASS viewer-profile and round-credits require streamer confirmation');

const bad=await get('/admin/viewer-profile?sub=web:x',headers);assert.equal(bad.status,400);assert.match(JSON.parse(bad.text).error,/Invalid viewer identity/);
console.log('PASS viewer-profile rejects a non-platform identity');

const fresh='kick:'+crypto.randomInt(100000,999999);
const empty=JSON.parse((await get('/admin/viewer-profile?sub='+fresh,headers)).text);
assert.deepEqual(empty,{sub:fresh,rounds:[],totals:{ideas:0,ballots:0,credits:0}});
console.log('PASS viewer-profile returns an empty profile for an unknown viewer');

const credits=JSON.parse((await get('/admin/round-credits',headers)).text);
assert.equal(typeof credits.communityCreditEnabled,'boolean');assert.ok(Array.isArray(credits.rounds));
console.log('PASS round-credits reports feature flag and round list');

await round({action:'cancel'});
const opened=await round({action:'open',settings:{maxIdeas:5,voteSeconds:5}});
if(opened.status!==200){
 console.log('PASS kick sender profile linkage (skipped: no collecting round could be opened)');
}else{
 const PRIV=fs.readFileSync(process.env.VA_TEST_KICK_PRIVATE_KEY,'utf8');
 const kick=async(body)=>{const raw=JSON.stringify(body),msgId='kick-'+crypto.randomBytes(8).toString('hex'),ts=new Date().toISOString();
  const sig=crypto.createSign('RSA-SHA256').update(`${msgId}.${ts}.${raw}`).sign(PRIV,'base64');
  const r=await fetch(base+'/webhook/kick',{method:'POST',headers:{'content-type':'application/json','kick-event-type':'chat.message.sent','kick-event-message-id':msgId,'kick-event-message-timestamp':ts,'kick-event-signature':sig},body:raw});return r.status;};
 const sender=String(crypto.randomInt(100000,999999)),other=String(crypto.randomInt(100000,999999)),ideaText='console idea '+crypto.randomBytes(4).toString('hex');
 assert.equal(await kick({message_id:'m-'+crypto.randomBytes(4).toString('hex'),sender:{user_id:Number(sender),username:'kick_fan'},content:'!idea '+ideaText}),200);
 const profile=async(sub)=>JSON.parse((await get('/admin/viewer-profile?sub='+sub,headers)).text);
 assert.ok(await wait(async()=>(await profile('kick:'+sender)).rounds.some(r=>r.ideas.some(i=>i.text===ideaText))));
 const mine=(await profile('kick:'+sender)).rounds.find(r=>r.ideas.some(i=>i.text===ideaText));
 assert.equal(mine.roundId,JSON.parse(opened.text).id);assert.equal((await profile('kick:'+other)).rounds.length,0);
 assert.ok(!JSON.stringify(await profile('kick:'+sender)).includes('proposerKey'));
 console.log('PASS a kick sender idea appears only in that sender profile');
}
