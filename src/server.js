// vibe-arena server: static files + websocket room + chat routing + admin API.
// Usage: node src/server.js [--port 8080] [--twitch <channel>] [--game-dir games/demo]

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { GameHost } from './gamehost.js';
import { CreatorAssets } from './creator-assets.js';
import { importCuratedResource } from './curated-resources.js';
import { RemoteGames } from './remote-games.js';
import { IdeaRounds } from './idea-rounds.js';
import { buildPolicy, localBuildPermission } from './build-policy.js';
import { Treasury } from './treasury.js';
import { Generator } from './generator.js';
import { createLocalChat } from './chat/local.js';
import crypto from 'node:crypto';
import { decodeTwitchEvent, rewardCommand } from './twitch-events.js';
import { loadEnv, TwitchAuth } from './auth/twitch.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const PUBLIC = path.join(ROOT, 'public');
const {acquireController}=await import('./controller-lock.js');
const releaseController=await acquireController(path.join(ROOT,'runtime','controller.lock'));
const IDEAS_FILE = path.join(ROOT, 'ideas.jsonl');

const args = process.argv.slice(2);
const arg = (name, dflt) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : dflt;
};
loadEnv(arg('env-file', path.join(ROOT, '.env')));
const PORT = Number(arg('port', 8420));
const TWITCH_CHANNEL = arg('twitch', null);
const KICK_CHANNEL = arg('kick', null);
const GAME_DIR = path.resolve(ROOT, arg('game-dir', 'games/demo'));

const CONFIG = JSON.parse(fs.readFileSync(path.join(ROOT, 'vibe-arena.config.json'), 'utf8'));
// env overrides for cloud mode: VA_BASE_URL, VA_API_KEY, VA_MODEL
if (process.env.VA_BASE_URL) CONFIG.generator.baseUrl = process.env.VA_BASE_URL;
if (process.env.VA_API_KEY) CONFIG.generator.apiKey = process.env.VA_API_KEY;
if (process.env.VA_MODEL) CONFIG.generator.model = process.env.VA_MODEL;

if(process.env.VA_EVENTSUB_SECRET)CONFIG.monetization.eventsubSecret=process.env.VA_EVENTSUB_SECRET;
if(process.env.VA_WEBHOOK_SECRET)CONFIG.monetization.webhookSecret=process.env.VA_WEBHOOK_SECRET;

// ---------- room ----------
const clients = new Map(); // ws -> {id,name,kind:'player'|'spectator'}
let nextId = 1;

function broadcast(msg, except = null) {
  const data = JSON.stringify(msg);
  for (const ws of clients.keys()) {
    if (ws !== except && ws.readyState === 1) ws.send(data);
  }
}

const events = []; // ring buffer of recent feed events for late joiners
function feed(kind, text) {
  const ev = { t: 'feed', kind, text, at: Date.now() };
  events.push(ev);
  if (events.length > 60) events.shift();
  broadcast(ev);
}

const host = new GameHost({
  gameDir: GAME_DIR,
  onEvent: (kind, detail) => {
    if (kind === 'game-reloaded') for(const player of clients.values())if(player.kind==='player')host.safeCall('onJoin',{id:player.id,name:player.name,role:player.role});
    if (kind === 'game-reloaded') feed('system', `juego recargado: ${host.game?.name}`);
    if (kind === 'game-error') feed('system', `error en game.js: ${detail}`);
    if (kind === 'log') console.log(detail);
  },
});

if (!(await host.load())) console.error(`[boot] ${host.error}`);
host.start();
host.startWatching();

async function loadGameDir(dir) {
  host.stop();
  host.gameDir = dir;
  await host.load();
  for(const player of clients.values())if(player.kind==='player')host.safeCall('onJoin',{id:player.id,name:player.name,role:player.role});
  host.start();
  host.startWatching();
}

