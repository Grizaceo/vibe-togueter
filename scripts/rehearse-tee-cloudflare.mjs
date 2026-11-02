// Automated real-browser evidence, never human or real Twitch evidence.
import fs from 'node:fs';
import crypto from 'node:crypto';
import {nativeTeeCodec} from '../src/tee-native-codec.js';
const option=name=>process.argv[process.argv.indexOf(name)+1];
const base=option('--base');
if(!process.argv.includes('--base')||new URL(base).protocol!=='https:'||!/^[-a-z0-9]+\.trycloudflare\.com$/.test(new URL(base).hostname))throw Error('Specify exact Cloudflare trial HTTPS origin');
const manifest=await(await fetch(new URL('/trial-manifest.json',base),{redirect:'error'})).json();
if(manifest.contractVersion!==1||manifest.schema!=='teeworlds-rs/172cfef'||manifest.gameRevision!==option('--game-revision'))throw Error('Unknown or unpinned game protocol manifest');
const {chromium}=await import(option('--playwright'));
const codec=await nativeTeeCodec(option('--codec'));
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--enable-unsafe-swiftshader']}).catch(error=>{codec.close();throw error;});
const context=await browser.newContext({viewport:{width:1600,height:1000}});
const evidence={at:new Date().toISOString(),kind:'automated Chromium Cloudflare-to-VM individual entry; no collective tee',manifest,entryURL:base,checks:[],clients:[],errors:[],limitations:['Automated browser participants, not humans.','Runs from the owner PC to the public VM tunnel, not a second independent human/network.','No streamer authentication or human streamer interaction established.','Native schema pin does not prove binary/WASM source revision.']};
const check=(name,ok)=>{evidence.checks.push({name,ok:!!ok});if(!ok)throw Error(name);};
const tracked=[];
context.on('page',page=>{
  page.on('pageerror',()=>evidence.errors.push('browser exception'));
  page.on('websocket',ws=>{
    if(ws.url()!==new URL(base).origin.replace('https:','wss:')+'/ws')return;
    const state={url:ws.url(),snapshots:0,sent:0,closed:false,position:null};evidence.clients.push(state);
    ws.on('framesent',()=>state.sent++);ws.on('close',()=>state.closed=true);
    ws.on('framereceived',event=>{
      const task=codec.decode(event.payload).then(msg=>{
        if(msg.type==='welcome')state.playerId=msg.playerId;
        if(msg.type==='snapshot'){state.snapshots++;state.ack=msg.ack;state.position=msg.players.find(p=>p.id===state.playerId)?.position;state.players=msg.players.length;state.playerIds=msg.players.map(p=>p.id);}
      }).catch(()=>evidence.errors.push('browser protocol rejected'));tracked.push(task);
    });
  });
});
try{
  const origin=new URL(base).origin;
  const redirect=await fetch(origin+'/?name=automated-viewer',{redirect:'manual'});
  check('public HTTPS entry redirects with the individual display name',redirect.status===302&&new URL(redirect.headers.get('location'),origin).searchParams.get('name')==='automated-viewer');
  const page=await context.newPage();await page.goto(origin+'/tee-play.html?game=tee-vm&name=automated-streamer');await page.getByRole('button',{name:'Enter game with my own tee'}).click();await page.waitForTimeout(3500);
  check('external game credits visible',await page.getByText('External game by Cristóbal Muñoz, developed separately with Devin and Hermes.',{exact:true}).isVisible());
  check('individual controls and external-game boundary visible',(await page.locator('body').innerText()).includes('Your own tee · keyboard and mouse')&&(await page.locator('#boundary').innerText()).includes('External game.'));
  check('platform custom domain explicitly remains pending',manifest.platformCustomDomain==='pending');
  const player=await context.newPage();await player.goto(origin+'/tee-play.html?game=tee-vm&name=automated-viewer');await player.getByRole('button',{name:'Enter game with my own tee'}).click();
  await player.waitForLoadState();await player.waitForTimeout(3500);
  check('platform entry opens the VM game over HTTPS',player.url()===origin+'/tee-play.html?game=tee-vm&name=automated-viewer');
  check('two actual browser clients receive authoritative snapshots',evidence.clients.length===2&&evidence.clients.every(s=>s.snapshots>10&&s.ack>0&&s.position));
  const client=evidence.clients.at(-1);await player.frameLocator('iframe').locator('#glcanvas').click({position:{x:500,y:300}});await player.waitForTimeout(200);const before={...client.position};
  await player.keyboard.down('d');await player.waitForTimeout(280);await player.keyboard.up('d');await player.waitForTimeout(1800);
  evidence.browserMovement={before,after:{...client.position}};
  check('browser input changes authoritative position',Math.abs(client.position.x-before.x)>1);
  await player.keyboard.press('Space');await player.waitForTimeout(250);
  const stem='docs/evidence/tee-cloudflare-browser-'+Date.now();
  await player.screenshot({path:stem+'-game.png'});
  await page.bringToFront();await page.waitForTimeout(1500);
  await page.screenshot({path:stem+'-credits.png'});
  evidence.screenshots=[stem+'-credits.png',stem+'-game.png'];
  const oldId=client.playerId;
  await player.close();await page.bringToFront();
  for(let i=0;i<60&&evidence.clients[0].playerIds.includes(oldId);i++)await page.waitForTimeout(50);
  check('individual disconnect removes its tee from authoritative roster',!evidence.clients[0].playerIds.includes(oldId));
  const returning=await context.newPage();
  await returning.goto(origin+'/tee-play.html?game=tee-vm&name=automated-viewer');
  await returning.getByRole('button',{name:'Enter game with my own tee'}).click();await returning.waitForTimeout(3000);
  const resumed=evidence.clients.at(-1);
  check('return opens a new ONLINE individual tee',evidence.clients.length===3&&resumed.playerId!==oldId&&resumed.snapshots>10&&resumed.ack>0&&!resumed.closed);
  const wasm=Buffer.from(await(await fetch(new URL('/teeworlds_rs.wasm',base))).arrayBuffer());
  evidence.servedWasmSha256=crypto.createHash('sha256').update(wasm).digest('hex');
  check('served WASM matches the VM build manifest',evidence.servedWasmSha256===manifest.wasmSha256);
  check('no browser or schema errors',evidence.errors.length===0);
}catch(error){evidence.error=error.message;process.exitCode=1;}
finally{
  await browser.close();await Promise.allSettled(tracked);codec.close();evidence.finishedAt=new Date().toISOString();
  const file='docs/evidence/tee-cloudflare-browser-'+Date.now()+'.json';fs.writeFileSync(file,JSON.stringify(evidence,null,2)+'\n');console.log(JSON.stringify({file,checks:evidence.checks,error:evidence.error}));
}
