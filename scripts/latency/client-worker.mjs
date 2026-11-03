// One headless viewer. Runs the real public/client.js and public/render.js with
// browser globals stubbed: a recording canvas (what was drawn), a 60 Hz vsync
// grid (when it reaches the screen) and requestAnimationFrame on that grid.
import { parentPort, workerData } from "node:worker_threads";
import { performance } from "node:perf_hooks";
import { mulberry32 } from "./netem-proxy.mjs";

const cfg = workerData;
const rand = mulberry32(cfg.seed);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const between = (a, b) => a + rand() * (b - a);

// ---------- vsync grid and requestAnimationFrame ----------
const FRAME = 1000 / 60;
const phase = cfg.vsyncPhase * FRAME;
const nextVsync = (t) => phase + Math.ceil((t - phase) / FRAME) * FRAME;
let rafQueue = [],
  rafTimer = null,
  rafNow = null,
  rafId = 0,
  lastVsync = -Infinity;
// Fires queued callbacks exactly once per vsync tick. Node timers round to whole
// milliseconds and can wake before the tick, so wait out the remainder and
// never run two batches for the same tick.
function armRaf() {
  if (rafTimer) return;
  const target = nextVsync(Math.max(performance.now(), lastVsync) + 0.5);
  const fire = () => {
    const early = target - performance.now();
    if (early > 0.05) {
      rafTimer = setTimeout(fire, Math.max(1, Math.ceil(early)));
      return;
    }
    rafTimer = null;
    lastVsync = target;
    const queue = rafQueue;
    rafQueue = [];
    rafNow = target;
    for (const { cb } of queue) cb(rafNow);
    rafNow = null;
  };
  rafTimer = setTimeout(fire, Math.max(0, Math.floor(target - performance.now())));
}
globalThis.requestAnimationFrame = (cb) => {
  rafQueue.push({ cb, id: ++rafId });
  armRaf();
  return rafId;
};
globalThis.cancelAnimationFrame = (id) => {
  rafQueue = rafQueue.filter((e) => e.id !== id);
};

// ---------- browser globals ----------
const windowListeners = new Map();
globalThis.location = {
  search: cfg.search || "",
  protocol: "http:",
  host: cfg.host,
};
globalThis.localStorage = { getItem: () => null, setItem() {} };
globalThis.addEventListener = (name, fn) => {
  if (!windowListeners.has(name)) windowListeners.set(name, []);
  windowListeners.get(name).push(fn);
};
globalThis.Image = class {
  complete = false;
  naturalWidth = 0;
};
const dispatch = (name, key) => {
  for (const fn of windowListeners.get(name) || [])
    fn({ key, target: { tagName: "CANVAS" }, preventDefault() {} });
};

// ---------- measurement state ----------
// Marble traffic is measured only while marbles race (not lobby or podium).
const inWindow = () =>
  m.measuring && (cfg.game !== "marble-race" || current === "racing");
const m = {
  measuring: false,
  windowMs: 0,
  windowBytes: 0,
  presented: 0,
  distinct: 0,
  stateMessages: 0,
  otherMessages: 0,
  latencies: [],
  timeouts: 0,
  rtts: [],
  transit: [],
};
let lastSignature = null,
  current = null, // value the probe tracks in the latest presented frame
  frameWaiters = [];