// ---------- treasury + generator ----------
const treasury = new Treasury(path.join(ROOT, 'treasury.jsonl'), {
  onChange: e => {
    if (e.kind === 'deposit') feed('system', `+ $${e.amountUsd.toFixed(2)} al fondo (${e.meta?.source || 'manual'})`);
  },
});
const generator = new Generator(CONFIG.generator, treasury, console.log);
let generating = false;
const executionPolicy=buildPolicy(CONFIG.build);
const ideaRounds=new IdeaRounds(path.join(ROOT,'runtime','idea-rounds.json'),{settings:CONFIG.community?.rounds||{}});
ideaRounds.recoverInterrupted();
const creatorAssets=new CreatorAssets(path.join(ROOT,'runtime','creator-assets.json'));
const remoteGames=new RemoteGames(CONFIG.remoteGames,path.join(ROOT,'runtime','remote-games.json'));
let roundStorageHealthy=true;
function tickRounds(){try{ideaRounds.tick();roundStorageHealthy=true;return true;}catch{if(roundStorageHealthy)console.error('Round storage unavailable; pending decisions are retained.');roundStorageHealthy=false;return false;}}

function readIdeas() {
  if (!fs.existsSync(IDEAS_FILE)) return [];
  return fs.readFileSync(IDEAS_FILE, 'utf8').split('\n').filter(Boolean).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
}

async function generateFromIdea(idea,grant) {
  const permission=localBuildPermission(executionPolicy);
  if(!permission.ok){feed('system',permission.reason);return permission;}
  if(!ideaRounds.buildPermission(idea,grant))return {ok:false,code:'round_approval_required',reason:'A matching streamer-approved round is required.'};
  if (generating) return { ok: false, reason: 'ya hay una generación en curso' };
  ideaRounds.beginBuild(idea,grant);
  generating = true;
  feed('system', `generando juego: "${idea}" (${CONFIG.generator.mode}/${CONFIG.generator.model})`);
  try {
    const slug = `auto-${Date.now().toString(36)}`;
    const dir = path.join(ROOT, 'games', slug);
    let r;
    try {
      r = await generator.generateGame(idea, dir);
    } catch (e) {
      r = { ok: false, reason: `error del provider: ${e.message}` };
    }
    if (r.ok) {
      ideaRounds.finishBuild(grant,true);
      await loadGameDir(dir);
      feed('system', `nuevo juego generado ($${r.costUsd.toFixed(3)}): "${idea}"`);
      return { ok: true, game: slug, costUsd: r.costUsd };
    }
    ideaRounds.finishBuild(grant,false);
    feed('system', `generación falló: ${r.reason}`);
    return r;
  } finally { generating = false; }
}

// Community construction waits for a round decision and an isolated worker.
// A funded latest-message loop must not bypass the streamer's selection.
setInterval(tickRounds,1000);

// ---------- chat pipeline ----------
const cmdCooldown = new Map(); // user -> last ts
const COOLDOWN_MS = 250;
const communityCooldown=new Map();let communitySecond=0,communityWrites=0;

