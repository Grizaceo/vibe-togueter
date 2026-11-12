import { connectPlatformChat } from "./server/platform-chat.js";
import { createConstruction } from "./server/construction.js";
import { startGameRuntime } from "./server/game-lifecycle.js";
import { startPublication } from "./server/publication.js";
import { createWebhookRoutes } from "./server/routes/webhooks.js";
import { createKickEventHandler } from "./server/kick-events.js";
import {
  createRoomBroadcast,
  startBroadcast,
  attachRoomSockets,
} from "./server/broadcast.js";
import { createChatCommands } from "./server/chat-commands.js";
import { createAdminRoutes } from "./server/routes/admin.js";
import { createPublicRoutes } from "./server/routes/public.js";
import { loadServerConfig } from "./server/config.js";
import { applySecurityHeaders } from "./server/security-headers.js";
import { startServer } from "./server/bootstrap.js";
import {
  PublicLink,
  LINK_PROBE_PATH,
  tunnelMode,
} from "./server/public-link.js";
// vibe-arena server: static files + websocket room + chat routing + admin API.
// Usage: node src/server.js [--port 8080] [--twitch <channel>] [--game-dir games/demo]

import http from "node:http";
import fs from "node:fs";
import crypto from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { ApprovalDelegation } from "./approval-delegation.js";
import { ChatPredictions } from "./chat-predictions.js";
import { CrowdBursts } from "./crowd-bursts.js";
import { FallbackPolicy } from "./fallback-policy.js";
import { ChatEffects } from "./chat-effects.js";
import path from "node:path";
import { CreatorAssets } from "./creator-assets.js";
import { RemoteGames } from "./remote-games.js";
import { TeeChatBridge } from "./tee-chat-bridge.js";
import { createTeeSession } from "./server/tee-session.js";
import { createosBackend } from "./vm3/createos.js";
import { createVm3Host, teeImageSpec } from "./vm3/host.js";
import { createLocalChat } from "./chat/local.js";
import { createSeating } from "./server/seating.js";

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
const teeSession = createTeeSession({ teeBridge, feed });

// ---------- VM3 tee runtime (opt-in; docs/platform/VM3_REHEARSAL.md) ----------
// VA_VM3=1 enables it without editing the tracked config. teeControl is a
// lazy delegate: chat commands are wired before the host exists, and every
// call lands on the VM3 tee once createVm3Host resolves below.
const vm3Enabled = CONFIG.vm3?.enabled === true || process.env.VA_VM3 === "1";
let vm3 = null;
const teeControl = {
  chat: (message) => vm3?.tee.chat(message) ?? null,
  pause: (reason) => vm3?.tee.pause(reason) ?? false,
  resume: (reason) => vm3?.tee.resume(reason) ?? false,
  status: () => {
    if (!vm3) return teeSession.status();
    const s = vm3.manager.status();
    return {
      ...vm3.tee.status(),
      vm3: { phase: s.phase, incarnation: s.incarnation, image: s.image },
    };
  },
  start: (...args) => (vm3 ? vm3.open() : teeSession.start(...args)),
  stop: (reason) => {
    if (!vm3) return teeSession.stop(reason);
    const status = teeControl.status();
    feed("system", "Tee runs in VM3 until the session closes");
    return status;
  },
};
const teeSurface = vm3Enabled ? teeControl : teeSession;
startRoundTicks();

// ---------- seats (docs/platform/IDENTITY_SEATS.md) ----------
const seating = createSeating({
  clients,
  host,
  feed,
  requireBoundKey: CONFIG.seats?.requireBoundKey === true,
});
if (seating.seats.ephemeral)
  console.log(
    "[vibe-arena] seats    -> per-process key (run npm run setup:local to add VA_SEAT_KEY)",
  );

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
  teeSession: teeSurface,
  feed,
  host,
  requestFallback: (reason) => {
    if (!vm3) return requestFallback(reason);
    vm3
      .fallback(reason)
      .catch((e) =>
        feed(
          "system",
          "VM3 fallback failed: " + String(e?.message || e).slice(0, 120),
        ),
      );
  },
  approvalDelegation,
  predictions,
  remoteGames,
  ideaRounds,
  requireNoPendingArtifact,
  claimPairing: (code, principal) => seating.claim(code, principal),
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
// One Kick event handler serves the direct route and the funnel forward:
// redeliveries dedupe on a single ledger across both paths.
const kickEvents = createKickEventHandler({
  CONFIG,
  simulateEventCredits,
  handleChat,
  treasury,
  feed,
});
const webhookRoutes = createWebhookRoutes({
  ROOT,
  CONFIG,
  simulateEventCredits,
  handleChat,
  treasury,
  feed,
  chatEffects,
  host,
  kickEvents,
});

