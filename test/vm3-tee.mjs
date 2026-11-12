// Collective Tee inside VM3, reached only through the funnel: binary "legs"
// relay the vault's TeeChatBridge to the teeworlds-rs server the guest agent
// spawns in-VM (VA_GAME_KIND=tee-native). Covers leg auth/pairing/limits,
// bridge funnel-leg URL rules + idleMs:0, createos tee env, and the full
// signed-kick -> chat -> tee -> fixture path across an incarnation fallback
// and a confirmed close. No public ingress, no provider, no real game bytes
// parsed anywhere but the fixture.
import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import { spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import { fileURLToPath } from "node:url";
import WebSocket from "ws";
import { createFunnel } from "../src/funnel/index.js";
import { FunnelChannel } from "../src/vm3/channel.js";
import { createVm3Host, teeImageSpec } from "../src/vm3/host.js";
import { TeeAdapter } from "../src/protocol/adapters/tee.js";
import { TeeChatBridge } from "../src/tee-chat-bridge.js";
import { teeInput } from "../src/tee-protocol.js";
import { createKickEventHandler } from "../src/server/kick-events.js";
import { createosBackend } from "../src/vm3/createos.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SECRET = "tee-vm3-vault-secret-0123456789";
const ROOM = "tee-room";
const FIXTURE = path.join(ROOT, "test", "fixtures", "fake-tee-server.mjs");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (pred, ms = 8000, step = 25) => {
  const end = Date.now() + ms;
  while (!pred()) {
    if (Date.now() > end) throw Error("condition timeout");
    await sleep(step);
  }
};
const teeAuth = (room) =>
  crypto.createHmac("sha256", SECRET).update("tee|" + room).digest("base64url");
const fixtureLog = (port) => {
  const file = path.join(os.tmpdir(), `va-fake-tee-${port}.log`);
  if (!fs.existsSync(file)) return [];
  return fs
    .readFileSync(file, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l));
};
const pidAlive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};
const freePort = () =>
  new Promise((resolve, reject) => {
    const s = net.createServer();
    s.once("error", reject);
    s.listen(0, "127.0.0.1", () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
  });

function connect(url, path) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url + path);
    ws.on("open", () => resolve(ws));
    ws.on("error", reject);
    ws.on("unexpected-response", (req, res) =>
      reject(Error("http " + res.statusCode)),
    );
  });
}
const closeCode = (ws) => new Promise((r) => ws.on("close", (c) => r(c)));

async function startFunnel(t, opts = {}) {
  const funnel = createFunnel({ vaultSecret: SECRET, ...opts });
  await new Promise((r) => funnel.server.listen(0, "127.0.0.1", r));
  const port = funnel.server.address().port;
  t.after(() => funnel.close());
  return { funnel, url: `ws://127.0.0.1:${port}`, httpUrl: `http://127.0.0.1:${port}` };
}

// Vault channel + a fake game agent attached through /ws/game, exactly like
// the guest agent's control socket. Returns the parsed JSON inbox.
async function attachGame(t, url, room) {
  const channel = new FunnelChannel({ url, room, secret: SECRET });
  await channel.connect();
  t.after(() => channel.close());
  const token = "gt-" + crypto.randomBytes(6).toString("hex");
  channel.send({ t: "game-token", token, exp: Date.now() + 60000 });
  await sleep(30); // token registration and the game dial are different sockets
  const game = await connect(
    url,
    `/ws/game?room=${encodeURIComponent(room)}&token=${token}`,
  );
  const inbox = [];
  game.on("message", (d) => {
    try {
      inbox.push(JSON.parse(d.toString()));
    } catch {}
  });
  return { channel, game, inbox, legOpens: () => inbox.filter((m) => m.t === "leg-open") };
}

// ---- funnel leg edge cases -------------------------------------------------

test("tee leg rejects bad auth, missing game and unknown legs", async (t) => {
  const { url } = await startFunnel(t);
  const bad = await connect(url, "/ws/tee?room=ghost&auth=not-the-hmac");
  assert.equal(await closeCode(bad), 4003);
  // Valid auth but no room/game attached -> 4004.
  const noGame = await connect(url, `/ws/tee?room=nogame&auth=${teeAuth("nogame")}`);
  assert.equal(await closeCode(noGame), 4004);
  const unknown = await connect(url, "/ws/leg?room=nogame&leg=nope");
  assert.equal(await closeCode(unknown), 4003);
});

