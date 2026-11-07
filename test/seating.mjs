// End-to-end seats on the real room sockets: a Twitch viewer (IRC line through
// the real parser and chat pipeline), a Kick viewer (signed webhook through the
// real route) and a legacy ?name= client share one room.
import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import WebSocket from "ws";
import { attachRoomSockets } from "../src/server/broadcast.js";
import { createSeating } from "../src/server/seating.js";
import { createChatCommands } from "../src/server/chat-commands.js";
import { createWebhookRoutes } from "../src/server/routes/webhooks.js";
import { parseTwitchMessage } from "../src/chat/twitch.js";
import { ChatEffects } from "../src/chat-effects.js";
import { SeatAuthority, generateSeatKey } from "../src/seats.js";

const subtle = globalThis.crypto.subtle;
const kickKeys = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });

async function browserKey() {
  const pair = await subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, false, ["sign", "verify"]);
  const full = await subtle.exportKey("jwk", pair.publicKey);
  return {
    jwk: { kty: full.kty, crv: full.crv, x: full.x, y: full.y },
    sign: async (m) =>
      Buffer.from(await subtle.sign({ name: "ECDSA", hash: "SHA-256" }, pair.privateKey, new TextEncoder().encode(m))).toString("base64url"),
  };
}
const jti = (token) => JSON.parse(Buffer.from(token.split(".")[1], "base64url")).jti;

async function stack(t) {
  process.env.VA_KICK_PUBKEY = kickKeys.publicKey.export({ type: "spki", format: "pem" });
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "va-seats-"));
  const calls = [];
  const feedLines = [];
  const host = {
    error: null,
    gameDir: "",
    game: { name: "Test", meta: { description: "", world: { w: 100, h: 100 } } },
    safeCall: (fn, ...args) => (calls.push([fn, ...args]), true),
    join: (p) => (calls.push(["onJoin", p]), true),
    leave: (p) => (calls.push(["onLeave", p]), true),
    input: (id, data) => (calls.push(["onInput", id, data]), true),
    chat: ({ cmd, args, actor }) => (
      calls.push(["onChat", { name: actor?.name, source: actor?.platform }, cmd, args]),
      "effect"
    ),
    effect: (name, args) => (calls.push(["effect", name, ...args]), true),
  };
  const clients = new Map();
  const feed = (kind, text) => feedLines.push(text);
  const seating = createSeating({
    clients,
    host,
    feed,
    seats: new SeatAuthority({ key: generateSeatKey() }),
  });
  const handleChat = createChatCommands({
    ROOT: root,
    IDEAS_FILE: path.join(root, "ideas.jsonl"),
    TWITCH_CHANNEL: "owner",
    getPublicURL: () => "https://example.trycloudflare.com",
    replies: {},
    chatEffects: new ChatEffects({ enabled: false }),
    crowdBursts: { accept: () => null, reset() {} },
    feed,
    host,
    remoteGames: { entries: [] },
    claimPairing: (code, principal) => seating.claim(code, principal),
  });
  const webhooks = createWebhookRoutes({
    ROOT: root,
    CONFIG: { kick: { broadcasterUserId: 123 }, monetization: { eventsubSecret: "x" } },
    handleChat,
    feed,
    host,
    chatEffects: { blocked: false },
  });
  const server = http.createServer((req, res) => {
    if (!webhooks(req, res, new URL(req.url, "http://x"))) res.writeHead(404).end();
  });
  attachRoomSockets({ server, clients, host, clientCredits: () => null, events: [], feed, handleChat, seating });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = `127.0.0.1:${server.address().port}`;
  const sockets = [];
  t.after(async () => {
    for (const ws of sockets) ws.terminate();
    await new Promise((r) => server.close(r));
    fs.rmSync(root, { recursive: true, force: true });
  });

  // A socket with a message queue; next(type) waits for the next message of that type.
  async function open(query) {
    const ws = new WebSocket(`ws://${base}/play?${query}`);
    sockets.push(ws);
    const inbox = [];
    const waiters = [];
    ws.on("message", (raw, binary) => {
      if (binary) return;
      const msg = JSON.parse(raw);
      const i = waiters.findIndex((w) => w.type === msg.t);
      if (i >= 0) waiters.splice(i, 1)[0].resolve(msg);
      else inbox.push(msg);
    });
    await new Promise((r, j) => (ws.once("open", r), ws.once("error", j)));
    const next = (type) => {
      const i = inbox.findIndex((m) => m.t === type);
      if (i >= 0) return Promise.resolve(inbox.splice(i, 1)[0]);
      return new Promise((resolve, reject) => {
        const waiter = { type, resolve: (m) => (clearTimeout(timer), resolve(m)) };
        const timer = setTimeout(() => {
          waiters.splice(waiters.indexOf(waiter), 1);
          reject(Error("no " + type));
        }, 1000);
        waiters.push(waiter);
      });
    };
    const send = (msg) => ws.send(JSON.stringify(msg));
    return { ws, next, send };
  }

  // A seat-mode tab: waits for its challenge, can pair and answer offers.
  async function tab(key) {
    const s = await open("seat=1&frames=b1,d1");
    const welcome = await s.next("welcome");
    let { n: challenge, room } = await s.next("challenge");
    s.welcome = welcome;
    s.room = room;
    s.hello = async (token, signer = key) => {
      const proof = signer ? { jwk: signer.jwk, signature: await signer.sign(`${challenge}|${room}|${jti(token)}`) } : undefined;
      s.send({ t: "hello", seat: token, ...(proof ? { proof } : {}) });
      const seat = await s.next("seat");
      if (seat.challenge) challenge = seat.challenge;
      return seat;
    };
    s.pair = async () => {
      s.send({ t: "pair", jwk: key.jwk });
      return (await s.next("pair")).code;
    };
    s.acceptOffer = async () => {
      const offer = await s.next("seat-offer");
      challenge = offer.challenge;
      return s.hello(offer.token);
    };
    return s;
  }

  const twitchChat = (tags, login, text) =>
    handleChat(parseTwitchMessage(`@${tags} :${login}!${login}@${login}.tmi.twitch.tv PRIVMSG #owner :${text}`, "owner"));

  async function kickChat(sender, text) {
    const raw = JSON.stringify({ message_id: crypto.randomUUID(), broadcaster: { user_id: 123 }, sender, content: text });
    const id = crypto.randomUUID(),
      at = new Date().toISOString();
    const res = await fetch(`http://${base}/webhook/kick`, {
      method: "POST",
      headers: {
        "kick-event-type": "chat.message.sent",
        "kick-event-message-id": id,
        "kick-event-message-timestamp": at,
        "kick-event-signature": crypto.createSign("RSA-SHA256").update(`${id}.${at}.${raw}`).sign(kickKeys.privateKey, "base64"),
      },
      body: raw,
    });
    return res.status;
  }

  return { open, tab, twitchChat, kickChat, calls, feedLines, clients, seating, host };
}

