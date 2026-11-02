# Architecture

Vibe Arena has one Node controller, browser player/OBS/Studio clients, and disposable execution environments. The controller owns identity, decisions, credits and recovery. Game code supplies bounded state and drawing primitives.

| Boundary | Modules and responsibility |
| --- | --- |
| Public network → controller | `server.js` wires the session; `server/routes/public.js`, `server/routes/admin.js` and `server/routes/webhooks.js` own HTTP boundaries; `server/broadcast.js` owns WebSocket identity/input, activity and fan-out. `request-boundaries.js` checks secrets and static-path containment; `traffic.js` bounds chat, frames and socket backlog. Public clients never gain owner authority from display names. |
| Twitch → community/game | `auth/twitch.js`, `chat/twitch.js` and `twitch-events.js` validate OAuth, reconnect tagged IRC and verify event delivery. Trusted broadcaster/moderator tags authorize session controls. `chat-effects.js`, `chat-predictions.js` and `crowd-bursts.js` keep their own bounded session state. |
| Community → approved inputs | `idea-rounds.js` journals proposals, ballots, selections and exact review tokens. `creator-assets.js` and `curated-resources.js` preserve licenses and resource fingerprints. `approval-delegation.js` grants only temporary round-input approval. |
| Controller → reviewed local game | `isolated-gamehost.js` launches `game-worker.js` through Linux bubblewrap. `gamehost.js` runs the SDK inside that child, with callback deadlines and bounded serialization. The child has no controller credentials, home mount or network. `fallback-policy.js` restricts recovery to verified bundled games. |
| Approved inputs → external construction | `studio-builds.js` journals a single authorized job. `createos-studio-worker.js` delegates to `studio-worker/provider.js`, `build.js`, `test.js` and `cleanup.js`; `vm-builder-preflight.js`, `builder-warm-sessions.js` and `builder-lease-control.js` manage separate cloud guests, private login and finite leases. Cleanup supervision is armed before creation. Provider uncertainty requires reconciliation. Both worker and preparation ship off. |
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

`server.js` now contains composition only. HTTP/WS messages, configuration and runtime journal formats retain the frozen submission behavior. Treasury/event-credit accounting remains simulated, with no payment settlement.

## Composition map on develop

| Area | Entry and responsibility |
| --- | --- |
| Configuration and process lifecycle | [server/config.js](../src/server/config.js) acquires the controller lock before environment/config loading and resolves repository paths. [server/bootstrap.js](../src/server/bootstrap.js) listens and installs the existing supervised signal shutdown. |
| HTTP | [routes/public.js](../src/server/routes/public.js) owns community views/proposals and contained static delivery. [routes/admin.js](../src/server/routes/admin.js) keeps all admin routes with the single shared authorization calculation, forwarded-request rejection and each original per-operation streamer check. [routes/webhooks.js](../src/server/routes/webhooks.js) owns Kick signatures, Twitch deduplication/rewards and opt-in simulated donation/event credit. |
| Room and activity | [broadcast.js](../src/server/broadcast.js) owns bounded feed history, 10 Hz state, compression/backpressure, WebSocket joins, input limits and private streamer claims. [chat-commands.js](../src/server/chat-commands.js) owns chat admission, ideas/votes, predictions, delegation, fallback/pause and Tee commands. [platform-chat.js](../src/server/platform-chat.js) connects Twitch/Kick reply transports. |
| Game lifecycle | [game-lifecycle.js](../src/server/game-lifecycle.js) loads/reloads the existing isolated host and performs verified bundled fallback. [publication.js](../src/server/publication.js) maintains source/resource-bound public credits and the filesystem watcher. |
| Construction coordination | [construction.js](../src/server/construction.js) wires durable rounds/quarantine, treasury/generator, Studio jobs and warm sessions; it preserves original recovery, flags, paths and tick registration order. Domain journals remain in their existing modules. |
| Studio | [public/studio.js](../public/studio.js) composes refresh/polling and panel initialization. [rounds](../public/studio/rounds.js), [resources](../public/studio/resources.js), [contributions](../public/studio/contributions.js), [owner](../public/studio/owner.js), [remote games](../public/studio/remote-games.js), [fallback/delegation controls](../public/studio/controls.js) and [worker/prewarm](../public/studio/worker.js) retain their handlers. [shared.js](../public/studio/shared.js) holds live state and DOM helpers; [studio.css](../public/studio.css) contains the original style body. Module functions share refresh through live ES bindings; no event bus or UI framework was introduced. |
| Provider adapter | [createos-studio-worker.js](../src/createos-studio-worker.js) retains authorization, journal persistence, lease readiness and ownership validation. [provider.js](../src/studio-worker/provider.js) wraps CLI observation and bounded managed processes; [build.js](../src/studio-worker/build.js) constructs inert source; [test.js](../src/studio-worker/test.js) tests in a distinct VM; [cleanup.js](../src/studio-worker/cleanup.js) reconciles and confirms destruction. No candidate is evaluated on the controller. |
| Disposable browser verification | [rehearse-ui-local.mjs](../scripts/rehearse-ui-local.mjs) owns temporary setup, receipts and cleanup. [CDP helpers](../scripts/rehearsal/cdp.mjs) and [lobby](../scripts/rehearsal/lobby.mjs), [overlay](../scripts/rehearsal/overlay.mjs), [Studio](../scripts/rehearsal/studio.mjs), [privacy](../scripts/rehearsal/privacy.mjs) scenes preserve all original assertions and scene order. |

The admin gate is a trust boundary, not a route-level privilege inferred from a public name. Provider CLI credentials stay on the operator side; only the explicitly assigned fresh guest authenticates the coding agent. Build/test cleanup leases and durable ownership journals remain authoritative after observation failures. Public activity never includes candidate source, login instructions, approval tokens or voter identities.

See the [platform index](platform/README.md) for current operations versus historical evidence, and the [refactor report](platform/REFACTOR_REPORT.md) for local PRs, verification and retained debt. The submission branch and annotated tag remain frozen through evaluation; develop is a separate local integration branch.
