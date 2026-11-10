// One Tee session: a GameSession driving the TeeAdapter (and through it the
// crowd bridge). The platform owns the lifecycle — this is not the SDK game
// fallback path.
import { GameSession } from "../protocol/session.js";
import { TeeAdapter, TEE_CONTRACT } from "../protocol/adapters/tee.js";
export function createTeeSession({ teeBridge, feed = () => {} }) {
  let session = null;
  const start = async (entry, channel) => {
    if (session && session.state !== "ended")
      throw Error("A Tee session is already running.");
    const adapter = new TeeAdapter({ entry, bridge: teeBridge, channel });
    const s = new GameSession({
      adapter,
      id: entry.id,
      version: { source: TEE_CONTRACT, runtime: entry.baseURL },
      room: entry.id,
      loadDeadlineMs: 10000,
      healthTimeoutMs: 3000,
      onEvent: (kind, detail) => {
        if (kind === "game-error") feed("system", "Tee bridge: " + detail);
      },
    });
    session = s;
    if (!(await s.start())) {
      if (session === s && s.state === "ended") session = null;
      throw Error(s.error || "Tee session failed to start.");
    }
    return teeBridge.status();
  };
  const stop = (reason = "disabled") => {
    session?.stop(reason);
    session = null;
    return teeBridge.status();
  };
  return {
    start,
    stop,
    chat: ({ cmd, args, actor }) =>
      session?.chat({ cmd, args, actor }) ?? null,
    pause: (reason = "chat-effects") => session?.pause(reason) ?? false,
    resume: (reason = "chat-effects") => session?.resume(reason) ?? false,
    status: () => ({
      ...teeBridge.status(),
      session: session?.state ?? "ended",
    }),
  };
}
