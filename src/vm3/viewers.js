// Vault side of viewer seating: turns funnel viewer events into the same
// seat/pairing/chat semantics as src/server/seating.js, but the socket (and
// the viewer IP) stays at the funnel — the vault only ever sees opaque vids.
import crypto from "node:crypto";
import { jwkThumbprint } from "../seats.js";
import { cleanDisplayName } from "../identity.js";
import { secretMatches } from "../request-boundaries.js";

export class FunnelViewers {
  constructor({
    channel,
    seats,
    pairings,
    host,
    feed = () => {},
    handleChat = () => {},
    requireBoundKey = false,
    streamerKey = () => process.env.VA_STREAMER_KEY,
    now = Date.now,
  }) {
    Object.assign(this, {
      channel, seats, pairings, host, feed, handleChat,
      requireBoundKey, streamerKey, now,
    });
    this.viewers = new Map(); // vid -> record
    this._off = [];
  }

  attach() {
    this._off = [
      this.channel.on("viewer-hello", (m) => this._hello(m)),
      this.channel.on("viewer-event", (m) => this._event(m)),
      this.channel.on("viewer-gone", (m) => this._gone(m)),
    ];
  }
  detach() {
    for (const off of this._off.splice(0)) off?.();
    for (const vid of [...this.viewers.keys()]) this._gone({ vid });
  }

  _rec(vid) {
    let rec = this.viewers.get(vid);
    if (!rec) {
      rec = { vid, kind: "pending", name: "", identity: null, jkt: null, role: "viewer", challenge: null };
      this.viewers.set(vid, rec);
    }
    return rec;
  }
  _toViewer(vid, msg) {
    this.channel.send({ t: "to-viewer", vid, msg });
  }
  _seatResult(vid, result) {
    // Routed through viewer-seat so the funnel resets kind + rotates challenge.
    this.channel.send({ t: "viewer-seat", vid, ...result });
  }

  _hello({ vid, seat: token, challenge, proof }) {
    const rec = this._rec(vid);
    if (rec.kind !== "pending") return;
    const result = this.seats.redeem(token, { challenge, proof, seat: "player" });
    if (!result.ok || (this.requireBoundKey && !result.claims.cnf?.jkt)) {
      this._seatResult(vid, {
        ok: false,
        reason: result.ok ? "key required" : result.reason,
      });
      return;
    }
    const claims = result.claims;
    // One seat per identity: a newer connection replaces the older one.
    for (const other of this.viewers.values())
      if (other !== rec && other.identity?.id === claims.sub) {
        this._seatResult(other.vid, { ok: false, revoked: "replaced" });
        this.host.leave({ id: other.vid });
        other.kind = "pending";
        other.identity = null;
      }
    this.pairings.cancel(rec);
    rec.kind = "player";
    rec.name = claims.name;
    rec.jkt = claims.cnf?.jkt || null;
    rec.identity = {
      id: claims.sub,
      platform: claims.plat,
      name: claims.name,
      roles: claims.roles,
      verified: claims.plat !== "web",
      bound: Boolean(rec.jkt),
    };
    const resume = this.seats.issue({
      sub: claims.sub, name: claims.name, plat: claims.plat,
      roles: claims.roles, seat: "player", jkt: rec.jkt,
    }).token;
    // Try the seat before answering: a full game yields one spectator
    // seatResult instead of a transient player-then-spectator pair.
    const joined = this.host.join({
      id: vid, name: claims.name, role: rec.role,
      platform: claims.plat, verified: rec.identity.verified,
    });
    rec.kind = joined ? "player" : "spectator";
    this._seatResult(vid, {
      ok: true, full: !joined, name: rec.name, jkt: rec.jkt,
      identity: rec.identity, resume,
    });
    const label = claims.plat !== "web" ? claims.plat : "web guest";
    if (joined) this.feed("system", `${rec.name} joined (${label})`);
    else this.feed("system", `${rec.name} is watching (${label}, game full)`);
  }

  _offer(rec, claims) {
    const { token } = this.seats.issue({ ...claims, seat: "player" });
    // The funnel attaches the live challenge nonce to seat-offer messages.
    this._toViewer(rec.vid, { t: "seat-offer", token });
  }

