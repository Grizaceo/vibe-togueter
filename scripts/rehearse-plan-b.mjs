// Normal launcher + production browser forms. Local automation, never human/Twitch evidence.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import crypto from 'node:crypto';
import WebSocket from 'ws';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'vibe-plan-b-browser-'));
const runId='plan-b-browser-'+Date.now(),evidence=path.join(root,'docs/evidence');
const interrupted=new AbortController();
const onSignal=()=>interrupted.abort(Error('Rehearsal interrupted; cleanup required'));
process.once('SIGINT',onSignal);process.once('SIGTERM',onSignal);
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const wait=async fn=>{for(let n=0;n<200;n++){interrupted.signal.throwIfAborted();const value=await fn();if(value)return value;await pause(100);}throw Error('Browser rehearsal observation deadline');};
const checks=[],exceptions=[],sessions=[],screenshots=[];
const check=(name,ok)=>{checks.push({name,ok:!!ok});if(!ok)throw Error(name);};
const env={PATH:process.env.PATH,HOME:temp,LANG:'C.UTF-8'};
let launcher,browser,base,launcherOutput='',observer,latest,latestCredits;
const closed=new Map();
function start(executable,args,options){const child=spawn(executable,args,options);child.once('error',error=>{child.spawnError=error;});closed.set(child,new Promise(resolve=>child.once('close',resolve)));return child;}
async function stop(child){if(!child)return;if(child.exitCode===null&&child.signalCode===null){child.kill('SIGTERM');const timer=setTimeout(()=>child.kill('SIGKILL'),5000);await closed.get(child);clearTimeout(timer);}}
try{
 launcher=start(process.execPath,['scripts/demo-local.mjs'],{cwd:root,env,stdio:['pipe','pipe','pipe']});
 launcher.stdin.on('error',error=>{launcher.inputError=error;});
 launcher.stdout.on('data',chunk=>{launcherOutput=(launcherOutput+chunk).slice(-32768);});launcher.stderr.resume();
 await wait(()=>{if(launcher.spawnError||launcher.exitCode!==null)throw Error('Launcher unavailable before readiness');const match=launcherOutput.match(/Play: (http:\/\/127\.0\.0\.1:\d+)/);if(match)base=match[1];return base;});
 const state=async()=>{const response=await fetch(base+'/community/state',{signal:AbortSignal.timeout(3000)});if(!response.ok)throw Error('Community state unavailable');return response.json();};
 const command=async text=>{if(launcher.inputError||launcher.exitCode!==null)throw Error('Launcher command pipe unavailable');const offset=launcherOutput.length;launcher.stdin.write(text+'\n');await wait(()=>{if(launcher.inputError||launcher.exitCode!==null)throw Error('Launcher command pipe closed');return launcherOutput.slice(offset).includes('Done: '+text);});};
 browser=start('chromium',['--headless','--disable-gpu','--disable-background-networking','--disable-component-update','--disable-sync','--no-first-run','--no-default-browser-check','--remote-debugging-address=127.0.0.1','--remote-debugging-port=0','--user-data-dir='+path.join(temp,'chromium'),'about:blank'],{env,stdio:'ignore'});
 const debugPort=await wait(()=>{if(browser.spawnError||browser.exitCode!==null)throw Error('Chromium unavailable before readiness');const file=path.join(temp,'chromium/DevToolsActivePort');return fs.existsSync(file)&&fs.readFileSync(file,'utf8').split('\n')[0];});
 async function tab(route){
  const response=await fetch('http://127.0.0.1:'+debugPort+'/json/new?about:blank',{method:'PUT',signal:AbortSignal.timeout(3000)}),target=await response.json();
  const ws=new WebSocket(target.webSocketDebuggerUrl,{handshakeTimeout:5000});await new Promise((resolve,reject)=>{ws.once('open',resolve);ws.once('error',reject);});
  const pending=new Map();let id=0;
  ws.on('message',raw=>{const msg=JSON.parse(raw);if(msg.id){const p=pending.get(msg.id);if(p){pending.delete(msg.id);clearTimeout(p.timer);msg.error?p.reject(Error(msg.error.message)):p.resolve(msg.result);}}else if(msg.method==='Runtime.exceptionThrown')exceptions.push(msg.params.exceptionDetails.text);});
  const cdp=(method,params={})=>new Promise((resolve,reject)=>{if(interrupted.signal.aborted){reject(interrupted.signal.reason);return;}const request=++id,timer=setTimeout(()=>{pending.delete(request);reject(Error('CDP deadline: '+method));},5000);pending.set(request,{resolve,reject,timer});ws.send(JSON.stringify({id:request,method,params}));});
  const evaluate=async expression=>{const result=await cdp('Runtime.evaluate',{expression,returnByValue:true});if(result.exceptionDetails)throw Error('Browser expression failed');return result.result.value;};
  const click=async selector=>{await cdp('Page.bringToFront');const point=await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e||e.disabled)return null;e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2}})()`);if(!point)throw Error('Missing/enabled element: '+selector);await cdp('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...point});await cdp('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...point});};
  const fill=async(selector,text)=>{await click(selector);await cdp('Input.dispatchKeyEvent',{type:'keyDown',key:'a',code:'KeyA',modifiers:2,windowsVirtualKeyCode:65});await cdp('Input.dispatchKeyEvent',{type:'keyUp',key:'a',code:'KeyA',modifiers:2,windowsVirtualKeyCode:65});await cdp('Input.insertText',{text});};
  const capture=async name=>{const file=runId+'-'+name+'.png',shot=await cdp('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(evidence,file),Buffer.from(shot.data,'base64'));screenshots.push(file);};
  const session={ws,cdp,evaluate,click,fill,capture};sessions.push(session);
  await cdp('Page.enable');await cdp('Runtime.enable');await cdp('Emulation.setDeviceMetricsOverride',{width:1600,height:900,deviceScaleFactor:1,mobile:false});await cdp('Page.navigate',{url:base+route});await wait(()=>evaluate("document.readyState==='complete'"));return session;
 }
 const studio=await tab('/studio.html');await wait(()=>studio.evaluate("document.querySelector('#execution').textContent.includes('pending')"));
 check('Studio accurately describes empty remote catalog and supplied operator status',await studio.evaluate("document.querySelector('#games').textContent.includes('remote catalog is empty')&&document.querySelector('a[href=\"/privacy.html\"]').textContent.includes('hosting details pending')"));
 await studio.fill('#alias','LocalBrowserParticipant');await studio.click('#connect');await wait(()=>studio.evaluate("!document.querySelector('#propose').disabled"));
 await studio.fill('#proposal','A cooperative garden shaped by our community');await studio.click('#propose');
 await wait(async()=>{const s=await state();return s.round?.ideas[0]?.text==='A cooperative garden shaped by our community';});
 check('production Studio form submits browser-authored proposal',true);
 await command('voting');await wait(()=>studio.evaluate("document.querySelector('#ideas button')&&!document.querySelector('#ideas button').disabled"));await studio.click('#ideas button');
 await wait(async()=>{const s=await state();return s.round?.voters===1&&s.round.ideas[0].votes===1;});check('production Studio vote button counts the browser ballot',true);
 await command('close');await command('select 1');await command('review');await command('approve');
 await wait(()=>studio.evaluate("document.querySelector('#phase').textContent==='approved'"));
 check('launcher reviews and approves exactly the browser-proposed input',true);await studio.capture('approved-studio');
 const player=await tab('/?name=LocalBrowserPlayer');
 await wait(()=>player.evaluate("document.querySelector('.creator-strip')?.textContent.includes('Cristóbal Muñoz')"));
 observer=new WebSocket(base.replace(/^http/,'ws')+'/spectate?name=LocalFrameObserver',{handshakeTimeout:5000});observer.on('message',raw=>{const msg=JSON.parse(raw);if(msg.t==='state')latest=msg;if(msg.t==='credits')latestCredits=msg.publication;});await new Promise((resolve,reject)=>{observer.once('open',resolve);observer.once('error',reject);});await wait(()=>latest);
 const trees=()=>latest.view.layers.filter(p=>p.t==='sprite'&&p.src.endsWith('tree01.png')).length,before=trees();
 await player.cdp('Input.dispatchKeyEvent',{type:'keyDown',key:' ',code:'Space',windowsVirtualKeyCode:32});await player.cdp('Input.dispatchKeyEvent',{type:'keyUp',key:' ',code:'Space',windowsVirtualKeyCode:32});
 await wait(()=>trees()>before);check('production keyboard input advances Grove through normal launcher',true);await player.capture('grove');
 await command('fallback');await wait(()=>player.evaluate("document.body.textContent.includes('Requested by local streamer')"));
 check('terminal fallback reaches the existing browser and exposes its cause',true);await player.capture('fallback');
 const second=await tab('/?name=SecondLocalPlayer');await wait(()=>second.evaluate("document.querySelector('#game').textContent==='Marble Race'"));
 await wait(()=>latest?.players.length>=2);check('both browser players are present after fallback',true);
 await player.fill('#ct','!race');await player.cdp('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,text:'\r',unmodifiedText:'\r'});await player.cdp('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
 await wait(()=>player.evaluate("document.querySelector('#ct').value===''"));check('browser chat form actually submits the race command',true);
 await wait(()=>latest?.view.hud.some(p=>String(p.text).startsWith('⏱')));
 check('two browser entrants start an actual Marble race through the production chat form',true);
 await wait(()=>latest.view.layers.some(p=>p.t==='circle'&&p.r===11&&p.fill!==false&&p.y>100));check('authoritative marble positions move beyond their initial spawn',true);await player.capture('marble-race');
 await command('grove');await wait(()=>player.evaluate("document.body.textContent.includes('Community Grove')&&document.querySelector('.creator-strip')?.textContent.includes('Cristóbal Muñoz')"));
 const groveHash=crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'games/community-grove/game.js'))).digest('hex');
 await wait(()=>latest.game?.versionSha256===groveHash&&latestCredits?.codeSha256===groveHash);
 check('returning to Grove restores matching source-version credits inside the viewport',await player.evaluate("(()=>{const c=document.querySelector('.creator-strip'),r=c.getBoundingClientRect();return c.textContent.includes('Cristóbal Muñoz')&&r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight&&getComputedStyle(c).visibility!=='hidden'})()"));check('no browser JavaScript exception occurred',exceptions.length===0);
 await command('cancel');await command('open');await wait(async()=>(await state()).round?.phase==='collecting');check('owner can prepare another round after cancelling approved inputs',true);
 launcher.stdin.write('stop\n');let stopDeadline;try{await Promise.race([closed.get(launcher),new Promise((_,reject)=>{stopDeadline=setTimeout(()=>reject(Error('Normal launcher stop deadline')),5000);})]);}finally{clearTimeout(stopDeadline);}check('normal stop closes the launcher successfully',launcher.exitCode===0);
}catch(error){checks.push({name:error.message,ok:false});if(sessions.length)try{await sessions.at(-1).capture('failure');}catch{}process.exitCode=1;}
finally{
 observer?.terminate();for(const s of sessions)s.ws.terminate();await stop(browser);await stop(launcher);
 const cleanupConfirmed=[launcher,browser].every(child=>!child||child.exitCode!==null||child.signalCode!==null);
 fs.rmSync(temp,{recursive:true,force:true,maxRetries:5,retryDelay:100});
 process.removeListener('SIGINT',onSignal);process.removeListener('SIGTERM',onSignal);
 const result={at:new Date().toISOString(),kind:'automated-local-normal-launcher-browser-rehearsal',checks,exceptions,screenshots,cleanupConfirmed,diagnostic:process.exitCode?{game:latest?.game,players:latest?.players,hud:latest?.view.hud}:undefined,limits:['Production browser forms, keyboard and terminal controls on localhost only.','No human participants, Twitch connection/messages, OBS capture or exported video.','Approved inputs do not dispatch a worker; Seed Race was not imported or executed.']};
 const file=path.join(evidence,runId+'.json');fs.writeFileSync(file,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({evidence:file,...result},null,2));
}
