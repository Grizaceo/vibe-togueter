// Guest agent: the only process the VM3 image runs for va-game sessions.
// It dials OUT to the funnel game endpoint (VM3 never accepts inbound),
// receives va-game/1 lines plus `load`/`stop` control messages, and bridges
// them to the game worker's JSON-lines stdio. No game code runs on the
// controller host; this file ships inside the VM image.
// Env: VA_FUNNEL_URL (ws(s)://host), VA_ROOM, VA_GAME_TOKEN,
//      VA_GAME_FILE (optional path to a baked game source),
//      VA_WORKER (default /app/game-worker.js),
//      VA_GAME_KIND ("sdk" default, "tee-native" runs teeworlds-rs in-VM),
//      VA_TEE_BIN / VA_TEE_PORT / VA_TEE_MODE (tee-native only).
import { spawn } from "node:child_process";
import fs from "node:fs";

const FUNNEL = process.env.VA_FUNNEL_URL;
const ROOM = process.env.VA_ROOM;
const TOKEN = process.env.VA_GAME_TOKEN;
const WORKER = process.env.VA_WORKER || "/app/game-worker.js";
const GAME_FILE = process.env.VA_GAME_FILE || "";
const RETRY_MS = 1000;
const MAX_BUFFER = 4 * 1024 * 1024;
const KIND = process.env.VA_GAME_KIND || "sdk";
const TEE_BIN = process.env.VA_TEE_BIN || "/usr/local/bin/teeworlds-rs-server";
const TEE_PORT = process.env.VA_TEE_PORT || "8303";
const TEE_MODE = process.env.VA_TEE_MODE || "dm";

if (!FUNNEL || !ROOM || !TOKEN) {
  console.error("guest-agent: VA_FUNNEL_URL, VA_ROOM and VA_GAME_TOKEN are required");
  process.exit(2);
}

let child = null;
let buffer = "";

function startWorker() {
  if (child) return;
  child = spawn(process.execPath, ["--experimental-vm-modules", WORKER], {
    stdio: ["pipe", "pipe", "inherit"],
    env: { PATH: "/usr/bin:/bin", HOME: "/tmp", LANG: "C.UTF-8" },
  });
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    buffer += chunk;
    if (buffer.length > MAX_BUFFER) {
      child.kill("SIGKILL");
      process.exit(3);
    }
    let end;
    while ((end = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, end);
      buffer = buffer.slice(end + 1);
      if (line && ws.readyState === 1) ws.send(line);
    }
  });
  child.on("exit", () => {
    child = null;
    // The worker only exits on stop or failure; either way the agent's job
    // for this incarnation is done.
    process.exit(0);
  });
  if (GAME_FILE) {
    try {
      const source = fs.readFileSync(GAME_FILE, "utf8");
      child.stdin.write(JSON.stringify({ op: "load", source }) + "\n");
    } catch (error) {
      console.error("guest-agent: cannot read game file: " + error.message);
      child.kill("SIGKILL");
      process.exit(4);
    }
  }
}

const wsUrl = `${FUNNEL.replace(/\/+$/, "")}/ws/game?room=${encodeURIComponent(ROOM)}&token=${encodeURIComponent(TOKEN)}`;
let ws = null;
let closed = false;

function connect() {
  if (closed) return;
  ws = new WebSocket(wsUrl);
  ws.onmessage = (event) => {
    const line = String(event.data ?? "");
    let msg = null;
    try {
      msg = JSON.parse(line);
    } catch {}
    if (msg?.t === "load" && typeof msg.source === "string") {
      startWorker();
      if (child && !child.stdin.destroyed)
        child.stdin.write(JSON.stringify({ op: "load", source: msg.source }) + "\n");
      return;
    }
    if (msg?.t === "stop") {
      closed = true;
      child?.kill("SIGKILL");
      ws.close();
      return;
    }
    // va-game/1 platform->game line: forward verbatim to the worker.
    if (!child) startWorker();
    if (child && !child.stdin.destroyed) child.stdin.write(line + "\n");
  };
  ws.onclose = (event) => {
    // 4003 = token rejected: game tokens are single-use per incarnation, so a
    // reconnect can never succeed — this VM's job is already over.
    if (!closed && event?.code !== 4003) setTimeout(connect, RETRY_MS).unref?.();
  };
  ws.onerror = () => {};
}

