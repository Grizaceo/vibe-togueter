import path from "node:path";
import crypto from "node:crypto";
import { WebSocketServer } from "ws";
import { secretMatches } from "../request-boundaries.js";
import { performance } from "node:perf_hooks";
import {
  stateIntervalMs,
  WS_COMPRESSION,
  encodeMessage,
  sendRoom,
} from "../traffic.js";

// Optional latency instrumentation (VA_NET_PROBE=1): ping/pong and a server
// timestamp on each state frame. Off by default; nothing changes when off.
const NET_PROBE = process.env.VA_NET_PROBE === "1";

export function createRoomBroadcast(clients) {
  function broadcast(msg, except = null) {
    const data = encodeMessage(msg);
    for (const ws of clients.keys()) {
      if (ws !== except) sendRoom(ws, data, { state: msg.t === "state" });
    }
  }

  const events = []; // ring buffer of recent feed events for late joiners
  function feed(kind, text) {
    const ev = { t: "feed", kind, text, at: Date.now() };
    events.push(ev);
    if (events.length > 60) events.shift();
    broadcast(ev);
  }

  return { broadcast, feed, events };
}

export function startBroadcast({
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
}) {
  // Bounded stream summary; never expose ballots, actor IDs or approval tokens.
  let activityRevision = null,
    activityRound = null;
  function streamActivity() {
    const round = ideaRounds.current(),
      revision = round
        ? round.id + ":" + round.revision + ":" + Math.floor(Date.now() / 1000)
        : null;
    if (revision !== activityRevision) {
      activityRevision = revision;
      const r = ideaRounds.public();
      activityRound = r
        ? {
            credit: CONFIG.features?.communityCredit === true ? r.credit : null,
            phase: r.phase,
            ideas: r.ideas.length,
            voters: r.voters,
            voteEndsAt: r.voteEndsAt,
            highlights: r.ideas
              .slice()
              .sort((a, b) => b.votes - a.votes || a.id - b.id)
              .slice(0, 3)
              .map((i) => ({
                id: i.id,
                text: i.text.slice(0, 100),
                author: i.author.slice(0, 40),
                votes: i.votes,
              })),
          }
        : null;
    }
    return {
      round: activityRound,
      fallback: getFallback().active ? getFallback().reason : null,
      builder: studioBuilds.public()
        ? "Isolated build · " +
          studioBuilds.public().phase +
          " · no live runtime"
        : studioBuilds.status().workerConnected
          ? "Isolated worker ready for approved inputs"
          : "Studio builder: off — enabled per approved run",
      chatEffectsPaused: chatEffects.blocked,
      prediction: predictions.public(),
      delegation: approvalDelegation.public(),
      crowd:
        host.gameDir === path.join(ROOT, "games", "community-grove")
          ? crowdBursts.public()
          : null,
    };
  }

  // ---------- state stream ----------
  // Each new game frame goes out as soon as the configured rate allows (default:
  // the game's tickRate, capped at 30 Hz). A 10 Hz heartbeat keeps players,
  // errors and fallback state flowing when the game produces no frames.
  // Slow recipients still skip obsolete frames (sendRoom backpressure).
  const configuredHz =
    Number(process.env.VA_STATE_HZ || CONFIG.transport?.stateHz) || null;
  const interval = () =>
    stateIntervalMs({ configuredHz, tickRate: host.game?.meta?.tickRate });
  let lastSent = -Infinity,
    lastFrame = -Infinity,
    pending = null;
  function pump() {
    if (pending) return;
    const wait = lastSent + interval() - performance.now();
    if (wait <= 1) sendState();
    else pending = setTimeout(sendState, wait);
  }
  host.onFrame = () => {
    lastFrame = performance.now();
    pump();
  };
  setInterval(() => {
    if (performance.now() - lastFrame > 150) pump();
  }, 100);
  function sendState() {
    clearTimeout(pending);
    pending = null;
    lastSent = performance.now();
    const players = [...clients.values()]
      .filter((c) => c.kind === "player")
      .map((c) => ({ id: c.id, name: c.name }));
    broadcast({
      t: "state",
      ...(NET_PROBE ? { ts: Date.now() } : {}),
      activity: streamActivity(),
      view: host.getView(),
      players,
      game: host.game
        ? {
            name: host.game.name,
            desc: host.game.meta.description || "",
            versionSha256: host.game.versionSha256,
          }
        : null,
      error: host.error,
      fallback: getFallback(),
      fund: {
        balance: treasury.balance,
        goal: CONFIG.generator.gameCostUsd,
        generating: isGenerating(),
      },
    });
  }
}

