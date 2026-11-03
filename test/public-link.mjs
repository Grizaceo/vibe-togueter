// Public link for !join, exercised with simulated tunnels only: no cloudflared,
// DNS or Cloudflare traffic. Probes are routed to a local HTTP server.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { EventEmitter } from "node:events";
import { PublicLink, LINK_PROBE_PATH } from "../src/server/public-link.js";
import { createChatCommands } from "../src/server/chat-commands.js";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms = 3000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await fn()) return true;
    await sleep(10);
  }
  return false;
}

// One local server answers probes for whichever link object is attached.
async function arena(t) {
  const holder = { link: null };
  const server = http.createServer((req, res) => {
    if (req.url === LINK_PROBE_PATH) return holder.link.handleProbe(req, res);
    res.writeHead(404);
    res.end();
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  t.after(() => server.close());
  holder.port = server.address().port;
  holder.origin = "http://127.0.0.1:" + holder.port;
  return holder;
}

// hosts: hostname -> origin that actually answers (anything else fails like dead DNS).
function routedFetch(hosts, metrics = {}) {
  return async (url, options) => {
    const u = new URL(url);
    if (u.hostname === "127.0.0.1" && metrics[u.port] !== undefined) {
      const body = metrics[u.port];
      return new Response(JSON.stringify(body), { status: 200 });
    }
    const target = hosts[u.hostname];
    if (!target) throw new TypeError("fetch failed (simulated dead host)");
    return fetch(target + u.pathname, options);
  };
}

function fakeTunnels(hostnames) {
  const children = [];
  const spawn = (command, args) => {
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.args = args;
    child.killed = false;
    child.kill = () => {
      if (child.killed) return;
      child.killed = true;
      setImmediate(() => child.emit("exit", null, "SIGTERM"));
    };
    const host = hostnames[children.length];
    children.push(child);
    setImmediate(() => {
      child.stderr.emit("data", Buffer.from("INF Requesting new quick Tunnel\n"));
      child.stderr.emit("data", Buffer.from(`INF |  https://${host}  |\n`));
      child.stderr.emit("data", Buffer.from("INF Registered tunnel connection\n"));
    });
    return child;
  };
  return { spawn, children };
}

function joinReplies(getPublicURL) {
  const replies = [],
    feed = [];
  const handle = createChatCommands({
    ROOT: "/tmp/fixture",
    TWITCH_CHANNEL: "owner",
    getPublicURL,
    replies: { twitch: (text) => replies.push(text) },
    chatEffects: { command: () => ({ handled: false }), blocked: false },
    host: { gameDir: "other" },
    feed: (kind, text) => feed.push(text),
    remoteGames: { entries: [] },
    teeBridge: {},
  });
  return {
    join(user) {
      handle({ source: "twitch", user, text: "!join" });
      return replies.at(-1);
    },
    feed,
  };
}

const common = {
  checkEveryMs: 60000,
  retryEveryMs: 20,
  probeTimeoutMs: 500,
  startTimeoutMs: 2000,
  metricsPorts: [],
};

test("stale VA_PUBLIC_URL is never returned; startup creates a tunnel that reaches this arena", async (t) => {
  const a = await arena(t);
  const tunnels = fakeTunnels(["fresh-words.trycloudflare.com"]);
  const link = new PublicLink({
    ...common,
    configuredURL: "https://old-dead-words.trycloudflare.com",
    spawn: tunnels.spawn,
    fetch: routedFetch({ "fresh-words.trycloudflare.com": a.origin }),
  });
  a.link = link;
  t.after(() => link.stop());
  assert.equal(link.url, null, "nothing is handed out before verification");
  const status = await link.start(a.port);
  assert.equal(status.state, "live");
  assert.equal(link.url, "https://fresh-words.trycloudflare.com");
  assert.equal(status.source, "spawned");
  assert.equal(tunnels.children.length, 1);
  const args = tunnels.children[0].args;
  assert.equal(args[args.indexOf("--url") + 1], "http://127.0.0.1:" + a.port);
  assert.ok(args.includes("--config"), "personal cloudflared config is bypassed");
  const join = joinReplies(() => link.url);
  const reply = join.join("someviewer");
  assert.equal(reply, "Join the game: https://fresh-words.trycloudflare.com/");
  assert.ok(!reply.includes("old-dead-words"));
});

test("a live configured URL is used as-is and no tunnel is started", async (t) => {
  const a = await arena(t);
  const tunnels = fakeTunnels([]);
  const link = new PublicLink({
    ...common,
    configuredURL: "https://arena.example.test/",
    spawn: tunnels.spawn,
    fetch: routedFetch({ "arena.example.test": a.origin }),
  });
  a.link = link;
  t.after(() => link.stop());
  await link.start(a.port);
  assert.equal(link.url, "https://arena.example.test");
  assert.equal(link.status().source, "configured");
  assert.equal(tunnels.children.length, 0);
});

test("an already running quick tunnel is detected, but only if it reaches this arena", async (t) => {
  const a = await arena(t);
  // A second arena process stands in for a tunnel that points somewhere else.
  const other = await arena(t);
  other.link = new PublicLink({ mode: "off" });
  const tunnels = fakeTunnels([]);
  const link = new PublicLink({
    ...common,
    mode: "detect",
    metricsPorts: [20241, 20242],
    spawn: tunnels.spawn,
    fetch: routedFetch(
      {
        "someone-else.trycloudflare.com": other.origin,
        "ours-here.trycloudflare.com": a.origin,
      },
      {
        20241: { hostname: "someone-else.trycloudflare.com" },
        20242: { hostname: "ours-here.trycloudflare.com" },
      },
    ),
  });
  a.link = link;
  t.after(() => link.stop());
  await link.start(a.port);
  assert.equal(link.url, "https://ours-here.trycloudflare.com");
  assert.equal(link.status().source, "detected");
  assert.equal(tunnels.children.length, 0, "detect mode never spawns");
});

test("when the tunnel dies !join says so instead of posting a dead link, then a new tunnel replaces it", async (t) => {
  const a = await arena(t);
  const tunnels = fakeTunnels([
    "first-tunnel.trycloudflare.com",
    "second-tunnel.trycloudflare.com",
  ]);
  const hosts = {
    "first-tunnel.trycloudflare.com": a.origin,
    "second-tunnel.trycloudflare.com": a.origin,
  };
  const logs = [];
  const link = new PublicLink({
    ...common,
    retryEveryMs: 200,
    spawn: tunnels.spawn,
    fetch: routedFetch(hosts),
    log: (line) => logs.push(line),
  });
  a.link = link;
  t.after(() => link.stop());
  await link.start(a.port);
  const join = joinReplies(() => link.url);
  assert.match(join.join("first"), /first-tunnel/);

  delete hosts["first-tunnel.trycloudflare.com"];
  tunnels.children[0].kill();
  await until(() => link.url === null);
  const reply = join.join("second");
  assert.match(reply, /No live game link right now/);
  assert.ok(!/https?:\/\//.test(reply), "no URL at all while down");
  assert.ok(join.feed.some((line) => line.includes("no live public link")));

  assert.ok(await until(() => link.url !== null), "tunnel is re-created");
  assert.equal(link.url, "https://second-tunnel.trycloudflare.com");
  const again = join.join("third");
  assert.equal(again, "Join the game: https://second-tunnel.trycloudflare.com/");
  assert.ok(!again.includes("name="));
  assert.ok(logs.some((l) => l.startsWith("public link down")));
});

test("health checks drop a link that stops answering after two failed probes", async (t) => {
  const a = await arena(t);
  const hosts = { "arena.example.test": a.origin };
  const link = new PublicLink({
    ...common,
    mode: "detect",
    configuredURL: "https://arena.example.test",
    fetch: routedFetch(hosts),
  });
  a.link = link;
  t.after(() => link.stop());
  await link.start(a.port);
  assert.equal(link.url, "https://arena.example.test");
  delete hosts["arena.example.test"];
  await link.refresh();
  assert.equal(link.url, "https://arena.example.test", "one blip is tolerated");
  await link.refresh();
  assert.equal(link.url, null);
  assert.match(link.status().reason, /does not reach this arena/);
});

test("without completed setup, or with VA_TUNNEL=off, nothing is spawned or handed out", async (t) => {
  const a = await arena(t);
  const tunnels = fakeTunnels(["never.trycloudflare.com"]);
  const blocked = new PublicLink({
    ...common,
    allowSpawn: false,
    disabledReason: "Run npm run setup:local first.",
    spawn: tunnels.spawn,
    fetch: routedFetch({}),
  });
  a.link = blocked;
  t.after(() => blocked.stop());
  await blocked.start(a.port);
  assert.equal(blocked.url, null);
  assert.equal(blocked.status().state, "down");
  assert.match(blocked.status().reason, /setup:local/);
  const off = new PublicLink({ ...common, mode: "off", spawn: tunnels.spawn });
  t.after(() => off.stop());
  await off.start(a.port);
  assert.equal(off.status().state, "off");
  assert.equal(tunnels.children.length, 0);
  assert.match(joinReplies(() => off.url).join("x"), /No live game link/);
});

test("a tunnel URL that never reaches this arena is rejected and its process stopped", async (t) => {
  const a = await arena(t);
  const tunnels = fakeTunnels(["wrong-place.trycloudflare.com"]);
  const link = new PublicLink({
    ...common,
    startTimeoutMs: 300,
    spawn: tunnels.spawn,
    fetch: routedFetch({}),
  });
  a.link = link;
  t.after(() => link.stop());
  await link.start(a.port);
  assert.equal(link.url, null);
  assert.match(link.status().reason, /never reached this arena/);
  assert.equal(tunnels.children[0].killed, true);
});

test("a real child process standing in for cloudflared is parsed, verified and stopped", async (t) => {
  const a = await arena(t);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "va-fake-cloudflared-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const argsFile = path.join(dir, "args.json"),
    command = path.join(dir, "cloudflared");
  fs.writeFileSync(
    command,
    "#!/usr/bin/env node\n" +
      `require("fs").writeFileSync(${JSON.stringify(argsFile)},JSON.stringify(process.argv.slice(2)));\n` +
      'console.error("INF |  https://simulated-child.trycloudflare.com  |");\n' +
      'setTimeout(()=>console.error("INF Registered tunnel connection connIndex=0"),50);\n' +
      "setInterval(()=>{},1000);\n",
    { mode: 0o700 },
  );
  const link = new PublicLink({
    ...common,
    command,
    fetch: routedFetch({ "simulated-child.trycloudflare.com": a.origin }),
  });
  a.link = link;
  t.after(() => link.stop());
  await link.start(a.port);
  assert.equal(link.url, "https://simulated-child.trycloudflare.com");
  const args = JSON.parse(fs.readFileSync(argsFile, "utf8"));
  assert.deepEqual(args.slice(-2), ["--url", "http://127.0.0.1:" + a.port]);
  const child = link.child;
  link.stop();
  assert.ok(await until(() => child.exitCode !== null || child.signalCode !== null));
});