// ---------- VM3 host (only when enabled) ----------
// The funnel json is written by scripts/vm3/funnel-createos.mjs; the tee
// bundle by scripts/vm3/build-tee-bundle.mjs. Both are verified before the
// first VM can be created. open() runs in the background so the HTTP listen
// is never blocked by provider provisioning.
if (vm3Enabled) {
  const vm3Cfg = CONFIG.vm3 || {};
  const vm3Room = vm3Cfg.room || "main";
  const funnelFile = path.resolve(ROOT, vm3Cfg.funnel || "runtime/vm3/funnel.json");
  let funnel = null;
  try {
    funnel = JSON.parse(fs.readFileSync(funnelFile, "utf8"));
  } catch {}
  if (funnel?.phase !== "up" || !funnel.wsUrl || !funnel.secret || !funnel.host)
    throw new Error(
      `VM3 is enabled but ${vm3Cfg.funnel || "runtime/vm3/funnel.json"} is missing or not phase "up"; run scripts/vm3/funnel-createos.mjs up first.`,
    );
  const bundlePath = path.resolve(
    ROOT,
    vm3Cfg.tee?.bundle || "runtime/vm3/tee-bundle.tar",
  );
  const sidecarPath = bundlePath.replace(/\.tar$/, "") + ".json";
  if (!fs.existsSync(bundlePath))
    throw new Error(`VM3 tee bundle missing: ${vm3Cfg.tee?.bundle}`);
  const sidecar = JSON.parse(fs.readFileSync(sidecarPath, "utf8"));
  const bundleSha = crypto
    .createHash("sha256")
    .update(fs.readFileSync(bundlePath))
    .digest("hex");
  if (bundleSha !== sidecar.sha256)
    throw new Error(
      "VM3 tee bundle sha256 does not match tee-bundle.json; rebuild with scripts/vm3/build-tee-bundle.mjs.",
    );
  const execute = promisify(execFile);
  const cli = async (args, options = {}) => {
    try {
      const result = await execute("createos", args, {
        timeout: options?.timeout ?? 60000,
        maxBuffer: 8 * 1024 * 1024,
      });
      return result.stdout;
    } catch (error) {
      // Provider diagnostics can carry sensitive detail; keep the exit only.
      throw new Error(
        `createos ${args.slice(0, 3).join(" ")} failed (exit ${error.code ?? "?"})`,
      );
    }
  };
  const co = vm3Cfg.createos || {};
  const backend = createosBackend({
    cli,
    shape: co.shape || "s-1vcpu-2gb",
    autoPause: co.autoPause || "30m",
    egress: [funnel.host],
    rootfs: co.rootfs || "devbox:1",
    files: [
      {
        local: path.join(ROOT, "src", "vm3", "guest-agent.js"),
        remote: "/opt/va/guest-agent.js",
      },
      { local: bundlePath, remote: "/tmp/tee-bundle.tar" },
    ],
    setup: [
      ["mkdir", "-p", "/opt/tee"],
      ["tar", "-xf", "/tmp/tee-bundle.tar", "-C", "/opt/tee"],
    ],
    agentCommand: "/opt/va/guest-agent.js",
    agentCwd: "/opt/tee",
    agentEnv: { VA_TEE_BIN: "/opt/tee/teeworlds-rs-server" },
  });
  vm3 = await createVm3Host({
    backend,
    funnelUrl: funnel.wsUrl,
    room: vm3Room,
    vaultSecret: funnel.secret,
    images: {
      default: teeImageSpec({
        ref: co.rootfs || "devbox:1",
        mode: vm3Cfg.tee?.mode || "dm",
      }),
    },
    handleChat,
    onKickEvent: kickEvents,
    feed,
    journalDir: path.join(ROOT, "runtime"),
    chatName: TWITCH_CHANNEL || vm3Room,
    onEvent: (kind) => console.log("[vibe-arena] vm3 " + kind),
  });
  vm3
    .open()
    .then((status) =>
      feed("system", `VM3 tee ready (phase ${status?.phase || "?"}).`),
    )
    .catch((error) =>
      feed(
        "system",
        "VM3 tee failed: " + String(error?.message || error).slice(0, 120),
      ),
    );
}

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
  teeSession: teeSurface,
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
  teeSession: teeSurface,
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
  seating,
});

const server = http.createServer(async (req, res) => {
  applySecurityHeaders(res, remoteGames);
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
  seating,
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
  teeSession: teeSurface,
  vm3,
  twitch,
  host,
  localChat,
  studioBuilds,
  publicLink,
});
