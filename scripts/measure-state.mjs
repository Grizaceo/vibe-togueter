// Local synthetic traffic comparison. Only reviewed bundled games; no live services.
import {GameHost} from '../src/gamehost.js';
import {encodeMessage,stateIntervalMs} from '../src/traffic.js';
const STATE_INTERVAL_MS=stateIntervalMs({tickRate:30});
import {deflateRawSync,constants} from 'node:zlib';
import fs from 'node:fs';
const results=[];
for(const id of ['marble-race','chat-vs-streamer','community-grove']){
 const h=new GameHost({gameDir:'games/'+id});if(!await h.load())throw Error(h.error);
 const players=Array.from({length:20},(_,i)=>({id:i+1,name:'web-'+i}));for(const p of players)h.safeCall('onJoin',p);
 for(let i=0;i<20;i++)h.safeCall('onChat',{name:'chat-'+i,source:'twitch'},'play',[]);
 const envelope=()=>({t:'state',view:h.getView(),players,game:{name:h.game.name,desc:h.game.meta.description||'',versionSha256:h.game.versionSha256},error:h.error,fund:{balance:0,goal:.25,generating:false}});
 const initial=envelope(),oldBytes=Buffer.byteLength(JSON.stringify(initial));
 if(id==='marble-race')h.safeCall('onChat',{name:'chat-0',source:'twitch'},'race',[]);
 if(id==='chat-vs-streamer')for(let i=0;i<20;i++)h.safeCall('onChat',{name:'chat-'+i,source:'twitch'},'left',[]);
 if(id==='community-grove')for(let i=0;i<6;i++)h.safeCall('onChat',{name:'chat-'+i,source:'twitch'},'plant',[String(i+1)]);
 let before=0,after=0,compressed=0;const frames=100;
 for(let n=0;n<frames;n++){
  for(let k=0;k<3;k++)h.safeCall('tick',1/30);
  const state=envelope(),old=JSON.stringify(state),next=encodeMessage(state);
  before+=Buffer.byteLength(old);after+=Buffer.byteLength(next);
  compressed+=deflateRawSync(next,{level:3,flush:constants.Z_SYNC_FLUSH,finishFlush:constants.Z_SYNC_FLUSH}).length-4;
 }
 const avg={before:before/frames,after:after/frames,deflated:compressed/frames};
 results.push({id,initialBaselineBytes:oldBytes,samples:frames,meanFrameBytes:avg,GBPerClientHour:{before:avg.before*1000/66*3600/1e9,afterUncompressed:avg.after*1000/STATE_INTERVAL_MS*3600/1e9,afterDeflated:avg.deflated*1000/STATE_INTERVAL_MS*3600/1e9},deflatedReductionPercent:100*(1-(avg.deflated/STATE_INTERVAL_MS)/(avg.before/66))});h.stop();
}
const report={at:new Date().toISOString(),kind:'local-synthetic-serialized-state-comparison',node:process.version,webPlayers:20,chatActors:20,baselineIntervalMs:66,newIntervalMs:STATE_INTERVAL_MS,deflate:{level:3,serverNoContextTakeover:true},results,limits:['Includes the state envelope and the same seeded actors in both paths.','Deflate payload estimate excludes WebSocket framing/TLS, handshake, credits/feed messages and ingress.','Clients that do not negotiate permessage-deflate receive the reported uncompressed path.','This is not measured provider egress or a cost forecast.']};
if(process.argv[2])fs.writeFileSync(process.argv[2],JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
