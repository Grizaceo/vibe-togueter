// Automated real-browser evidence, never human or real Twitch evidence.
import fs from 'node:fs';
import crypto from 'node:crypto';
import {nativeTeeCodec} from '../src/tee-native-codec.js';
const option=name=>process.argv[process.argv.indexOf(name)+1];
const base=option('--base');
if(!process.argv.includes('--base')||new URL(base).hostname!=='127.0.0.1')throw Error('Specify private local demo URL');
const {chromium}=await import(option('--playwright'));
const codec=await nativeTeeCodec(option('--codec'));
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--enable-unsafe-swiftshader']}).catch(error=>{codec.close();throw error;});
const context=await browser.newContext({viewport:{width:1600,height:1000}});
const evidence={at:new Date().toISOString(),kind:'automated Chromium external-game local integration',entryURL:base,checks:[],clients:[],errors:[],limitations:['Automated browser participants, not humans.','Local WS only, no VM/TLS/WSS or external network verification.','No streamer authentication or human streamer interaction established.','Native schema pin does not prove binary/WASM source revision.']};
const check=(name,ok)=>{evidence.checks.push({name,ok:!!ok});if(!ok)throw Error(name);};
const tracked=[];
context.on('page',page=>{
  page.on('pageerror',()=>evidence.errors.push('browser exception'));
  page.on('websocket',ws=>{
    if(ws.url()!=='ws://127.0.0.1:8304/ws')return;
    const state={url:ws.url(),snapshots:0,sent:0,closed:false,position:null};evidence.clients.push(state);
    ws.on('framesent',()=>state.sent++);ws.on('close',()=>state.closed=true);
    ws.on('framereceived',event=>{
      const task=codec.decode(event.payload).then(msg=>{
        if(msg.type==='welcome')state.playerId=msg.playerId;
        if(msg.type==='snapshot'){state.snapshots++;state.ack=msg.ack;state.position=msg.players.find(p=>p.id===state.playerId)?.position;state.players=msg.players.length;}
      }).catch(()=>evidence.errors.push('browser protocol rejected'));tracked.push(task);
    });
  });
});
try{
  const page=await context.newPage();await page.goto(base);await page.waitForTimeout(3500);
  check('external game credits visible',await page.getByText('teeworlds-rs by Cristóbal Muñoz with Devin and Hermes · external game',{exact:true}).isVisible());
  check('collective scope and pending VM disclosed',(await page.locator('small').innerText()).includes('One collective chat tee'));
  const [player]=await Promise.all([context.waitForEvent('page'),page.getByRole('link',{name:'Open game as individual player'}).click()]);
  await player.waitForLoadState();await player.waitForTimeout(3500);
  check('platform entry link opens real local game',player.url()==='http://127.0.0.1:8304/#viewer');
  check('two actual browser clients receive authoritative snapshots',evidence.clients.length===2&&evidence.clients.every(s=>s.snapshots>10&&s.ack>0&&s.position));
  const client=evidence.clients.at(-1),before={...client.position};
  await player.keyboard.down('d');await player.waitForTimeout(280);await player.keyboard.up('d');await player.waitForTimeout(150);
  evidence.browserMovement={before,after:{...client.position}};
  check('browser input changes authoritative position',Math.abs(client.position.x-before.x)>1);
  await player.keyboard.press('Space');await player.waitForTimeout(250);
  const stem='docs/evidence/tee-local-browser-'+Date.now();
  await player.screenshot({path:stem+'-game.png'});
  await page.bringToFront();await page.waitForTimeout(1500);
  await page.screenshot({path:stem+'-credits.png'});
  evidence.screenshots=[stem+'-credits.png',stem+'-game.png'];
  const wasm=Buffer.from(await(await fetch('http://127.0.0.1:8304/teeworlds_rs.wasm')).arrayBuffer());
  evidence.servedWasmSha256=crypto.createHash('sha256').update(wasm).digest('hex');
  check('no browser or schema errors',evidence.errors.length===0);
}catch(error){evidence.error=error.message;process.exitCode=1;}
finally{
  await browser.close();await Promise.allSettled(tracked);codec.close();evidence.finishedAt=new Date().toISOString();
  const file='docs/evidence/tee-local-browser-'+Date.now()+'.json';fs.writeFileSync(file,JSON.stringify(evidence,null,2)+'\n');console.log(JSON.stringify({file,checks:evidence.checks,error:evidence.error}));
}
