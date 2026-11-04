// Seats for browser sockets that opt in with ?seat=1. Such a socket starts as
// "pending": it receives frames like a spectator but cannot play or chat until
// it holds a seat. A seat comes from a pairing code claimed in Twitch/Kick chat,
// from a web-guest request, or from the tab's own resume token. Sockets without
// ?seat=1 keep the legacy ?name= behaviour untouched.
// Design: docs/platform/IDENTITY_SEATS.md, sections 4 and 5.
import crypto from "node:crypto";
import { SeatAuthority, jwkThumbprint } from "../seats.js";
import { Pairings } from "./pairing.js";
import { cleanDisplayName } from "../identity.js";

const LOOPBACK = ["127.0.0.1", "::1", "::ffff:127.0.0.1"];
const nonce = () => crypto.randomBytes(16).toString("base64url");

// CF-Connecting-IP is only believed when the TCP peer is the local tunnel.
// Used for pairing limits and the admin roster; kept in memory only.
export function clientAddress(req) {
  const peer = req?.socket?.remoteAddress || "";
  const forwarded = req?.headers?.["cf-connecting-ip"];
  return LOOPBACK.includes(peer) && typeof forwarded === "string" && forwarded.length <= 64
    ? forwarded
    : peer;
}

export function createSeating({
  clients,
  host,
  feed,
  seats = new SeatAuthority(),
  pairings = new Pairings(),
  requireBoundKey = false,
  now = Date.now,
}) {
  const failures = new Map(); // address -> {minute, count}

  const send = (ws, msg) => {
    if (ws.readyState === 1) ws.send(JSON.stringify(msg));
  };
  const socketOf = (client) => {
    for (const [ws, c] of clients) if (c === client) return ws;
    return null;
  };

  // At most 10 rejected hellos per address per minute.
  function limited(address) {
    const minute = Math.floor(now() / 60000);
    const entry = failures.get(address);
    if (!entry || entry.minute !== minute) {
      if (failures.size > 10000) failures.clear();
      failures.set(address, { minute, count: 0 });
      return false;
    }
    return entry.count >= 10;
  }

  function connect(ws, client, req) {
    client.kind = "pending";
    client.seatMode = true;
    client.address = clientAddress(req);
    client.challenge = nonce();
    send(ws, { t: "challenge", n: client.challenge, room: seats.room });
  }

  // The server never hands a token to anyone but the waiting tab, and the tab
  // must still prove its key in a hello.
  function offer(ws, client, claims) {
    const { token } = seats.issue({ ...claims, seat: "player" });
    send(ws, { t: "seat-offer", token, challenge: client.challenge });
  }

  function seat(ws, client, claims) {
    // One seat per identity: a newer connection replaces the older one.
    for (const [otherWs, other] of clients)
      if (other !== client && other.identity?.id === claims.sub) {
        send(otherWs, { t: "seat", ok: false, revoked: "replaced" });
        otherWs.close(4001, "seat replaced");
      }
    pairings.cancel(client);
    const verified = claims.plat !== "web";
    client.kind = "player";
    client.name = claims.name;
    client.jkt = claims.cnf?.jkt || null;
    client.identity = {
      id: claims.sub,
      platform: claims.plat,
      name: claims.name,
      roles: claims.roles,
      verified,
      bound: Boolean(client.jkt),
    };
    // A fresh resume token lets this tab reload without pairing again.
    const resume = seats.issue({
      sub: claims.sub,
      name: claims.name,
      plat: claims.plat,
      roles: claims.roles,
      seat: "player",
      jkt: client.jkt,
    }).token;
    send(ws, { t: "seat", ok: true, identity: client.identity, resume });
    host.safeCall("onJoin", {
      id: client.id,
      name: client.name,
      role: client.role,
      platform: claims.plat,
      verified,
    });
    feed("system", `${client.name} joined (${verified ? claims.plat : "web guest"})`);
  }

  function unseat(ws, client, reason) {
    host.safeCall("onLeave", { id: client.id, name: client.name });
    feed("system", `${client.name} left`);
    Object.assign(client, { kind: "pending", identity: null, jkt: null, role: "viewer", name: "" });
    client.challenge = nonce();
    send(ws, { t: "seat", ok: false, reason, challenge: client.challenge });
  }

  // Returns true when the message belongs to seating.
  function message(ws, client, msg) {
    if (!client.seatMode) return false;
    if (msg.t === "hello") {
      if (client.kind !== "pending") return true;
      if (limited(client.address)) {
        send(ws, { t: "seat", ok: false, reason: "too many attempts", challenge: client.challenge });
        return true;
      }
      const proof =
        msg.proof && typeof msg.proof === "object"
          ? { jwk: msg.proof.jwk, signature: msg.proof.signature }
          : null;
      const result = seats.redeem(msg.seat, { challenge: client.challenge, proof, seat: "player" });
      client.challenge = nonce(); // one hello per challenge
      if (!result.ok || (requireBoundKey && !result.claims.cnf?.jkt)) {
        failures.get(client.address).count++;
        send(ws, {
          t: "seat",
          ok: false,
          reason: result.ok ? "key required" : result.reason,
          challenge: client.challenge,
        });
        return true;
      }
      seat(ws, client, result.claims);
      return true;
    }
    if (msg.t === "pair" || msg.t === "guest") {
      if (client.kind !== "pending") return true;
      const jkt = msg.jwk ? jwkThumbprint(msg.jwk) : null;
      if ((msg.jwk && !jkt) || (requireBoundKey && !jkt)) {
        send(ws, { t: msg.t, ok: false, reason: "this browser cannot create a seat key" });
        return true;
      }
      if (msg.t === "guest") {
        const name = cleanDisplayName(msg.name, 20);
        if (!name) {
          send(ws, { t: "guest", ok: false, reason: "name required" });
          return true;
        }
        pairings.cancel(client);
        offer(ws, client, {
          sub: "web:" + crypto.randomBytes(9).toString("base64url"),
          name,
          plat: "web",
          roles: ["viewer"],
          jkt,
        });
        return true;
      }
      try {
        const { code, expiresAt } = pairings.create({ owner: client, jkt, address: client.address });
        send(ws, { t: "pair", ok: true, code, ttlMs: expiresAt - now() });
      } catch (error) {
        send(ws, { t: "pair", ok: false, reason: error.message });
      }
      return true;
    }
    if (msg.t === "unseat") {
      // "Not me": the tab drops its seat and every token of that identity.
      if (client.kind === "player" && client.identity) {
        seats.revoke(client.identity.id);
        unseat(ws, client, "unseated");
      }
      return true;
    }
    return false;
  }

  // "!join <code>" from authenticated chat. principal comes from src/identity.js.
  function claim(text, principal) {
    if (!principal?.id) return { ok: false, reason: "only Twitch or Kick chat can pair a seat" };
    const entry = pairings.claim(text);
    if (!entry) return { ok: false, reason: "unknown or expired code" };
    const ws = socketOf(entry.owner);
    if (!ws || entry.owner.kind !== "pending") return { ok: false, reason: "that page is closed" };
    offer(ws, entry.owner, {
      sub: principal.id,
      name: principal.displayName,
      plat: principal.platform,
      roles: principal.roles,
      jkt: entry.jkt,
    });
    return { ok: true, name: principal.displayName };
  }

  function close(client) {
    pairings.cancel(client);
  }

  // Admin: revoke an identity and drop its sockets back to pending.
  function revoke(sub) {
    seats.revoke(sub);
    let count = 0;
    for (const [ws, client] of clients)
      if (client.identity?.id === sub) {
        unseat(ws, client, "revoked");
        count++;
      }
    return count;
  }

  function roster() {
    return [...clients.values()]
      .filter((c) => c.seatMode)
      .map((c) => ({
        id: c.id,
        state: c.kind,
        name: c.name || null,
        identity: c.identity || null,
        address: c.address || null,
      }));
  }

  return { seats, pairings, connect, message, claim, close, revoke, roster };
}
