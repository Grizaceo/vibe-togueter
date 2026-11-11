// Platform side of one game session: handshake, seats, input, effects,
// pause, health watchdog and failure ending. Transport-independent.
import * as M from "./messages.js";
import {
  PROTOCOL,
  PLATFORM_COMMANDS,
  validateManifest,
  derivedManifest,
} from "./manifest.js";
import { seatForGame, checkInput, EffectGate } from "./checks.js";
import { BurstCounter } from "./bursts.js";
export class GameSession {
  constructor({
    adapter,
    id,
    version,
    room,
    meta = null,
    approvedResources = null,
    protocols = [PROTOCOL],
    loadDeadlineMs = 2500,
    healthTimeoutMs = 1000,
    onEvent = () => {},
  }) {
    Object.assign(this, {
      adapter, id, version, room, meta, approvedResources, protocols,
      loadDeadlineMs, healthTimeoutMs, onEvent,
    });
    this.state = "loading";
    this.manifest = null;
    this.view = null;
    this.sdk = null;
    this.error = null;
    this.stopReason = null;
    this._seats = new Map();
    this._seq = new Map();
    this._ended = false;
  }
  async start() {
    if (this._started) throw Error("Session already started.");
    this._started = true;
    const readyP = new Promise((r) => (this._resolveReady = r));
    try {
      this._link = await this.adapter.start({
        onMessage: (line) => this._line(line),
        onExit: (info) => {
          if (!this._ended)
            this._end("Adapter exited: " + String(info?.reason || info || "unknown").slice(0, 120));
        },
        // Runtimes that relay frames at the edge (VM3 funnel) beat the health
        // watchdog on relayed traffic, not on protocol messages alone.
        onLiveness: () => this.noteLiveness(),
      });
    } catch (error) {
      this._end("Adapter failed to start: " + error.message);
      return false;
    }
    this._send = (message) => this._link.send(message);
    this._send(
      M.hello({
        protocols: this.protocols,
        room: this.room,
        limits: {
          maxFrameBytes: M.MAX_GAME_FRAME,
          maxControlBytes: M.MAX_GAME_CONTROL,
          maxTickRate: 60,
        },
      }),
    );
    this._loadTimer = setTimeout(
      () => this._end("Game load watchdog timeout."),
      this.loadDeadlineMs,
    );
    return readyP;
  }
  _acceptManifest(msg) {
    const meta = msg.sdk?.meta ?? this.meta;
    if (msg.manifest === null) {
      if (!this.adapter.legacyManifest)
        throw new M.ProtocolError("manifest-required");
      return derivedManifest({ id: this.id, version: this.version, meta });
    }
    return validateManifest(msg.manifest, {
      id: this.id,
      version: this.version,
      meta,
      approvedResources: this.approvedResources,
    });
  }
  _beat() {
    this._lastBeat = Date.now();
  }
  // Transport-level liveness for relayed runtimes: counts as a beat only
  // while the game is actually running, never during load or after end.
  noteLiveness() {
    if (this.state === "running" || this.state === "paused") this._beat();
  }
  _arm() {
    this._watch = setInterval(() => {
      if (Date.now() - this._lastBeat > this.healthTimeoutMs)
        this._end("Game health watchdog timeout.");
    }, Math.max(50, Math.floor(this.healthTimeoutMs / 2)));
  }
  _line(line) {
    if (this._ended) return;
    let msg;
    try {
      msg = M.parseGameMessage(line, {
        manifest: this.manifest,
        seats: new Set(this._seats.keys()),
        protocols: this.protocols,
      });
    } catch (error) {
      return this._end("Protocol error: " + (error.code || error.message));
    }
    if (this.state === "loading") {
      if (msg.t === "failure")
        return this._end("Game failure: " + msg.message);
      if (msg.t !== "ready") return this._end("Expected ready.");
      clearTimeout(this._loadTimer);
      try {
        this.manifest = this._acceptManifest(msg);
      } catch (error) {
        return this._end("Bad manifest: " + (error.code || error.message));
      }
      this.view = msg.view;
      this.sdk = msg.sdk ?? null;
      this.state = "running";
      this._gate = new EffectGate(this.manifest);
      this._bursts = new BurstCounter(this.manifest);
      this._beat();
      this._arm();
      this._resolveReady?.(true);
      this._resolveReady = null;
      return;
    }
    switch (msg.t) {
      case "ready":
        return this._end("Protocol error: second-ready");
      case "frame":
        this.view = msg.view;
        this._beat();
        this.onEvent("frame", msg.view);
        break;
      case "health":
        this._beat();
        break;
      case "round":
        this.onEvent("round", msg);
        break;
      case "failure":
        return this._end("Game failure: " + msg.message);
      default:
        return this._end("Protocol error: unknown-type");
    }
  }
  _end(reason) {
    if (this._ended) return;
    this._ended = true;
    this.state = "ended";
    this.error = reason;
    this._cleanup();
    this._resolveReady?.(false);
    this._resolveReady = null;
    this.onEvent("game-error", reason);
  }
  _cleanup() {
    clearTimeout(this._loadTimer);
    clearInterval(this._watch);
    try {
      this._link?.stop?.();
    } catch {}
  }
  stop(reason = "closed") {
    if (this._ended) return;
    this._ended = true;
    const r = String(reason).slice(0, 64) || "closed";
    try {
      this._send?.(M.stop(r));
    } catch {}
    this.state = "ended";
    this.stopReason = r;
    this._cleanup();
    this._resolveReady?.(false);
    this._resolveReady = null;
    this.onEvent("ended", { reason: r });
  }
  join(seat) {
    if (!["running", "paused"].includes(this.state)) return false;
    let s;
    try {
      s = seatForGame(seat);
    } catch {
      return false;
    }
    const max = this.manifest.seats?.[s.type],
      // A replace only skips the count when the type is unchanged.
      existing = this._seats.get(s.id),
      replacing = existing && existing.type === s.type;
    if (
      !replacing &&
      Number.isInteger(max) &&
      [...this._seats.values()].filter((x) => x.type === s.type).length >= max
    )
      return false;
    this._seats.set(s.id, s);
    if (!replacing) this._seq.set(s.id, 0);
    this._send(M.join(s));
    return true;
  }
  leave(id, reason = "closed") {
    if (!this._seats.delete(id)) return false;
    this._seq.delete(id);
    if (["running", "paused"].includes(this.state))
      this._send(M.leave(id, reason));
    return true;
  }
  input(id, data) {
    if (this.state !== "running" || !this._seats.has(id)) return false;
    const clean = checkInput(this.manifest, data);
    if (!clean) return false;
    const seq = (this._seq.get(id) || 0) + 1;
    this._seq.set(id, seq);
    this._send(M.input(id, seq, clean));
    return true;
  }
  chat({ cmd, args, actor }) {
    if (this.state !== "running" || PLATFORM_COMMANDS.includes(cmd))
      return null;
    if (this.manifest.chat?.passthrough) {
      this._send(
        M.chat(
          actor
            ? { name: String(actor.name || "").slice(0, 200), platform: actor.platform }
            : null,
          String(cmd).slice(0, 128),
          Array.isArray(args) ? args.map(String) : [],
        ),
      );
      return "chat";
    }
    const accepted = this._gate.accept({ cmd, args, actor });
    if (!accepted) return null;
    this._send(
      M.effect(accepted.name, accepted.args, {
        name: String(actor?.name || "").slice(0, 200),
        platform: actor?.platform,
      }),
    );
    return "effect";
  }
  // A declared burst fires once `distinct` platform identities post its token.
  crowd({ platform, identity }, text) {
    if (this.state !== "running" || this.manifest?.legacy) return null;
    const name = this._bursts?.accept({ platform, identity }, text);
    if (!name) return null;
    this._send(M.effect(name, [], null));
    return name;
  }
  effect(name, args = [], actor = null) {
    if (this.state !== "running") return false;
    this._send(M.effect(String(name).slice(0, 64), args, actor));
    return true;
  }
  pause(reason = "paused") {
    if (this.state !== "running") return false;
    this.state = "paused";
    this._send(M.pause(String(reason).slice(0, 64)));
    return true;
  }
  resume(reason = "resumed") {
    if (this.state !== "paused") return false;
    this.state = "running";
    this._send(M.resume(String(reason).slice(0, 64)));
    return true;
  }
}
