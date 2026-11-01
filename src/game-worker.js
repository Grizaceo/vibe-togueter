// Runs only inside the namespace guest. JSON lines are the complete controller protocol.
import readline from 'node:readline';
import {GameHost} from './gamehost.js';
let host,frames;
function emit(value){const line=JSON.stringify(value);if(line.length>600000||!process.stdout.write(line+'\n'))process.exit(2);}
function fatal(error){emit({t:'failure',error:String(error).slice(0,500)});process.exit(1);}
process.on('uncaughtException',error=>fatal(error.message));
const lines=readline.createInterface({input:process.stdin});
lines.on('line',async line=>{
 try{
  if(line.length>300000)throw Error('Input exceeds limit.');
  const msg=JSON.parse(line);
  if(msg.op==='load'){
   host=new GameHost({gameDir:'guest',onEvent:(kind,detail)=>{if(kind==='game-error')fatal(detail);}});
   if(!await host.loadSource(msg.source))return fatal(host.error);
   const view=host.getView();if(host.error)return fatal(host.error);
   emit({t:'ready',game:{name:host.game.name,meta:host.game.meta,exports:host.game.exports,versionSha256:host.game.versionSha256},view});
  }else if(msg.op==='start'){
   host.start();clearInterval(frames);frames=setInterval(()=>emit({t:'frame',view:host.getView()}),33);
  }else if(msg.op==='call')host.safeCall(msg.fn,...msg.args);
  else throw Error('Unknown guest operation.');
 }catch(error){fatal(error.message);}
});
process.stdin.on('end',()=>process.exit());
