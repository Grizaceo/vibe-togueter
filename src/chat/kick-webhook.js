// Kick Events API webhook checks (https://docs.kick.com/events/webhook-security).
// Kick signs "<Kick-Event-Message-Id>.<Kick-Event-Message-Timestamp>.<raw body>"
// with RSA-SHA256; the message id is the idempotency key for redeliveries.
import crypto from "node:crypto";

export const KICK_MAX_SKEW_MS = 5 * 60 * 1000;

// Kick sends RFC 3339 timestamps.
export function kickTimestampMs(value) {
  const ms = Date.parse(String(value || ""));
  return Number.isFinite(ms) ? ms : NaN;
}

export function verifyKickWebhook({
  headers,
  rawBody,
  publicKey,
  now = Date.now(),
}) {
  const id = headers["kick-event-message-id"];
  const timestamp = headers["kick-event-message-timestamp"];
  const signature = headers["kick-event-signature"];
  if (!id || !timestamp || !signature)
    return { ok: false, status: 403, reason: "missing Kick-Event headers" };
  if (!publicKey)
    return { ok: false, status: 503, reason: "Kick public key unavailable" };
  let valid = false;
  try {
    valid = crypto
      .createVerify("RSA-SHA256")
      .update(`${id}.${timestamp}.${rawBody}`)
      .verify(publicKey, String(signature), "base64");
  } catch {}
  if (!valid) return { ok: false, status: 403, reason: "bad signature" };
  if (!(Math.abs(now - kickTimestampMs(timestamp)) <= KICK_MAX_SKEW_MS))
    return { ok: false, status: 403, reason: "timestamp outside 5 minutes" };
  return { ok: true, id: String(id) };
}

// Remembers delivered message ids so a redelivery is acknowledged but not replayed.
export class KickDeliveries {
  constructor({ ttlMs = 15 * 60 * 1000, max = 10000, now = Date.now } = {}) {
    Object.assign(this, { ttlMs, max, now, ids: new Map() });
  }
  // true the first time an id is seen.
  first(id) {
    const now = this.now();
    if (this.ids.has(id)) return false;
    // Insertion order is arrival order: drop expired ids, then the oldest if full.
    for (const [key, at] of this.ids) {
      if (now - at <= this.ttlMs && this.ids.size < this.max) break;
      this.ids.delete(key);
    }
    this.ids.set(id, now);
    return true;
  }
}

const positiveId = (value) =>
  (Number.isSafeInteger(value) && value > 0) ||
  (typeof value === "string" && /^[1-9]\d{0,19}$/.test(value))
    ? String(value)
    : null;

// chat.message.sent -> chat pipeline message. Roles come only from the signed
// payload: broadcaster when the sender is the event's broadcaster and that is
// the configured channel; moderator from a "moderator" badge.
export function kickChatMessage(body, { broadcasterUserId = 0 } = {}) {
  const sender = body?.sender || {};
  const userId = positiveId(sender.user_id);
  const channelId = positiveId(body?.broadcaster?.user_id);
  const configured = positiveId(broadcasterUserId);
  // Events for another channel (an app subscribed to several) are not ours.
  if (configured && channelId && channelId !== configured) return null;
  const text = String(body?.content || "").slice(0, 200);
  if (!text) return null;
  const badges = Array.isArray(sender.identity?.badges)
    ? sender.identity.badges.map((badge) => badge?.type)
    : [];
  return {
    user: String(sender.username || "anon").slice(0, 100),
    text,
    source: "kick",
    ...(typeof body?.message_id === "string"
      ? { messageId: body.message_id }
      : {}),
    ...(userId ? { platformUserId: userId } : {}),
    ...(badges.includes("moderator") ? { isModerator: true } : {}),
    ...(userId && configured && userId === channelId && userId === configured
      ? { isBroadcaster: true }
      : {}),
  };
}
