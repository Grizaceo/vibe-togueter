// Linux-only local runtime for reviewed SDK games, on protocol v1:
// a GameSession drives an SdkAdapter (the sandboxed v1 worker).
import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import { cgroupsAvailable } from "./sandbox.js";
export { scopeArgs, binaryMounts, bwrapArgs, sandboxArgv, cgroupsAvailable } from "./sandbox.js";
import { GameSession } from "./protocol/session.js";
import { SdkAdapter } from "./protocol/adapters/sdk.js";
const empty = () => ({
  bg: "#111",
  world: { w: 1280, h: 720 },
  layers: [],
  hud: [],
});
let warnedCgroups = false;
export class IsolatedGameHost {
  constructor({
    gameDir,
    onEvent = () => {},
    cgroupsProbe = cgroupsAvailable,
    seccompArch = process.arch,
  }) {
    Object.assign(this, {
      gameDir,
      onEvent,
      game: null,
      error: null,
      view: empty(),
      running: false,
      pid: null,
      child: null,
      sandbox: "namespaces",
      sandboxWarning: null,
      lastFrame: 0,
      _cgroupsProbe: cgroupsProbe,
      _seccompArch: seccompArch,
    });
  }
  async load() {
    this._kill();
    this.error = null;
    this.game = null;
    this.view = empty();
    let source;
    try {
      const file = path.join(this.gameDir, "game.js");
      if (fs.statSync(file).size > 262144)
        throw Error("Game source exceeds 256 KiB.");
      source = fs.readFileSync(file, "utf8");
    } catch (error) {
      this.error = error.message;
      this.onEvent("game-error", this.error);
      return false;
    }
    if (process.platform !== "linux") {
      this.error = "Linux bubblewrap is required; no in-process fallback.";
      this.onEvent("game-error", this.error);
      return false;
    }
    const ticket = (this._loadSeq = (this._loadSeq || 0) + 1);
    let cgroups;
    try {
      cgroups = await this._cgroupsProbe();
    } catch (error) {
      this.error = "Sandbox prerequisites failed: " + error.message;
      this.onEvent("game-error", this.error);
      return false;
    }
    // A newer load or stop superseded this one while the probe ran.
    if (ticket !== this._loadSeq) return false;
    this.sandbox = cgroups
      ? "namespaces+seccomp+cgroups"
      : "namespaces+seccomp";
    this.sandboxWarning = cgroups
      ? null
      : "Cgroup limits unavailable (systemd-run user scope failed); the game runs without memory, CPU and process caps.";
    if (this.sandboxWarning) {
      if (!warnedCgroups) {
        warnedCgroups = true;
        console.error("[vibe-arena] " + this.sandboxWarning);
      }
      this.onEvent("sandbox-warning", this.sandboxWarning);
    }
    const expectedHash = crypto
      .createHash("sha256")
      .update(source)
      .digest("hex");
    const adapter = new SdkAdapter({
      source,
      cgroups,
      seccompArch: this._seccompArch,
    });
    const session = new GameSession({
      adapter,
      id: path.basename(this.gameDir),
      version: { sha256: expectedHash },
      room: path.basename(this.gameDir),
      loadDeadlineMs: 2500,
      healthTimeoutMs: 1000,
      onEvent: (kind, detail) => {
        if (kind === "frame") {
          this.lastFrame = Date.now();
          this.view = session.view;
          this.onFrame?.();
          return;
        }
        if (kind === "game-error") {
          this.error = detail;
          this.running = false;
          this.onEvent("game-error", detail);
          return;
        }
        this.onEvent(kind, detail);
      },
    });
    this._session = session;
    const ok = await session.start();
    if (ticket !== this._loadSeq) {
      session.stop("superseded");
      return false;
    }
    if (!ok) {
      this.error = session.error;
      this._session = null;
      return false;
    }
    if (session.sdk?.versionSha256 !== expectedHash) {
      session.stop("version-mismatch");
      this.error = "Guest version mismatch.";
      this._session = null;
      this.onEvent("game-error", this.error);
      return false;
    }
    this.game = { ...session.sdk, manifest: session.manifest };
    this.view = session.view;
    this.lastFrame = Date.now();
    this.child = adapter.child;
    this.pid = adapter.pid;
    return true;
  }
  start() {
    if (!this._session || this.error) return;
    // Ticking already began at ready; the flag marks the platform's own start.
    this.running = true;
  }
  join(player) {
    return (
      this._session?.join({
        id: player.id,
        type: player.role === "streamer" ? "streamer" : "player",
        name: player.name,
        role: player.role,
        platform: player.platform,
        verified: player.verified,
      }) ?? false
    );
  }
  leave(player) {
    return this._session?.leave(player.id) ?? false;
  }
  input(id, data) {
    return this._session?.input(id, data) ?? false;
  }
  chat({ cmd, args, actor }) {
    return this._session?.chat({ cmd, args, actor }) ?? null;
  }
  effect(name, args = [], actor = null) {
    return this._session?.effect(name, args, actor) ?? false;
  }
  pause(reason = "paused") {
    return this._session?.pause(reason) ?? false;
  }
  resume(reason = "resumed") {
    return this._session?.resume(reason) ?? false;
  }
  // Compat shim for callers of the old op:"call" IPC (seating, mcp, tests).
  safeCall(fn, ...args) {
    if (this.error || !this.game?.exports.includes(fn)) return;
    if (fn === "onJoin") return this.join(args[0]);
    if (fn === "onLeave") return this.leave(args[0]);
    if (fn === "onInput") return this.input(args[0], args[1]);
    if (fn === "onChat") {
      const [actor, cmd, rest] = args;
      return this.chat({
        cmd,
        args: rest,
        actor: {
          key: String(actor?.name ?? "guest"),
          name: actor?.name ?? "",
          platform: actor?.source ?? "web",
          moderator: false,
          broadcaster: false,
        },
      });
    }
    if (fn === "onCrowdBonus")
      return this.effect("crowd-bonus", [args[0]], null);
  }
  getView() {
    return this.view;
  }
  startWatching() {
    this._watcher?.close();
    try {
      this._watcher = fs.watch(this.gameDir, () => {
        clearTimeout(this._debounce);
        this._debounce = setTimeout(async () => {
          const ok = await this.load();
          if (ok) {
            this.start();
            this.onEvent("game-reloaded", null);
          }
        }, 150);
      });
      this._watcher.on("error", (error) => {
        this.error = "Game watcher failed: " + error.message;
        this.onEvent("game-error", this.error);
      });
    } catch (error) {
      this.error = "Game watcher failed: " + error.message;
      this.onEvent("game-error", this.error);
    }
  }
  _kill() {
    this._loadSeq = (this._loadSeq || 0) + 1;
    this.running = false;
    this.child = null;
    this.pid = null;
    const session = this._session;
    this._session = null;
    session?.stop("killed");
  }
  stop() {
    this._kill();
    this._watcher?.close();
    clearTimeout(this._debounce);
  }
}
