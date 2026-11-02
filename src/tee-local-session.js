// Receives only messages from the trusted Twitch transport. No outgoing chat.
export function routeTeeChat(bridge, channel, message) {
  if (message.source !== 'twitch') return false;
  const text=String(message.text).trim().toLowerCase();
  const owner=String(message.user).toLowerCase()===channel.toLowerCase();
  if (['!pause','!resume'].includes(text)) {
    if (!(owner || message.isModerator === true)) return false;
    bridge.pause(text==='!pause');return true;
  }
  const match=/^!tee (left|right|jump|hook|fire|stop)$/.exec(text);
  return !!match && bridge.command(match[1],message);
}
