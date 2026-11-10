# Platform roadmap (post-hackathon)

Work continues on the `main` branch, which was called `next` until 2026-11-03. `develop` (d2edc1e) and the tag `submission-2026-11-02` are the judged state and stay frozen until results are published.

## Principles

- **Session lifecycle (owner decisions, November 4).**
  - The streamer opens a session and chooses **play** (game VM only) or **play and create** (game VM plus builder and review when needed), with a spend and duration cap.
  - One game VM (VM3) per session: it runs the waiting game (e.g. teeworlds-rs) and then the vibe-coded game, returning to a clean image on every change. A plain restart does not count as a reset.
  - The builder (VM1) lives only while it builds. The review VM (VM2) starts with each candidate, runs a fixed no-network harness, and resets to a clean image before re-testing a patch. Whoever changes the code does not sign the result.
  - Builder and review never talk to each other over the network; everything passes through the controller as data.
  - Before a new or repaired game goes live the streamer approves the exact hash (returning to the default game needs no approval); players wait in a funnel-hosted waiting room.
  - Provider pause is only a cost fuse: a paused VM is never resumed. On close, every VM is destroyed and confirmed gone at the provider; only a filtered session log remains.
  - No game code runs on the controller host.
- **Three zones.** The vault (controller, key broker, journals) has no public ports and is reached through a login tunnel, streamer and mods only. The funnel is the public door — lobby, waiting room, frame/input relay, signed Kick webhooks — and holds nothing valuable; by default a small VPS near the game VMs. Untrusted code runs only in VMs: the game VM talks outbound to the funnel; builder and review VMs only reach the key broker. The funnel verifies ed25519 seats with the public key; only the vault signs them.
- **Community fund.** Donations go to the streamer; provider accounts and keys are the streamer's and live encrypted in the vault. The platform keeps the ledger, per-purpose reserves, caps and receipts, and never holds money. The key broker hands out per-session capped tokens; the key never enters a VM.
- **Viewers only receive the game.** Nothing from the game executes on a viewer's PC.
- **Delivery modes:**

  | Mode | What reaches the browser | Policy |
  |---|---|---|
  | A. Display list | Primitives drawn by the platform's own renderer | Default |
  | C. Pixel stream | Video only (e.g. voxl instead of noVNC) | Used when A fails or is unavailable |
  | B. Game's own client | The game's WASM | Opt-in only, at each viewer's own risk |

- **Self-hosting.** A streamer may host a certified game on their own PC and accept external connections at their own risk. The recommendation is a local VM, not a container. See [HOSTING_POLICY](platform/HOSTING_POLICY.md).
- **Latency target.** The latency that matters is runtime delivery, from the game to each browser's frame. Planning and voting may take as long as they need.

## Phases

The order follows dependencies:
- The protocol needs identity, because it has to know who takes each seat.
- VM3 needs the protocol to talk to the controller.
- Mode C runs inside VM3.
- The full pipeline needs all of the above.

### 0. Base on `next` — done (2026-11-03)

- Merge `feat/session-flow-cloudflare-20261102`, which contains tee-vm-trial and tee-demo-contract. A trial merge showed no conflicts. `feat/private-openai-auth-wrapper-20261102` also merges cleanly but stays a separate decision.
- **Public tunnel:** startup creates or detects the tunnel and updates the URL that `!join` returns. A stale `VA_PUBLIC_URL` is never sent.
- **`!join` link:** a link posted in chat must not carry `?name=<requester>`.
- **Done when:** tests pass on `next`, and `!join` returns a live link without someone else's name.
- **Result:**
  - Merged with a merge commit (d7f4f0d).
  - `src/server/public-link.js` verifies `VA_PUBLIC_URL`, detects a running quick tunnel or starts one, and only hands out a URL after a probe through it reaches this controller. `VA_TUNNEL=auto|detect|off`.
  - `!join` says so when no live link exists, and its link carries no name. The entry pages ask each viewer.
  - Covered with simulated tunnels (`test/public-link.mjs`).
  - **Real tunnel check (2026-11-04):** `scripts/public-link-check.mjs` ran against a real `cloudflared` quick tunnel.
    - The first run failed: the tunnel never reached the controller within the 45 s start timeout (`docs/evidence/public-link-real-1793823593588.json`).
    - The start timeout is now 120 s. The second run passed every check: the live link reaches this controller, a stale `VA_PUBLIC_URL` is not used, `!join` says so while the tunnel is down, and the tunnel is recreated with a new link (`docs/evidence/public-link-real-1793824002394.json`). The link went live 43 s after start.

