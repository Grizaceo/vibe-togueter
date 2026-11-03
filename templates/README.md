# Templates — formatos preexistentes de chat-games

Cada template es un formato conocido adaptado (o por adaptar) al SDK de vibe-arena.
El MCP `vibe-arena` los expone vía `list_templates` / `get_template` para que un
agente los reskinée a tu canal "a un prompt de distancia".

| template | formato original | modos | estado |
|---|---|---|---|
| `marble-race` | Marbles on Stream | pasivo (puro chat) | listo |
| `chat-trivia` | TriviaMurder/Jackbox | pasivo + activo | spec |
| `chat-vs-streamer` | Chat vs Streamer chess/roguelike | pasivo votación | spec |
| `chess-simul` | Simultáneas de ajedrez 1-vs-N | pasivo (chat por tablero) + activo (streamer) | spec |
| `claw-crowd` | Crowd Control (efectos sobre juego) | pasivo pagado | spec |

## Cómo adaptar un juego preexistente (flujo MCP)

1. `list_templates` → elegir el formato base
2. `get_template(name)` → leer su `game.js` + `template.md` (contrato de chat)
3. Adaptar el código al gusto del streamer (reskin, reglas, mapa)
4. `install_game({name, code})` → escribe `games/<name>/game.js` y valida que compile
5. `load_game(name)` → lo pone en vivo; el feed lo anuncia

## Cliente custom (juegos three.js/Phaser existentes)

Si el juego original trae su propio renderer (marble race 3D en three.js, etc.),
poner `client/index.html` (+ assets) dentro de `games/<n>/client/` — el server lo
sirve en `/` y `/overlay.html` en vez del canvas genérico. El juego sigue emitiendo
su estado por `view()`; su propio cliente lo interpreta. El `view()` entonces es
libre: cualquier JSON que el cliente entienda.
