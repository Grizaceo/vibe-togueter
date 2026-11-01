// Durable chat-to-build decisions. No model calls, shell execution, payments or auto-approval.
import {creditManifestFingerprint} from './creator-assets.js';
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
export const ROUND_DEFAULTS=Object.freeze({maxWords:100,maxIdeas:10,winnerCount:1,voteSeconds:45,maxIdeasPerPerson:1});
export function roundSettings(settings={}){
 if(Object.keys(settings).some(key=>!Object.hasOwn(ROUND_DEFAULTS,key)))throw new Error('Unknown round setting.');
 const value={...ROUND_DEFAULTS,...settings};
 for(const [key,min,max] of [['maxWords',1,1000],['maxIdeas',1,100],['winnerCount',1,10],['voteSeconds',5,600],['maxIdeasPerPerson',1,10]])if(!Number.isInteger(value[key])||value[key]<min||value[key]>max)throw new Error(`Invalid round setting ${key}.`);
 if(value.winnerCount>value.maxIdeas)throw new Error('Winner count exceeds proposal capacity.');
 return value;
}
const identity=actor=>crypto.createHash('sha256').update(String(actor.source)+':'+String(actor.id||actor.name).toLowerCase()).digest('hex');
const hash=text=>crypto.createHash('sha256').update(text).digest('hex');
const active=round=>round&&!['cancelled','rejected','completed'].includes(round.phase);
const PHASES=new Set(['collecting','voting','awaiting-selection','awaiting-approval','approved','building','reconcile-required','completed','cancelled','rejected']);
function validateStoredRound(r){
 if(!r||typeof r.id!=='string'||!Number.isInteger(r.revision)||r.revision<0||!PHASES.has(r.phase))throw new Error('Invalid persisted round.');
 roundSettings(r.settings);
 if(!Array.isArray(r.ideas)||r.ideas.length>r.settings.maxIdeas||!Array.isArray(r.selected)||new Set(r.selected).size!==r.selected.length||r.selected.length>r.settings.winnerCount)throw new Error('Invalid persisted proposals/selection.');
 for(let n=0;n<r.ideas.length;n++){const i=r.ideas[n];if(i.id!==n+1||typeof i.text!=='string'||!i.text.trim()||i.text.length>10000||i.sha256!==hash(i.text)||i.words!==i.text.split(/\s+/u).length||i.words>r.settings.maxWords||typeof i.proposerKey!=='string'||!/^[a-f0-9]{64}$/.test(i.proposerKey))throw new Error('Invalid persisted proposal.');}
 if(r.selected.some(id=>!r.ideas.some(i=>i.id===id))||!r.ballots||typeof r.ballots!=='object'||Array.isArray(r.ballots)||Object.keys(r.ballots).length>10000||Object.entries(r.ballots).some(([k,v])=>!/^[a-f0-9]{64}$/.test(k)||!r.ideas.some(i=>i.id===v)))throw new Error('Invalid persisted ballots.');
 if(!Array.isArray(r.messageIds)||r.messageIds.length>2000||r.messageIds.some(id=>typeof id!=='string')||!Array.isArray(r.history)||r.history.length!==r.revision)throw new Error('Invalid persisted history.');
 if(r.resourceManifest)creditManifestFingerprint(r.resourceManifest);
 if(r.phase==='voting'&&!Number.isFinite(r.voteEndsAt))throw new Error('Invalid persisted vote deadline.');
 if(['approved','building','completed','reconcile-required'].includes(r.phase)&&(!r.selected.length||typeof r.approvedInputHash!=='string'||!/^[a-f0-9]{64}$/.test(r.approvedInputHash)))throw new Error('Invalid persisted approval.');
}
export class IdeaRounds{
 constructor(file,{settings={},now=Date.now}={}){
  this.file=file;this.now=now;this.settings=roundSettings(settings);
  this.data=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):{version:1,rounds:[]};
  if(this.data.version!==1||!Array.isArray(this.data.rounds))throw new Error('Invalid round store; preserve the file and recover explicitly.');
  for(const round of this.data.rounds)validateStoredRound(round);
  this.transactionDepth=0;this.dirty=false;
  for(const name of ['open','propose','startVoting','vote','tick','finishVoting','select','approve','cancel','beginBuild','finishBuild','recoverInterrupted','chooseResources']){const method=this[name].bind(this);this[name]=(...args)=>{if(name==='tick'){const r=this.current();if(r?.phase!=='voting'||this.now()<r.voteEndsAt)return;}return this.transaction(()=>method(...args));};}
 }
 transaction(operation){
  if(this.transactionDepth)return operation();const before=structuredClone(this.data);this.transactionDepth=1;this.dirty=false;
  try{const result=operation();this.transactionDepth=0;if(this.dirty)this.save();this.dirty=false;return result;}catch(error){this.transactionDepth=0;this.dirty=false;this.data=before;throw error;}
 }
 current(){return this.data.rounds.at(-1)||null;}
 save(){if(this.transactionDepth){this.dirty=true;return;}fs.mkdirSync(path.dirname(this.file),{recursive:true});const tmp=this.file+'.'+crypto.randomBytes(6).toString('hex')+'.tmp';let fd;try{fd=fs.openSync(tmp,'wx',0o600);fs.writeFileSync(fd,JSON.stringify(this.data)+'\n');fs.fsyncSync(fd);fs.closeSync(fd);fd=undefined;fs.renameSync(tmp,this.file);}finally{if(fd!==undefined)fs.closeSync(fd);if(fs.existsSync(tmp))fs.unlinkSync(tmp);}}
 event(round,type,actor,detail={}){round.revision++;round.history.push({at:this.now(),type,actor:actor?{name:actor.name,source:actor.source}:null,...detail});}
 owner(actor){if(actor?.owner!==true)throw new Error('Only the streamer can make this decision.');}
 open(actor,settings={}){
  this.owner(actor);if(active(this.current()))throw new Error('Finish or cancel the active round before opening another.');
  const round={id:crypto.randomUUID(),revision:0,phase:'collecting',settings:roundSettings({...this.settings,...settings}),openedAt:this.now(),ideas:[],ballots:{},messageIds:[],selected:[],history:[]};
  this.event(round,'opened',actor);this.data.rounds.push(round);this.save();return this.public();
 }
 propose(actor,text,messageId){
  if(!this.current())this.open({name:'initial-round',source:'system',owner:true});
  const r=this.current();if(messageId&&r.messageIds.includes(messageId))return {duplicate:true,round:this.public()};
  if(r.phase!=='collecting')throw new Error('Proposal intake is closed for this round.');
  if(typeof text!=='string'||!text.trim()||text.length>10000)throw new Error('Supply a bounded nonempty game idea.');
  text=text.trim();const words=text.split(/\s+/u).length;
  if(words>r.settings.maxWords)throw new Error(`Idea exceeds ${r.settings.maxWords} words.`);
  if(/(?:sk-[A-Za-z0-9_-]{24,}|ghp_[A-Za-z0-9]{24,}|AKIA[A-Z0-9]{16})/.test(text))throw new Error('Possible credential in idea; remove it before submitting.');
  const normalized=text.normalize('NFKC').toLowerCase().replace(/\s+/gu,' '),key=identity(actor);
  if(r.ideas.some(i=>i.normalized===normalized))throw new Error('That idea is already in the round.');
  if(r.ideas.length>=r.settings.maxIdeas)throw new Error('Proposal capacity reached.');
  if(r.ideas.filter(i=>i.proposerKey===key).length>=r.settings.maxIdeasPerPerson)throw new Error('Your proposal allowance for this round is used.');
  const idea={id:r.ideas.length+1,text,words,normalized,proposerKey:key,author:String(actor.name).slice(0,50),source:actor.source,at:this.now(),sha256:hash(text)};
  r.ideas.push(idea);if(messageId)r.messageIds.push(messageId);
  this.event(r,'idea-proposed',actor,{ideaId:idea.id});
  if(r.ideas.length===r.settings.maxIdeas)this.startVoting(actor,true);
  else this.save();return {ideaId:idea.id,round:this.public()};
 }
 startVoting(actor,capacityReached=false){
  if(!capacityReached)this.owner(actor);const r=this.current();
  if(capacityReached && r?.ideas.length!==r?.settings.maxIdeas)throw new Error('Automatic voting requires a full proposal round.');
  if(!r||r.phase!=='collecting'||!r.ideas.length)throw new Error('Collect at least one idea before voting.');
  r.phase='voting';r.voteEndsAt=this.now()+r.settings.voteSeconds*1000;this.event(r,'voting-started',actor,{automatic:capacityReached});this.save();return this.public();
 }
 vote(actor,ideaId,messageId){
  this.tick();const r=this.current();if(!r||r.phase!=='voting')throw new Error('No voting window is open.');
  if(messageId&&r.messageIds.includes(messageId))return {duplicate:true,round:this.public()};
  if(!Number.isInteger(ideaId)||!r.ideas.some(i=>i.id===ideaId))throw new Error('Vote for an idea ID in this round.');
  const key=identity(actor);if(!Object.hasOwn(r.ballots,key)&&Object.keys(r.ballots).length>=10000)throw new Error('Ballot capacity reached.');
  if(r.ballots[key]===ideaId){if(messageId){r.messageIds.push(messageId);if(r.messageIds.length>2000)r.messageIds.shift();this.save();}return this.public();}
  r.ballots[key]=ideaId;if(messageId){r.messageIds.push(messageId);if(r.messageIds.length>2000)r.messageIds.shift();}
  this.save();return this.public();
 }
 tick(){const r=this.current();if(r?.phase==='voting'&&this.now()>=r.voteEndsAt)this.finishVoting({name:'deadline',source:'system',owner:true});}
 ranked(){const r=this.current();if(!r)return [];return r.ideas.map(i=>({id:i.id,votes:Object.values(r.ballots).filter(id=>id===i.id).length})).sort((a,b)=>b.votes-a.votes||a.id-b.id);}
 finishVoting(actor){
  this.owner(actor);const r=this.current();if(!r||r.phase!=='voting')throw new Error('No vote to close.');
  const ranked=this.ranked(),count=Math.min(r.settings.winnerCount,ranked.length),boundary=ranked[count-1];
  const tie=ranked[count]?.votes===boundary?.votes;
  r.selected=[];r.phase='awaiting-selection';
  if(boundary?.votes>0&&!tie){r.selected=ranked.slice(0,count).map(i=>i.id);r.phase='awaiting-approval';}
  this.event(r,'voting-closed',actor,{ranked,tie,needsStreamerSelection:r.phase==='awaiting-selection'});this.save();return this.public();
 }
 select(actor,ids,reason='Streamer choice'){
  this.owner(actor);this.tick();const r=this.current();if(!r||!['awaiting-selection','awaiting-approval'].includes(r.phase))throw new Error('Close voting before selecting.');
  if(!Array.isArray(ids)||!ids.length||ids.length>r.settings.winnerCount||new Set(ids).size!==ids.length||ids.some(id=>!r.ideas.some(i=>i.id===id)))throw new Error('Select valid unique idea IDs within the winner limit.');
  r.selected=[...ids];r.phase='awaiting-approval';this.event(r,'streamer-selected',actor,{ids,reason:String(reason).slice(0,300)});this.save();return this.public();
 }
 chooseResources(actor,manifest){this.owner(actor);const r=this.current();if(!r||!['collecting','voting','awaiting-selection','awaiting-approval','approved'].includes(r.phase))throw new Error('Select resources before construction.');creditManifestFingerprint(manifest);r.resourceManifest=structuredClone(manifest);if(r.phase==='approved'){r.phase='awaiting-approval';r.approvedInputHash=null;}this.event(r,'resources-selected',actor,{manifestHash:manifest.sha256});this.save();return this.public();}
 inputHash(){const r=this.current();if(!r||!r.selected.length)return null;const input=r.selected.map(id=>r.ideas.find(i=>i.id===id)).map(i=>({id:i.id,sha256:hash(i.text)}));return hash(JSON.stringify({roundId:r.id,settings:r.settings,input,resources:r.resourceManifest?creditManifestFingerprint(r.resourceManifest):null}));}
 reviewToken(){const r=this.current();return r?.phase==='awaiting-approval'?hash(JSON.stringify({roundId:r.id,revision:r.revision,inputHash:this.inputHash()})):null;}
 approve(actor,expected){
  this.owner(actor);this.tick();const r=this.current();if(!r||r.phase!=='awaiting-approval'||!r.selected.length)throw new Error('Select an idea before approving.');
  if(expected?.roundId!==r.id||expected?.reviewToken!==this.reviewToken())throw new Error('Review changed or missing; refresh the round before approving.');
  r.approvedInputHash=this.inputHash();r.phase='approved';
  this.event(r,'streamer-approved',actor,{inputHash:r.approvedInputHash});this.save();return this.public();
 }
 buildPermission(idea,grant){const r=this.current();const text=r?.selected.map(id=>r.ideas.find(i=>i.id===id).text).join('\n\n');return !!(r?.phase==='approved'&&grant?.roundId===r.id&&grant?.approvedInputHash===r.approvedInputHash&&this.inputHash()===r.approvedInputHash&&idea===text);}
 beginBuild(idea,grant){if(!this.buildPermission(idea,grant))throw new Error('An approved matching round is required.');const r=this.current();r.phase='building';this.event(r,'build-started',null,{inputHash:r.approvedInputHash});this.save();}
 finishBuild(grant,ok){const r=this.data.rounds.find(item=>item.id===grant?.roundId);if(r!==this.current()||r?.approvedInputHash!==grant?.approvedInputHash||r?.phase!=='building')throw new Error('No build in progress.');r.phase=ok?'completed':'awaiting-approval';if(!ok)r.approvedInputHash=null;this.event(r,ok?'build-completed':'build-failed',null);this.save();return this.public();}
 recoverInterrupted(){for(const r of this.data.rounds)if(r.phase==='building'){r.phase='reconcile-required';this.event(r,'build-state-unknown-after-restart',null);this.save();}}
 cancel(actor){this.owner(actor);const r=this.current();if(r?.phase==='building')throw new Error('Build is in progress; stop or reconcile it before cancelling.');if(!active(r))throw new Error('No active round to cancel.');r.phase='cancelled';this.event(r,'cancelled',actor);this.save();return this.public();}
 public(){const r=this.current();if(!r)return null;const counts=new Map(this.ranked().map(i=>[i.id,i.votes]));return structuredClone({id:r.id,revision:r.revision,phase:r.phase,settings:r.settings,openedAt:r.openedAt,voteEndsAt:r.voteEndsAt,selected:r.selected,approvedInputHash:r.approvedInputHash,reviewToken:this.reviewToken(),resourceManifest:r.resourceManifest,ideas:r.ideas.map(({id,text,words,author,source,at,sha256})=>({id,text,words,author,source,at,sha256,votes:counts.get(id)||0})),voters:Object.keys(r.ballots).length});}
}
