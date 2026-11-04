import path from "node:path";
import { TwitchAuth } from "../auth/twitch.js";

export async function connectPlatformChat({
  ROOT,
  arg,
  TWITCH_CHANNEL,
  CONFIG,
  handleChat,
  replies,
  KICK_CHANNEL,
}) {
  let twitch;
  if (TWITCH_CHANNEL) {
    const { connectTwitch } = await import("../chat/twitch.js");
    const auth = new TwitchAuth({
      file: arg("env-file", path.join(ROOT, ".env")),
    });
    const info = await auth.validate({ force: true });
    if (info.login.toLowerCase() !== TWITCH_CHANNEL.toLowerCase())
      throw new Error("Use your own authorized Twitch channel.");
    twitch = connectTwitch(TWITCH_CHANNEL, handleChat, { auth });
    replies.twitch = twitch.send;
  }

  // Optional Kick replies: needs a user token with chat:write.
  if (process.env.VA_KICK_TOKEN && CONFIG.kick?.broadcasterUserId) {
    replies.kick = (text) =>
      import("../chat/kick.js")
        .then((m) =>
          m.sendKickChat({
            accessToken: process.env.VA_KICK_TOKEN,
            broadcasterUserId: CONFIG.kick.broadcasterUserId,
            content: text,
          }),
        )
        .then(() => true)
        .catch((e) => {
          console.error(`[kick] send: ${e.message}`);
          return false;
        });
  }

  // Kick chat only arrives through the official webhook (/webhook/kick); the
  // anonymous socket is gone. See src/chat/kick.js and scripts/kick-subscribe.mjs.
  if (KICK_CHANNEL) {
    console.log(
      `[kick] channel: ${KICK_CHANNEL} — subscribe its webhook with:`,
    );
    console.log(
      `[kick]   node scripts/kick-subscribe.mjs --token <APP_TOKEN> --user <broadcaster_user_id>`,
    );
  }

  return twitch;
}
