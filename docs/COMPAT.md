# Platform compatibility

Last updated 2026-11-03. Rows without a newer date describe the hackathon state of November 1–2, 2026.

| Path | Implemented | Evidence |
|---|---|---|
| Twitch chat read/write | Local OAuth, validate/refresh, tagged IRC, reconnect, bounded reply queue | Actual `gris_96` `!play`, `!race`, `!join`, `!left`, `!fire`; anonymous observer saw bot's public URL reply |
| Browser player and OBS page | HTTPS/WSS lobby and spectator overlay | Public HTTP/WSS probes; game state and input verified; current local Chromium covers desktop layout and production keyboard input; actual OBS and human rehearsal remain manual |
| Marble Race | Chat-only plus web participants | Actual Twitch command started a race with a second web participant |
| Democracy Duel | One latest ballot per viewer, 3s majority window, private streamer input, automatic rounds | SDK tests plus real Twitch votes and public WSS web input |
| Twitch subscriptions and Bits | Signed receiver, subscription CLI with correct app-token transport | Signed fixtures and mocked API tests; real paid events unverified |
| Channel points | Exact configurable reward title → game command | Signed HTTP fixture affected a game vote once across duplicate delivery; actual redemption unverified |
| Kick | Signed webhook with Kick's documented headers (`Kick-Event-Message-Timestamp`, fixed 2026-11-03), redelivery dedupe, ±5 min window, `kick:<user_id>` principals with moderator/broadcaster roles; outgoing adapter | RSA fixture tests with the real header names; local Chromium pairing via a test-signed webhook (`docs/evidence/seats-local-*`). No real Kick account event or reply yet: needs the owner's app, accounts and a stable public URL (see platform/IDENTITY_SEATS.md §6) |
| Seats (phase 2) | `!join <code>` pairing from Twitch or Kick chat, Ed25519 seat tokens bound to a per-tab WebCrypto key, web guests, legacy `?name=` clients unchanged | Unit and socket tests (`test/seats.mjs`, `test/seating.mjs`, Twitch through the real IRC parser); local Chromium rehearsal for Kick and web guest. No real Twitch+Kick session yet |
| Simulated build credits → SDK fixture | Legacy local generator and demo accounting; default cloud worker is blocked | Mock-provider tests only for this route; separate real Codex VM trial has construction evidence but no automatic dispatch or settled billing |
| Chat Trivia / anarchy / subscriber weighting | Spec only | Not implemented or claimed |

`--twitch <channel>` now requires a validated OAuth login for that same owner's channel. The low-level IRC helper still supports anonymous observation; the application does not silently fall back to read-only mode when auth fails. Scopes for normal chat are `chat:read chat:edit`. EventSub additionally needs `channel:read:subscriptions bits:read channel:read:redemptions` and broadcaster eligibility. The earlier rehearsed channel returned `broadcaster_type=""`; its token currently has only chat scopes.

Twitch webhook subscriptions require an app token after user-scope consent, HTTPS port 443 and the same secret configured in the receiver. A quick tunnel URL expires when its process ends; changing the URL requires updating .env, restarting the server and recreating any webhook subscriptions. Public player links contain no control keys.

Source checks: [token validation](https://dev.twitch.tv/docs/authentication/validate-tokens/), [subscription authorization](https://dev.twitch.tv/docs/eventsub/manage-subscriptions/#authorization), [event types/scopes](https://dev.twitch.tv/docs/eventsub/eventsub-subscription-types/). Do not equate valid signed fixtures with real purchases or Twitch delivery.

The shipped configuration excludes external runtimes and leaves paid-event credit simulation off. The Twitch checks above date from the hackathon and were not replayed on `main`.
