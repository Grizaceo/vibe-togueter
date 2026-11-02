// Default-off production routes must never provision or contact a coding worker.
const base=process.env.VA_ARENA_URL,headers={'Content-Type':'application/json','x-streamer-key':process.env.VA_STREAMER_KEY};
const post=(body,extra={})=>fetch(base+'/admin/studio-builds',{method:'POST',headers:{...headers,...extra},body:JSON.stringify(body)});
const check=(name,value)=>{console.log(`${value?'PASS':'FAIL'} ${name}`);if(!value)process.exitCode=1;};
let response=await fetch(base+'/admin/studio-builds');check('studio worker status requires private streamer confirmation',response.status===403);
const before=await(await fetch(base+'/admin/status')).json();response=await post({action:'check'});check('disabled worker refuses provider preflight',(await response.json()).error.includes('disabled'));
response=await post({action:'dispatch',roundId:'invented',approvedInputHash:'a'.repeat(64)});check('disabled worker rejects dispatch without a provider/model operation',(await response.json()).error.includes('disabled'));
response=await post({action:'check'},{'x-forwarded-for':'203.0.113.4'});check('forwarded worker operations remain local-only',response.status===403);
const state=await(await fetch(base+'/community/state')).json(),after=await(await fetch(base+'/admin/status')).json();check('default-off connector preserves live Plan B game and honest public status',state.build.enabled===false&&state.build.workerConnected===false&&state.build.job===null&&before.game.name===after.game.name);
