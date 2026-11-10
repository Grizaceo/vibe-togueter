# VM3 game runtime and the funnel (phase 4)

Status: **plan, written 2026-11-10 before the code**, as the roadmap asks. It
implements roadmap phase 4 ("VM3 game runtime") and the November 4 owner
decisions recorded in [SESSION_FLOW](SESSION_FLOW.md) and
[HOSTING_POLICY](HOSTING_POLICY.md). The game protocol contract stays
[GAME_PROTOCOL](GAME_PROTOCOL.md); this document adds the runtime and network
edge around it.

## 1. What phase 4 must deliver

- One game VM (VM3) per session, on two interchangeable backends: a local VM
  (QEMU/KVM through libvirt, for self-hosting) and the cloud (CreateOS).
- Browsers connect **to the funnel, never to VM3**: a fixed public URL, the
  seat token on the first stream, and the viewer IP never reaches the VM.
- On every game change VM3 returns to a clean image; players wait in the
  funnel-hosted waiting room.
- A streamer button or the watchdog returns VM3 to the default-game image.
- Provider pause is only a cost fuse: a paused VM is **never resumed**; on
  session close every VM is destroyed and confirmed gone at the provider;
  only a filtered session log remains.
- **Done when:** Grove runs in VM3 on both backends, with no game code on the
  host. SDK games enter through `va-game/1` (the worker runs inside the VM);
  Tee keeps its existing adapter.

## 2. Topology

Three zones, per the owner decisions. Only the funnel is public.

```
                 ┌──────────────── VAULT ────────────────────────────────┐
                 │ controller (this repo's src/server.js)               │
                 │  · SeatAuthority — the only signer (ed25519 private)  │
                 │  · Pairings, chat pipeline, chat commands             │
                 │  · GameSession — va-game/1 engine, unchanged          │
                 │  · Vm3Manager — VM lifecycle, journal, filtered log  │
                 └──────▲───────────────────────────────────▲────────────┘
            control WS  │ (per-session vault token)        │ artifact data
        ┌───────────────┴───────────┐                     │ (phase 6)
        │          FUNNEL            │                     │
        │  lobby · waiting room      │                     │
        │  viewer WS: seat verify    │                     │
        │    (public key only)       │                     │
        │  frame/input relay         │                     │
        │  signed Kick webhooks      │                     │
        └───▲───────────────▲────────┘                     │
   viewer WS│               │ game WS (outbound only)     │
  (seat=1,  │               │                             │
   frames)  │        ┌──────┴────────── VM3 ──────────┐    │
            │        │ guest agent (platform code)   │◀───┘ load/artifact
            │        │  └─ node game-worker.js       │
            │        │     + untrusted game.js       │
            │        │     inside the VM only        │
            │        └───────────────────────────────┘
```

- **Vault** keeps every secret and every decision: seat signing, pairing,
  chat identity, manifest validation, seat caps, input schema checks,
  fallback policy, journals. It has no public ports.
- **Funnel** is the public door. It terminates viewer WebSockets, verifies
  seat tokens with the **public** key only (it can verify, never mint),
  relays frames to viewers and input to the vault, verifies Kick webhook
  signatures and forwards the verified event, and serves the lobby and
  waiting room. It holds no private key, no chat credential and no game
  state beyond the current room's transport state.
- **VM3** runs the guest agent (platform code baked into the image) plus the
  game worker and the untrusted game inside the VM. It opens **one outbound
  WebSocket** to the funnel and no ports. It holds no platform secret: the
  per-VM game token it presents only authorizes "attach as the game of room
  R until T".

### 2.1 Connections

| Leg | Direction | Auth | Carries |
|---|---|---|---|
| viewer → funnel | inbound WSS | seat token + `cnf.jkt` proof, verified at the edge | seat handshake, input, web chat, resync |
| game agent → funnel | **outbound** WSS from inside VM3 | per-VM game token (room-scoped, expiring, single room) | `va-game/1` game→platform lines; receives platform→game messages |
| vault → funnel | outbound WSS from controller | per-session vault token | platform→game relay, viewer events, room state, seat revocations, Kick events |
| funnel → viewers | downstream WSS | — | `welcome`, `seat`, `state` frames (mode A codec), `waiting`, `feed` |

