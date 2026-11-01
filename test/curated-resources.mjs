import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {CreatorAssets} from '../src/creator-assets.js';import {importCuratedResource} from '../src/curated-resources.js';
import {studioLinkURL} from '../public/resource-links.js';
test('local curator can open bundled bytes without permitting arbitrary HTTP links',()=>{
 assert.equal(studioLinkURL('/curated/kenney-background-elements/sky.png','http://localhost:8420'),'http://localhost:8420/curated/kenney-background-elements/sky.png');
 for(const url of ['http://evil.test/a','//evil.test/curated/a/b.png','/curated/../private.png','javascript:alert(1)'])assert.equal(studioLinkURL(url,'http://localhost:8420'),null);
});
test('curated art is byte-verified, labeled, review-gated and imported idempotently',()=>{
 const registry=new CreatorAssets(path.join(fs.mkdtempSync(path.join(os.tmpdir(),'va-curated-')),'catalog.json'));
 const a=importCuratedResource(registry,process.cwd(),'kenney-background-sky');assert.equal(a.origin,'curated-public-source');assert.equal(a.sourceURL,'/curated/kenney-background-elements/sky.png');assert.equal(registry.catalog().length,0);
 assert.equal(importCuratedResource(registry,process.cwd(),'kenney-background-sky').id,a.id);
 assert.throws(()=>importCuratedResource(registry,process.cwd(),'../../.env'),/Unknown/);
 const publicDraft=registry.draft({...a,sourceURL:'https://example.test/art.png',origin:'curated-public-source'});assert.equal(publicDraft.origin,'artist-submitted');
 registry.review(a.id,{name:'owner',owner:true},{approved:true,rightsAttested:true});assert.equal(registry.manifest([a.id]).assets[0].origin,'curated-public-source');
});
