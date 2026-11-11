// Guest agent: the only process the VM3 image runs for va-game sessions.
// It dials OUT to the funnel game endpoint (VM3 never accepts inbound),
// receives va-game/1 lines plus `load`/`stop` control messages, and bridges
// them to the game worker's JSON-lines stdio. No game code runs on the
// controller host; this file ships inside the VM image.
// Env: VA_FUNNEL_URL (ws(s)://host), VA_ROOM, VA_GAME_TOKEN,
//      VA_GAME_FILE (optional path to a baked game source),
//      VA_WORKER (default /app/game-worker.js).
import { spawn } from "node:child_process";
import fs from "node:fs";

const FUNNEL = process.env.VA_FUNNEL_URL;
const ROOM = process.env.VA_ROOM;
const TOKEN = process.env.VA_GAME_TOKEN;
const WORKER = process.env.VA_WORKER || "/app/game-worker.js";
const GAME_FILE = process.env.VA_GAME_FILE || "";
const RETRY_MS = 1000;
const MAX_BUFFER = 4 * 1024 * 1024;

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
connect();