### 1. Measure and improve mode A latency — done (2026-11-03)

- **Current limits:**
  - State is sent at 10 Hz (`src/traffic.js:2`), while games tick at 30 Hz (`src/gamehost.js:74`).
  - The client draws on every message, with no `requestAnimationFrame` and no interpolation (`public/client.js`).
  - Every frame is the full JSON display list, the same for every viewer (`src/server/broadcast.js`).
- **Baseline first:** input-to-frame p50/p99, bytes/s and messages/s per client, with and without simulated delay and loss.
- **Then:**
  - send rate tied to the tick rate;
  - drawing on `requestAnimationFrame` with interpolation, using optional stable `id`s on primitives;
  - deltas by `id`, static layers sent once, and a negotiated binary encoding with JSON as fallback.
- The resulting frame format becomes the data plane of the phase 3 protocol.
- **Done when:** a before/after table from the same reproducible test.
- **Result:**
  - The benchmark is `scripts/latency/bench.mjs`. The before/after table and the decisions are in [MODE_A_FRAMES](platform/MODE_A_FRAMES.md), and the raw runs are `docs/evidence/latency-*.json`.
  - All three steps landed in separate commits: send rate tied to tick rate, `requestAnimationFrame` with interpolation by optional `id`, and keyframes/deltas with negotiated `b1` binary and `d1` JSON.
  - **Pending:** adding ids to the bundled games, which changes reviewed hashes and needs owner review.
  - Run-to-run variance was measured afterwards: back to back, p50 moved by 1.5 ms or less and p99 by 3.5 ms or less. Treat differences under ~3 ms at p50 and ~10 ms at p99 as noise. Details are in MODE_A_FRAMES.

### 2. Cross-platform identity, seats and real Kick — implemented locally, real session pending

- **Result so far (2026-11-03).** The design and the decision are in [IDENTITY_SEATS](platform/IDENTITY_SEATS.md):
  - The owner chose a pairing code typed in chat, bound to the browser tab with a non-extractable WebCrypto key. There is no fingerprinting, and the client IP is used only for limits.
  - `!join` still posts the generic verified link. The page shows `!join <code>`, and the chat message that carries the code seats that tab as `twitch:<id>` or `kick:<id>`, with the platform's roles.
  - Web guests get an unverified `web:` seat.
  - The Kick webhook read the wrong timestamp header, so every real event would have failed with 403. That is fixed.
  - Tests: 335 checks. The local Chromium rehearsals pass 38/38 (UI) and 10/10 (seats).
  - **Pending:**
    - a real session in which one Twitch viewer and one Kick viewer join the same room. It needs the owner's Kick app, accounts and a stable public URL;
    - seats on `tee-play.html`, which move to phase 3.
- Identities are `twitch:`, `kick:` and `web:`, with each platform's moderator and broadcaster roles.
- Short-lived signed seat tokens, and `!join` answers with a personal link. This replaces the phase 0 patch.
- Test Kick end to end with a real account. The adapter in `src/chat/kick.js` exists but has only been tested with fixtures (`docs/COMPAT.md`).
- If the Steam/Epic research recommends Epic Online Services for identity or lobbies, include it here.
- **Done when:** a Twitch viewer and a Kick viewer join the same room under their own names.

### 3. Vibe Arena game protocol v1 — implemented locally (2026-11-06)

- Bundled SDK games and the collective Tee run under `va-game/1`: SDK games on derived manifests through the sandboxed worker, Tee through `TeeAdapter` + `TeeSession` on the pinned codec.
- One conformance suite (`test/protocol-conformance.mjs`, `test/protocol-tee.mjs`) drives fixture, real-SDK-sandbox and Tee adapters through every spec §9 case.
- Deferred: Tee individual seats to v1.1, t99 outside the registry, bundled games stay on derived manifests (no reviewed-hash changes).

