// Transport controls shared by controller and reproducible traffic probes.
export const STATE_INTERVAL_MS=100;
export const WS_COMPRESSION=Object.freeze({serverNoContextTakeover:true,clientNoContextTakeover:true,zlibDeflateOptions:{level:3},concurrencyLimit:4,threshold:1024});
const primitiveTypes=new Set(['rect','circle','line','text','sprite']);
const numberKeys=['x','y','x1','y1','x2','y2','w','h','r','size','rot'];
export function approvedSpritePath(src){return typeof src==='string'&&/^\/curated\/[a-z0-9-]+\/[a-zA-Z0-9_-]+\.png$/.test(src);}
function primitive(value){
 if(!value||typeof value!=='object'||!primitiveTypes.has(value.t))return null;
 if(value.t==='sprite'&&!approvedSpritePath(value.src))return null;
 const result={t:value.t};
 for(const key of numberKeys)if(typeof value[key]==='number'&&Number.isFinite(value[key])&&Math.abs(value[key])<=1000000){const scale=key==='rot'?1000:10;result[key]=Math.round(value[key]*scale)/scale;}
 if(value.t==='circle'&&(!(result.r>=0)))return null;
 for(const key of ['color','align'])if(typeof value[key]==='string')result[key]=value[key].slice(0,128);
 if(value.t==='text')result.text=typeof value.text==='string'?value.text.slice(0,2048):typeof value.text==='number'?String(value.text):'';
 if(value.t==='sprite')result.src=value.src;
 if(typeof value.fill==='boolean')result.fill=value.fill;
 return result;
}
function compact(view){
 const list=items=>Array.isArray(items)?items.slice(0,4096).map(primitive).filter(Boolean):[];
 const dimension=(value,fallback)=>typeof value==='number'&&Number.isFinite(value)&&value>0&&value<=100000?value:fallback;
 return {bg:typeof view?.bg==='string'?view.bg.slice(0,128):'#111',world:{w:dimension(view?.world?.w,1280),h:dimension(view?.world?.h,720)},layers:list(view?.layers),hud:list(view?.hud)};
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
