import fs from "node:fs";
import path from "node:path";
import { secretMatches } from "../../request-boundaries.js";
import { importCuratedResource } from "../../curated-resources.js";
import { reviewGame, publishGameCredits } from "../../game-credits.js";

export function createAdminRoutes({
  ROOT,
  CONFIG,
  builderWarm,
  studioBuilds,
  TWITCH_CHANNEL,
  tickRounds,
  approvalDelegation,
  predictions,
  fallbackPolicy,
  chatEffects,
  crowdBursts,
  teeBridge,
  feed,
  activateFallback,
  getFallback,
  buildQuarantine,
  ideaRounds,
  creatorAssets,
  refreshPublication,
  remoteGames,
  requireNoPendingArtifact,
  readIdeas,
  treasury,
  generateFromIdea,
  host,
  clients,
  isGenerating,
  handleChat,
  loadGameDir,
  publicLink,
  seating,
}) {
  return async function adminRoutes(req, res, url) {
    // admin (localhost only)
    if (url.pathname.startsWith("/admin/")) {
      if (
        req.headers["cf-connecting-ip"] ||
        req.headers["x-forwarded-for"] ||
        req.headers.forwarded
      ) {
        res.writeHead(403);
        return res.end("local admin only");
      }
      if (
        process.env.VA_ADMIN_TOKEN &&
        !secretMatches(
          "Bearer " + process.env.VA_ADMIN_TOKEN,
          req.headers.authorization,
        )
      ) {
        res.writeHead(403);
        return res.end("admin authentication required");
      }
      const ip = req.socket.remoteAddress;
      if (ip !== "127.0.0.1" && ip !== "::1" && ip !== "::ffff:127.0.0.1") {
        res.writeHead(403);
        return res.end("localhost only");
      }
      // Local admin authentication and streamer confirmation remain separate gates.
      const streamerConfirmed = secretMatches(
        process.env.VA_STREAMER_KEY,
        req.headers["x-streamer-key"],
      );
      const readBody = () =>
        new Promise((r) => {
          let b = "";
          req.on("data", (c) => (b += c));
          req.on("end", () => r(b));
        });
      if (
        url.pathname === "/admin/builder-session" &&
        ["GET", "POST"].includes(req.method)
      ) {
        if (!streamerConfirmed) {
          res.writeHead(403);
          return res.end("streamer confirmation required");
        }
        try {
          let result;
          if (req.method === "GET") result = builderWarm.privateSummary();
          else {
            const data = JSON.parse((await readBody()) || "{}");
            if (data.action === "prepare") {
              const j = studioBuilds.public();
              if (
                j &&
                ![
                  "failed",
                  "cancelled",
                  "tests-failed",
                  "reviewed-publication",
                ].includes(j.phase)
              )
                throw Error(
                  "Finish or cancel the existing artifact/job first.",
                );
              result = await builderWarm.prepare();
            } else if (data.action === "extend")
              result = await builderWarm.extend();
            else if (data.action === "close")
              result = await builderWarm.close();
            else throw Error("Use prepare, extend or close.");
          }
          res.writeHead(200, {
            "Content-Type": "application/json",
            "Cache-Control": "no-store",
          });
          return res.end(JSON.stringify(result));
        } catch (error) {
          res.writeHead(400, { "Content-Type": "application/json" });
          return res.end(JSON.stringify({ error: error.message }));
        }
      }
      if (
        url.pathname === "/admin/studio-builds" &&
        ["GET", "POST"].includes(req.method)
      ) {
        if (!streamerConfirmed) {
          res.writeHead(403);
          return res.end("streamer confirmation required");
        }
        try {
          let result;
          if (req.method === "GET") result = studioBuilds.status();
          else {
            const data = JSON.parse((await readBody()) || "{}");
            if (["check", "dispatch"].includes(data.action))
              await builderWarm.heartbeat();
            if (data.action === "check") result = await studioBuilds.check();
            else if (data.action === "dispatch") {
              if (!tickRounds()) throw Error("Round storage unavailable");
              result = await studioBuilds.dispatch({
                roundId: data.roundId,
                approvedInputHash: data.approvedInputHash,
              });
            } else if (data.action === "cancel")
              result = await studioBuilds.cancel(data.id);
            else if (data.action === "reconcile")
              result = await studioBuilds.reconcile(data.id);
            else if (data.action === "inspect")
              result = studioBuilds.inspect(data.id);
            else if (data.action === "publish-review")
              result = studioBuilds.publish(data.id, data, {
                owner: true,
                name: TWITCH_CHANNEL || "local streamer",
                source: "streamer-ui",
              });
            else throw Error("Unknown studio build action.");
          }
          res.writeHead(200, {
            "Content-Type": "application/json",
            "Cache-Control": "no-store",
          });
          return res.end(JSON.stringify(result));
        } catch (error) {
          res.writeHead(400, { "Content-Type": "application/json" });
          return res.end(JSON.stringify({ error: error.message }));
        }
      }
      if (
        url.pathname === "/admin/approval-delegate" &&
        ["GET", "POST"].includes(req.method)
      ) {
        if (!streamerConfirmed) {
          res.writeHead(403);
          return res.end("streamer confirmation required");
        }
        try {
          const actor = {
            owner: true,
            source: "streamer-ui",
            name: TWITCH_CHANNEL || "local streamer",
          };
          if (req.method === "POST") {
            const body = JSON.parse((await readBody()) || "{}");
            if (body.action === "revoke") approvalDelegation.revoke(actor);
            else if (body.action === "grant")
              approvalDelegation.set(actor, body.name, body.seconds);
            else throw Error("Unknown delegation action.");
          }
          res.writeHead(200, { "Content-Type": "application/json" });
          return res.end(
            JSON.stringify({
              enabled: approvalDelegation.enabled,
              grant: approvalDelegation.public(),
            }),
          );
        } catch (error) {
          res.writeHead(400);
          return res.end(error.message);
        }
      }
      if (url.pathname === "/admin/prediction" && req.method === "POST") {
        if (!streamerConfirmed) {
          res.writeHead(403);
          return res.end("streamer confirmation required");
        }
        try {
          const data = JSON.parse((await readBody()) || "{}"),
            actor = {
              owner: true,
              source: "streamer-ui",
              name: TWITCH_CHANNEL || "local streamer",
            };
          if (data.action === "open") predictions.open(actor, data.choices);
          else if (data.action === "lock") predictions.lock(actor);
          else if (data.action === "resolve")
            predictions.resolve(actor, data.choice);
          else if (data.action === "cancel") predictions.cancel(actor);
          else throw Error("Unknown prediction action.");
          res.writeHead(200, { "Content-Type": "application/json" });
          return res.end(JSON.stringify(predictions.public()));
        } catch (error) {
          res.writeHead(400);
          return res.end(error.message);
        }
      }
      if (
        url.pathname === "/admin/fallback-order" &&
        ["GET", "POST"].includes(req.method)
      ) {
        if (!streamerConfirmed) {
          res.writeHead(403);
          return res.end("streamer confirmation required");
        }
        try {
          if (req.method === "POST")
            fallbackPolicy.set(JSON.parse((await readBody()) || "{}").order);
          res.writeHead(200, { "Content-Type": "application/json" });
          return res.end(
            JSON.stringify({
              enabled: fallbackPolicy.enabled,
              order: fallbackPolicy.effective,
            }),
          );
        } catch (error) {
          res.writeHead(400);
          return res.end(error.message);
        }
      }
      if (url.pathname === "/admin/chat-effects" && req.method === "POST") {
        if (!streamerConfirmed) {
          res.writeHead(403);
          return res.end("streamer confirmation required");
        }
        try {
          const body = JSON.parse((await readBody()) || "{}");
          if (typeof body.paused !== "boolean")
            throw Error("paused must be boolean");
          const result = chatEffects.setPaused(body.paused);
          if (result.changed) {
            if (chatEffects.blocked) {
              crowdBursts.reset();
              teeBridge.pulse = null;
              teeBridge.tick();
            }
            feed(
              "system",
              chatEffects.blocked
                ? "Chat effects paused by local streamer"
                : "Chat effects resumed by local streamer",
            );
          }
          res.writeHead(200, { "Content-Type": "application/json" });
          return res.end(
            JSON.stringify({
              enabled: chatEffects.enabled,
              paused: chatEffects.blocked,
            }),
          );
        } catch (error) {
          res.writeHead(400);
          return res.end(error.message);
        }
      }
      if (url.pathname === "/admin/fallback" && req.method === "POST") {
        if (!streamerConfirmed) {
          res.writeHead(403);
          return res.end("streamer confirmation required");
        }
        const ok = await activateFallback("Requested by local streamer");
        res.writeHead(ok ? 200 : 503, { "Content-Type": "application/json" });
        return res.end(JSON.stringify(getFallback()));
      }
      if (
        url.pathname === "/admin/build-quarantine" &&
        (req.method === "GET" || req.method === "POST")
      ) {
        if (!streamerConfirmed) {
          res.writeHead(403);
          return res.end("streamer confirmation required");
        }
        try {
          const actor = {
            owner: true,
            name: TWITCH_CHANNEL || "local streamer",
            source: "streamer-ui",
          };
          let result;
          if (req.method === "GET") result = buildQuarantine.list();
          else {
            const data = JSON.parse((await readBody()) || "{}");
            // Recheck the canonical round content, not a caller-provided approval.
            const approvedRound = (allowCompleted = false) => {
              if (!tickRounds()) throw Error("Round storage unavailable.");
              const round = ideaRounds.public();
              const text = round?.selected
                .map((id) => round.ideas.find((i) => i.id === id).text)
                .join("\n\n");
              if (
                !(
                  allowCompleted &&
                  round?.phase === "completed" &&
                  ideaRounds.inputHash() === round.approvedInputHash
                ) &&
                !ideaRounds.buildPermission(text, {
                  roundId: round?.id,
                  approvedInputHash: round?.approvedInputHash,
                })
              )
                throw Error("Approved matching community round required.");
              return round;
            };
            if (data.action === "issue")
              result = buildQuarantine.issue(actor, approvedRound(), data);
            else if (data.action === "inspect")
              result = buildQuarantine.inspect(data.id);
            else if (data.action === "receive")
              result = buildQuarantine.receive(actor, data.id, data);
            else if (data.action === "begin-test")
              result = buildQuarantine.beginTest(
                actor,
                data.id,
                data.artifactHash,
              );
            else if (data.action === "record-test")
              result = buildQuarantine.recordTest(actor, data.id, data.report);
            else if (data.action === "approve")
              result = buildQuarantine.approve(
                actor,
                data.id,
                data,
                approvedRound(true),
              );
            else if (data.action === "cancel" || data.action === "reject")
              result = buildQuarantine.close(
                actor,
                data.id,
                data.action === "cancel" ? "cancelled" : "rejected",
              );
            else throw Error("Unknown quarantine action.");
          }
          res.writeHead(200, {
            "Content-Type": "application/json",
            "Cache-Control": "no-store",
          });
          return res.end(JSON.stringify(result));
        } catch (error) {
          res.writeHead(400, { "Content-Type": "application/json" });
          return res.end(JSON.stringify({ error: error.message }));
        }
      }
      if (url.pathname === "/admin/owner-status" && req.method === "GET") {
        res.writeHead(streamerConfirmed ? 200 : 403, {
          "Content-Type": "application/json",
        });
        return res.end(JSON.stringify({ ok: streamerConfirmed }));
      }
      if (url.pathname === "/admin/assets" && req.method === "GET") {
        res.writeHead(200, { "Content-Type": "application/json" });
        return res.end(JSON.stringify(creatorAssets.data.assets));
      }
      if (url.pathname === "/admin/game-publication" && req.method === "POST") {
        try {
          if (!streamerConfirmed) {
            res.writeHead(403);
            return res.end("streamer confirmation required");
          }
          const data = JSON.parse((await readBody()) || "{}");
          const result =
            data.action === "review"
              ? reviewGame(ROOT, data.gameId)
              : data.action === "publish"
                ? publishGameCredits(creatorAssets, ROOT, data)
                : null;
          if (!result) throw Error("Unknown publication action.");
          if (data.action === "publish") refreshPublication();
          res.writeHead(200, { "Content-Type": "application/json" });
          return res.end(JSON.stringify(result));
        } catch (error) {
          res.writeHead(400);
          return res.end(error.message);
        }
      }
      if (url.pathname === "/admin/tee-bridge" && req.method === "POST") {
        try {
          if (!streamerConfirmed) {
            res.writeHead(403);
            return res.end("streamer confirmation required");
          }
          const data = JSON.parse((await readBody()) || "{}");
          let result;
          if (data.action === "enable")
            result = await teeBridge.start(
              remoteGames.entry(data.gameId),
              TWITCH_CHANNEL || "local",
            );
          else if (data.action === "disable") result = teeBridge.stop();
          else throw Error("Unknown bridge action.");
          res.writeHead(200, { "Content-Type": "application/json" });
          return res.end(JSON.stringify(result));
        } catch (error) {
          res.writeHead(400);
          return res.end(error.message);
        }
      }
      if (url.pathname === "/admin/remote-games" && req.method === "POST") {
        try {
          if (!streamerConfirmed) {
            res.writeHead(403);
            return res.end("streamer confirmation required");
          }
          const data = JSON.parse((await readBody()) || "{}");
          let result;
          if (data.action === "inspect")
            result = await remoteGames.inspect(data.gameId);
          else if (data.action === "create")
            result = await remoteGames.create(
              data.gameId,
              data.requestId,
              TWITCH_CHANNEL || "",
            );
          else if (data.action === "start")
            result = await remoteGames.start(data.sessionId);
          else if (data.action === "reconcile")
            result = await remoteGames.reconcile(data.sessionId);
          else throw Error("Unknown remote game action.");
          res.writeHead(200, { "Content-Type": "application/json" });
          return res.end(JSON.stringify(result));
        } catch (error) {
          res.writeHead(400);
          return res.end(error.message);
        }
      }
      if (url.pathname === "/admin/assets/import" && req.method === "POST") {
        try {
          if (!streamerConfirmed) {
            res.writeHead(403);
            return res.end("streamer confirmation required");
          }
          const data = JSON.parse((await readBody()) || "{}");
          const asset = importCuratedResource(creatorAssets, ROOT, data.key);
          res.writeHead(200, { "Content-Type": "application/json" });
          return res.end(JSON.stringify(asset));
        } catch (error) {
          res.writeHead(400);
          return res.end(error.message);
        }
      }
      if (url.pathname === "/admin/assets/review" && req.method === "POST") {
        try {
          const data = JSON.parse((await readBody()) || "{}");
          if (!streamerConfirmed) {
            res.writeHead(403);
            return res.end("streamer confirmation required");
          }
          const asset = creatorAssets.review(
            data.id,
            { owner: true, name: "streamer" },
            data,
          );
          res.writeHead(200, { "Content-Type": "application/json" });
          return res.end(JSON.stringify(asset));
        } catch (error) {
          res.writeHead(400);
          return res.end(error.message);
        }
      }
      if (url.pathname === "/admin/viewer-profile" && req.method === "GET") {
        if (!streamerConfirmed) {
          res.writeHead(403);
          return res.end("streamer confirmation required");
        }
        try {
          if (!tickRounds()) {
            res.writeHead(503, { "Content-Type": "application/json" });
            return res.end(
              JSON.stringify({ code: "round_store_unavailable" }),
            );
          }
          const result = ideaRounds.participation(url.searchParams.get("sub"));
          res.writeHead(200, {
            "Content-Type": "application/json",
            "Cache-Control": "no-store",
          });
          return res.end(JSON.stringify(result));
        } catch (error) {
          res.writeHead(400, { "Content-Type": "application/json" });
          return res.end(JSON.stringify({ error: error.message }));
        }
      }
      if (url.pathname === "/admin/round-credits" && req.method === "GET") {
        if (!streamerConfirmed) {
          res.writeHead(403);
          return res.end("streamer confirmation required");
        }
        try {
          if (!tickRounds()) {
            res.writeHead(503, { "Content-Type": "application/json" });
            return res.end(
              JSON.stringify({ code: "round_store_unavailable" }),
            );
          }
          res.writeHead(200, {
            "Content-Type": "application/json",
            "Cache-Control": "no-store",
          });
          return res.end(
            JSON.stringify({
              communityCreditEnabled:
                CONFIG.features?.communityCredit === true,
              rounds: ideaRounds.creditHistory(),
            }),
          );
        } catch (error) {
          res.writeHead(400, { "Content-Type": "application/json" });
          return res.end(JSON.stringify({ error: error.message }));
        }
      }
      if (url.pathname === "/admin/round" && req.method === "POST") {
        try {
          const data = JSON.parse((await readBody()) || "{}");
          if (!streamerConfirmed) {
            res.writeHead(403);
            return res.end("streamer confirmation required");
          }
          const actor = {
            name: TWITCH_CHANNEL || "local streamer",
            source: "streamer-ui",
            owner: true,
          };
          if (data.action === "open") {
            requireNoPendingArtifact();
            ideaRounds.open(actor, data.settings || {});
          } else if (data.action === "vote") ideaRounds.startVoting(actor);
          else if (data.action === "close") ideaRounds.finishVoting(actor);
          else if (data.action === "select")
            ideaRounds.select(actor, data.ids, data.reason);
          else if (data.action === "resources")
            ideaRounds.chooseResources(
              actor,
              creatorAssets.manifest(data.assetIds),
            );
          else if (data.action === "approve")
            ideaRounds.approve(actor, {
              roundId: data.roundId,
              reviewToken: data.reviewToken,
            });
          else if (data.action === "cancel") ideaRounds.cancel(actor);
          else throw new Error("Unknown round action.");
          res.writeHead(200, { "Content-Type": "application/json" });
          return res.end(JSON.stringify(ideaRounds.public()));
        } catch (error) {
          res.writeHead(400);
          return res.end(error.message);
        }
      }
      if (url.pathname === "/admin/ideas") {
        res.writeHead(200, { "content-type": "application/json" });
        return res.end(JSON.stringify(readIdeas()));
      }
      if (url.pathname === "/admin/treasury") {
        res.writeHead(200, { "content-type": "application/json" });
        return res.end(JSON.stringify(treasury.stats()));
      }
      if (url.pathname === "/admin/fund" && req.method === "POST") {
        const { amountUsd, source } = JSON.parse((await readBody()) || "{}");
        if (!(amountUsd > 0)) {
          res.writeHead(400);
          return res.end("amountUsd required");
        }
        treasury.deposit(amountUsd, { source: source || "manual" });
        res.writeHead(200);
        return res.end("ok");
      }
      if (url.pathname === "/admin/generate" && req.method === "POST") {
        try {
          const { idea, roundId, approvedInputHash } = JSON.parse(
            (await readBody()) || "{}",
          );
          if (typeof idea !== "string" || !idea) {
            res.writeHead(400);
            return res.end("idea required");
          }
          const result = await generateFromIdea(idea, {
            roundId,
            approvedInputHash,
          });
          res.writeHead(200, { "Content-Type": "application/json" });
          return res.end(JSON.stringify(result));
        } catch {
          res.writeHead(503, { "Content-Type": "application/json" });
          return res.end(
            JSON.stringify({
              ok: false,
              code: "build_state_unavailable",
              reason:
                "Build state needs reconciliation; inspect the operator view.",
            }),
          );
        }
      }
      if (url.pathname === "/admin/status") {
        res.writeHead(200, { "content-type": "application/json" });
        return res.end(
          JSON.stringify({
            game: host.game
              ? {
                  name: host.game.name,
                  dir: host.gameDir,
                  meta: host.game.meta,
                }
              : null,
            players: [...clients.values()]
              .filter((c) => c.kind === "player")
              .map((c) => c.name),
            error: host.error,
            fallback: getFallback(),
            chatEffectsPaused: chatEffects.blocked,
            generating: isGenerating(),
            fund: {
              balance: treasury.balance,
              goal: CONFIG.generator.gameCostUsd,
            },
            publicLink: publicLink?.status() || null,
            seats: seating?.roster() || [],
          }),
        );
      }
      if (url.pathname === "/admin/seats/revoke" && req.method === "POST") {
        const { sub } = JSON.parse((await readBody()) || "{}");
        if (typeof sub !== "string" || !/^(twitch|kick|web):[\w-]{1,40}$/.test(sub)) {
          res.writeHead(400);
          return res.end("sub like twitch:123 required");
        }
        res.writeHead(200, { "content-type": "application/json" });
        return res.end(JSON.stringify({ unseated: seating?.revoke(sub) || 0 }));
      }
      if (url.pathname === "/admin/chat" && req.method === "POST") {
        const { user, text } = JSON.parse((await readBody()) || "{}");
        if (!user || !text) {
          res.writeHead(400);
          return res.end("user+text required");
        }
        handleChat({
          user: String(user).slice(0, 20),
          text: String(text).slice(0, 200),
          source: "admin",
        });
        res.writeHead(200);
        return res.end("ok");
      }
      if (url.pathname === "/admin/load" && req.method === "POST") {
        const { game } = JSON.parse((await readBody()) || "{}");
        const dir = path.resolve(ROOT, "games", String(game || ""));
        const gamesRoot = path.join(ROOT, "games"),
          relative = path.relative(gamesRoot, dir);
        const outside = (value) =>
          value === ".." ||
          value.startsWith(".." + path.sep) ||
          path.isAbsolute(value);
        if (
          !game ||
          outside(relative) ||
          !fs.existsSync(path.join(dir, "game.js")) ||
          outside(
            path.relative(fs.realpathSync(gamesRoot), fs.realpathSync(dir)),
          )
        ) {
          res.writeHead(400);
          return res.end("unknown game");
        }
        if (!(await loadGameDir(dir))) {
          res.writeHead(503);
          return res.end("Game failed to load; inspect fallback status.");
        }
        feed("system", `Game loaded: ${game}`);
        res.writeHead(200);
        return res.end("ok");
      }
      res.writeHead(404);
      return res.end();
    }
  };
}
