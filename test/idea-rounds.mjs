import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {IdeaRounds,roundSettings} from '../src/idea-rounds.js';
const approveCurrent=r=>{const snap=r.public();return r.approve(owner,{roundId:snap.id,reviewToken:snap.reviewToken});};
const owner={name:'owner',source:'twitch',owner:true},a={name:'alice',source:'twitch'},b={name:'bob',source:'twitch'};
function fixture(settings={}){let clock=1000;const file=path.join(fs.mkdtempSync(path.join(os.tmpdir(),'va-round-')),'rounds.json');const rounds=new IdeaRounds(file,{settings,now:()=>clock});return {rounds,file,advance:n=>clock+=n};}
test('word cap, duplicate prompts, identity allowance and first-arrival capacity',()=>{
 const {rounds:r}=fixture({maxIdeas:2,maxWords:3});
 assert.throws(()=>r.propose(a,'one two three four'),/words/);r.propose(a,'one two three','m1');
 assert.equal(r.propose(a,'one two three','m1').duplicate,true);
 assert.throws(()=>r.propose(b,' ONE  TWO THREE '),/already/);assert.throws(()=>r.propose(a,'another'),/allowance/);
 r.propose(b,'different');assert.equal(r.public().phase,'voting');assert.equal(r.public().ideas.length,2);
 assert.throws(()=>r.propose({name:'third',source:'twitch'},'late'),/closed/);
});
test('latest ballot replaces rather than multiplies, deadline survives restart, owner approves selected content hash',()=>{
 const {rounds:r,file,advance}=fixture({maxIdeas:2,voteSeconds:5});r.propose(a,'A game');r.propose(b,'B game');r.vote(a,1);r.vote(a,2);r.vote(b,2);
 assert.equal(r.public().voters,2);assert.equal(r.public().ideas[1].votes,2);advance(5000);r.tick();assert.deepEqual(r.public().selected,[2]);assert.equal(r.public().phase,'awaiting-approval');
 assert.throws(()=>r.approve(a),/streamer/);approveCurrent(r);assert.match(r.public().approvedInputHash,/^[a-f0-9]{64}$/);
 const restored=new IdeaRounds(file);assert.equal(restored.public().phase,'approved');assert.equal(restored.public().approvedInputHash,r.public().approvedInputHash);
 assert.ok(!JSON.stringify(r.public()).includes('ballots'));assert.ok(!JSON.stringify(r.public()).includes('proposerKey'));
});
test('tie and empty vote require explicit streamer selection; no automatic default winner',()=>{
 for(const voted of [false,true]){const {rounds:r}=fixture({maxIdeas:2});r.propose(a,'A');r.propose(b,'B');if(voted){r.vote(a,1);r.vote(b,2);}r.finishVoting(owner);assert.equal(r.public().phase,'awaiting-selection');assert.deepEqual(r.public().selected,[]);assert.throws(()=>r.approve(owner),/Select/);r.select(owner,[2],'Owner override');approveCurrent(r);assert.deepEqual(r.public().selected,[2]);}
});
test('settings are frozen per round, public snapshots cannot mutate the store, multiple winners explicit',()=>{
 const {rounds:r}=fixture({maxIdeas:3,winnerCount:2});r.propose(a,'A');r.propose(b,'B');r.propose({name:'c',source:'twitch'},'C');r.vote(a,1);r.vote(b,2);r.finishVoting(owner);assert.deepEqual(r.public().selected,[1,2]);
 const snap=r.public();snap.settings.maxIdeas=99;snap.selected.push(3);assert.equal(r.public().settings.maxIdeas,3);assert.deepEqual(r.public().selected,[1,2]);
 assert.throws(()=>roundSettings({winnerCount:11}),/Invalid/);assert.throws(()=>roundSettings({secret:'do not expose'}),/Unknown/);
});
test('credentials rejected, no automatic vote privilege, cancelled round retained, malformed store fails closed',()=>{
 const {rounds:r,file}=fixture();assert.throws(()=>r.propose(a,'sk-'+'a'.repeat(30)),/credential/);assert.equal(r.current(),null);r.open(owner);assert.throws(()=>r.startVoting(a,true),/full/);
 r.propose(a,'A');r.cancel(owner);r.open(owner);assert.equal(r.data.rounds.length,2);assert.equal(r.data.rounds[0].phase,'cancelled');
 fs.writeFileSync(file,'{}');assert.throws(()=>new IdeaRounds(file),/Invalid/);
});


