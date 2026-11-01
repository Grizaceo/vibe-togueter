// Disposable local controller; this is not a live Twitch/moderator rehearsal.
import WebSocket from 'ws';
const base=process.env.VA_ARENA_URL,key=process.env.VA_STREAMER_KEY;
const post=(route,body,auth=true)=>fetch(base+route,{method:'POST',headers:{'Content-Type':'application/json',...(auth?{'x-streamer-key':key}:{})},body:JSON.stringify(body)});
const check=(name,value)=>{console.log(`${value?'PASS':'FAIL'} ${name}`);if(!value)process.exitCode=1;};
const wait=async fn=>{for(let i=0;i<100;i++){if(await fn())return;await new Promise(r=>setTimeout(r,30));}throw Error('Frame deadline');};
await post('/admin/load',{game:'community-grove'});
const ws=new WebSocket(base.replace(/^http/,'ws')+'/spectate?name=owner');let frame;
ws.on('message',b=>{const m=JSON.parse(b);if(m.t==='state')frame=m;});await new Promise(r=>ws.once('open',r));
try{
 await wait(()=>frame?.game?.name==='Community Grove');
 check('pause owner endpoint rejects a missing confirmation',(await post('/admin/chat-effects',{paused:true},false)).status===403);
 ws.send(JSON.stringify({t:'chat',text:'!pause'}));await new Promise(r=>setTimeout(r,300));check('web owner nickname cannot pause chat effects',!frame.activity.chatEffectsPaused);
 const growth=()=>frame.view.layers.filter(p=>p.src?.endsWith('tree01.png')).reduce((n,p)=>n+p.h,0),before=growth();
 await post('/admin/chat-effects',{paused:true});await wait(()=>frame.activity.chatEffectsPaused);
 await post('/admin/chat',{user:'paused-viewer',text:'!plant 1'});await new Promise(r=>setTimeout(r,300));check('paused chat cannot grow a tree while controller keeps broadcasting',growth()===before);
 await post('/admin/round',{action:'cancel'});await post('/admin/round',{action:'open'});await post('/admin/chat',{user:'proposer-during-pause',text:'!idea A quiet lantern garden'});
 check('proposal intake remains available during effects pause',(await(await fetch(base+'/community/state')).json()).round.ideas.length===1);
 await post('/admin/fallback',{});await wait(()=>frame.game?.name==='Marble Race');check('safety fallback remains available during effects pause',frame.fallback.active&&frame.activity.chatEffectsPaused);
 await post('/admin/load',{game:'community-grove'});await wait(()=>frame.game?.name==='Community Grove');await post('/admin/chat-effects',{paused:false});await wait(()=>!frame.activity.chatEffectsPaused);await post('/admin/chat',{user:'resumed-viewer',text:'!plant 1'});await wait(()=>growth()>before);check('resume restores actual chat game effects',true);
 await post('/admin/round',{action:'cancel'});
}finally{ws.close();await post('/admin/chat-effects',{paused:false});}
