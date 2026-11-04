# Vibe Arena

[Español](README.es.md)

Vibe Arena is a Node server where a streamer's Twitch or Kick chat proposes, votes on and plays browser games, and Codex builds new games in separate VMs.

## Status

Alpha.

**History.**
- It started as an entry to the Codex x TwitchCon hackathon of November 2026.
- The judged state is frozen at the tag `submission-2026-11-02` and the branch `develop`.
- Work continues on `main`, following the [roadmap](docs/ROADMAP.md).

**Roadmap progress.**
- Phase 0 (public join link) and phase 1 (low-latency frames) are done.
- Phase 2 (one identity per viewer across Twitch, Kick and the web) works locally. A real session with Twitch and Kick viewers is still pending.

## Quickstart

Linux with bubblewrap and user namespaces is required.

```bash
npm ci
npm test
npm start -- --game-dir games/community-grove
```

Open `http://localhost:8420/` and choose "Play as guest". No Twitch or Kick account is needed to try it. To connect a channel, see the [operating guide](docs/OPERATING.md).

## How it works

**Joining.**
- `!join` in chat answers with one public link, the same for everyone.
- The lobby shows each browser tab a short code. The viewer types it in Twitch or Kick chat, and that message seats the tab under their account with their platform role.
- A display name never grants anything. Viewers who skip pairing play as unverified web guests.

**Playing.**
- Reviewed games run in a sandboxed process on the controller. Viewers' browsers receive only drawing primitives, so no game code runs on a viewer's machine.
- Frames follow the game's tick rate, and after the first one only the changes are sent.
- If a game fails, a watchdog switches the room to a reviewed fallback game and keeps the players.

**Building.**
1. Chat proposes ideas with `!idea` and votes.
2. The streamer approves the exact selection.
3. Codex builds the game in one VM, and a second VM tests it.
4. The streamer approves the exact result.

Approved builds stay inert for now. The VM that will run them comes in roadmap phase 4.

More detail:

| Document | Covers |
|---|---|
| [Architecture](docs/ARCHITECTURE.md) | Modules and trust boundaries |
| [Operating guide](docs/OPERATING.md) | Running the controller and connecting channels |
| [Optional features](docs/FEATURES.md) | The session feature flags |
| [Identity and seats](docs/platform/IDENTITY_SEATS.md) | How viewers get a seat |
| [Frame format](docs/platform/MODE_A_FRAMES.md) | What reaches the browser, with measured latency |

## How this was built

- **Decided and reviewed by me (Cristóbal Muñoz):**
  - the product;
  - the three-VM plan and the delivery modes;
  - pairing by chat code for identity;
  - the scope of each roadmap phase;
  - every merge into `main`.

  I reviewed and approved the exact artifacts from the VM build trials.
- **Before the hackathon:** I built the first prototype with Devin CLI. Commit `fab3227` records it.
- **Written by AI:**
  - **During the hackathon:** Codex wrote the code. Devin reviewed it read-only and drafted the product diagrams with me.
  - **After the hackathon:** Claude Code wrote most of the work on `main` (the public link, the frame format, identity and seats) and the first draft of this README.
- **Verified:**
  - the `npm test` suite ([claims.json](claims.json));
  - headless Chromium rehearsals of the lobby, overlay, Studio and seat pairing;
  - one real Codex build in a VM that a separate VM tested ([Lantern Table review](docs/platform/LANTERN_TABLE_REVIEW.md));
  - real Twitch chat commands during the hackathon.
- **Not verified:**
  - a real Kick event;
  - a live session with Twitch and Kick viewers on seats;
  - the new link check through a real tunnel;
  - hosted deployment;
  - any payment.

## Limits

- **Controller host.** It runs only on Linux. Bundled games run in a namespace sandbox on that host, not yet in a VM.
- **Generated games.** They are reviewed, inert artifacts with static previews. Running them needs the game VM from roadmap phase 4.
- **Kick.** The webhook is tested with signed fixtures only, not with a real Kick account.
- **Tee.** Tee individual play still asks for a name. It moves to seats with the game protocol in roadmap phase 3.
- **Public link.** Quick tunnels change hostname on every start, and there is no stable hosted instance.
- **Build credits.** They are simulated accounting, not money. No payment is processed.
- **Live stream.** No human stream or OBS rehearsal has been done on `main`.
