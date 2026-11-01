import WebSocket from 'ws';
const base=process.env.VA_ARENA_URL,headers={'Content-Type':'application/json','x-streamer-key':process.env.VA_STREAMER_KEY};
const post=(route,body,auth=true)=>fetch(base+route,{method:'POST',headers:auth?headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}),state=async()=>(await(await fetch(base+'/community/state')).json());
const check=(name,value)=>{console.log(`${value?'PASS':'FAIL'} ${name}`);if(!value)process.exitCode=1;};
await post('/admin/round',{action:'cancel'});await post('/admin/round',{action:'open'});await post('/admin/chat',{user:'delegate-fixture',text:'!idea A shared lantern garden'});await post('/admin/round',{action:'vote'});await post('/admin/round',{action:'close'});await post('/admin/round',{action:'select',ids:[1]});
const ws=new WebSocket(base.replace(/^http/,'ws')+'/spectate?name=trusted_mod');await new Promise(r=>ws.once('open',r));
try{
 check('delegation settings reject missing streamer confirmation',(await post('/admin/approval-delegate',{action:'grant',name:'trusted_mod',seconds:60},false)).status===403);
 await post('/admin/approval-delegate',{action:'grant',name:'trusted_mod',seconds:60});check('active limited delegation is visible in community state',(await state()).delegation?.scope==='selected-round-inputs');
 ws.send(JSON.stringify({t:'chat',text:'!build approve '+(await state()).round.reviewToken}));await new Promise(r=>setTimeout(r,300));check('a web delegate nickname cannot approve the exact reviewed inputs',(await state()).round.phase==='awaiting-approval');
 await post('/admin/approval-delegate',{action:'revoke'});check('streamer can revoke delegation immediately',(await state()).delegation===null);
}finally{ws.close();await post('/admin/approval-delegate',{action:'revoke'});await post('/admin/round',{action:'cancel'});}
