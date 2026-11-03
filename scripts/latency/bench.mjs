// Reproducible mode-A latency/traffic benchmark. Local only: a disposable copy
// of this checkout, the real controller with the isolated game runtime, a
// userspace impairment proxy and N headless viewers running public/client.js.
// No Twitch, tunnels, VMs or cloud calls.
//
//   node scripts/latency/bench.mjs --label baseline --out docs/evidence/latency-baseline.json
//   options: --games grove,duel,marble --scenarios clean,wan,lossy --clients 8
//            --duration 60 --race-duration 75 --ids (opt-in id variants) --env K=V
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import { spawn, execSync } from "node:child_process";
import { Worker } from "node:worker_threads";
import { fileURLToPath, pathToFileURL } from "node:url";
import { startProxy } from "./netem-proxy.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const args = process.argv.slice(2);
const opt = (name, dflt) => {
  const i = args.indexOf("--" + name);
  return i >= 0 ? args[i + 1] : dflt;
};
const flag = (name) => args.includes("--" + name);
const label = opt("label", "run");
const games = opt("games", "grove,duel,marble").split(",");
const scenarioNames = opt("scenarios", "clean,wan,lossy").split(",");
const clients = Number(opt("clients", 8));
const durationMs = Number(opt("duration", 60)) * 1000;
const raceDurationMs = Number(opt("race-duration", 75)) * 1000;
const useIds = flag("ids");
const extraEnv = Object.fromEntries(
  args
    .filter((_, i) => args[i - 1] === "--env")
    .map((kv) => [kv.slice(0, kv.indexOf("=")), kv.slice(kv.indexOf("=") + 1)]),
);

const SCENARIOS = {
  clean: { delayMs: 0, jitterMs: 0, loss: 0 },
  wan: { delayMs: 40, jitterMs: 10, loss: 0 },
  lossy: { delayMs: 40, jitterMs: 10, loss: 0.02, rtoMs: 200 },
};
const GAME_DIRS = {
  grove: "community-grove",
  duel: "chat-vs-streamer",
  "marble-lobby": "marble-race",
  "marble-race": "marble-race",
};

// Optional stable ids for moving primitives. Applied to the disposable copy only;
// reviewed bundled games are untouched. Each replacement must match exactly.
const ID_PATCHES = {
  "community-grove": [
    [
      "for(const p of [...s.__players.values()].slice(0,30))layers.push({t:'circle',x:p.x,y:658,r:8,color:'#ffd48a'},text(p.x,687,p.name.slice(0,16),14,'#ffffff'));",
      "for(const [pid,p] of [...s.__players].slice(0,30))layers.push({t:'circle',x:p.x,y:658,r:8,color:'#ffd48a',id:'pc'+pid},{...text(p.x,687,p.name.slice(0,16),14,'#ffffff'),id:'pn'+pid});",
    ],
  ],
  "chat-vs-streamer": [
    [
      "layers.push({t:'rect',x:s.chatX-58,y:178,w:116,h:24,color:'#43efd0'},{t:'rect',x:s.chatX-12,y:199,w:24,h:18,color:'#43efd0'});",
      "layers.push({t:'rect',x:s.chatX-58,y:178,w:116,h:24,color:'#43efd0',id:'chat-body'},{t:'rect',x:s.chatX-12,y:199,w:24,h:18,color:'#43efd0',id:'chat-gun'});",
    ],
    [
      "layers.push({t:'rect',x:s.x-58,y:558,w:116,h:24,color:'#b596ff'},{t:'rect',x:s.x-12,y:539,w:24,h:18,color:'#b596ff'});",
      "layers.push({t:'rect',x:s.x-58,y:558,w:116,h:24,color:'#b596ff',id:'st-body'},{t:'rect',x:s.x-12,y:539,w:24,h:18,color:'#b596ff',id:'st-gun'});",
    ],
    [
      "s.bullets.push({x:s.x,y:554,side});",
      "s.bulletSeq=(s.bulletSeq||0)+1;s.bullets.push({x:s.x,y:554,side,id:s.bulletSeq});",
    ],
    [
      "for(const dx of [-26,0,26])s.bullets.push({x:s.chatX+dx,y:204,side});",
      "for(const dx of [-26,0,26]){s.bulletSeq=(s.bulletSeq||0)+1;s.bullets.push({x:s.chatX+dx,y:204,side,id:s.bulletSeq});}",
    ],
    [
      "for(const b of s.bullets)layers.push({t:'circle',x:b.x,y:b.y,r:6,color:b.side==='chat'?'#43efd0':'#c7adff'});",
      "for(const b of s.bullets)layers.push({t:'circle',x:b.x,y:b.y,r:6,color:b.side==='chat'?'#43efd0':'#c7adff',id:'b'+b.id});",
    ],
  ],
  "marble-race": [
    [
      "    layers.push({ t: 'circle', x: m.x, y: m.y, r: MARBLE_R, color: m.color });\n    layers.push({ t: 'circle', x: m.x, y: m.y, r: MARBLE_R, color: '#0006', fill: false, w: 1 });\n    layers.push({ t: 'text', x: m.x, y: m.y - MARBLE_R - 9, text: m.name, size: 11, color: '#ccc' });",
      "    layers.push({ t: 'circle', x: m.x, y: m.y, r: MARBLE_R, color: m.color, id: 'mb:' + m.name });\n    layers.push({ t: 'circle', x: m.x, y: m.y, r: MARBLE_R, color: '#0006', fill: false, w: 1, id: 'mo:' + m.name });\n    layers.push({ t: 'text', x: m.x, y: m.y - MARBLE_R - 9, text: m.name, size: 11, color: '#ccc', id: 'mn:' + m.name });",
    ],
  ],
};

