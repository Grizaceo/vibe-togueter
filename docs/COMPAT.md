# Platform compatibility — November 1, 2026

| Path | Implemented | Evidence |
|---|---|---|
| Twitch chat read/write | Local OAuth, validate/refresh, tagged IRC, reconnect, bounded reply queue | Actual `gris_96` `!play`, `!race`, `!join`, `!left`, `!fire`; anonymous observer saw bot's public URL reply |
| Browser player and OBS page | HTTPS/WSS lobby and spectator overlay | Public HTTP/WSS probes; game state and input verified; rendered browser/OBS inspection remains manual |
| Marble Race | Chat-only plus web participants | Actual Twitch command started a race with a second web participant |
| Democracy Duel | One latest ballot per viewer, 3s majority window, private streamer input, automatic rounds | SDK tests plus real Twitch votes and public WSS web input |
| Twitch subscriptions and Bits | Signed receiver, subscription CLI with correct app-token transport | Signed fixtures and mocked API tests; real paid events unverified |
| Channel points | Exact configurable reward title → game command | Signed HTTP fixture affected a game vote once across duplicate delivery; actual redemption unverified |
| Kick | Existing signed webhook and outgoing adapter | Existing RSA fixture tests; no real Kick account event/reply tested this session |
| Fund → generated game | Existing ledger, OpenAI-compatible generator, SDK load/hot reload | Isolated mock LLM tests; actual model provider/billing not verified |
| Chat Trivia / anarchy / subscriber weighting | Spec only | Not implemented or claimed |

`--twitch <channel>` now requires a validated OAuth login for that same owner's channel. The low-level IRC helper still supports anonymous observation; the application does not silently fall back to read-only mode when auth fails. Scopes for normal chat are `chat:read chat:edit`. EventSub additionally needs `channel:read:subscriptions bits:read channel:read:redemptions` and broadcaster eligibility. The active channel returned `broadcaster_type=""`; its token currently has only chat scopes.

Twitch webhook subscriptions require an app token after user-scope consent, HTTPS port 443 and the same secret configured in the receiver. A quick tunnel URL expires when its process ends; changing the URL requires updating .env, restarting the server and recreating any webhook subscriptions. Public player links contain no control keys.

Source checks: [token validation](https://dev.twitch.tv/docs/authentication/validate-tokens/), [subscription authorization](https://dev.twitch.tv/docs/eventsub/manage-subscriptions/#authorization), [event types/scopes](https://dev.twitch.tv/docs/eventsub/eventsub-subscription-types/). Do not equate valid signed fixtures with real purchases or Twitch delivery.
