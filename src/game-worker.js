// Runs only inside the namespace guest. JSON lines are the complete controller protocol (va-game/1).
import readline from "node:readline";
import { GameHost } from "./gamehost.js";
let host, frames;
const seats = new Map();
function emit(value) {
  const line = JSON.stringify(value);
  if (line.length > 600000 || !process.stdout.write(line + "\n"))
    process.exit(2);
}
function fail(code, message) {
  emit({ t: "failure", code: String(code).slice(0, 64), message: String(message).slice(0, 500) });
  process.exit(1);
}
process.on("uncaughtException", (error) => fail("guest-error", error.message));
function startTicks() {
  // Emit right after each tick so the controller never forwards a view that is
  // up to one extra frame old. The 100 ms heartbeat keeps slow-tick games
  // inside the controller's health watchdog; it also runs while paused.
  let lastEmit = 0;
  const send = () => {
    lastEmit = Date.now();
    emit({ t: "frame", view: host.getView() });
  };
  host.onTick = () => {
    if (Date.now() - lastEmit >= 25) send();
  };
  host.start();
  clearInterval(frames);
  frames = setInterval(() => {
    if (Date.now() - lastEmit >= 100) send();
  }, 100);
}
const lines = readline.createInterface({ input: process.stdin });
// Line handlers must run one at a time: 'hello' cannot race an unfinished
// loadSource (readline does not await async handlers).
let chain = Promise.resolve();
lines.on("line", (line) => {
  chain = chain.then(() => handle(line));
});
async function handle(line) {
  try {
    if (line.length > 300000) throw Error("Input exceeds limit.");
    const msg = JSON.parse(line);
    if (msg.op === "load") {
      // Adapter-local operation: deliver the reviewed source before hello.
      host = new GameHost({
        gameDir: "guest",
        onEvent: (kind, detail) => {
          if (kind === "game-error") fail("game-error", detail);
        },
      });
      if (!(await host.loadSource(msg.source)))
        return fail("load-failed", host.error);
      if (host.error) return fail("load-failed", host.error);
      return;
    }
    if (!host) return fail("not-loaded", "Message before load.");
    switch (msg.t) {
      case "hello": {
        if (!Array.isArray(msg.protocol) || !msg.protocol.includes("va-game/1"))
          return fail("no-common-protocol", "Platform speaks " + JSON.stringify(msg.protocol));
        const view = host.getView();
        if (host.error) return fail("view-failed", host.error);
        emit({
          t: "ready",
          protocol: "va-game/1",
          manifest: host.game.manifest ?? null,
          view,
          sdk: {
            name: host.game.name,
            meta: host.game.meta,
            exports: host.game.exports,
            versionSha256: host.game.versionSha256,
          },
        });
        startTicks();
        return;
      }
      case "join": {
        const s = msg.seat || {};
        seats.set(s.id, s);
        host.safeCall("onJoin", {
          id: s.id,
          name: s.name,
          role: s.role,
          ...(s.platform !== undefined ? { platform: s.platform } : {}),
          ...(s.verified !== undefined ? { verified: s.verified } : {}),
        });
        return;
      }
      case "leave": {
        const known = seats.get(msg.seat?.id);
        seats.delete(msg.seat?.id);
        host.safeCall("onLeave", {
          id: msg.seat?.id,
          name: known?.name ?? "",
        });
        return;
      }
      case "input":
        host.safeCall("onInput", msg.seat, msg.data);
        return;
      case "chat":
        host.safeCall(
          "onChat",
          { name: msg.actor?.name ?? "", source: msg.actor?.platform ?? "platform" },
          msg.cmd,
          msg.args,
        );
        return;
      case "effect": {
        const actor =
          msg.actor === null
            ? null
            : { name: msg.actor?.name ?? "", platform: msg.actor?.platform ?? "platform" };
        if (host.game.exports.includes("onEffect"))
          host.safeCall("onEffect", msg.name, msg.args, actor);
        else if (
          msg.name === "crowd-bonus" &&
          host.game.exports.includes("onCrowdBonus")
        )
          host.safeCall("onCrowdBonus", msg.args[0]);
        else
          host.safeCall(
            "onChat",
            { name: actor?.name ?? "", source: actor?.platform ?? "platform" },
            msg.name,
            (msg.args || []).map(String),
          );
        return;
      }
      case "pause":
        host.stop();
        return;
      case "resume":
        host.start();
        return;
      case "stop":
        process.exit(0);
        return;
      default:
        return fail("unknown-message", String(msg.t));
    }
  } catch (error) {
    fail("guest-error", error.message);
  }
}
process.stdin.on("end", () => process.exit());
