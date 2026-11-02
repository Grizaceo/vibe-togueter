import { startGameRuntime } from "./server/game-lifecycle.js";
import { startPublication } from "./server/publication.js";
import { createWebhookRoutes } from "./server/routes/webhooks.js";
import { createRoomBroadcast, startBroadcast, attachRoomSockets } from "./server/broadcast.js";
import { createChatCommands } from "./server/chat-commands.js";
import { createAdminRoutes } from "./server/routes/admin.js";
import { createPublicRoutes } from "./server/routes/public.js";
import { loadServerConfig } from "./server/config.js";
import { startServer } from "./server/bootstrap.js";
// vibe-arena server: static files + websocket room + chat routing + admin API.
// Usage: node src/server.js [--port 8080] [--twitch <channel>] [--game-dir games/demo]

import http from "node:http";
import { BuilderWarmSessions } from "./builder-warm-sessions.js";
import { StudioBuilds } from "./studio-builds.js";
import { CreateOSStudioWorker } from "./createos-studio-worker.js";
import {
  ApprovalDelegation,
} from "./approval-delegation.js";
import { ChatPredictions } from "./chat-predictions.js";
import { CrowdBursts } from "./crowd-bursts.js";
import { FallbackPolicy } from "./fallback-policy.js";
import { ChatEffects } from "./chat-effects.js";
import fs from "node:fs";
import path from "node:path";
import { CreatorAssets } from "./creator-assets.js";
import { RemoteGames } from "./remote-games.js";
import { TeeChatBridge } from "./tee-chat-bridge.js";
import { IdeaRounds } from "./idea-rounds.js";
import { buildPolicy, localBuildPermission } from "./build-policy.js";
import { BuildQuarantine } from "./build-quarantine.js";
import { Treasury } from "./treasury.js";
import { Generator } from "./generator.js";
import { createLocalChat } from "./chat/local.js";
import { TwitchAuth } from "./auth/twitch.js";

const { ROOT, PUBLIC, IDEAS_FILE, arg, PORT, LISTEN_HOST, TWITCH_CHANNEL, KICK_CHANNEL, GAME_DIR, CONFIG, simulateEventCredits } = await loadServerConfig();

const approvalDelegation = new ApprovalDelegation({
  enabled: CONFIG.features?.approvalDelegation,
});
const predictions = new ChatPredictions({
  enabled: CONFIG.features?.chatPredictions,
});
const crowdBursts = new CrowdBursts({
  enabled: CONFIG.features?.distinctPersonBursts,
});
const fallbackPolicy = new FallbackPolicy(
  path.join(ROOT, "runtime", "fallback-preferences.json"),
  {
    enabled: CONFIG.features?.configuredFallback,
    order: CONFIG.fallback?.order,
  },
);
const chatEffects = new ChatEffects({
  enabled: CONFIG.features?.chatPause,
  channel: TWITCH_CHANNEL,
});

// ---------- room ----------
const clients = new Map(); // ws -> {id,name,kind:'player'|'spectator'}

const { broadcast, feed, events } = createRoomBroadcast(clients);

const { host, requestFallback, activateFallback, loadGameDir, getFallback } =
  await startGameRuntime({ ROOT, GAME_DIR, clients, crowdBursts, fallbackPolicy, feed, refreshPublication });

