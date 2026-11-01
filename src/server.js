// vibe-arena server: static files + websocket room + chat routing + admin API.
// Usage: node src/server.js [--port 8080] [--twitch <channel>] [--game-dir games/demo]

import http from 'node:http';
import {ApprovalDelegation,roundApprovalActor} from './approval-delegation.js';
import {ChatPredictions} from './chat-predictions.js';
import {CrowdBursts} from './crowd-bursts.js';
import {FallbackPolicy} from './fallback-policy.js';
import {bundledContributorCredits} from './contributor-credits.js';
import {ChatEffects} from './chat-effects.js';
import {secretMatches,staticFileInside} from './request-boundaries.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import {STATE_INTERVAL_MS,WS_COMPRESSION,encodeMessage,sendRoom,ChatGate} from './traffic.js';
import {IsolatedGameHost as GameHost} from './isolated-gamehost.js';
import { CreatorAssets } from './creator-assets.js';
import { importCuratedResource } from './curated-resources.js';
import { RemoteGames } from './remote-games.js';
import { TeeChatBridge } from './tee-chat-bridge.js';
import {reviewGame,publishGameCredits,GameCreditsSnapshot} from './game-credits.js';
import { IdeaRounds } from './idea-rounds.js';
import { buildPolicy, localBuildPermission } from './build-policy.js';
import { BuildQuarantine } from './build-quarantine.js';
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
const LISTEN_HOST = arg('host', '0.0.0.0');
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

// Synthetic event accounting is opt-in for isolated fixtures only; never provider settlement.
const simulateEventCredits = process.env.VA_SIMULATE_EVENT_CREDITS === '1';

const approvalDelegation=new ApprovalDelegation({enabled:CONFIG.features?.approvalDelegation});
const predictions=new ChatPredictions({enabled:CONFIG.features?.chatPredictions});
const crowdBursts=new CrowdBursts({enabled:CONFIG.features?.distinctPersonBursts});
const fallbackPolicy=new FallbackPolicy(path.join(ROOT,'runtime','fallback-preferences.json'),{enabled:CONFIG.features?.configuredFallback,order:CONFIG.fallback?.order});
const chatEffects=new ChatEffects({enabled:CONFIG.features?.chatPause,channel:TWITCH_CHANNEL});

// ---------- room ----------
const clients = new Map(); // ws -> {id,name,kind:'player'|'spectator'}
let nextId = 1;

function broadcast(msg, except = null) {
  const data = encodeMessage(msg);
  for (const ws of clients.keys()) {
    if (ws !== except) sendRoom(ws,data,{state:msg.t==='state'});
  }
}

const events = []; // ring buffer of recent feed events for late joiners
function feed(kind, text) {
  const ev = { t: 'feed', kind, text, at: Date.now() };
  events.push(ev);
  if (events.length > 60) events.shift();
  broadcast(ev);
}

let transitioning=false;
let fallback={active:false,reason:null,at:null};
let fallbackScheduled=false,fallbackRequested=null,recovering=false;
let fallbackAttempted=new Set();
function requestFallback(reason){
  if(recovering)return;
  fallbackRequested=reason;if(fallbackScheduled)return;fallbackScheduled=true;
  setTimeout(async()=>{fallbackScheduled=false;if(transitioning)return;const pending=fallbackRequested;fallbackRequested=null;await activateFallback(pending);},0);
}
async function activateFallback(reason){
  if(recovering||transitioning)return false;
  recovering=true;
  if(!fallback.active||!host.error)fallbackAttempted=new Set();
  if(host.error)fallbackAttempted.add(path.basename(host.gameDir));
  fallback={active:true,reason:String(reason).slice(0,240),at:Date.now()};
  try{
    for(const gameId of fallbackPolicy.effective){
      if(fallbackAttempted.has(gameId))continue;
      fallbackAttempted.add(gameId);
      const dir=path.join(ROOT,'games',gameId);
      try{const review=reviewGame(ROOT,gameId);if(!bundledContributorCredits(ROOT,dir,review.codeSha256))continue;}catch{continue;}
      if(await loadGameDir(dir,{isFallback:true})){
        fallback.gameId=gameId;feed('system','Safety fallback: '+host.game.name+'. '+fallback.reason);return true;
      }
    }
    host.stop();feed('system','Fallback unavailable; gameplay stopped. '+fallback.reason);return false;
  }finally{recovering=false;}
}

const host = new GameHost({
  gameDir: GAME_DIR,
  onEvent: (kind, detail) => {
    if (kind === 'game-reloaded') for(const player of clients.values())if(player.kind==='player')host.safeCall('onJoin',{id:player.id,name:player.name,role:player.role});
    if (kind === 'game-reloaded') {crowdBursts.reset();refreshPublication();}
    if (kind === 'game-reloaded') feed('system', `Game reloaded: ${host.game?.name}`);
    if (kind === 'game-error') {feed('system', `Game stopped: ${detail}`);requestFallback(detail);}
    if (kind === 'log') console.log(detail);
  },
});

