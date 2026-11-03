---
name: chess-simul
format: "Simultáneas de ajedrez" (exhibición 1-vs-N, estilo real)
modes: pasivo (cada challenger mueve en su propio tablero por chat) + activo (streamer rota tableros con puntero web)
status: spec
---

# chess-simul (spec)

El streamer da una exhibición de simultáneas: **una partida individual contra cada
challenger del chat, todas a la vez**. Como en las simultáneas reales, el streamer
juega blancas en todos los tableros, rota entre ellos en el orden que quiera, y
cada tablero tiene un reloj que corre contra el streamer mientras ese tablero
espera su jugada (el challenger espera "sentado" a que el streamer vuelva).

Deriva de `chat-vs-streamer`, pero en vez de un tablero democrático son N tableros
individuales: la identidad `source:name` del chatter reclama y posee un tablero.

## Contrato de chat

- `!play` / `!join` / `!jugar` → reclama un tablero libre (un tablero por
  `source:name`; un chatter solo puede tener una partida viva a la vez)
- `!move e2e4` o `!e2e4` → jugada en notación UCI sobre TU tablero;
  promoción con sufijo (`e7e8q`). Opcional: aceptar SAN (`!e4`, `!Cf6`, `!O-O`,
  `!exd5`) resolviendo contra la lista de legales — más código, más amigable.
- `!resign` / `!rendirse` → abandonas tu tablero (cuenta como derrota)
- Jugada ilegal → no se aplica; se muestra "illegal" parpadeando en ese tablero
  unos segundos (`onChat` devuelve `true` igual: el comando era para este juego).

Sin comandos de control por chat: `onChat` no recibe badges de mod/broadcaster,
así que empezar/resetear la ronda lo hace el streamer clickeando botones dibujados
en `view()` (el `onInput` ya valida `id === state.streamerId`).

## Streamer (input web, verificado por `streamerId`)

- Puntero dos-clicks: click en un tablero selecciona pieza propia, click destino
  mueve. Hit-test de `input.x/y` → board index → casilla. La selección vive en
  `state.sel` para que `view()` la resalte.
- Puede atender cualquier tablero en cualquier orden — ese es el juego.
- Botones en HUD: `START` (con ≥1 challenger sentado) y `RESET`/`NEW ROUND`.

## Reloj — 3 modos configurables (`CLOCK_MODE`)

Todos: el reloj del streamer **solo drena en tableros que esperan su jugada**
(turno de blancas, partida viva, challenger ya movió o es la jugada inicial).
Si `streamerId === null` (streamer desconectado) todos los relojes del streamer
se congelan — sin streamer no hay simultánea que flaggear.

- `reserve` (default, el más fiel a simultáneas reales): cada tablero tiene una
  reserva `STREAMER_RESERVE_S` (ej. 60) que drena solo mientras ese tablero espera
  al streamer. Flag en un tablero = derrota solo en ese tablero.
- `visit`: cada vez que el challenger mueve arranca un countdown fijo
  `VISIT_SECONDS` (ej. 20) en ese tablero; si expira antes de que el streamer
  responda, flag. Más arcade/punitivo, presión constante.
- `global`: un solo reloj `SIMUL_CLOCK_S` (ej. 300) compartido, drena mientras
  ≥1 tablero vivo espere al streamer. Flag = pierde todos los tableros vivos.

Anti-congelado (los tres modos): reserva opcional del challenger
`CHALLENGER_RESERVE_S` (ej. 180, `0` = off) que drena solo en turno del
challenger; flag = abandono, el tablero es para el streamer. Sin esto un viewer
ausente puede dejar un tablero congelado para siempre.

## Diseño sugerido

- `state.boards`: array de máx 6 `{owner, engine, sClock, cClock, awaitT,
  status: 'live'|'mate'|'flag'|'resign'|'draw', lastMove, flash, flashT}`.
  Asientos por identidad `source:name` (mismo patrón que los votos de
  chat-vs-streamer). Al terminar un tablero el asiento queda libre para otro
  `!play` — la simultánea se auto-rellena.
- Motor: legal moves completos (jaque, enroque, al paso, promoción, ahogado,
  mate por material insuficiente, 50 movimientos; tres repeticiones opcional).
  ~600 líneas de JS plano, entra en el sandbox sin imports. Tablero como array
  de 64 o 8×8; generar pseudo-legales y filtrar dejando rey en jaque.
- Layout 3×2 en 1280×720: HUD superior ~130px (título, tanteador W-D-L de la
  sesión, reloj global si aplica); cada celda ~400×285 con tablero de 256px
  (casillas 32px), nombre del challenger y su reloj debajo.
- Piezas: glifos Unicode `♔♕♖♗♘♙♚♛♜♝♞♟` vía primitiva `text`
  (fallback: letra `KQRBNP` si preocupa la fuente). Resaltar: casilla
  seleccionada, último movimiento, y borde rojo pulsante al tablero con el
  reloj del streamer más bajo.
- Fin de ronda: sin tableros vivos y ≥1 jugado → banner con tanteador final,
  auto-reset a lobby en ~15s o click `NEW ROUND` del streamer. El tanteador de
  sesión (`state.score`) sobrevive al reset como el `wins` de marble-race.
- Bounded state: ≤6 boards, `flash` con TTL, no guardar PGN completo
  (basta `lastMove` para el highlight; si se quiere scoresheet, cap en ~200).

## Qué adaptar para tu stream (prompts típicos)

- "modo bullet" → `CLOCK_MODE='visit'` con `VISIT_SECONDS=10`
- "8 tableros" → `COLS=4, ROWS=2, MAX_BOARDS=8` + rehacer constantes de layout
- "streamer da las negras" → invertir lados; el clock corre igual
- "los subs resisten más" → `CHALLENGER_RESERVE_S` mayor o sin anti-congelado
  para su tablero (requiere badges → no disponibles en `onChat`; solo viable
  distinguiendo `user.source`, ej. kick vs twitch)
- Custom client: con el canvas genérico alcanza (glifos `text`), pero un
  `client/index.html` permite drag&drop real, sprites de piezas y sonido.

## Notas de adaptación

- Prioridad al implementar: motor legal > reloj `reserve` > render legible.
  SAN y tres repeticiones son el primer recorte si el archivo crece de más.
- `meta.description` debe listar `!play`, `!move`/`!e2e4`, `!resign`.
- En simultáneas reales el exhibitor puede pasar de largo un tablero: acá el
  streamer simplemente no clickea ese tablero — mismo efecto, cero código extra.
