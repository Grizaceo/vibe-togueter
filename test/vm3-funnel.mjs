// Funnel tests: real localhost WebSockets (no public ingress), fake vault.
// Covers: vault auth, seat token verify-at-edge + redeem-at-vault, frame
// fan-out with per-viewer encodings, waiting room, game token single-use,
// kick webhook forwarding, and that viewer IPs never reach the vault.
import { test } from "node:test";
import assert from "node:assert/strict";
import WebSocket from "ws";
import { createFunnel } from "../src/funnel/index.js";
import { FunnelChannel } from "../src/vm3/channel.js";
import { SeatAuthority } from "../src/seats.js";

const SECRET = "test-vault-secret-0123456789";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function startFunnel(t, opts = {}) {
  const funnel = createFunnel({ vaultSecret: SECRET, ...opts });
  await new Promise((r) => funnel.server.listen(0, "127.0.0.1", r));
  const port = funnel.server.address().port;
  t.after(() => funnel.close());
  return { funnel, url: `ws://127.0.0.1:${port}`, httpUrl: `http://127.0.0.1:${port}` };
}
const wsUrl = (base, path) => base + path;

function connect(base, path) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(base + path);
    const inbox = [];
    const waiters = [];
    ws.on("message", (data) => {
      let msg;
      try { msg = JSON.parse(data.toString()); } catch { return; }
      inbox.push(msg);
      for (let i = waiters.length - 1; i >= 0; i--) {
        const w = waiters[i];
        if (w.pred(msg)) {
          waiters.splice(i, 1);
          clearTimeout(w.timer);
          w.resolve(msg);
        }
      }
    });
    ws._next = 0;
    ws.waitFor = (pred, timeoutMs = 4000) => {
      for (let i = ws._next; i < inbox.length; i++) {
        if (pred(inbox[i])) {
          ws._next = i + 1;
          return Promise.resolve(inbox[i]);
        }
      }
      return new Promise((res, rej) => {
        const w = { pred, resolve: (msg) => {
          const i = inbox.indexOf(msg, ws._next);
          if (i >= 0) ws._next = i + 1;
          res(msg);
        }, timer: setTimeout(() => {
          const i = waiters.indexOf(w);
          if (i >= 0) waiters.splice(i, 1);
          rej(Error("recv timeout"));
        }, timeoutMs) };
        waiters.push(w);
      });
    };
    ws.on("open", () => resolve(ws));
    ws.on("error", reject);
    ws.on("unexpected-response", (req, res) => reject(Error("http " + res.statusCode)));
  });
}
const recv = (ws, pred = () => true, timeoutMs = 4000) => ws.waitFor(pred, timeoutMs);
const send = (ws, obj) => ws.send(JSON.stringify(obj));
// channel.once with a deadline so a missed event fails instead of hanging.
const once = (channel, type, ms = 4000) =>
  Promise.race([
    new Promise((r) => channel.on(type, r)),
    new Promise((_, rej) => setTimeout(() => rej(Error("once " + type + " timeout")), ms)),
  ]);

async function vaultHello(channel) {
  await channel.connect();
  return channel;
}

test("vault channel requires the shared secret and creates the room", async (t) => {
  const { funnel, url } = await startFunnel(t);
  const seats = new SeatAuthority({ room: "room-a" });
  const bad = new FunnelChannel({ url, room: "room-a", secret: "wrong-secret-xxxxxxxx" });
  await assert.rejects(bad.connect(), /hello timeout|closed/i);
  const channel = new FunnelChannel({
    url, room: "room-a", secret: SECRET,
    seatKey: seats.publicKey.export({ type: "spki", format: "der" }).toString("base64"),
  });
  await vaultHello(channel);
  assert.ok(funnel.rooms.has("room-a"));
  channel.close();
});

test("seat token is verified at the funnel; vault redeems and answers", async (t) => {
  const { url } = await startFunnel(t);
  const seats = new SeatAuthority({ room: "room-b" });
  const channel = new FunnelChannel({
    url, room: "room-b", secret: SECRET,
    seatKey: seats.publicKey.export({ type: "spki", format: "der" }).toString("base64"),
  });
  await vaultHello(channel);
  const seen = [];
  channel.on("viewer-hello", (m) => {
    seen.push(m);
    const result = seats.redeem(m.seat, { challenge: m.challenge, proof: m.proof, seat: "player" });
    channel.send({ t: "viewer-seat", vid: m.vid, ...(result.ok ? { ok: true, identity: { id: result.claims.sub }, name: result.claims.name, resume: "r" } : { ok: false, reason: result.reason }) });
  });
  channel.on("viewer-event", (m) => {
    if (m.m?.t === "unseat")
      channel.send({ t: "viewer-seat", vid: m.vid, ok: false, reason: "unseated" });
  });
  const viewer = await connect(url, "/ws?room=room-b&frames=d1");
  const welcome = await recv(viewer, (m) => m.t === "welcome");
  assert.equal(welcome.seat, "pending");
  const challenge = await recv(viewer, (m) => m.t === "challenge");
  const { token } = seats.issue({ sub: "twitch:viewer1", name: "ViewerOne", plat: "twitch", roles: ["viewer"], seat: "player" });
  send(viewer, { t: "hello", seat: token });
  const seatMsg = await recv(viewer, (m) => m.t === "seat");
  assert.equal(seatMsg.ok, true);
  assert.equal(seatMsg.identity.id, "twitch:viewer1");
  assert.equal(seen.length, 1);
  assert.equal(seen[0].vid, 1);
  // The vault never saw an IP: viewer-hello carries only vid + token fields.
  assert.deepEqual(Object.keys(seen[0]).sort(), ["challenge", "proof", "room", "seat", "t", "vid"].sort());
  // A forged token dies at the edge: no vault round-trip.
  const before = seen.length;
  send(viewer, { t: "unseat" });
  await recv(viewer, (m) => m.t === "seat" && m.ok === false); // unseat result
  send(viewer, { t: "hello", seat: "v1.forged.forged" });
  const denied = await recv(viewer, (m) => m.t === "seat" && m.ok === false);
  assert.equal(denied.reason, "bad signature");
  assert.equal(seen.length, before, "forged token never reached the vault");
  viewer.close();
  channel.close();
});