// ---------- treasury + generator ----------
const treasury = new Treasury(path.join(ROOT, "treasury.jsonl"), {
  onChange: (e) => {
    if (e.kind === "deposit")
      feed(
        "system",
        `Demo build credits +${e.amountUsd.toFixed(2)} (${e.meta?.source || "manual"}); no payment received.`,
      );
  },
});
const generator = new Generator(CONFIG.generator, treasury, console.log);
let generating = false;
const executionPolicy = buildPolicy(CONFIG.build);
const ideaRounds = new IdeaRounds(
  path.join(ROOT, "runtime", "idea-rounds.json"),
  { settings: CONFIG.community?.rounds || {} },
);
ideaRounds.recoverInterrupted();
const buildQuarantine = new BuildQuarantine(
  path.join(ROOT, "runtime", "build-quarantine.json"),
);
const studioBuilds = new StudioBuilds(
  path.join(ROOT, "runtime", "studio-builds.json"),
  {
    enabled:
      executionPolicy.mode === "cloud-vm" &&
      CONFIG.build?.studioWorker?.enabled === true,
    adapter: new CreateOSStudioWorker(ROOT, CONFIG.build?.studioWorker || {}),
    rounds: ideaRounds,
    quarantine: buildQuarantine,
    evidenceDir: path.join(ROOT, "docs", "evidence"),
    onChange: (job) => {
      if (job)
        feed("system", "Isolated build: " + job.phase + ". " + job.message);
    },
  },
);
const builderWarm = new BuilderWarmSessions(ROOT, {
  ...CONFIG.build?.studioWorker,
  decisionUsed: () =>
    studioBuilds.data.jobs.some(
      (j) => j.approvalId === CONFIG.build?.studioWorker?.approvalId,
    ),
  enabled:
    executionPolicy.mode === "cloud-vm" &&
    CONFIG.build?.studioWorker?.enabled === true &&
    CONFIG.build?.studioWorker?.prewarmEnabled === true,
});
const builderWarmHeartbeat = setInterval(() => {
  void builderWarm.heartbeat().catch(() => {});
}, 60000);
const creatorAssets = new CreatorAssets(
  path.join(ROOT, "runtime", "creator-assets.json"),
);
const publication = startPublication({ ROOT, PUBLIC, CONFIG, creatorAssets, host, broadcast });
const { clientCredits, resourceWatcher, getResourceDebounce } = publication;
function refreshPublication() {
  return publication.refreshPublication();
}

const remoteGames = new RemoteGames(
  CONFIG.remoteGames,
  path.join(ROOT, "runtime", "remote-games.json"),
);
const teeBridge = new TeeChatBridge();
let roundStorageHealthy = true;
function tickRounds() {
  try {
    ideaRounds.tick();
    roundStorageHealthy = true;
    return true;
  } catch {
    if (roundStorageHealthy)
      console.error(
        "Round storage unavailable; pending decisions are retained.",
      );
    roundStorageHealthy = false;
    return false;
  }
}

function requireNoPendingArtifact() {
  studioBuilds.assertRoundCanAdvance();
}