  _event({ vid, m }) {
    const rec = this.viewers.get(vid);
    if (!rec || !m || typeof m !== "object") return;
    switch (m.t) {
      case "pair": {
        if (rec.kind !== "pending") return;
        const jkt = m.jwk ? jwkThumbprint(m.jwk) : null;
        if ((m.jwk && !jkt) || (this.requireBoundKey && !jkt)) {
          this._toViewer(vid, { t: "pair", ok: false, reason: "this browser cannot create a seat key" });
          return;
        }
        try {
          const { code, expiresAt } = this.pairings.create({ owner: rec, jkt, address: "" });
          this._toViewer(vid, { t: "pair", ok: true, code, ttlMs: expiresAt - this.now() });
        } catch (error) {
          this._toViewer(vid, { t: "pair", ok: false, reason: error.message });
        }
        return;
      }
      case "guest": {
        if (rec.kind !== "pending") return;
        const name = cleanDisplayName(m.name, 20);
        if (!name) {
          this._toViewer(vid, { t: "guest", ok: false, reason: "name required" });
          return;
        }
        this.pairings.cancel(rec);
        this._offer(rec, {
          sub: "web:" + crypto.randomBytes(9).toString("base64url"),
          name, plat: "web", roles: ["viewer"], jkt: m.jwk ? jwkThumbprint(m.jwk) : null,
        });
        return;
      }
      case "unseat": {
        if (rec.kind === "player" && rec.identity) {
          this.seats.revoke(rec.identity.id);
          this.host.leave({ id: vid });
          this.feed("system", `${rec.name} left`);
          Object.assign(rec, { kind: "pending", identity: null, jkt: null, role: "viewer", name: "" });
          this._seatResult(vid, { ok: false, reason: "unseated" });
        }
        return;
      }
      case "claim-streamer": {
        if (rec.kind === "pending") return;
        if (!secretMatches(this.streamerKey(), m.key)) {
          this._toViewer(vid, { t: "role", ok: false });
          return;
        }
        if ([...this.viewers.values()].some((c) => c !== rec && c.role === "streamer")) {
          this._toViewer(vid, { t: "role", ok: false });
          return;
        }
        if (!this.host.join({ id: vid, name: rec.name, role: "streamer" })) {
          this._toViewer(vid, { t: "role", ok: false });
          return;
        }
        rec.role = "streamer";
        this._toViewer(vid, { t: "role", ok: true });
        return;
      }
      case "input":
        if (rec.kind === "player" || rec.kind === "spectator") this.host.input(vid, m.data);
        return;
      case "chat": {
        if (rec.kind === "pending") return;
        const text = String(m.text || "").slice(0, 500);
        if (!text) return;
        // "!join <code>" reaches viewers.claim through the chat pipeline's
        // claimPairing hook (wired at composition in host.js).
        this.handleChat({
          user: rec.name || "viewer",
          text,
          source: "web",
          participantId: rec.identity?.id || vid,
        });
        return;
      }
      default:
        return;
    }
  }

  _gone({ vid }) {
    const rec = this.viewers.get(vid);
    if (!rec) return;
    this.viewers.delete(vid);
    this.pairings.cancel(rec);
    if (rec.kind === "player" || rec.kind === "spectator") {
      this.host.leave({ id: vid });
      this.feed("system", `${rec.name || "viewer"} left`);
    }
  }

  // "!join <code>" from chat: mirrors seating.claim for the funnel path.
  claim(text, principal) {
    const entry = this.pairings.claim(text);
    if (!entry) return { ok: false, reason: "unknown or expired code" };
    const rec = entry.owner;
    if (!rec || !this.viewers.has(rec.vid) || rec.kind !== "pending")
      return { ok: false, reason: "that page is closed" };
    this._offer(rec, {
      sub: principal.id,
      name: principal.displayName,
      plat: principal.platform,
      roles: principal.roles || ["viewer"],
      jkt: entry.jkt,
    });
    return { ok: true, name: principal.displayName };
  }

  // Admin/vault-initiated revocation.
  revoke(sub) {
    this.seats.revoke(sub);
    let count = 0;
    for (const rec of this.viewers.values())
      if (rec.identity?.id === sub) {
        this.host.leave({ id: rec.vid });
        Object.assign(rec, { kind: "pending", identity: null, jkt: null, role: "viewer", name: "" });
        this._seatResult(rec.vid, { ok: false, reason: "revoked" });
        count++;
      }
    return count;
  }

  roster() {
    return [...this.viewers.values()].map((c) => ({
      id: c.vid, state: c.kind, name: c.name || null, identity: c.identity || null,
    }));
  }
}