test("tee leg pairs raw binary both ways and is single-use", async (t) => {
  const { url } = await startFunnel(t);
  const { game, legOpens } = await attachGame(t, url, "pair-room");
  const client = await connect(
    url,
    `/ws/tee?room=pair-room&auth=${teeAuth("pair-room")}`,
  );
  await until(() => legOpens().length === 1);
  const legId = legOpens()[0].leg;
  assert.ok(typeof legId === "string" && legId.length > 10);
  const agent = await connect(url, `/ws/leg?room=pair-room&leg=${legId}`);
  const toAgent = [];
  agent.on("message", (d) => toAgent.push(Buffer.from(d)));
  client.send(Buffer.from([0, 7, 1, 50, 0, 0, 2, 0]), { binary: true });
  await until(() => toAgent.length === 1);
  assert.deepEqual([...toAgent[0]], [0, 7, 1, 50, 0, 0, 2, 0]);
  const toClient = [];
  client.on("message", (d) => toClient.push(Buffer.from(d)));
  agent.send(Buffer.from([9, 9, 9]), { binary: true });
  await until(() => toClient.length === 1);
  assert.deepEqual([...toClient[0]], [9, 9, 9]);
  // Single use: the same leg id cannot pair twice.
  const reuse = await connect(url, `/ws/leg?room=pair-room&leg=${legId}`);
  assert.equal(await closeCode(reuse), 4003);
  client.close();
  agent.close();
  game.close();
});

test("tee leg times out unpaired, overflows its buffer and caps at four", async (t) => {
  const { url } = await startFunnel(t, { legTimeoutMs: 300 });
  const { game } = await attachGame(t, url, "edge-room");
  const slow = await connect(url, `/ws/tee?room=edge-room&auth=${teeAuth("edge-room")}`);
  assert.equal(await closeCode(slow), 4004);
  const fat = await connect(url, `/ws/tee?room=edge-room&auth=${teeAuth("edge-room")}`);
  fat.send(Buffer.alloc(300 * 1024)); // > 256 KiB pre-pair buffer
  assert.equal(await closeCode(fat), 4008);
  game.close();
});

test("a fifth concurrent tee leg is refused with 4008", async (t) => {
  const { url } = await startFunnel(t);
  const { game } = await attachGame(t, url, "cap-room");
  const clients = [];
  for (let i = 0; i < 4; i++)
    clients.push(
      await connect(url, `/ws/tee?room=cap-room&auth=${teeAuth("cap-room")}`),
    );
  const fifth = await connect(url, `/ws/tee?room=cap-room&auth=${teeAuth("cap-room")}`);
  assert.equal(await closeCode(fifth), 4008);
  for (const c of clients) c.close();
  game.close();
});

test("tee legs close when the game detaches", async (t) => {
  const { url } = await startFunnel(t);
  const { game } = await attachGame(t, url, "detach-room");
  const client = await connect(
    url,
    `/ws/tee?room=detach-room&auth=${teeAuth("detach-room")}`,
  );
  game.close();
  assert.equal(await closeCode(client), 1001);
});

// ---- bridge surface ---------------------------------------------------------

test("TeeChatBridge idleMs 0 never idle-stops and startUrl only takes funnel legs", async () => {
  const welcome = Buffer.from([0, 7, 1, 50, 0, 0, 2, 0]);
  class Socket extends EventEmitter {
    constructor() {
      super();
      this.readyState = 1;
      this.bufferedAmount = 0;
      this.sent = [];
      Socket.last = this;
    }
    send(bytes) {
      this.sent.push(bytes);
    }
    terminate() {
      this.closed = true;
      this.emit("close");
    }
  }
  let time = 1000;
  const bridge = new TeeChatBridge({ Socket, now: () => time, idleMs: 0 });
  const pending = bridge.connect(new URL("ws://x/ws"), "g", "c");
  const socket = Socket.last;
  socket.emit("open");
  socket.emit("message", welcome);
  await pending;
  try {
    time += 3600000; // an hour of fake time: idle stop is disabled at 0
    bridge.tick();
    assert.equal(bridge.status().connected, true);
    assert.equal(bridge.status().reason, "ready");
    assert.equal(socket.closed, undefined);
  } finally {
    bridge.stop();
  }
  const b2 = new TeeChatBridge();
  for (const bad of [
    "http://funnel/ws/tee?room=r&auth=a",
    "https://funnel/ws/tee?room=r&auth=a",
    "ws://funnel/ws/other?room=r&auth=a",
    "ws://user:pw@funnel/ws/tee?room=r&auth=a",
    "ws://funnel/ws/tee?room=r&auth=a#frag",
    "not a url",
  ])
    await assert.rejects(b2.startUrl(bad, "g", "c"), /funnel tee leg|Invalid URL/);
});

