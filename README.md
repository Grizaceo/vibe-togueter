# vibe-arena

Juegos vibe-codeados en vivo para Twitch/Kick. El chat participa de dos formas:

- **Modo activo**: entran por URL/QR a un host temporal y juegan en el navegador (modelo Jackbox).
- **Modo pasivo**: comandos de chat (`!cmd`) afectan el juego para quien no quiere jugar.

Y una capa de **monetización**: subs/donaciones van a un fondo que paga las generaciones
del LLM — local (DGX Spark / Ollama / vLLM, costo marginal ~0) o nube (DeepSeek/OpenRouter/Gemini).

## Correr

```bash
npm start                          # server en :8420
npm start -- --twitch <canal>      # + lector de chat Twitch (anónimo, solo lectura)
npm run dev                        # con --watch
```

URLs:

- `http://<host>:8420/` — cliente jugador (compartir por QR/link; `?name=X` fija nombre)
- `http://<host>:8420/overlay.html` — browser source de OBS (juego + feed chat + fondo + lobby)
- Chat de prueba: escribe `!quake`, `!ball`, `!gravity` en la terminal del server, o `user: !cmd`

## Flujo de vibe-coding en vivo

1. Chat propone: `!idea <texto>` → se guarda en `ideas.jsonl` y sale en el feed del overlay.
2. Generación: `POST /admin/generate {"idea":"..."}` → el LLM produce `games/auto-*/game.js` → se carga y anuncia en stream.
   Con `"autoGenerate": true` en config, el server lo hace solo cuando el fondo ≥ `gameCostUsd`.
3. Manual: cualquier agente (Devin, Hermes, tu editor) puede escribir `games/<n>/game.js`
   y cargarlo con `POST /admin/load {"game":"<n>"}` — o editarlo en caliente, `fs.watch`
   recarga solo (ideal para iterar en vivo).

## Monetización

`treasury.jsonl` es el ledger (append-only). Endpoints:

- `POST /admin/fund {"amountUsd":2.5,"source":"sub"}` — depósito manual/test
- `POST /webhook/donation?secret=<webhookSecret>` — Streamlabs/Ko-fi: `{"amountUsd":5,"user":"x","source":"kofi"}`
- `GET /admin/treasury` — balance, recaudado, gastado, juegos generados
- El overlay muestra `fondo $X / $meta` en vivo — la meta visible incentiva a donar.

Config en `vibe-arena.config.json`:

- `generator.mode: "local"` → `baseUrl` apunta a tu Ollama/vLLM (ej. DGX Spark: `http://spark:11434/v1`), costo 0.
- `generator.mode: "cloud"` → `baseUrl` + `apiKey` de DeepSeek (`https://api.deepseek.com/v1`), OpenRouter (`https://openrouter.ai/api/v1`), etc. Costo medido por tokens contra `PRICING` en `src/generator.js`.
- Overrides por env: `VA_BASE_URL`, `VA_API_KEY`, `VA_MODEL`.
- `gameCostUsd` = umbral del fondo para permitir una generación; `maxCostUsd` = tope por juego.

Subs/bits de Twitch → fondo requiere EventSub con OAuth del streamer (pendiente; el webhook
de donaciones ya cubre Streamlabs/Ko-fi).

**Kick (verificado 2026-11-01)**: la lectura anónima de chat murió — Kick abandonó el
cloud Pusher y el gateway viewer exige token de sesión de navegador bloqueado por
Cloudflare. La vía oficial es la Events API con webhook propio:

1. App en kick.com → Account → Developer → "Enable Webhooks" apuntando a
   `https://<tu-tunnel-cloudflare>/webhook/kick`
2. `node scripts/kick-subscribe.mjs --token <APP_TOKEN> --user <broadcaster_user_id>`
   (suscribe `chat.message.sent` + subs + livestream status)
3. `POST /webhook/kick` ya verifica la firma RSA con `GET /public/v1/public-key`.
   `src/chat/kick.js` incluye `sendKickChat()` para respuestas del bot (OAuth `chat:write`).

## MCP — "a un prompt de distancia"

`src/mcp-server.js` expone todo por MCP/stdio para que cualquier agente (Devin,
Hermes, Claude) adapte formatos preexistentes o genere juegos en vivo:

