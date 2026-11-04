# Phase 2 design: cross-platform identity, seats and personal links

Status: **accepted on 2026-11-03.** Written for roadmap phase 2. It replaces the phase 0 patch, where `!join` posts one verified link with no name and the entry page asks for a name.

**Owner decision (2026-11-03):**
- Option D, a pairing code typed in chat.
- The link is still shared in chat.
- The pairing is bound to the browser tab with a non-extractable key ([5.1](#51-binding-the-pairing-to-one-browser)).
- No browser fingerprinting. The client IP is used only for limits.

Signatures use Ed25519, the default below, because no other choice was made.

**Implementation status (2026-11-03, branch `next`).**
- **Done:** steps 1–5 of [section 7](#7-implementation-plan-once-you-choose):
  - `src/chat/kick-webhook.js` and `src/identity.js`;
  - `src/seats.js`, `src/server/pairing.js` and `src/server/seating.js`;
  - `public/seat.js` and the lobby;
  - the tests `test/kick-webhook.mjs`, `test/identity.mjs`, `test/seats.mjs` and `test/seating.mjs`;
  - a local Chromium rehearsal, `scripts/rehearse-seats.mjs`.
- **Pending:**
  - the real session with one Twitch viewer and one Kick viewer ([section 6](#6-kick-what-the-real-test-needs-from-you));
  - pairing on `tee-play.html`: Tee individual play still asks for a name, because Tee seats belong to the phase 3 control channel.

## 1. Goals and constraints

- **Goal.** A Twitch viewer and a Kick viewer enter the same room under their own platform names, with correct roles.
- **No privilege from a display name.** Authority comes only from:
  - the authenticated Twitch IRC connection;
  - signed Kick webhooks;
  - local secrets (`VA_STREAMER_KEY`, `VA_ADMIN_TOKEN`).
- **Old clients keep working.**
  - A socket that sends no seat token behaves exactly as today.
  - Frame negotiation (`full`/`d1`/`b1`/`none`) is untouched.
- **Current limits keep their values:**
  - backpressure: 128 KiB skip, 1 MiB disconnect;
  - input: 16 KiB frames, 120 messages/s per socket;
  - `ChatGate`: 30 messages/s overall, 250 ms per actor;
  - the HTTP body cap of 256 KiB.
- **Out of scope here:**
  - the phase 3 control channel;
  - VM3 verifying tokens on its own (phase 4). The token format is chosen so VM3 can verify it later without being able to mint tokens.

## 2. What exists today (and what is weak)

| Piece | Today | Weakness |
|---|---|---|
| Chat actor | `{id: participantId \|\| user, name, source, owner}` in `src/server/chat-commands.js` | For Twitch, `id` is the login, which changes on rename. Twitch `user-id` is never read. |
| Owner check | Login equals `TWITCH_CHANNEL` (`chat-effects.js`, `chat-commands.js`) | Name-based, but the login comes from the authenticated IRC connection, so it cannot be forged. It breaks if the channel renames. |
| Moderator | IRC tag `mod=1` | Correct. Kick moderators are never recognised. |
| Delegated approval | Compares `actor.name` with a typed login (`approval-delegation.js`) | Name-based. |
| Browser player | `?name=` on the WebSocket URL, role `viewer`; streamer via `claim-streamer` with `VA_STREAMER_KEY` | Anyone can type any name. It grants no privilege, but it does impersonate. |
| Kick chat | Signed webhook, then `handleChat({user: sender.username, source: "kick"})` | **Bug:** the code reads header `kick-event-timestamp`, but Kick sends `Kick-Event-Message-Timestamp` ([webhook security](https://docs.kick.com/events/webhook-security)). Every real Kick event would fail verification with 403. The fixtures in `test/platforms.mjs` use the same wrong name, which is why tests pass. There is also no `user_id`, no dedupe by `Kick-Event-Message-Id`, and no moderator or broadcaster role. |

## 3. Identity model

A **principal** is what the controller trusts about a person:

```
{ id: "twitch:12345678", platform: "twitch", platformId: "12345678",
  login: "alice", displayName: "Alice", roles: ["viewer"|"moderator"|"broadcaster"], verified: true }
```

| Identity | Stable id from | Roles from | Display name |
|---|---|---|---|
| `twitch:<user-id>` | IRC tag `user-id` on the authenticated IRC socket (`CAP twitch.tv/tags` is already requested) | `broadcaster` when `user-id` equals `room-id` (badge `broadcaster/1` as a cross-check). `moderator` when `mod=1` or badge `moderator/1`. Otherwise `viewer`. | `display-name` tag, falling back to the login |
| `kick:<user_id>` | `sender.user_id` in a signed `chat.message.sent` webhook | `broadcaster` when `sender.user_id` equals the event's `broadcaster.user_id` **and** the configured `kick.broadcasterUserId`. `moderator` when a badge has `type: "moderator"`. Otherwise `viewer`. | `sender.username` |
| `web:<random>` | 128-bit random id that the controller issues to an unpaired browser | Always `viewer`, never anything else | Typed by the person and shown as unverified (for example `Bob · web`) |

Rules:

1. **Roles are read per message from the platform, never stored from a name.** The chat paths switch from login comparisons to id comparisons:
   - owner checks in `chat-effects` and `!fallback`;
   - `approvalDelegation.canApprove`;
   - `ChatGate` keys;
   - idea-round voter identity.

   If a tag is missing, as in old fixtures, the code keeps today's login comparison. That is not a regression, because the login also comes from IRC.
2. **A platform role is not a seat privilege.**
   - The seat's role inside the game stays `viewer` or `streamer`.
   - The streamer seat still requires `VA_STREAMER_KEY`. Pairing (section 5) never grants it, because pairing can be phished.
   - Moderator powers are still used through chat commands, where every message carries its own authenticated tags. In the game, the platform role is only a badge.
3. **Names are display only.**
   - Names are normalised: NFKC; control and bidi characters stripped; 1–25 characters.
   - Each name is shown with its platform, so `twitch:alice`, `kick:alice` and `alice · web` are three different people.
   - Games keep receiving the numeric client `id` they use today, plus the new fields `platform` and `verified`. `onJoin(state, {id, name, role, platform, verified})` only adds fields.

## 4. Seat tokens

A seat token says: *this identity may hold this seat type in this room until this time.*

```
v1.<base64url(payload)>.<base64url(signature)>
payload = { "v":1, "jti":"<128-bit random>", "sub":"kick:987", "name":"sender_name",
            "plat":"kick", "roles":["viewer"], "room":"<room id>", "seat":"player",
            "iat":1793740000000, "exp":1793740600000 }      (milliseconds)
```

- **Signature: Ed25519** (`node:crypto`, no dependency).
  - The private key is `VA_SEAT_KEY` in `.env` (PKCS#8, base64url). `npm run setup:local` generates it.
  - Like the other keys, an existing value is never overwritten. A new `--rotate-seat-key` flag replaces it explicitly.
  - I chose Ed25519 over HMAC so that in phase 4 VM3 can hold only the public key: it can verify seats but cannot mint them. If you prefer HMAC-SHA256 for simplicity, nothing else in this design changes.
- **Binding:**
  - `sub` is identity, `room` is room, `seat` is seat type (`player` | `spectator` | `streamer`), `exp` is expiry.
  - `room` is a random id generated when the controller starts, so a restart invalidates every outstanding token.
  - `aud`/`kid` are left out until VM3 exists.
  - `iat` and `exp` are in milliseconds, so a revocation and a new token in the same second do not collide.
- **Lifetimes:**
  - a **seat token** handed to a browser lives 10 minutes and is single-use;
  - when a socket redeems it, the server immediately issues a fresh **resume token** (also 10 min, single-use, rotated on every reconnect) so a dropped connection can come back without pairing again.
- **Single use.** The server keeps a map `jti → exp` until expiry, capped at 20 000 entries (tokens are short-lived, so it stays small). A second use of the same `jti` is rejected and **revokes the whole identity's seat**: reuse means a token leaked.
- **Revocation:**
  - **per identity:** `revokedBefore[sub] = now` rejects every token issued earlier. It is triggered by:
    - pairing again from the same platform account;
    - token reuse;
    - `POST /admin/seats/revoke {sub}`;
    - an optional streamer/moderator chat command `!unseat <platform:login>`.
  - **global:** rotating the key, or restarting the controller (new `room`).
- **One seat per identity per room.** A new valid connection for an identity replaces the old one. The old socket receives `{t:"seat", revoked:"replaced"}` and is closed.
- **Transport:**
  - Tokens never go in a query string, which proxies, the Cloudflare edge and browser history may log.
  - The browser keeps the token in `sessionStorage` (per tab, not `localStorage`).
  - A client that supports seats connects with `?seat=1` next to `?frames=…`, and its first message is `{t:"hello", seat:"<token>"}`. The server waits up to 5 s for it before calling `onJoin`. Sockets without `?seat=1` are legacy: they get today's immediate join as `web:` with `?name=`.
  - A config switch `seats.requireToken` (default `false`) can later refuse legacy players. Spectators are never asked for a token.
- **Limits:**
  - `hello` is capped at 1 KiB and counts against the existing 120 messages/s.
  - Verification failures are rate-limited per remote address (10 per minute).
  - Ed25519 verification costs microseconds, so the cap prevents log noise rather than CPU exhaustion.
- **Welcome message.** It gains `identity: {id, platform, name, verified, roles}` and `seat`. Old clients ignore unknown fields. Frames and their formats do not change.

## 5. Delivering the personal link (choose one)

The hard part is getting the right person a seat token without anyone else using it. Three options from the brief, plus a fourth that I recommend.

### A. Whisper / direct message from the bot

- **Twitch** has *Send Whisper* (`user:manage:whispers`). Its limits:
  - the sending account needs a verified phone number;
  - **40 unique recipients per day**, plus 3 per second and 100 per minute;
  - recipients who block whispers from strangers get a 400 error;
  - Twitch may drop a whisper and still answer 204.

  Sources: [Twitch whispers guide](https://dev.twitch.tv/docs/chat/whispers/), [Streamer.bot summary of the limits](https://docs.streamer.bot/api/csharp/methods/twitch/chat/send-whisper).
- **Kick** has **no** whisper or DM API. The public scopes cover channel chat (`chat:write`) and nothing private ([Kick scopes](https://docs.kick.com/getting-started/scopes)).
- **Verdict:** this cannot meet the goal. It does not work on Kick, it stops after 40 viewers a day on Twitch, and drops are silent.

### B. Sign in with Twitch / Kick on the entry page (OAuth)

- **Strongest identity.** The platform itself proves who the person is, and the link posted in chat stays generic, so there is nothing to snipe.
- **Twitch:**
  - Twitch can use the **Device Code Grant flow**: a public client, no secret and no redirect URI. The page shows a code, the viewer approves it at twitch.tv/activate, and the controller reads `GET /helix/users` and then discards the token. This works with changing quick-tunnel hostnames ([Twitch OAuth flows](https://dev.twitch.tv/docs/authentication/getting-tokens-oauth/#device-code-grant-flow)).
- **Kick:**
  - Kick supports only the authorization code flow with PKCE. Its redirect URI must **match exactly** the one registered in the app settings ([Kick OAuth](https://docs.kick.com/getting-started/generating-tokens-oauth2-flow)).
  - A quick tunnel gets a new hostname on every cloudflared start, so Kick sign-in needs either a stable hostname (a named Cloudflare tunnel on a domain you own) or a manual edit of the app settings every run.
- **Roles:** sign-in proves identity, not moderator status. Moderator status would need extra API calls and broadcaster scopes on each platform. Seats from sign-in would be `viewer`, which is enough, because moderator powers stay in chat.
- **Cost:**
  - Twitch: a second tab and a code to type.
  - Kick: a stable hostname and the app's client secret on the controller.
  - The privacy text has to mention which profile data we read (id, login, display name).

### C. Public single-use token in chat

- `!join` posts `@alice your seat: https://…/#t=<token>` in chat.
- **Simple:** it works on both platforms with the APIs we already have.
- **Sniping is trivial:** a bot that reads chat clicks first and plays as Alice. Single use, a 60–120 s TTL and "re-`!join` revokes the old seat" limit the damage but do not stop it.
- It must never carry a moderator or broadcaster role, or sniping becomes privilege theft.
- **Chat flood:** every join is a bot message, inside Twitch's bot rate limits (20 messages per 30 s unless the bot is a moderator) and Kick's.
- **Verdict:** not acceptable as the default.

### D. (Recommended) Pairing code typed in chat

The secret travels the other way: from the browser into chat.

1. `!join` keeps posting the generic verified link from phase 0.
2. The entry page asks the controller for a pairing and shows a short code, for example `!join K7F3QX`, plus a "play as web guest" button.
   - The code has 6 characters from a 32-symbol alphabet (30 bits), lives 5 minutes and is bound to that browser tab's pending request.
3. The viewer types `!join K7F3QX` in Twitch or Kick chat.
4. The message arrives through the authenticated path: IRC tags for Twitch, a signed webhook for Kick. The controller binds the waiting tab to that principal and hands the tab a seat token (section 4). The code is consumed by the first chat message that carries it.
5. The page shows "Playing as **Alice** (twitch)" with a "Not me" button, which revokes the seat and asks for a new code.

Why D:

- **Works the same on Twitch and Kick** with only the inbound chat paths we already need: no whispers, redirect URIs or extra OAuth app, and no hostname that must stay stable for sign-in.
- **Nothing to snipe.** The code becomes public only when the viewer posts it, and that same message consumes it.
  - If someone pastes Alice's code from their own account first, Alice's tab binds to *them*. That is an annoyance with no privilege gain, and "Not me" resets it.
  - Guessing is negligible: 500 pending codes out of 2³⁰, against a chat that `ChatGate` limits per account.
- **Correct roles for free.** The binding message carries the platform's own badges.
- **Chat cost is one message per joiner, written by the viewer.** The bot does not have to reply. A one-line "Alice joined" in chat stays optional.

Risks and limits of D:

- **Code phishing**, the same class of attack as device-code phishing: an attacker tricks Alice into typing *the attacker's* code, and then the attacker's tab plays as Alice.
  - Mitigations: the page says "type this only if this page is yours", codes expire in 5 minutes, and pairing never grants the streamer seat or any privilege beyond a player seat.
  - Option B has the same risk.
- **Restricted chat.** Followers-only, subscriber-only or emote-only chat, slow mode and AutoMod can block the pairing message. The page then offers the web-guest seat.
- **Stream visibility.** A viewer whose own screen is on stream exposes their code. The fix is the same "Not me" button.

Option B can be added later for Twitch only (device flow) without changing tokens or seats. If you choose D now, I would not build B in phase 2.

### 5.1 Binding the pairing to one browser

The flow from the viewer's side:

1. `!join` posts the generic link, which is the same for everyone and carries no secret.
2. The viewer clicks it.
3. The page shows a code for that tab.
4. The viewer pastes `!join <code>` in chat.
5. That tab joins as the chat account.

Only the tab that asked for the code can use the seat, by **proof of possession**:

- **The tab's key.** The page creates an ECDSA P-256 key pair with WebCrypto, `extractable: false`.
  - The private key can sign but its bytes cannot be read, not even by the page's own script.
  - It is kept in IndexedDB under a per-tab id held in `sessionStorage`, so a reload keeps it and a new tab gets a new one.
- **The pairing request.**
  - The pairing request carries the public key (JWK).
  - The pending pairing stores its RFC 7638 thumbprint.
  - The seat token gets `cnf: {jkt: <thumbprint>}`.
- **Every connection proves the key.** On each WebSocket connection with `?seat=1`, the server first sends a random challenge. The client's `hello` must include a signature over `challenge | room | token jti`, made with that key.
  - A leaked token (logs, screen, clip) is useless without the key, which never leaves the browser.
  - This is the same idea as OAuth DPoP.
- **Fallback.**
  - WebCrypto needs a secure context: the HTTPS tunnel and `localhost` qualify, but plain `http://` on a LAN does not.
  - There the seat falls back to a single-use token without the key and is marked `bound: false` in the roster.
  - `seats.requireBoundKey` (default `false`) can forbid that fallback.

Rejected alternatives:

- **Browser fingerprints** (canvas, fonts, user agent):
  - the browser computes them, so an attacker can copy and replay the values;
  - Safari, Firefox and Brave randomise them on purpose;
  - in the EU they need consent.
- **Binding to the IP address:**
  - behind the tunnel the controller sees `127.0.0.1`, and the real address only arrives in `CF-Connecting-IP`;
  - CGNAT, homes and campuses share one address among many viewers;
  - phones change address between Wi-Fi and mobile data, which would drop legitimate players.

How the IP is used instead:
- **Trusted only through the local tunnel.** `CF-Connecting-IP` is read only when the TCP peer is loopback.
- **Limits.** It caps pending pairings: 5 per address and 500 in total.
- **Admin roster.** It is shown in the admin roster.
- **Memory only.** It is never written to disk.
- **Disclosed.** The privacy page states it.

## 6. Kick: what the real test needs from you

Nothing below is invented. These are the inputs I cannot create:

1. **Accounts:**
   - the Kick channel account (broadcaster);
   - a **second Kick account** to chat as a viewer;
   - for Twitch, a second Twitch account as the viewer. The broadcaster's IRC already runs on `VA_TWITCH_*`.
2. **A Kick developer app** (kick.com → Settings → Developer):
   - client id and secret, with webhooks enabled;
   - the webhook URL set to `<public URL>/webhook/kick`.
3. **`broadcaster_user_id`** of the channel, which goes in `vibe-arena.config.json` as `kick.broadcasterUserId`.
4. **A token to subscribe to `chat.message.sent`** with `scripts/kick-subscribe.mjs`. This is either the app token from client credentials or a broadcaster user token with `events:subscribe`. Which one Kick accepts for webhook subscriptions gets confirmed on the first real run.
5. **Optional:** a user token with `chat:write` if the bot should answer in Kick chat. Option D does not need it.
6. **A public URL that does not change during the test.**
   - The Kick webhook URL lives in the app settings, and a quick tunnel gets a new hostname whenever cloudflared restarts.
   - Run cloudflared on its own (`cloudflared tunnel --url http://127.0.0.1:8420`) and start the controller with `VA_TUNNEL=detect`. Controller restarts then keep the hostname. A named tunnel is the permanent fix.
   - **You run this** (public ingress).

Kick also unsubscribes an app whose webhook keeps failing for more than a day, so the subscription is checked again before each real session.

## 7. Implementation plan once you choose

Each step is its own commit, with tests, and `npm test` runs before every commit.

1. **Kick webhook fixes:**
   - read `Kick-Event-Message-Timestamp`, the header Kick actually sends. The old name is dropped, not aliased, and the fixtures move to the real names;
   - dedupe by `Kick-Event-Message-Id`;
   - reject timestamps outside ±5 minutes;
   - pass `sender.user_id`, badges and `broadcaster.user_id` to the chat pipeline.

   The fixtures will use the real header names.
2. **Principals:**
   - parse Twitch `user-id`, `display-name`, `badges` and `room-id`;
   - build principals for both platforms;
   - switch owner, delegation, ChatGate and idea-round identity to platform ids, keeping the login fallback.

   Tests: spoofed display names gain nothing, Kick moderator and broadcaster badges, a renamed login keeps its identity.
3. **Seat tokens:**
   - add `src/seats.js` (sign, verify, single use, revocation, cap);
   - generate `VA_SEAT_KEY` in `setup:local`.

   Tests cover expiry, a wrong room, a wrong seat, reuse that revokes, a rotated key and the cap.
4. **Socket handshake:**
   - `?seat=1` plus `hello`;
   - legacy sockets unchanged;
   - one seat per identity;
   - `identity` in `welcome`;
   - `onJoin` gains the new fields.

   Tests: an old client with `full` frames, a `b1` client with a seat, a legacy client next to a seated one, the hello timeout, and the existing backpressure and input caps.
5. **The chosen delivery** (D: the pairing endpoint, `!join <code>`, entry pages for both the lobby and tee-play, the "Not me" button and the web-guest path), with tests on both platforms using simulated IRC and signed webhooks signed with a test key.
6. **Evidence:**
   - a local rehearsal with simulated Twitch and Kick, saved in `docs/evidence/`;
   - then the real run with you: one Twitch viewer and one Kick viewer in the same room, `/admin/status` showing both principals, and screenshots.
