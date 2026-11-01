import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {RemoteGames} from '../src/remote-games.js';
const entries=[{id:'blocks',adapter:'t99',baseURL:'https://example.test'},{id:'tee',adapter:'tee',baseURL:'https://tee.example.test'}];
const fixture=fetchImpl=>new RemoteGames(entries,path.join(fs.mkdtempSync(path.join(os.tmpdir(),'va-remote-')),'sessions.json'),{fetchImpl});
test('owner orchestration creates one durable lobby per request and does not autostart',async()=>{
 let creates=0;const registry=fixture(async(url)=>{creates++;return Response.json({code:new URL(url).searchParams.get('code')});});
 const first=await registry.create('blocks','request-001','gris_96');assert.equal(first.state,'lobby');assert.match(first.code,/^VA[A-F0-9]{6}$/);const second=await registry.create('blocks','request-001','gris_96');assert.equal(second.id,first.id);assert.equal(creates,1);
 const join=new URL(first.joinURL);assert.equal(join.searchParams.get('autostart'),null);assert.equal(join.searchParams.get('channel'),'gris_96');assert.equal(first.visibility,'public');
 await assert.rejects(registry.create('tee','request-002'),/no room/);
});
test('start checks presence and ambiguous mutations require reconciliation',async()=>{
 let room,players=0,failStart=false;const registry=fixture(async(url,options)=>{if(url.includes('?code=')){room=new URL(url).searchParams.get('code');return Response.json({code:room});}if(options.method==='GET')return Response.json({ok:true,list:[{code:room,humans:players,started:false}]});if(failStart)throw Error('Lost response');return Response.json({started:true});});
 const session=await registry.create('blocks','request-003');await assert.rejects(registry.start(session.id),/At least one/);assert.equal(registry.catalog().sessions[0].state,'lobby');
 players=1;failStart=true;await assert.rejects(registry.start(session.id),/Lost/);assert.equal(registry.catalog().sessions[0].state,'reconcile-required');await assert.rejects(registry.start(session.id),/reconciliation/);
});
test('remote origin redirects and unbounded responses are not followed',async()=>{
 const registry=fixture(async(url,options)=>{assert.equal(options.redirect,'error');return new Response('x'.repeat(262145));});await assert.rejects(registry.inspect('blocks'),/too large/);
 assert.throws(()=>new RemoteGames([{id:'bad',adapter:'t99',baseURL:'https://user:password@example.test'}],'/unused'),/configuration/);
});
test('restarting an uncertain mutation requires a read-only backend reconciliation',async()=>{
 let code;const registry=fixture(async(url)=>{if(url.includes('?code=')){code=new URL(url).searchParams.get('code');throw Error('Interrupted');}return Response.json({ok:true,list:[{code,humans:1,started:false}]});});
 await assert.rejects(registry.create('blocks','request-004'),/Interrupted/);const session=registry.data.sessions[0];assert.equal(session.state,'reconcile-required');
 const reconciled=await registry.reconcile(session.id);assert.equal(reconciled.state,'lobby');
 registry.update(session.id,{state:'starting'});const restarted=new RemoteGames(entries,registry.file,{fetchImpl:registry.fetch});assert.equal(restarted.data.sessions[0].state,'reconcile-required');
});
test('create owns its session lease until remote mutation resolves',async()=>{
 let release;const registry=fixture(url=>new Promise(resolve=>{release=()=>resolve(Response.json({code:new URL(url).searchParams.get('code')}));}));
 const creating=registry.create('blocks','request-005');const id=registry.data.sessions[0].id;await assert.rejects(registry.reconcile(id),/busy/);release();assert.equal((await creating).state,'lobby');
});
test('malformed health cannot start or erase a known lobby',async()=>{
 let code;const registry=fixture(async url=>{if(url.includes('?code=')){code=new URL(url).searchParams.get('code');return Response.json({code});}return Response.json({ok:true,list:[{code,started:false}]});});
 const session=await registry.create('blocks','request-006');await assert.rejects(registry.start(session.id),/Invalid room status/);await assert.rejects(registry.reconcile(session.id),/Invalid room status/);assert.equal(registry.data.sessions[0].state,'lobby');
});
