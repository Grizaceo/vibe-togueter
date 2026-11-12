// Kick events through the funnel: signed webhooks verified at the edge reach
// the vault over the channel as {t:"kick-event", id, type, body}; the shared
// createKickEventHandler dedupes across rooms. KickKeyCache covers key
// rotation, the static key and the refresh throttle.
import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { createFunnel } from "../src/funnel/index.js";
import { FunnelChannel } from "../src/vm3/channel.js";
import { KickKeyCache } from "../src/chat/kick-webhook.js";
import { createKickEventHandler } from "../src/server/kick-events.js";

const SECRET = "kick-funnel-vault-secret-0123456789";
const keys = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
const publicKey = keys.publicKey.export({ type: "spki", format: "pem" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (pred, ms = 4000) => {
  const end = Date.now() + ms;
  while (!pred()) {
    if (Date.now() > end) throw Error("condition timeout");
    await sleep(20);
  }
};

function signed(
  raw,
  {
    id = "evt-" + crypto.randomBytes(6).toString("hex"),
    type = "chat.message.sent",
    key = keys.privateKey,
  } = {},
) {
  const at = new Date().toISOString();
  const signature = crypto
    .createSign("RSA-SHA256")
    .update(`${id}.${at}.${raw}`)
    .sign(key, "base64");
  return {
    "kick-event-message-id": id,
    "kick-event-message-timestamp": at,
    "kick-event-signature": signature,
    "kick-event-type": type,
  };
}

async function startFunnel(t, opts = {}) {
  const funnel = createFunnel({ vaultSecret: SECRET, ...opts });
  await new Promise((r) => funnel.server.listen(0, "127.0.0.1", r));
  const port = funnel.server.address().port;
  t.after(() => funnel.close());
  return {
    funnel,
    url: `ws://127.0.0.1:${port}`,
    httpUrl: `http://127.0.0.1:${port}`,
  };
}

const CONFIG = {
  kick: { broadcasterUserId: 123 },
  monetization: { kickSubUsd: 5, kickUsdPerKick: 0.01 },
};
const spyStack = (over = {}) => {
  const chats = [],
    deposits = [],
    feeds = [];
  const handler = createKickEventHandler({
    CONFIG,
    simulateEventCredits: false,
    handleChat: (m) => chats.push(m),
    treasury: { deposit: (...a) => deposits.push(a) },
    feed: (k, x) => feeds.push(x),
    ...over,
  });
  return { handler, chats, deposits, feeds };
};

test("signed kick chat reaches the room's vault channel and the shared handler", async (t) => {
  const { url, httpUrl } = await startFunnel(t, { kickPublicKey: publicKey });
  const channel = new FunnelChannel({ url, room: "a", secret: SECRET });
  await channel.connect();
  t.after(() => channel.close());
  const { handler, chats } = spyStack();
  const seen = [];
  channel.on("kick-event", (m) => {
    seen.push(m);
    handler(m);
  });
  const body = {
    message_id: "m-1",
    broadcaster: { user_id: 123 },
    sender: { user_id: 777, username: "viewer_kick" },
    content: "hola desde kick",
  };
  const raw = JSON.stringify(body);
  const headers = signed(raw);
  const res = await fetch(httpUrl + "/webhook/kick", {
    method: "POST",
    headers,
    body: raw,
  });
  assert.equal(res.status, 200);
  assert.equal(await res.text(), "ok");
  await until(() => seen.length === 1);
  assert.equal(seen[0].id, headers["kick-event-message-id"]);
  assert.equal(seen[0].type, "chat.message.sent");
  assert.deepEqual(seen[0].body, body);
  assert.equal(chats.length, 1);
  assert.equal(chats[0].source, "kick");
  assert.equal(chats[0].platformUserId, "777");
  assert.equal(chats[0].user, "viewer_kick");
  // A redelivery is acknowledged but not forwarded again.
  const again = await fetch(httpUrl + "/webhook/kick", {
    method: "POST",
    headers,
    body: raw,
  });
  assert.equal(again.status, 200);
  assert.equal(await again.text(), "duplicate");
  await sleep(150);
  assert.equal(seen.length, 1);
  assert.equal(chats.length, 1);
});

test("a vault with two rooms gets one copy per channel and the handler runs once", async (t) => {
  const { url, httpUrl } = await startFunnel(t, { kickKeys: new KickKeyCache({ staticKey: publicKey }) });
  const a = new FunnelChannel({ url, room: "a", secret: SECRET });
  const b = new FunnelChannel({ url, room: "b", secret: SECRET });
  await Promise.all([a.connect(), b.connect()]);
  t.after(() => {
    a.close();
    b.close();
  });
  const { handler, chats } = spyStack();
  const seenA = [],
    seenB = [];
  const results = [];
  const wrapped = (seen) => (m) => {
    seen.push(m);
    results.push(handler(m));
  };
  a.on("kick-event", wrapped(seenA));
  b.on("kick-event", wrapped(seenB));
  const body = {
    message_id: "m-2",
    sender: { user_id: 42, username: "two_rooms" },
    content: "!tee jump",
  };
  const raw = JSON.stringify(body);
  const res = await fetch(httpUrl + "/webhook/kick", {
    method: "POST",
    headers: signed(raw),
    body: raw,
  });
  assert.equal(res.status, 200);
  await until(() => seenA.length === 1 && seenB.length === 1);
  await sleep(150);
  // The funnel fans the event out to every vault link; the shared handler's
  // ledger dedupes so the chat pipeline still runs exactly once.
  assert.equal(seenA[0].id, seenB[0].id);
  assert.deepEqual(seenA[0].body, body);
  assert.equal(results.length, 2);
  assert.deepEqual(results.sort(), ["duplicate", "ok"]);
  assert.equal(chats.length, 1, "handleChat ran exactly once across both rooms");
});

test("bad signature and missing headers are rejected before forwarding", async (t) => {
  let fetches = 0;
  const { url, httpUrl } = await startFunnel(t, {
    kickKeys: new KickKeyCache({
      staticKey: publicKey,
      fetchImpl: async () => {
        fetches++;
        return Response.json({ public_key: publicKey });
      },
    }),
  });
  const channel = new FunnelChannel({ url, room: "a", secret: SECRET });
  await channel.connect();
  t.after(() => channel.close());
  const seen = [];
  channel.on("kick-event", (m) => seen.push(m));
  const other = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
  const raw = JSON.stringify({ content: "forged" });
  const forged = await fetch(httpUrl + "/webhook/kick", {
    method: "POST",
    headers: signed(raw, { key: other.privateKey }),
    body: raw,
  });
  assert.equal(forged.status, 403);
  const bare = await fetch(httpUrl + "/webhook/kick", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: raw,
  });
  assert.equal(bare.status, 403);
  await sleep(200);
  assert.equal(seen.length, 0, "nothing reached the vault");
  assert.equal(fetches, 0, "static key never fetches, even on bad signature");
});

test("KickKeyCache rotates once a minute and a static key never fetches", async () => {
  const oldKeys = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
  const newKeys = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
  const oldPem = oldKeys.publicKey.export({ type: "spki", format: "pem" });
  const newPem = newKeys.publicKey.export({ type: "spki", format: "pem" });
  let current = oldPem;
  let fetches = 0;
  let fakeNow = Date.now();
  const cache = new KickKeyCache({
    fetchImpl: async () => {
      fetches++;
      return Response.json({ data: { public_key: current } });
    },
    now: () => fakeNow,
  });
  const raw = JSON.stringify({ content: "rotate me" });
  // Old key verifies on first fetch.
  let check = await cache.verify({
    headers: signed(raw, { key: oldKeys.privateKey, id: "rot-1" }),
    rawBody: raw,
    now: fakeNow,
  });
  assert.equal(check.ok, true);
  assert.equal(fetches, 1);
  // Kick rotates: after the refresh window the new key is picked up once.
  current = newPem;
  fakeNow += 61000;
  check = await cache.verify({
    headers: signed(raw, { key: newKeys.privateKey, id: "rot-2" }),
    rawBody: raw,
    now: fakeNow,
  });
  assert.equal(check.ok, true, "new key verifies after one refresh");
  assert.equal(fetches, 2);
  // A bad signature inside the window must not refetch.
  check = await cache.verify({
    headers: signed(raw, { key: oldKeys.privateKey, id: "rot-3" }),
    rawBody: raw,
    now: fakeNow,
  });
  assert.equal(check.ok, false);
  assert.equal(check.status, 403);
  assert.equal(fetches, 2, "refresh throttled to once per minute");
  // staticKey wins and never touches the network; "\\n" normalizes to "\n".
  let staticFetches = 0;
  const staticCache = new KickKeyCache({
    staticKey: publicKey.replace(/\n/g, "\\n"),
    fetchImpl: async () => {
      staticFetches++;
      return Response.json({ public_key: "bogus" });
    },
  });
  const okStatic = await staticCache.verify({
    headers: signed(raw, { id: "rot-4" }),
    rawBody: raw,
  });
  assert.equal(okStatic.ok, true);
  assert.equal(staticFetches, 0);
});

test("subscription credits stay off when simulateEventCredits is false", () => {
  const { handler, chats, deposits, feeds } = spyStack();
  const body = { subscriber: { username: "kickfan" } };
  assert.equal(
    handler({ id: "sub-1", type: "channel.subscription.new", body }),
    "ok",
  );
  assert.equal(deposits.length, 0);
  assert.equal(chats.length, 0);
  assert.equal(feeds.length, 0);
  assert.equal(
    handler({ id: "sub-1", type: "channel.subscription.new", body }),
    "duplicate",
  );
});

test("a forwarded event with a null body does not throw", () => {
  const { handler, chats, deposits } = spyStack({
    simulateEventCredits: true,
  });
  assert.equal(
    handler({ id: "nil-1", type: "channel.subscription.new", body: null }),
    "ok",
  );
  assert.equal(deposits.length, 1);
  assert.equal(chats.length, 0);
  assert.equal(
    handler({ id: "nil-2", type: "chat.message.sent", body: null }),
    "ok",
  );
  assert.equal(chats.length, 0);
});