The viewer IP terminates at the funnel. Messages the funnel forwards toward
the game or the vault are rebuilt from protocol fields; no socket address,
header or proof material crosses.

### 2.2 Message flows

**Seat (mode A).** The funnel sends `{t:"challenge", n, room}` on connect.
The viewer answers `{t:"hello", seat, proof}`. The funnel verifies signature,
room, expiry, `cnf.jkt` proof and its own single-use ledger, then reports
`{t:"viewer-seat", vid, claims}` to the vault. The vault — which owns
`SeatAuthority` — re-checks the claims shape, applies one-seat-per-identity
replacement and issues the resume token, answering `{t:"to-viewer", vid,
{t:"seat", ok, identity, resume}}`. Pairing (`pair`/`guest`) and `unseat`
ride the same channel: the vault's `Pairings` store is unchanged; only the
transport to the waiting tab changed (funnel `vid` instead of a local
socket).

**Input.** Viewer `{t:"input", data}` → funnel → vault
`{t:"viewer-msg", vid, m}` → `GameSession.input(vid, data)` (manifest schema
check, per-seat `seq`) → `{t:"to-game", msg}` → funnel → game WS. Input is
checked by the vault before it reaches the game, per protocol rule 3. A
funnel-side fast path (manifest synced to the edge) is a documented
optimization, not v1 of this phase.

**Frames.** Game `frame` messages fan out at the funnel: compacted once
(`compactState`), diffed/encoded once per format (`FrameStream`, `b1`/`d1`),
sent to each viewer with `sendRoom` backpressure — the same pipeline as
`src/server/broadcast.js` today. The funnel envelopes each frame as
`{t:"state", view, players, ...roomState}` where `players` is the seated
viewer list and `roomState` is pushed by the vault (game name, activity,
fallback, fund). `frame` payloads do **not** cross to the vault; the funnel
reports throttled `{t:"game-liveness"}` so the vault's health watchdog still
sees the game alive. `ready`, `health`, `round` and `failure` are forwarded
to the vault verbatim for `GameSession` validation.

**Game control.** `GameSession` in the vault drives the game through
`Vm3Link`, an adapter that implements the existing adapter interface
(`start({onMessage,onExit}) → {send,stop}`) over the vault↔funnel channel.
`hello`, `join`, `leave`, `input`, `effect`, `chat`, `pause`, `resume`,
`stop` travel as `{t:"to-game", msg}`; game lines return as
`{t:"from-game", line}`.

**Kick webhooks.** The funnel accepts `POST /webhook/kick`, runs the existing
`verifyKickWebhook` + `KickDeliveries` checks, and forwards the verified
event to the vault as `{t:"kick-event", body}`. The vault runs the unchanged
chat pipeline. (Whether Kick webhooks should instead keep hitting the vault
directly is an open question, §8.)

**Waiting room.** While VM3 resets or the game is down, the vault pushes
`{t:"room", msg:{t:"waiting", state}}`; the funnel stores it per room,
broadcasts it to viewers and serves it on the play page (predictions, votes
and countdown are vault state relayed as data — the funnel renders, it does
not decide).

## 3. The runtime interface

A backend owns VM lifecycle only. It never sees game protocol traffic — the
guest agent inside the VM owns that.

```js
backend = {
  name: "libvirt" | "createos",
  // Provision a VM from a clean image. agent describes how the guest agent
  // reaches the funnel: { funnelUrl, room, token, env? }. Returns a handle.
  async create({ name, image, agent }) -> vm,
  async status(vm) -> "running" | "paused" | "destroyed" | "missing" | ...,
  // Clean reset: destroy and recreate from the same image template. A plain
  // restart does not count as a reset (owner decision D2).
  async reset(vm, { image, agent }) -> vm,
  // Destroy and verify the provider's terminal state. Idempotent.
  async destroy(vm) -> { confirmed: true, terminalStatus },
  // Cost fuse only. There is deliberately no resume().
  async pause(vm),
}
```

