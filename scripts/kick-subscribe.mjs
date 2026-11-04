// Subscribes /webhook/kick to a Kick channel's events.
//   1. At kick.com, Account, Developer: create an app and enable webhooks with
//      https://<public URL>/webhook/kick.
//   2. Get an app access token (client credentials) or a user OAuth token.
//   3. node scripts/kick-subscribe.mjs --token <TOKEN> --user <BROADCASTER_USER_ID>
//
// broadcaster_user_id is numeric: GET https://api.kick.com/public/v1/channels?slug=<channel>
// List subscriptions: --list --token <T>   Delete one: --delete <id> --token <T>

const args = process.argv.slice(2);
const arg = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const TOKEN = arg('token', process.env.KICK_TOKEN);
const USER_ID = arg('user', null);
const API = 'https://api.kick.com/public/v1';

if (!TOKEN) { console.error('missing --token'); process.exit(1); }
const H = { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' };

async function api(method, p, body) {
  const res = await fetch(`${API}${p}`, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
  const t = await res.text();
  if (!res.ok) throw new Error(`${method} ${p} -> ${res.status}: ${t.slice(0, 300)}`);
  return t ? JSON.parse(t) : {};
}

if (args.includes('--list')) {
  console.log(JSON.stringify(await api('GET', '/events/subscriptions'), null, 2));
  process.exit(0);
}
if (args.includes('--delete')) {
  const id = arg('delete');
  await api('DELETE', `/events/subscriptions/${id}`);
  console.log('deleted', id); process.exit(0);
}
if (!USER_ID) { console.error('missing --user <broadcaster_user_id>'); process.exit(1); }

const sub = await api('POST', '/events/subscriptions', {
  broadcaster_user_id: Number(USER_ID),
  events: [
    { name: 'chat.message.sent', version: 1 },
    { name: 'channel.subscription.new', version: 1 },
    { name: 'channel.subscription.gifts', version: 1 },
    { name: 'livestream.status.updated', version: 1 },
  ],
  method: 'webhook',
});
console.log('subscription created:', JSON.stringify(sub, null, 2));