test('stale approval cannot approve changed selection or another round',()=>{
 const {rounds:r}=fixture({maxIdeas:2});r.propose(a,'A');r.propose(b,'B');r.finishVoting(owner);r.select(owner,[1]);const reviewed=r.public();r.select(owner,[2]);
 assert.throws(()=>r.approve(owner,{roundId:reviewed.id,reviewToken:reviewed.reviewToken}),/Review changed/);assert.equal(r.public().phase,'awaiting-approval');
 const fresh=r.public();r.cancel(owner);r.open(owner);r.propose(a,'C');r.startVoting(owner);r.finishVoting(owner);r.select(owner,[1]);
 assert.throws(()=>r.approve(owner,{roundId:fresh.id,reviewToken:fresh.reviewToken}),/Review changed/);
});
test('persistence failure rolls back mutations in memory and cannot leak into later save',()=>{
 const {rounds:r,file}=fixture();r.open(owner);const before=r.public();const original=r.save.bind(r);
 r.save=function(){if(this.transactionDepth){this.dirty=true;return;}throw Object.assign(new Error('disk full'),{code:'ENOSPC'});};
 assert.throws(()=>r.propose(a,'Unsaved idea'),/disk full/);assert.deepEqual(r.public(),before);assert.deepEqual(new IdeaRounds(file).public(),before);
 r.save=original;r.propose(b,'Saved idea');assert.equal(r.public().ideas.length,1);assert.equal(r.public().ideas[0].text,'Saved idea');
});
test('build must match approved input and can be dispatched once; failures need fresh approval',()=>{
 const {rounds:r}=fixture({maxIdeas:1});r.propose(a,'Chosen game');r.finishVoting(owner);r.select(owner,[1]);approveCurrent(r);const state=r.public(),grant={roundId:state.id,approvedInputHash:state.approvedInputHash};
 const original=r.current().ideas[0].text;r.current().ideas[0].text='tampered';assert.equal(r.buildPermission('tampered',grant),false);r.current().ideas[0].text=original;assert.equal(r.buildPermission('Another game',grant),false);assert.equal(r.buildPermission('Chosen game',grant),true);r.beginBuild('Chosen game',grant);assert.equal(r.buildPermission('Chosen game',grant),false);r.finishBuild(grant,false);assert.equal(r.public().phase,'awaiting-approval');assert.equal(r.public().approvedInputHash,null);
});


test('redundant vote receipts remain deduplicated after restart',()=>{
 const {rounds:r,file}=fixture({maxIdeas:2});r.propose(a,'A');r.propose(b,'B');r.vote(a,1,'m1');r.vote(a,1,'m2');r.vote(a,2,'m3');const restored=new IdeaRounds(file,{now:()=>1000});assert.equal(restored.vote(a,1,'m2').duplicate,true);assert.equal(restored.public().ideas[1].votes,1);
});
test('active construction cannot be cancelled into another round and restart needs reconciliation',()=>{
 const {rounds:r,file}=fixture({maxIdeas:1});r.propose(a,'A');r.finishVoting(owner);r.select(owner,[1]);approveCurrent(r);const s=r.public(),grant={roundId:s.id,approvedInputHash:s.approvedInputHash};r.beginBuild('A',grant);assert.throws(()=>r.cancel(owner),/in progress/);assert.throws(()=>r.open(owner),/Finish/);
 const restarted=new IdeaRounds(file);restarted.recoverInterrupted();assert.equal(restarted.public().phase,'reconcile-required');assert.equal(restarted.buildPermission('A',grant),false);
});
test('structurally corrupt stored rounds fail at load, not during a later public request',()=>{
 const {file}=fixture();fs.writeFileSync(file,JSON.stringify({version:1,rounds:[{}]}));assert.throws(()=>new IdeaRounds(file),/Invalid/);
});
test('participation returns only the viewer own ideas and ballot under both chat and seated-web keys',()=>{
 const {rounds:r}=fixture({maxIdeas:3}),sub='twitch:123';
 const chat={name:'fan',source:'twitch',id:'123'},web={name:'fan-web',source:'web',id:'twitch:123'},other={name:'mallory',source:'twitch',id:'999'};
 r.open(owner);r.propose(chat,'chat idea');r.propose(web,'web seated idea');r.propose(other,'mallory idea');
 r.vote(chat,2);r.vote(other,3);
 const p=r.participation(sub);assert.equal(p.sub,sub);assert.equal(p.rounds.length,1);
 const rd=p.rounds[0];assert.equal(rd.phase,'voting');assert.equal(rd.ideas.length,2);
 assert.deepEqual(rd.ideas.map(i=>i.id),[1,2]);assert.equal(rd.ideas[1].votes,1);assert.equal(rd.ideas[1].selected,false);
 assert.deepEqual(rd.ballot,{ideaId:2,selected:false});assert.equal(rd.credited,false);assert.ok(!('ballots' in rd));
 const json=JSON.stringify(p);assert.ok(!json.includes('mallory'));assert.ok(!json.includes('proposerKey'));assert.ok(!json.includes('reviewToken'));assert.ok(!json.includes('"ballots":{'));
 assert.deepEqual(p.totals,{ideas:2,ballots:1,credits:0});
 r.finishVoting(owner);assert.equal(r.public().phase,'awaiting-selection');r.select(owner,[2]);approveCurrent(r);
 const p2=r.participation(sub);assert.equal(p2.rounds[0].credited,true);assert.equal(p2.totals.credits,1);
 for(const bad of ['web:abc','twitch:','x',null])assert.throws(()=>r.participation(bad),/Invalid viewer identity/);
});
test('creditHistory keeps an approved round credit after a newer round opens and lists it without credit',()=>{
 const {rounds:r}=fixture({maxIdeas:1});r.propose(a,'Chosen');r.finishVoting(owner);r.select(owner,[1]);approveCurrent(r);
 const s=r.public(),grant={roundId:s.id,approvedInputHash:s.approvedInputHash};r.beginBuild('Chosen',grant);r.finishBuild(grant,true);r.open(owner);r.propose(b,'Next');
 const h=r.creditHistory();assert.equal(h.length,2);assert.equal(h[0].roundId,r.current().id);assert.equal(h[0].credit,null);assert.equal(h[0].approvedAt,null);
 assert.equal(h[1].roundId,s.id);assert.equal(h[1].phase,'completed');assert.equal(h[1].approvedAt,1000);assert.equal(h[1].ideaCount,1);assert.equal(h[1].selectedCount,1);assert.ok(h[1].credit);
});
