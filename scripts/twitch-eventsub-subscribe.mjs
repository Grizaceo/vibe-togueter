// Webhook subscriptions require an APP token after broadcaster user-scope consent.
import fs from 'node:fs';import path from 'node:path';import {pathToFileURL} from 'node:url';
import {TwitchAuth,loadEnv,CHAT_SCOPES,EVENT_SCOPES} from '../src/auth/twitch.js';
export const TYPES=['channel.subscribe','channel.bits.use'];
export function subscriptionBody(type,broadcaster,callback,secret){
 const url=new URL(callback);if(url.protocol!=='https:' || (url.port && url.port!=='443') || url.username || url.password)throw new Error('Webhook must use HTTPS port 443.');
 if(!/^[a-zA-Z0-9]{10,100}$/.test(secret) || secret.startsWith('cambia-'))throw new Error('Set a private 10–100 alphanumeric character eventsub secret.');
 return {type,version:'1',condition:{broadcaster_user_id:broadcaster},transport:{method:'webhook',callback:url.toString(),secret}};
}
export async function subscribe({auth,callback,secret,points=false,list=false,fetchImpl=fetch}){
 const info=await auth.validate({force:true,scopes:list?CHAT_SCOPES:[...CHAT_SCOPES,...EVENT_SCOPES.filter(s=>points||s!=='channel:read:redemptions')]});
 const token=await auth.appToken();
 const request=async(method,endpoint,body)=>{
  const r=await fetchImpl('https://api.twitch.tv/helix/eventsub/subscriptions'+endpoint,{method,headers:{Authorization:'Bearer '+token,'Client-Id':auth.require('VA_TWITCH_CLIENT_ID'),'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(30000)});
  if(r.status===409)return {data:[],already_exists:true};if(!r.ok)throw new Error(`EventSub HTTP ${r.status}; check broadcaster eligibility and granted scopes.`);return r.json();
 };
 if(list){const data=await request('GET','');return data.data.map(s=>({id:s.id,type:s.type,status:s.status,callback:s.transport.callback}));}
 const results=[];
 for(const type of [...TYPES,...points?['channel.channel_points_custom_reward_redemption.add']:[]]){
  const data=await request('POST','',subscriptionBody(type,info.user_id,callback,secret));
  results.push({type,already_exists:!!data.already_exists,subscriptions:(data.data||[]).map(s=>({id:s.id,status:s.status}))});
 }
 return results;
}
if(process.argv[1] && import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
 const args=process.argv.slice(2);const arg=(key,defaultValue)=>{const i=args.indexOf('--'+key);return i<0?defaultValue:args[i+1];};
 try{
  const file=arg('env-file','.env');loadEnv(file);const config=JSON.parse(fs.readFileSync('vibe-arena.config.json','utf8'));
  const base=process.env.VA_PUBLIC_URL||config.publicUrl;
  const callback=arg('callback',base?new URL('/webhook/twitch',base).toString():null);
  if(!callback && !args.includes('--list'))throw new Error('Set VA_PUBLIC_URL or --callback.');
  console.log(JSON.stringify(await subscribe({auth:new TwitchAuth({file}),callback,secret:process.env.VA_EVENTSUB_SECRET||config.monetization.eventsubSecret,points:args.includes('--points'),list:args.includes('--list')}),null,2));
 }catch(e){console.error(e.message);process.exitCode=1;}
}
