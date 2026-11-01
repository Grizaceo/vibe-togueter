import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {CreatorAssets} from '../src/creator-assets.js';import {importCuratedResource} from '../src/curated-resources.js';import {reviewGame,publishGameCredits,currentGameCredits} from '../src/game-credits.js';import * as grove from '../templates/community-grove/game.js';
const fixture=()=>{const root=fs.mkdtempSync(path.join(os.tmpdir(),'va-publication-')),source=path.resolve(fileURLToPath(new URL('..',import.meta.url)));fs.cpSync(path.join(source,'public','curated'),path.join(root,'public','curated'),{recursive:true});fs.mkdirSync(path.join(root,'games','grove'),{recursive:true});fs.copyFileSync(path.join(source,'games','community-grove','game.js'),path.join(root,'games','grove','game.js'));fs.copyFileSync(path.join(source,'games','community-grove','credits.json'),path.join(root,'games','grove','credits.json'));const registry=new CreatorAssets(path.join(root,'catalog.json'));const asset=importCuratedResource(registry,root,'kenney-background-sky');registry.review(asset.id,{owner:true,name:'test'},{approved:true,rightsAttested:true});return {root,registry,asset};};
test('published creator credits bind exact source version and real licensed image bytes',()=>{
 const {root,registry,asset}=fixture(),reviewed=reviewGame(root,'grove');assert.equal(currentGameCredits(registry,root,path.join(root,'games','grove')).status,'unreviewed');
 assert.throws(()=>publishGameCredits(registry,root,{gameId:'grove',expectedCodeSha256:'0'.repeat(64),assetIds:[asset.id]}),/code changed/);
 const published=publishGameCredits(registry,root,{gameId:'grove',expectedCodeSha256:reviewed.codeSha256,assetIds:[asset.id]});assert.equal(published.manifest.assets[0].creator.website,'https://kenney.nl/');assert.equal(currentGameCredits(registry,root,path.join(root,'games','grove')).status,'published');
 fs.appendFileSync(path.join(root,'games','grove','game.js'),'\n// Changed after publication\n');assert.equal(currentGameCredits(registry,root,path.join(root,'games','grove')).manifest,null);
});
test('changed image bytes and linked game paths cannot be published',()=>{
 const {root,registry,asset}=fixture(),reviewed=reviewGame(root,'grove');fs.appendFileSync(path.join(root,'public',asset.sourceURL),'changed');assert.throws(()=>publishGameCredits(registry,root,{gameId:'grove',expectedCodeSha256:reviewed.codeSha256,assetIds:[asset.id]}),/bytes changed/);assert.equal(registry.data.usages.length,0);
 assert.throws(()=>reviewGame(root,'../grove'),/direct/);fs.symlinkSync(path.join(root,'games','grove'),path.join(root,'games','linked'));assert.throws(()=>reviewGame(root,'linked'),/Linked/);
});
test('illustration game supports chat and web tending, grows and resets a cooperative round',()=>{
 const state=grove.createState(),user={name:'test',source:'twitch'};grove.onJoin(state,{id:1,name:'web'});
 grove.onInput(state,1,{kind:'pointer',x:140,y:560,down:true});assert.ok(state.plots[0]>0);assert.equal(grove.onChat(state,user,'water',['1']),true);assert.equal(grove.onChat(state,user,'water',['1']),false);
 const advance=seconds=>{for(let t=0;t<seconds;t+=.1)grove.tick(state,.1);};advance(.4);
 for(let plot=1;plot<=6;plot++){if(!state.plots[plot-1]){grove.onChat(state,user,'plant',[String(plot)]);advance(.4);}for(let n=0;n<6;n++){grove.onChat(state,user,'water',[String(plot)]);advance(.4);}}
 assert.ok(state.plots.every(g=>g===1));assert.ok(state.celebrate>0);const frame=grove.view(state);assert.ok(frame.layers.some(p=>p.t==='sprite'&&p.src.endsWith('tree01.png')));advance(9);assert.equal(state.round,2);assert.ok(state.plots.every(g=>g===0));assert.equal(state.__players.size,1);
});

test('public credit snapshot does no repeated verification and invalidates mismatched source',async()=>{
 const {GameCreditsSnapshot}=await import('../src/game-credits.js');let reads=0;const snapshot=new GameCreditsSnapshot({read:()=>{reads++;return {codeSha256:'one',status:'published',contributors:{gameAuthors:[{name:'External coder'}]}}}});
 snapshot.refresh('game','one');for(let n=0;n<10000;n++)assert.equal(snapshot.get().contributors.gameAuthors[0].name,'External coder');assert.equal(reads,1);snapshot.refresh('game','two');assert.equal(snapshot.get().contributors,null);assert.equal(reads,2);
});
test('external game and idea authors can publish without an external art pack',()=>{
 const {root,registry}=fixture();fs.rmSync(path.join(root,'games','grove','credits.json'));const reviewed=reviewGame(root,'grove');assert.throws(()=>publishGameCredits(registry,root,{gameId:'grove',expectedCodeSha256:reviewed.codeSha256,assetIds:[]}),/authors/);
 const contributors={gameAuthors:[{name:'External vibecoder',url:'https://example.test/coder'}],ideaAuthors:[{name:'Community proposer'}],artNote:'Code-drawn shapes'};
 const result=publishGameCredits(registry,root,{gameId:'grove',expectedCodeSha256:reviewed.codeSha256,assetIds:[],contributors});assert.equal(result.contributors.gameAuthors[0].name,'External vibecoder');assert.deepEqual(currentGameCredits(registry,root,path.join(root,'games','grove')).contributors,contributors);
});
test('game contributor links follow the public creator URL policy',async()=>{
 const {contributorCredits}=await import('../src/contributor-credits.js');for(const url of ['https://localhost/private','https://127.0.0.1/private','https://example.test/?access_token=fake'])assert.throws(()=>contributorCredits({gameAuthors:[{name:'Coder',url}],ideaAuthors:[{name:'Proposer'}]}),/public|authentication/);
});

test('Grove shows the original illustration before input and grows through visible stages',()=>{
 const state=grove.createState(),trees=()=>grove.view(state).layers.filter(p=>p.src?.endsWith('tree01.png'));
 assert.equal(trees().length,8);const initial=trees()[2].h;assert.ok(initial>=100);
 const heights=[0,.1,.4,.7,1].map(g=>{state.plots[0]=g;return trees()[2].h;});
 assert.ok(heights.every((h,i)=>i===0||h>heights[i-1]));assert.equal(heights.at(-1),330);
 assert.ok(grove.view(state).layers.some(p=>p.color==='#244f59'));
});
