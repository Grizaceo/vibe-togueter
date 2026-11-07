# Vibe Arena game protocol v1

Status: **accepted on 2026-11-06; not implemented yet.** This is roadmap phase 3, written before the code as the roadmap asks. The owner's decisions are in section 12.

The protocol is the contract between the platform and a game. It has three parts:
- a **manifest**: what the game declares about itself before it runs;
- a **control channel**: hello, seats, input, chat effects, pause, health and round end;
- a **data plane**: what reaches the browser. For mode A this is the frame format of [MODE_A_FRAMES](MODE_A_FRAMES.md), unchanged.

**Done when** (from the roadmap): Grove and Tee run under the same contract, with conformance tests.

## 1. Goals and non-goals

Goals:
- One contract for every kind of game: SDK games run by the platform, and native games with their own server, such as Tee.
- The platform enforces the limits it declares. A game cannot widen its own input, chat or seat limits at runtime.
- The same messages work for the local runtime today and for VM3 behind the funnel later. Only the transport changes.
- Old SDK games keep running without edits, so no reviewed hash has to change for v1.

Non-goals for v1:
- The VM3 runtime and the funnel themselves (phases 4 and 5).
- WebTransport. The messages are transport-independent; WebTransport is the next data-plane step.
- Mode C (pixel stream) and opt-in mode B policy beyond what Tee needs today.
- Game-to-game or peer-to-peer traffic. There is none.

## 2. Parties and trust

| Party | What it is | Trust |
|---|---|---|
| Platform | The controller today. Later the vault (controller) plus the funnel (public door). | Trusted. Holds the seat signing key, chat identities and limits. |
| Runtime | Where game code runs: the local bubblewrap sandbox today, the game VM (VM3) later. | Isolation boundary. Holds no platform secret. |
| Game | The SDK module, or a native game server reached through an adapter. | **Untrusted.** Every message from it is validated. |
| Browser | The viewer's page. | Untrusted input. In mode A it never runs game code. |

Rules:
1. **The game never learns who a viewer is beyond what it needs to show.** It gets an opaque seat id, a display name, the platform (`twitch`, `kick`, `web`), `verified` and the seat role. It never gets IP addresses, platform account ids, tokens or roles that grant power.
2. **Authority never comes from the game.** A game can report scores and request nothing privileged. Moderator and streamer actions stay on the platform's chat and admin paths.
3. **The platform checks before it forwards.** Input is checked against the manifest's input schema, chat commands against the declared commands and their rate limits, and seats against the declared maximums. Anything outside the manifest is dropped on the platform side and never reaches the game.
4. **Game messages are strict.** An unknown message type, a missing field or a value out of bounds from the game is a protocol error, and the platform treats it as a game failure (section 4.6). Messages from the platform may gain optional fields; games ignore fields they do not know.

## 3. Manifest

### 3.1 Fields

