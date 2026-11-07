import { test } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { TeeChatBridge } from "../src/tee-chat-bridge.js";
import { TeeAdapter, TEE_CONTRACT, teeManifest } from "../src/protocol/adapters/tee.js";
import { GameSession } from "../src/protocol/session.js";
import { createTeeSession } from "../src/server/tee-session.js";
import { createChatCommands } from "../src/server/chat-commands.js";
import { RemoteGames } from "../src/remote-games.js";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
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
const welcome = Buffer.from([0, 7, 1, 50, 0, 0, 2, 0]);
const SNAPSHOT =
  "01f40301070c6368617440677269735f39360000f6420000e4430000000000000000000080bf00000000ff00000000000000000001031400010000803f0000ac0200";
const entry = {
  id: "tee",
  adapter: "tee",
  title: "Teeworlds",
  baseURL: "https://tee.example.test",
};
const makeTee = async (t, events = [], opts = {}) => {
  const bridge = new TeeChatBridge({ Socket, idleMs: 60000 });
  const adapter = new TeeAdapter({ entry, bridge, channel: "gris_96" });
  const s = new GameSession({
    adapter,
    id: "tee",
    version: { source: TEE_CONTRACT, runtime: entry.baseURL },
    room: "tee",
    loadDeadlineMs: 500,
    healthTimeoutMs: 300,
    onEvent: (k, d) => events.push([k, d]),
    ...opts,
  });
  t.after(() => {
    if (!s._ended) s.stop("test-cleanup");
  });
  const started = s.start();
  await sleep(0); // hello reaches the adapter in a microtask; the socket then exists
  const socket = Socket.last;
  socket.emit("open");
  socket.emit("message", welcome);
  assert.equal(await started, true);
  return { s, bridge, socket, events };
};
test("tee: welcome yields a valid manifest; seats and delivery are enforced", async (t) => {
  const { s } = await makeTee(t);
  assert.equal(s.state, "running");
  assert.deepEqual([...s.manifest.delivery], ["B"]);
  assert.equal(s.manifest.seats.player, 0);
  assert.equal(s.manifest.seats.streamer, 0);
  assert.equal(s.manifest.id, "tee");
  assert.equal(s.manifest.version.source, TEE_CONTRACT);
  assert.equal(s.join({ id: 1, type: "player", name: "x" }), false);
  s.stop("done");
});
test("tee: declared actions pulse the bridge, gates and drops are enforced", async (t) => {
  const { s, socket } = await makeTee(t, [], { healthTimeoutMs: 3000 });
  const actor = { key: "u1", name: "U", platform: "twitch" };
  assert.equal(s.chat({ cmd: "left", args: [], actor }), "effect");
  await sleep(80);
  assert.equal(socket.sent.at(-1)[2], 255, "left drives dir -1 in the sent input");
  assert.equal(s.chat({ cmd: "left", args: [], actor }), null, "per-actor 250 ms");
  assert.equal(s.chat({ cmd: "fly", args: [], actor }), null, "undeclared dropped");
  for (let i = 0; i < 12; i++)
    assert.equal(
      s.chat({ cmd: "right", args: [], actor: { key: "u" + i, name: "U" + i, platform: "kick" } }),
      i < 10 ? "effect" : null,
      "global 10/s caps the crowd",
    );
  await sleep(80);
  assert.equal(s.pause("chat-effects"), true);
  assert.equal(s.chat({ cmd: "left", args: [], actor: { key: "u9", name: "U9", platform: "twitch" } }), null);
  await sleep(80);
  const dirWhilePaused = socket.sent.at(-1)[2];
  assert.equal(dirWhilePaused === 0 || dirWhilePaused === 255, true);
  assert.equal(s.resume("chat-effects"), true);
  await sleep(300);
  // 'right' spent its 10/s bucket; a fresh actor on 'left' proves the gate reopens.
  assert.equal(s.chat({ cmd: "left", args: [], actor: { key: "uZ", name: "UZ", platform: "twitch" } }), "effect");
  await sleep(80);
  assert.equal(socket.sent.at(-1)[2], 255, "a pulse flows again after resume");
  s.stop("done");
});
test("tee: snapshots keep the session alive; silence ends it once", async (t) => {
  const events = [];
  const { s, socket } = await makeTee(t, events, { healthTimeoutMs: 1200 });
  // The adapter emits at most one health per second; 12 snapshots ≈ two beats.
  for (let i = 0; i < 12; i++) {
    socket.emit("message", Buffer.from(SNAPSHOT, "hex"));
    await sleep(100);
  }
  assert.equal(s.state, "running");
  await sleep(1400);
  assert.equal(s.state, "ended");
  assert.equal(s.error, "Game health watchdog timeout.");
  assert.equal(events.filter(([k]) => k === "game-error").length, 1);
});
test("tee: bridge disconnect ends the session with one game-error", async (t) => {
  const events = [];
  const { s, socket } = await makeTee(t, events);
  socket.emit("close");
  assert.equal(s.state, "ended");
  assert.match(s.error, /disconnected/);
  assert.equal(events.filter(([k]) => k === "game-error").length, 1);
});
test("tee: a failed connect rejects the session and feeds one error", async (t) => {
  const events = [];
  const feedLines = [];
  const bridge = new TeeChatBridge({ Socket });
  const teeSession = createTeeSession({ teeBridge: bridge, feed: (k, x) => feedLines.push(x) });
  const pending = teeSession.start(entry, "gris_96");
  await sleep(0);
  Socket.last.emit("close");
  await assert.rejects(pending);
  assert.equal(teeSession.status().session, "ended");
  // A second start after a dead session is allowed and produces a fresh socket.
  const again = teeSession.start(entry, "gris_96");
  await sleep(0);
  Socket.last.emit("open");
  Socket.last.emit("message", welcome);
  const status = await again;
  assert.equal(status.connected, true);
  assert.equal(teeSession.status().session, "running");
  teeSession.stop("done");
});
test("tee-session routes only chat-platform commands through the gate", async (t) => {
  const bridge = new TeeChatBridge({ Socket });
  const teeSession = createTeeSession({ teeBridge: bridge });
  const pending = teeSession.start(entry, "gris_96");
  await sleep(0);
  Socket.last.emit("open");
  Socket.last.emit("message", welcome);
  await pending;
  const actor = (key) => ({ key, name: key, platform: "twitch" });
  assert.equal(teeSession.chat({ cmd: "left", args: [], actor: actor("a") }), "effect");
  assert.equal(teeSession.chat({ cmd: "bogus", args: [], actor: actor("b") }), null);
  teeSession.pause("chat-effects");
  assert.equal(bridge.paused, true);
  assert.equal(teeSession.chat({ cmd: "left", args: [], actor: actor("c") }), null);
  teeSession.resume("chat-effects");
  assert.equal(bridge.paused, false);
  teeSession.stop("done");
  assert.equal(teeSession.chat({ cmd: "left", args: [], actor: actor("d") }), null);
});
const chatStack = (t, { teeSession, blocked = false } = {}) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "va-tee-chat-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const feedLines = [];
  const chatCalls = [];
  const session = teeSession ?? {
    start: async () => ({}),
    stop: () => ({}),
    chat: (o) => (chatCalls.push(o), ["left", "right", "jump", "hook", "fire", "stop"].includes(o.cmd) ? "effect" : null),
    pause: () => true,
    resume: () => true,
  };
  const handleChat = createChatCommands({
    ROOT: root,
    IDEAS_FILE: path.join(root, "ideas.jsonl"),
    TWITCH_CHANNEL: "owner",
    getPublicURL: () => "https://example.test",
    replies: {},
    chatEffects: { blocked, command: () => ({ handled: false }) },
    crowdBursts: { enabled: false, accept: () => null, reset() {} },
    teeBridge: {},
    teeSession: session,
    feed: (k, x) => feedLines.push(x),
    host: {
      error: null, gameDir: "", game: { manifest: { chat: { bursts: [] } } },
      crowd: () => null, chat: () => null, effect: () => true,
      join: () => true, leave: () => true, input: () => true,
    },
    remoteGames: { entries: [{ ...entry }] },
  });
  return { handleChat, feedLines, chatCalls };
};
test("chat routes !tee on/off to the owner and !tee actions to the session", async (t) => {
  const calls = [];
  const s = chatStack(t, {
    teeSession: {
      start: async (game, channel) => (calls.push(["start", game.id, channel]), {}),
      stop: (reason) => (calls.push(["stop", reason]), {}),
      chat: (o) => (calls.push(["chat", o.cmd, o.actor.platform, o.actor.key]), "effect"),
      pause: () => true,
      resume: () => true,
    },
  });
  const say = (source, user, text, extra = {}) =>
    s.handleChat({ source, user, text, ...extra });
  say("twitch", "viewer", "!tee on");
  assert.equal(calls.length, 0, "non-owner cannot enable");
  say("twitch", "owner", "!tee on", { broadcasterUserId: "1" });
  await sleep(5);
  assert.deepEqual(calls[0], ["start", "tee", "owner"]);
  assert.ok(s.feedLines.some((l) => l.includes("Tee crowd ready")));
  await sleep(300); // the chat gate allows one line per actor per 250 ms
  say("twitch", "owner", "!tee off", { broadcasterUserId: "1" });
  assert.deepEqual(calls[1], ["stop", "disabled"]);
  say("kick", "kicker", "!tee left", { platformUserId: "9" });
  assert.deepEqual(calls[2], ["chat", "left", "kick", "kick:9"]);
  assert.ok(s.feedLines.includes("kicker: Tee left"));
  say("web", "watcher", "!tee left");
  assert.equal(calls.length, 3, "web never drives the tee");
  say("twitch", "viewer", "!tee fly", { platformUserId: "5" });
  assert.deepEqual(calls[3], ["chat", "fly", "twitch", "twitch:5"], "the session gate decides");
});
test("chat ignores !tee actions while chat effects are blocked", async (t) => {
  const calls = [];
  const s = chatStack(t, {
    blocked: true,
    teeSession: {
      start: async () => ({}), stop: () => ({}),
      chat: (o) => (calls.push(o), "effect"),
      pause: () => true, resume: () => true,
    },
  });
  s.handleChat({ source: "twitch", user: "viewer", text: "!tee left", platformUserId: "5" });
  assert.equal(calls.length, 0);
});
test("remote-games registry: unknown adapter rejected, tee health via TeeAdapter", async () => {
  assert.throws(
    () => new RemoteGames([{ id: "x", adapter: "nope", baseURL: "https://x.test" }], "/unused"),
    /configuration/,
  );
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "va-remote-")), "sessions.json");
  const registry = new RemoteGames([{ ...entry }], file, {
    fetchImpl: async (url) => {
      assert.equal(url, "https://tee.example.test/healthz");
      return Response.json({ data: { up: true } });
    },
  });
  const health = await registry.inspect("tee");
  assert.equal(health.ok, true);
  assert.equal(registry.catalog().games[0].chatControl, true);
  const bad = new RemoteGames([{ ...entry }], file + "2", {
    fetchImpl: async () => Response.json({ data: { up: false } }),
  });
  await assert.rejects(bad.inspect("tee"), /not healthy/);
});
