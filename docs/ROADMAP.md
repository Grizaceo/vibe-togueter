# Platform roadmap (post-hackathon)

Work continues on the `next` branch. `develop` (d2edc1e) and the tag `submission-2026-11-02` are the judged state and stay frozen until results are published.

## Principles

- **Three VMs.**
  - VM1: Codex builds the vibe-coded game.
  - VM2: a separate VM tests it.
  - VM3: runs certified, ready-made games that keep chat and the streamer playing while VM1 and VM2 work.
  - No game code runs on the controller host.
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

### 0. Base on `next` — next session

- Merge `feat/session-flow-cloudflare-20261102`, which contains tee-vm-trial and tee-demo-contract. A trial merge showed no conflicts. `feat/private-openai-auth-wrapper-20261102` also merges cleanly but stays a separate decision.
- **Public tunnel:** startup creates or detects the tunnel and updates the URL that `!join` returns. A stale `VA_PUBLIC_URL` is never sent.
- **`!join` link:** a link posted in chat must not carry `?name=<requester>`.
- **Done when:** tests pass on `next`, and `!join` returns a live link without someone else's name.

### 1. Measure and improve mode A latency — next session

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

### 2. Cross-platform identity, seats and real Kick

- Identities are `twitch:`, `kick:` and `web:`, with each platform's moderator and broadcaster roles.
- Short-lived signed seat tokens, and `!join` answers with a personal link. This replaces the phase 0 patch.
- Test Kick end to end with a real account. The adapter in `src/chat/kick.js` exists but has only been tested with fixtures (`docs/COMPAT.md`).
- If the Steam/Epic research recommends Epic Online Services for identity or lobbies, include it here.
- **Done when:** a Twitch viewer and a Kick viewer join the same room under their own names.

### 3. Vibe Arena game protocol v1

- **Manifest:** id, version hash, credits, a declared input schema with bounds, seats (streamer/player/spectator and maximums), chat effects with rate limits, and the supported delivery modes.
- **Control channel (platform ↔ game):** versioned hello, join/leave with a seat token, effects, pause/resume, health and round end.
- **Data plane:** the phase 1 frame format for mode A.
- **Adapters, in order:** SDK games, Tee (from the pinned postcard codec), t99. `src/remote-games.js` stops hardcoding adapters.
- Update `src/sdk-prompt.md` so generated games declare a manifest.
- Write the spec before the code.
- **Done when:** Grove and Tee run under the same contract, with conformance tests.

### 4. VM3 game runtime

- Two backends: a local VM (QEMU/KVM via libvirt, for self-hosting) and the cloud (CreateOS).
- Browsers connect to VM3 directly with a seat token. The controller only keeps the control channel.
- Fallback works across VMs, with the pause and destroy defaults from HOSTING_POLICY.
- **Done when:** Grove runs in VM3, both local and cloud, with no game code on the host.

### 5. Mode C and a live view of Codex

- Fallback from A to C inside VM3: a headless browser on Xvfb draws the same display list and voxl streams it. This also covers native games that have no mode-A adapter.
- A read-only voxl view of VM1 in Studio and in the overlay, so viewers can watch Codex build.
- **Checks:**
  - the GPL obligations that come with x264;
  - CPU per stream (the voxl README reports 1.3–1.7 cores at 2560×1600 without a GPU);
  - multi-viewer behaviour, which is undocumented.
- **Done when:** a forced A failure switches the room to C without dropping players.

### 6. Full VM1 → VM2 → VM3 pipeline

- An approved artifact deploys to VM3. This is the missing piece today.
- **Done when:** an idea from chat ends up played live, never executed on the host.

### 7. Opt-in mode B and Steam/Epic integrations

- Mode B, with per-viewer risk acceptance.
- Any Steam/Epic integration the research recommends that did not fit in phase 2.

## Ongoing

- Remove merged `refactor/*` branches and the prunable `/tmp` worktrees.
- Add CI for `next`.
