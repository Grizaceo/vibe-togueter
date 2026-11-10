// Linux-only local runtime for reviewed SDK games. Candidate builds still require separate VMs.
import { spawn, execFile, execFileSync } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildSeccompFilter } from "./seccomp-filter.js";
const src = path.dirname(fileURLToPath(import.meta.url)),
  exec = promisify(execFile);
const empty = () => ({
  bg: "#111",
  world: { w: 1280, h: 720 },
  layers: [],
  hud: [],
});
export function scopeArgs(unit = null) {
  return [
    "--user",
    "--scope",
    "--quiet",
    "--collect",
    ...(unit ? ["--unit", unit] : []),
    "-p",
    "MemoryMax=256M",
    "-p",
    "MemorySwapMax=0",
    "-p",
    "TasksMax=32",
    "-p",
    "CPUQuota=100%",
    "--",
  ];
}
// The sandbox mounts only the interpreter and the exact shared libraries the
// dynamic linker lists; a resolution failure fails closed.
export function binaryMounts(binary = "/usr/bin/node") {
  const mounts = [binary];
  const out = execFileSync("ldd", [binary], { encoding: "utf8" });
  for (const line of out.split("\n")) {
    const match = /^\s*(?:\S+\s+=>\s+)?(\/\S+)\s+\(0x[0-9a-f]+\)\s*$/.exec(
      line,
    );
    if (match && !mounts.includes(match[1])) mounts.push(match[1]);
  }
  if (mounts.length < 2)
    throw Error("Sandbox runtime libraries did not resolve.");
  return mounts;
}
let cachedMounts = null;
function nodeMounts() {
  if (!cachedMounts) cachedMounts = binaryMounts("/usr/bin/node");
  return cachedMounts;
}
export function bwrapArgs({ command, extraBinds = [] }) {
  const args = [
    "--unshare-all",
    "--unshare-user",
    "--die-with-parent",
    "--new-session",
    "--cap-drop",
    "ALL",
    "--disable-userns",
    "--seccomp",
    "3",
    // The game sees exactly PATH/HOME/LANG; bus variables may be present in
    // the spawn environment so systemd-run can reach the user manager.
    "--clearenv",
    "--setenv",
    "PATH",
    "/usr/bin",
    "--setenv",
    "HOME",
    "/tmp",
    "--setenv",
    "LANG",
    "C.UTF-8",
  ];
  for (const mount of nodeMounts())
    args.push("--ro-bind", mount, mount);
  args.push(
    "--symlink",
    "usr/lib",
    "/lib",
    "--symlink",
    "usr/lib64",
    "/lib64",
    "--proc",
    "/proc",
    "--dev",
    "/dev",
    "--tmpfs",
    "/tmp",
  );
  for (const bind of extraBinds)
    args.push("--ro-bind", bind, bind);
  args.push(
    "--ro-bind",
    path.join(src, "game-worker.js"),
    "/app/game-worker.js",
    "--ro-bind",
    path.join(src, "gamehost.js"),
    "/app/gamehost.js",
    "--chdir",
    "/tmp",
    ...command,
  );
  return args;
}
export function sandboxArgv({
  command,
  unit = null,
  cgroups = true,
  extraBinds = [],
}) {
  const bwrap = ["bwrap", ...bwrapArgs({ command, extraBinds })];
  return cgroups ? ["systemd-run", ...scopeArgs(unit), ...bwrap] : bwrap;
}
let cgroupProbe = null;
export async function cgroupsAvailable() {
  if (!cgroupProbe)
    cgroupProbe = (async () => {
      try {
        await exec("systemd-run", [...scopeArgs(), "/usr/bin/true"], {
          timeout: 5000,
        });
        return true;
      } catch {
        return false;
      }
    })();
  return cgroupProbe;
}
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
      sandbox: "namespaces",
      sandboxWarning: null,
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
    let filter, cgroups;
    try {
      // No seccomp, no game: the syscall boundary is not optional.
      filter = buildSeccompFilter(this._seccompArch);
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
    return new Promise((resolve) => {
      let settled = false,
        buffer = "";
      const done = (ok) => {
        if (!settled) {
          settled = true;
          clearTimeout(this._loadTimer);
          if (this._pendingLoad === done) this._pendingLoad = null;
          resolve(ok);
        }
      };
      this._pendingLoad = done;
      const argv = sandboxArgv({
        cgroups,
        command: [
          "/usr/bin/node",
          "--permission",
          "--allow-fs-read=/app",
          "--max-old-space-size=96",
          "--experimental-vm-modules",
          "/app/game-worker.js",
        ],
      });
      const child = spawn(argv[0], argv.slice(1), {
        env: {
          PATH: "/usr/bin",
          HOME: "/tmp",
          LANG: "C.UTF-8",
          ...(process.env.XDG_RUNTIME_DIR
            ? { XDG_RUNTIME_DIR: process.env.XDG_RUNTIME_DIR }
            : {}),
          ...(process.env.DBUS_SESSION_BUS_ADDRESS
            ? {
                DBUS_SESSION_BUS_ADDRESS:
                  process.env.DBUS_SESSION_BUS_ADDRESS,
              }
            : {}),
        },
        stdio: ["pipe", "pipe", "pipe", "pipe"],
      });
      // The seccomp program reaches bwrap through extra descriptor 3.
      child.stdio[3].on("error", () => {});
      child.stdio[3].end(filter);
      this.child = child;
      this.pid = child.pid;
      this.lastFrame = Date.now();
      const fail = (message) => {
        if (this.child !== child) return;
        this.error = message;
        this._kill();
        done(false);
        this.onEvent("game-error", message);
      };
      this._loadTimer = setTimeout(
        () => fail("Game load watchdog timeout."),
        2500,
      );
      child.on("error", (error) =>
        fail("Cannot start isolated runtime: " + error.message),
      );
      child.stdin.on("error", () => fail("Game input pipe closed."));
      // Do not forward raw worker stderr; it can contain candidate-controlled content.
      child.stderr.resume();
      child.stdout.setEncoding("utf8");
      child.on("exit", (code, signal) =>
        fail(`Game process exited (${signal || code}).`),
      );
      child.stdout.on("data", (chunk) => {
        if (this.child !== child) return;
        buffer += chunk.toString();
        if (buffer.length > 1200000)
          return fail("Game output exceeds IPC limit.");
        let end;
        while ((end = buffer.indexOf("\n")) >= 0) {
          const line = buffer.slice(0, end);
          buffer = buffer.slice(end + 1);
          try {
            const msg = JSON.parse(line);
            if (msg.t === "failure") return fail("Game failure: " + msg.error);
            if (msg.t === "ready") {
              if (msg.game?.versionSha256 !== expectedHash)
                return fail("Guest version mismatch.");
              this.game = msg.game;
              this.view = msg.view;
              done(true);
            } else if (msg.t === "frame") {
              this.view = msg.view;
              this.lastFrame = Date.now();
              this.onFrame?.();
            } else return fail("Invalid game IPC response.");
          } catch {
            return fail("Invalid game IPC JSON.");
          }
        }
      });
      this._write({ op: "load", source });
    });
  }
  _write(msg) {
    if (!this.child || this.child.stdin.destroyed) return;
    if (this.child.stdin.writableLength > 262144) {
      this.error = "Game input backpressure.";
      this._kill();
      this.onEvent("game-error", this.error);
      return;
    }
    this.child.stdin.write(JSON.stringify(msg) + "\n");
  }
  start() {
    if (!this.child || this.error) return;
    this.running = true;
    this.lastFrame = Date.now();
    this._write({ op: "start" });
    clearInterval(this._watchdog);
    this._watchdog = setInterval(() => {
      if (Date.now() - this.lastFrame > 1000) {
        this.error = "Game frame watchdog timeout.";
        this._kill();
        this.onEvent("game-error", this.error);
      }
    }, 100);
  }
  safeCall(fn, ...args) {
    if (this.game?.exports.includes(fn) && !this.error)
      this._write({ op: "call", fn, args });
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
    const pending = this._pendingLoad;
    this._pendingLoad = null;
    pending?.(false);
    clearTimeout(this._loadTimer);
    clearInterval(this._watchdog);
    const child = this.child;
    this.child = null;
    this.running = false;
    child?.kill("SIGKILL");
  }
  stop() {
    this._kill();
    this._watcher?.close();
    clearTimeout(this._debounce);
  }
}
