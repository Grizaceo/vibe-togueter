<!-- vitrina:translation-of README.md sha256=aa3a6a0e19d59b643cc5b22f2696a9132b00cd8b9531117b0a7bccfad11e971e -->
# Vibe Arena

[English](README.md)

Vibe Arena es un servidor Node donde el chat de Twitch o Kick de un streamer propone, vota y juega juegos de navegador, y Codex construye juegos nuevos en VMs separadas.

## Estado

Alfa.

**Historia.**
- Nació como proyecto para el hackathon Codex x TwitchCon de noviembre de 2026.
- El estado que se evaluó está congelado en el tag `submission-2026-11-02` y en la rama `develop`.
- El trabajo sigue en `main`, según el [roadmap](docs/ROADMAP.md).

**Avance del roadmap.**
- La fase 0 (link público para unirse) y la fase 1 (frames de baja latencia) están hechas.
- La fase 2 (una identidad por viewer entre Twitch, Kick y la web) funciona en local. Falta una sesión real con viewers de Twitch y de Kick.

## Cómo correrlo

Requiere Linux con bubblewrap y user namespaces.

```bash
npm ci
npm test
npm start -- --game-dir games/community-grove
```

Abre `http://localhost:8420/` y elige "Play as guest". Para probarlo no hace falta cuenta de Twitch ni de Kick. Para conectar un canal, mira la [guía de operación](docs/OPERATING.md), que está en inglés.

## Cómo funciona

**Entrar.**
- `!join` en el chat responde con un único link público, el mismo para todos.
- La página muestra a cada pestaña un código corto. El viewer lo escribe en el chat de Twitch o Kick, y ese mensaje sienta a la pestaña con su cuenta y su rol en la plataforma.
- Un nombre visible nunca da privilegios. Quien no empareja juega como invitado web no verificado.

**Jugar.**
- Los juegos revisados corren en un proceso aislado en el controlador. El navegador de cada viewer recibe solo primitivas de dibujo, así que ningún código del juego corre en su equipo.
- Los frames siguen el ritmo del juego y, después del primero, solo se envían los cambios.
- Si un juego falla, un watchdog cambia la sala a un juego de respaldo revisado y conserva a los jugadores.

**Construir.**
1. El chat propone ideas con `!idea` y vota.
2. El streamer aprueba la selección exacta.
3. Codex construye el juego en una VM y otra VM lo prueba.
4. El streamer aprueba el resultado exacto.

Por ahora, lo aprobado queda inerte. La VM que va a correr esos juegos llega en la fase 4 del roadmap.

Más detalle, en inglés:

| Documento | Qué cubre |
|---|---|
| [Arquitectura](docs/ARCHITECTURE.md) | Módulos y límites de confianza |
| [Guía de operación](docs/OPERATING.md) | Cómo correr el controlador y conectar canales |
| [Funciones opcionales](docs/FEATURES.md) | Los flags de funciones de la sesión |
| [Identidad y asientos](docs/platform/IDENTITY_SEATS.md) | Cómo obtiene asiento cada viewer |
| [Formato de frames](docs/platform/MODE_A_FRAMES.md) | Qué llega al navegador, con la latencia medida |

## Cómo se hizo

- **Decidí y revisé yo (Cristóbal Muñoz):**
  - el producto;
  - el plan de tres VMs y los modos de entrega;
  - el emparejamiento por código en el chat para la identidad;
  - el alcance de cada fase del roadmap;
  - cada merge a `main`.

  Revisé y aprobé los artefactos exactos de las pruebas de construcción en VM.
- **Antes del hackathon:** construí el primer prototipo con Devin CLI. El commit `fab3227` lo registra.
- **Lo escribió la IA:**
  - **Durante el hackathon:** Codex escribió el código. Devin lo revisó en modo de solo lectura y redactó conmigo los diagramas del producto. El 2 de noviembre, después del congelamiento de funciones, Claude Code redactó el texto de la entrega y empaquetó esos diagramas en un visor, sin cambiar código de la aplicación.
  - **Después del hackathon:** Claude Code escribió la mayor parte del trabajo en `main` (el link público, el formato de frames, la identidad y los asientos) y el primer borrador de este README.
- **Lo verifiqué:**
  - la suite `npm test` ([claims.json](claims.json));
  - ensayos en Chromium headless de la página de juego, el overlay, el Studio y el emparejamiento;
  - una construcción real de Codex en una VM, probada por otra VM ([revisión de Lantern Table](docs/platform/LANTERN_TABLE_REVIEW.md));
  - comandos reales en el chat de Twitch durante el hackathon.
- **Sin verificar:**
  - un evento real de Kick;
  - una sesión en vivo con viewers de Twitch y Kick en asientos;
  - la nueva prueba del link con un túnel real;
  - un despliegue alojado;
  - cualquier pago.

## Límites

- **Host del controlador.** Corre solo en Linux. Los juegos incluidos corren en un sandbox de namespaces en ese host, todavía no en una VM.
- **Juegos generados.** Son artefactos revisados e inertes, con vistas previas estáticas. Para correrlos falta la VM de juegos de la fase 4 del roadmap.
- **Kick.** El webhook está probado solo con fixtures firmados, no con una cuenta real de Kick.
- **Tee.** El juego individual de Tee todavía pide un nombre. Pasa a asientos con el protocolo de juegos de la fase 3 del roadmap.
- **Link público.** Los quick tunnels cambian de hostname en cada arranque, y no hay una instancia alojada estable.
- **Créditos de construcción.** Son contabilidad simulada, no dinero. No se procesa ningún pago.
- **Transmisión en vivo.** No hay un ensayo humano de transmisión ni de OBS sobre `main`.