const { WebSocket: BaseSocket } = await import(cfg.wsModule);
let socket = null;
class ProbeSocket extends BaseSocket {
  constructor(url) {
    super(url, { perMessageDeflate: true });
    socket = this;
    this.on("message", (data, isBinary) => {
      if (!inWindow()) return;
      if (isBinary) {
        m.stateMessages++;
        const bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : data;
        if (bytes[0] & 0x80)
          m.transit.push(
            Date.now() -
              new DataView(bytes.buffer, bytes.byteOffset).getFloat64(5),
          );
        return;
      }
      const text = data.toString();
      if (text.startsWith('{"t":"pong"')) {
        const pong = JSON.parse(text);
        m.rtts.push(performance.now() - pong.c);
      } else if (text.startsWith('{"t":"state"') || /^\{"t":"[kd]"/.test(text)) {
        m.stateMessages++;
        const ts = /^\{"t":"\w+","ts":(\d+)/.exec(text);
        if (ts) m.transit.push(Date.now() - Number(ts[1]));
      } else m.otherMessages++;
    });
  }
}
globalThis.WebSocket = ProbeSocket;

// ---------- recording canvas ----------
function track(ops) {
  const name = cfg.name;
  if (cfg.game === "grove") {
    for (let i = 0; i < ops.length; i++)
      if (ops[i] === "T" && ops[i + 1] === name) return ops[i + 2];
    return null;
  }
  if (cfg.game === "duel") {
    for (let i = 0; i < ops.length; i++)
      if (ops[i] === "R" && ops[i + 2] === 558 && ops[i + 5] === "#b596ff")
        return ops[i + 1];
    return null;
  }
  if (cfg.game === "marble-race") {
    for (let i = 0; i < ops.length; i++)
      if (ops[i] === "T") {
        const text = String(ops[i + 1]);
        if (text.includes("!race to start")) return "lobby";
        if (text.startsWith("⏱")) return "racing";
      }
    return "other";
  }
  for (let i = 0; i < ops.length; i++)
    if (ops[i] === "T" && ops[i + 1] === name) return 1;
  return 0;
}
let lastFrameAt = null,
  lastBytes = 0;
function onFrame(ops) {
  const now = performance.now();
  const presentedAt = rafNow ?? nextVsync(now);
  const signature = ops.join("|");
  const bytes = socket?._socket?.bytesRead ?? 0;
  if (inWindow()) {
    m.presented++;
    if (signature !== lastSignature) m.distinct++;
    if (lastFrameAt !== null) {
      m.windowMs += now - lastFrameAt;
      m.windowBytes += bytes - lastBytes;
    }
  }
  lastFrameAt = now;
  lastBytes = bytes;
  lastSignature = signature;
  current = track(ops);
  const waiters = frameWaiters;
  frameWaiters = [];
  for (const w of waiters) w(presentedAt);
}
function recordingCanvas() {
  let depth = 0,
    ops = [],
    fillStyle = "#000";
  const ctx = {
    get fillStyle() {
      return fillStyle;
    },
    set fillStyle(v) {
      fillStyle = v;
    },
    strokeStyle: "#000",
    lineWidth: 1,
    font: "",
    textAlign: "start",
    textBaseline: "alphabetic",
    globalAlpha: 1,
    save() {
      depth++;
    },
    restore() {
      if (--depth === 0) {
        const done = ops;
        ops = [];
        onFrame(done);
      }
    },
    translate() {},
    scale() {},
    rotate() {},
    setTransform() {},
    clearRect() {},
    beginPath() {},
    moveTo(x, y) {
      ops.push("M", x, y);
    },
    lineTo(x, y) {
      ops.push("L", x, y);
    },
    arc(x, y, r) {
      ops.push("A", x, y, r);
    },
    fill() {
      ops.push("F", fillStyle);
    },
    stroke() {
      ops.push("S", ctx.strokeStyle, ctx.lineWidth);
    },
    fillRect(x, y, w, h) {
      ops.push("R", x, y, w, h, fillStyle);
    },
    fillText(text, x, y) {
      ops.push("T", text, x, y);
    },
    drawImage(img, x, y, w, h) {
      ops.push("I", x, y, w, h);
    },
  };
  return {
    width: 0,
    height: 0,
    clientWidth: 1280,
    clientHeight: 720,
    getContext: () => ctx,
    addEventListener() {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 1280, height: 720 }),
    setPointerCapture() {},
  };
}

// Resolves with the presentation time of the first frame where pred(current) holds.
function waitFrame(pred, timeoutMs) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      frameWaiters = frameWaiters.filter((w) => w !== check);
      resolve(null);
    }, timeoutMs);
    const check = (at) => {
      if (pred(current)) {
        clearTimeout(timer);
        resolve(at);
      } else frameWaiters.push(check);
    };
    frameWaiters.push(check);
  });
}
async function settle() {
  // Wait until the tracked value has not changed for 250 ms of frames.
  let value = current,
    since = performance.now();
  const end = since + 3000;
  while (performance.now() < end) {
    await waitFrame(() => true, 200);
    if (current !== value) {
      value = current;
      since = performance.now();
    } else if (performance.now() - since >= 250) return;
  }
}