export function attachRoomSockets({
  server,
  clients,
  host,
  clientCredits,
  events,
  feed,
  handleChat,
}) {
  let nextId = 1;
  // ---------- ws ----------
  const wss = new WebSocketServer({
    server,
    maxPayload: 16 * 1024,
    perMessageDeflate: WS_COMPRESSION,
  });

  wss.on("connection", (ws, req) => {
    ws.on("error", () => ws.terminate());
    const url = new URL(req.url, "http://x");
    const kind = url.pathname === "/spectate" ? "spectator" : "player";
    const name = (
      url.searchParams.get("name")?.trim() ||
      `anon-${Math.floor(1000 + Math.random() * 9000)}`
    ).slice(0, 20);

    const client = {
      id: nextId++,
      communityId: crypto.randomUUID(),
      name,
      kind,
      role: "viewer",
    };
    clients.set(ws, client);

    ws.send(JSON.stringify({ t: "credits", publication: clientCredits() }));
    ws.send(
      JSON.stringify({
        t: "welcome",
        id: client.id,
        name,
        kind,
        game: host.game
          ? { name: host.game.name, desc: host.game.meta.description || "" }
          : null,
        world: host.game?.meta.world || { w: 1280, h: 720 },
        recent: events.slice(-20),
      }),
    );

    if (kind === "player") {
      host.safeCall("onJoin", { id: client.id, name });
      feed("system", `${name} joined`);
    }

    ws.on("message", (raw) => {
      const second = Math.floor(Date.now() / 1000);
      if (client.inputSecond !== second) {
        client.inputSecond = second;
        client.inputCount = 0;
      }
      if (++client.inputCount > 120) return;
      let msg;
      try {
        msg = JSON.parse(raw);
      } catch {
        return;
      }
      if (!msg || typeof msg !== "object" || Array.isArray(msg)) return;
      if (NET_PROBE && msg.t === "ping" && Number.isFinite(msg.c)) {
        ws.send(JSON.stringify({ t: "pong", c: msg.c, s: Date.now() }));
        return;
      }
      if (kind !== "player" && msg.t !== "chat") return;
      if (msg.t === "claim-streamer") {
        const expected = process.env.VA_STREAMER_KEY;
        if (!secretMatches(expected, msg.key)) {
          ws.send(JSON.stringify({ t: "role", ok: false }));
          return;
        }
        if (
          [...clients.values()].some(
            (c) => c !== client && c.role === "streamer",
          )
        ) {
          ws.send(JSON.stringify({ t: "role", ok: false }));
          return;
        }
        client.role = "streamer";
        host.safeCall("onJoin", { id: client.id, name, role: client.role });
        ws.send(JSON.stringify({ t: "role", ok: true }));
        return;
      }
      if (msg.t === "input") {
        host.safeCall("onInput", client.id, msg.data);
      } else if (msg.t === "chat" && typeof msg.text === "string") {
        handleChat({
          user: name,
          text: msg.text.slice(0, msg.text.startsWith("!idea ") ? 10000 : 200),
          source: "web",
          participantId: client.communityId,
        });
      }
    });

    ws.on("close", () => {
      clients.delete(ws);
      if (kind === "player") {
        host.safeCall("onLeave", { id: client.id, name });
        feed("system", `${name} left`);
      }
    });
  });
}
