// Runs only inside the namespace guest. JSON lines are the complete controller protocol.
import readline from "node:readline";
import { GameHost } from "./gamehost.js";
let host, frames;
function emit(value) {
  const line = JSON.stringify(value);
  if (line.length > 600000 || !process.stdout.write(line + "\n"))
    process.exit(2);
}
function fatal(error) {
  emit({ t: "failure", error: String(error).slice(0, 500) });
  process.exit(1);
}
process.on("uncaughtException", (error) => fatal(error.message));
const lines = readline.createInterface({ input: process.stdin });
lines.on("line", async (line) => {
  try {
    if (line.length > 300000) throw Error("Input exceeds limit.");
    const msg = JSON.parse(line);
    if (msg.op === "load") {
      host = new GameHost({
        gameDir: "guest",
        onEvent: (kind, detail) => {
          if (kind === "game-error") fatal(detail);
        },
      });
      if (!(await host.loadSource(msg.source))) return fatal(host.error);
      const view = host.getView();
      if (host.error) return fatal(host.error);
      emit({
        t: "ready",
        game: {
          name: host.game.name,
          meta: host.game.meta,
          exports: host.game.exports,
          versionSha256: host.game.versionSha256,
        },
        view,
      });
    } else if (msg.op === "start") {
      // Emit right after each tick so the controller never forwards a view that
      // is up to one extra frame old. Ticks faster than ~40 Hz are thinned (the
      // controller caps state at 30 Hz); a 100 ms heartbeat keeps slow-tick
      // games inside the controller's frame watchdog.
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
    } else if (msg.op === "call") host.safeCall(msg.fn, ...msg.args);
    else throw Error("Unknown guest operation.");
  } catch (error) {
    fatal(error.message);
  }
});
process.stdin.on("end", () => process.exit());
