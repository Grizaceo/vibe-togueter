# Vibe Arena

## What a judge can try in two minutes

Run the local app, open the community studio and propose/vote on an idea. Inspect the streamer approval step, then play Community Grove by clicking or pressing space. The permanent strip identifies the game creator, artist and idea author; creator links and license details stay with the game. Twitch viewers can participate through commands after the operator authorizes their own channel. README contains the setup and fallback commands.

**Tagline:** Make a community's ideas playable, and keep the people behind them visible.

## The experience and its current boundary

A streamer has two audiences: people ready to open a game and people who prefer to stay in chat. Vibe Arena gives both a role. Grove lets them grow one illustrated world; Marble Race combines browser players and chat entrants; Democracy Duel turns chat ballots into one shared action against the streamer's direct controls.

The studio takes limited proposals, replacement ballots, streamer selection and exact input/resource approval. Free creator resources require curator review, explicit licenses and fingerprints. Three actual Kenney CC0 images are bundled examples, not creator signups. A source/resource-pinned credit strip remains visible on the player and OBS pages, including external game authors and idea contributors when recorded.

We chose **Plan B for the demo**: demonstrate the working decisions and reviewed games, then show the actual operator-run Codex VM construction evidence. The intended complete loop is community selection → streamer approval → isolated Codex build → separate quarantine → exact version approval → live play with automatic fallback. The experimental Studio connector implements dispatch/status/cancel, separate tests and reviewed evidence publication behind a disabled flag. Its lifecycle tests use mocks. One real attempt passed fresh subscription login but timed out during construction without an artifact; builder destruction was confirmed, and no test VM was created. A complete new real run remains required. Seed Race was built, tested and approved but remains unpublished; we do not present its static preview as live Twitch gameplay.

The controller runs reviewed SDK games in separate Linux namespaces with deadlines, bounded messages and a watchdog. A failed game follows the streamer’s reviewed fallback preferences, with Marble Race last; Twitch moderators or the broadcaster can request the same fallback. Rendering accepts bounded flat primitives and local curated image paths. Credits are delivered through version-matched WebSocket snapshots. State compression/backpressure and admission before chat broadcast reduce avoidable traffic. These controls are not a general guarantee that arbitrary uploaded games are safe.

The treasury is a simulated build-credit ledger. It does not receive donations, settle bills, or treat Bits, subscriptions or Channel Points as money for builds. Paid-event simulation is disabled by default; payments and paid asset checkout are outside this submission. External Rust runtimes were removed from the demo configuration pending rights/hosting review.

The increment adds distinct-account Grove emote bonuses, moderator chat-effect pause/resume, preferred fallback order, temporary input-approval delegation, supporting-voter/approver credit and free chat predictions. Each has an independent config flag. New Grove art stages and large stream credits are verified locally; real audience rehearsal remains pending.

## Built with Codex, with explicit provenance

Main Codex build session: **01a19536-0f02-7fc3-b030-d6b6fd8e170c**.

Quarantine/real VM trial continuation: **01a19776-75a5-7e91-b5c1-f108c345dc8c**.

This audit-response session: **01a197c1-5ea9-7b21-8339-a38373db96b1**. Show the corresponding thread and its commits/tests in the recording.

Submission increment continuation: **01a19904-ac5e-7b41-895c-bf07c9864f2b**. The Devpost session field remains the main build session above.

The initial prototype came from Devin CLI session `visual-graffiti`; commit `fab3227` records that inherited server/SDK/client/Marble Race baseline. Repository audit notes identify that session. A targeted read-only query independently confirmed its creation at November 1, 2026, 05:54:16 UTC (docs/evidence/prototype-session-origin.json). The participant subsequently explicitly confirmed the necessary prototype/resource rights and creation during the submission period, and stated that the Vibe Arena idea arose in the early hours of November 1. [Owner confirmation with English translation](docs/evidence/owner-rights-confirmation-2026-11-01.json) records that attestation separately from the independently verified session timestamp. We do not claim Codex authored the inherited prototype or the parallel Rust games.

Codex subsequently implemented Twitch OAuth lifecycle handling, tagged/reconnecting IRC, EventSub reward routing, Democracy Duel, private streamer controls, durable proposal rounds, creator/resource review, exact artifact quarantine and separate-VM tools. A real Codex/Terra guest built Cooperative Seed Race using fresh subscription authentication; another guest ran twelve checks and the owner approved the exact source/report. This revision independently reproduced controller escape/freeze risks, then implemented process isolation, recovery, transport controls, persistent contributor attribution and an independently written privacy notice.

An additional external **read-only audit with Devin** provided hypotheses and product ideas. We evaluated them against the current code, commands and primary rules. All implementation and documentation added in response to that audit were authored and verified with Codex in this session. No audit paragraphs, legal drafts, tables or code snippets were copied into the repository. This statement describes our new work and does not erase the inherited prototype's provenance.

The Twitch OAuth port was informed by the sibling `stream-to-shorts/twitchcon-app`; its MIT notice is retained in LICENSES. Its older editing pipeline is not a dependency or a submitted feature here. Kenney resources retain their own CC0 notice and provenance.

## Evidence and limitations

The current local suite passes **247 checks: 141 focused tests and 106 isolated integration checks**. Separate automated Chromium evidence passes 22 local UI checks and 14 normal-launcher browser checks. A fresh disposable checkout passes installation, the complete suite, 10 launcher checks and six inert Seed-transfer checks. Separate real VM quarantine evidence is twelve checks, not added to the npm total. Failed intermediate attempts remain documented. See docs/EVIDENCE.md.

Saved real Twitch/WSS rehearsals verify commands, bot replies and effects in the existing games. Those runs used owner-account automation while the channel was offline. We have not represented them as independent audience play, a real OBS broadcast, or new Twitch evidence from this revision. Paid events, actual reward redemptions and payment settlement have not been demonstrated. Default tests use mock coding providers.

The full vision still needs a verified real run of the disabled Studio worker, a separate approved-artifact runtime, stable free judging access and human rehearsal. There is no Twitch Extension, general marketplace, universal co-op conversion or connected Agent Native runtime. The privacy page is implemented, but Cristóbal Muñoz supplied the operator name and privacy contacts. Hosting/recording disclosure and retention/deletion handling remain required before public use.

## Next steps and submission fields

Future versions could help streamers discover creator games, export clips that preserve game/art/idea credit, and offer explicit-budget subscriptions to subsidize compute. These are roadmap proposals without current sales, platform partnerships or adoption claims.

Owner fills: repository URL and access for **testing@devpost.com**, public YouTube URL, hosting/recording disclosure and the Devpost form. Rights/date attestation is recorded in the owner confirmation above. Record an English video under three minutes showing real Twitch functionality and how Codex built the project; use docs/DEMO_SCRIPT.md. Keep judging access free through November 15. No push, publication, video upload or submission was performed here.

[Official rules](https://twitchcon-codex.devpost.com/rules), independently reopened November 1, require Codex use, original participant work, build-session ID, accessible source/testing instructions and English submission materials. They also require Twitch and Codex footage and permission for third-party material in the video. Deadline: November 2, 2026, 22:00 UTC / 19:00 Santiago; prudent delivery target 21:00 UTC. This document is a truthful draft, not a submission receipt.