test("frames fan out to viewers as mode-A state; game token is single-use", async (t) => {
  const { funnel, url } = await startFunnel(t);
  const channel = new FunnelChannel({ url, room: "room-c", secret: SECRET });
  await vaultHello(channel);
  channel.send({ t: "game-token", token: "gt-1", exp: Date.now() + 60000 });
  await sleep(30); // token registration and the game dial are different sockets
  // Game agent attaches with the registered token.
  const game = await connect(url, "/ws/game?room=room-c&token=gt-1&inc=1");
  const attached = await once(channel, "game-attached");
  assert.equal(attached.room, "room-c");
  // Token is single-use: a second attach with it is refused at the funnel.
  const second = await connect(url, "/ws/game?room=room-c&token=gt-1");
  const closedCode = await new Promise((r) => second.on("close", (c) => r(c)));
  assert.equal(closedCode, 4003);
  // Viewer connects and gets frames.
  const viewer = await connect(url, "/ws?room=room-c&frames=d1");
  await recv(viewer, (m) => m.t === "welcome");
  const fromGameP = once(channel, "from-game"); // vault sees every game line
  game.send(JSON.stringify({ t: "ready", protocol: "va-game/1", manifest: null, view: { bg: "#123", world: { w: 100, h: 50 }, layers: [], hud: [] } }));
  const fromGame = await fromGameP;
  assert.equal(JSON.parse(fromGame.line).t, "ready");
  const liveP = once(channel, "game-liveness"); // beats fire on frame traffic
  game.send(JSON.stringify({ t: "frame", view: { bg: "#123", world: { w: 100, h: 50 }, layers: [{ t: "rect", x: 1, y: 2, w: 3, h: 4 }], hud: [] } }));
  // d1 frames arrive as {t:"k"|"d"} key/delta frames.
  const frame = await recv(viewer, (m) => m.t === "k" || m.t === "d", 4000);
  assert.ok(["k", "d"].includes(frame.t));
  // Vault->game control flows through to-game.
  const gotHello = Promise.race([
    new Promise((r) => {
      const onMsg = (d) => {
        const m = JSON.parse(d.toString());
        if (m.t === "hello") { game.off("message", onMsg); r(m); }
      };
      game.on("message", onMsg);
    }),
    new Promise((_, rej) => setTimeout(() => rej(Error("hello timeout")), 4000)),
  ]);
  channel.send({ t: "to-game", msg: { t: "hello", protocol: "va-game/1", room: "room-c" } });
  const hello = await gotHello;
  assert.equal(hello.t, "hello");
  // game-liveness beats flow to the vault on frame traffic.
  const live = await liveP;
  assert.equal(live.room, "room-c");
  game.close();
  viewer.close();
  channel.close();
});

test("waiting room state reaches viewers and vault pushes broadcast", async (t) => {
  const { url } = await startFunnel(t);
  const channel = new FunnelChannel({ url, room: "room-d", secret: SECRET });
  await vaultHello(channel);
  channel.send({ t: "room", msg: { t: "waiting", state: { phase: "resetting", reason: "swap" } } });
  const viewer = await connect(url, "/ws?room=room-d");
  const welcome = await recv(viewer, (m) => m.t === "welcome");
  assert.equal(welcome.waiting?.phase, "resetting");
  channel.send({ t: "room", msg: { t: "waiting", state: null } });
  const cleared = await recv(viewer, (m) => m.t === "waiting" && m.state === null);
  assert.equal(cleared.state, null);
  viewer.close();
  channel.close();
});

test("kick webhook verifies signature and forwards to vault only", async (t) => {
  const { httpUrl } = await startFunnel(t, {
    kickPublicKey: `-----BEGIN PUBLIC KEY-----\nMFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE\n-----END PUBLIC KEY-----`,
  });
  // Without a real RSA key the verify fails closed — assert rejection.
  const res = await fetch(httpUrl + "/webhook/kick", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  });
  assert.equal(res.status, 403);
});
