// Port of Twitch Shorts Live's local OAuth lifecycle; no tokens in logs or URLs.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';

export const CHAT_SCOPES = ['chat:read', 'chat:edit'];
export const EVENT_SCOPES = ['channel:read:subscriptions', 'bits:read', 'channel:read:redemptions'];
export function readEnv(file = '.env') {
  if (!fs.existsSync(file)) return {};
  fs.chmodSync(file, 0o600);
  const values = {};
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][\w]*)\s*=\s*(.*?)\s*$/);
    if (!match) continue;
    let value = match[2];
    if (value.startsWith('"')) { try { value = JSON.parse(value); } catch { throw new Error('Invalid quoted .env value.'); } }
    else if (value.startsWith("'") && value.endsWith("'")) value = value.slice(1,-1);
    else value = value.replace(/\s+#.*$/, '');
    values[match[1]] = value;
  }
  return values;
}
export function loadEnv(file = '.env') {
  const values = readEnv(file);
  for (const [key,value] of Object.entries(values)) if (process.env[key] === undefined) process.env[key] = value;
  return values;
}
export class TwitchAuth {
  constructor({ file = '.env', env = process.env, fetchImpl = fetch, now = Date.now } = {}) {
    this.file = path.resolve(file); this.values = {...readEnv(file), ...env};
    this.fetch = fetchImpl; this.now = now; this.checkedAt = null; this.info = null; this.refreshing = null;
  }
  require(key) { const value=this.values[key]; if (!value) throw new Error(`Missing ${key}; run npm run twitch:auth.`); return value; }
  get token() { return (this.values.VA_TWITCH_ACCESS_TOKEN || this.values.VA_TWITCH_OAUTH || '').replace(/^oauth:/,''); }
  save(values) {
    const merged={...readEnv(this.file),...values};
    fs.mkdirSync(path.dirname(this.file),{recursive:true});
    const temp=this.file+'.'+crypto.randomBytes(8).toString('hex')+'.tmp';
    try {
      fs.writeFileSync(temp,Object.entries(merged).map(([k,v])=>`${k}=${JSON.stringify(v)}\n`).join(''),{mode:0o600,flag:'wx'});
      fs.renameSync(temp,this.file);fs.chmodSync(this.file,0o600);
    } finally { if(fs.existsSync(temp))fs.unlinkSync(temp); }
    Object.assign(this.values,values);
  }
  async request(url,options={}) {
    try { return await this.fetch(url,{...options,signal:AbortSignal.timeout(30000)}); }
    catch { throw new Error('Twitch network request failed; retry later.'); }
  }
  async storeTokens(response) {
    if(!response.ok) throw new Error('Twitch authorization failed; authorize again.');
    const data=await response.json();
    if(!data.access_token || !data.refresh_token) throw new Error('Twitch did not return required tokens.');
    this.save({VA_TWITCH_ACCESS_TOKEN:data.access_token,VA_TWITCH_REFRESH_TOKEN:data.refresh_token,VA_TWITCH_OAUTH:''});
    this.checkedAt=null;
  }
  async refresh() {
    if(this.refreshing)return this.refreshing;
    this.refreshing=(async()=>{
      const body=new URLSearchParams({grant_type:'refresh_token',refresh_token:this.require('VA_TWITCH_REFRESH_TOKEN'),client_id:this.require('VA_TWITCH_CLIENT_ID'),client_secret:this.require('VA_TWITCH_CLIENT_SECRET')});
      await this.storeTokens(await this.request('https://id.twitch.tv/oauth2/token',{method:'POST',body}));
    })();
    try { await this.refreshing; } finally { this.refreshing=null; }
  }
  async validate({force=false, scopes=CHAT_SCOPES}={}) {
    if(!force && this.checkedAt!==null && this.now()-this.checkedAt<3500000 && scopes.every(s=>this.info?.scopes.includes(s)))return this.info;
    if(!this.token)throw new Error('Missing Twitch access token; run npm run twitch:auth.');
    for(let attempt=0;attempt<2;attempt++) {
      const response=await this.request('https://id.twitch.tv/oauth2/validate',{headers:{Authorization:'OAuth '+this.token}});
      if(response.status===401 && attempt===0 && this.values.VA_TWITCH_REFRESH_TOKEN){await this.refresh();continue;}
      if(!response.ok)throw new Error('Twitch token validation failed; authorize again.');
      const info=await response.json();
      if(info.client_id!==this.require('VA_TWITCH_CLIENT_ID'))throw new Error('Twitch token belongs to another application.');
      if(!info.login || !scopes.every(s=>info.scopes?.includes(s)))throw new Error('Missing required Twitch scopes; authorize again.');
      this.info=info;this.checkedAt=this.now();return info;
    }
  }
  async helix(endpoint,{method='GET',body}={}) {
    await this.validate();
    for(let attempt=0;attempt<2;attempt++) {
      const response=await this.request('https://api.twitch.tv/helix/'+endpoint,{method,headers:{Authorization:'Bearer '+this.token,'Client-Id':this.require('VA_TWITCH_CLIENT_ID'),'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
      if(response.status===401 && attempt===0){await this.refresh();continue;}
      if(!response.ok)throw new Error(`Twitch API returned HTTP ${response.status}.`);
      return response.status===204?{}:response.json();
    }
  }
  async appToken() {
    const body=new URLSearchParams({grant_type:'client_credentials',client_id:this.require('VA_TWITCH_CLIENT_ID'),client_secret:this.require('VA_TWITCH_CLIENT_SECRET')});
    const r=await this.request('https://id.twitch.tv/oauth2/token',{method:'POST',body});
    if(!r.ok)throw new Error('Twitch app token request failed.');
    const data=await r.json();if(!data.access_token)throw new Error('Missing app access token.');return data.access_token;
  }
}
export async function authorize(auth,{events=false, timeoutMs=600000, onUrl=console.log}={}) {
  const redirect=auth.values.VA_TWITCH_REDIRECT_URI || 'http://localhost:3000/callback';
  const uri=new URL(redirect);
  if(uri.protocol!=='http:' || uri.hostname!=='localhost' || uri.search || uri.hash || uri.username || uri.password)throw new Error('Use an exact registered http://localhost:PORT/callback redirect.');
  auth.require('VA_TWITCH_CLIENT_SECRET');
  const state=crypto.randomBytes(32).toString('hex');
  let finish;
  const received=new Promise((resolve,reject)=>{finish={resolve,reject};});
  const server=http.createServer((req,res)=>{
    const url=new URL(req.url,'http://localhost');const supplied=url.searchParams.get('state')||'';
    if(url.pathname!==uri.pathname || Buffer.byteLength(supplied)!==Buffer.byteLength(state) || !crypto.timingSafeEqual(Buffer.from(supplied),Buffer.from(state))){res.writeHead(400);res.end('Invalid OAuth callback.');return;}
    res.writeHead(200,{'Content-Type':'text/plain','Cache-Control':'no-store'});res.end('Authorization received. Return to the terminal.');
    const code=url.searchParams.get('code');if(code)finish.resolve(code);else finish.reject(new Error('Authorization declined.'));
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(Number(uri.port)||80,'127.0.0.1',resolve);});
  const timer=setTimeout(()=>finish.reject(new Error('Authorization timed out.')),timeoutMs);
  const scopes=[...CHAT_SCOPES,...events?EVENT_SCOPES:[]];
  const url=new URL('https://id.twitch.tv/oauth2/authorize');url.search=new URLSearchParams({client_id:auth.require('VA_TWITCH_CLIENT_ID'),redirect_uri:redirect,response_type:'code',scope:scopes.join(' '),state});
  let code;
  try { onUrl(url.toString());code=await received; } finally {clearTimeout(timer);server.closeAllConnections();await new Promise(r=>server.close(r));}
  const body=new URLSearchParams({client_id:auth.require('VA_TWITCH_CLIENT_ID'),client_secret:auth.require('VA_TWITCH_CLIENT_SECRET'),code,grant_type:'authorization_code',redirect_uri:redirect});
  await auth.storeTokens(await auth.request('https://id.twitch.tv/oauth2/token',{method:'POST',body}));
  const info=await auth.validate({force:true,scopes});
  console.log(`Connected as ${info.login}; credentials saved mode 600.`);
  return info;
}
if(process.argv[1] && import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href) {
  const i=process.argv.indexOf('--env-file');const auth=new TwitchAuth({file:i>=0?process.argv[i+1]:'.env'});
  try {
    if(process.argv.includes('--status')){const info=await auth.validate({force:true});console.log(JSON.stringify({login:info.login,scopes:info.scopes,expires_in:info.expires_in}));}
    else await authorize(auth,{events:process.argv.includes('--events')});
  } catch(e){console.error(e.message);process.exitCode=1;}
}
