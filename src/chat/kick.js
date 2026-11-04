// Kick chat: the state of Kick's API, checked on 2026-11-01.
//
// Reading chat (official): the Kick Events API webhook.
//   - Create an app at kick.com, under Developer. Enable webhooks with
//     https://<public URL>/webhook/kick.
//   - Subscribe the channel to chat.message.sent:
//     node scripts/kick-subscribe.mjs --token <token> --user <broadcaster_user_id>
//   - src/chat/kick-webhook.js verifies Kick's RSA signature (key from GET
//     /public/v1/public-key) before any event is accepted.
//
// Reading chat (unofficial, dead): Kick left cloud Pusher.
//   - The public key 32cbd69e4b950bf97679 (ws-us2) now answers 4001 "not in
//     this cluster" on every cluster.
//   - The current gateway, wss://websockets.kick.com/viewer/v1/connect, needs a
//     single-use session token obtained with browser cookies plus
//     X-CLIENT-TOKEN, and Cloudflare blocks it outside a browser.
//   - Using it from a server would need browser automation, which breaks
//     Kick's terms and is fragile.
//
// Sending (bot replies): POST https://api.kick.com/public/v1/chat with a user
//   token that has the chat:write scope (OAuth PKCE of the broadcaster or a bot
//   account).

export async function sendKickChat({
  accessToken,
  broadcasterUserId,
  content,
  type = "user",
}) {
  const res = await fetch("https://api.kick.com/public/v1/chat", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(
      type === "bot"
        ? { type: "bot", content }
        : { type: "user", broadcaster_user_id: broadcasterUserId, content },
    ),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok)
    throw new Error(
      `kick chat send ${res.status}: ${await res.text().then((t) => t.slice(0, 200))}`,
    );
  return res.json().catch(() => ({}));
}
