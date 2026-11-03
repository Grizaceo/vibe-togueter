// Explicit owner-authorized real Twitch rehearsal. Sends commands in own channel.
import fs from 'node:fs';import WebSocket from 'ws';
import {TwitchAuth,readEnv} from '../src/auth/twitch.js';import {connectTwitch} from '../src/chat/twitch.js';
const env=readEnv(),auth=new TwitchAuth(),info=await auth.validate({force:true}),channel=env.VA_TWITCH_CHANNEL;
if(info.login!==channel)throw new Error('Rehearsal restricted to your own channel.');
// Use the controller's verified live link, never a possibly stale VA_PUBLIC_URL from .env.
const liveLink=(await(await fetch('http://localhost:8420/admin/status',{headers:{Authorization:'Bearer '+env.VA_ADMIN_TOKEN}})).json()).publicLink?.url;if(!liveLink)throw new Error('Controller has no live public link yet.');env.VA_PUBLIC_URL=liveLink;
const evidence={startedAt:new Date().toISOString(),channel,publicUrl:env.VA_PUBLIC_URL,checks:{},commands:[],observed:[],limitations:['Automated commands from owner account plus one automated public-web participant, not independent audience participants.','This verifies real Twitch chat; a broadcast/OBS recording is a separate evidence step.']};
const wait=ms=>new Promise(r=>setTimeout(r,ms));const until=async(fn,ms=20000)=>{const end=Date.now()+ms;while(Date.now()<end){if(fn())return true;await wait(100);}return false;};
const observer=connectTwitch(channel,m=>{if(m.user===channel && (/^!(play|race|join|left|fire)$/.test(m.text)||m.text.includes(env.VA_PUBLIC_URL)))evidence.observed.push({at:new Date().toISOString(),...m});});
const sender=connectTwitch(channel,()=>{},{auth});let socket;let frames=[],feeds=[];
const command=async(text)=>{await until(()=>sender.ready);const queued=sender.send(text);evidence.commands.push({at:new Date().toISOString(),text,queued});await wait(1900);};
const admin=async(game)=>{const r=await fetch('http://localhost:8420/admin/load',{method:'POST',headers:{Authorization:'Bearer '+env.VA_ADMIN_TOKEN,'Content-Type':'application/json'},body:JSON.stringify({game})});if(!r.ok)throw new Error('Admin load failed.');};
const connect=async(player=false,name='gris_96')=>{frames=[];feeds=[];socket=new WebSocket(env.VA_PUBLIC_URL.replace(/^http/,'ws')+(player?'/play?name='+encodeURIComponent(name):'/spectate'),{handshakeTimeout:10000});socket.on('message',raw=>{const m=JSON.parse(raw);if(m.t==='state')frames.push(m);if(m.t==='feed')feeds.push(m);if(m.t==='role')evidence.checks.streamerRole=m.ok;});await new Promise((r,j)=>{socket.once('open',r);socket.once('error',j);});};
try{
 evidence.checks.ircReady=await until(()=>sender.ready&&observer.ready);
 const streams=await auth.helix('streams?user_id='+info.user_id);evidence.broadcastLive=streams.data.length>0;
 evidence.checks.publicPlayer=(await fetch(env.VA_PUBLIC_URL)).status===200;
 evidence.checks.publicOverlay=(await fetch(env.VA_PUBLIC_URL+'/overlay.html')).status===200;
 evidence.checks.publicAdminDenied=(await fetch(env.VA_PUBLIC_URL+'/admin/status')).status===403;
 await admin('marble-race');await connect(true,'codex-web-rehearsal');await command('!play');await command('!race');await command('!join');
 evidence.checks.realPlay=feeds.some(m=>m.text===channel+' usó !play');
 evidence.checks.realRace=await until(()=>frames.some(m=>m.view.hud.some(h=>typeof h.text==='string'&&h.text.startsWith('⏱'))));
 evidence.checks.ownerMarble=frames.some(m=>m.view.layers.some(l=>l.text===channel));
 evidence.checks.realJoinReply=await until(()=>evidence.observed.some(m=>m.text.includes(env.VA_PUBLIC_URL+'/')&&!m.text.includes('name=')));
 socket.close();await admin('chat-vs-streamer');await connect(true);
 socket.send(JSON.stringify({t:'claim-streamer',key:env.VA_STREAMER_KEY}));await until(()=>evidence.checks.streamerRole);
 socket.send(JSON.stringify({t:'input',data:{kind:'key',key:'right',down:true}}));await wait(400);socket.send(JSON.stringify({t:'input',data:{kind:'key',key:'right',down:false}}));
 evidence.checks.publicWebInput=frames.some(m=>m.view.layers.some(l=>l.t==='rect'&&l.color==='#b596ff'&&l.x>640));
 await command('!left');evidence.checks.realVoteAction=await until(()=>frames.some(m=>m.view.hud.some(h=>typeof h.text==='string'&&h.text.startsWith('LEFT ·'))));
 await command('!fire');evidence.checks.realFireVote=await until(()=>frames.some(m=>m.view.hud.some(h=>typeof h.text==='string'&&h.text.startsWith('FIRE ·'))));
}catch(e){evidence.error=e.message;process.exitCode=1;}
finally{
 sender.close();observer.close();socket?.close();evidence.finishedAt=new Date().toISOString();
 fs.mkdirSync('docs/evidence',{recursive:true});const target='docs/evidence/twitch-rehearsal-'+Date.now()+'.json';fs.writeFileSync(target,JSON.stringify(evidence,null,2)+'\n');
 console.log(JSON.stringify({file:target,...evidence.checks,broadcastLive:evidence.broadcastLive,error:evidence.error}));
 if(Object.values(evidence.checks).some(x=>!x))process.exitCode=1;
}
