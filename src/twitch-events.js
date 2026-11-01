import crypto from 'node:crypto';
export function decodeTwitchEvent(headers,raw,secret,now=Date.now()) {
  const id=headers['twitch-eventsub-message-id'],stamp=headers['twitch-eventsub-message-timestamp'];
  const type=headers['twitch-eventsub-message-type'],signature=String(headers['twitch-eventsub-message-signature']||'');
  const timestamp=Date.parse(stamp);
  if(!id || !type || !Number.isFinite(timestamp) || now-timestamp>600000 || timestamp-now>60000)return {status:403};
  const expected='sha256='+crypto.createHmac('sha256',secret).update(id+stamp+raw).digest('hex');
  if(Buffer.byteLength(signature)!==Buffer.byteLength(expected) || !crypto.timingSafeEqual(Buffer.from(signature),Buffer.from(expected)))return {status:403};
  try {const body=JSON.parse(raw);if(!body || typeof body!=='object' || Array.isArray(body))return {status:400};return {status:200,id,type,body};} catch {return {status:400};}
}
export function rewardCommand(event,mapping={}) {
  if(!Object.hasOwn(mapping,event.reward?.title||''))return null;
  const command=mapping[event.reward.title];
  if(typeof command!=='string' || /[\r\n\0]/.test(command) || !/^![a-z][a-z0-9_-]*(?:\s[^\r\n]*)?$/i.test(command) || command.length>200)return null;
  return command;
}
