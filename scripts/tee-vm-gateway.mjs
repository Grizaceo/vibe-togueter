// Public game-entry trial only. No platform admin, credentials or Twitch connection.
import fs from 'node:fs';
import http from 'node:http';
import {spawn} from 'node:child_process';
import {WebSocket,WebSocketServer} from 'ws';
export function createGateway({origin,upstream='http://127.0.0.1:8303',manifest,publicDir='public'}) {
  const canonical=new URL(origin);
  if(canonical.protocol!=='https:'||canonical.username||canonical.password||canonical.search||canonical.hash||canonical.pathname!=='/')throw Error('Use a canonical HTTPS trial URL');
  if(manifest.contractVersion!==1||manifest.schema!=='teeworlds-rs/172cfef')throw Error('Unknown game contract');
  const game={id:'tee-vm',adapter:'tee',title:'teeworlds-rs · external owner game',baseURL:canonical.origin,playPath:'/game',joinByDefault:true};
  const wsServer=new WebSocketServer({noServer:true,maxPayload:16384,perMessageDeflate:false});
  const sockets=new Set();
  const server=http.createServer(async(req,res)=>{
    res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
    const url=new URL(req.url,'http://gateway.invalid');
    if(req.method!=='GET'){res.writeHead(403);res.end('Read-only game entry');return;}
    if(url.pathname==='/admin'||url.pathname.startsWith('/admin/')||url.pathname.startsWith('/api/')){res.writeHead(403);res.end('Private administration');return;}
    if(url.pathname==='/healthz'){
      let up=false;
      try{const r=await fetch(upstream+'/healthz',{signal:AbortSignal.timeout(1500),redirect:'error'});up=r.ok&&(await r.text())==='ok';}catch{}
      res.writeHead(up?200:503,{'Content-Type':'application/json'});res.end(JSON.stringify({data:{up},contractVersion:1,schema:manifest.schema}));return;
    }
    if(url.pathname==='/trial-manifest.json'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify(manifest));return;}
    if(url.pathname==='/community/games'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({games:[game]}));return;}
    if(url.pathname==='/'){res.writeHead(302,{Location:'/tee-play.html?'+new URLSearchParams({game:game.id,name:url.searchParams.get('name')||'viewer'})});res.end();return;}
    if(['/tee-play.html','/tee-play.js'].includes(url.pathname)){
      res.setHeader('Content-Type',url.pathname.endsWith('.js')?'application/javascript':'text/html; charset=utf-8');res.end(fs.readFileSync(publicDir+url.pathname));return;
    }
    const target={'/game':'/','/mq_js_bundle.js':'/mq_js_bundle.js','/teeworlds_rs.wasm':'/teeworlds_rs.wasm'}[url.pathname];
    if(!target){res.writeHead(404);res.end();return;}
    try{
      const response=await fetch(upstream+target,{signal:AbortSignal.timeout(5000),redirect:'error'});
      if(!response.ok)throw Error('upstream');
      const bytes=Buffer.from(await response.arrayBuffer());if(bytes.length>16777216)throw Error('asset limit');
      res.writeHead(200,{'Content-Type':target==='/'?'text/html; charset=utf-8':target.endsWith('.wasm')?'application/wasm':'application/javascript'});res.end(bytes);
    }catch{res.writeHead(502);res.end('Game unavailable');}
  });
  server.on('upgrade',(req,socket,head)=>{
    const url=new URL(req.url,'http://gateway.invalid');
    if(url.pathname!=='/ws'||url.search||sockets.size>=16||req.headers.origin&&req.headers.origin!==canonical.origin){socket.end('HTTP/1.1 403 Forbidden\r\n\r\n');return;}
    wsServer.handleUpgrade(req,socket,head,client=>{
      sockets.add(client);
      const remote=new WebSocket(upstream.replace('http:','ws:')+'/ws',{maxPayload:1048576,handshakeTimeout:3000,perMessageDeflate:false});
      const queued=[];
      let closed=false;
      const close=()=>{if(closed)return;closed=true;sockets.delete(client);client.terminate();remote.terminate();};
      client.on('error',close);remote.on('error',close);client.on('close',close);remote.on('close',close);
      remote.on('open',()=>{for(const bytes of queued)remote.send(bytes);queued.length=0;});
      client.on('message',(bytes,binary)=>{
        if(!binary||bytes.length>16384||remote.bufferedAmount>65536)return close();
        if(remote.readyState===1)remote.send(bytes);else if(remote.readyState===0&&queued.length<16)queued.push(bytes);else close();
      });
      remote.on('message',(bytes,binary)=>{if(!binary||client.readyState!==1||client.bufferedAmount>262144)return close();client.send(bytes);});
    });
  });
  return {server,close:()=>{for(const ws of sockets)ws.terminate();wsServer.close();server.close();}};
}
if(process.argv[1]===new URL(import.meta.url).pathname){
  const manifest=JSON.parse(fs.readFileSync('/app/runtime-manifest.json','utf8'));
  const origin=process.env.VA_DEMO_PUBLIC_URL||'https://'+process.env.RAILWAY_PUBLIC_DOMAIN;
  if(!process.env.VA_DEMO_PUBLIC_URL&&!process.env.RAILWAY_PUBLIC_DOMAIN)throw Error('Set public Railway hostname first');
  const deadline=Date.parse(process.env.VT_DEMO_EXPIRES_AT||'');
  const seconds=Math.ceil((deadline-Date.now())/1000);
  if(!Number.isFinite(deadline)||seconds>1800)throw Error('Set finite creation-based demo deadline');
  if(seconds<=0)process.exit(0);
  const game=spawn('/app/server',[],{cwd:'/app/game',env:{PATH:process.env.PATH,PORT:'8303',VT_PUBLIC_DEMO:'1',BOTS:'0',MODE:'dm',MAP:'maps/arena11.txt'},stdio:'ignore'});
  const gateway=createGateway({origin,manifest,publicDir:'/app/public'});
  let stopping=false;
  const stop=()=>{if(stopping)return;stopping=true;gateway.close();game.kill('SIGTERM');setTimeout(()=>process.exit(0),1000).unref();};
  game.on('exit',stop);game.on('error',stop);process.on('SIGTERM',stop);process.on('SIGINT',stop);
  setTimeout(stop,seconds*1000);gateway.server.listen(Number(process.env.PORT||8080),'0.0.0.0');
}
