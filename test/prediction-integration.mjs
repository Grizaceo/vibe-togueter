import WebSocket from 'ws';
const base=process.env.VA_ARENA_URL,post=(body,key=true)=>fetch(base+'/admin/prediction',{method:'POST',headers:{'Content-Type':'application/json',...(key?{'x-streamer-key':process.env.VA_STREAMER_KEY}:{})},body:JSON.stringify(body)});
const check=(name,value)=>{console.log(`${value?'PASS':'FAIL'} ${name}`);if(!value)process.exitCode=1;},sleep=ms=>new Promise(r=>setTimeout(r,ms));
const ws=new WebSocket(base.replace(/^http/,'ws')+'/spectate?name=PredictionFan');let frame;ws.on('message',raw=>{const m=JSON.parse(raw);if(m.t==='state')frame=m;});await new Promise(r=>ws.once('open',r));
const wait=async fn=>{for(let n=0;n<100;n++){if(fn())return;await sleep(30);}throw Error('Prediction state deadline');};
try{
 check('prediction owner actions reject missing confirmation',(await post({action:'open',choices:['Sun','Rain']},false)).status===403);
 await post({action:'open',choices:['Sun','Rain']});ws.send(JSON.stringify({t:'chat',text:'!prediction resolve Sun'}));await sleep(300);check('viewer cannot resolve a prediction',frame?.activity.prediction?.phase==='open');
 ws.send(JSON.stringify({t:'chat',text:'!predict Sun'}));await wait(()=>frame?.activity.prediction?.participants===1);check('browser chat ballot reaches the overlay snapshot',frame.activity.prediction.choices[0].count===1);
 await post({action:'lock'});check('local prediction cannot resolve an unknown outcome',(await post({action:'resolve',choice:'missing'})).status===400);await post({action:'resolve',choice:'Sun'});await wait(()=>frame?.activity.prediction?.phase==='resolved');check('resolved overlay recognizes winners without a money ledger',frame.activity.prediction.winnerCount===1&&frame.activity.prediction.winners[0]==='PredictionFan (web)'&&frame.activity.prediction.resolution==='streamer-reported');
}finally{ws.close();}