function handleChat({ user, text, source, messageId, participantId }) {
  feed('chat', `${user}: ${text}`);
  if (!text.startsWith('!')) return;
  const [cmd, ...args] = text.slice(1).split(/\s+/);
  // meta commands handled by infra
  if (cmd === 'join' || cmd === 'unirse' || cmd === 'entrar' || cmd === 'jugar-link') {
    if (PUBLIC_URL && replies[source]) {
      replies[source](`entra a jugar: ${PUBLIC_URL}/?name=${encodeURIComponent(user)}`);
    } else if (PUBLIC_URL) {
      feed('system', `link para jugar: ${PUBLIC_URL}/?name=${encodeURIComponent(user)}`);
    }
    return;
  }
  const actor={id:participantId||user,name:user,source,owner:source==='twitch'&&user.toLowerCase()===TWITCH_CHANNEL?.toLowerCase()};
  if(['idea','vote','build'].includes(cmd)){
    const now=Date.now(),key=source+':'+(participantId||user);
    if(now-(communityCooldown.get(key)||0)<250)return;
    if(communityCooldown.size>=20000){for(const [id,at] of communityCooldown)if(now-at>60000)communityCooldown.delete(id);if(communityCooldown.size>=20000)return;}
    communityCooldown.set(key,now);
    if(Math.floor(now/1000)!==communitySecond){communitySecond=Math.floor(now/1000);communityWrites=0;}
    if(!actor.owner && ++communityWrites>30)return;
    try{
      if(cmd==='idea'){
        const result=ideaRounds.propose(actor,args.join(' '),messageId);
        if(!result.duplicate){
          const idea=result.round.ideas.find(i=>i.id===result.ideaId);
          fs.appendFileSync(IDEAS_FILE,JSON.stringify({user,idea:idea.text,source,at:Date.now(),roundId:result.round.id,ideaId:idea.id})+'\n');
          feed('system',`idea guardada: #${idea.id} by ${user}. ${result.round.ideas.length}/${result.round.settings.maxIdeas}.`);
        }
      }else if(cmd==='vote'){
        ideaRounds.vote(actor,Number(args[0]),messageId);feed('system',`${user}: ballot updated.`);
      }else{
        const action=args[0]||'status';
        if(action==='open')ideaRounds.open(actor);
        else if(action==='vote')ideaRounds.startVoting(actor);
        else if(action==='close')ideaRounds.finishVoting(actor);
        else if(action==='choose')ideaRounds.select(actor,args.slice(1).map(Number));
        else if(action==='approve')ideaRounds.approve(actor,{roundId:ideaRounds.current()?.id,reviewToken:args[1]});
        else if(action==='cancel')ideaRounds.cancel(actor);
        else if(action!=='status')throw new Error('Use !build open|vote|close|choose IDs|approve|cancel|status.');
        const round=ideaRounds.public();const state=round?`${round.phase}: ${round.ideas.length} ideas, ${round.voters} voters`:'no round';
        const review=round?.reviewToken?' · approval token '+round.reviewToken:'';
        feed('system','Build round '+state+review);if(replies[source])replies[source]('Build round '+state+review);
      }
    }catch(error){feed('system',`${user}: ${error.message}`);if(replies[source])replies[source](error.message);}
    return;
  }
  const last = cmdCooldown.get(user) || 0;
  if (Date.now() - last < COOLDOWN_MS) return;
  cmdCooldown.set(user, Date.now());
  const handled = host.safeCall('onChat', { name: user, source }, cmd, args);
  if (handled) feed('system', `${user} usó !${cmd}`);
}

const localChat = createLocalChat(handleChat);

// reply senders por plataforma (para links de sala / acks)
const replies = {};
const PUBLIC_URL = (process.env.VA_PUBLIC_URL || CONFIG.publicUrl || '').replace(/\/$/,'') || null;
if(PUBLIC_URL && (!process.env.VA_ADMIN_TOKEN || CONFIG.monetization.eventsubSecret.startsWith('cambia-') || CONFIG.monetization.webhookSecret.startsWith('cambia-')))throw new Error('Run npm run setup:local before exposing a public URL.');

let twitch;
if (TWITCH_CHANNEL) {
  const {connectTwitch}=await import('./chat/twitch.js');
  const auth=new TwitchAuth({file:arg('env-file',path.join(ROOT,'.env'))});
  const info=await auth.validate({force:true});
  if(info.login.toLowerCase()!==TWITCH_CHANNEL.toLowerCase())throw new Error('Use your own authorized Twitch channel.');
  twitch=connectTwitch(TWITCH_CHANNEL,handleChat,{auth});
  replies.twitch=twitch.send;
}

// optional kick send (needs user token OAuth chat:write)
if (process.env.VA_KICK_TOKEN && CONFIG.kick?.broadcasterUserId) {
  replies.kick = text => import('./chat/kick.js')
    .then(m => m.sendKickChat({ accessToken: process.env.VA_KICK_TOKEN, broadcasterUserId: CONFIG.kick.broadcasterUserId, content: text }))
    .then(() => true)
    .catch(e => { console.error(`[kick] send: ${e.message}`); return false; });
}

// kick chat: la lectura anónima murió (Kick dejó Pusher cloud). Vía oficial:
// webhook /webhook/kick — ver src/chat/kick.js y scripts/kick-subscribe.mjs.
if (KICK_CHANNEL) {
  console.log(`[kick] canal objetivo: ${KICK_CHANNEL} — suscribe el webhook con:`);
  console.log(`[kick]   node scripts/kick-subscribe.mjs --token <APP_TOKEN> --user <broadcaster_user_id>`);
}