test("createos passes VA_GAME_KIND and VA_TEE_MODE to the agent env", async () => {
  const calls = [];
  const id = "sb-" + "c".repeat(20) + "1";
  const cli = async (args) => {
    calls.push(args.join(" "));
    const [, cmd] = args;
    if (cmd === "create") return JSON.stringify({ id });
    if (cmd === "get") return JSON.stringify({ id, status: "running" });
    if (cmd === "process") return JSON.stringify({ process_id: "p1" });
    throw Error("unexpected " + args.join(" "));
  };
  const backend = createosBackend({ cli });
  await backend.create({
    name: "va-game-r-1",
    image: "va-game:1",
    agent: {
      funnelUrl: "wss://funnel.test",
      room: "r",
      token: "tok",
      imageKey: "default",
      kind: "tee-native",
      mode: "dm",
    },
  });
  const start = calls.find((c) => c.includes("process"));
  assert.ok(start.includes("VA_GAME_KIND=tee-native"));
  assert.ok(start.includes("VA_TEE_MODE=dm"));
  assert.ok(start.includes("VA_FUNNEL_URL=wss://funnel.test"));
});

// ---- full E2E: signed kick -> chat command -> in-VM tee ---------------------

const kickKeys = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
const kickPub = kickKeys.publicKey.export({ type: "spki", format: "pem" });
function kickSigned(raw, { id = "evt-" + crypto.randomBytes(6).toString("hex") } = {}) {
  const at = new Date().toISOString();
  const signature = crypto
    .createSign("RSA-SHA256")
    .update(`${id}.${at}.${raw}`)
    .sign(kickKeys.privateKey, "base64");
  return {
    "kick-event-message-id": id,
    "kick-event-message-timestamp": at,
    "kick-event-signature": signature,
    "kick-event-type": "chat.message.sent",
  };
}

// Fake backend: create() spawns the REAL guest agent in tee-native mode with
// the fixture as VA_TEE_BIN. destroy() kills the agent's whole process group
// (agent + tee server), the same blast radius a real VM destroy has.
function makeTeeBackend(teePort) {
  const vms = new Map();
  let seq = 0;
  return {
    name: "fake-tee-vm",
    vms,
    async create({ name, image, agent }) {
      const vm = { id: "tee-vm-" + (++seq), name, image, status: "running" };
      vms.set(vm.id, vm);
      const child = spawn(
        process.execPath,
        [path.join(ROOT, "src", "vm3", "guest-agent.js")],
        {
          env: {
            PATH: process.env.PATH || "/usr/bin:/bin",
            HOME: "/tmp",
            LANG: "C.UTF-8",
            VA_FUNNEL_URL: agent.funnelUrl,
            VA_ROOM: agent.room,
            VA_GAME_TOKEN: agent.token,
            VA_GAME_KIND: agent.kind || "sdk",
            VA_IMAGE_KEY: agent.imageKey || "",
            VA_TEE_BIN: FIXTURE,
            VA_TEE_PORT: String(teePort),
            VA_TEE_MODE: agent.mode || "dm",
          },
          stdio: ["ignore", "ignore", "inherit"],
          detached: true,
        },
      );
      vm.child = child;
      child.on("exit", (code, signal) => {
        vm.exit = { code, signal };
        if (vm.status !== "destroyed") vm.status = "exited";
      });
      child.on("error", () => {
        vm.status = "error";
      });
      return vm;
    },
    async status(vm) {
      return vms.get(vm.id)?.status ?? "missing";
    },
    async destroy(vm) {
      const found = vms.get(vm.id);
      if (!found) return { confirmed: false };
      found.status = "destroyed";
      try {
        process.kill(-found.child.pid, "SIGKILL");
      } catch {
        try {
          found.child.kill("SIGKILL");
        } catch {}
      }
      return { confirmed: true, terminalStatus: "destroyed" };
    },
  };
}