const freePort = () =>
  new Promise((r) => {
    const s = net.createServer();
    s.listen(0, "127.0.0.1", () => {
      const p = s.address().port;
      s.close(() => r(p));
    });
  });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function prepareCopy() {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "va-latency-"));
  for (const name of [
    "src",
    "public",
    "games",
    "templates",
    "package.json",
    "vibe-arena.config.json",
  ])
    fs.cpSync(path.join(root, name), path.join(temp, name), {
      recursive: true,
      filter: (p) => !p.includes("/auto-"),
    });
  fs.symlinkSync(
    path.join(root, "node_modules"),
    path.join(temp, "node_modules"),
    "dir",
  );
  if (useIds)
    for (const [dir, patches] of Object.entries(ID_PATCHES)) {
      const file = path.join(temp, "games", dir, "game.js");
      let source = fs.readFileSync(file, "utf8");
      for (const [from, to] of patches) {
        if (!source.includes(from))
          throw Error(`id patch for ${dir} no longer matches the game source`);
        source = source.replace(from, to);
      }
      fs.writeFileSync(file, source);
    }
  return temp;
}

function cpuTicks(pid) {
  const fields = fs
    .readFileSync(`/proc/${pid}/stat`, "utf8")
    .split(") ")[1]
    .split(" ");
  return Number(fields[11]) + Number(fields[12]); // utime + stime
}
const CLK_TCK = Number(execSync("getconf CLK_TCK").toString().trim()) || 100;

async function startServer(temp, gameDir) {
  const port = await freePort();
  let logs = "";
  const server = spawn(
    process.execPath,
    [
      "--experimental-vm-modules",
      "src/server.js",
      "--host",
      "127.0.0.1",
      "--port",
      String(port),
      "--game-dir",
      "games/" + gameDir,
    ],
    {
      cwd: temp,
      env: {
        PATH: process.env.PATH,
        HOME: temp,
        LANG: "C.UTF-8",
        VA_STREAMER_KEY: "latency-bench-key",
        VA_NET_PROBE: "1",
        VA_TUNNEL: "off",
        ...extraEnv,
      },
      stdio: ["pipe", "pipe", "pipe"],
    },
  );
  server.stdout.on("data", (b) => (logs += b));
  server.stderr.on("data", (b) => (logs += b));
  for (let i = 0; i < 200; i++) {
    try {
      const status = await (
        await fetch(`http://127.0.0.1:${port}/admin/status`)
      ).json();
      if (status.game) return { server, port, logs: () => logs };
    } catch {}
    await sleep(50);
  }
  server.kill("SIGKILL");
  throw Error("controller did not start: " + logs);
}

function quantile(values, q) {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const pos = (s.length - 1) * q,
    lo = Math.floor(pos),
    hi = Math.ceil(pos);
  return s[lo] + (s[hi] - s[lo]) * (pos - lo);
}
const round = (v, d = 1) => (v === null ? null : Math.round(v * 10 ** d) / 10 ** d);
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / (xs.length || 1);

