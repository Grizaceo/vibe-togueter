import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import crypto from 'node:crypto';import {IdeaRounds} from '../src/idea-rounds.js';import {BuildQuarantine} from '../src/build-quarantine.js';import {communityCredit} from '../src/community-credit.js';
const owner={owner:true,name:'streamer_login',source:'twitch'},actor=name=>({name,source:'twitch'});
function fixture(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'va-community-credit-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const rounds=new IdeaRounds(path.join(dir,'rounds.json'));rounds.open(owner);rounds.propose(actor('alice'),'A cooperative lantern garden');rounds.propose(actor('bob'),'A marble puzzle');rounds.startVoting(owner);rounds.vote(actor('alice'),1);rounds.vote(actor('bob'),1);rounds.vote(actor('carol'),2);rounds.finishVoting(owner);rounds.select(owner,[1]);rounds.approve(owner,{roundId:rounds.current().id,reviewToken:rounds.reviewToken()});return {dir,rounds};}
test('approved participation counts supporters of selected ideas and records actual approver',t=>{
 const {rounds}=fixture(t),credit=rounds.public().credit;assert.equal(credit.voterCount,2);assert.deepEqual(credit.ideaAuthors,[{name:'alice'}]);assert.equal(credit.approvedBy.name,'streamer_login');assert.equal(credit.approvedInputHash,rounds.public().approvedInputHash);
 rounds.cancel(owner);assert.equal(rounds.public().credit,null);rounds.open(owner);assert.equal(rounds.public().credit,null);assert.equal(credit.voterCount,2);
});
test('quarantine pins community snapshot to exact artifact and detects altered participation metadata',t=>{
 const {dir,rounds}=fixture(t),file=path.join(dir,'quarantine.json'),q=new BuildQuarantine(file),ticket=q.issue(owner,rounds.public(),{buildVmId:'build-vm',runtimeVmId:'runtime-vm',agentProfile:'codex-test'});
 const source='// Inert synthetic artifact; not executed',codeSha256=crypto.createHash('sha256').update(source).digest('hex');q.receive(owner,ticket.id,{source,expectedCodeSha256:codeSha256});assert.equal(q.inspect(ticket.id).communityCredit.voterCount,2);
 const saved=JSON.parse(fs.readFileSync(file));saved.jobs[0].communityCredit.voterCount=999;fs.writeFileSync(file,JSON.stringify(saved));assert.throws(()=>new BuildQuarantine(file),/integrity/);
});
test('community credit rejects unbounded or unbound claims',t=>{
 const {rounds}=fixture(t),credit=rounds.public().credit;
 for(const change of [{voterCount:-1},{voterCount:10001},{approvedInputHash:'changed'},{approvedBy:{...credit.approvedBy,authority:'viewer'}}])assert.throws(()=>communityCredit({...credit,...change}));
});

test('legacy blank display names do not block approval or rewrite original round provenance',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'va-credit-legacy-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const file=path.join(dir,'round.json'),r=new IdeaRounds(file);r.open(owner);r.propose({name:'   ',id:'legacy-session',source:'web'},'A blank-alias idea');r.current().ideas[0].author='   ';r.save();
 const restored=new IdeaRounds(file);restored.startVoting(owner);restored.finishVoting(owner);restored.select(owner,[1]);const inputHash=restored.inputHash();restored.approve({...owner,name:'   '},{roundId:restored.current().id,reviewToken:restored.reviewToken()});
 assert.equal(restored.public().credit.ideaAuthors[0].name,'Unrecorded proposer');assert.equal(restored.public().credit.approvedBy.name,'Unrecorded approver');assert.equal(restored.inputHash(),inputHash);assert.equal(restored.current().ideas[0].author,'   ');
});
