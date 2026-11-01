// Linux-only local runtime for reviewed SDK games. Candidate builds still require separate VMs.
import {spawn} from 'node:child_process';
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const src=path.dirname(fileURLToPath(import.meta.url));
const empty=()=>({bg:'#111',world:{w:1280,h:720},layers:[],hud:[]});
export class IsolatedGameHost {
 constructor({gameDir,onEvent=()=>{}}){Object.assign(this,{gameDir,onEvent,game:null,error:null,view:empty(),running:false,sandbox:'linux-namespaces'});}
 async load(){
  this._kill();this.error=null;this.game=null;this.view=empty();
  let source;
  try{const file=path.join(this.gameDir,'game.js');if(fs.statSync(file).size>262144)throw Error('Game source exceeds 256 KiB.');source=fs.readFileSync(file,'utf8');}
  catch(error){this.error=error.message;this.onEvent('game-error',this.error);return false;}
  if(process.platform!=='linux'){this.error='Linux bubblewrap is required; no in-process fallback.';this.onEvent('game-error',this.error);return false;}
  const expectedHash=crypto.createHash('sha256').update(source).digest('hex');
  return new Promise(resolve=>{
   let settled=false,buffer='';const done=ok=>{if(!settled){settled=true;clearTimeout(this._loadTimer);this._pendingLoad=null;resolve(ok);}};this._pendingLoad=done;
   const child=spawn('bwrap',[
    '--unshare-all','--die-with-parent','--new-session','--cap-drop','ALL',
    '--ro-bind','/usr','/usr','--symlink','usr/lib','/lib','--symlink','usr/lib64','/lib64',
    '--proc','/proc','--dev','/dev','--tmpfs','/tmp','--ro-bind',src,'/app','--chdir','/tmp',
    '/usr/bin/node','--permission','--allow-fs-read=/app','--max-old-space-size=96','--experimental-vm-modules','/app/game-worker.js'
   ],{env:{PATH:'/usr/bin',HOME:'/tmp',LANG:'C.UTF-8'},stdio:['pipe','pipe','pipe']});
   this.child=child;this.pid=child.pid;this.lastFrame=Date.now();
   const fail=message=>{if(this.child!==child)return;this.error=message;this._kill();done(false);this.onEvent('game-error',message);};
   this._loadTimer=setTimeout(()=>fail('Game load watchdog timeout.'),2500);
   child.on('error',error=>fail('Cannot start isolated runtime: '+error.message));
   child.stdin.on('error',()=>fail('Game input pipe closed.'));
   // Do not forward raw worker stderr; it can contain candidate-controlled content.
   child.stderr.resume();child.stdout.setEncoding('utf8');
   child.on('exit',(code,signal)=>fail(`Game process exited (${signal||code}).`));
   child.stdout.on('data',chunk=>{
    if(this.child!==child)return;
    buffer+=chunk.toString();if(buffer.length>1200000)return fail('Game output exceeds IPC limit.');
    let end;
    while((end=buffer.indexOf('\n'))>=0){
     const line=buffer.slice(0,end);buffer=buffer.slice(end+1);
     try{
      const msg=JSON.parse(line);
      if(msg.t==='failure')return fail('Game failure: '+msg.error);
      if(msg.t==='ready'){if(msg.game?.versionSha256!==expectedHash)return fail('Guest version mismatch.');this.game=msg.game;this.view=msg.view;done(true);}
      else if(msg.t==='frame'){this.view=msg.view;this.lastFrame=Date.now();}
      else return fail('Invalid game IPC response.');
     }catch{return fail('Invalid game IPC JSON.');}
    }
   });
   this._write({op:'load',source});
  });
 }
 _write(msg){
  if(!this.child||this.child.stdin.destroyed)return;
  if(this.child.stdin.writableLength>262144){this.error='Game input backpressure.';this._kill();this.onEvent('game-error',this.error);return;}
  this.child.stdin.write(JSON.stringify(msg)+'\n');
 }
 start(){
  if(!this.child||this.error)return;this.running=true;this.lastFrame=Date.now();this._write({op:'start'});
  clearInterval(this._watchdog);this._watchdog=setInterval(()=>{if(Date.now()-this.lastFrame>1000){this.error='Game frame watchdog timeout.';this._kill();this.onEvent('game-error',this.error);}},100);
 }
 safeCall(fn,...args){if(this.game?.exports.includes(fn)&&!this.error)this._write({op:'call',fn,args});}
 getView(){return this.view;}
 startWatching(){
  this._watcher?.close();try{this._watcher=fs.watch(this.gameDir,()=>{clearTimeout(this._debounce);this._debounce=setTimeout(async()=>{const ok=await this.load();if(ok){this.start();this.onEvent('game-reloaded',null);}},150);});this._watcher.on('error',error=>{this.error='Game watcher failed: '+error.message;this.onEvent('game-error',this.error);});}catch(error){this.error='Game watcher failed: '+error.message;this.onEvent('game-error',this.error);}
 }
 _kill(){const pending=this._pendingLoad;this._pendingLoad=null;pending?.(false);clearTimeout(this._loadTimer);clearInterval(this._watchdog);const child=this.child;this.child=null;this.running=false;child?.kill('SIGKILL');}
 stop(){this._kill();this._watcher?.close();clearTimeout(this._debounce);}
}
