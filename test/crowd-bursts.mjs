import {test} from 'node:test';import assert from 'node:assert/strict';import {CrowdBursts} from '../src/crowd-bursts.js';import * as grove from '../templates/community-grove/game.js';
const actor=user=>({source:'twitch',user});
test('same-account spam cannot trigger; three Twitch logins unlock one emote bonus',()=>{
 let now=10000;const b=new CrowdBursts({enabled:true,now:()=>now});
 for(let i=0;i<30;i++)assert.equal(b.accept(actor(i%2?'ALICE':'alice'),'☀️'),null);
 assert.equal(b.accept({source:'web',user:'bob'},'☀️'),null);assert.equal(b.accept(actor('bob'),'☀️'),null);assert.deepEqual(b.accept(actor('carol'),'☀️'),{kind:'sun',participants:3});
 assert.equal(b.accept(actor('dan'),'☀️'),null);assert.equal(b.public().sun,0);
 now+=5000;b.accept(actor('alice'),'☀️');b.accept(actor('bob'),'☀️');assert.ok(b.accept(actor('carol'),'☀️'));
});
test('expired people, mixed emotes, pause/reset and config disable cannot complete a burst',()=>{
 let now=10000;const b=new CrowdBursts({enabled:true,now:()=>now});b.accept(actor('alice'),'☀️');now+=5000;b.accept(actor('bob'),'☀️');assert.equal(b.public().sun,1);
 b.accept(actor('carol'),'🌧️');assert.equal(b.public().rain,1);b.reset();assert.equal(b.public().sun+b.public().rain,0);
 const off=new CrowdBursts({enabled:false});for(const name of ['a','b','c'])assert.equal(off.accept(actor(name),'🌧️'),null);
});
test('actual Grove bonuses have visible bounded effects and ignore malformed bonus input',()=>{
 const s=grove.createState();s.plots[0]=.1;grove.onCrowdBonus(s,{kind:'rain',participants:3});assert.equal(s.plots[0],.35);assert.equal(s.plots[1],0);assert.ok(grove.view(s).hud.some(p=>p.text.includes('RAIN BONUS')));
 grove.onCrowdBonus(s,{kind:'sun',participants:3});assert.equal(s.sun,4);grove.onCrowdBonus(s,{kind:'sun',participants:1});assert.equal(s.sun,4);
 for(let i=0;i<10;i++)grove.onCrowdBonus(s,{kind:'sun',participants:3});assert.equal(s.sun,8);for(let i=0;i<51;i++)grove.tick(s,.1);assert.equal(s.bonusRemaining,0);
});

test('ordinary chat including prototype-property names cannot crash burst admission',()=>{
 const b=new CrowdBursts({enabled:true});for(const text of ['__proto__','constructor','toString','hasOwnProperty','hello','☀️ extra'])assert.equal(b.accept(actor('viewer'),text),null);
});

test('ordinary sunshine cannot shorten a previously unlocked crowd bonus',()=>{
 const s=grove.createState();grove.onCrowdBonus(s,{kind:'sun',participants:3});grove.onCrowdBonus(s,{kind:'sun',participants:3});const before=s.sun;
 grove.onChat(s,{name:'helpful-viewer',source:'twitch'},'sun',[]);assert.ok(s.sun>=before);
});
