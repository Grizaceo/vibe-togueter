import fs from "node:fs";
import path from "node:path";
import { GameCreditsSnapshot } from "../game-credits.js";

export function startPublication({ ROOT, PUBLIC, CONFIG, creatorAssets, host, broadcast }) {
const publicationSnapshot = new GameCreditsSnapshot({
  registry: creatorAssets,
  root: ROOT,
});
function clientCredits() {
  return {
    ...publicationSnapshot.get(),
    showCommunityCredit: CONFIG.features?.communityCredit === true,
  };
}
function refreshPublication() {
  publicationSnapshot.refresh(host.gameDir, host.game?.versionSha256);
  broadcast({ t: "credits", publication: clientCredits() });
}
refreshPublication();
let resourceDebounce;
const resourceWatcher = fs.watch(
  path.join(PUBLIC, "curated"),
  { recursive: true },
  () => {
    clearTimeout(resourceDebounce);
    resourceDebounce = setTimeout(refreshPublication, 25);
  },
);
resourceWatcher.on("error", () => {
  publicationSnapshot.value = {
    status: "unavailable",
    manifest: null,
    contributors: null,
  };
  broadcast({ t: "credits", publication: clientCredits() });
});
  return { clientCredits, refreshPublication, resourceWatcher, getResourceDebounce: () => resourceDebounce };
}
