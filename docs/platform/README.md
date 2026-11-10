# Platform documentation

The project entry point is the [README](../../README.md). The overview is in [ARCHITECTURE](../ARCHITECTURE.md), and the plan is in the [roadmap](../ROADMAP.md).

How to read these documents:
- **Current** documents describe what the code on `main` does today.
- **Records** prove only the run or version they name.
- **Plans** are requirements that are not built yet.

Hackathon handoffs, plans, audits and pull-request notes are kept, unchanged, in [docs/hackathon](../hackathon/README.md).

## Current

| Document | What it covers |
| --- | --- |
| [IDENTITY_SEATS.md](IDENTITY_SEATS.md) | Twitch, Kick and web identities, seat tokens and pairing by chat code (phase 2). |
| [MODE_A_FRAMES.md](MODE_A_FRAMES.md) | What reaches the browser: tick-rate state, keyframes and deltas, `b1`/`d1`, interpolation, measured latency (phase 1). |
| [TRAFFIC.md](TRAFFIC.md) | Frame and chat limits. Its 10 Hz figures predate phase 1. |
| [LOCAL_RUNTIME.md](LOCAL_RUNTIME.md) | Linux isolation of bundled games and the fallback boundary. |
| [CREATOR_CREDITS.md](CREATOR_CREDITS.md) | Attribution bound to the source version, and the publication contract. |
| [REMOTE_GAMES.md](REMOTE_GAMES.md) | The specific external-game adapters; the shipped catalog is empty. |
| [STUDIO_WORKER.md](STUDIO_WORKER.md) | The Studio build worker boundary and its explicit run authorization. Off by default. |
| [BUILDER_PREWARM.md](BUILDER_PREWARM.md) | Preparing a build VM during voting, with finite leases. Off by default. |
| [BUILD_QUARANTINE.md](BUILD_QUARANTINE.md) | The journal that keeps candidates inert until exact approval. |
| [TEE_LOCAL_ADAPTER.md](TEE_LOCAL_ADAPTER.md) | The pinned local protocol adapter for teeworlds-rs. |

## Records

| Document | What it records |
| --- | --- |
| [LANTERN_TABLE_REVIEW.md](LANTERN_TABLE_REVIEW.md) | The real Codex VM build, a separate test VM and the exact approval, with known findings. |
| [LANTERN_ROLES_REVIEW.md](LANTERN_ROLES_REVIEW.md) | The reviewed rotating-roles revision; inert. |
| [VM_TRIAL.md](VM_TRIAL.md) | The earlier Seed Race trial and its artifact provenance. |
| [PREWARM_CONTROL_VERIFICATION.md](PREWARM_CONTROL_VERIFICATION.md) | Real prepare, renew and close checks on a build VM. |
| [CREATOR_GAME_DEMO.md](CREATOR_GAME_DEMO.md) | Grove authorship and attribution. |
| [STUDIO_INCREMENT.md](STUDIO_INCREMENT.md) | Where the Studio increment came from, and its evidence. |
| [TEE_CLOUDFLARE_RESULT.md](TEE_CLOUDFLARE_RESULT.md) | The Cloudflare waiting-game VM trial of 2026-11-02. |
| [TEE_RAILWAY_TRIAL.md](TEE_RAILWAY_TRIAL.md) | The Railway trial, rejected for the account before any resource existed. |
| [TEE_DEMO_DECISION.md](TEE_DEMO_DECISION.md) | The hackathon decision to keep external Tee off. |
| [FREE_HOSTING_REVIEW.md](FREE_HOSTING_REVIEW.md) | Provider research from 2026-11-01. Recheck the terms before relying on it. |

## Plans

| Document | What it asks for |
| --- | --- |
| [GAME_PROTOCOL.md](GAME_PROTOCOL.md) | Draft of the game protocol v1: manifest, control channel, chat effects, adapters and conformance tests (phase 3). |
| [HOSTING_POLICY.md](HOSTING_POLICY.md) | Hosting choices and VM inactivity defaults set by the owner. |
| [SESSION_FLOW.md](SESSION_FLOW.md) | The intended stream session, with parallel waiting-game and construction lanes. |
| [JUDGE_DEPLOYMENT.md](JUDGE_DEPLOYMENT.md) | A runbook for a fixed HTTPS host. Nothing has been provisioned. |
| [VISION.md](VISION.md) | Long-term product requirements, not implemented behaviour. |
