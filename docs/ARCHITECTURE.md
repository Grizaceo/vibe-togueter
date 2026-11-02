# Architecture

Vibe Arena has one Node controller, browser player/OBS/Studio clients, and disposable execution environments. The controller owns identity, decisions, credits and recovery. Game code supplies bounded state and drawing primitives.

| Boundary | Modules and responsibility |
| --- | --- |
| Public network → controller | `server.js` serves HTTP/WebSocket and wires the session. `request-boundaries.js` checks secrets and static-path containment; `traffic.js` bounds chat, frames and socket backlog. Public clients never gain owner authority from display names. |
| Twitch → community/game | `auth/twitch.js`, `chat/twitch.js` and `twitch-events.js` validate OAuth, reconnect tagged IRC and verify event delivery. Trusted broadcaster/moderator tags authorize session controls. `chat-effects.js`, `chat-predictions.js` and `crowd-bursts.js` keep their own bounded session state. |
| Community → approved inputs | `idea-rounds.js` journals proposals, ballots, selections and exact review tokens. `creator-assets.js` and `curated-resources.js` preserve licenses and resource fingerprints. `approval-delegation.js` grants only temporary round-input approval. |
| Controller → reviewed local game | `isolated-gamehost.js` launches `game-worker.js` through Linux bubblewrap. `gamehost.js` runs the SDK inside that child, with callback deadlines and bounded serialization. The child has no controller credentials, home mount or network. `fallback-policy.js` restricts recovery to verified bundled games. |
| Approved inputs → external construction | `studio-builds.js` journals a single authorized job. `createos-studio-worker.js`, `vm-builder-preflight.js`, `builder-warm-sessions.js` and `builder-lease-control.js` manage separate cloud guests, private login and finite leases. Cleanup supervision is armed before creation. Provider uncertainty requires reconciliation. Both worker and preparation ship off. |
| Candidate → exact artifact review | `build-quarantine.js` keeps source inert, binds reports to source/input/resource hashes and requires exact owner approval. Build and test guests are distinct. Approval stores reviewed evidence; it does not start a runtime. |
| Actual version → visible attribution | `contributor-credits.js` and `game-credits.js` verify bundled/publication fingerprints. Browser `live-credits.js` renders the controller's version-matched game/art/idea credits outside game drawing; mismatches invalidate attribution. |
| External games | `remote-games.js`, `tee-chat-bridge.js` and `tee-protocol.js` provide specific adapters. The shipped catalog is empty. The general manifest/trust-tier adapter and generated-game runtime VM remain planned. |

## An idea's path

1. A viewer sends `!idea`; a round stores it as bounded untrusted content. Ballots update the voter's latest choice.
2. The streamer selects ideas and reviewed resources, inspects the current review token, then approves that exact snapshot. Input changes invalidate stale review.
3. A separately authorized run verifies the assigned build guest and fresh login. Codex receives the approved task as data; candidate source returns as inert text.
4. A distinct isolated test VM checks the candidate. Reports, source hashes and cleanup observations are retained. An observation timeout does not authorize a replacement guest.
5. The owner reviews the exact source/report/credit combination and approves that artifact hash. It stays in quarantine as reviewed evidence until a separate runtime exists.

Reviewed bundled games use the current Linux process-isolation path. Their watchdog can switch to the owner's verified fallback order while retaining connected players. This live demo path is separate from generated artifacts. Lantern Table proves real construction, distinct-VM protocol testing and exact review; its preview is static and the original approved bytes remain unchanged.

## Storage and remaining seams

`runtime/` holds controller leases, durable rounds, creator/publication records, quarantine and build journals. Keep it on persistent storage, with private backups and an operator retention/deletion procedure. Session-only controls such as predictions and delegated approval reset on restart; feed history is bounded memory. `artifacts/` holds inert evidence and is never a candidate deployment directory.

`server.js` still composes HTTP routes, Twitch effects and room lifecycle. Moving those boundaries into more files is deferred until each extraction can be independently verified; formatting and removing proven dead code take priority before the freeze. Treasury/event-credit accounting is simulated, with no payment settlement.
