// Compatibilidad por plataforma: Twitch EventSub (HMAC) + Kick webhook (RSA).
// Requiere server corriendo con VA_KICK_PUBKEY=<test pub> y eventsubSecret='cambia-esto-tambien'.
import crypto from 'node:crypto';
import fs from 'node:fs';

const BASE = 'http://localhost:8420';
const ok = (n, c, x = '') => console.log(`${c ? 'PASS' : 'FAIL'} ${n} ${x}`);
const treasury = async () => (await fetch(BASE + '/admin/treasury')).json();
const SECRET = 'cambia-esto-tambien';

// ---------- Twitch EventSub ----------
function twitchHeaders(msgType, body, subType) {
  const msgId = 'test-' + crypto.randomBytes(8).toString('hex');
  const ts = new Date().toISOString();
  const raw = JSON.stringify(body);
  const sig = 'sha256=' + crypto.createHmac('sha256', SECRET).update(msgId + ts + raw).digest('hex');
  return {
    'content-type': 'application/json',
    'twitch-eventsub-message-id': msgId,
    'twitch-eventsub-message-timestamp': ts,
    'twitch-eventsub-message-signature': sig,
    'twitch-eventsub-message-type': msgType,
  };
}

let before = (await treasury()).balance;

// challenge handshake
const challengeBody = { challenge: 'pogchamp-challenge-123', subscription: { type: 'x' } };
let r = await fetch(BASE + '/webhook/twitch', {
  method: 'POST', headers: twitchHeaders('webhook_callback_verification', challengeBody),
  body: JSON.stringify(challengeBody),
});
const challengeText = await r.text();
ok('twitch challenge handshake', r.status === 200 && challengeText === 'pogchamp-challenge-123', `${r.status}`);

// bad signature
r = await fetch(BASE + '/webhook/twitch', {
  method: 'POST',
  headers: { ...twitchHeaders('notification', {}), 'twitch-eventsub-message-signature': 'sha256=deadbeef' },
  body: '{}',
});
ok('twitch firma mala → 403', r.status === 403);

// channel.subscribe notification
const subBody = {
  subscription: { type: 'channel.subscribe', version: '1' },
  event: { user_name: 'fan_twitch', tier: '1000' },
};
r = await fetch(BASE + '/webhook/twitch', {
  method: 'POST', headers: twitchHeaders('notification', subBody), body: JSON.stringify(subBody),
});
ok('twitch channel.subscribe', r.status === 204);

// bits
const bitsBody = { subscription: { type: 'channel.bits.use', version: '1' }, event: { user_name: 'fan_bits', bits: 500 } };
r = await fetch(BASE + '/webhook/twitch', {
  method: 'POST', headers: twitchHeaders('notification', bitsBody), body: JSON.stringify(bitsBody),
});
ok('twitch bits.use', r.status === 204);

let after = (await treasury()).balance;
// sub $2.50 + 500 bits × $0.01 = $7.50
ok('twitch depósitos en fondo', Math.abs(after - before - 7.5) < 0.01, `+$${(after - before).toFixed(2)}`);

// ---------- Kick webhook (RSA test key) ----------
const PRIV = fs.readFileSync('/tmp/kick-test-priv.pem', 'utf8');
function kickHeaders(evType, raw) {
  const msgId = 'kick-' + crypto.randomBytes(8).toString('hex');
  const ts = String(Math.floor(Date.now() / 1000));
  const sig = crypto.createSign('RSA-SHA256').update(`${msgId}.${ts}.${raw}`).sign(PRIV, 'base64');
  return {
    'content-type': 'application/json',
    'kick-event-type': evType,
    'kick-event-message-id': msgId,
    'kick-event-timestamp': ts,
    'kick-event-signature': sig,
  };
}

before = after;

// chat.message.sent → debe llegar al pipeline (lo verificamos vía feed en spectate)
const { WebSocket } = await import('ws');
const spec = new WebSocket('ws://localhost:8420/spectate');
const feeds = [];
spec.on('message', r => { const m = JSON.parse(r); if (m.t === 'feed') feeds.push(m.text); });
await new Promise(r => setTimeout(r, 300));

const chatBody = { message_id: 'm1', sender: { username: 'fan_kick' }, content: 'hola desde kick' };
let raw = JSON.stringify(chatBody);
r = await fetch(BASE + '/webhook/kick', { method: 'POST', headers: kickHeaders('chat.message.sent', raw), body: raw });
ok('kick chat.message.sent aceptado', r.status === 200);
await new Promise(r => setTimeout(r, 400));
ok('kick chat en feed', feeds.some(t => t.includes('fan_kick: hola desde kick')));

// firma mala
r = await fetch(BASE + '/webhook/kick', {
  method: 'POST',
  headers: { ...kickHeaders('chat.message.sent', raw), 'kick-event-signature': 'AAAA' },
  body: raw,
});
ok('kick firma mala → 403', r.status === 403);

// channel.subscription.new → depósito
const subKick = { subscriber: { username: 'kickfan' } };
raw = JSON.stringify(subKick);
r = await fetch(BASE + '/webhook/kick', { method: 'POST', headers: kickHeaders('channel.subscription.new', raw), body: raw });
ok('kick subscription.new', r.status === 200);

// kicks.gifted → depósito
const kicks = { sender: { username: 'kickfan2' }, kicks: { amount: 250 } };
raw = JSON.stringify(kicks);
r = await fetch(BASE + '/webhook/kick', { method: 'POST', headers: kickHeaders('kicks.gifted', raw), body: raw });
ok('kick kicks.gifted', r.status === 200);

after = (await treasury()).balance;
// kick sub $4.74 + 250 kicks × $0.01 = $7.24
ok('kick depósitos en fondo', Math.abs(after - before - 7.24) < 0.01, `+$${(after - before).toFixed(2)}`);

spec.close();
console.log('done');
process.exit(0);