// kick webhook signature verification (official Events API)
let kickPubkey = null;
async function getKickPubkey() {
  if (kickPubkey) return kickPubkey;
  if (process.env.VA_KICK_PUBKEY) return kickPubkey = process.env.VA_KICK_PUBKEY.replace(/\\n/g, '\n');
  const res = await fetch('https://api.kick.com/public/v1/public-key', { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`kick public-key ${res.status}`);
  const data = await res.json();
  kickPubkey = data.public_key || data.data?.public_key;
  return kickPubkey;
}
function verifyKickSignature(req, rawBody) {
  const msgId = req.headers['kick-event-message-id'];
  const ts = req.headers['kick-event-timestamp'];
  const sig = req.headers['kick-event-signature'];
  if (!msgId || !ts || !sig) return false;
  if (!kickPubkey) return 'pending'; // still fetching
  try {
    return crypto.createVerify('RSA-SHA256')
      .update(`${msgId}.${ts}.${rawBody}`)
      .verify(kickPubkey, sig, 'base64');
  } catch { return false; }
}

// ---------- broadcast loop (view @ 15Hz) ----------
setInterval(() => {
  const players = [...clients.values()]
    .filter(c => c.kind === 'player')
    .map(c => ({ id: c.id, name: c.name }));
  broadcast({
    t: 'state',
    view: host.getView(),
    players,
    game: host.game ? { name: host.game.name, desc: host.game.meta.description || '' } : null,
    error: host.error,
    fund: { balance: treasury.balance, goal: CONFIG.generator.gameCostUsd, generating },
  });
}, 66);

// ---------- http ----------
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };

