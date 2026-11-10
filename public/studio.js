import {
  $,
  state,
  setState,
  message,
  ownerHeaders,
} from "./studio/shared.js";
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
async function sandboxBanner() {
  try {
    const response = await fetch(
      "/admin/status",
      ownerHeaders ? { headers: ownerHeaders } : {},
    );
    if (!response.ok) return;
    const status = await response.json();
    $("sandbox-warning").hidden = !status.sandbox?.warning;
    if (status.sandbox?.warning)
      $("sandbox-warning").textContent =
        "Local sandbox warning: " + status.sandbox.warning;
  } catch {}
}
initConversation();
initContributionForm();
initOwnerTools();
initContributionReview();
initOwnerLock();
await refresh(true);
sandboxBanner();
async function poll() {
  await refresh();
  await sandboxBanner();
  setTimeout(poll, document.hidden ? 15000 : 5000);
}
setTimeout(poll, 5000);
setInterval(() => {
  if (state?.round?.phase === "voting") renderRound();
}, 1000);

initControls();
initWorker();
