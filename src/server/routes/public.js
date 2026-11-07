import fs from "node:fs";
import path from "node:path";
import { staticFileInside } from "../../request-boundaries.js";

const MIME = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

export function createPublicRoutes({
  CONFIG,
  tickRounds,
  ideaRounds,
  approvalDelegation,
  TWITCH_CHANNEL,
  getTwitch,
  host,
  executionPolicy,
  studioBuilds,
  builderWarm,
  creatorAssets,
  remoteGames,
  teeSession,
  clientCredits,
  PUBLIC,
}) {
  function state(req, res, url) {
    if (url.pathname === "/community/state" && req.method === "GET") {
      if (!tickRounds()) {
        res.writeHead(503, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ code: "round_store_unavailable" }));
      }
      res.writeHead(200, {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      });
      return res.end(
        JSON.stringify({
          features: {
            communityCredit: CONFIG.features?.communityCredit === true,
          },
          round: ideaRounds.public(),
          delegation: approvalDelegation.public(),
          channel: TWITCH_CHANNEL,
          twitchConnected: !!getTwitch()?.ready,
          liveGame: host.game?.name,
          build: {
            mode: executionPolicy.mode,
            fallbackToLocal: false,
            ...studioBuilds.status(),
            warm: builderWarm.summary(),
          },
        }),
      );
    }
  }

  function community(req, res, url) {
    if (url.pathname === "/community/assets" && req.method === "GET") {
      res.writeHead(200, {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      });
      return res.end(
        JSON.stringify({
          assets: creatorAssets.catalog(),
          policy: {
            defaultTier: "free",
            paidCheckoutEnabled: false,
            platformCommission: null,
            creditPolicy: "Creator links stay in official game credits.",
          },
        }),
      );
    }
    if (url.pathname === "/community/games" && req.method === "GET") {
      res.writeHead(200, {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      });
      return res.end(
        JSON.stringify({
          ...remoteGames.catalog(),
          teeBridge: teeSession.status(),
        }),
      );
    }
    if (url.pathname === "/community/game-credits" && req.method === "GET") {
      const publication = clientCredits();
      res.writeHead(200, {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      });
      return res.end(JSON.stringify(publication));
    }
    if (
      url.pathname === "/community/asset-proposals" &&
      req.method === "POST"
    ) {
      let data = "";
      req.on("data", (chunk) => (data += chunk));
      req.on("end", () => {
        try {
          const asset = creatorAssets.draft(JSON.parse(data));
          res.writeHead(202, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ id: asset.id, status: asset.status }));
        } catch (error) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: error.message }));
        }
      });
      return true;
    }
    return false;
  }

  function staticFiles(req, res, url) {
    // static — active game's client/ dir wins over public/ (custom-client games)
    let p = url.pathname === "/" ? "/index.html" : url.pathname;
    const clientRoot = path.join(host.gameDir, "client");
    let file = path.resolve(clientRoot, "." + p);
    if (!staticFileInside(clientRoot, file)) {
      file = path.resolve(PUBLIC, "." + p);
      if (!staticFileInside(PUBLIC, file)) {
        res.writeHead(404);
        return res.end("not found");
      }
    }
    res.writeHead(200, {
      "content-type": MIME[path.extname(file)] || "application/octet-stream",
    });
    fs.createReadStream(file).pipe(res);
  }

  return { state, community, staticFiles };
}
