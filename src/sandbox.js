// Linux sandbox construction shared by the isolated host and adapters.
import { execFile, execFileSync } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { fileURLToPath } from "node:url";
const src = path.dirname(fileURLToPath(import.meta.url)),
  exec = promisify(execFile);
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