// teeworlds-rs runs inside this VM (VA_GAME_KIND=tee-native). The funnel asks
// for binary "legs" on the game socket; each leg is piped to the local server
// untouched — the agent never parses tee bytes either.
async function teeNative() {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const server = spawn(TEE_BIN, [], {
    env: {
      PATH: process.env.PATH || "/usr/bin:/bin",
      HOME: "/tmp",
      PORT: TEE_PORT,
      MODE: TEE_MODE,
      BOTS: "0",
      MAX_PLAYERS: "24",
    },
    stdio: ["ignore", "ignore", "inherit"],
  });
  const legs = new Map(); // leg id -> {local, remote, lq, rq, lOpen, rOpen}
  let gameWs = null;
  let stopping = false;

  function shutdown(code = 0) {
    if (stopping) return;
    stopping = true;
    for (const pair of legs.values()) {
      try { pair.local.close(); } catch {}
      try { pair.remote.close(); } catch {}
    }
    legs.clear();
    try { server.kill("SIGKILL"); } catch {}
    try { gameWs?.close(); } catch {}
    setTimeout(() => process.exit(code), 50).unref?.();
  }
  // Inside the async body a bail unwinds to the caller's catch; event
  // handlers must not throw, so they shutdown directly.
  const bail = (code = 1) => {
    shutdown(code);
    throw Error("guest-agent: tee shutdown");
  };

  function openLeg(id) {
    if (stopping || legs.has(id)) return;
    const local = new WebSocket(`ws://127.0.0.1:${TEE_PORT}/ws`);
    const remote = new WebSocket(
      `${FUNNEL.replace(/\/+$/, "")}/ws/leg?room=${encodeURIComponent(ROOM)}&leg=${encodeURIComponent(id)}`,
    );
    local.binaryType = "arraybuffer";
    remote.binaryType = "arraybuffer";
    const pair = { local, remote, lq: [], rq: [], lOpen: false, rOpen: false };
    legs.set(id, pair);
    const send = (ws, data) => {
      try {
        ws.send(data);
        return true;
      } catch {
        return false;
      }
    };
    const pump = () => {
      if (!(pair.lOpen && pair.rOpen)) return;
      for (const m of pair.lq.splice(0)) if (!send(remote, m)) return dropLeg(id);
      for (const m of pair.rq.splice(0)) if (!send(local, m)) return dropLeg(id);
    };
    const queue = (dir, data) => {
      const q = dir === "l" ? pair.lq : pair.rq;
      if (q.length >= 1024) return dropLeg(id);
      q.push(data);
    };
    local.onopen = () => { pair.lOpen = true; pump(); };
    remote.onopen = () => { pair.rOpen = true; pump(); };
    local.onmessage = (e) => {
      if (pair.lOpen && pair.rOpen) {
        if (!send(remote, e.data)) dropLeg(id);
      } else queue("l", e.data);
    };
    remote.onmessage = (e) => {
      if (pair.lOpen && pair.rOpen) {
        if (!send(local, e.data)) dropLeg(id);
      } else queue("r", e.data);
    };
    local.onclose = () => dropLeg(id);
    remote.onclose = () => dropLeg(id);
    local.onerror = () => {};
    remote.onerror = () => {};
  }
  function dropLeg(id) {
    const pair = legs.get(id);
    if (!pair) return;
    legs.delete(id);
    try { pair.local.close(); } catch {}
    try { pair.remote.close(); } catch {}
  }

  server.on("error", () => shutdown(1));
  server.on("exit", () => {
    // The game server is gone: this incarnation has nothing left to bridge.
    if (!stopping) shutdown(1);
  });

  // Health first: the tee server must be listening before any leg can pair.
  const deadline = Date.now() + 60000;
  for (;;) {
    if (server.exitCode !== null || server.signalCode !== null) bail(1);
    try {
      const res = await fetch(`http://127.0.0.1:${TEE_PORT}/healthz`, {
        signal: AbortSignal.timeout(1000),
      });
      if (res.ok) break;
    } catch {}
    if (Date.now() > deadline) bail(1);
    await sleep(200);
  }

  function connect() {
    if (stopping) return;
    gameWs = new WebSocket(wsUrl);
    gameWs.onmessage = (event) => {
      const line = String(event.data ?? "");
      let msg = null;
      try { msg = JSON.parse(line); } catch {}
      if (msg?.t === "leg-open" && typeof msg.leg === "string") {
        openLeg(msg.leg);
        return;
      }
      if (msg?.t === "stop") return shutdown(0);
      // va-game/1 lines and load control do not apply to a native game.
    };
    gameWs.onclose = (event) => {
      if (stopping) return;
      if (event?.code === 4003) return shutdown(0); // incarnation over
      setTimeout(connect, RETRY_MS).unref?.();
    };
    gameWs.onerror = () => {};
  }
  connect();
}

if (KIND === "tee-native") teeNative().catch(() => process.exit(1));
else connect();