// ---------- connect with the real client ----------
const { connect } = await import(cfg.clientModule);
const api = connect({ name: cfg.name, canvas: recordingCanvas() });
await new Promise((resolve, reject) => {
  const end = Date.now() + 10000;
  const poll = () =>
    socket?.readyState === 1
      ? resolve()
      : Date.now() > end
        ? reject(Error("socket did not open"))
        : setTimeout(poll, 20);
  poll();
});
if (cfg.role === "probe" && cfg.game === "duel")
  api.claimStreamer(cfg.streamerKey);
const pinger = setInterval(() => {
  if (cfg.probePing && socket.readyState === 1)
    socket.send(JSON.stringify({ t: "ping", c: performance.now() }));
}, 500);

await sleep(cfg.warmupMs);
const startBytes = socket._socket.bytesRead;
const start = performance.now();
const end = start + cfg.durationMs;
m.measuring = true;

async function probeKeys() {
  let dir = 1;
  while (performance.now() < end - 3000) {
    // No frame wait here: inputs must land at a random phase of the send cadence.
    await sleep(between(200, 450));
    const before = current;
    if (typeof before !== "number") {
      await sleep(200);
      continue;
    }
    const key = dir > 0 ? "ArrowRight" : "ArrowLeft";
    const t0 = performance.now();
    dispatch("keydown", key);
    const at = await waitFrame(
      (v) => typeof v === "number" && Math.abs(v - before) > 0.05,
      3000,
    );
    if (at === null) m.timeouts++;
    else m.latencies.push(at - t0);
    await sleep(100);
    dispatch("keyup", key);
    await settle();
    dir = -dir;
  }
}
async function probeChat() {
  // Marble lobby: !reset removes our marble, !play adds it back.
  while (performance.now() < end - 3000) {
    await sleep(between(300, 600));
    const present = current === 1;
    const t0 = performance.now();
    api.sendChat(present ? "!reset" : "!play");
    const at = await waitFrame((v) => (v === 1) !== present, 3000);
    if (at === null) m.timeouts++;
    else m.latencies.push(at - t0);
  }
}
async function raceLoop() {
  // Keep marbles racing so throughput reflects motion, not an idle lobby.
  while (performance.now() < end) {
    if (current === "lobby") api.sendChat("!race");
    await sleep(500);
  }
}
async function passive() {
  while (performance.now() < end) {
    if (cfg.game === "grove") {
      const key = rand() < 0.5 ? "ArrowLeft" : "ArrowRight";
      dispatch("keydown", key);
      await sleep(between(300, 800));
      dispatch("keyup", key);
      await sleep(between(500, 1500));
    } else if (cfg.game === "duel") {
      api.sendChat(rand() < 0.5 ? "!left" : "!right");
      await sleep(between(1000, 2000));
    } else await sleep(250);
  }
}

if (cfg.role === "probe") {
  if (cfg.game === "grove" || cfg.game === "duel") await probeKeys();
  else if (cfg.game === "marble-lobby") await probeChat();
  else if (cfg.game === "marble-race") await raceLoop();
} else await passive();
while (performance.now() < end) await sleep(20);

m.measuring = false;
const whole = cfg.game !== "marble-race";
const seconds = whole
  ? (performance.now() - start) / 1000
  : m.windowMs / 1000;
clearInterval(pinger);
parentPort.postMessage({
  name: cfg.name,
  role: cfg.role,
  seconds,
  bytesPerSecond:
    (whole ? socket._socket.bytesRead - startBytes : m.windowBytes) / seconds,
  stateMessagesPerSecond: m.stateMessages / seconds,
  presentedFramesPerSecond: m.presented / seconds,
  distinctFramesPerSecond: m.distinct / seconds,
  latencies: m.latencies,
  timeouts: m.timeouts,
  rtts: m.rtts,
  transit: m.transit,
});
socket.close();
setTimeout(() => process.exit(0), 100);