function readIdeas() {
  if (!fs.existsSync(IDEAS_FILE)) return [];
  return fs
    .readFileSync(IDEAS_FILE, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => {
      try {
        return JSON.parse(l);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

async function generateFromIdea(idea, grant) {
  const permission = localBuildPermission(executionPolicy);
  if (!permission.ok) {
    feed("system", permission.reason);
    return permission;
  }
  if (!ideaRounds.buildPermission(idea, grant))
    return {
      ok: false,
      code: "round_approval_required",
      reason: "A matching streamer-approved round is required.",
    };
  if (generating)
    return { ok: false, reason: "A build is already in progress" };
  ideaRounds.beginBuild(idea, grant);
  generating = true;
  feed(
    "system",
    `Building game: "${idea}" (${CONFIG.generator.mode}/${CONFIG.generator.model})`,
  );
  try {
    const slug = `auto-${Date.now().toString(36)}`;
    const dir = path.join(ROOT, "games", slug);
    let r;
    try {
      r = await generator.generateGame(idea, dir);
    } catch (e) {
      r = { ok: false, reason: `Provider error: ${e.message}` };
    }
    if (r.ok) {
      ideaRounds.finishBuild(grant, true);
      await loadGameDir(dir);
      feed("system", `New game built ($${r.costUsd.toFixed(3)}): "${idea}"`);
      return { ok: true, game: slug, costUsd: r.costUsd };
    }
    ideaRounds.finishBuild(grant, false);
    feed("system", `Build failed: ${r.reason}`);
    return r;
  } finally {
    generating = false;
  }
}

// Community construction waits for a round decision and an isolated worker.
// A funded latest-message loop must not bypass the streamer's selection.
setInterval(tickRounds, 1000);

// ---------- chat pipeline ----------
const replies = {};
const handleChat = createChatCommands({
  ROOT,
  IDEAS_FILE,
  TWITCH_CHANNEL,
  getPublicURL: () => PUBLIC_URL,
  replies,
  chatEffects,
  crowdBursts,
  teeBridge,
  feed,
  host,
  requestFallback,
  approvalDelegation,
  predictions,
  remoteGames,
  ideaRounds,
  requireNoPendingArtifact,
});

const localChat = createLocalChat(handleChat);

// Platform reply senders are shared with the chat command handler.
const PUBLIC_URL =
  (process.env.VA_PUBLIC_URL || CONFIG.publicUrl || "").replace(/\/$/, "") ||
  null;
if (
  PUBLIC_URL &&
  (!process.env.VA_ADMIN_TOKEN ||
    CONFIG.monetization.eventsubSecret.startsWith("cambia-") ||
    CONFIG.monetization.webhookSecret.startsWith("cambia-"))
)
  throw new Error("Run npm run setup:local before exposing a public URL.");

let twitch;
if (TWITCH_CHANNEL) {
  const { connectTwitch } = await import("./chat/twitch.js");
  const auth = new TwitchAuth({
    file: arg("env-file", path.join(ROOT, ".env")),
  });
  const info = await auth.validate({ force: true });
  if (info.login.toLowerCase() !== TWITCH_CHANNEL.toLowerCase())
    throw new Error("Use your own authorized Twitch channel.");
  twitch = connectTwitch(TWITCH_CHANNEL, handleChat, { auth });
  replies.twitch = twitch.send;
}

// optional kick send (needs user token OAuth chat:write)
if (process.env.VA_KICK_TOKEN && CONFIG.kick?.broadcasterUserId) {
  replies.kick = (text) =>
    import("./chat/kick.js")
      .then((m) =>
        m.sendKickChat({
          accessToken: process.env.VA_KICK_TOKEN,
          broadcasterUserId: CONFIG.kick.broadcasterUserId,
          content: text,
        }),
      )
      .then(() => true)
      .catch((e) => {
        console.error(`[kick] send: ${e.message}`);
        return false;
      });
}

// kick chat: la lectura anónima murió (Kick dejó Pusher cloud). Vía oficial:
// webhook /webhook/kick — ver src/chat/kick.js y scripts/kick-subscribe.mjs.
if (KICK_CHANNEL) {
  console.log(
    `[kick] canal objetivo: ${KICK_CHANNEL} — suscribe el webhook con:`,
  );
  console.log(
    `[kick]   node scripts/kick-subscribe.mjs --token <APP_TOKEN> --user <broadcaster_user_id>`,
  );
}

startBroadcast({
  ROOT,
  CONFIG,
  ideaRounds,
  studioBuilds,
  chatEffects,
  predictions,
  approvalDelegation,
  host,
  crowdBursts,
  clients,
  broadcast,
  treasury,
  getFallback,
  isGenerating: () => generating,
});

// ---------- http ----------
const webhookRoutes = createWebhookRoutes({ ROOT, CONFIG, simulateEventCredits, handleChat, treasury, feed, chatEffects, host });

const publicRoutes = createPublicRoutes({
  CONFIG,
  tickRounds,
  ideaRounds,
  approvalDelegation,
  TWITCH_CHANNEL,
  getTwitch: () => twitch,
  host,
  executionPolicy,
  studioBuilds,
  builderWarm,
  creatorAssets,
  remoteGames,
  teeBridge,
  clientCredits,
  PUBLIC,
});

const adminRoutes = createAdminRoutes({
  ROOT,
  CONFIG,
  builderWarm,
  studioBuilds,
  TWITCH_CHANNEL,
  tickRounds,
  approvalDelegation,
  predictions,
  fallbackPolicy,
  chatEffects,
  crowdBursts,
  teeBridge,
  feed,
  activateFallback,
  getFallback,
  buildQuarantine,
  ideaRounds,
  creatorAssets,
  refreshPublication,
  remoteGames,
  requireNoPendingArtifact,
  readIdeas,
  treasury,
  generateFromIdea,
  host,
  clients,
  isGenerating: () => generating,
  handleChat,
  loadGameDir,
});

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  if (url.pathname === "/community/state" && req.method === "GET")
    return publicRoutes.state(req, res, url);
  let bodyBytes = 0;
  req.on("data", (chunk) => {
    bodyBytes += chunk.length;
    if (bodyBytes > 262144) {
      res.writeHead(413);
      res.end("request too large");
      req.destroy();
    }
  });
  if (publicRoutes.community(req, res, url)) return;
  if (url.pathname.startsWith("/admin/"))
    return adminRoutes(req, res, url);

  if (webhookRoutes(req, res, url)) return;

  publicRoutes.staticFiles(req, res, url);
});

attachRoomSockets({ server, clients, host, clientCredits, events, feed, handleChat });

startServer({ server, PORT, LISTEN_HOST, GAME_DIR, TWITCH_CHANNEL, KICK_CHANNEL, builderWarmHeartbeat, resourceWatcher, getResourceDebounce, teeBridge, twitch, host, localChat, studioBuilds });
