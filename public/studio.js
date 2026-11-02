import { $, state, setState, message } from "./studio/shared.js";
import { renderRound, initConversation } from "./studio/rounds.js";
import { renderAssets } from "./studio/resources.js";
import {
  initContributionForm,
  initContributionReview,
} from "./studio/contributions.js";
import { initOwnerTools, initOwnerLock } from "./studio/owner.js";
import { renderRemoteGames } from "./studio/remote-games.js";
import { initControls } from "./studio/controls.js";
import { initWorker } from "./studio/worker.js";

let refreshing = false,
  nextCatalog = 0;
export async function refresh(forceCatalog = false) {
  if (refreshing) return;
  refreshing = true;
  try {
    const catalog = forceCatalog || Date.now() >= nextCatalog;
    const responses = await Promise.all([
      fetch("/community/state"),
      ...(catalog
        ? [fetch("/community/assets"), fetch("/community/games")]
        : []),
    ]);
    if (responses.some((r) => !r.ok))
      throw new Error(
        "Studio state is temporarily unavailable. Pending decisions are retained.",
      );
    const [next, assets, games] = await Promise.all(
      responses.map((r) => r.json()),
    );
    setState(next);
    renderRound();
    if (assets) {
      renderAssets(assets);
      renderRemoteGames(games);
      nextCatalog = Date.now() + 30000;
    }
    $("connection-error").textContent = "";
  } catch (error) {
    message("connection-error", error);
  } finally {
    refreshing = false;
  }
}
initConversation();
initContributionForm();
initOwnerTools();
initContributionReview();
initOwnerLock();
await refresh(true);
async function poll() {
  await refresh();
  setTimeout(poll, document.hidden ? 15000 : 5000);
}
setTimeout(poll, 5000);
setInterval(() => {
  if (state?.round?.phase === "voting") renderRound();
}, 1000);

initControls();
initWorker();