test("tee-native VM3: kick chat drives the in-VM tee across fallback and close", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "va-vm3-tee-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const funnel = createFunnel({ vaultSecret: SECRET, kickPublicKey: kickPub });
  await new Promise((r) => funnel.server.listen(0, "127.0.0.1", r));
  t.after(() => funnel.close());
  const port = funnel.server.address().port;
  const funnelUrl = `ws://127.0.0.1:${port}`;
  const httpUrl = `http://127.0.0.1:${port}`;
  const teePort = await freePort();
  const backend = makeTeeBackend(teePort);

  const chats = [];
  let stack = null;
  const kickEvents = createKickEventHandler({
    CONFIG: {
      kick: { broadcasterUserId: 123 },
      monetization: { kickSubUsd: 5, kickUsdPerKick: 0.01 },
    },
    simulateEventCredits: false,
    handleChat: (m) => {
      chats.push(m);
      const cmd = String(m.text || "").match(/^!tee\s+([a-z]+)/)?.[1];
      if (cmd && stack)
        stack.tee.chat({
          cmd,
          args: [],
          actor: { key: "kick:" + (m.platformUserId || m.user), name: m.user, platform: "kick" },
        });
    },
    treasury: { deposit: () => assert.fail("no deposits expected") },
    feed: () => {},
  });

  stack = await createVm3Host({
    backend,
    funnelUrl,
    room: ROOM,
    vaultSecret: SECRET,
    images: { default: teeImageSpec({ ref: "tee:test", mode: "dm" }) },
    onKickEvent: kickEvents,
    journalDir: dir,
    attachTimeoutMs: 30000,
    statusPollMs: 0,
    feed: () => {},
    handleChat: () => {},
  });
  t.after(() => stack.close().catch(() => {}));

  const session = await stack.open();
  assert.equal(session.state, "running");
  assert.ok(
    stack.host.session.adapter instanceof TeeAdapter,
    "tee-native image runs the TeeAdapter over a funnel leg",
  );
  await until(() => stack.tee.status().connected === true, 10000);

  const jumpRows = () =>
    fixtureLog(teePort).filter((r) => r.kind === "input" && r.jump === 1);
  const postKick = async (content, id) => {
    const raw = JSON.stringify({
      message_id: "m-" + id,
      broadcaster: { user_id: 123 },
      sender: { user_id: 777, username: "kickfan" },
      content,
    });
    const res = await fetch(httpUrl + "/webhook/kick", {
      method: "POST",
      headers: kickSigned(raw, { id }),
      body: raw,
    });
    assert.equal(res.status, 200);
    assert.equal(await res.text(), "ok");
  };

  await postKick("!tee jump", "e2e-1");
  await until(() => jumpRows().length >= 1, 10000);
  assert.equal(chats.length, 1);
  assert.equal(chats[0].source, "kick");
  assert.equal(chats[0].platformUserId, "777");
  assert.equal(chats[0].user, "kickfan");
  // The pulse bytes are the codec's own encoding of a jump input.
  const row = jumpRows()[0];
  assert.equal(
    row.hex,
    teeInput(row.seq, {
      dir: 0,
      jump: true,
      hook: false,
      fire: false,
      aimX: 1,
      aimY: 0,
      weapon: 2,
    }).toString("hex"),
  );

  // Incarnation fallback: destroy + recreate, legs of incarnation 1 die,
  // the bridge reconnects through a fresh leg and the session is ready.
  const vm1 = stack.manager.vm.id;
  const inc1 = stack.manager.incarnation;
  const pid1 = fixtureLog(teePort).filter((r) => r.type === "start").at(-1).pid;
  const jumpsBefore = jumpRows().length;
  await stack.fallback("e2e-reset");
  assert.equal(stack.manager.incarnation, inc1 + 1);
  assert.notEqual(stack.manager.vm.id, vm1);
  assert.equal(backend.vms.get(vm1).status, "destroyed");
  await until(() => !pidAlive(pid1), 5000);
  await until(
    () => stack.tee.status().connected === true && stack.host.session?.state === "running",
    15000,
  );
  await until(() => funnel.rooms.get(ROOM)?.teeLegs.size === 1, 5000);
  // The intentional reset must not read as a game failure: no watchdog loop.
  await sleep(500);
  assert.equal(stack.manager.incarnation, inc1 + 1);
  // And the new incarnation answers chat again through a fresh leg.
  await postKick("!tee jump", "e2e-2");
  await until(() => jumpRows().length > jumpsBefore, 10000);

  // Close: confirmed destroy, agent + tee server exited, no legs remain.
  const vm2 = stack.manager.vm.id;
  const pid2 = fixtureLog(teePort).filter((r) => r.type === "start").at(-1).pid;
  await stack.close();
  assert.equal(backend.vms.get(vm2).status, "destroyed");
  await until(() => !pidAlive(pid2), 5000);
  await until(() => (funnel.rooms.get(ROOM)?.teeLegs.size ?? 0) === 0, 5000);
  assert.equal(stack.host.session?.state ?? "ended", "ended");
});
