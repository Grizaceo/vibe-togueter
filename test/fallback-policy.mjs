import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {fallbackOrder,FallbackPolicy} from '../src/fallback-policy.js';
test('fallback accepts reviewed IDs only and keeps Marble last once',()=>{
 assert.deepEqual(fallbackOrder(['marble-race','chat-vs-streamer','community-grove']),['chat-vs-streamer','community-grove','marble-race']);
 for(const order of [['../private'],['auto-123'],['community-grove','community-grove'],['tee'],null])assert.throws(()=>fallbackOrder(order));
});
test('owner preference persists; disabled flag keeps original fallback; failed save keeps prior order',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'va-fallback-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const file=path.join(dir,'order.json');
 const policy=new FallbackPolicy(file,{enabled:true});policy.set(['chat-vs-streamer']);assert.deepEqual(new FallbackPolicy(file,{enabled:true}).effective,['chat-vs-streamer','marble-race']);
 const disabled=new FallbackPolicy(file,{enabled:false});assert.deepEqual(disabled.effective,['marble-race']);assert.throws(()=>disabled.set([]));
 policy.file=dir;assert.throws(()=>policy.set(['community-grove']));assert.deepEqual(policy.effective,['chat-vs-streamer','marble-race']);
});
