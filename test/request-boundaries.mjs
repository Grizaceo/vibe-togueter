import {test} from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {secretMatches,staticFileInside} from '../src/request-boundaries.js';
test('private confirmation requires nonempty exact UTF-8 bytes and rejects invalid header types',()=>{
 assert.equal(secretMatches('example-ñ','example-ñ'),true);
 for(const [a,b] of [['',''],[undefined,undefined],['key',['key']],['key',''],['key','kez'],['ñ','n'],['key',undefined]])assert.equal(secretMatches(a,b),false);
});
test('static resolution rejects siblings, traversal, directories and links outside either static root',t=>{
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'va-static-'));t.after(()=>fs.rmSync(temp,{recursive:true,force:true}));
 const root=path.join(temp,'public'),sibling=path.join(temp,'public-copy');fs.mkdirSync(root);fs.mkdirSync(sibling);fs.writeFileSync(path.join(root,'index.html'),'page');fs.writeFileSync(path.join(sibling,'private.txt'),'fixture');
 assert.equal(staticFileInside(root,path.join(root,'index.html')),true);
 for(const target of [root,path.join(root,'missing'),path.join(sibling,'private.txt'),path.join(root,'../public-copy/private.txt')])assert.equal(staticFileInside(root,target),false);
 fs.symlinkSync(sibling,path.join(root,'escape'));assert.equal(staticFileInside(root,path.join(root,'escape','private.txt')),false);
 const client=path.join(temp,'client');fs.mkdirSync(client);fs.writeFileSync(path.join(client,'index.html'),'game client');assert.equal(staticFileInside(client,path.join(client,'index.html')),true);assert.equal(staticFileInside(root,path.join(client,'index.html')),false);
});
