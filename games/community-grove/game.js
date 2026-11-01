// Original Codex-authored example. Art: Kenney Background Elements, CC0.
export const meta={name:'Community Grove',description:'Grow a shared illustrated grove. Chat: !plant 1–6, !water 1–6, !sun. Web: arrows/A-D and SPACE, or click a plot. Art by Kenney · CC0; creator links below the game.',world:{w:1280,h:720},tickRate:30};
const ROOT='/curated/kenney-background-elements/';
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
export function createState(){return {__players:new Map(),plots:Array(6).fill(0),cooldowns:new Map(),sun:0,elapsed:0,round:1,celebrate:0,last:'Plant a seed together'};}
export function onJoin(s,p){if(s.__players.size<500)s.__players.set(p.id,{name:p.name,x:640,left:false,right:false,cooldown:0});}
export function onLeave(s,p){s.__players.delete(p.id);}
function tend(s,index,plant,who){
 if(!Number.isInteger(index)||index<0||index>=6)return false;
 if(plant&&s.plots[index]===0){s.plots[index]=.1;s.last=who+' planted plot '+(index+1);return true;}
 if(!plant&&s.plots[index]>0&&s.plots[index]<1){s.plots[index]=Math.min(1,s.plots[index]+.18);s.last=who+' watered plot '+(index+1);return true;}
 return false;
}
export function onInput(s,id,input){
 const p=s.__players.get(id);if(!p||!input||s.celebrate>0)return;
 if(input.kind==='key'&&['left','a','right','d'].includes(input.key)){p[['left','a'].includes(input.key)?'left':'right']=input.down===true;return;}
 let slot;
 if(input.kind==='pointer'&&input.down===true&&Number.isFinite(input.x)&&Number.isFinite(input.y)&&input.y>260){p.x=clamp(input.x,100,1180);slot=clamp(Math.round((p.x-140)/200),0,5);}
 else if(input.kind==='key'&&input.key==='space'&&input.down===true)slot=clamp(Math.round((p.x-140)/200),0,5);
 if(slot!==undefined&&p.cooldown<=0){tend(s,slot,s.plots[slot]===0,p.name);p.cooldown=.35;}
}
export function onChat(s,user,cmd,args){
 if(!['plant','water','sun'].includes(cmd)||s.celebrate>0)return false;
 const key=String(user.source)+':'+String(user.name).toLowerCase();if((s.cooldowns.get(key)||0)>s.elapsed)return false;
 if(s.cooldowns.size>=1000){for(const [k,end] of s.cooldowns)if(end<=s.elapsed)s.cooldowns.delete(k);if(s.cooldowns.size>=1000)return false;}
 s.cooldowns.set(key,s.elapsed+.35);
 if(cmd==='sun'){s.sun=Math.min(4,s.sun+1);s.last=user.name+' brought sunshine';return true;}
 const slot=Number(args?.[0])-1;return tend(s,slot,cmd==='plant',user.name);
}
export function tick(s,dt){
 if(!Number.isFinite(dt)||dt<=0)return;dt=Math.min(dt,.1);s.elapsed+=dt;
 for(const p of s.__players.values()){p.x=clamp(p.x+(Number(p.right)-Number(p.left))*320*dt,100,1180);p.cooldown=Math.max(0,p.cooldown-dt);}
 if(s.celebrate>0){s.celebrate-=dt;if(s.celebrate<=0){s.plots.fill(0);s.round++;s.last='A new grove starts with one seed';}return;}
 if(s.sun>0){s.sun=Math.max(0,s.sun-dt);for(let i=0;i<6;i++)if(s.plots[i]>0)s.plots[i]=Math.min(1,s.plots[i]+.05*dt);}
 if(s.plots.every(g=>g>=1))s.celebrate=8;
}
export function view(s){
 const text=(x,y,value,size=24,color='#203b40')=>({t:'text',x,y,text:String(value),size,color});
 const layers=[{t:'sprite',src:ROOT+'sky.png',x:0,y:0,w:1280,h:720},{t:'sprite',src:ROOT+'hills1.png',x:0,y:290,w:1280,h:430},{t:'rect',x:0,y:560,w:1280,h:160,color:'#628c50'}];
 for(let i=0;i<6;i++){const x=140+i*200,g=s.plots[i];layers.push({t:'circle',x,y:565,r:42,color:'#314b31'});if(g>0){const h=45+g*230;layers.push({t:'sprite',src:ROOT+'tree01.png',x:x-h*.32,y:560-h,w:h*.64,h});}layers.push(text(x,610,(i+1)+' · '+Math.round(g*100)+'%',21,'#ffffff'));}
 for(const p of [...s.__players.values()].slice(0,30))layers.push({t:'circle',x:p.x,y:658,r:8,color:'#ffd48a'},text(p.x,687,p.name.slice(0,16),14,'#ffffff'));
 const grown=s.plots.filter(g=>g>=1).length,hud=[text(640,48,'COMMUNITY GROVE',40),text(640,94,'An illustration becomes a world we grow together',23),text(640,140,`!plant 1–6 · !water 1–6 · !sun  |  ${grown}/6 trees · round ${s.round}`,22),text(640,197,s.last.slice(0,100),20)];
 if(s.sun>0)layers.push({t:'circle',x:1160,y:90,r:40,color:'#ffe598'});
 if(s.celebrate>0)hud.push(text(640,260,'THE GROVE IS GROWN · next round in '+Math.ceil(s.celebrate)+'s',30));
 return {bg:'#b8e3ea',layers,hud};
}
