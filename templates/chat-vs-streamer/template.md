---
name: chat-vs-streamer
format: "Chat vs Streamer" (Twitch Plays democrático)
modes: pasivo — el chat vota acciones que juegan contra el streamer
status: spec
---

# chat-vs-streamer (spec)

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