const deliveryFile=path.join(ROOT,'runtime','twitch-deliveries.jsonl');
fs.mkdirSync(path.dirname(deliveryFile),{recursive:true});
const twitchDeliveries=new Set();
if(fs.existsSync(deliveryFile))for(const line of fs.readFileSync(deliveryFile,'utf8').split('\n')){try{const row=JSON.parse(line);if(Date.now()-row.at<600000)twitchDeliveries.add(row.id);}catch{}}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if(url.pathname==='/community/state'&&req.method==='GET'){if(!tickRounds()){res.writeHead(503,{'Content-Type':'application/json'});return res.end(JSON.stringify({code:'round_store_unavailable'}));}res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});return res.end(JSON.stringify({round:ideaRounds.public(),channel:TWITCH_CHANNEL,twitchConnected:!!twitch?.ready,liveGame:host.game?.name,build:{mode:executionPolicy.mode,fallbackToLocal:false,workerConnected:false}}));}
  let bodyBytes=0;req.on('data',chunk=>{bodyBytes+=chunk.length;if(bodyBytes>262144){res.writeHead(413);res.end('request too large');req.destroy();}});
  if(url.pathname==='/community/assets'&&req.method==='GET'){res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});return res.end(JSON.stringify({assets:creatorAssets.catalog(),policy:{defaultTier:'free',paidCheckoutEnabled:false,platformCommission:null,creditPolicy:'Creator links stay in official game credits.'}}));}
  if(url.pathname==='/community/games'&&req.method==='GET'){res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});return res.end(JSON.stringify(remoteGames.catalog()));}
  if(url.pathname==='/community/asset-proposals'&&req.method==='POST'){
    let data='';req.on('data',chunk=>data+=chunk);req.on('end',()=>{try{const asset=creatorAssets.draft(JSON.parse(data));res.writeHead(202,{'Content-Type':'application/json'});res.end(JSON.stringify({id:asset.id,status:asset.status}));}catch(error){res.writeHead(400,{'Content-Type':'application/json'});res.end(JSON.stringify({error:error.message}));}});return;
  }
  // admin (localhost only)
  if (url.pathname.startsWith('/admin/')) {
    if(req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for'] || req.headers.forwarded){res.writeHead(403);return res.end('local admin only');}
    if(process.env.VA_ADMIN_TOKEN && req.headers.authorization!=='Bearer '+process.env.VA_ADMIN_TOKEN){res.writeHead(403);return res.end('admin authentication required');}
    const ip = req.socket.remoteAddress;
    if (ip !== '127.0.0.1' && ip !== '::1' && ip !== '::ffff:127.0.0.1') {
      res.writeHead(403); return res.end('localhost only');
    }
    const readBody = () => new Promise(r => { let b = ''; req.on('data', c => b += c); req.on('end', () => r(b)); });
    if(url.pathname==='/admin/owner-status'&&req.method==='GET'){const ok=process.env.VA_STREAMER_KEY&&req.headers['x-streamer-key']===process.env.VA_STREAMER_KEY;res.writeHead(ok?200:403,{'Content-Type':'application/json'});return res.end(JSON.stringify({ok:!!ok}));}
    if(url.pathname==='/admin/assets'&&req.method==='GET'){res.writeHead(200,{'Content-Type':'application/json'});return res.end(JSON.stringify(creatorAssets.data.assets));}
    if(url.pathname==='/admin/remote-games'&&req.method==='POST'){
      try{if(!process.env.VA_STREAMER_KEY||req.headers['x-streamer-key']!==process.env.VA_STREAMER_KEY){res.writeHead(403);return res.end('streamer confirmation required');}const data=JSON.parse(await readBody()||'{}');let result;if(data.action==='inspect')result=await remoteGames.inspect(data.gameId);else if(data.action==='create')result=await remoteGames.create(data.gameId,data.requestId,TWITCH_CHANNEL||'');else if(data.action==='start')result=await remoteGames.start(data.sessionId);else if(data.action==='reconcile')result=await remoteGames.reconcile(data.sessionId);else throw Error('Unknown remote game action.');res.writeHead(200,{'Content-Type':'application/json'});return res.end(JSON.stringify(result));}catch(error){res.writeHead(400);return res.end(error.message);}
    }
    if(url.pathname==='/admin/assets/import'&&req.method==='POST'){
      try{if(!process.env.VA_STREAMER_KEY||req.headers['x-streamer-key']!==process.env.VA_STREAMER_KEY){res.writeHead(403);return res.end('streamer confirmation required');}const data=JSON.parse(await readBody()||'{}');const asset=importCuratedResource(creatorAssets,ROOT,data.key);res.writeHead(200,{'Content-Type':'application/json'});return res.end(JSON.stringify(asset));}catch(error){res.writeHead(400);return res.end(error.message);}
    }
    if(url.pathname==='/admin/assets/review'&&req.method==='POST'){
      try{const data=JSON.parse(await readBody()||'{}');if(!process.env.VA_STREAMER_KEY||req.headers['x-streamer-key']!==process.env.VA_STREAMER_KEY){res.writeHead(403);return res.end('streamer confirmation required');}const asset=creatorAssets.review(data.id,{owner:true,name:'streamer'},data);res.writeHead(200,{'Content-Type':'application/json'});return res.end(JSON.stringify(asset));}catch(error){res.writeHead(400);return res.end(error.message);}
    }
    if(url.pathname==='/admin/round'&&req.method==='POST'){
      try{
        const data=JSON.parse(await readBody()||'{}');
        if(req.headers['x-streamer-key']!==process.env.VA_STREAMER_KEY || !process.env.VA_STREAMER_KEY){res.writeHead(403);return res.end('streamer confirmation required');}
        const actor={name:'streamer',source:'streamer-ui',owner:true};
        if(data.action==='open')ideaRounds.open(actor,data.settings||{});
        else if(data.action==='vote')ideaRounds.startVoting(actor);
        else if(data.action==='close')ideaRounds.finishVoting(actor);
        else if(data.action==='select')ideaRounds.select(actor,data.ids,data.reason);
        else if(data.action==='resources')ideaRounds.chooseResources(actor,creatorAssets.manifest(data.assetIds));
        else if(data.action==='approve')ideaRounds.approve(actor,{roundId:data.roundId,reviewToken:data.reviewToken});
        else if(data.action==='cancel')ideaRounds.cancel(actor);
        else throw new Error('Unknown round action.');
        res.writeHead(200,{'Content-Type':'application/json'});return res.end(JSON.stringify(ideaRounds.public()));
      }catch(error){res.writeHead(400);return res.end(error.message);}
    }
    if (url.pathname === '/admin/ideas') {
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify(readIdeas()));
    }
    if (url.pathname === '/admin/treasury') {
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify(treasury.stats()));
    }
    if (url.pathname === '/admin/fund' && req.method === 'POST') {
      const { amountUsd, source } = JSON.parse(await readBody() || '{}');
      if (!(amountUsd > 0)) { res.writeHead(400); return res.end('amountUsd required'); }
      treasury.deposit(amountUsd, { source: source || 'manual' });
      res.writeHead(200); return res.end('ok');
    }
    if (url.pathname === '/admin/generate' && req.method === 'POST') {
      try{
        const {idea,roundId,approvedInputHash}=JSON.parse(await readBody()||'{}');
        if(typeof idea!=='string'||!idea){res.writeHead(400);return res.end('idea required');}
        const result=await generateFromIdea(idea,{roundId,approvedInputHash});
        res.writeHead(200,{'Content-Type':'application/json'});return res.end(JSON.stringify(result));
      }catch{res.writeHead(503,{'Content-Type':'application/json'});return res.end(JSON.stringify({ok:false,code:'build_state_unavailable',reason:'Build state needs reconciliation; inspect the operator view.'}));}
    }
    if (url.pathname === '/admin/status') {
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({
        game: host.game ? { name: host.game.name, dir: host.gameDir, meta: host.game.meta } : null,
        players: [...clients.values()].filter(c => c.kind === 'player').map(c => c.name),
        error: host.error, generating, fund: { balance: treasury.balance, goal: CONFIG.generator.gameCostUsd },
      }));
    }
    if (url.pathname === '/admin/chat' && req.method === 'POST') {
      const { user, text } = JSON.parse(await readBody() || '{}');
      if (!user || !text) { res.writeHead(400); return res.end('user+text required'); }
      handleChat({ user: String(user).slice(0, 20), text: String(text).slice(0, 200), source: 'admin' });
      res.writeHead(200); return res.end('ok');
    }
    if (url.pathname === '/admin/load' && req.method === 'POST') {
      const { game } = JSON.parse(await readBody() || '{}');
      const dir = path.resolve(ROOT, 'games', String(game || ''));
      if (!game || !dir.startsWith(path.join(ROOT, 'games')) || !fs.existsSync(path.join(dir, 'game.js'))) {
        res.writeHead(400); return res.end('unknown game');
      }
      await loadGameDir(dir);
      feed('system', `juego cargado: ${game}`);
      res.writeHead(200); return res.end('ok');
    }
    res.writeHead(404); return res.end();
  }

  // kick official webhook: POST with Kick-Event-* headers; chat.message.sent -> chat pipeline
  if (url.pathname === '/webhook/kick' && req.method === 'POST') {
    let b = ''; req.on('data', c => b += c);
    req.on('end', async () => {
      try { if (!kickPubkey) await getKickPubkey(); } catch {}
      const check = verifyKickSignature(req, b);
      if (check !== true) { res.writeHead(check === 'pending' ? 503 : 403); return res.end('bad signature'); }
      let body = {};
      try { body = JSON.parse(b); } catch {}
      const evType = req.headers['kick-event-type'];
      const M = CONFIG.monetization;
      if (evType === 'chat.message.sent') {
        const user = body.sender?.username || 'anon';
        const text = String(body.content || '').slice(0, 200);
        if (text) handleChat({ user, text, source: 'kick' });
      } else if (evType === 'channel.subscription.new') {
        treasury.deposit(M.kickSubUsd, { source: 'kick-sub', user: body.subscriber?.username });
        feed('system', `sub de ${body.subscriber?.username || '?'} → +$${M.kickSubUsd}`);
      } else if (evType === 'channel.subscription.gifts') {
        const n = body.giftees?.length || body.amount || 1;
        treasury.deposit(n * M.kickSubUsd, { source: 'kick-sub-gift', user: body.gifter?.username, count: n });
        feed('system', `${body.gifter?.username || '?'} regaló ${n} subs → +$${(n * M.kickSubUsd).toFixed(2)}`);
      } else if (evType === 'kicks.gifted') {
        const amt = (body.kicks?.amount || body.amount || 0) * M.kickUsdPerKick;
        if (amt > 0) {
          treasury.deposit(amt, { source: 'kicks', user: body.sender?.username, kicks: body.kicks?.amount });
          feed('system', `${body.sender?.username || '?'} donó kicks → +$${amt.toFixed(2)}`);
        }
      }
      res.writeHead(200); res.end('ok');
    });
    return;
  }

  // twitch EventSub webhook: subs/bits -> treasury. Shared secret: CONFIG.monetization.eventsubSecret
  if (url.pathname === '/webhook/twitch' && req.method === 'POST') {
    let b = ''; req.on('data', c => b += c);
    req.on('end', () => {
      const decoded=decodeTwitchEvent(req.headers,b,CONFIG.monetization.eventsubSecret);
      if(decoded.status!==200){res.writeHead(decoded.status);return res.end('invalid event');}
      const {id:msgId,type,body}=decoded;
      if (type === 'webhook_callback_verification') {
        res.writeHead(200, { 'content-type': 'text/plain' });
        return res.end(body.challenge);
      }
      if (type === 'notification') {
        if(twitchDeliveries.has(msgId)){res.writeHead(204);return res.end();}
        const ev = body.event || {};
        const M = CONFIG.monetization;
        if (body.subscription?.type === 'channel.subscribe') {
          const mult = { '1000': 1, '2000': 2, '3000': 5 }[ev.tier] || 1;
          treasury.deposit(M.twitchSubUsd * mult, { source: 'twitch-sub', user: ev.user_name, tier: ev.tier });
          feed('system', `sub T${ev.tier?.[0]} de ${ev.user_name} → +$${(M.twitchSubUsd * mult).toFixed(2)}`);
        } else if (body.subscription?.type === 'channel.subscription.gift') {
          const n = ev.total || 1;
          treasury.deposit(M.twitchSubUsd * n, { source: 'twitch-sub-gift', user: ev.user_name, count: n });
          feed('system', `${ev.user_name} regaló ${n} subs → +$${(M.twitchSubUsd * n).toFixed(2)}`);
        } else if (body.subscription?.type === 'channel.bits.use' || body.subscription?.type === 'channel.cheer') {
          const bits = ev.bits || ev.cheer?.bits || 0;
          const usd = bits * M.bitUsd;
          if (usd > 0) {
            treasury.deposit(usd, { source: 'twitch-bits', user: ev.user_name, bits });
            feed('system', `${bits} bits de ${ev.user_name} → +$${usd.toFixed(2)}`);
          }
        } else if (body.subscription?.type === 'channel.channel_points_custom_reward_redemption.add') {
          const command=rewardCommand(ev,CONFIG.twitch?.rewardCommands);
          if(command){
            const [cmd,...args]=command.slice(1).split(/\s+/);
            const handled=host.safeCall('onChat',{name:ev.user_name||ev.user_login||'viewer',source:'twitch-reward'},cmd,args);
            feed('system',`${ev.user_name||'viewer'} redeemed ${ev.reward.title} → ${command}${handled?'':' (not handled by this game)'}`);
          }else feed('system',`Unmapped reward: ${ev.reward?.title||'unknown'}`);
        }
      }
      if(type==='notification'){twitchDeliveries.add(msgId);fs.appendFileSync(deliveryFile,JSON.stringify({id:msgId,at:Date.now()})+'\n');}
      res.writeHead(204); res.end();
    });
    return;
  }

  // donation webhook: Streamlabs / Ko-fi / generic POST {amountUsd|amount, source, user} + ?secret=
  if (url.pathname === '/webhook/donation' && req.method === 'POST') {
    let b = ''; req.on('data', c => b += c);
    req.on('end', () => {
      let body = {};
      try { body = JSON.parse(b); } catch {}
      if (url.searchParams.get('secret') !== CONFIG.monetization.webhookSecret) {
        res.writeHead(403); return res.end('bad secret');
      }
      const amt = Number(body.amountUsd ?? body.amount);
      if (!(amt > 0)) { res.writeHead(400); return res.end('amount required'); }
      treasury.deposit(amt, { source: body.source || 'donation', user: body.user, raw: undefined });
      feed('system', `donación${body.user ? ` de ${body.user}` : ''}: $${amt.toFixed(2)}`);
      res.writeHead(200); res.end('ok');
    });
    return;
  }

  // static — active game's client/ dir wins over public/ (custom-client games)
  let p = url.pathname === '/' ? '/index.html' : url.pathname;
  let file = path.resolve(host.gameDir, 'client', '.' + p);
  if (!file.startsWith(path.join(host.gameDir, 'client')) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    file = path.resolve(PUBLIC, '.' + p);
  }
  if (!file.startsWith(PUBLIC) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    res.writeHead(404); return res.end('not found');
  }
  res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

