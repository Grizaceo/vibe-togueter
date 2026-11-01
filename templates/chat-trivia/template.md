---
name: chat-trivia
format: "Trivia Murder / Jackbox-style trivia"
modes: pasivo (votación por chat) + activo (respuestas por web)
status: spec
---

# chat-trivia (spec)

Rondas de preguntas; el chat responde con `!a`/`!b`/`!c`/`!d`, jugadores web con
botones en pantalla. Puntos por rapidez + acierto. Podio al final.

## Diseño sugerido
- `questions.json` junto a `game.js` con el banco (el agente lo genera con el tema del stream).
- Fases por pregunta: `show` (8s lectura) → `answers` (10s votación) → `reveal` (3s) → siguiente.
- `onChat`: `!a..!d` solo válido en fase `answers`; un voto por usuario por pregunta.
- Web players reciben `input {kind:'answer', idx}` — extender el cliente genérico o
  servir `client/index.html` con 4 botones grandes (este formato pide custom client).
- Modo "chat colectivo": el chat decide UNA respuesta por mayoría → chat vs streamer.