An **image spec** is what a reset restores: `{ ref, agent }` where `ref`
identifies the backend's clean template (a libvirt template/domain+backing
image, or a CreateOS rootfs/shape pair) and `agent` carries the per-incarnation
funnel credentials. How the approved game artifact reaches the VM is phase 6;
this phase defines only the channel — the `load` message (source, ≤256 KiB,
as today) or an image-baked payload — and marks artifact bundles as the phase
6 replacement.

`GameVmManager` (`src/vm3/manager.js`) is the vault-side owner of the single
VM3:

- `open()` provisions the default image and waits for the agent attach.
- `loadGame(spec)` performs a clean reset (destroy + create) unless the VM is
  already on that exact fresh incarnation, then starts a `GameSession`
  through `Vm3Link`.
- `fallback()` (streamer button or watchdog) resets to the default image and
  game; viewers sit in the funnel waiting room meanwhile.
- `close()` (session end or cap expiry) stops the session, destroys the VM,
  confirms the terminal state at the provider, and keeps only the filtered
  log.
- A backend `status()` of `paused` triggers destroy, never resume.
- Every transition is journaled to `runtime/gamevm-<room>.json` (atomic
  writes, 0600) and mirrored to a filtered event list: events, hashes,
  decisions, costs — never secrets, raw VM output, viewer IPs or tokens.

## 4. Backends

### 4.1 Local — QEMU/KVM via libvirt (`src/vm3/libvirt.js`)

Self-hosting backend. The host needs `/dev/kvm`, libvirt and a prepared
template: a base disk image plus a domain XML template. A "clean image" is a
fresh overlay disk backed by the template — reset destroys the domain,
deletes the overlay and recreates it. All provider calls go through `virsh`
via an injected runner (tests fake it; no real libvirt in `npm test`).

Guest→funnel connectivity uses the libvirt NAT/slirp network or a dedicated
isolated libvirt network whose only route is to the funnel address; egress
restriction is a host iptables/ebtables concern documented as a deployment
requirement, not something the backend can prove. The agent endpoint for a
local deployment is typically the funnel on the same host
(`ws://<host>:<port>`), which is also the accepted transition topology
(D13).

### 4.2 Cloud — CreateOS (`src/vm3/createos.js`)

Follows the `vm-builder-preflight.js` patterns: injected `run("createos",
args)`, journaled state machine, ownership checks before any destructive
operation, confirmed-destroy polling, raw provider output never retained
(sizes + sha256 only). Creation uses a fixed game-VM profile: shape/rootfs
from config, `--auto-pause` as the cost fuse, and an egress allowlist
containing only the funnel host (plus nothing else — the game VM needs no
internet). A `paused` observation routes to destroy, never `sandbox resume`.

## 5. What is reused unchanged

- `src/protocol/session.js` `GameSession` — the whole state machine. One
  addition: `noteLiveness()`, a transport-level heartbeat for frames that
  fan out at the funnel without crossing the vault.
- `src/seats.js` — `SeatAuthority` keeps signing; `verifyProof`,
  `proofMessage`, `jwkThumbprint` are reused by the funnel's verify-only
  `SeatVerifier`.
- `src/server/pairing.js` `Pairings` — unchanged; its `owner` becomes the
  vault-side viewer record.
- `src/chat/kick-webhook.js` — signature and replay checks, reused at the
  funnel edge.
- `src/traffic.js` + `src/server/frame-stream.js` — compaction, diffing,
  `b1`/`d1` encoding and backpressure, reused for funnel fan-out.
- `public/frame-codec.js`, `public/render.js`, `public/interpolate.js`,
  `public/seat.js` — served by the funnel for its play page; platform code,
  not game code.
- `src/game-worker.js` + `src/gamehost.js` — run **inside** VM3 under the
  guest agent, exactly as under `SdkAdapter` today.

## 6. The guest agent (`src/vm3/guest-agent.js`)

Baked into the VM image. It is the only platform code that talks to the
funnel on the game leg:

1. Reads its config (funnel URL, room, game token) from the environment the
   backend injected at provision time.
