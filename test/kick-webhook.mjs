import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import {
  verifyKickWebhook,
  KickDeliveries,
  kickChatMessage,
} from "../src/chat/kick-webhook.js";

const keys = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
const publicKey = keys.publicKey.export({ type: "spki", format: "pem" });
const now = Date.parse("2026-11-03T22:00:00Z");

// Headers exactly as Kick documents them (RFC 3339 timestamp).
function signed(raw, { at = new Date(now).toISOString(), id = "01JABCDEF" } = {}) {
  const signature = crypto
    .createSign("RSA-SHA256")
    .update(`${id}.${at}.${raw}`)
    .sign(keys.privateKey, "base64");
  return {
    "kick-event-message-id": id,
    "kick-event-message-timestamp": at,
    "kick-event-signature": signature,
    "kick-event-type": "chat.message.sent",
  };
}

test("accepts Kick's documented headers and rejects tampering", () => {
  const raw = JSON.stringify({ content: "hola" });
  assert.deepEqual(verifyKickWebhook({ headers: signed(raw), rawBody: raw, publicKey, now }), {
    ok: true,
    id: "01JABCDEF",
  });
  const tampered = verifyKickWebhook({
    headers: signed(raw),
    rawBody: raw.replace("hola", "chau"),
    publicKey,
    now,
  });
  assert.equal(tampered.status, 403);
  const missing = signed(raw);
  delete missing["kick-event-signature"];
  assert.equal(verifyKickWebhook({ headers: missing, rawBody: raw, publicKey, now }).status, 403);
  assert.equal(verifyKickWebhook({ headers: signed(raw), rawBody: raw, publicKey: null, now }).status, 503);
});

test("the old kick-event-timestamp header name is not what Kick sends", () => {
  const raw = "{}";
  const headers = signed(raw);
  headers["kick-event-timestamp"] = headers["kick-event-message-timestamp"];
  delete headers["kick-event-message-timestamp"];
  assert.equal(verifyKickWebhook({ headers, rawBody: raw, publicKey, now }).ok, false);
});

test("rejects signed events older or newer than five minutes", () => {
  const raw = "{}";
  const old = new Date(now - 6 * 60 * 1000).toISOString();
  const future = new Date(now + 6 * 60 * 1000).toISOString();
  const recent = new Date(now - 4 * 60 * 1000).toISOString();
  assert.equal(verifyKickWebhook({ headers: signed(raw, { at: old }), rawBody: raw, publicKey, now }).ok, false);
  assert.equal(verifyKickWebhook({ headers: signed(raw, { at: future }), rawBody: raw, publicKey, now }).ok, false);
  assert.equal(verifyKickWebhook({ headers: signed(raw, { at: recent }), rawBody: raw, publicKey, now }).ok, true);
  assert.equal(verifyKickWebhook({ headers: signed(raw, { at: "not a date" }), rawBody: raw, publicKey, now }).ok, false);
});

test("deliveries are deduplicated by message id and bounded", () => {
  let clock = 0;
  const seen = new KickDeliveries({ ttlMs: 100, max: 3, now: () => clock });
  assert.equal(seen.first("a"), true);
  assert.equal(seen.first("a"), false);
  seen.first("b");
  seen.first("c");
  seen.first("d"); // full: the oldest id is dropped
  assert.equal(seen.ids.size, 3);
  assert.equal(seen.first("a"), true);
  clock = 1000; // all expired
  seen.first("e");
  assert.equal(seen.ids.size, 1);
});

const sample = (sender, broadcaster = { user_id: 123 }) => ({
  message_id: "m-1",
  broadcaster,
  sender,
  content: "!join K7F3QX",
});

test("Kick chat identity and roles come from the signed payload", () => {
  const viewer = kickChatMessage(
    sample({ user_id: 987, username: "viewer_kick", identity: { badges: [{ type: "subscriber", count: 3 }] } }),
    { broadcasterUserId: 123 },
  );
  assert.equal(viewer.platformUserId, "987");
  assert.equal(viewer.user, "viewer_kick");
  assert.equal(viewer.isModerator, undefined);
  assert.equal(viewer.isBroadcaster, undefined);
  const mod = kickChatMessage(
    sample({ user_id: 555, username: "mod_kick", identity: { badges: [{ type: "moderator" }] } }),
    { broadcasterUserId: 123 },
  );
  assert.equal(mod.isModerator, true);
  const owner = kickChatMessage(sample({ user_id: 123, username: "owner_kick" }), {
    broadcasterUserId: 123,
  });
  assert.equal(owner.isBroadcaster, true);
  // Without a configured channel nobody is treated as the broadcaster.
  assert.equal(kickChatMessage(sample({ user_id: 123, username: "owner_kick" })).isBroadcaster, undefined);
  // A username that looks like the channel grants nothing.
  assert.equal(
    kickChatMessage(sample({ user_id: 999, username: "owner_kick" }), { broadcasterUserId: 123 }).isBroadcaster,
    undefined,
  );
});

test("events for another Kick channel or without text are ignored", () => {
  assert.equal(
    kickChatMessage(sample({ user_id: 1, username: "x" }, { user_id: 456 }), { broadcasterUserId: 123 }),
    null,
  );
  assert.equal(kickChatMessage({ sender: { user_id: 1 }, content: "" }), null);
  // Non-numeric ids are dropped rather than trusted.
  assert.equal(kickChatMessage(sample({ user_id: "abc", username: "x" })).platformUserId, undefined);
});
