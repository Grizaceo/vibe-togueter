---
name: chat-vs-streamer
format: "Chat vs Streamer" (Twitch Plays democrático)
modes: pasivo — el chat vota acciones que juegan contra el streamer
status: implemented
---

# chat-vs-streamer — Democracy Duel

El streamer juega de un lado; el chat controla al oponente por votación agregada.
Patrón Twitch Plays: cada T segundos se toma el comando más votado.

## Diseño sugerido
- `state.votes: Map(user -> vote)` + ventana de votación `VOTE_WINDOW_S` en tick.
- `onChat`: cualquier texto cuenta como voto si está en `options` activas
  (ej. `!izq !der !disparar` o `e4`, `Cf6` en ajedrez).
- Modos de agregación: `democracy` (mayoría) / `anarchy` (uno al azar del pool)
  / `sub-power` (subs pesan x2 — requiere badges de Twitch, vía EventSub).
- El streamer juega con input normal desde su cliente web (modo activo local).
- Fondos: opcional — votos premium con `!vote` pagado vía tesorería.


Implemented format: chat controls the cyan ship by one latest ballot per source/user per three-second window. A rotating deterministic tie-break resolves tied actions; no votes means hold. The authenticated streamer controls the purple ship with A/D or arrows and space. Three hits ends a round; automatic restart after eight seconds. Web spectators can vote through the lobby, but cannot drive the streamer ship without claiming its private key. `game.js` uses only the fixed SDK. Anarchy, subscriber weighting and premium votes remain unimplemented.
