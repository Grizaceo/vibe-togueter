// VM3 composition: wires the funnel channel, GameVmManager, FunnelViewers and
// one GameSession (va-game/1 over the channel) into the host surface the rest
// of the controller already uses. Game code never runs on this host — the
// worker lives inside VM3 and only JSON-lines cross the funnel.
// Design: docs/platform/VM3_RUNTIME.md §3-§5.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { FunnelChannel } from "./channel.js";
import { Vm3Link } from "./link.js";
import { FunnelViewers } from "./viewers.js";
import { GameVmManager } from "./manager.js";
import { GameSession } from "../protocol/session.js";
import { SeatAuthority } from "../seats.js";
import { Pairings } from "../server/pairing.js";

const MAX_SOURCE = 256 * 1024;

// Reads a bundled game's reviewed source for delivery into the VM. The hash
// stays bound to credits.json review; the source travels as data, never
// executes here.
export function bundledImageSpec({ key, dir, root, ref = "va-game:1" }) {
  const file = path.join(root, dir, "game.js");
  const source = fs.readFileSync(file, "utf8");
  if (source.length > MAX_SOURCE) throw Error("game source too large: " + dir);
  return {
    key,
    ref,
    dir,
    payload: { kind: "sdk-source", source },
    version: { sha256: crypto.createHash("sha256").update(source).digest("hex") },
  };
}

export class Vm3Host {
  constructor() {
    this.game = null;
    this.error = null;
    this.view = null;
    this.gameDir = null;
    this.sandbox = "vm3";
    this.session = null;
    this.onFrame = null;
    this.onEvent = null;
    this._closing = false;
  }
  getView() {
    return this.session?.view ?? this.view;
  }
  join(seat) {
    return this.session?.join(seat) ?? false;
  }
  leave(seat) {
    return this.session?.leave(seat);
  }
  input(id, data) {
    return this.session?.input(id, data);
  }
  chat(msg) {
    return this.session?.chat(msg);
  }
  crowd(who, text) {
    return this.session?.crowd(who, text);
  }
  effect(name, args, actor) {
    return this.session?.effect(name, args, actor);
  }
  pause(reason) {
    return this.session?.pause(reason);
  }
  resume(reason) {
    return this.session?.resume(reason);
  }
  stop(reason = "closed") {
    try {
      this.session?.stop(reason);
    } catch {}
  }
}