if (!(await host.load())) console.error(`[boot] ${host.error}`);
if(host.game){host.start();host.startWatching();}

async function loadGameDir(dir,{isFallback=false}={}) {
  if(transitioning)return false;
  transitioning=true;
  try{
    crowdBursts.reset();host.stop();host.gameDir=dir;
    if(!await host.load())return false;
    for(const player of clients.values())if(player.kind==='player')host.safeCall('onJoin',{id:player.id,name:player.name,role:player.role});
    host.start();host.startWatching();refreshPublication();if(!isFallback)fallback={active:false,reason:null,at:null};return true;
  }finally{transitioning=false;if(fallbackRequested)requestFallback(fallbackRequested);}
}

// ---------- treasury + generator ----------
const treasury = new Treasury(path.join(ROOT, 'treasury.jsonl'), {
  onChange: e => {
    if (e.kind === 'deposit') feed('system', `Demo build credits +${e.amountUsd.toFixed(2)} (${e.meta?.source || 'manual'}); no payment received.`);
  },
});
const generator = new Generator(CONFIG.generator, treasury, console.log);
let generating = false;
const executionPolicy=buildPolicy(CONFIG.build);
const ideaRounds=new IdeaRounds(path.join(ROOT,'runtime','idea-rounds.json'),{settings:CONFIG.community?.rounds||{}});
ideaRounds.recoverInterrupted();
const buildQuarantine=new BuildQuarantine(path.join(ROOT,'runtime','build-quarantine.json'));
const creatorAssets=new CreatorAssets(path.join(ROOT,'runtime','creator-assets.json'));
const publicationSnapshot=new GameCreditsSnapshot({registry:creatorAssets,root:ROOT});
function refreshPublication(){const value=publicationSnapshot.refresh(host.gameDir,host.game?.versionSha256);broadcast({t:'credits',publication:value});}
refreshPublication();
let resourceDebounce;
const resourceWatcher=fs.watch(path.join(PUBLIC,'curated'),{recursive:true},()=>{clearTimeout(resourceDebounce);resourceDebounce=setTimeout(refreshPublication,25);});
resourceWatcher.on('error',()=>{publicationSnapshot.value={status:'unavailable',manifest:null,contributors:null};broadcast({t:'credits',publication:publicationSnapshot.get()});});
const remoteGames=new RemoteGames(CONFIG.remoteGames,path.join(ROOT,'runtime','remote-games.json'));
const teeBridge=new TeeChatBridge();
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
  if (generating) return { ok: false, reason: 'A build is already in progress' };
  ideaRounds.beginBuild(idea,grant);
  generating = true;
  feed('system', `Building game: "${idea}" (${CONFIG.generator.mode}/${CONFIG.generator.model})`);
  try {
    const slug = `auto-${Date.now().toString(36)}`;
    const dir = path.join(ROOT, 'games', slug);
    let r;
    try {
      r = await generator.generateGame(idea, dir);
    } catch (e) {
      r = { ok: false, reason: `Provider error: ${e.message}` };
    }
    if (r.ok) {
      ideaRounds.finishBuild(grant,true);
      await loadGameDir(dir);
      feed('system', `New game built ($${r.costUsd.toFixed(3)}): "${idea}"`);
      return { ok: true, game: slug, costUsd: r.costUsd };
    }
    ideaRounds.finishBuild(grant,false);
    feed('system', `Build failed: ${r.reason}`);
    return r;
  } finally { generating = false; }
}

// Community construction waits for a round decision and an isolated worker.
// A funded latest-message loop must not bypass the streamer's selection.
setInterval(tickRounds,1000);

// ---------- chat pipeline ----------
const chatGate=new ChatGate();