test("a Twitch viewer, a Kick viewer and a legacy client share one room with their own names and roles", async (t) => {
  const s = await stack(t);
  const legacy = await s.open("name=old-client");
  const legacyWelcome = await legacy.next("welcome");
  assert.equal(legacyWelcome.name, "old-client");
  assert.equal(legacyWelcome.frames, "full"); // legacy clients keep full JSON frames
  assert.equal(legacyWelcome.seat, undefined);

  const alice = await tab(await browserKey(), s);
  assert.equal(alice.welcome.seat, "pending");
  assert.equal(alice.welcome.frames, "b1");
  // Pending tabs watch but cannot play or chat.
  alice.send({ t: "input", data: { kind: "key", key: "up", down: true } });
  alice.send({ t: "chat", text: "hello" });
  const code = await alice.pair();
  assert.match(code, /^[0-9A-HJKMNP-TV-Z]{6}$/);
  s.twitchChat("user-id=42;room-id=7;display-name=Alice;badges=moderator/1", "alice", `!join ${code.toLowerCase()}`);
  const aliceSeat = await alice.acceptOffer();
  assert.equal(aliceSeat.ok, true);
  assert.deepEqual(aliceSeat.identity, {
    id: "twitch:42",
    platform: "twitch",
    name: "Alice",
    roles: ["moderator"],
    verified: true,
    bound: true,
  });

  const bob = await tab(await browserKey(), s);
  const kickCode = await bob.pair();
  assert.equal(await s.kickChat({ user_id: 987, username: "bob_kick", identity: { badges: [] } }, `!join ${kickCode}`), 200);
  const bobSeat = await bob.acceptOffer();
  assert.equal(bobSeat.identity.id, "kick:987");
  assert.equal(bobSeat.identity.name, "bob_kick");
  assert.deepEqual(bobSeat.identity.roles, ["viewer"]);

  const players = [...s.clients.values()].filter((c) => c.kind === "player").map((c) => c.name).sort();
  assert.deepEqual(players, ["Alice", "bob_kick", "old-client"]);
  const joins = s.calls.filter(([fn]) => fn === "onJoin").map(([, p]) => p);
  assert.ok(joins.some((p) => p.name === "Alice" && p.platform === "twitch" && p.verified === true));
  assert.ok(joins.some((p) => p.name === "bob_kick" && p.platform === "kick"));
  assert.ok(joins.some((p) => p.name === "old-client" && p.platform === undefined));
  // Nothing reached the game from Alice while she was pending.
  const aliceId = [...s.clients.values()].find((c) => c.name === "Alice").id;
  assert.ok(!s.calls.some(([fn, id]) => fn === "onInput" && id === aliceId));
  assert.ok(!s.feedLines.some((l) => l.includes("hello")));
  assert.ok(s.feedLines.includes("Alice (twitch) paired a seat."));
  assert.ok(s.feedLines.includes("bob_kick (kick) paired a seat."));
});

