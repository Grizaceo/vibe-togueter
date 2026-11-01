// Local operator helper: credential stays in .env, never in shell command arguments.
import {loadEnv} from '../src/auth/twitch.js';
loadEnv();
const [command,value]=process.argv.slice(2);
const endpoints={load:['/admin/load',{game:value}],status:['/admin/status'],fund:['/admin/fund',{amountUsd:Number(value),source:'manual-rehearsal'}],chat:['/admin/chat',{user:'operator',text:value}]};
try{
 if(!Object.hasOwn(endpoints,command))throw new Error('Usage: node scripts/arena-admin.mjs load GAME | status | fund USD | chat "!command"');
 const [endpoint,body]=endpoints[command];const headers={'Content-Type':'application/json'};if(process.env.VA_ADMIN_TOKEN)headers.Authorization='Bearer '+process.env.VA_ADMIN_TOKEN;
 const response=await fetch((process.env.VA_ARENA_URL||'http://localhost:8420')+endpoint,{method:body?'POST':'GET',headers,body:body?JSON.stringify(body):undefined});
 if(!response.ok)throw new Error(`Admin HTTP ${response.status}`);console.log(await response.text());
}catch(e){console.error(e.message);process.exitCode=1;}