```json
// .devin/mcp_config.json (ya incluido en el repo)
{ "mcpServers": { "vibe-arena": { "command": "node", "args": ["--experimental-vm-modules", "src/mcp-server.js"] } } }
```

Tools: `arena_status`, `get_sdk_spec`, `list_templates`, `get_template`,
`install_game` (valida compilando en el sandbox antes de activar), `load_game`,
`generate_game`, `list_ideas`/`clear_ideas`, `treasury_stats`, `deposit`, `inject_chat`.

Flujo "adáptame marble race a mi canal":
`list_templates` → `get_template('marble-race')` → el agente reskinéa el código →
`install_game({name:'mi-race', code, activate:true})` → en vivo. Sin tocar el server.

## Templates (juegos preexistentes)

`templates/` — formatos conocidos listos o especificados para adaptar:

- `marble-race` (listo): el clásico. `!play` mete tu canica, `!race` larga plinko,
  podio automático y vuelta al lobby. Puro chat — no requiere cliente web.
- `chat-trivia`, `chat-vs-streamer`, `claw-crowd` (specs): trivia estilo Jackbox,
  Twitch-Plays democrático, efectos pagados sobre el juego.

**Cliente custom**: si el formato original trae su propio renderer (p. ej. marble
race 3D en three.js), poner `client/index.html` dentro de `games/<n>/client/` — se
sirve en `/` y `/overlay.html` reemplazando al canvas genérico; `view()` pasa a ser
JSON libre que ese cliente interpreta.

## Exponer a internet

El host temporal que describe la idea = este server + tunnel:

```bash
cloudflared tunnel --url http://localhost:8420
```

→ URL pública https para jugadores y para el browser source de OBS. Genera QR del link
y muéstralo en pantalla.

## Arquitectura

```
chat (twitch irc / web / terminal) ──► handleChat ──► onChat del juego   [modo pasivo]
                                         └─► !idea → ideas.jsonl
navegador jugador ──ws──► onInput ──► tick loop (server-side, ~30Hz)     [modo activo]
                                         └─► view() → broadcast 15Hz → canvas genérico
LLM (local/nube) ──► generator.js ──► games/auto-*/game.js ──► vm sandbox → hot-reload
donaciones ──► treasury.jsonl ──► fondea generator.generateGame()
```

- `src/gamehost.js` — carga `game.js` en `node:vm` (barrera contra accidentes; para
  producción meter el server entero en docker), tick loop, hot reload.
- `src/sdk-prompt.md` — el contrato que recibe el LLM generador (también sirve de spec
  para agentes que escriban juegos a mano).
- `games/demo/game.js` — Bumper Arena: ejemplo de referencia de ambos modos.

## Tests

```bash
node test/mock-llm.mjs &        # mock OpenAI-compatible en :11499
VA_BASE_URL=http://localhost:11499/v1 VA_MODEL=local npm start &
node test/e2e.mjs               # room, inputs, chat, render
node test/monetization.mjs      # webhook, fondo, generación, hot-swap
node test/mcp.mjs               # MCP: templates, install/validate, load, chat
```

## Compatibilidad Twitch / Kick

Ver `docs/COMPAT.md` para la matriz completa. Resumen: lectura Twitch funciona
anónima hoy; Kick requiere tu app de desarrollador (lectura anónima no existe más).
EventSub (`/webhook/twitch`, HMAC) y Kick (`/webhook/kick`, RSA) ya reciben subs/bits/
kicks y los convierten en depósitos del fondo — probados con firmas forjadas locales.
Respuestas del bot listas vía `VA_TWITCH_OAUTH`/`VA_TWITCH_NICK` y `VA_KICK_TOKEN`.

## Pendientes (roadmap honesto)

- [ ] Twitch: portar loader de tokens `.env` de `twitchcon-app` (OAuth + refresh)
- [ ] Kick + Twitch: probar webhooks con eventos reales (requiere tus apps)
- [ ] Channel points → comandos de juego (recepción ya registrada)
- [ ] Dockerfile con red aislada para sandbox duro del código generado
- [ ] Votación de ideas en chat (`!vote N`) en vez de última-idea
- [ ] Cola de generación con prioridad por monto donado
- [ ] Rate-limit por usuario en comandos de juego (hoy hay cooldown global suave)
- [ ] Auth moderada para `/admin/*` si el server sale de localhost
