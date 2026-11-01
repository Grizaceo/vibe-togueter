// Codex-authored SDK game: one ballot per viewer, one action per 3-second window.
export const meta={name:'Chat vs Streamer · Democracy Duel',description:'Chat: !left !right !fire · Streamer: arrows/A-D and space · 3-second ballots, one person/one vote.',world:{w:1280,h:720},tickRate:30};
const WINDOW=3,LEFT=120,RIGHT=1160,SPEED=440;
const aliases={left:'left',izq:'left',right:'right',der:'right',fire:'fire',disparar:'fire'};
export function createState(){return {__players:new Map(),streamerId:null,x:640,chatX:640,keys:{},votes:new Map(),remaining:WINDOW,window:0,lastAction:'Waiting for votes',chatMotion:0,chatMotionT:0,bullets:[],cooldown:0,health:{chat:3,streamer:3},invulnerable:{chat:0,streamer:0},winner:null,restart:0,elapsed:0};}
export function onJoin(s,p){s.__players.set(p.id,{name:p.name,role:p.role||'viewer'});if(p.role==='streamer' && s.streamerId===null)s.streamerId=p.id;}
export function onLeave(s,p){s.__players.delete(p.id);if(s.streamerId===p.id){s.streamerId=null;s.keys={};}}
export function onInput(s,id,input){
 if(id!==s.streamerId || !input || s.winner)return;
 if(input.kind==='key' && ['left','right','a','d','space'].includes(input.key))s.keys[input.key]=input.down===true;
 if(input.kind==='pointer' && input.down && Number.isFinite(input.x)){s.x=Math.max(LEFT,Math.min(RIGHT,input.x));shoot(s,'streamer');}
}
export function onChat(s,user,cmd){
 const action=Object.hasOwn(aliases,cmd.toLowerCase())?aliases[cmd.toLowerCase()]:null;
 if(!action || s.winner)return false;
 const key=String(user.source||'chat')+':'+String(user.name).toLowerCase();
 if(!s.votes.has(key) && s.votes.size>=1000)return false;
 s.votes.set(key,action);return true;
}
function counts(s){const result={left:0,right:0,fire:0};for(const vote of s.votes.values())result[vote]++;return result;}
function shoot(s,side){
 if(s.bullets.length>=60)return;
 if(side==='streamer'){if(s.cooldown>0)return;s.cooldown=.8;s.bullets.push({x:s.x,y:554,side});}
 else for(const dx of [-26,0,26])s.bullets.push({x:s.chatX+dx,y:204,side});
}
function decide(s){
 const tally=counts(s),max=Math.max(...Object.values(tally));
 if(!max){s.lastAction='NO VOTES · hold position';return;}
 const order=['left','right','fire'];const options=order.slice(s.window%3).concat(order.slice(0,s.window%3));
 const action=options.find(key=>tally[key]===max);
 s.lastAction=action.toUpperCase()+' · '+max+'/'+s.votes.size+' votes';
 if(action==='fire')shoot(s,'chat');else{s.chatMotion=action==='left'?-1:1;s.chatMotionT=1.4;}
}
export function tick(s,dt){
 if(!Number.isFinite(dt) || dt<=0)return;dt=Math.min(dt,.25);s.elapsed+=dt;
 if(s.winner){s.restart-=dt;if(s.restart<=0){const fresh=createState();fresh.__players=s.__players;fresh.streamerId=s.streamerId;Object.assign(s,fresh);}return;}
 s.cooldown=Math.max(0,s.cooldown-dt);for(const side of ['chat','streamer'])s.invulnerable[side]=Math.max(0,s.invulnerable[side]-dt);
 if(s.streamerId!==null){const direction=Number(!!(s.keys.right||s.keys.d))-Number(!!(s.keys.left||s.keys.a));s.x=Math.max(LEFT,Math.min(RIGHT,s.x+direction*SPEED*dt));if(s.keys.space)shoot(s,'streamer');}
 if(s.chatMotionT>0){s.chatX=Math.max(LEFT,Math.min(RIGHT,s.chatX+s.chatMotion*300*dt));s.chatMotionT-=dt;}
 s.remaining-=dt;
 if(s.remaining<=0){decide(s);s.votes.clear();s.window++;s.remaining+=WINDOW;}
 const keep=[];
 for(const b of s.bullets){b.y+=(b.side==='chat'?1:-1)*360*dt;const enemy=b.side==='chat'?'streamer':'chat',y=enemy==='chat'?190:570,x=enemy==='chat'?s.chatX:s.x;
  if(Math.abs(b.y-y)<22 && Math.abs(b.x-x)<62){if(s.invulnerable[enemy]===0){s.health[enemy]=Math.max(0,s.health[enemy]-1);s.invulnerable[enemy]=.5;}if(s.health[enemy]===0 && !s.winner){s.winner=b.side;s.restart=8;}}else if(b.y>150 && b.y<610)keep.push(b);
 }
 s.bullets=keep;
}
export function view(s){
 const tally=counts(s),layers=[];const text=(x,y,value,size=24,color='#e8efff',align='center')=>({t:'text',x,y,text:String(value),size,color,align});
 layers.push({t:'rect',x:80,y:152,w:1120,h:470,color:'#101c35'});
 for(let x=120;x<=1160;x+=80)layers.push({t:'line',x1:x,y1:160,x2:x,y2:610,color:'#192b48',w:1});
 layers.push({t:'line',x1:100,y1:380,x2:1180,y2:380,color:'#30466b',w:2});
 layers.push({t:'rect',x:s.chatX-58,y:178,w:116,h:24,color:'#43efd0'},{t:'rect',x:s.chatX-12,y:199,w:24,h:18,color:'#43efd0'});
 layers.push({t:'rect',x:s.x-58,y:558,w:116,h:24,color:'#b596ff'},{t:'rect',x:s.x-12,y:539,w:24,h:18,color:'#b596ff'});
 for(const b of s.bullets)layers.push({t:'circle',x:b.x,y:b.y,r:6,color:b.side==='chat'?'#43efd0':'#c7adff'});
 const hud=[text(640,48,'CHAT vs STREAMER',42),text(640,88,'DEMOCRACY DUEL · one viewer, one ballot',20,'#91a7ca'),text(180,136,'CHAT  '+ '♥'.repeat(s.health.chat),22,'#43efd0','left'),text(1100,136,'STREAMER  '+'♥'.repeat(s.health.streamer),22,'#b596ff','right'),text(640,292,Math.max(0,s.remaining).toFixed(1)+'s TO DECISION',32,'#ffffff'),text(640,338,`!left ${tally.left}     !fire ${tally.fire}     !right ${tally.right}`,27,'#43efd0'),text(640,423,s.lastAction,22,'#92aace'),text(640,655,s.streamerId===null?'Streamer: unlock controls above to enter':'Streamer: A / D or arrows · SPACE fires',24,'#b596ff'),text(640,695,'Chat votes in Twitch or the web lobby · your latest vote replaces your previous vote',18,'#91a7ca')];
 if(s.winner)hud.push({t:'rect',x:250,y:260,w:780,h:200,color:'#172540'},text(640,335,s.winner.toUpperCase()+' WINS',48),text(640,395,'Next round in '+Math.ceil(s.restart)+'s',28));
 return {bg:'#080e1c',layers,hud};
}
