# External Tee demo decision

Plan A is pending owner authorization and login. At **09:30 Santiago / 12:30 UTC on November 2**, use Plan B unless the real isolated connection, chat checks and cleanup are all verified. No VM or model operation is authorized by this proposal.

## Read-only source inspection

Candidate pin: `e9af04154ff6d891dff1e8d87f989cf4725392c5` in the owner's separate teeworlds-rs repository. Inspect the committed revision, not the dirty main worktree. The active bots branch at inspection was `8cb855c1ebed0c5db948f04d52f97c6af5a289ee`; its extra input and snapshot fields do not match this adapter.

The candidate revision's input fields and order match Vibe Arena's narrow postcard encoder: direction, jump, hook, fire, aim vector and weapon after the sequence number. Its player/projectile snapshot layout matches the decoder's existing field order. Welcome carries a map and jump configuration after the header read by the bridge. There is no negotiated protocol version. This is static compatibility evidence, not a tested network connection or permission to substitute the newer branch.

Committed source fingerprints (SHA-256):

- `crates/shared/src/proto.rs`: `98dcef4972570455910a460ebc88c2c96a35f94e18a12b1cd6b1ebb146fc85c5`
- `crates/shared/src/input.rs`: `8fb8eb15d48b5b409a27ffe84740d7999ec17699d0e829d82cb0d96be7e880c7`

Neither external repository was edited, built or run. No external game code is copied here. The candidate is a pin for a possible VM experiment; public `remoteGames` remains empty. Existing codec fixtures remain separate local tests.

## Bounded request for Plan A

Proposed authorization: **one fresh CreateOS `devbox:1`, `s-1vcpu-2gb` VM, at most 30 minutes, USD 0.25 operator stop limit; zero model calls, no recharge or plan upgrade**. Confirm usable balance and account capacity first. The owner performs any required provider login and explicitly confirms permission to host this source/assets for the short test. No unrelated guest is reused or changed.

Before creation, arm independent recurring cleanup with a durable unique creation intent. Build only the fixed revision inside that VM. Allow only the registry hosts needed for build, then deny egress before starting the server. Ingress is limited to the provider's TLS proxy for the game/health/WebSocket endpoint; no admin or desktop service. No host credentials enter the guest. Stop rather than broaden network access if the build cannot finish within the cap.

Use a temporary private controller configuration, with public Tee still off. Verify health, `!join` link delivery and bounded `!tee` commands against the actual VM. Record the source pin, guest ID, health result and observed command effects without tokens. Destroy the guest and independently confirm terminal state. Any uncertain cleanup blocks another creation. A failed check or missed gate selects Plan B.

The provider's [limits and rates](https://createos.sh/docs/Sandbox/Limits/) were reopened November 2. At its published CPU/RAM/storage rates, 30 minutes with 1 vCPU, 2 GiB RAM and an 11-GB conservative disk allowance is about USD 0.031 before account-specific terms. USD 0.25 is a stop limit, not a provider-enforced spending cap or settled invoice. Account credits and dollar conversion still need owner confirmation.

## Plan B — recording ready

Reserve 15–20 seconds near the end of the video for the owner's separately recorded game. On-screen label: **“Next: a real-time game for streamer-vs-chat. Built separately; not part of this submission.”**

Narration: “This is my separate teeworlds-rs game, built with Devin and Hermes. Vibe Arena would connect it through an isolated runtime: viewers join as tees, and spectators send buffs and hazards from chat.”

The existing bridge controls one shared tee; it does not implement that future participation model. The general adapter and runtime VM remain planned. Do not show a separately running game as a verified Vibe Arena integration.

If an integrated shot is later approved and verified, judges may expect access to the external source too. The owner must decide whether to publish that separate repository or keep the shot as future vision. No repository is pushed or published by this work.