2. Opens the outbound WebSocket to `/ws/game?room=…&token=…`.
3. Optionally receives `{t:"load", source}` first (the adapter-local detail,
   same as `SdkAdapter`'s `op:"load"` today), then bridges JSON lines between
   the socket and a child `node game-worker.js` process.
4. On socket close or `stop`, kills the child and exits; a VM reset means a
   new agent incarnation with a new token.

The agent is trusted platform code; the game inside the worker remains
untrusted and is never evaluated on the vault or the funnel.

## 7. Failure and lifecycle rules (from the owner decisions)

- **Clean reset (D2).** Every game change destroys and recreates VM3 from the
  image template. `Vm3Manager.loadGame` never reuses a dirty VM; a restart
  without a fresh image does not count.
- **Waiting room (D7).** During reset and approved-hash waits, viewers stay
  connected to the funnel and see the waiting state; no game code runs on
  the host at any point.
- **Fallback (D8).** Streamer button or watchdog → waiting room → VM3 reset
  to the default image/game. The repaired-hash flow is phase 6; the trigger
  surface (`fallback()`) exists now.
- **Pause fuse (D9).** `status() === "paused"` → destroy. There is no resume
  path in either backend.
- **Close (D10).** `close()` stops the game session, destroys the VM,
  confirms `destroyed` at the provider (same polling discipline as
  `vm-builder-preflight`), and writes only the filtered log.
- **Filtered log (D11).** Journal fields are an allowlist: timestamps,
  phases, image refs, provider ids, artifact hashes, decisions, cost
  counters. Never: secrets, tokens, raw stdout/stderr, viewer IPs, seat
  tokens, chat text.

## 8. Open questions for the owner

1. **Funnel deployment.** Default per D13 is a small VPS near the game VMs
   with a fixed URL. The accepted transition is a separate process/user on
   the vault host. `src/funnel/` is written to run standalone (`node
   src/funnel/index.js`) or embedded; which ships first is a deployment
   decision. Edge alternative (Cloudflare Workers + Durable Objects) remains
   unevaluated, including WebTransport support.
2. **Base images.** QEMU needs a prepared template (OS, node, agent,
   `game-worker.js`/`gamehost.js`, `ws`-free WebSocket client). CreateOS needs
   a `va-game` rootfs/shape. Both are build artifacts to be produced and
   reviewed; this phase defines the interface, not the images.
3. **Artifact delivery.** Phase 6 owns the approved-artifact pipeline
   (VM1→VM2→VM3). This phase exposes only the channel: the `load` message
   (source text, today's limit) or an image-baked payload ref. Whether the
   funnel or the vault pushes it, and its signature/verification, is a phase
   6 decision — flagged here so the interface does not preclude it.
4. **Tee in VM3.** The session flow envisions teeworlds-rs as the waiting
   game inside VM3, but Tee is mode B: its WSS would have to be relayed by
   the funnel (phase 7 policy). This phase keeps Tee on its existing remote
   adapter; "Grove in VM3" is the done-when. Whether the waiting game moves
   into VM3 before mode B relay exists is an owner call.
5. **Kick webhooks.** The funnel verifies and forwards them (D12 lists
   webhook reception at the funnel). If the vault's public ingress already
   terminates Kick reliably, forwarding adds a hop; keeping verification at
   the edge matches the three-zone rule either way.
6. **Input fast path.** Viewer input currently crosses viewer→funnel→vault→
   funnel→VM. If measured latency requires it, the funnel can hold a synced
   manifest copy and validate input at the edge; the vault remains the
   authority for seats and effects.

## 9. Implementation slices

Each slice lands with `node:test` coverage and `npm test` + `vitrina check`
before commit; provider calls are always injected fakes.

1. `src/vm3/runtime.js` contract + `src/vm3/manager.js` lifecycle and
   journal, against an in-memory fake backend.
2. `src/vm3/libvirt.js` — virsh backend, fake runner.
3. `src/vm3/createos.js` — CreateOS backend, fake CLI.
4. `src/funnel/` — viewer/game/platform endpoints, seat verification,
   frame fan-out, waiting room, Kick forward.
5. `src/vm3/channel.js` + `src/vm3/link.js` + `src/vm3/guest-agent.js` —
   the vault↔funnel channel, the `GameSession` adapter and the in-VM agent.
6. Conformance: the protocol suite's key cases driven through
   funnel + guest agent + fixture game — "Grove in VM3" with fakes.