function handleChat({ user, text, source, messageId, participantId, isModerator=false }) {
  text=String(text).slice(0,text.startsWith('!idea ')?10000:200);user=String(user).slice(0,100);
  if(source==='twitch'&&text.trim()==='!fallback'&&(isModerator||user.toLowerCase()===TWITCH_CHANNEL?.toLowerCase())){requestFallback('Requested by Twitch moderator '+user);return;}
  const control=chatEffects.command({source,user,isModerator},text);
  if(control.handled){if(control.changed){if(chatEffects.blocked){crowdBursts.reset();teeBridge.pulse=null;teeBridge.tick();}feed('system',chatEffects.blocked?'Chat effects paused by '+user:'Chat effects resumed by '+user);}return;}
  if(!chatGate.accept(source,participantId||user))return;
  feed('chat', `${user}: ${text}`);
  if(!chatEffects.blocked&&!host.error&&host.gameDir===path.join(ROOT,'games','community-grove')){const bonus=crowdBursts.accept({source,user},text);if(bonus){host.safeCall('onCrowdBonus',bonus);feed('system',`${bonus.participants} distinct Twitch viewers unlocked a ${bonus.kind} bonus!`);}}
  if (!text.startsWith('!')) return;
  const [cmd, ...args] = text.slice(1).split(/\s+/);
  // meta commands handled by infra
  if (cmd === 'join' || cmd === 'unirse' || cmd === 'entrar' || cmd === 'jugar-link') {
    if (PUBLIC_URL && replies[source]) {
      replies[source](`Join the game: ${PUBLIC_URL}/?name=${encodeURIComponent(user)}`);
    } else if (PUBLIC_URL) {
      feed('system', `Game link: ${PUBLIC_URL}/?name=${encodeURIComponent(user)}`);
    }
    return;
  }
  const actor={id:participantId||user,name:user,source,owner:source==='twitch'&&user.toLowerCase()===TWITCH_CHANNEL?.toLowerCase()};
  if(cmd==='delegate'){
    try{if(args[0]==='off')approvalDelegation.revoke(actor);else approvalDelegation.set(actor,args[0],Number(args[1])*60);const grant=approvalDelegation.public();feed('system',grant?'Round input approval delegated to @'+grant.name+' for '+args[1]+' minutes.':'Round approval delegation revoked.');}catch(error){feed('system',user+': '+error.message);}return;
  }
  if(cmd==='predict'||cmd==='prediction'){
    try{if(cmd==='predict'){predictions.vote(actor,args.join(' '));feed('system',user+': prediction saved.');}
      else{const action=args.shift();if(action==='open')predictions.open(actor,args.join(' ').split('|'));else if(action==='lock')predictions.lock(actor);else if(action==='resolve')predictions.resolve(actor,args.join(' '));else if(action==='cancel')predictions.cancel(actor);else throw Error('Use !prediction open choice|choice, lock, resolve choice, or cancel.');feed('system','Chat prediction: '+predictions.public()?.phase);}
    }catch(error){feed('system',user+': '+error.message);}return;
  }
  if(cmd==='fallback'){
    if(source==='twitch'&&(actor.owner||isModerator))requestFallback('Requested by Twitch moderator '+user);
    return;
  }
  if(cmd==='tee'){
    const action=args[0]||'status';
    if(action==='on'||action==='off'){
      if(!actor.owner)return;
      if(action==='off'){teeBridge.stop();feed('system','Tee chat bridge disabled.');return;}
      const game=remoteGames.entries.find(g=>g.adapter==='tee');
      if(!game){feed('system','No Tee runtime configured.');return;}
      teeBridge.start(game,TWITCH_CHANNEL).then(()=>{feed('system','Tee crowd ready: !tee left|right|jump|hook|fire|stop');replies.twitch?.('Tee crowd ready: !tee left|right|jump|hook|fire|stop');}).catch(error=>feed('system','Tee bridge: '+error.message));
    }else if(!chatEffects.blocked&&teeBridge.command(action,{source,user}))feed('system',`${user}: Tee ${action}`);
    return;
  }
  if(['idea','vote','build'].includes(cmd)){
    try{
      if(cmd==='idea'){
        const result=ideaRounds.propose(actor,args.join(' '),messageId);
        if(!result.duplicate){
          const idea=result.round.ideas.find(i=>i.id===result.ideaId);
          fs.appendFileSync(IDEAS_FILE,JSON.stringify({user,idea:idea.text,source,at:Date.now(),roundId:result.round.id,ideaId:idea.id})+'\n');
          feed('system',`Idea saved: #${idea.id} by ${user}. ${result.round.ideas.length}/${result.round.settings.maxIdeas}.`);
        }
      }else if(cmd==='vote'){
        ideaRounds.vote(actor,Number(args[0]),messageId);feed('system',`${user}: ballot updated.`);
      }else{
        const action=args[0]||'status';
        if(action==='open')ideaRounds.open(actor);
        else if(action==='vote')ideaRounds.startVoting(actor);
        else if(action==='close')ideaRounds.finishVoting(actor);
        else if(action==='choose')ideaRounds.select(actor,args.slice(1).map(Number));
        else if(action==='approve')ideaRounds.approve(roundApprovalActor(actor,isModerator,approvalDelegation),{roundId:ideaRounds.current()?.id,reviewToken:args[1]});
        else if(action==='cancel')ideaRounds.cancel(actor);
        else if(action!=='status')throw new Error('Use !build open|vote|close|choose IDs|approve|cancel|status.');
        const round=ideaRounds.public();const state=round?`${round.phase}: ${round.ideas.length} ideas, ${round.voters} voters`:'no round';
        const review=round?.reviewToken?' · approval token '+round.reviewToken:'';
        feed('system','Build round '+state+review);if(replies[source])replies[source]('Build round '+state+review);
      }
    }catch(error){feed('system',`${user}: ${error.message}`);if(replies[source])replies[source](error.message);}
    return;
  }
  if(chatEffects.blocked)return;
  const handled = host.safeCall('onChat', { name: user, source }, cmd, args);
  if (handled) feed('system', `${user} used !${cmd}`);
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

// Bounded stream summary; never expose ballots, actor IDs or approval tokens.
let activityRevision=null,activityRound=null;
function streamActivity(){
 const round=ideaRounds.current(),revision=round?round.id+':'+round.revision+':'+Math.floor(Date.now()/1000):null;
 if(revision!==activityRevision){
  activityRevision=revision;const r=ideaRounds.public();
  activityRound=r?{phase:r.phase,ideas:r.ideas.length,voters:r.voters,voteEndsAt:r.voteEndsAt,
   highlights:r.ideas.slice().sort((a,b)=>b.votes-a.votes||a.id-b.id).slice(0,3).map(i=>({id:i.id,text:i.text.slice(0,100),author:i.author.slice(0,40),votes:i.votes}))}:null;
 }
 return {round:activityRound,fallback:fallback.active?fallback.reason:null,builder:'Isolated builder not connected',chatEffectsPaused:chatEffects.blocked,prediction:predictions.public(),delegation:approvalDelegation.public(),crowd:host.gameDir===path.join(ROOT,'games','community-grove')?crowdBursts.public():null};
}

// ---------- broadcast loop (view @ 10Hz; slow recipients skip obsolete frames) ----------
setInterval(() => {
  const players = [...clients.values()]
    .filter(c => c.kind === 'player')
    .map(c => ({ id: c.id, name: c.name }));
  broadcast({
    t: 'state',
    activity: streamActivity(),
    view: host.getView(),
    players,
    game: host.game ? { name: host.game.name, desc: host.game.meta.description || '',versionSha256:host.game.versionSha256 } : null,
    error: host.error,
    fallback,
    fund: { balance: treasury.balance, goal: CONFIG.generator.gameCostUsd, generating },
  });
}, STATE_INTERVAL_MS);

// ---------- http ----------
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };

const deliveryFile=path.join(ROOT,'runtime','twitch-deliveries.jsonl');
fs.mkdirSync(path.dirname(deliveryFile),{recursive:true});
const twitchDeliveries=new Set();
if(fs.existsSync(deliveryFile))for(const line of fs.readFileSync(deliveryFile,'utf8').split('\n')){try{const row=JSON.parse(line);if(Date.now()-row.at<600000)twitchDeliveries.add(row.id);}catch{}}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if(url.pathname==='/community/state'&&req.method==='GET'){if(!tickRounds()){res.writeHead(503,{'Content-Type':'application/json'});return res.end(JSON.stringify({code:'round_store_unavailable'}));}res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});return res.end(JSON.stringify({round:ideaRounds.public(),delegation:approvalDelegation.public(),channel:TWITCH_CHANNEL,twitchConnected:!!twitch?.ready,liveGame:host.game?.name,build:{mode:executionPolicy.mode,fallbackToLocal:false,workerConnected:false}}));}
  let bodyBytes=0;req.on('data',chunk=>{bodyBytes+=chunk.length;if(bodyBytes>262144){res.writeHead(413);res.end('request too large');req.destroy();}});
  if(url.pathname==='/community/assets'&&req.method==='GET'){res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});return res.end(JSON.stringify({assets:creatorAssets.catalog(),policy:{defaultTier:'free',paidCheckoutEnabled:false,platformCommission:null,creditPolicy:'Creator links stay in official game credits.'}}));}
  if(url.pathname==='/community/games'&&req.method==='GET'){res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});return res.end(JSON.stringify({...remoteGames.catalog(),teeBridge:teeBridge.status()}));}
  if(url.pathname==='/community/game-credits'&&req.method==='GET'){
    const publication=publicationSnapshot.get();
    res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});return res.end(JSON.stringify(publication));
  }
  if(url.pathname==='/community/asset-proposals'&&req.method==='POST'){
    let data='';req.on('data',chunk=>data+=chunk);req.on('end',()=>{try{const asset=creatorAssets.draft(JSON.parse(data));res.writeHead(202,{'Content-Type':'application/json'});res.end(JSON.stringify({id:asset.id,status:asset.status}));}catch(error){res.writeHead(400,{'Content-Type':'application/json'});res.end(JSON.stringify({error:error.message}));}});return;
  }
  // admin (localhost only)
  if (url.pathname.startsWith('/admin/')) {
    if(req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for'] || req.headers.forwarded){res.writeHead(403);return res.end('local admin only');}
    if(process.env.VA_ADMIN_TOKEN && !secretMatches('Bearer '+process.env.VA_ADMIN_TOKEN,req.headers.authorization)){res.writeHead(403);return res.end('admin authentication required');}
    const ip = req.socket.remoteAddress;
    if (ip !== '127.0.0.1' && ip !== '::1' && ip !== '::ffff:127.0.0.1') {
      res.writeHead(403); return res.end('localhost only');
    }
    const readBody = () => new Promise(r => { let b = ''; req.on('data', c => b += c); req.on('end', () => r(b)); });
    if(url.pathname==='/admin/approval-delegate'&&['GET','POST'].includes(req.method)){
      if(!secretMatches(process.env.VA_STREAMER_KEY,req.headers['x-streamer-key'])){res.writeHead(403);return res.end('streamer confirmation required');}
      try{const actor={owner:true,source:'streamer-ui',name:TWITCH_CHANNEL||'local streamer'};if(req.method==='POST'){const body=JSON.parse(await readBody()||'{}');if(body.action==='revoke')approvalDelegation.revoke(actor);else if(body.action==='grant')approvalDelegation.set(actor,body.name,body.seconds);else throw Error('Unknown delegation action.');}res.writeHead(200,{'Content-Type':'application/json'});return res.end(JSON.stringify({enabled:approvalDelegation.enabled,grant:approvalDelegation.public()}));}catch(error){res.writeHead(400);return res.end(error.message);}
    }
    if(url.pathname==='/admin/prediction'&&req.method==='POST'){
      if(!secretMatches(process.env.VA_STREAMER_KEY,req.headers['x-streamer-key'])){res.writeHead(403);return res.end('streamer confirmation required');}
      try{const data=JSON.parse(await readBody()||'{}'),actor={owner:true,source:'streamer-ui',name:TWITCH_CHANNEL||'local streamer'};if(data.action==='open')predictions.open(actor,data.choices);else if(data.action==='lock')predictions.lock(actor);else if(data.action==='resolve')predictions.resolve(actor,data.choice);else if(data.action==='cancel')predictions.cancel(actor);else throw Error('Unknown prediction action.');res.writeHead(200,{'Content-Type':'application/json'});return res.end(JSON.stringify(predictions.public()));}catch(error){res.writeHead(400);return res.end(error.message);}
    }
    if(url.pathname==='/admin/fallback-order'&&['GET','POST'].includes(req.method)){
      if(!secretMatches(process.env.VA_STREAMER_KEY,req.headers['x-streamer-key'])){res.writeHead(403);return res.end('streamer confirmation required');}
      try{if(req.method==='POST')fallbackPolicy.set(JSON.parse(await readBody()||'{}').order);res.writeHead(200,{'Content-Type':'application/json'});return res.end(JSON.stringify({enabled:fallbackPolicy.enabled,order:fallbackPolicy.effective}));}catch(error){res.writeHead(400);return res.end(error.message);}
    }
    if(url.pathname==='/admin/chat-effects'&&req.method==='POST'){
      if(!secretMatches(process.env.VA_STREAMER_KEY,req.headers['x-streamer-key'])){res.writeHead(403);return res.end('streamer confirmation required');}
      try{const body=JSON.parse(await readBody()||'{}');if(typeof body.paused!=='boolean')throw Error('paused must be boolean');const result=chatEffects.setPaused(body.paused);if(result.changed){if(chatEffects.blocked){crowdBursts.reset();teeBridge.pulse=null;teeBridge.tick();}feed('system',chatEffects.blocked?'Chat effects paused by local streamer':'Chat effects resumed by local streamer');}res.writeHead(200,{'Content-Type':'application/json'});return res.end(JSON.stringify({enabled:chatEffects.enabled,paused:chatEffects.blocked}));}catch(error){res.writeHead(400);return res.end(error.message);}
    }
    if(url.pathname==='/admin/fallback'&&req.method==='POST'){
      if(!secretMatches(process.env.VA_STREAMER_KEY,req.headers['x-streamer-key'])){res.writeHead(403);return res.end('streamer confirmation required');}
      const ok=await activateFallback('Requested by local streamer');res.writeHead(ok?200:503,{'Content-Type':'application/json'});return res.end(JSON.stringify(fallback));
    }
    if(url.pathname==='/admin/build-quarantine'&&(req.method==='GET'||req.method==='POST')){
      if(!secretMatches(process.env.VA_STREAMER_KEY,req.headers['x-streamer-key'])){res.writeHead(403);return res.end('streamer confirmation required');}
      try {
        const actor={owner:true,name:'streamer',source:'streamer-ui'};
        let result;
        if(req.method==='GET')result=buildQuarantine.list();
        else {
          const data=JSON.parse(await readBody()||'{}');
          // Recheck the canonical round content, not a caller-provided approval.
          const approvedRound=(allowCompleted=false)=>{
            if(!tickRounds())throw Error('Round storage unavailable.');
            const round=ideaRounds.public();
            const text=round?.selected.map(id=>round.ideas.find(i=>i.id===id).text).join('\n\n');
            if(!(allowCompleted&&round?.phase==='completed'&&ideaRounds.inputHash()===round.approvedInputHash)&&!ideaRounds.buildPermission(text,{roundId:round?.id,approvedInputHash:round?.approvedInputHash}))throw Error('Approved matching community round required.');
            return round;
          };
          if(data.action==='issue')result=buildQuarantine.issue(actor,approvedRound(),data);
          else if(data.action==='inspect')result=buildQuarantine.inspect(data.id);
          else if(data.action==='receive')result=buildQuarantine.receive(actor,data.id,data);
          else if(data.action==='begin-test')result=buildQuarantine.beginTest(actor,data.id,data.artifactHash);
          else if(data.action==='record-test')result=buildQuarantine.recordTest(actor,data.id,data.report);
          else if(data.action==='approve')result=buildQuarantine.approve(actor,data.id,data,approvedRound(true));
          else if(data.action==='cancel'||data.action==='reject')result=buildQuarantine.close(actor,data.id,data.action==='cancel'?'cancelled':'rejected');
          else throw Error('Unknown quarantine action.');
        }
        res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});return res.end(JSON.stringify(result));
      }catch(error){res.writeHead(400,{'Content-Type':'application/json'});return res.end(JSON.stringify({error:error.message}));}
    }
    if(url.pathname==='/admin/owner-status'&&req.method==='GET'){const ok=secretMatches(process.env.VA_STREAMER_KEY,req.headers['x-streamer-key']);res.writeHead(ok?200:403,{'Content-Type':'application/json'});return res.end(JSON.stringify({ok:!!ok}));}
    if(url.pathname==='/admin/assets'&&req.method==='GET'){res.writeHead(200,{'Content-Type':'application/json'});return res.end(JSON.stringify(creatorAssets.data.assets));}
    if(url.pathname==='/admin/game-publication'&&req.method==='POST'){
      try{if(!secretMatches(process.env.VA_STREAMER_KEY,req.headers['x-streamer-key'])){res.writeHead(403);return res.end('streamer confirmation required');}const data=JSON.parse(await readBody()||'{}');const result=data.action==='review'?reviewGame(ROOT,data.gameId):data.action==='publish'?publishGameCredits(creatorAssets,ROOT,data):null;if(!result)throw Error('Unknown publication action.');if(data.action==='publish')refreshPublication();res.writeHead(200,{'Content-Type':'application/json'});return res.end(JSON.stringify(result));}catch(error){res.writeHead(400);return res.end(error.message);}
    }
    if(url.pathname==='/admin/tee-bridge'&&req.method==='POST'){
      try{if(!secretMatches(process.env.VA_STREAMER_KEY,req.headers['x-streamer-key'])){res.writeHead(403);return res.end('streamer confirmation required');}const data=JSON.parse(await readBody()||'{}');let result;if(data.action==='enable')result=await teeBridge.start(remoteGames.entry(data.gameId),TWITCH_CHANNEL||'local');else if(data.action==='disable')result=teeBridge.stop();else throw Error('Unknown bridge action.');res.writeHead(200,{'Content-Type':'application/json'});return res.end(JSON.stringify(result));}catch(error){res.writeHead(400);return res.end(error.message);}
    }
    if(url.pathname==='/admin/remote-games'&&req.method==='POST'){
      try{if(!secretMatches(process.env.VA_STREAMER_KEY,req.headers['x-streamer-key'])){res.writeHead(403);return res.end('streamer confirmation required');}const data=JSON.parse(await readBody()||'{}');let result;if(data.action==='inspect')result=await remoteGames.inspect(data.gameId);else if(data.action==='create')result=await remoteGames.create(data.gameId,data.requestId,TWITCH_CHANNEL||'');else if(data.action==='start')result=await remoteGames.start(data.sessionId);else if(data.action==='reconcile')result=await remoteGames.reconcile(data.sessionId);else throw Error('Unknown remote game action.');res.writeHead(200,{'Content-Type':'application/json'});return res.end(JSON.stringify(result));}catch(error){res.writeHead(400);return res.end(error.message);}
    }
    if(url.pathname==='/admin/assets/import'&&req.method==='POST'){
      try{if(!secretMatches(process.env.VA_STREAMER_KEY,req.headers['x-streamer-key'])){res.writeHead(403);return res.end('streamer confirmation required');}const data=JSON.parse(await readBody()||'{}');const asset=importCuratedResource(creatorAssets,ROOT,data.key);res.writeHead(200,{'Content-Type':'application/json'});return res.end(JSON.stringify(asset));}catch(error){res.writeHead(400);return res.end(error.message);}
    }
    if(url.pathname==='/admin/assets/review'&&req.method==='POST'){
      try{const data=JSON.parse(await readBody()||'{}');if(!secretMatches(process.env.VA_STREAMER_KEY,req.headers['x-streamer-key'])){res.writeHead(403);return res.end('streamer confirmation required');}const asset=creatorAssets.review(data.id,{owner:true,name:'streamer'},data);res.writeHead(200,{'Content-Type':'application/json'});return res.end(JSON.stringify(asset));}catch(error){res.writeHead(400);return res.end(error.message);}
    }
    if(url.pathname==='/admin/round'&&req.method==='POST'){
      try{
        const data=JSON.parse(await readBody()||'{}');
        if(!secretMatches(process.env.VA_STREAMER_KEY,req.headers['x-streamer-key'])){res.writeHead(403);return res.end('streamer confirmation required');}
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
        error: host.error, fallback, chatEffectsPaused:chatEffects.blocked, generating, fund: { balance: treasury.balance, goal: CONFIG.generator.gameCostUsd },
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
      const gamesRoot=path.join(ROOT,'games'),relative=path.relative(gamesRoot,dir);
      const outside=value=>value==='..'||value.startsWith('..'+path.sep)||path.isAbsolute(value);
      if (!game || outside(relative) || !fs.existsSync(path.join(dir, 'game.js')) || outside(path.relative(fs.realpathSync(gamesRoot),fs.realpathSync(dir)))) {
        res.writeHead(400); return res.end('unknown game');
      }
      if(!await loadGameDir(dir)){res.writeHead(503);return res.end('Game failed to load; inspect fallback status.');}
      feed('system', `Game loaded: ${game}`);
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
      } else if (simulateEventCredits && evType === 'channel.subscription.new') {
        treasury.deposit(M.kickSubUsd, { source: 'kick-sub', user: body.subscriber?.username });
        feed('system', `Subscription from ${body.subscriber?.username || '?'} → +$${M.kickSubUsd}`);
      } else if (simulateEventCredits && evType === 'channel.subscription.gifts') {
        const n = body.giftees?.length || body.amount || 1;
        treasury.deposit(n * M.kickSubUsd, { source: 'kick-sub-gift', user: body.gifter?.username, count: n });
        feed('system', `${body.gifter?.username || '?'} gifted ${n} subs → +$${(n * M.kickSubUsd).toFixed(2)}`);
      } else if (simulateEventCredits && evType === 'kicks.gifted') {
        const amt = (body.kicks?.amount || body.amount || 0) * M.kickUsdPerKick;
        if (amt > 0) {
          treasury.deposit(amt, { source: 'kicks', user: body.sender?.username, kicks: body.kicks?.amount });
          feed('system', `${body.sender?.username || '?'} sent kicks → +$${amt.toFixed(2)}`);
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
        if (simulateEventCredits && body.subscription?.type === 'channel.subscribe') {
          const mult = { '1000': 1, '2000': 2, '3000': 5 }[ev.tier] || 1;
          treasury.deposit(M.twitchSubUsd * mult, { source: 'twitch-sub', user: ev.user_name, tier: ev.tier });
          feed('system', `sub T${ev.tier?.[0]} from ${ev.user_name} → +$${(M.twitchSubUsd * mult).toFixed(2)}`);
        } else if (simulateEventCredits && body.subscription?.type === 'channel.subscription.gift') {
          const n = ev.total || 1;
          treasury.deposit(M.twitchSubUsd * n, { source: 'twitch-sub-gift', user: ev.user_name, count: n });
          feed('system', `${ev.user_name} gifted ${n} subs → +$${(M.twitchSubUsd * n).toFixed(2)}`);
        } else if (simulateEventCredits && (body.subscription?.type === 'channel.bits.use' || body.subscription?.type === 'channel.cheer')) {
          const bits = ev.bits || ev.cheer?.bits || 0;
          const usd = bits * M.bitUsd;
          if (usd > 0) {
            treasury.deposit(usd, { source: 'twitch-bits', user: ev.user_name, bits });
            feed('system', `${bits} bits from ${ev.user_name} → +$${usd.toFixed(2)}`);
          }
        } else if (body.subscription?.type === 'channel.channel_points_custom_reward_redemption.add') {
          const command=rewardCommand(ev,CONFIG.twitch?.rewardCommands);
          if(command){
            const [cmd,...args]=command.slice(1).split(/\s+/);
            const handled=!chatEffects.blocked&&host.safeCall('onChat',{name:ev.user_name||ev.user_login||'viewer',source:'twitch-reward'},cmd,args);
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
    if (!simulateEventCredits) { res.writeHead(410); return res.end('Payments are not supported. This instance uses demo build credits.'); }
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
      feed('system', `Demo deposit${body.user ? ` from ${body.user}` : ''}: $${amt.toFixed(2)}`);
      res.writeHead(200); res.end('ok');
    });
    return;
  }

  // static — active game's client/ dir wins over public/ (custom-client games)
  let p = url.pathname === '/' ? '/index.html' : url.pathname;
  const clientRoot=path.join(host.gameDir,'client');
  let file=path.resolve(clientRoot,'.'+p);
  if(!staticFileInside(clientRoot,file)){
    file=path.resolve(PUBLIC,'.'+p);
    if(!staticFileInside(PUBLIC,file)){res.writeHead(404);return res.end('not found');}
  }
  res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

// ---------- ws ----------
const wss = new WebSocketServer({ server, maxPayload:16*1024, perMessageDeflate:WS_COMPRESSION });

wss.on('connection', (ws, req) => {
  ws.on('error',()=>ws.terminate());
  const url = new URL(req.url, 'http://x');
  const kind = url.pathname === '/spectate' ? 'spectator' : 'player';
  const name = (url.searchParams.get('name') || `anon-${Math.floor(1000 + Math.random() * 9000)}`).slice(0, 20);

  const client = { id: nextId++, communityId:crypto.randomUUID(), name, kind, role:'viewer' };
  clients.set(ws, client);

  ws.send(JSON.stringify({t:'credits',publication:publicationSnapshot.get()}));
  ws.send(JSON.stringify({
    t: 'welcome', id: client.id, name, kind,
    game: host.game ? { name: host.game.name, desc: host.game.meta.description || '' } : null,
    world: host.game?.meta.world || { w: 1280, h: 720 },
    recent: events.slice(-20),
  }));

  if (kind === 'player') {
    host.safeCall('onJoin', { id: client.id, name });
    feed('system', `${name} joined`);
  }

  ws.on('message', raw => {
    const second=Math.floor(Date.now()/1000);if(client.inputSecond!==second){client.inputSecond=second;client.inputCount=0;}
    if(++client.inputCount>120)return;
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    if(!msg||typeof msg!=='object'||Array.isArray(msg))return;
    if (kind !== 'player' && msg.t !== 'chat') return;
    if(msg.t==='claim-streamer'){
      const expected=process.env.VA_STREAMER_KEY;
      if(!secretMatches(expected,msg.key)){ws.send(JSON.stringify({t:'role',ok:false}));return;}
      if([...clients.values()].some(c=>c!==client && c.role==='streamer')){ws.send(JSON.stringify({t:'role',ok:false}));return;}
      client.role='streamer';host.safeCall('onJoin',{id:client.id,name,role:client.role});ws.send(JSON.stringify({t:'role',ok:true}));return;
    }
    if (msg.t === 'input') {
      host.safeCall('onInput', client.id, msg.data);
    } else if (msg.t === 'chat' && typeof msg.text === 'string') {
      handleChat({ user: name, text: msg.text.slice(0, msg.text.startsWith('!idea ')?10000:200), source: 'web', participantId:client.communityId });
    }
  });

  ws.on('close', () => {
    clients.delete(ws);
    if (kind === 'player') {
      host.safeCall('onLeave', { id: client.id, name });
      feed('system', `${name} left`);
    }
  });
});

server.listen(PORT, LISTEN_HOST, () => {
  console.log(`[vibe-arena] players  -> http://localhost:${server.address().port}/`);
  console.log(`[vibe-arena] overlay  -> http://localhost:${server.address().port}/overlay.html`);
  console.log(`[vibe-arena] chat test-> type in this terminal, or !cmd`);
  console.log(`[vibe-arena] game dir -> ${GAME_DIR}`);
  if (TWITCH_CHANNEL) console.log(`[vibe-arena] twitch   -> ${TWITCH_CHANNEL}`);
  if (KICK_CHANNEL) console.log(`[vibe-arena] kick webhook -> POST /webhook/kick`);
});

const shutdown=()=>{resourceWatcher.close();clearTimeout(resourceDebounce);teeBridge.stop();twitch?.close();host.stop();localChat.close();server.close();process.exit(0);};
process.on('SIGINT',shutdown);process.on('SIGTERM',shutdown);
