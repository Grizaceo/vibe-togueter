import { connectPlatformChat } from "./server/platform-chat.js";
import { createConstruction } from "./server/construction.js";
import { startGameRuntime } from "./server/game-lifecycle.js";
import { startPublication } from "./server/publication.js";
import { createWebhookRoutes } from "./server/routes/webhooks.js";
import {
  createRoomBroadcast,
  startBroadcast,
  attachRoomSockets,
} from "./server/broadcast.js";
import { createChatCommands } from "./server/chat-commands.js";
import { createAdminRoutes } from "./server/routes/admin.js";
import { createPublicRoutes } from "./server/routes/public.js";
import { loadServerConfig } from "./server/config.js";
import { startServer } from "./server/bootstrap.js";
import {
  PublicLink,
  LINK_PROBE_PATH,
  tunnelMode,
} from "./server/public-link.js";
// vibe-arena server: static files + websocket room + chat routing + admin API.
// Usage: node src/server.js [--port 8080] [--twitch <channel>] [--game-dir games/demo]

import http from "node:http";
import { ApprovalDelegation } from "./approval-delegation.js";
import { ChatPredictions } from "./chat-predictions.js";
import { CrowdBursts } from "./crowd-bursts.js";
import { FallbackPolicy } from "./fallback-policy.js";
import { ChatEffects } from "./chat-effects.js";
import path from "node:path";
import { CreatorAssets } from "./creator-assets.js";
import { RemoteGames } from "./remote-games.js";
import { TeeChatBridge } from "./tee-chat-bridge.js";
import { createLocalChat } from "./chat/local.js";

const {
  ROOT,
  PUBLIC,
  IDEAS_FILE,
  arg,
  PORT,
  LISTEN_HOST,
  TWITCH_CHANNEL,
  KICK_CHANNEL,
  GAME_DIR,
  CONFIG,
  simulateEventCredits,
} = await loadServerConfig();

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
  await startGameRuntime({
    ROOT,
    GAME_DIR,
    clients,
    crowdBursts,
    fallbackPolicy,
    feed,
    refreshPublication,
  });

// ---------- treasury + generator ----------
const {
  treasury,
  executionPolicy,
  ideaRounds,
  buildQuarantine,
  studioBuilds,
  builderWarm,
  builderWarmHeartbeat,
  tickRounds,
  requireNoPendingArtifact,
  readIdeas,
  generateFromIdea,
  startRoundTicks,
  isGenerating,
} = createConstruction({ ROOT, CONFIG, IDEAS_FILE, feed, loadGameDir });
const creatorAssets = new CreatorAssets(
  path.join(ROOT, "runtime", "creator-assets.json"),
);
const publication = startPublication({
  ROOT,
  PUBLIC,
  CONFIG,
  creatorAssets,
  host,
  broadcast,
});
const { clientCredits, resourceWatcher, getResourceDebounce } = publication;
function refreshPublication() {
  return publication.refreshPublication();
}

const remoteGames = new RemoteGames(
  CONFIG.remoteGames,
  path.join(ROOT, "runtime", "remote-games.json"),
);
const teeBridge = new TeeChatBridge();
startRoundTicks();

// ---------- chat pipeline ----------
const replies = {};
const handleChat = createChatCommands({
  ROOT,
  IDEAS_FILE,
  TWITCH_CHANNEL,
  getPublicURL: () => publicLink.url,
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

// Public entry link: !join only ever returns a URL verified to reach this process.
const configuredPublicURL = (
  process.env.VA_PUBLIC_URL ||
  CONFIG.publicUrl ||
  ""
).replace(/\/$/, "");
const setupComplete = Boolean(
  process.env.VA_ADMIN_TOKEN &&
  !CONFIG.monetization.eventsubSecret.startsWith("cambia-") &&
  !CONFIG.monetization.webhookSecret.startsWith("cambia-"),
);
if (configuredPublicURL && !setupComplete)
  throw new Error("Run npm run setup:local before exposing a public URL.");
const publicLink = new PublicLink({
  configuredURL: configuredPublicURL,
  mode: setupComplete
    ? tunnelMode(process.env.VA_TUNNEL || arg("tunnel", "auto"))
    : "off",
  disabledReason: setupComplete
    ? ""
    : "Public link off until npm run setup:local has been run.",
  command: process.env.VA_CLOUDFLARED || "cloudflared",
  log: (line) => console.log("[vibe-arena] " + line),
});

const twitch = await connectPlatformChat({
  ROOT,
  arg,
  TWITCH_CHANNEL,
  CONFIG,
  handleChat,
  replies,
  KICK_CHANNEL,
});

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
  isGenerating,
});

// ---------- http ----------
const webhookRoutes = createWebhookRoutes({
  ROOT,
  CONFIG,
  simulateEventCredits,
  handleChat,
  treasury,
  feed,
  chatEffects,
  host,
});

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
  isGenerating,
  handleChat,
  loadGameDir,
  publicLink,
});

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  if (url.pathname === LINK_PROBE_PATH && req.method === "GET")
    return publicLink.handleProbe(req, res);
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
  if (url.pathname.startsWith("/admin/")) return adminRoutes(req, res, url);

  if (webhookRoutes(req, res, url)) return;

  publicRoutes.staticFiles(req, res, url);
});

attachRoomSockets({
  server,
  clients,
  host,
  clientCredits,
  events,
  feed,
  handleChat,
});

startServer({
  server,
  PORT,
  LISTEN_HOST,
  GAME_DIR,
  TWITCH_CHANNEL,
  KICK_CHANNEL,
  builderWarmHeartbeat,
  resourceWatcher,
  getResourceDebounce,
  teeBridge,
  twitch,
  host,
  localChat,
  studioBuilds,
  publicLink,
});