async function runOne(temp, game, scenarioName, seed) {
  const scenario = SCENARIOS[scenarioName];
  const { server, port, logs } = await startServer(temp, GAME_DIRS[game]);
  const proxy = await startProxy({ targetPort: port, seed, ...scenario });
  const duration = game === "marble-race" ? raceDurationMs : durationMs;
  const warmupMs = 2500;
  try {
    const workers = Array.from({ length: clients }, (_, i) => {
      const worker = new Worker(path.join(here, "client-worker.mjs"), {
        workerData: {
          host: "127.0.0.1:" + proxy.port,
          clientModule: pathToFileURL(path.join(temp, "public", "client.js"))
            .href,
          wsModule: pathToFileURL(
            path.join(root, "node_modules", "ws", "wrapper.mjs"),
          ).href,
          name: (i === 0 ? "probe" : "viewer") + i,
          // Every Grove viewer probes its own avatar; other games have one prober.
          role: i === 0 || game === "grove" ? "probe" : "passive",
          game,
          seed: seed * 100 + i,
          vsyncPhase: (i * 0.37) % 1,
          warmupMs: warmupMs + i * 20,
          durationMs: duration,
          streamerKey: "latency-bench-key",
          probePing: true,
        },
      });
      return new Promise((resolve, reject) => {
        worker.once("message", resolve);
        worker.once("error", reject);
        worker.once("exit", (code) =>
          code ? reject(Error("worker exit " + code)) : null,
        );
      });
    });
    await sleep(warmupMs + 300);
    const cpu0 = cpuTicks(server.pid),
      t0 = Date.now();
    await sleep(duration - 600);
    const cpu1 = cpuTicks(server.pid),
      t1 = Date.now();
    const results = await Promise.all(workers);
    const probe = results.find((r) => r.role === "probe");
    const all = results;
    const latencies = all.flatMap((r) => r.latencies);
    return {
      game,
      scenario: scenarioName,
      clients,
      seconds: round(probe.seconds, 1),
      latencyMs: {
        n: latencies.length,
        timeouts: all.reduce((n, r) => n + r.timeouts, 0),
        p50: round(quantile(latencies, 0.5)),
        p90: round(quantile(latencies, 0.9)),
        p99: round(quantile(latencies, 0.99)),
        max: round(quantile(latencies, 1)),
      },
      rttMs: { p50: round(quantile(probe.rtts, 0.5)) },
      serverToClientMs: {
        p50: round(quantile(all.flatMap((r) => r.transit), 0.5)),
        p99: round(quantile(all.flatMap((r) => r.transit), 0.99)),
      },
      perClient: {
        bytesPerSecond: Math.round(mean(all.map((r) => r.bytesPerSecond))),
        stateMessagesPerSecond: round(
          mean(all.map((r) => r.stateMessagesPerSecond)),
        ),
        presentedFramesPerSecond: round(
          mean(all.map((r) => r.presentedFramesPerSecond)),
        ),
        distinctFramesPerSecond: round(
          mean(all.map((r) => r.distinctFramesPerSecond)),
        ),
      },
      serverCpuPercent: round(
        ((cpu1 - cpu0) / CLK_TCK / ((t1 - t0) / 1000)) * 100,
      ),
    };
  } catch (error) {
    error.message += "\n" + logs().slice(-2000);
    throw error;
  } finally {
    await proxy.close();
    server.kill("SIGTERM");
    await new Promise((r) => server.once("exit", r));
  }
}

const temp = prepareCopy();
const report = {
  label,
  at: new Date().toISOString(),
  commit: execSync("git rev-parse --short HEAD", { cwd: root })
    .toString()
    .trim(),
  dirty: execSync("git status --porcelain -- src public", { cwd: root })
    .toString()
    .trim().length > 0,
  node: process.version,
  cpus: os.cpus().length,
  options: {
    games,
    scenarios: scenarioNames,
    clients,
    durationSeconds: durationMs / 1000,
    raceDurationSeconds: raceDurationMs / 1000,
    idVariants: useIds,
    env: extraEnv,
  },
  scenarios: Object.fromEntries(scenarioNames.map((s) => [s, SCENARIOS[s]])),
  method: [
    "Each run starts the real controller (isolated game runtime) from a disposable copy of this checkout and connects N headless viewers through a userspace impairment proxy.",
    "Viewers run the real public/client.js and public/render.js with stubbed browser globals; a recording canvas captures every drawn frame, and frames reach the screen on a 60 Hz vsync grid (draw-on-message frames present at the next vsync; requestAnimationFrame frames present at their own vsync).",
    "Latency: a viewer sends an input and waits for the first presented frame that shows its effect. Grove: every viewer moves its own avatar (web key). Duel: viewer 0 claims the streamer key and moves the paddle; the others vote by chat. Marble: viewer 0 sends !reset/!play in the lobby and waits for its marble label to disappear/appear (chat path).",
    "Marble traffic and frame rates come from a separate run (marble-race) that keeps starting races and counts only the time while marbles race (seconds = racing time), so they reflect motion, not an idle lobby or podium.",
    "bytesPerSecond is wire bytes read by each client socket (WebSocket framing + permessage-deflate as negotiated, no TLS). Distinct frames are presented frames whose drawn content differs from the previous one.",
    "Loss is modelled as TCP head-of-line stalls: a chunk (and all behind it) waits an extra RTO with the given probability. It is not real packet loss or congestion control.",
  ],
  runs: [],
};
console.error(`[bench] ${label} · copy ${temp}`);
try {
  let seed = 1;
  for (const scenario of scenarioNames)
    for (const game of games.flatMap((g) =>
      g === "marble" ? ["marble-lobby", "marble-race"] : [g],
    )) {
      const result = await runOne(temp, game, scenario, seed++);
      report.runs.push(result);
      console.error(
        `[bench] ${scenario.padEnd(5)} ${game.padEnd(12)} p50 ${result.latencyMs.p50} p99 ${result.latencyMs.p99} (n=${result.latencyMs.n}, timeouts ${result.latencyMs.timeouts}) · ${result.perClient.bytesPerSecond} B/s · ${result.perClient.stateMessagesPerSecond} msg/s · ${result.perClient.distinctFramesPerSecond} distinct fps · cpu ${result.serverCpuPercent}%`,
      );
    }
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
const out = opt("out");
if (out) fs.writeFileSync(out, JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify(report, null, 2));
