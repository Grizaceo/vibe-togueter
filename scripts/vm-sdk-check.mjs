// Guest-only trusted protocol checks. Never run candidate code on the controller.
import fs from 'node:fs';import crypto from 'node:crypto';import {GameHost} from './gamehost.mjs';
if(process.cwd()!=='/workspace'||process.env.VA_ISOLATED_GUEST!=='1')throw Error('This harness is for the separately provisioned test VM only.');
const task=JSON.parse(fs.readFileSync('/workspace/task.json','utf8')),checks=[],sha=v=>crypto.createHash('sha256').update(v).digest('hex');
const check=(name,ok)=>checks.push({name,passed:!!ok});
const source=fs.readFileSync('/workspace/candidate/game.js','utf8');
check('Exact quarantined source bytes',Buffer.byteLength(source)<=131072&&sha(source)===task.codeSha256);
check('Distinct build and test VM identities',task.testVmId!==task.buildVmId&&task.testVmId!==task.runtimeVmId);
const assets=task.resources?.assets||[];
check('Pinned reviewed resource bytes',assets.every(a=>/^\/curated\/[a-z0-9-]+\/[a-zA-Z0-9_-]+\.png$/.test(a.sourceURL)&&sha(fs.readFileSync('/workspace/assets/'+a.id+'.png'))===a.expectedContentSha256));
const host=new GameHost({gameDir:'/workspace/candidate'}),loaded=await host.loadSource(source);check('SDK interface loads under finite callback deadlines',loaded&&!host.error);
if(loaded){
 host.safeCall('onJoin',{id:1,name:'Quarantine tester',role:'viewer'});host.safeCall('onInput',1,{kind:'key',key:'space',down:true});host.safeCall('onInput',1,{kind:'key',key:'space',down:false});host.safeCall('onChat',{name:'Quarantine viewer',source:'twitch'},'help',[]);
 for(let i=0;i<90&&!host.error;i++)host.safeCall('tick',1/30);
}
check('Bounded join/input/chat/tick protocol',loaded&&!host.error);
if(loaded)host.safeCall('onLeave',{id:1,name:'Quarantine tester'});
check('Bounded player leave callback',loaded&&!host.error);
const frame=host.getView();check('Bounded serializable view',!host.error&&JSON.stringify(frame).length<=524288&&Array.isArray(frame.layers)&&Array.isArray(frame.hud));
const primitives=[...(frame.layers||[]),...(frame.hud||[])],allowed=new Set(assets.map(a=>a.sourceURL));
check('Sprites use approved local resource paths',primitives.filter(p=>p?.t==='sprite').every(p=>allowed.has(p.src)));
check('Selected art appears in the test frame',!assets.length||primitives.some(p=>p?.t==='sprite'&&allowed.has(p.src)));
const result={codeSha256:task.codeSha256,artifactHash:task.artifactHash,testNonce:task.testNonce,testVmId:task.testVmId,buildVmId:task.buildVmId,checks,passed:checks.every(c=>c.passed),frame,execution:'separate-quarantine-vm',limitations:['Trusted SDK protocol checks only; not an independent human playtest or proof of gameplay quality.','The VM, not node:vm, is the controller isolation boundary.']};
fs.writeFileSync('/workspace/result.json',JSON.stringify(result)+'\n');host.stop();
