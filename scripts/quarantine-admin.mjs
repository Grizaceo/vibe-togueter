// Local owner handoff. Credentials come from protected configuration, never arguments.
// Requests are JSON data files; candidate code is never executed by this helper.
import fs from 'node:fs';
import {loadEnv} from '../src/auth/twitch.js';
loadEnv();
const args=process.argv.slice(2);
const [input,option,output]=args;
try {
  if(!input || (args.length!==1&&args.length!==3) || (args.length===3&&(option!=='--save-review'||!output))) throw Error('Usage: node scripts/quarantine-admin.mjs list|REQUEST.json [--save-review NEW_FILE.json]');
  const base=new URL(process.env.VA_ARENA_URL||'http://localhost:8420');
  if(base.protocol!=='http:' || !['localhost','127.0.0.1','[::1]'].includes(base.hostname) || base.username || base.password) throw Error('Quarantine administration requires a local HTTP origin.');
  if(!process.env.VA_STREAMER_KEY)throw Error('Set the streamer confirmation key in protected configuration.');
  let body;
  if(input!=='list') {
    const bytes=fs.readFileSync(input);if(bytes.length>262144)throw Error('Request exceeds 256 KiB.');
    body=JSON.stringify(JSON.parse(bytes));
  }
  const response=await fetch(new URL('/admin/build-quarantine',base),{
    method:body?'POST':'GET',redirect:'error',signal:AbortSignal.timeout(10000),
    headers:{'Content-Type':'application/json','x-streamer-key':process.env.VA_STREAMER_KEY,...(process.env.VA_ADMIN_TOKEN?{Authorization:'Bearer '+process.env.VA_ADMIN_TOKEN}:{})},body,
  });
  if(!response.ok)throw Error('Quarantine request rejected: HTTP '+response.status);
  const data=await response.json();
  if(option==='--save-review') {
    // Exclusive creation prevents accidental replacement of source/configuration files.
    fs.writeFileSync(output,JSON.stringify(data,null,2)+'\n',{flag:'wx',mode:0o600});
    console.log(JSON.stringify({saved:true}));
  } else {
    const omitSource=(key,value)=>key==='source'?undefined:value;
    console.log(JSON.stringify(data,omitSource,2));
  }
} catch(error) {
  // Do not echo request bytes, provider responses or credential-bearing URLs.
  console.error(error.code==='EEXIST'?'Review file exists; choose a new path.':error.message.startsWith('Quarantine')||error.message.startsWith('Usage:')||error.message.startsWith('Request exceeds')||error.message.startsWith('Set the')?error.message:'Quarantine helper failed; inspect local configuration and request file.');
  process.exitCode=1;
}