- **Manifest:** id, version hash, credits, a declared input schema with bounds, seats (streamer/player/spectator and maximums), chat effects with rate limits, and the supported delivery modes.
- **Control channel (platform ↔ game):** versioned hello, join/leave with a seat token, effects, pause/resume, health and round end.
- **Data plane:** the phase 1 frame format for mode A.
- **Adapters, in order:** SDK games, Tee (from the pinned postcard codec), t99. `src/remote-games.js` stops hardcoding adapters.
- **Next data-plane step:** WebTransport for the funnel (Baseline since March 2026), with WebSocket as fallback. Support through Cloudflare tunnels is unverified.
- Update `src/sdk-prompt.md` so generated games declare a manifest.
- Write the spec before the code. **Spec accepted on 2026-11-06:** [GAME_PROTOCOL](platform/GAME_PROTOCOL.md). t99 is out of v1, and Tee individual seats move to v1.1.
- **Done when:** Grove and Tee run under the same contract, with conformance tests.

### 4. VM3 game runtime

- Two backends: a local VM (QEMU/KVM via libvirt, for self-hosting) and the cloud (CreateOS).
- Browsers connect **through the funnel**, never directly to VM3: fixed URL, seat token on the first stream, the viewer IP never reaches the VM.
- On every game change VM3 resets to a clean image; players wait in the funnel waiting room (predictions, votes, countdown).
- Fallback returns VM3 to the default-game image, by streamer button or watchdog.
- **Done when:** Grove runs in VM3, both local and cloud, with no game code on the host.

### 5. Mode C and a live view of Codex

- Fallback from A to C inside VM3: a headless browser on Xvfb draws the same display list and voxl streams it. This also covers native games that have no mode-A adapter.
- A read-only voxl view of VM1 in Studio and in the overlay, so viewers can watch Codex build.
- **Checks:**
  - the GPL obligations that come with x264;
  - CPU per stream (the voxl README reports 1.3–1.7 cores at 2560×1600 without a GPU);
  - multi-viewer behaviour, which is undocumented.
- **Controls:** `--read-only` for spectators, input only from the active seat, signed short-lived room tokens (not the default password), clipboard off, `--allowed-origins` to the funnel domain, voxl reachable only from the funnel.
- **Done when:** a forced A failure switches the room to C without dropping players.

### 6. Full VM1 → VM2 → VM3 pipeline

- An approved artifact deploys to VM3. This is the missing piece today.
- **Done when:** an idea from chat ends up played live, never executed on the host.

### 7. Opt-in mode B and Steam/Epic integrations

- Mode B, with per-viewer risk acceptance: notice plus sandboxed iframe (`sandbox="allow-scripts"`, `allow=""`, `referrerpolicy="no-referrer"`), and the game's WebSocket relayed through the funnel to hide the viewer IP.
- Any Steam/Epic integration the research recommends that did not fit in phase 2.

### 8. Community fund

- Donations go to the streamer; provider keys are the streamer's, encrypted per streamer in the vault. Per-session capped tokens from the key broker; the key never enters a VM.
- Platform-side ledger: declared contributions, per-purpose reserves, capped spend, public receipts; no custody of anyone's money.
- Legal gate first: if the platform ever collects the money, a fintech review (Chilean Law 21.521) and a company setup come before it.

## Security hardening — done locally (2026-11-06)

Code findings from the November 4 review, approved and applied; none changed reviewed game hashes. Caveat: warm-builder behavior after an actual provider pause is unverified against a real VM.

- Paused builder VMs are never resumed: `verify()` destroys them and the external supervisor closes a `provider-pause` lease within about a minute.
- `--auto-pause` stays only as the provider cost fuse (`src/vm-builder-preflight.js`, `src/studio-worker/test.js`), unchanged.
- Raw VM stdout/stderr is no longer retained: the diagnostic keeps sizes and sha256 only, and the probe receipt is allowlist-filtered.
- The Tee iframe runs sandboxed cross-origin with an empty permission policy and no-referrer; a mode-B notice must be accepted before Play.
- Every controller response gets CSP (script/style/img/connect 'self'), `nosniff`, `Referrer-Policy` and `frame-ancestors 'none'`; inline page scripts/styles moved to files.
- `src/isolated-gamehost.js` runs bubblewrap with a mandatory x86_64 seccomp filter and a `systemd-run` cgroup scope; missing scope degrades with a visible warning. Caveat: seccomp is x86_64 only.

## Ongoing

- Remove merged `refactor/*` branches and the prunable `/tmp` worktrees.
- Add CI for `main`.