// ---------- ws ----------
const wss = new WebSocketServer({ server, maxPayload:64*1024 });

wss.on('connection', (ws, req) => {
  ws.on('error',()=>ws.terminate());
  const url = new URL(req.url, 'http://x');
  const kind = url.pathname === '/spectate' ? 'spectator' : 'player';
  const name = (url.searchParams.get('name') || `anon-${Math.floor(1000 + Math.random() * 9000)}`).slice(0, 20);

  const client = { id: nextId++, communityId:crypto.randomUUID(), name, kind, role:'viewer' };
  clients.set(ws, client);

  ws.send(JSON.stringify({
    t: 'welcome', id: client.id, name, kind,
    game: host.game ? { name: host.game.name, desc: host.game.meta.description || '' } : null,
    world: host.game?.meta.world || { w: 1280, h: 720 },
    recent: events.slice(-20),
  }));

  if (kind === 'player') {
    host.safeCall('onJoin', { id: client.id, name });
    feed('system', `${name} se unió`);
  }

  ws.on('message', raw => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    if(!msg||typeof msg!=='object'||Array.isArray(msg))return;
    if (kind !== 'player' && msg.t !== 'chat') return;
    if(msg.t==='claim-streamer'){
      const expected=process.env.VA_STREAMER_KEY;
      if(!expected || typeof msg.key!=='string' || Buffer.byteLength(msg.key)!==Buffer.byteLength(expected) || !crypto.timingSafeEqual(Buffer.from(msg.key),Buffer.from(expected))){ws.send(JSON.stringify({t:'role',ok:false}));return;}
      if([...clients.values()].some(c=>c!==client && c.role==='streamer')){ws.send(JSON.stringify({t:'role',ok:false}));return;}
      client.role='streamer';host.safeCall('onJoin',{id:client.id,name,role:client.role});ws.send(JSON.stringify({t:'role',ok:true}));return;
    }
    if (msg.t === 'input') {
      host.safeCall('onInput', client.id, msg.data);
    } else if (msg.t === 'chat' && typeof msg.text === 'string') {
      handleChat({ user: name, text: msg.text.slice(0, 10000), source: 'web', participantId:client.communityId });
    }
  });

  ws.on('close', () => {
    clients.delete(ws);
    if (kind === 'player') {
      host.safeCall('onLeave', { id: client.id, name });
      feed('system', `${name} salió`);
    }
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[vibe-arena] players  -> http://localhost:${PORT}/`);
  console.log(`[vibe-arena] overlay  -> http://localhost:${PORT}/overlay.html`);
  console.log(`[vibe-arena] chat test-> type in this terminal, or !cmd`);
  console.log(`[vibe-arena] game dir -> ${GAME_DIR}`);
  if (TWITCH_CHANNEL) console.log(`[vibe-arena] twitch   -> ${TWITCH_CHANNEL}`);
  if (KICK_CHANNEL) console.log(`[vibe-arena] kick webhook -> POST /webhook/kick`);
});

const shutdown=()=>{twitch?.close();host.stop();localChat.close();server.close();process.exit(0);};
process.on('SIGINT',shutdown);process.on('SIGTERM',shutdown);
