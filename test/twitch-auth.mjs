import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {TwitchAuth,authorize} from '../src/auth/twitch.js';
const info={client_id:'test-client',login:'owner',user_id:'123',scopes:['chat:read','chat:edit'],expires_in:3600};
function fixture(fetchImpl,now){const file=path.join(fs.mkdtempSync(path.join(os.tmpdir(),'va-auth-')),'.env');fs.writeFileSync(file,'VA_PUBLIC_URL="https://example.test"\n',{mode:0o644});return new TwitchAuth({file,env:{VA_TWITCH_CLIENT_ID:'test-client',VA_TWITCH_CLIENT_SECRET:'test-secret',VA_TWITCH_ACCESS_TOKEN:'old-token',VA_TWITCH_REFRESH_TOKEN:'refresh-token'},fetchImpl,now});}
const response=(data,status=200)=>new Response(JSON.stringify(data),{status});
test('validates at startup and before an hour, validates client and scopes',async()=>{
 let clock=0,calls=0;const auth=fixture(async()=>{calls++;return response(info);},()=>clock);
 await auth.validate();await auth.validate();assert.equal(calls,1);clock=3500000;await auth.validate();assert.equal(calls,2);
 auth.info=null;auth.checkedAt=null;auth.fetch=async()=>response({...info,client_id:'wrong'});await assert.rejects(auth.validate(),/another application/);
 auth.fetch=async()=>response({...info,scopes:['chat:read']});await assert.rejects(auth.validate(),/scopes/);
});
test('401 refresh saves rotated tokens privately and preserves other settings',async()=>{
 const calls=[];const auth=fixture(async(url,opts)=>{calls.push(url);if(url.endsWith('/token'))return response({access_token:'new-token',refresh_token:'new-refresh'});return opts.headers.Authorization==='OAuth old-token'?response({},401):response(info);});
 await auth.validate();assert.equal(calls.length,3);assert.equal(auth.token,'new-token');assert.equal(fs.statSync(auth.file).mode&0o777,0o600);
 const data=fs.readFileSync(auth.file,'utf8');assert.ok(data.includes('https://example.test'));assert.ok(data.includes('new-refresh'));
});
test('Helix retries 401 once and concurrent refreshes coalesce',async()=>{
 let refreshes=0,helix=0;const auth=fixture(async(url)=>{if(url.endsWith('/validate'))return response(info);if(url.endsWith('/token')){refreshes++;await new Promise(r=>setTimeout(r,10));return response({access_token:'new',refresh_token:'new-r'});}helix++;return helix===1?response({},401):response({data:[{id:'123'}]});});
 assert.deepEqual(await auth.helix('users'),{data:[{id:'123'}]});assert.equal(helix,2);assert.equal(refreshes,1);
 await Promise.all([auth.refresh(),auth.refresh()]);assert.equal(refreshes,2);
});
test('OAuth rejects wrong state including unicode and exchanges only valid callback',async()=>{
 const auth=fixture(async(url,opts)=>url.endsWith('/token')?(assert.equal(opts.body.get('code'),'private-test-code'),response({access_token:'new',refresh_token:'new-r'})):response(info));
 auth.values.VA_TWITCH_REDIRECT_URI='http://localhost:3007/callback';
 await authorize(auth,{timeoutMs:2000,onUrl:async raw=>{
  const url=new URL(raw),callback=new URL(auth.values.VA_TWITCH_REDIRECT_URI);
  callback.search=new URLSearchParams({state:'é'.repeat(64),code:'bad'});assert.equal((await fetch(callback)).status,400);
  callback.search=new URLSearchParams({state:url.searchParams.get('state'),code:'private-test-code'});assert.equal((await fetch(callback)).status,200);
 }});
 assert.equal(auth.token,'new');
});
test('network errors cannot echo tokens or raw server errors',async()=>{
 const auth=fixture(async()=>{throw new Error('secret-token-should-not-escape');});await assert.rejects(auth.validate(),e=>!e.message.includes('secret-token'));
});


test('hourly maintenance validates, rotates refreshable tokens, then validates new identity',async()=>{
 const requests=[];const auth=fixture(async(url)=>{requests.push(url);return url.endsWith('/token')?response({access_token:'hourly-new',refresh_token:'hourly-refresh'}):response(info);});
 await auth.maintain();assert.equal(requests.length,3);assert.equal(auth.token,'hourly-new');assert.ok(requests[1].endsWith('/token'));
});
