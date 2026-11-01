// Transport controls shared by controller and reproducible traffic probes.
export const STATE_INTERVAL_MS=100;
export const WS_COMPRESSION=Object.freeze({serverNoContextTakeover:true,clientNoContextTakeover:true,zlibDeflateOptions:{level:3},concurrencyLimit:4,threshold:1024});
function compact(value){
 if(typeof value==='number')return Number.isFinite(value)?Math.round(value*10)/10:null;
 if(Array.isArray(value))return value.map(compact);
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,compact(item)]));
 return value;
}
export function encodeMessage(msg){return JSON.stringify(msg.t==='state'?{...msg,view:compact(msg.view)}:msg);}
export function sendRoom(ws,data,{state=false}={}){
 if(ws.readyState!==1)return false;
 if(ws.bufferedAmount>1024*1024){ws.terminate();return false;}
 if(state&&ws.bufferedAmount>128*1024)return false;
 ws.send(data);return true;
}
export class ChatGate {
 constructor({now=Date.now}={}){this.now=now;this.actors=new Map();this.second=0;this.count=0;}
 accept(source,id){
  const now=this.now(),second=Math.floor(now/1000),key=source+':'+id;
  if(second!==this.second){this.second=second;this.count=0;}
  if(this.count>=30||now-(this.actors.get(key)??-Infinity)<250)return false;
  if(this.actors.size>=20000){for(const [actor,at] of this.actors)if(now-at>60000)this.actors.delete(actor);if(this.actors.size>=20000&&!this.actors.has(key))return false;}
  this.actors.set(key,now);this.count++;return true;
 }
}
