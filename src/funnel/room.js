// One funnel room: the public edge for a single game session. Viewers hold
// WebSockets here; the game VM and the vault hold control links here. The
// funnel verifies seat tokens (public key only), relays va-game/1 frames to
// viewers and forwards everything else to the vault. Viewer IPs never leave
// this process: the vault only sees opaque viewer ids.
import { FrameStream } from "../server/frame-stream.js";
import { compactState } from "../traffic.js";
import { verifySeatToken } from "../seats.js";

const MAX_PENDING_TO_GAME = 64;
const LIVENESS_MS = 500;

export class FunnelRoom {
  constructor({ id, now = Date.now, log = () => {} }) {
    Object.assign(this, { id, now, log });
    this.vaults = new Set();       // vault channel sockets (control plane)
    this.viewers = new Map();      // vid -> client
    this.nextVid = 1;
    this.game = null;              // {ws, incarnation}
    this.pendingToGame = [];
    this.gameTokens = new Map();   // token -> exp (per-incarnation agent creds)
    this.seatKey = null;           // spki KeyObject from vault hello
    this.waiting = null;           // {phase, reason?} shown in lobby
    this.gameInfo = null;          // {name, desc, world} for welcome + frames
    this.fallback = null;
    this.stream = new FrameStream();
    this.lastLiveness = 0;
  }

  sendVault(obj) {
    const line = JSON.stringify(obj);
    for (const ws of this.vaults) if (ws.readyState === 1) ws.send(line);
  }
  toGame(msg) {
    const line = JSON.stringify(msg);
    if (this.game?.ws.readyState === 1) return this.game.ws.send(line);
    if (this.pendingToGame.length >= MAX_PENDING_TO_GAME) this.pendingToGame.shift();
    this.pendingToGame.push(line);
  }
  toViewer(vid, msg) {
    const client = this.viewers.get(vid);
    if (!client || client.ws.readyState !== 1) return false;
    // seat-offer carries a fresh challenge nonce: the funnel owns challenges,
    // so it mints one here and the browser proves against it in hello.
    if (msg?.t === "seat-offer") {
      client.challenge = Math.random().toString(36).slice(2) + this.now().toString(36);
      msg = { ...msg, challenge: client.challenge };
    }
    client.ws.send(JSON.stringify(msg));
    return true;
  }
  broadcast(msg) {
    const line = JSON.stringify(msg);
    for (const client of this.viewers.values())
      if (client.ws.readyState === 1) client.ws.send(line);
  }

  envelope() {
    const players = [];
    for (const c of this.viewers.values())
      if (c.kind === "player" || c.kind === "spectator")
        players.push({ id: c.vid, name: c.name || "viewer", kind: c.kind });
    const env = { players };
    if (this.gameInfo) env.game = this.gameInfo;
    if (this.waiting) env.waiting = this.waiting;
    if (this.fallback) env.fallback = this.fallback;
    return env;
  }

