// SDK adapter: the isolated runtime as a protocol v1 game. The worker inside
// the sandbox speaks JSON lines; the platform only ever sees v1 messages.
import { spawn } from "node:child_process";
import { buildSeccompFilter } from "../../seccomp-filter.js";
import { sandboxArgv } from "../../sandbox.js";
export class SdkAdapter {
  legacyManifest = true;
  constructor({
    source,
    cgroups = false,
    seccompArch = process.arch,
    command = null,
    extraBinds = [],
  }) {
    Object.assign(this, { source, cgroups, seccompArch, command, extraBinds });
    this.sandbox = cgroups
      ? "namespaces+seccomp+cgroups"
      : "namespaces+seccomp";
    this.sandboxWarning = cgroups
      ? null
      : "Cgroup limits unavailable (systemd-run user scope failed); the game runs without memory, CPU and process caps.";
    this.child = null;
    this.pid = null;
  }
  start({ onMessage, onExit }) {
    // No seccomp, no game: the syscall boundary is not optional.
    const filter = buildSeccompFilter(this.seccompArch);
    const argv = sandboxArgv({
      cgroups: this.cgroups,
      command: this.command ?? [
        "/usr/bin/node",
        "--permission",
        "--allow-fs-read=/app",
        "--max-old-space-size=96",
        "--experimental-vm-modules",
        "/app/game-worker.js",
      ],
      extraBinds: this.extraBinds,
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
          ? { DBUS_SESSION_BUS_ADDRESS: process.env.DBUS_SESSION_BUS_ADDRESS }
          : {}),
      },
      stdio: ["pipe", "pipe", "pipe", "pipe"],
    });
    // The seccomp program reaches bwrap through extra descriptor 3.
    child.stdio[3].on("error", () => {});
    child.stdio[3].end(filter);
    this.child = child;
    this.pid = child.pid;
    let buffer = "";
    const write = (text) => {
      if (child.stdin.destroyed) return;
      if (child.stdin.writableLength > 262144) {
        child.kill("SIGKILL");
        onExit({ reason: "backpressure" });
        return;
      }
      child.stdin.write(text);
    };
    child.stdin.on("error", () => onExit({ reason: "stdin" }));
    // Do not forward raw worker stderr; it can contain candidate-controlled content.
    child.stderr.resume();
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      buffer += chunk.toString();
      if (buffer.length > 1200000) {
        child.kill("SIGKILL");
        return onExit({ reason: "ipc-limit" });
      }
      let end;
      while ((end = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, end);
        buffer = buffer.slice(end + 1);
        if (line) onMessage(line);
      }
    });
    child.on("error", (error) =>
      onExit({ reason: "spawn: " + error.message }),
    );
    child.on("exit", (code, signal) =>
      onExit({ reason: signal || "exit-" + code }),
    );
    write(JSON.stringify({ op: "load", source: this.source }) + "\n");
    return Promise.resolve({
      send: (message) => write(JSON.stringify(message) + "\n"),
      stop: () => child.kill("SIGKILL"),
    });
  }
}
