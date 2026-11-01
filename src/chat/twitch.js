// Stable IRC controller: validated OAuth, tagged messages, reconnect and bounded sends.
import WebSocket from 'ws';

export function parseTwitchMessage(line,channel) {
  const tags={};
  if(line.startsWith('@')){const i=line.indexOf(' ');if(i<0)return null;for(const item of line.slice(1,i).split(';')){const at=item.indexOf('=');tags[item.slice(0,at)]=item.slice(at+1);}line=line.slice(i+1);}
  const match=line.match(/^:([^ !]+)![^ ]+ PRIVMSG #([^ ]+) :(.*)$/);
  if(!match || match[2].toLowerCase()!==channel.toLowerCase())return null;
  if(tags['source-room-id'] && tags['source-room-id']!==tags['room-id'])return null;
  return {user:match[1],text:match[3],source:'twitch',messageId:tags.id,...(tags.mod==='1'?{isModerator:true}:{})};
}
export function connectTwitch(channel,onChat,{auth,oauth,nick,WebSocketImpl=WebSocket,retryMs=5000,sendIntervalMs=1600,onStatus=()=>{}}={}) {
  channel=channel.toLowerCase();if(!/^[a-z0-9_]{1,25}$/.test(channel))throw new Error('Invalid Twitch channel.');
  let ws,closed=false,retry,health,sendTimer,ready=false,activeToken='',login='',pending='';
  const queue=[],seen=new Set();
  const status=(state)=>{onStatus(state);console.log(`[twitch] ${state} #${channel}`);};
  function flush(){
    if(closed || !ready || ws?.readyState!==1){sendTimer=null;return;}
    const text=queue.shift();if(text)ws.send(`PRIVMSG #${channel} :${text}\r\n`);
    sendTimer=setTimeout(()=>{sendTimer=null;if(queue.length)flush();},sendIntervalMs);
  }
  function send(text){
    if(!ready || !(auth||oauth&&nick) || queue.length>=30)return false;
    const clean=String(text).replace(/[\r\n\0]/g,' ').slice(0,350);if(!clean)return false;
    queue.push(clean);if(!sendTimer)flush();return true;
  }
  function schedule(){if(!closed && !retry)retry=setTimeout(()=>{retry=null;open();},retryMs);}
  async function open(){
    if(closed)return;
    try{
      if(auth){const info=await auth.validate({force:true});login=info.login;activeToken=auth.token;}
      else {login=nick||`justinfan${Math.floor(Math.random()*99999)}`;activeToken=oauth?.replace(/^oauth:/,'')||'';}
    }catch{status('authorization unavailable');schedule();return;}
    if(closed)return;
    const connection=new WebSocketImpl('wss://irc-ws.chat.twitch.tv:443');ws=connection;pending='';
    connection.on('open',()=>{
      connection.send('CAP REQ :twitch.tv/tags twitch.tv/commands\r\n');
      if(activeToken)connection.send('PASS oauth:'+activeToken+'\r\n');
      connection.send('NICK '+login+'\r\n');connection.send('JOIN #'+channel+'\r\n');
    });
    connection.on('message',raw=>{
      if(connection!==ws)return;pending+=raw.toString();if(pending.length>65536){connection.close();return;}
      let index;
      while((index=pending.indexOf('\r\n'))>=0){
        const line=pending.slice(0,index);pending=pending.slice(index+2);
        if(line.startsWith('PING ')){connection.send('PONG '+line.slice(5)+'\r\n');continue;}
        if(line.includes(' 001 ')){ready=true;status(activeToken?'authenticated':'anonymous read-only');continue;}
        if(line.includes(' RECONNECT')){connection.close();continue;}
        if(line.includes('Login authentication failed')){ready=false;status('authentication rejected');connection.close();continue;}
        const message=parseTwitchMessage(line,channel);if(!message)continue;
        if(message.messageId){if(seen.has(message.messageId))continue;seen.add(message.messageId);if(seen.size>2048)seen.delete(seen.values().next().value);}
        onChat(message);
      }
    });
    connection.on('error',()=>status('connection error'));
    connection.on('close',()=>{if(connection!==ws)return;ready=false;queue.length=0;clearTimeout(sendTimer);sendTimer=null;status('disconnected');schedule();});
  }
  if(auth)health=setInterval(async()=>{
    try{if(auth.maintain)await auth.maintain();else await auth.validate({force:true});if(auth.token!==activeToken)ws?.close();}
    catch{ready=false;ws?.close();status('authorization unavailable');}
  },3500000);
  open();
  return {send,get ws(){return ws;},get authed(){return !!(auth||oauth&&nick);},get ready(){return ready;},get login(){return login;},
    close(){closed=true;ready=false;clearTimeout(retry);clearTimeout(sendTimer);clearInterval(health);queue.length=0;ws?.close();}};
}