  // ---- game link ----------------------------------------------------------
  attachGame(ws, { incarnation = null } = {}) {
    const previous = this.game;
    this.game = { ws, incarnation };
    this.stream = new FrameStream(); // seq restarts per incarnation
    if (previous && previous.ws !== ws && previous.ws.readyState === 1)
      previous.ws.close(4000, "replaced");
    for (const line of this.pendingToGame.splice(0)) ws.send(line);
    this.sendVault({ t: "game-attached", room: this.id, incarnation });
    this.log("game-attached", { room: this.id });
  }
  detachGame(ws, reason) {
    if (this.game?.ws !== ws) return;
    this.game = null;
    // Incarnation boundary: commands buffered for the dead game must not
    // flush into the next VM's agent on attach.
    this.pendingToGame = [];
    this.sendVault({ t: "game-detached", room: this.id, reason: String(reason || "closed").slice(0, 80) });
    this.log("game-detached", { room: this.id });
  }
  gameLine(line) {
    this.sendVault({ t: "from-game", room: this.id, line });
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      return;
    }
    if (msg?.t === "frame" && msg.view && typeof msg.view === "object") {
      this.fanoutFrame(msg.view);
      const now = this.now();
      if (now - this.lastLiveness >= LIVENESS_MS) {
        this.lastLiveness = now;
        this.sendVault({ t: "game-liveness", room: this.id });
      }
    } else if (msg?.t === "ready" && msg.view && typeof msg.view === "object") {
      // First paint for viewers while the first tick frame is on its way.
      this.fanoutFrame(msg.view);
    }
  }
  fanoutFrame(view) {
    if (!this.viewers.size) return;
    const state = compactState({
      t: "state",
      ts: this.now(),
      view,
      ...this.envelope(),
    });
    const frame = this.stream.next(state);
    for (const client of this.viewers.values()) {
      if (client.ws.readyState !== 1) continue;
      const data = frame.for(client.frames, client.lastSeq);
      if (client.ws.bufferedAmount > 1024 * 1024) {
        client.ws.terminate();
        continue;
      }
      if (client.ws.bufferedAmount > 128 * 1024 && client.frames !== "legacy") continue;
      client.ws.send(data);
      client.lastSeq = frame.seq;
    }
  }

  // ---- viewers ------------------------------------------------------------
  addViewer(ws, { frames = "d1" } = {}) {
    const vid = this.nextVid++;
    const client = {
      ws, vid, kind: "pending", name: "", identity: null, jkt: null,
      challenge: null, frames: ["legacy", "d1", "b1"].includes(frames) ? frames : "d1",
      lastSeq: -1, seated: false, rate: { count: 0, at: this.now() },
    };
    this.viewers.set(vid, client);
    this.sendViewer(client, {
      t: "welcome",
      room: this.id,
      seat: "pending",
      frames: client.frames,
      waiting: this.waiting,
      game: this.gameInfo,
      fallback: this.fallback,
    });
    this.rotateChallenge(client);
    return client;
  }
  rotateChallenge(client) {
    client.challenge = Math.random().toString(36).slice(2) + Date.now().toString(36);
    this.sendViewer(client, { t: "challenge", n: client.challenge, room: this.id });
  }
  sendViewer(client, msg) {
    if (client.ws.readyState === 1) client.ws.send(JSON.stringify(msg));
  }
  removeViewer(client) {
    this.viewers.delete(client.vid);
    this.sendVault({ t: "viewer-gone", room: this.id, vid: client.vid });
  }
  viewerRateOk(client) {
    const now = this.now();
    if (now - client.rate.at > 1000) {
      client.rate = { count: 0, at: now };
    }
    return ++client.rate.count <= 240;
  }
  // Returns true when the message was consumed locally.
  viewerMessage(client, msg) {
    if (!msg || typeof msg !== "object") return false;
    switch (msg.t) {
      case "ping":
        this.sendViewer(client, { t: "pong", c: msg.c });
        return true;
      case "resync":
        client.lastSeq = -1;
        return true;
      case "hello": {
        if (client.kind !== "pending" || !client.challenge) return true;
        const challenge = client.challenge;
        if (!this.seatKey) {
          this.sendViewer(client, { t: "seat", ok: false, reason: "seats unavailable" });
          return true;
        }
        const checked = verifySeatToken(msg.seat, {
          publicKey: this.seatKey,
          room: this.id,
          now: this.now,
        });
        client.challenge = null; // one hello per challenge
        if (!checked.ok) {
          this.sendViewer(client, { t: "seat", ok: false, reason: checked.reason });
          this.rotateChallenge(client);
          return true;
        }
        // Signature/room/expiry verified at the edge; the vault redeems
        // (single-use, revocation, cnf proof) and answers viewer-seat.
        // The challenge travels with the message: it is the nonce the
        // browser proved its key against.
        this.sendVault({
          t: "viewer-hello", room: this.id, vid: client.vid,
          seat: msg.seat, challenge, proof: msg.proof ?? null,
        });
        return true;
      }
      case "pair":
      case "guest":
      case "unseat":
      case "claim-streamer":
        this.forwardViewer(client, msg);
        return true;
      case "input":
      case "chat":
        if (client.kind === "pending") return true; // not seated yet
        this.forwardViewer(client, msg);
        return true;
      default:
        return false;
    }
  }
  forwardViewer(client, msg) {
    this.sendVault({ t: "viewer-event", room: this.id, vid: client.vid, m: msg });
  }

  // Vault -> viewer seat result.
  seatResult(vid, result) {
    const client = this.viewers.get(vid);
    if (!client) return;
    if (result.ok) {
      client.kind = result.full ? "spectator" : "player";
      client.name = result.name || "";
      client.identity = result.identity || null;
      client.jkt = result.jkt || null;
      client.seated = true;
    } else {
      client.kind = "pending";
      client.seated = false;
      client.identity = null;
    }
    const { t: _t, vid: _vid, room: _room, ...seat } = result;
    this.sendViewer(client, { t: "seat", ...seat });
    if (!result.ok) this.rotateChallenge(client);
  }

  // Vault -> room control messages.
  roomMessage(msg) {
    switch (msg?.t) {
      case "waiting":
        this.waiting = msg.state ?? null;
        this.broadcast({ t: "waiting", state: this.waiting });
        break;
      case "game":
        this.gameInfo = msg.info ?? null;
        this.broadcast({ t: "game", info: this.gameInfo });
        break;
      case "fallback":
        this.fallback = msg.state ?? null;
        this.broadcast({ t: "fallback", state: this.fallback });
        break;
      case "feed":
        this.broadcast({ t: "feed", ...msg });
        break;
      case "state": // vault-driven full state (rare; e.g. cooldown screens)
        this.broadcast(msg);
        break;
      default:
        this.broadcast(msg); // pass-through room traffic
    }
  }

  revokeSeat(sub) {
    for (const client of this.viewers.values())
      if (client.identity?.id === sub) client.ws.close(4001, "seat revoked");
  }
  close() {
    for (const client of this.viewers.values()) client.ws.close(1001, "room closed");
    this.viewers.clear();
    if (this.game?.ws.readyState === 1) this.game.ws.close(1001, "room closed");
    this.game = null;
    for (const ws of this.vaults) if (ws.readyState === 1) ws.close(1001, "room closed");
    this.vaults.clear();
  }
}
