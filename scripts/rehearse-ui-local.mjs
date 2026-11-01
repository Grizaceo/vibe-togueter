// Disposable local browser rehearsal. No owner .env, credentials, Twitch or cloud calls.
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import net from 'node:net';import {spawn} from 'node:child_process';import WebSocket from 'ws';
const root=path.resolve(new URL('..',import.meta.url).pathname),temp=fs.mkdtempSync(path.join(os.tmpdir(),'va-ui-'));
const runId='local-ui-'+Date.now();
const evidence=path.join(root,'docs','evidence'),sleep=ms=>new Promise(r=>setTimeout(r,ms));
const free=()=>new Promise(r=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>r(p));});});
for(const name of ['src','public','games','templates','package.json','vibe-arena.config.json'])fs.cpSync(path.join(root,name),path.join(temp,name),{recursive:true,filter:p=>!p.includes('/auto-')});
fs.symlinkSync(path.join(root,'node_modules'),path.join(temp,'node_modules'),'dir');
const port=await free(),debugPort=await free(),base='http://127.0.0.1:'+port;
const env={PATH:process.env.PATH,HOME:temp,LANG:'C.UTF-8',VA_STREAMER_KEY:'local-ui-fixture-key'};
const server=spawn(process.execPath,['--experimental-vm-modules','src/server.js','--port',String(port),'--game-dir','games/community-grove'],{cwd:temp,env,stdio:'ignore'});
let browser,cdp,socket,id=0;const pending=new Map(),checks=[],errors=[],requests=[];
const check=(name,ok)=>{checks.push({name,ok});if(!ok)throw Error(name);};
const wait=async fn=>{for(let n=0;n<100;n++){try{const result=await fn();if(result)return result;}catch{}await sleep(100);}throw Error('Readiness deadline');};
try{
 await wait(async()=>(await fetch(base+'/community/state')).ok);
 const post=async(route,body)=>{const response=await fetch(base+route,{method:'POST',headers:{'Content-Type':'application/json','x-streamer-key':env.VA_STREAMER_KEY},body:JSON.stringify(body)});if(!response.ok)throw Error(await response.text());const text=await response.text();try{return JSON.parse(text);}catch{return text;}};
 const assetIds=[];for(const key of ['kenney-background-sky','kenney-background-hills1','kenney-background-tree01']){const asset=await post('/admin/assets/import',{key});if(asset.status==='pending-review')await post('/admin/assets/review',{id:asset.id,approved:true,rightsAttested:true});assetIds.push(asset.id);}
 const reviewed=await post('/admin/game-publication',{action:'review',gameId:'community-grove'});await post('/admin/game-publication',{action:'publish',gameId:'community-grove',expectedCodeSha256:reviewed.codeSha256,assetIds});
 browser=spawn('chromium',['--headless','--disable-gpu','--disable-background-networking','--disable-component-update','--disable-sync','--no-first-run','--no-default-browser-check','--remote-debugging-address=127.0.0.1','--remote-debugging-port='+debugPort,'--user-data-dir='+path.join(temp,'browser-profile'),'about:blank'],{env,stdio:'ignore'});
 const target=await wait(async()=>{const r=await fetch('http://127.0.0.1:'+debugPort+'/json/new?about:blank',{method:'PUT'});return r.ok?r.json():null;});
 cdp=new WebSocket(target.webSocketDebuggerUrl);await new Promise(r=>cdp.once('open',r));
 const command=(method,params={})=>new Promise((resolve,reject)=>{const request=++id;pending.set(request,{resolve,reject});cdp.send(JSON.stringify({id:request,method,params}));});
 cdp.on('message',raw=>{const msg=JSON.parse(raw);if(msg.id){const call=pending.get(msg.id);if(call){pending.delete(msg.id);msg.error?call.reject(Error(msg.error.message)):call.resolve(msg.result);}}else if(msg.method==='Runtime.exceptionThrown')errors.push(msg.params.exceptionDetails.text);else if(msg.method==='Network.requestWillBeSent')requests.push(msg.params.request.url);});
 await command('Page.enable');await command('Runtime.enable');await command('Network.enable');await command('Emulation.setDeviceMetricsOverride',{width:1600,height:900,deviceScaleFactor:1,mobile:false});
 const evaluate=async expression=>(await command('Runtime.evaluate',{expression,returnByValue:true})).result.value;
 const navigate=async route=>{await command('Page.navigate',{url:base+route});await wait(()=>evaluate("document.readyState==='complete'"));await sleep(500);};
 const capture=async name=>{const shot=await command('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(evidence,name.replace('local-ui',runId)+'.png'),Buffer.from(shot.data,'base64'));};
 await navigate('/?name=BrowserRehearsal');await wait(()=>evaluate("document.querySelector('.creator-strip')?.textContent.includes('Kenney')"));
 check('lobby shows game, art and idea credit while details are collapsed',await evaluate("(()=>{const c=document.querySelector('.creator-strip');return c.textContent.includes('Game by:')&&c.textContent.includes('Art by:')&&c.textContent.includes('Idea by:')&&!document.querySelector('#live-credits details').open})()"));
 check('creator strip is inside the desktop viewport',await evaluate("(()=>{const r=document.querySelector('.creator-strip').getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight})()"));
 socket=new WebSocket(base.replace(/^http/,'ws')+'/spectate?name=frame-observer');let latest;socket.on('message',raw=>{const msg=JSON.parse(raw);if(msg.t==='state')latest=msg;});await new Promise(r=>socket.once('open',r));await wait(()=>latest);
 const before=latest.view.layers.filter(p=>p.t==='sprite'&&p.src.endsWith('tree01.png')).reduce((sum,p)=>sum+p.h,0);
 await command('Input.dispatchKeyEvent',{type:'keyDown',key:' ',code:'Space',windowsVirtualKeyCode:32});await command('Input.dispatchKeyEvent',{type:'keyUp',key:' ',code:'Space',windowsVirtualKeyCode:32});
 await wait(()=>latest.view.layers.filter(p=>p.t==='sprite'&&p.src.endsWith('tree01.png')).reduce((sum,p)=>sum+p.h,0)>before);check('production browser keyboard handler plants a visible tree',true);await capture('local-ui-lobby');
 await post('/admin/chat',{user:'Local viewer',text:'!idea A cooperative lantern garden'});
 await post('/admin/round',{action:'vote'});
 await post('/admin/chat',{user:'Local voter',text:'!vote 1'});
 await command('Emulation.setDeviceMetricsOverride',{width:1920,height:1080,deviceScaleFactor:1,mobile:false});
 await navigate('/overlay.html');await wait(()=>evaluate("document.querySelector('.creator-strip')?.textContent.includes('Kenney')"));
 check('overlay keeps all three credit roles in the viewport',await evaluate("(()=>{const c=document.querySelector('.creator-strip'),r=c.getBoundingClientRect();return c.textContent.includes('Idea by:')&&r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight})()"));
 check('1080p credit strip is at least 24px and no ledger is shown',await evaluate("parseFloat(getComputedStyle(document.querySelector('.creator-strip')).fontSize)>=24&&!document.querySelector('#fund')"));
 await capture('local-ui-overlay-1080p');
 await command('Emulation.setDeviceMetricsOverride',{width:1280,height:720,deviceScaleFactor:1,mobile:false});await sleep(300);
 check('720p stream credits and activity fit',await evaluate("(()=>{const c=document.querySelector('.creator-strip'),r=c.getBoundingClientRect(),a=document.querySelector('#activity');return parseFloat(getComputedStyle(c).fontSize)>=18&&r.right<=innerWidth&&r.bottom<=innerHeight&&a.textContent.includes('Isolated builder not connected')})()"));
 await wait(()=>evaluate("document.querySelector('#activity').textContent.includes('1 ideas · 1 voters')"));
 check('overlay shows a real local proposal and ballot from WS state',await evaluate("document.querySelector('#activity').textContent.includes('1 ideas · 1 voters')&&document.querySelector('#activity').textContent.includes('cooperative lantern garden')"));
 await capture('local-ui-overlay');
 await post('/admin/fallback',{});await wait(()=>evaluate("document.querySelector('#activity').textContent.includes('Requested by local streamer')"));check('overlay shows the actual local fallback reason',true);
 await navigate('/studio.html');check('studio renders its selected Plan B boundary and privacy link',await evaluate("document.querySelector('#execution').textContent.includes('pending')&&!!document.querySelector('a[href=\"/privacy.html\"]')"));await capture('local-ui-studio');
 await navigate('/privacy.html');check('privacy page shows supplied operator/contact and pending hosting',await evaluate("document.body.textContent.includes('Cristóbal Muñoz')&&!!document.querySelector('a[href=\"mailto:cristobal.munoz@derecho.uchile.cl\"]')&&document.body.textContent.includes('[OWNER MUST COMPLETE BEFORE PUBLIC USE]')"));await capture('local-ui-privacy');
 check('no browser JavaScript exception occurred',errors.length===0);check('credit clients make no HTTP polling requests',!requests.some(url=>url.includes('/community/game-credits')));
 fs.writeFileSync(path.join(evidence,runId+'-rehearsal.json'),JSON.stringify({at:new Date().toISOString(),kind:'automated-local-Chromium-rehearsal',checks,errors,temp,limits:['Disposable checkout without owner configuration.','No real Twitch traffic, human gameplay, OBS recording or submission video.','Lobby 1600x900, overlay 1920x1080 and 1280x720; not a mobile usability claim.']},null,2)+'\n');
 console.log(JSON.stringify({checks,errors,temp}));
}catch(error){console.error(error.message);process.exitCode=1;fs.writeFileSync(path.join(evidence,'local-ui-failure-'+Date.now()+'.json'),JSON.stringify({at:new Date().toISOString(),error:error.message,checks,errors,temp},null,2)+'\n');}
finally{socket?.close();cdp?.close();browser?.kill('SIGTERM');server.kill('SIGTERM');await sleep(300);fs.rmSync(temp,{recursive:true,force:true,maxRetries:5,retryDelay:100});}
