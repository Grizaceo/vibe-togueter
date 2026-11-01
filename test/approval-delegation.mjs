import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {ApprovalDelegation,roundApprovalActor} from '../src/approval-delegation.js';import {IdeaRounds} from '../src/idea-rounds.js';
const owner={owner:true,name:'owner',source:'twitch'},mod={owner:false,name:'trusted_mod',source:'twitch'};
test('delegate needs matching Twitch login, current mod tag, unexpired grant and enabled config',()=>{
 let now=1000;const d=new ApprovalDelegation({enabled:true,now:()=>now});assert.throws(()=>d.set(mod,'trusted_mod',60),/streamer/);d.set(owner,'TRUSTED_MOD',60);
 assert.equal(d.canApprove(mod,true),true);for(const [actor,flag] of [[mod,false],[{...mod,source:'web'},true],[{...mod,name:'other'},true]])assert.equal(d.canApprove(actor,flag),false);
 now+=60000;assert.equal(d.canApprove(mod,true),false);d.set(owner,'trusted_mod',60);d.revoke(owner);assert.equal(d.canApprove(mod,true),false);
 assert.throws(()=>d.set(owner,'mod',1801));assert.throws(()=>new ApprovalDelegation({enabled:false}).set(owner,'mod',60),/disabled/);
});
test('delegated authority approves only a reviewed exact round; stale review and ordinary owner actions stay denied',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'va-delegate-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const rounds=new IdeaRounds(path.join(dir,'rounds.json')),d=new ApprovalDelegation({enabled:true});
 rounds.open(owner);rounds.propose(mod,'A cooperative lantern garden');rounds.startVoting(owner);rounds.finishVoting(owner);rounds.select(owner,[1]);d.set(owner,'trusted_mod',60);const approvedActor=roundApprovalActor(mod,true,d);
 assert.throws(()=>rounds.open(mod),/streamer/);assert.throws(()=>rounds.approve(approvedActor,{roundId:rounds.current().id,reviewToken:'stale'}),/Review/);
 rounds.approve(approvedActor,{roundId:rounds.current().id,reviewToken:rounds.reviewToken()});assert.equal(rounds.current().phase,'approved');assert.equal(rounds.current().history.at(-1).approvalAuthority,'delegated-moderator');assert.equal(rounds.current().history.at(-1).actor.name,'trusted_mod');
});
