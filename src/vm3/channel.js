// Vault side of the funnel channel: one authenticated WebSocket per room.
// The vault pushes game/viewer/room messages down and receives game lines,
// liveness beats, attach/detach events and viewer events up. Design:
// docs/platform/VM3_RUNTIME.md §4.
import crypto from "node:crypto";
import WebSocket from "ws";

const authFor = (secret, room) =>
  crypto.createHmac("sha256", secret).update("vault|" + room).digest("base64url");

export class FunnelChannel {
  constructor({
    url,               // ws(s)://host  (path /ws/platform is appended)
    room,
    secret,            // shared vault secret (VA_FUNNEL_SECRET)
    seatKey,           // SeatAuthority public key, spki der base64
    WebSocketImpl = WebSocket,
    reconnectMs = 1000,
    now = Date.now,
    onEvent = () => {},
  }) {
    if (!url || !room || !secret) throw Error("FunnelChannel needs url, room and secret.");
    Object.assign(this, {
      url: url.replace(/\/+$/, ""), room, secret, seatKey, WebSocketImpl,
      reconnectMs, now, onEvent,
    });
    this.ws = null;
    this.listeners = new Map(); // type -> Set<fn>
    this.waiters = [];          // {type, predicate, resolve, reject, timer}
    this.attached = new Map();  // room -> incarnation (game agent dialed in)
    this.closed = false;
    this.ready = null;
    this._acked = false;
    this._everAcked = false;
    this._rejectReady = null;
  }

  on(type, fn) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(fn);
    return () => this.listeners.get(type)?.delete(fn);
  }
  isAttached(room) {
    return this.attached.has(room);
  }
  emit(type, msg) {
    if (type === "game-attached" && msg?.room) this.attached.set(msg.room, msg.incarnation ?? null);
    if (type === "game-detached" && msg?.room) this.attached.delete(msg.room);
    for (const fn of this.listeners.get(type) || []) {
      try {
        fn(msg);
      } catch {}
    }
    for (let i = this.waiters.length - 1; i >= 0; i--) {
      const w = this.waiters[i];
      if (w.type === type && (!w.predicate || w.predicate(msg))) {
        this.waiters.splice(i, 1);
        clearTimeout(w.timer);
        w.resolve(msg);
      }
    }
  }
  // Resolves with the first matching inbound message, or rejects on timeout.
  waitFor(type, { predicate = null, timeoutMs = 30000 } = {}) {
    return new Promise((resolve, reject) => {
      const w = { type, predicate, resolve, reject, timer: null };
      w.timer = setTimeout(() => {
        const i = this.waiters.indexOf(w);
        if (i >= 0) this.waiters.splice(i, 1);
        reject(Error(`waitFor ${type} timeout`));
      }, timeoutMs);
      w.timer.unref?.();
      this.waiters.push(w);
    });
  }

  send(obj) {
    if (this.ws?.readyState === 1) this.ws.send(JSON.stringify(obj));
    return this.ws?.readyState === 1;
  }

  connect() {
    if (this.closed) return Promise.reject(Error("channel closed"));
    if (this.ready) return this.ready;
    this.ready = new Promise((resolve, reject) => {
      this._rejectReady = reject;
      const ws = new this.WebSocketImpl(this.url + "/ws/platform");
      this.ws = ws;
      const timer = setTimeout(() => {
        ws.terminate();
        reject(Error("funnel hello timeout"));
      }, 10000);
      timer.unref?.();
      ws.on("open", () => {
        ws.send(
          JSON.stringify({
            t: "hello",
            room: this.room,
            auth: authFor(this.secret, this.room),
            seatKey: this.seatKey,
          }),
        );
      });
      ws.on("message", (data) => {
        let msg;
        try {
          msg = JSON.parse(data.toString());
        } catch {
          return;
        }
        if (msg.t === "hello-ack" && !this._acked) {
          this._acked = true;
          this._everAcked = true;
          clearTimeout(timer);
          this._rejectReady = null;
          resolve();
        }
        this.emit(msg.t, msg);
      });
      ws.on("close", () => {
        clearTimeout(timer);
        this._acked = false;
        this.ready = null;
        // Rejected before the first ack (bad secret, unknown room): fail the
        // pending connect and do not retry — auth will not fix itself.
        if (!this._everAcked) {
          if (!this.closed) this._rejectReady?.(Error("funnel closed before hello-ack"));
          this._rejectReady = null;
          return;
        }
        this.emit("closed", { room: this.room });
        this.onEvent("funnel-channel-closed", { room: this.room });
        if (!this.closed)
          setTimeout(() => this.connect().catch(() => {}), this.reconnectMs).unref?.();
      });
      ws.on("error", () => {});
    });
    return this.ready;
  }

  close() {
    this.closed = true;
    this.ws?.close();
    for (const w of this.waiters.splice(0)) {
      clearTimeout(w.timer);
      w.reject(Error("channel closed"));
    }
  }
}