| Field | Type | Rule |
|---|---|---|
| `protocol` | `"va-game/1"` | Required. |
| `id` | string | `^[a-z0-9-]{1,60}$`. Same as the game directory or the remote game id. |
| `name`, `description` | string | ≤200 and ≤2000 characters, as today. English. |
| `version` | object | Set by the platform, never trusted from the game: `{sha256}` for an SDK game (hash of `game.js`), `{image, source}` for a native game (runtime digest and source pin). |
| `world` | `{w, h}` | 1–100000, default 1280×720, as today. Mode A only. |
| `tickRate` | number | 1–60, default 30, as today. Mode A only. |
| `seats` | object | Maximum per seat type: `player`, `spectator`, `streamer`. `streamer` is 0 or 1. `null` means no game limit (the platform's own caps still apply). |
| `input` | object | The input schema (3.2). |
| `chat` | object | Declared chat commands and crowd bursts (section 6). |
| `delivery` | array | Supported delivery modes, in order of preference: `"A"`, `"B"`, `"C"`. |
| `resources` | array | Asset ids from the reviewed resource registry. Sprites are allowed only from this list, as today. |
| `rounds` | boolean | `true` if the game sends `round` messages (4.4). |

The whole manifest is capped at 16 KiB of JSON, the current metadata limit.

### 3.2 Input schema

```json
"input": {
  "keys": ["up", "down", "left", "right", "space", "w", "a", "s", "d"],
  "pointer": true,
  "actions": [
    { "name": "aim", "fields": { "x": [-1, 1], "y": [-1, 1] } }
  ]
}
```

- `keys` is a subset of today's SDK keys. A key outside the list is dropped.
- `pointer: true` allows `{kind:'pointer', x, y, down}` in world coordinates. The platform clamps `x` and `y` to the world.
- `actions` are optional named inputs with numeric fields and closed bounds. They are for games whose controls do not map to keys, such as Tee's aim.
- The platform keeps today's caps: 16 KiB per message and 120 messages per second per socket.

### 3.3 Example: Community Grove

```json
{
  "protocol": "va-game/1",
  "id": "community-grove",
  "name": "Community Grove",
  "description": "Grow a shared illustrated grove. Chat: !plant 1–6, !water 1–6, !sun. …",
  "world": { "w": 1280, "h": 720 },
  "tickRate": 30,
  "seats": { "player": 24, "spectator": null, "streamer": 1 },
  "input": { "keys": ["left", "right", "a", "d", "space"], "pointer": true },
  "chat": {
    "commands": [
      { "name": "plant", "args": [{ "int": [1, 6] }], "who": "anyone", "perActorMs": 1000 },
      { "name": "water", "args": [{ "int": [1, 6] }], "who": "anyone", "perActorMs": 1000 },
      { "name": "sun", "args": [], "who": "anyone", "perActorMs": 2000 }
    ],
    "bursts": [
      { "name": "sun", "token": "☀", "distinct": 3, "windowMs": 5000 },
      { "name": "rain", "token": "🌧", "distinct": 3, "windowMs": 5000 }
    ]
  },
  "delivery": ["A"],
  "resources": ["kenney-…"],
  "rounds": false
}
```

The seat maximums and rate values are placeholders for the review; today Grove has no seat limit and relies only on the generic chat gate.

### 3.4 Where the manifest lives

- **SDK games** export it from `game.js`: `export const manifest = {…}`, next to `meta`. One file keeps one hash, so the existing exact-hash approval, quarantine and credits flow covers the manifest too. The platform reads it the same way it reads `meta` today: serialized inside the guest under the 50 ms deadline and parsed outside.
- **Native games** cannot be edited by the platform, so their manifest is a reviewed JSON entry in the platform's game configuration, bound to the runtime's `version` (image digest and source pin). A changed runtime needs a new review.
- **Legacy SDK games** (no `manifest` export) get a **derived manifest**: all SDK keys, pointer on, `seats` without game limits, `chat` in passthrough mode (every `!command` not handled by the platform goes to `onChat`, behind the generic chat gate, exactly as today), `delivery: ["A"]`. The bundled games run this way until the owner approves editing them.

### 3.5 Validation

The platform validates the manifest when the game becomes ready (4.2) and refuses to start a game whose manifest:
- does not parse, exceeds 16 KiB or has unknown top-level fields;
- declares a key, delivery mode or seat type the platform does not know;
- lists a resource that is not in the approved resource manifest for this version;
- has a `version` that does not match what the platform loaded.

## 4. Control channel

### 4.1 Transport and framing

- Every message is one JSON object with a `t` field. The same messages travel over every transport:
  - **local runtime (today):** JSON lines over the sandbox's stdin and stdout, as `src/game-worker.js` does now;
  - **VM3 (phase 4):** one WebSocket that the game VM opens **outbound** to the funnel. The VM opens no ports.
- **Native games** keep their own wire protocol. A platform-side adapter translates it (section 8).
- Size limits per message: 300 KiB platform → game (the current input limit, needed for `load`); 16 KiB for game control messages; frames keep their current 512 KiB view limit.

### 4.2 Handshake and versions

```
platform → game  {"t":"hello","protocol":["va-game/1"],"room":"<room id>","limits":{…}}
game → platform  {"t":"ready","protocol":"va-game/1","manifest":{…},"view":{…}}
```

- The platform lists the versions it speaks. The game answers with exactly one of them. No common version means the game is refused.
- `limits` repeats the platform's caps (frame size, tick rate cap, message rates) so a game can adapt. They are informative; the platform enforces them anyway.
- `ready` must arrive within the load deadline (2.5 s today for the local runtime). The `view` is the first mode A frame.
- For SDK games, `load` (the source) comes before `hello`, as today. It is a local-runtime detail, not part of the game-facing contract.

### 4.3 Platform → game

| `t` | Fields | Meaning |
|---|---|---|
| `join` | `seat: {id, type, name, platform, verified, role}` | A viewer took a seat. `id` is opaque and stable for the room. Repeated `join` for the same `id` (for example after a game reload) replaces the previous one. |
| `leave` | `seat: {id}`, `reason` | The seat is gone (`closed`, `replaced`, `revoked`, `kicked`). |
| `input` | `seat`, `seq`, `data` | Mode A input that passed the schema. `seq` increases per seat. |
| `effect` | `name`, `args`, `actor: {name, platform}` | A declared chat command or a completed crowd burst. `args` are already parsed and in bounds. |
| `chat` | `actor`, `cmd`, `args` | Legacy passthrough only (derived manifests). |
| `pause` / `resume` | `reason` | Game time stops: no ticks, no input, no effects. Used for the waiting room and for the streamer's pause. |
| `stop` | `reason` | The platform is about to end the game. The game may send a final `round`. |

For SDK games the adapter maps these to today's exports: `onJoin`, `onLeave`, `onInput`, `onChat` and, for effects, a new optional `onEffect(state, name, args, actor)`. A game without `onEffect` receives effects through `onChat`, so declared commands work with today's games.

### 4.4 Game → platform

| `t` | Fields | Meaning |
|---|---|---|
| `ready` | see 4.2 | Once. |
| `frame` | `view` | Mode A display list (section 7). |
| `health` | `tick`, `players` | At least once per second. Mode A frames count as health too. |
| `round` | `phase: "start" \| "end"`, `results?: [{seat, score, place}]` | Only if the manifest says `rounds: true`. `results` reference seat ids the game was given; others are a protocol error. |
| `failure` | `code`, `message` | The game gives up. `message` is capped at 500 characters and shown only to the owner, never to viewers. |

### 4.5 Lifecycle

```
loading ──ready──▶ running ◀──resume── paused
   │                  │  └──pause──▶ paused
   │                  └──stop / failure / watchdog──▶ ended
   └──deadline / bad manifest──▶ ended
```

- Seats can join and leave in `running` and `paused`. Input and effects are dropped while `paused`.
- `ended` is final. A reload is a new game instance with a new `hello`, and the platform re-sends `join` for every seat.

### 4.6 Failures and watchdogs

Any of these ends the game and starts the existing fallback (`src/server/game-lifecycle.js`):
- no `ready` by the load deadline;
- no `frame` or `health` for 1 s (the current frame watchdog);
- a protocol error (rule 4 in section 2) or a message over its size limit;
- a `failure` message;
- the runtime process or connection exits.

The game's own text is never forwarded to viewers. Viewers see "Game stopped" and the fallback notice, as today.

## 5. Seats and tokens

- **Mode A.** The platform (later the funnel) verifies the seat token from [IDENTITY_SEATS](IDENTITY_SEATS.md) and sends `join`. The game never sees the token.
- **Mode B** (the game's own client, such as Tee). **Not in v1.** In v1, Tee individual play stays as today: a display name in a sandboxed frame, with no platform seat. The planned design for v1.1, which needs a change in the teeworlds-rs repository:
  - the platform hands the tab a seat token with two new claims: `aud` = the game `id` and `kid` = the signing key id;
  - the game server verifies it with the platform's **public** key, which it receives in its configuration. It can verify seats but cannot mint them, which is why Ed25519 was chosen in phase 2;
  - single use and revocation stay on the platform. The game server reports each redeemed `jti` back over the control channel (`{"t":"seat-used","jti":…}`), so a reused token still revokes the identity.
- Seat maximums come from the manifest. When a type is full, the platform offers a spectator seat instead.

## 6. Chat effects

- A declared command has a `name`, typed `args` (`int` with bounds, `enum` with values, or `text` with a maximum length), `who` (`anyone`, `moderator`, `broadcaster`) and a per-actor interval `perActorMs`. An optional `globalPerSec` caps the whole channel for that command.
- The platform parses chat, checks `who` against the platform roles of that message (IRC tags or the signed Kick payload, never a name), applies the limits and sends one `effect`. Commands that fail any check are dropped silently, as today.
- For a game with a manifest, a command it did not declare is dropped. Only legacy games with a derived manifest receive undeclared commands through `chat`.
- Platform commands (`!join` and its aliases, `!idea`, `!vote`, `!build`, `!predict`, `!prediction`, `!fallback`, `!tee`, `!delegate`) always win and cannot be declared by a game. `!tee on|off|status` stay platform controls; `!tee <action>` is routed by the platform to the Tee session as the declared command `<action>` — and Kick viewers may drive the collective tee alongside Twitch.
- **Crowd bursts** generalize the hard-coded Grove bonus in `src/server/chat-commands.js`: a burst fires when `distinct` different platform identities post its `token` within `windowMs`, and the game receives `effect {name, args: [], actor: null}`. Web identities never count, as today.
- The streamer's chat-effects pause blocks every `effect` and `chat` message at the platform. The game does not need to know.

## 7. Data plane

- **Mode A.** The game sends full views in `frame`, exactly as `view()` returns today. The platform compacts, diffs and encodes them once for all viewers (`b1`, `d1` or `full`) as described in [MODE_A_FRAMES](MODE_A_FRAMES.md). Optional primitive `id`s keep their meaning. Nothing in the browser format changes in v1.
- When the game runs in VM3, the frames go to the funnel, which does the compaction and fan-out. Sending deltas from the VM to the funnel is a possible later optimization; it does not change this contract.
- **Mode B.** No frames pass through the platform. The game's own client connects to the game server, sandboxed as in `public/tee-play.js`.
- **Mode C.** Video from the game VM (phase 5). The control channel is the same.

## 8. Adapters

An adapter connects one kind of game to the control channel. The platform holds a registry of adapters instead of the hard-coded `t99`/`tee` checks in `src/remote-games.js`.

```js
adapter.legacyManifest   // boolean: may answer ready.manifest === null (SDK games); false for others
adapter.start({ onMessage(line /* string */), onExit(info) }) -> Promise<{ send(message /* object */), stop() }>
```

The manifest arrives in the `ready` message and health arrives as `health` messages — the earlier `manifest(entry)` and `health()` hooks are gone.

In order:
1. **SDK.** Wraps the isolated runtime. The worker's IPC (`load`, `start`, `call` / `ready`, `frame`, `failure`) becomes the v1 messages. Derived manifests cover the bundled games.
2. **Tee.** Built on the pinned postcard codec (`src/tee-protocol.js`, `teeworlds-rs/172cfef`):
   - manifest from reviewed config: `delivery: ["B"]`, no platform seats, and the existing `!tee left|right|jump|hook|fire|stop` commands as declared effects with today's limits. The Tee server keeps enforcing its own player maximum;
   - `effect` drives the collective chat tee that `src/tee-chat-bridge.js` runs today;
   - `health` comes from `/healthz` and the bridge's snapshots; `pause` stops the chat pulses;
   - individual platform seats are v1.1 (section 5).

The registry is `REMOTE_ADAPTERS` in `src/protocol/adapters/index.js`; `src/remote-games.js` asks it for `chatControl`, `healthPath` and `checkHealth` instead of hard-coding adapters. **t99 is not a v1 adapter** because of the unresolved rights question in [REMOTE_GAMES](REMOTE_GAMES.md): it sits outside the registry with its own code in `src/remote-games.js`, unchanged, and can be ported once that question is resolved.

## 9. Conformance tests

One suite, `test/protocol-conformance.mjs`, runs the same cases against every adapter, with fixtures where a real runtime is not available:
- **Handshake:** a common version is chosen; no common version is refused; `ready` after the deadline fails.
- **Manifest:** a valid manifest is accepted; oversized, unknown fields, unknown keys, foreign resources and a mismatched `version` are refused; a legacy game gets the derived manifest.
- **Seats:** `join`/`leave` reach the game with only the allowed fields; seat maximums are enforced; a repeated `join` after reload replaces the seat.
- **Input:** keys outside the schema, out-of-bounds actions and over-rate messages never reach the game.
- **Effects:** a declared command reaches the game once with parsed args; wrong role, bad args and over-rate are dropped; platform commands cannot be shadowed; a burst needs distinct platform identities.
- **Pause:** no ticks, input or effects while paused; resume continues.
- **Health and failure:** a silent game, a malformed message, an oversized message, an unknown `t` and a `failure` each end the game and trigger fallback; the game's text never reaches viewers.
- **Rounds:** results that name unknown seats are refused.
- **Undeclared commands:** a game with a manifest never receives a command it did not declare; a legacy game still does.
- **Tee (v1):** health, declared `!tee` effects with their limits, and pause through the adapter. Mode B token checks join the suite in v1.1.

## 10. Compatibility and migration

- Bundled games run unchanged with derived manifests. Their hashes do not change in v1.
- When the owner approves editing a bundled game, its manifest export and the phase 1 primitive ids can go in the same reviewed change. Grove's crowd bonus would then move from the hard-coded check to a declared burst.
- `src/sdk-prompt.md` asks generated games for `export const manifest` and, optionally, `onEffect`. Quarantine review shows the manifest next to the code.
- The browser client, frame formats and seat pairing do not change.

## 11. Implementation plan

Each step is its own commit with tests, and `npm test` runs before every commit.
1. `src/protocol/` validators for the manifest and every message, with the derived manifest for legacy games.
2. The conformance suite with a fixture adapter.
3. The SDK adapter: worker IPC moves to v1 messages; platform-side input, seat and chat checks from the manifest; `onEffect`.
4. Crowd bursts as declared effects for games with a manifest. The hard-coded Grove check stays until Grove gets its reviewed manifest, so its bonus keeps working.
5. The Tee adapter on the pinned codec; the bridge becomes its effect handler.
6. The adapter registry in `src/remote-games.js` for `sdk` and `tee`; the t99 code stays outside it.
7. `src/sdk-prompt.md` and the quarantine view show the manifest.

## 12. Owner decisions (2026-11-06)

1. **An SDK game's manifest lives in `game.js`** as `export const manifest`, so one hash covers code and manifest. No separate `manifest.json`.
2. **The bundled games keep derived manifests in v1.** Their hashes do not change. Each one can later get one reviewed change that adds its manifest and the phase 1 ids.
3. **t99 is out of v1** until its rights question is resolved.
4. **Tee individual seats move to v1.1.** v1 ships the collective chat tee and health through the adapter; individual play stays as today. v1.1 needs the teeworlds-rs change in section 5.
5. **Undeclared chat commands are dropped** for games with a manifest. Only legacy games receive them through `chat`.
