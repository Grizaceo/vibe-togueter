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

  // optional kick send (needs user token OAuth chat:write)
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

  // kick chat: la lectura anónima murió (Kick dejó Pusher cloud). Vía oficial:
  // webhook /webhook/kick — ver src/chat/kick.js y scripts/kick-subscribe.mjs.
  if (KICK_CHANNEL) {
    console.log(
      `[kick] canal objetivo: ${KICK_CHANNEL} — suscribe el webhook con:`,
    );
    console.log(
      `[kick]   node scripts/kick-subscribe.mjs --token <APP_TOKEN> --user <broadcaster_user_id>`,
    );
  }

  return twitch;
}
