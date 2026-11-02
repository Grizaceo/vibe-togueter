import path from "node:path";
import { IsolatedGameHost as GameHost } from "../isolated-gamehost.js";
import { reviewGame } from "../game-credits.js";
import { bundledContributorCredits } from "../contributor-credits.js";

export async function startGameRuntime({ ROOT, GAME_DIR, clients, crowdBursts, fallbackPolicy, feed, refreshPublication }) {
let transitioning = false;
let fallback = { active: false, reason: null, at: null };
let fallbackScheduled = false,
  fallbackRequested = null,
  recovering = false;
let fallbackAttempted = new Set();
function requestFallback(reason) {
  if (recovering) return;
  fallbackRequested = reason;
  if (fallbackScheduled) return;
  fallbackScheduled = true;
  setTimeout(async () => {
    fallbackScheduled = false;
    if (transitioning) return;
    const pending = fallbackRequested;
    fallbackRequested = null;
    await activateFallback(pending);
  }, 0);
}
async function activateFallback(reason) {
  if (recovering || transitioning) return false;
  recovering = true;
  if (!fallback.active || !host.error) fallbackAttempted = new Set();
  if (host.error) fallbackAttempted.add(path.basename(host.gameDir));
  fallback = {
    active: true,
    reason: String(reason).slice(0, 240),
    at: Date.now(),
  };
  try {
    for (const gameId of fallbackPolicy.effective) {
      if (fallbackAttempted.has(gameId)) continue;
      fallbackAttempted.add(gameId);
      const dir = path.join(ROOT, "games", gameId);
      try {
        const review = reviewGame(ROOT, gameId);
        if (!bundledContributorCredits(ROOT, dir, review.codeSha256)) continue;
      } catch {
        continue;
      }
      if (await loadGameDir(dir, { isFallback: true })) {
        fallback.gameId = gameId;
        feed(
          "system",
          "Safety fallback: " + host.game.name + ". " + fallback.reason,
        );
        return true;
      }
    }
    host.stop();
    feed(
      "system",
      "Fallback unavailable; gameplay stopped. " + fallback.reason,
    );
    return false;
  } finally {
    recovering = false;
  }
}

const host = new GameHost({
  gameDir: GAME_DIR,
  onEvent: (kind, detail) => {
    if (kind === "game-reloaded") {
      for (const player of clients.values())
        if (player.kind === "player")
          host.safeCall("onJoin", {
            id: player.id,
            name: player.name,
            role: player.role,
          });
      crowdBursts.reset();
      refreshPublication();
      feed("system", `Game reloaded: ${host.game?.name}`);
    }
    if (kind === "game-error") {
      feed("system", `Game stopped: ${detail}`);
      requestFallback(detail);
    }
    if (kind === "log") console.log(detail);
  },
});

if (!(await host.load())) console.error(`[boot] ${host.error}`);
if (host.game) {
  host.start();
  host.startWatching();
}

async function loadGameDir(dir, { isFallback = false } = {}) {
  if (transitioning) return false;
  transitioning = true;
  try {
    crowdBursts.reset();
    host.stop();
    host.gameDir = dir;
    if (!(await host.load())) return false;
    for (const player of clients.values())
      if (player.kind === "player")
        host.safeCall("onJoin", {
          id: player.id,
          name: player.name,
          role: player.role,
        });
    host.start();
    host.startWatching();
    refreshPublication();
    if (!isFallback) fallback = { active: false, reason: null, at: null };
    return true;
  } finally {
    transitioning = false;
    if (fallbackRequested) requestFallback(fallbackRequested);
  }
}

  return { host, requestFallback, activateFallback, loadGameDir, getFallback: () => fallback };
}
