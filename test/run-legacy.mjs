// Tests run against temporary ledgers/games and private mock LLM, never owner runtime.
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import net from 'node:net';import crypto from 'node:crypto';import {spawn} from 'node:child_process';
const root=path.resolve(new URL('..',import.meta.url).pathname),temp=fs.mkdtempSync(path.join(os.tmpdir(),'va-check-'));
for(const name of ['src','public','games','templates','test','package.json','vibe-arena.config.json'])fs.cpSync(path.join(root,name),path.join(temp,name),{recursive:true,filter:p=>!p.includes('/auto-')});
fs.symlinkSync(path.join(root,'node_modules'),path.join(temp,'node_modules'),'dir');
const freePort=()=>new Promise(r=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>r(p));});});
const port=await freePort(),mockPort=await freePort();
const keys=crypto.generateKeyPairSync('rsa',{modulusLength:2048});const privateFile=path.join(temp,'kick-private.pem');fs.writeFileSync(privateFile,keys.privateKey.export({type:'pkcs8',format:'pem'}),{mode:0o600});
const env={...process.env,VA_ARENA_URL:`http://127.0.0.1:${port}`,VA_BASE_URL:`http://127.0.0.1:${mockPort}/v1`,VA_MOCK_PORT:String(mockPort),VA_MODEL:'local',VA_KICK_PUBKEY:keys.publicKey.export({type:'spki',format:'pem'}),VA_TEST_KICK_PRIVATE_KEY:privateFile,VA_ADMIN_TOKEN:'',VA_EVENTSUB_SECRET:'',VA_WEBHOOK_SECRET:'',VA_PUBLIC_URL:'',VA_STREAMER_KEY:'test-streamer-key'};
let logs='';const start=args=>{const p=spawn(process.execPath,args,{cwd:temp,env,stdio:['ignore','pipe','pipe']});p.stdout.on('data',b=>logs+=b);p.stderr.on('data',b=>logs+=b);return p;};
const mock=start(['test/mock-llm.mjs']),server=start(['--experimental-vm-modules','src/server.js','--port',String(port)]);
const results=[];
try{
 let ready=false;for(let i=0;i<100;i++){try{if((await fetch(env.VA_ARENA_URL+'/admin/status')).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,50));}
 if(!ready)throw new Error('Test server failed: '+logs);
 for(const file of ['e2e','monetization','mcp','platforms','integration']){
  const child=spawn(process.execPath,['--experimental-vm-modules',`test/${file}.mjs`],{cwd:temp,env,stdio:['ignore','pipe','pipe']});let output='';child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>output+=b);
  const code=await new Promise(r=>child.on('exit',r));process.stdout.write(output);
  const failures=(output.match(/^FAIL\b/gm)||[]).length;results.push({file,exit:code,failures,passes:(output.match(/^PASS\b/gm)||[]).length});
  if(code!==0||failures)throw new Error(`Failed ${file}; exit ${code}, FAIL lines ${failures}`);
 }
 console.log('ISOLATED SUITE '+JSON.stringify({temp,results}));
}catch(e){console.error(e.message);process.exitCode=1;}finally{server.kill('SIGTERM');mock.kill('SIGTERM');}
