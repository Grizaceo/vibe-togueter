// Verified Kick events -> chat/treasury. One handler instance is shared by
// the direct /webhook/kick route and the funnel's verified-event forward, so
// redeliveries dedupe on a single ledger no matter which path they took.
import { KickDeliveries, kickChatMessage } from "../chat/kick-webhook.js";

export function createKickEventHandler({
  CONFIG,
  simulateEventCredits,
  handleChat,
  treasury,
  feed,
  deliveries = new KickDeliveries(),
}) {
  return ({ id, type, body }) => {
    if (id && !deliveries.first(String(id))) return "duplicate";
    body = body && typeof body === "object" ? body : {};
    const M = CONFIG.monetization;
    if (type === "chat.message.sent") {
      const message = kickChatMessage(body, {
        broadcasterUserId: CONFIG.kick?.broadcasterUserId,
      });
      if (message) handleChat(message);
    } else if (simulateEventCredits && type === "channel.subscription.new") {
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
      type === "channel.subscription.gifts"
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
    } else if (simulateEventCredits && type === "kicks.gifted") {
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
    return "ok";
  };
}