export async function createVm3Host({
  backend,
  funnelUrl,
  room,
  vaultSecret,
  seatKey = process.env.VA_SEAT_KEY,
  images,
  root = process.cwd(),
  journalDir = null,
  feed = () => {},
  handleChat = () => {},
  requireBoundKey = false,
  attachTimeoutMs = 90000,
  statusPollMs = 5000,
  loadDeadlineMs = 8000,
  healthTimeoutMs = 4000,
  now = Date.now,
  onEvent = () => {},
}) {
  if (!backend || !funnelUrl || !room || !vaultSecret)
    throw Error("createVm3Host needs backend, funnelUrl, room and vaultSecret.");
  const seats = new SeatAuthority({ room, key: seatKey, now });
  const pairings = new Pairings({ now });
  const host = new Vm3Host();
  const channel = new FunnelChannel({
    url: funnelUrl,
    room,
    secret: vaultSecret,
    seatKey: seats.publicKey.export({ type: "spki", format: "der" }).toString("base64"),
    now,
    onEvent,
  });
  await channel.connect();

  const viewers = new FunnelViewers({
    channel, seats, pairings, host, feed, handleChat, requireBoundKey, now,
  });
  viewers.attach();

  const manager = new GameVmManager({
    backend,
    room,
    images,
    file: journalDir ? `${journalDir}/gamevm-${room.replace(/[^a-zA-Z0-9_-]/g, "_")}.json` : null,
    attachTimeoutMs,
    statusPollMs,
    now,
    onEvent,
    hooks: {
      registerGameToken: async ({ token, ttlMs }) =>
        channel.send({ t: "game-token", token, exp: now() + ttlMs }),
      revokeGameToken: async ({ token }) =>
        channel.send({ t: "game-token-revoke", token }),
      setWaiting: async (state) =>
        channel.send({ t: "room", msg: { t: "waiting", state } }),
      waitAttach: ({ timeoutMs }) =>
        channel.waitFor("game-attached", {
          predicate: (m) => m.room === room,
          timeoutMs,
        }),
      beforeDestroy: async () => {
        host.stop("vm-reset");
        // Wait until the agent's game socket actually detaches at the funnel
        // so the dead incarnation cannot leak frames into the next attach.
        // Bounded: the provider destroy behind this is the real guarantee.
        if (channel.isAttached?.(room))
          await channel
            .waitFor("game-detached", {
              predicate: (m) => m.room === room,
              timeoutMs: 2000,
            })
            .catch(() => {});
      },
    },
  });

  function pushGameInfo() {
    const m = host.session?.sdk?.meta ?? host.session?.manifest;
    channel.send({
      t: "room",
      msg: {
        t: "game",
        info: m
          ? {
              name: m.name ?? m.id ?? "game",
              desc: m.description ?? "",
              world: m.world ?? null,
            }
          : null,
      },
    });
  }

  async function startSession(imageKey, spec) {
    host.stop("reload");
    const session = new GameSession({
      adapter: new Vm3Link({ channel, room, payload: spec?.payload ?? null, attachTimeoutMs }),
      id: imageKey,
      version: spec?.version ?? { sha256: "vm3" },
      room,
      meta: spec?.meta ?? null,
      loadDeadlineMs,
      healthTimeoutMs,
      onEvent: (kind, data) => {
        if (kind === "frame") host.onFrame?.(data);
        if (kind === "game-error" && !host._closing) {
          host.error = data;
          // Watchdog fallback: any protocol/health failure returns VM3 to the
          // default image. Goes through the same serialized path as the
          // streamer button so it cannot race a manual loadGame.
          fallback("watchdog: " + String(data).slice(0, 120)).catch((e) =>
            onEvent("vm3-fallback-failed", { error: String(e) }),
          );
        }
        if (kind === "ended") host.view = null;
        onEvent("vm3-" + kind, data);
      },
    });
    host.session = session;
    host.gameDir = spec?.dir ? path.resolve(root, spec.dir) : null;
    const ready = await session.start();
    if (!ready) throw Error("Game failed to start: " + (session.error || "unknown"));
    // SDK games report identity in sdk.meta (manifest may be derived/null).
    const meta = session.sdk?.meta ?? session.manifest ?? {};
    host.game = {
      name: meta.name ?? imageKey,
      meta: {
        description: meta.description ?? "",
        world: meta.world ?? session.manifest?.world ?? null,
        tickRate: meta.tickRate ?? session.manifest?.tickRate ?? null,
        versionSha256: spec?.version?.sha256 ?? null,
      },
    };
    host.view = session.view;
    host.error = null;
    pushGameInfo();
    return session;
  }

  // Session operations are serialized like the manager's: a watchdog
  // fallback racing a streamer loadGame must not attach a session to the
  // wrong incarnation.
  let tail = Promise.resolve();
  const enqueue = (fn) => {
    const run = tail.then(fn);
    tail = run.then(() => undefined, () => undefined);
    return run;
  };

  async function loadGame(imageKey = "default") {
    return enqueue(async () => {
      const spec = images[imageKey];
      if (!spec) throw Error("Unknown image: " + imageKey);
      await manager.activate(imageKey, {
        game: spec.game ?? { key: imageKey },
      });
      return startSession(imageKey, spec);
    });
  }

  async function fallback(reason = "fallback") {
    return enqueue(async () => {
      await manager.fallback(reason);
      return startSession("default", images.default);
    });
  }

  async function open() {
    return enqueue(async () => {
      // Provision + attach the default image once; the session starts on the
      // already-clean incarnation (no second reset).
      await manager.open();
      return startSession("default", images.default);
    });
  }

  async function close() {
    if (host._closing) return;
    host._closing = true;
    return enqueue(async () => {
      try {
        host.stop("session-close");
        await manager.close();
      } finally {
        viewers.detach();
        channel.close();
      }
    });
  }

  return {
    host,
    manager,
    channel,
    viewers,
    seats,
    pairings,
    loadGame,
    fallback,
    open,
    close,
    claimPairing: (code, principal) => viewers.claim(code, principal),
  };
}
