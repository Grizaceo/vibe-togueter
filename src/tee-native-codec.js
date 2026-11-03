import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {teeInput,teeJoin} from './tee-protocol.js';
export const TEE_LOCAL_CONTRACT = 'teeworlds-rs/172cfef';
// Private local helper: no shell, credentials, game execution or public API.
export async function nativeTeeCodec(executable) {
  const child=spawn(executable,[],{stdio:['pipe','pipe','ignore']});
  const pending=[];
  let readyResolve, readyReject, ready=false, closed=false;
  const gate=new Promise((resolve,reject)=>{readyResolve=resolve;readyReject=reject;});
  const fail=()=>{
    closed=true;
    readyReject(Error('Native codec stopped or incompatible contract.'));
    for(const p of pending.splice(0)){clearTimeout(p.timer);p.reject(Error('Native codec unavailable.'));}
  };
  child.on('error',fail);child.on('exit',fail);
  child.stdin.on('error',fail);
  const timer=setTimeout(()=>{fail();child.kill();},5000);
  createInterface({input:child.stdout}).on('line',line=>{
    try {
      if(line.length>2097152)throw Error('Codec output limit');
      const value=JSON.parse(line);
      if(!ready){
        if(Object.keys(value).sort().join(',')!=='capabilities,schema,version'||value.version!==1||value.schema!==TEE_LOCAL_CONTRACT||JSON.stringify(value.capabilities)!==JSON.stringify(['collective-tee','bounded-input','authoritative-position']))throw Error('Unknown codec contract');
        ready=true;readyResolve();return;
      }
      const p=pending.shift();if(!p)throw Error('Unsolicited codec reply');
      clearTimeout(p.timer);
      if(Object.keys(value).length!==1||(!value.ok&&!value.error)){p.reject(Error('Unknown codec fields'));throw Error('Unknown codec fields');}
      value.error?p.reject(Error('Incompatible protocol: '+value.error)):p.resolve(value.ok);
    }catch{fail();child.kill();}
  });
  try{await gate;}catch(error){child.kill();throw error;}finally{clearTimeout(timer);}
  return {
    version:TEE_LOCAL_CONTRACT,
    join:teeJoin,
    // New fields from pinned Input: dash=false, parry=false, glide=0.
    input:(seq,input)=>Buffer.concat([teeInput(seq,input),Buffer.from([0,0,0])]),
    decode(bytes){
      if(closed||pending.length>=64||bytes.length>1048576)return Promise.reject(Error('Codec admission limit'));
      return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{fail();child.kill();},5000);pending.push({resolve,reject,timer});child.stdin.write(Buffer.from(bytes).toString('hex')+'\n');});
    },
    close(){fail();child.kill();},
  };
}
