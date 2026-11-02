// Runs only inside the authorized VM. Public logs contain no credentials.
import fs from 'node:fs';
import {spawn} from 'node:child_process';
if(process.env.VT_AUTHORIZED_GUEST_BUILD!=='tee-cloudflare-trial')throw Error('Guest trial authorization required');
const deadline=Date.parse(process.env.VT_DEMO_EXPIRES_AT||'');
if(!Number.isFinite(deadline)||deadline<=Date.now()||deadline>Date.now()+1800000)throw Error('Invalid creation-based deadline');
fs.writeFileSync('/app/cloudflared-empty.yml','{}\n',{mode:0o600});
const tunnel=spawn('/app/cloudflared',['tunnel','--config','/app/cloudflared-empty.yml','--no-autoupdate','--protocol','http2','--edge-ip-version','4','--url','http://127.0.0.1:8080'],{stdio:['ignore','pipe','pipe']});
let game,started=false,ended=false;
const stop=()=>{if(ended)return;ended=true;game?.kill('SIGTERM');tunnel.kill('SIGTERM');setTimeout(()=>process.exit(0),1000).unref();};
let text='';
const observe=chunk=>{
  text=(text+chunk.toString()).slice(-16384);
  const match=/https:\/\/[a-z0-9-]+\.trycloudflare\.com/.exec(text);
  if(match&&!started){
    started=true;const origin=match[0];
    fs.writeFileSync('/app/public-endpoint.json',JSON.stringify({origin,expiresAt:new Date(deadline).toISOString()}));
    game=spawn(process.execPath,['/app/tee-vm-gateway.mjs'],{cwd:'/app',env:{PATH:process.env.PATH,VA_DEMO_PUBLIC_URL:origin,VT_DEMO_EXPIRES_AT:new Date(deadline).toISOString(),PORT:'8080'},stdio:'ignore'});
    game.on('exit',stop);game.on('error',stop);
    console.log(JSON.stringify({publicURL:origin,expiresAt:new Date(deadline).toISOString()}));
  }
};
tunnel.stdout.on('data',observe);tunnel.stderr.on('data',observe);tunnel.on('error',stop);tunnel.on('exit',stop);
setTimeout(()=>{if(!started)stop();},20000).unref();
setTimeout(stop,deadline-Date.now());process.on('SIGINT',stop);process.on('SIGTERM',stop);