// Local helper so tests read top to bottom.
function tab(key, s) {
  return s.tab(key);
}

test("codes are single use, need platform chat, and a name grants nothing", async (t) => {
  const s = await stack(t);
  const page = await s.tab(await browserKey());
  const code = await page.pair();
  // Web chat cannot pair, even under a streamer-like name.
  const guest = await s.open("name=owner");
  await guest.next("welcome");
  guest.send({ t: "chat", text: `!join ${code}` });
  await new Promise((r) => setTimeout(r, 100));
  assert.ok(s.feedLines.some((l) => l.includes("only Twitch or Kick chat can pair a seat")));
  s.twitchChat("user-id=50;room-id=7;display-name=owner", "owner", `!join ${code}`);
  const seat = await page.acceptOffer();
  // The login equals the channel, but the tags say this is not the broadcaster.
  assert.deepEqual(seat.identity.roles, ["viewer"]);
  s.twitchChat("user-id=51;room-id=7", "late", `!join ${code}`);
  assert.ok(s.feedLines.some((l) => l === "!join code from late: unknown or expired code."));
  // A web guest is marked unverified and is only ever a viewer.
  const other = await s.tab(await browserKey());
  other.send({ t: "guest", name: "Alice‮" });
  const guestSeat = await other.acceptOffer();
  assert.equal(guestSeat.identity.platform, "web");
  assert.equal(guestSeat.identity.verified, false);
  assert.equal(guestSeat.identity.name, "Alice");
  assert.deepEqual(guestSeat.identity.roles, ["viewer"]);
});

test("a tab resumes with its own key; a stolen token or another tab cannot", async (t) => {
  const s = await stack(t);
  const key = await browserKey();
  const first = await s.tab(key);
  const code = await first.pair();
  s.twitchChat("user-id=42;room-id=7;display-name=Alice", "alice", `!join ${code}`);
  const seated = await first.acceptOffer();
  first.ws.close();
  await new Promise((r) => setTimeout(r, 50));

  // Another browser with the leaked resume token is refused.
  const thief = await s.tab(await browserKey());
  assert.equal((await thief.hello(seated.resume)).reason, "proof required");
  assert.equal((await thief.hello(seated.resume, null)).reason, "proof required");
  // The same tab (same key) reloads straight into its seat.
  const reload = await s.tab(key);
  const again = await reload.hello(seated.resume);
  assert.equal(again.ok, true);
  assert.equal(again.identity.id, "twitch:42");
  // Resume tokens are single use.
  const reuse = await s.tab(key);
  assert.equal((await reuse.hello(seated.resume)).reason, "reused");
});

test("one seat per identity, Not me, and admin revocation", async (t) => {
  const s = await stack(t);
  const one = await s.tab(await browserKey());
  s.twitchChat("user-id=42;room-id=7", "alice", `!join ${await one.pair()}`);
  await one.acceptOffer();
  const two = await s.tab(await browserKey());
  const secondCode = await two.pair();
  // ChatGate still applies: a second message from the same account within 250 ms is dropped.
  s.twitchChat("user-id=42;room-id=7", "alice", `!join ${secondCode}`);
  await assert.rejects(two.next("seat-offer"), /no seat-offer/);
  s.twitchChat("user-id=42;room-id=7", "alice", `!join ${secondCode}`);
  await two.acceptOffer();
  const replaced = await one.next("seat");
  assert.equal(replaced.revoked, "replaced");
  await new Promise((r) => setTimeout(r, 50));
  assert.equal([...s.clients.values()].filter((c) => c.identity?.id === "twitch:42").length, 1);

  two.send({ t: "unseat" });
  const released = await two.next("seat");
  assert.equal(released.reason, "unseated");
  assert.equal([...s.clients.values()].filter((c) => c.kind === "player").length, 0);

  const three = await s.tab(await browserKey());
  await s.kickChat({ user_id: 5, username: "k5" }, `!join ${await three.pair()}`);
  await three.acceptOffer();
  assert.equal(s.seating.revoke("kick:5"), 1);
  assert.equal((await three.next("seat")).reason, "revoked");
  assert.equal(s.seating.roster().find((r) => r.state === "pending" && r.name === null) !== undefined, true);
});

