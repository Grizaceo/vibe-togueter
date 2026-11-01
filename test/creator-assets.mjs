import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {CreatorAssets,publicCreatorURL} from '../src/creator-assets.js';
const fixture=()=>new CreatorAssets(path.join(fs.mkdtempSync(path.join(os.tmpdir(),'va-creators-')),'assets.json'));
const proposal=()=>({title:'Synthetic test illustration',description:'A test-only illustration record, not a real artist showcase.',kind:'illustration',creator:{name:'Synthetic test creator',website:'https://example.test/artist',socials:[{label:'Portfolio',url:'https://example.test/portfolio'}]},license:{id:'CC-BY-4.0',url:'https://creativecommons.org/licenses/by/4.0/',attribution:'Synthetic test creator — test illustration'},sourceURL:'https://example.test/art.png',expectedContentSha256:'a'.repeat(64)});
const owner={name:'curator',owner:true};
test('free by default, review required, creator links and license retained in manifest',()=>{
 const registry=fixture(),asset=registry.draft(proposal());assert.equal(asset.tier,'free');assert.equal(asset.priceMinor,0);assert.equal(registry.catalog().length,0);
 assert.throws(()=>registry.review(asset.id,{owner:false},{approved:true,rightsAttested:true}),/curator/);
 registry.review(asset.id,owner,{approved:true,rightsAttested:true,featured:true,featureReason:'Synthetic fixture for attribution tests'});
 const manifest=registry.manifest([asset.id]);assert.equal(manifest.assets[0].creator.website,'https://example.test/artist');assert.equal(manifest.assets[0].creator.socials.length,1);assert.equal(manifest.assets[0].license.id,'CC-BY-4.0');assert.equal(manifest.creditPolicy.inGame,true);assert.equal(registry.catalog()[0].featured,true);
});
test('paid drafts cannot enter free catalog or builds while commerce/fee is unconfigured',()=>{
 const registry=fixture(),asset=registry.draft({...proposal(),tier:'paid',priceMinor:500});assert.throws(()=>registry.review(asset.id,owner,{approved:true,rightsAttested:true}),/commission/);assert.equal(registry.catalog().length,0);assert.throws(()=>registry.manifest([asset.id]),/published/);
});
test('platform use tracks pinned game version and cannot omit or alter creator credits',()=>{
 const registry=fixture(),asset=registry.draft(proposal());registry.review(asset.id,owner,{approved:true,rightsAttested:true});const manifest=registry.manifest([asset.id]);
 assert.equal(registry.recordUsage('test-game','b'.repeat(64),manifest),true);assert.equal(registry.recordUsage('test-game','b'.repeat(64),manifest),false);assert.equal(registry.catalog()[0].uses,1);
 const altered=structuredClone(manifest);altered.assets[0].creator.socials=[];assert.throws(()=>registry.recordUsage('test-game','c'.repeat(64),altered),/manifest changed/);
});
test('rights, content hash and safe public URLs must be supplied explicitly',()=>{
 const registry=fixture();const missing=registry.draft({...proposal(),expectedContentSha256:null});assert.throws(()=>registry.review(missing.id,owner,{approved:true,rightsAttested:true}),/fingerprint/);
 assert.throws(()=>registry.draft({...proposal(),license:{id:'CUSTOM',url:'https://example.test/license',attribution:'Author'}}),/explicit/);
 for(const url of ['javascript:alert(1)','http://example.test','https://user:password@example.test','https://localhost/x','https://127.0.0.1/x','https://example.test/a?token=private'])assert.throws(()=>publicCreatorURL(url));
});


test('fingerprints and pricing tiers cannot be coerced from another type',()=>{
 const registry=fixture();for(const value of [['a'.repeat(64)],true,123])assert.throws(()=>registry.draft({...proposal(),expectedContentSha256:value}),/fingerprint/);
 for(const tier of [false,0,''])assert.throws(()=>registry.draft({...proposal(),tier}),/tier/);
 assert.throws(()=>registry.recordUsage('game',['a'.repeat(64)],{assets:[]}),/version/);
 for(const url of ['https://localhost./','https://sub.localhost/','https://intranet/'])assert.throws(()=>publicCreatorURL(url));
});
