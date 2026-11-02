import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { decodeTwitchEvent, rewardCommand } from "../../twitch-events.js";

export function createWebhookRoutes({
  ROOT,
  CONFIG,
  simulateEventCredits,
  handleChat,
  treasury,
  feed,
  chatEffects,
  host,
}) {
  // kick webhook signature verification (official Events API)
  let kickPubkey = null;
  async function getKickPubkey() {
    if (kickPubkey) return kickPubkey;
    if (process.env.VA_KICK_PUBKEY)
      return (kickPubkey = process.env.VA_KICK_PUBKEY.replace(/\\n/g, "\n"));
    const res = await fetch("https://api.kick.com/public/v1/public-key", {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`kick public-key ${res.status}`);
    const data = await res.json();
    kickPubkey = data.public_key || data.data?.public_key;
    return kickPubkey;
  }
  function verifyKickSignature(req, rawBody) {
    const msgId = req.headers["kick-event-message-id"];
    const ts = req.headers["kick-event-timestamp"];
    const sig = req.headers["kick-event-signature"];
    if (!msgId || !ts || !sig) return false;
    if (!kickPubkey) return "pending"; // still fetching
    try {
      return crypto
        .createVerify("RSA-SHA256")
        .update(`${msgId}.${ts}.${rawBody}`)
        .verify(kickPubkey, sig, "base64");
    } catch {
      return false;
    }
  }

  const deliveryFile = path.join(ROOT, "runtime", "twitch-deliveries.jsonl");
  fs.mkdirSync(path.dirname(deliveryFile), { recursive: true });
  const twitchDeliveries = new Set();
  if (fs.existsSync(deliveryFile))
    for (const line of fs.readFileSync(deliveryFile, "utf8").split("\n")) {
      try {
        const row = JSON.parse(line);
        if (Date.now() - row.at < 600000) twitchDeliveries.add(row.id);
      } catch {}
    }

  return function webhookRoutes(req, res, url) {
    // kick official webhook: POST with Kick-Event-* headers; chat.message.sent -> chat pipeline
    if (url.pathname === "/webhook/kick" && req.method === "POST") {
      let b = "";
      req.on("data", (c) => (b += c));
      req.on("end", async () => {
        try {
          if (!kickPubkey) await getKickPubkey();
        } catch {}
        const check = verifyKickSignature(req, b);
        if (check !== true) {
          res.writeHead(check === "pending" ? 503 : 403);
          return res.end("bad signature");
        }
        let body = {};
        try {
          body = JSON.parse(b);
        } catch {}
        const evType = req.headers["kick-event-type"];
        const M = CONFIG.monetization;
        if (evType === "chat.message.sent") {
          const user = body.sender?.username || "anon";
          const text = String(body.content || "").slice(0, 200);
          if (text) handleChat({ user, text, source: "kick" });
        } else if (
          simulateEventCredits &&
          evType === "channel.subscription.new"
        ) {
          treasury.deposit(M.kickSubUsd, {
            source: "kick-sub",
            user: body.subscriber?.username,
          });
          feed(
            "system",
            `Subscription from ${body.subscriber?.username || "?"} → +$${M.kickSubUsd}`,
          );
        } else if (
          simulateEventCredits &&
          evType === "channel.subscription.gifts"
        ) {
          const n = body.giftees?.length || body.amount || 1;
          treasury.deposit(n * M.kickSubUsd, {
            source: "kick-sub-gift",
            user: body.gifter?.username,
            count: n,
          });
          feed(
            "system",
            `${body.gifter?.username || "?"} gifted ${n} subs → +$${(n * M.kickSubUsd).toFixed(2)}`,
          );
        } else if (simulateEventCredits && evType === "kicks.gifted") {
          const amt =
            (body.kicks?.amount || body.amount || 0) * M.kickUsdPerKick;
          if (amt > 0) {
            treasury.deposit(amt, {
              source: "kicks",
              user: body.sender?.username,
              kicks: body.kicks?.amount,
            });
            feed(
              "system",
              `${body.sender?.username || "?"} sent kicks → +$${amt.toFixed(2)}`,
            );
          }
        }
        res.writeHead(200);
        res.end("ok");
      });
      return true;
    }

    // twitch EventSub webhook: subs/bits -> treasury. Shared secret: CONFIG.monetization.eventsubSecret
    if (url.pathname === "/webhook/twitch" && req.method === "POST") {
      let b = "";
      req.on("data", (c) => (b += c));
      req.on("end", () => {
        const decoded = decodeTwitchEvent(
          req.headers,
          b,
          CONFIG.monetization.eventsubSecret,
        );
        if (decoded.status !== 200) {
          res.writeHead(decoded.status);
          return res.end("invalid event");
        }
        const { id: msgId, type, body } = decoded;
        if (type === "webhook_callback_verification") {
          res.writeHead(200, { "content-type": "text/plain" });
          return res.end(body.challenge);
        }
        if (type === "notification") {
          if (twitchDeliveries.has(msgId)) {
            res.writeHead(204);
            return res.end();
          }
          const ev = body.event || {};
          const M = CONFIG.monetization;
          if (
            simulateEventCredits &&
            body.subscription?.type === "channel.subscribe"
          ) {
            const mult = { 1000: 1, 2000: 2, 3000: 5 }[ev.tier] || 1;
            treasury.deposit(M.twitchSubUsd * mult, {
              source: "twitch-sub",
              user: ev.user_name,
              tier: ev.tier,
            });
            feed(
              "system",
              `sub T${ev.tier?.[0]} from ${ev.user_name} → +$${(M.twitchSubUsd * mult).toFixed(2)}`,
            );
          } else if (
            simulateEventCredits &&
            body.subscription?.type === "channel.subscription.gift"
          ) {
            const n = ev.total || 1;
            treasury.deposit(M.twitchSubUsd * n, {
              source: "twitch-sub-gift",
              user: ev.user_name,
              count: n,
            });
            feed(
              "system",
              `${ev.user_name} gifted ${n} subs → +$${(M.twitchSubUsd * n).toFixed(2)}`,
            );
          } else if (
            simulateEventCredits &&
            (body.subscription?.type === "channel.bits.use" ||
              body.subscription?.type === "channel.cheer")
          ) {
            const bits = ev.bits || ev.cheer?.bits || 0;
            const usd = bits * M.bitUsd;
            if (usd > 0) {
              treasury.deposit(usd, {
                source: "twitch-bits",
                user: ev.user_name,
                bits,
              });
              feed(
                "system",
                `${bits} bits from ${ev.user_name} → +$${usd.toFixed(2)}`,
              );
            }
          } else if (
            body.subscription?.type ===
            "channel.channel_points_custom_reward_redemption.add"
          ) {
            const command = rewardCommand(ev, CONFIG.twitch?.rewardCommands);
            if (command) {
              const [cmd, ...args] = command.slice(1).split(/\s+/);
              const handled =
                !chatEffects.blocked &&
                host.safeCall(
                  "onChat",
                  {
                    name: ev.user_name || ev.user_login || "viewer",
                    source: "twitch-reward",
                  },
                  cmd,
                  args,
                );
              feed(
                "system",
                `${ev.user_name || "viewer"} redeemed ${ev.reward.title} → ${command}${handled ? "" : " (not handled by this game)"}`,
              );
            } else
              feed(
                "system",
                `Unmapped reward: ${ev.reward?.title || "unknown"}`,
              );
          }
        }
        if (type === "notification") {
          twitchDeliveries.add(msgId);
          fs.appendFileSync(
            deliveryFile,
            JSON.stringify({ id: msgId, at: Date.now() }) + "\n",
          );
        }
        res.writeHead(204);
        res.end();
      });
      return true;
    }

    // donation webhook: Streamlabs / Ko-fi / generic POST {amountUsd|amount, source, user} + ?secret=
    if (url.pathname === "/webhook/donation" && req.method === "POST") {
      if (!simulateEventCredits) {
        res.writeHead(410);
        return res.end(
          "Payments are not supported. This instance uses demo build credits.",
        );
      }
      let b = "";
      req.on("data", (c) => (b += c));
      req.on("end", () => {
        let body = {};
        try {
          body = JSON.parse(b);
        } catch {}
        if (
          url.searchParams.get("secret") !== CONFIG.monetization.webhookSecret
        ) {
          res.writeHead(403);
          return res.end("bad secret");
        }
        const amt = Number(body.amountUsd ?? body.amount);
        if (!(amt > 0)) {
          res.writeHead(400);
          return res.end("amount required");
        }
        treasury.deposit(amt, {
          source: body.source || "donation",
          user: body.user,
          raw: undefined,
        });
        feed(
          "system",
          `Demo deposit${body.user ? ` from ${body.user}` : ""}: $${amt.toFixed(2)}`,
        );
        res.writeHead(200);
        res.end("ok");
      });
      return true;
    }

    return false;
  };
}