test("pairing limits per address and in total", async (t) => {
  const { Pairings } = await import("../src/server/pairing.js");
  const p = new Pairings({ maxTotal: 3, maxPerAddress: 2 });
  p.create({ owner: 1, address: "a" });
  p.create({ owner: 2, address: "a" });
  assert.throws(() => p.create({ owner: 3, address: "a" }), /this network/);
  p.create({ owner: 4, address: "b" });
  assert.throws(() => p.create({ owner: 5, address: "c" }), /Too many people/);
  // A new code for the same tab replaces its old one.
  const { code } = p.create({ owner: 4, address: "b" });
  assert.equal(p.size, 3);
  assert.equal(p.claim(code.replace(/0/g, "O")).owner, 4); // typed O reads as 0
  assert.equal(p.claim(code), null);
});

test("the browser seat client (public/seat.js) pairs, resumes after reload and handles Not me", async (t) => {
  const { createSeatClient, tabKey } = await import("../public/seat.js");
  const s = await stack(t);
  const store = new Map();
  const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v), removeItem: (k) => store.delete(k) };
  // Same tab across "reloads": one key (IndexedDB is not available in Node, so keep the promise).
  const key = tabKey({ storage, indexedDB: undefined });
  async function page() {
    const socket = await s.open("seat=1&frames=b1,d1");
    const events = [];
    const client = createSeatClient({
      send: (m) => socket.send(m),
      keyPromise: key,
      storage,
      onSeat: (e) => events.push(["seat", e]),
      onCode: (e) => events.push(["code", e]),
      onError: (e) => events.push(["error", e]),
    });
    // The challenge arrives with the connection, before this listener exists.
    const challenge = await socket.next("challenge");
    socket.ws.on("message", (raw, binary) => {
      if (!binary) client.handle(JSON.parse(raw));
    });
    await client.handle(challenge);
    const until = async (kind) => {
      for (let i = 0; i < 100; i++) {
        const found = events.find(([k]) => k === kind);
        if (found) return events.splice(events.indexOf(found), 1)[0][1];
        await new Promise((r) => setTimeout(r, 10));
      }
      throw Error("no " + kind);
    };
    return { socket, client, until };
  }
  const first = await page();
  assert.equal((await first.until("seat")).reason, "new");
  await first.client.requestCode();
  const { code, ttlMs } = await first.until("code");
  assert.ok(ttlMs > 4 * 60 * 1000);
  await s.kickChat({ user_id: 777, username: "kick_viewer" }, `!join ${code}`);
  assert.equal((await first.until("seat")).identity.id, "kick:777");
  assert.ok(store.get("va-seat-resume"));
  first.socket.ws.close();
  await new Promise((r) => setTimeout(r, 50));
  // Reload: the stored resume token and the same key bring the seat back.
  const reload = await page();
  const resumed = await reload.until("seat");
  assert.equal(resumed.identity.id, "kick:777");
  assert.equal(resumed.identity.bound, true);
  reload.client.notMe();
  assert.equal((await reload.until("seat")).reason, "unseated");
  assert.equal(store.get("va-seat-resume"), undefined);
});

test("a full game seats the pairing client as spectator, no join feed", async (t) => {
  const s = await stack(t);
  const alice = await s.tab(await browserKey());
  const code = await alice.pair();
  const prev = s.host.join;
  s.host.join = () => false;
  try {
    await s.twitchChat("user-id=42;room-id=7;display-name=Alice", "alice", `!join ${code}`);
    const okSeat = await alice.acceptOffer();
    assert.equal(okSeat.ok, true); // claim succeeds; the seat-full notice follows
    const seat = await alice.next("seat");
    assert.equal(seat.full, true);
    assert.equal([...s.clients.values()][0].kind, "spectator");
    assert.ok(!s.feedLines.some((l) => l.includes("joined")));
    assert.ok(s.feedLines.some((l) => l.includes("is watching")));
  } finally {
    s.host.join = prev;
  }
});
