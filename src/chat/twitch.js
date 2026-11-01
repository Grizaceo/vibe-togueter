// Twitch chat source via IRC over websocket.
// - Sin credenciales: anónimo justinfan — lee chat, no puede responder.
// - Con VA_TWITCH_OAUTH (token con chat:read chat:edit) + VA_TWITCH_NICK:
//   lee como el bot y puede responder (join links, acks, podios).
// El patrón OAuth (token + refresh en .env 600) ya está resuelto en
// stream-to-shorts/twitchcon-app — portarlo aquí cuando haya app real.

import WebSocket from 'ws';

export function connectTwitch(channel, onChat, { oauth, nick } = {}) {
  const ws = new WebSocket('wss://irc-ws.chat.twitch.tv:443');
  const authed = !!(oauth && nick);
  const login = authed ? nick : `justinfan${Math.floor(Math.random() * 99999)}`;
  let lastSend = 0;

  function send(text) {
    if (!authed || ws.readyState !== 1) return false;
    const wait = 1100 - (Date.now() - lastSend); // ~1 msg/s throttle
    setTimeout(() => {
      if (ws.readyState === 1) { ws.send(`PRIVMSG #${channel.toLowerCase()} :${text}\r\n`); lastSend = Date.now(); }
    }, Math.max(0, wait));
    return true;
  }

  ws.on('open', () => {
    ws.send('CAP REQ :twitch.tv/tags twitch.tv/commands\r\n');
    if (authed) ws.send(`PASS ${oauth.startsWith('oauth:') ? oauth : 'oauth:' + oauth}\r\n`);
    ws.send(`NICK ${login}\r\n`);
    ws.send(`JOIN #${channel.toLowerCase()}\r\n`);
    console.log(`[twitch] joined #${channel} (${authed ? `authed as ${login}` : 'anonymous read-only'})`);
  });

  ws.on('message', raw => {
    for (const line of raw.toString().split('\r\n')) {
      if (!line) continue;
      if (line.startsWith('PING')) { ws.send('PONG :tmi.twitch.tv\r\n'); continue; }
      if (line.includes(' NOTICE ') && line.includes('Login authentication failed')) {
        console.error('[twitch] auth falló — revisa VA_TWITCH_OAUTH/NICK');
      }
      const m = line.match(/^:(\w+)!\w+@\S+ PRIVMSG #\S+ :(.*)$/);
      if (m) onChat({ user: m[1], text: m[2], source: 'twitch' });
    }
  });

  ws.on('error', e => console.error(`[twitch] ${e.message}`));
  ws.on('close', () => {
    console.log('[twitch] disconnected, retrying in 5s');
    setTimeout(() => connectTwitch(channel, onChat, { oauth, nick }), 5000);
  });
  return { ws, send, authed };
}
