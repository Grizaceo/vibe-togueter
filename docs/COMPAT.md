# Compatibilidad por plataforma — vibe-arena

Verificado: 2026-11-01 (tests `test/platforms.mjs`, `test/e2e.mjs`).

## Lectura de chat (comandos `!`)

| | Twitch | Kick |
|---|---|---|
| Vía | IRC `wss://irc-ws.chat.twitch.tv` | Events API webhook `POST /webhook/kick` |
| Auth | Anónima (justinfan) u OAuth `chat:read` | App token + suscripción `chat.message.sent` |
| Setup | `--twitch <canal>` — funciona sin credenciales | App en Developer + webhook URL pública + `scripts/kick-subscribe.mjs` |
| Estado | ✅ probado con canal real | ✅ receptor + firma RSA probados con firma forjada; falta evento real de Kick |

## Escritura de chat (respuestas del bot)

| | Twitch | Kick |
|---|---|---|
| Requisito | `VA_TWITCH_OAUTH` + `VA_TWITCH_NICK` (token `chat:edit`) | `VA_KICK_TOKEN` (user OAuth `chat:write`) + `kick.broadcasterUserId` |
| Implementado | `send()` en `chat/twitch.js`, throttle 1 msg/s | `sendKickChat()` → `POST /public/v1/chat` |
| Uso actual | `!join` responde link de sala | `!join` responde link de sala |
| Estado | ⚠️ código listo, falta credencial tuya | ⚠️ código listo, falta credencial tuya |

## Monetización → fondo (treasury)

| Evento | Twitch | Kick |
|---|---|---|
| Sub propia | `channel.subscribe` → `twitchSubUsd`×tier | `channel.subscription.new` → `kickSubUsd` |
| Subs regaladas | `channel.subscription.gift` → ×total | `channel.subscription.gifts` → ×giftees |
| Moneda virtual | `channel.bits.use`/`channel.cheer` → `bitUsd`×bits | `kicks.gifted` → `kickUsdPerKick`×kicks |
| Channel points | recepción registrada en feed (mapeo a comandos: pendiente) | n/a (Kicks ya cubiertos) |
| Donaciones externas | `/webhook/donation` (Streamlabs/Ko-fi) — funciona para ambas | igual |
| Firma | HMAC-SHA256 `Twitch-Eventsub-Message-Signature` | RSA-SHA256 vs `/public/v1/public-key` |
| Estado | ✅ HMAC verificado en test | ✅ RSA verificado en test con key inyectada (`VA_KICK_PUBKEY`) |

## Agnóstico de plataforma (idéntico para ambas)

- Cliente jugador por URL (`/`), overlay OBS (`/overlay.html`), lobby, feed
- Pipeline de comandos, cooldown, `!idea`, votación futura
- Generación de juegos (LLM local/nube), hot-reload, MCP tools
- `!join`/`!play`/`!race` funcionan igual vengan de `source: 'twitch'|'kick'|'web'`

## Lo que requiere TU cuenta (no automatizable)

1. **Twitch**: app en dev.twitch.tv → token `chat:read chat:edit` para respuestas +
   EventSub subscriptions con `eventsubSecret` para subs/bits.
   El flujo OAuth ya está probado en `stream-to-shorts/twitchcon-app` — portar `.env` loader.
2. **Kick**: app en Account → Developer → "Enable Webhooks" a `https://<tunnel>/webhook/kick`
   + `scripts/kick-subscribe.mjs`. Para enviar: OAuth PKCE del broadcaster.
3. **Tunnel público**: `cloudflared tunnel --url http://localhost:8420` (quick) o named
   tunnel para URL fija — requerido por Kick webhooks y por jugadores desde fuera.

## Notas

- Lectura anónima de Kick chat **no existe más** (Pusher cloud abandonado; gateway
  viewer requiere token de navegador). Sin app propia no hay lectura de Kick.
- EventSub de Twitch igualmente requiere app + token para crear suscripciones;
  el receptor ya está listo y probado.
