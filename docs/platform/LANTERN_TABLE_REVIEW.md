# Lantern Table — exact owner review confirmed

This is an owner-selected real Studio-to-VM run, with zero Twitch ballots. Fresh subscription login completed and the controller dispatched automatically after authentication. Codex gpt-6.1-terra returned source in about 48 seconds; separate-VM protocol testing and confirmed cleanup finished about 63 seconds after dispatch. Both guests are destroyed. The earlier timeout remains recorded separately.

## What is ready to inspect

- [Exact inert source](../../artifacts/lantern-table-e21fef6b/game.js): read as text; never import it on the streamer host.
- [Nine-check separate-VM report](../../artifacts/lantern-table-e21fef6b/report.json).
- [Construction, usage, cleanup and credit metadata](../../artifacts/lantern-table-e21fef6b/review.json).
- [Static test-VM frame](../evidence/lantern-table-static-preview.png): rendered by the trusted canvas client from JSON, not live gameplay.

Game intent: browser heroes move and attack; chat can summon enemies, heal and roll a die. Five rounds, win/loss reset and bounded per-account cooldowns are implemented in code. No external image/audio resources were selected; artwork is drawn with primitives. This report does not attest originality beyond the recorded generation process or independent human gameplay quality. The protocol harness sent a generic help command, not a gameplay test of all three custom commands; resource checks with an empty asset set are vacuous. A gameplay-focused review is separate from these nine checks.

## Exact version

- Source SHA-256: `6bf31dda8d610956129986af157af56e6b46448c3f49f396f707659b98034900`
- Artifact binding: `c152396d80920759fe935bcf1b49331ee7ed3655643942bb85e7b36ff8f79ac8`
- Report binding: `108f942432e4b131d2e6d82060f95adde863aed1911ff01712e87219c0cc3a96`
- Job: `e21fef6b-03c9-4946-812f-5f618e4f1877`
- Build guest: `sb-01m6d2ssj47f5c8pbfwc6rvxa3`
- Test guest: `sb-01m6d30dhtbk16k552w3vj7pga`
- Codex guest thread: `01a19a2f-90b2-7363-a930-e1eedbf9214b`

Proposed declared game credit: **Cristóbal Muñoz · Codex-assisted**. Art credit: code-drawn art; no external image assets selected. Input attribution remains the canonical owner-selected-trial snapshot with zero supporting ballots and local-streamer approval; it must not be presented as audience participation.

Approval, if granted, saves **local reviewed publication evidence only** for these exact source/artifact/report hashes and the reviewed credit/rights declaration. It does not deploy a runtime, publish a website or execute the candidate on this PC. Owner exact-version/rights approval was confirmed in chat for local evidence with these limitations. See [owner review receipt](../evidence/lantern-table-owner-review.json) and [reviewed publication record](../evidence/studio-build-e21fef6b-03c9-4946-812f-5f618e4f1877.json).

## Read-only gameplay review findings

A separate reviewer inspected source as text without importing or executing it. Two P2 paths need gameplay verification/correction before treating this as a polished playable release:

1. `game.js:36` resets player y without the modulo used on initial join; the 53rd connected player can reset below the 720px viewport and stay there while idle.
2. `game.js:116–126` processes enemy attacks before removing enemies whose health reached zero; a defeated foe can damage a hero once before removal on the next tick.

The player map has no candidate-level cap; large-audience frame/CPU behavior is not established. Enemy/effect/log/cooldown collections have explicit limits. No imports, external URLs, downloads or third-party artwork were found in the source. These are static findings, not guest gameplay reproductions. The nine protocol checks do not disprove them. Exact source remains unchanged. Saving reviewed local evidence may document these limitations; it does not approve production gameplay quality.
