import { WebSocket } from "ws";
import { teeJoin, teeInput, teeServerMessage } from "./tee-protocol.js";
export class TeeChatBridge {
  constructor({
    Socket = WebSocket,
    now = Date.now,
    pulseMs = 350,
    idleMs = 60000,
    codec = { join: teeJoin, input: teeInput, decode: teeServerMessage },
  } = {}) {
    this.Socket = Socket;
    this.now = now;
    this.pulseMs = pulseMs;
    this.idleMs = idleMs;
    this.codec = codec;
    if (!Number.isFinite(pulseMs) || pulseMs < 20 || pulseMs > 500 || !Number.isFinite(idleMs) || idleMs < 500 || idleMs > 60000)
      throw Error('Invalid bridge time limits.');
    this.paused = false;
    this.ws = null;
    this.timer = null;
    this.deadline = null;
    this.pendingReject = null;
    this.cooldowns = new Map();
    this.state = {
      connected: false,
      reason: "disabled",
      commands: 0,
      snapshots: 0,
    };
    this.sequence = 0;
    this.pulse = null;
  }
  status() {
    return structuredClone({
      ...this.state,
      enabled: !!this.ws,
      paused: this.paused,
      participation: 'collective-tee',
      protocol: this.codec.version || 'legacy-unversioned',
      pulseUntil: this.pulse?.until || null,
    });
  }
  async start(game, channel) {
    if (this.ws) throw Error("Bridge already enabled or connecting.");
    if (game.adapter !== "tee") throw Error("Select a Tee runtime.");
    const url = new URL(game.baseURL);
    if (url.protocol !== "https:" || url.username || url.password)
      throw Error("Use a configured HTTPS runtime.");
    url.protocol = "wss:";
    url.pathname = "/ws";
    url.search = "";
    url.hash = "";
    return this.connect(url, game.id, channel);
  }
  async startLocal(url, channel) {
    if (this.ws) throw Error("Bridge already enabled or connecting.");
    const parsed = new URL(url);
    if (this.codec.version !== 'teeworlds-rs/172cfef' || parsed.protocol !== 'ws:' || !['127.0.0.1','[::1]'].includes(parsed.hostname) || parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== '/ws')
      throw Error('Use the pinned contract and a private loopback WebSocket.');
    return this.connect(parsed, 'local-tee-prototype', channel);
  }
  pause(paused = true) {
    this.paused = !!paused;
    this.pulse = null;
    this.tick();
  }
  connect(url, gameId, channel) {
    this.state = {
      connected: false,
      reason: "connecting",
      commands: 0,
      snapshots: 0,
      gameId,
      startedAt: this.now(),
    };
    this.sequence = 0;
    this.cooldowns.clear();
    this.lastAccepted = -Infinity;
    this.pulse = null;
    this.lastCommand = this.now();
    const ws = new this.Socket(url.toString(), {
      maxPayload: 1048576,
      handshakeTimeout: 8000,
    });
    this.ws = ws;
    return new Promise((resolve, reject) => {
      this.pendingReject = reject;
      this.deadline = setTimeout(() => this.stop("connection timeout"), 10000);
      ws.on("error", () => {
        if (this.ws === ws) this.stop("connection error");
      });
      ws.on("close", () => {
        if (this.ws === ws) this.stop("disconnected");
      });
      ws.on("open", () => {
        if (this.ws === ws)
          try {
            ws.send(this.codec.join("chat@" + channel.slice(0, 25)));
          } catch {
            this.stop("join send failed");
          }
      });
      ws.on("message", async (bytes) => {
        if (this.ws !== ws) return;
        try {
          let message = this.codec.decode(bytes);
          if (message?.then) message = await message;
          if (this.ws !== ws) return;
          if (!message || !['welcome','snapshot','pong','events'].includes(message.type)) throw Error('Unknown codec message');
          if (message.type === "welcome") {
            if (this.state.connected) throw Error("Duplicate welcome.");
            this.state.connected = true;
            this.state.reason = "ready";
            this.state.playerId = message.playerId;
            clearTimeout(this.deadline);
            this.deadline = null;
            this.pendingReject = null;
            this.timer = setInterval(() => this.tick(), 20);
            resolve(this.status());
          }
          if (message.type === "snapshot") {
            if (!this.state.connected) throw Error('Snapshot before welcome.');
            this.state.snapshots++;
            this.state.lastAck = message.ack;
            const own = message.players.find(
              (p) => p.id === this.state.playerId,
            );
            if (own)
              this.state.player = {
                position: own.position,
                alive: own.alive,
                score: own.score,
              };
          }
        } catch {
          this.stop("incompatible or malformed protocol");
        }
      });
    });
  }
  command(action, { source, user } = {}) {
    if (
      source !== "twitch" ||
      this.paused ||
      typeof user !== 'string' || !user.trim() ||
      user.length > 100 ||
      !this.state.connected ||
      !["left", "right", "jump", "hook", "fire", "stop"].includes(action)
    )
      return false;
    const now = this.now(),
      key = String(user || "").toLowerCase();
    if (now - this.lastAccepted < 100) return false;
    if (now - (this.cooldowns.get(key) ?? -Infinity) < 250) return false;
    if (this.cooldowns.size > 10000) {
      for (const [key, at] of this.cooldowns)
        if (now - at > 60000) this.cooldowns.delete(key);
      if (this.cooldowns.size > 10000) return false;
    }
    this.cooldowns.set(key, now);
    this.lastAccepted = now;
    this.lastCommand = now;
    this.state.commands++;
    this.state.lastAction = action;
    this.state.lastActor = key;
    this.state.lastCommandSeq = this.sequence + 1;
    this.pulse = {
      until: now + this.pulseMs,
      input: {
        dir: action === "left" ? -1 : action === "right" ? 1 : 0,
        jump: action === "jump",
        hook: action === "hook",
        fire: action === "fire",
        aimX: action === "left" ? -1 : 1,
        weapon: 2,
      },
    };
    return true;
  }
  tick() {
    if (!this.ws || !this.state.connected) return;
    if (this.now() - this.lastCommand >= this.idleMs)
      return this.stop("idle timeout");
    if (this.ws.readyState !== 1 || this.ws.bufferedAmount > 65536)
      return this.stop("connection backpressure");
    const input =
      this.pulse && this.now() < this.pulse.until ? this.pulse.input : {};
    try {
      this.ws.send(this.codec.input(++this.sequence, input));
      this.state.lastSent = this.sequence;
    } catch {
      this.stop("input send failed");
    }
  }
  stop(reason = "disabled") {
    const ws = this.ws;
    this.ws = null;
    clearInterval(this.timer);
    clearTimeout(this.deadline);
    this.timer = null;
    this.deadline = null;
    this.pulse = null;
    this.cooldowns.clear();
    this.state.connected = false;
    this.state.reason = reason;
    const reject = this.pendingReject;
    this.pendingReject = null;
    if (reject) reject(Error(reason));
    ws?.terminate();
    return this.status();
  }
}
