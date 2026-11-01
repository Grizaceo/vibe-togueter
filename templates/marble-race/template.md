---
name: marble-race
format: "Marbles on Stream" (plinko race)
modes: pasivo (chat-only) — el modo activo recibe canica gratis al conectarse
status: ready
---

# marble-race

El formato más famoso de chat-games: cada viewer pone `!play` y su nombre va en una
canica; `!race` larga la carrera por un campo de pegs; gana quien cruza la meta.

## Contrato de chat
- `!play` / `!join` / `!jugar` → agrega tu canica (máx 60, solo en lobby)
- `!race` / `!start` / `!largada` → countdown 3s y larga (requiere ≥2 canicas)
- `!reset` / `!reiniciar` → limpia a lobby

## Qué adaptar para tu stream (prompts típicos)
- "mismos pegs pero en zigzag hacia la derecha" — editar `buildPegs()`
- "la canica del sub tira más rápido" — multiplicar G por user en `addMarble`
- "la meta es arriba" — invertir G y FINISH_Y
- "canicas con avatar del canal" — cambiar el circle por sprite en `view()`
- Mapa 3D: conservar física server-side, reemplazar `view()` por posiciones
  `x,y,z` y servir un `client/index.html` con three.js (ver soporte custom client).

## Notas de adaptación
- `wins` persiste por sesión de juego (leaderboard de la noche).
- Para formato eliminatorio: quien llega último queda `finished` pero fuera de la próxima ronda.
