import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
// Only reviewed bundled SDK games. Candidates and external runtimes cannot enter this path.
const allowed=new Set(['community-grove','chat-vs-streamer','demo']);
export function fallbackOrder(order=[]){
 if(!Array.isArray(order)||order.length>4||order.some(id=>typeof id!=='string'||id!=='marble-race'&&!allowed.has(id))||new Set(order).size!==order.length)throw Error('Choose unique bundled game IDs for fallback.');
 return [...order.filter(id=>id!=='marble-race'),'marble-race'];
}
export class FallbackPolicy {
 constructor(file,{enabled=false,order=[]}={}){this.file=file;this.enabled=enabled===true;this.order=fallbackOrder(order);if(this.enabled&&fs.existsSync(file)){const saved=JSON.parse(fs.readFileSync(file,'utf8'));if(saved.version!==1)throw Error('Invalid fallback preference version');this.order=fallbackOrder(saved.order);}}
 get effective(){return this.enabled?[...this.order]:['marble-race'];}
 set(order){
  if(!this.enabled)throw Error('Configurable fallback is disabled.');const next=fallbackOrder(order),temp=this.file+'.'+crypto.randomUUID()+'.tmp';fs.mkdirSync(path.dirname(this.file),{recursive:true});
  try{fs.writeFileSync(temp,JSON.stringify({version:1,order:next})+'\n',{mode:0o600,flag:'wx'});fs.renameSync(temp,this.file);this.order=next;}finally{if(fs.existsSync(temp))fs.unlinkSync(temp);}
  return this.effective;
 }
}
