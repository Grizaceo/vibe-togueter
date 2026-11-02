# Vibe Togueter — external teeworlds-rs local adapter

This increment lives on `feat/tee-demo-contract-20261102`, based on develop
`a96d0ffec07759d1e013da9b635ccd54727867e0`. Vibe Togueter is the product;
the implementation remains Vibe Arena. The frozen submission branch and annotated
tag still resolve to `113c3f500fcec4c82808d176bd613607c27a9978`.

**Verified local integration — VM deployment and external access testing pending.**

**Manual local entry now verified:** the owner sent `!join` on real Twitch,
confirmed receiving the address, opened the complete local URL and confirmed
“Sí, está ONLINE y puedo jugar” using A/D and space after focusing the game.
An independent read-only probe observed the `gris_96` tee in 38 authoritative
snapshots. This establishes one human's local entry/control, not a second human
streamer, an authenticated in-game role or external access.

The first attempt failed with “Server not found”. The owner's Twitch screenshot
identified a partial-link problem: only `tee-play.html` was rendered as a link,
while the IP/port remained plain text. The local reply now omits the filename,
uses `/?name=VIEWER` and explicitly asks to copy the entire address. The successful
human retest used the complete address. This is a local-prototype workaround,
not verified clickable public access. Earlier failure receipts remain unchanged.
Automated inputs/browser clients remain separate from this human confirmation.

teeworlds-rs is Cristóbal Muñoz's external game, developed separately with Devin
and Hermes. It is used to demonstrate the platform's potential; its implementation
is not hackathon game code built with Codex. No game source, server executable or
WASM is vendored in this increment.

## Current result and boundaries

**Primary demo: `!join` → platform entry → individual player.** The owner clarified
that chat movement commands are not the desired viewer flow. The individual harness
replies to a manual Twitch `!join` with a platform entry link. After clicking
“Enter game with my own tee”, the external browser client joins the existing
`127.0.0.1:8304` match and uses keyboard/mouse. There is no collective tee in this
flow, and chat commands do not control that individual player. This server hosts
one shared match; the prototype does not create private rooms.

The public `tee-play.html` page retains visible external credits. In the normal
platform, an owner-configured HTTPS Tee entry with `joinByDefault: true` routes
`!join` there; at most one may be selected. Studio's Tee entry also points to that
page. No endpoint is guessed or enabled by default. The local harness supplies a
loopback-only catalog for testing, not a shipped public catalog entry or deployed
judge endpoint. The main controller's `remoteGames` remains empty.

The collective bridge described below is a separate fallback prototype. Its real
Twitch right/jump test is recorded separately and does not prove individual entry.
It was stopped before starting the individual-join harness.

| Participation | What this increment does |
| --- | --- |
| Collective chat tee | Separate fallback prototype only: one `chat@channel` socket; bounded movement pulses. Stopped for the individual-join demo. |
| Individual browser player | Opens the external game's own client against the same existing local server. No Twitch identity binding, seat allocation or privileged game role. |
| Spectator buffs/hazards | Not implemented. Collective movement is not presented as spectator effects. |
| Streamer | Twitch owner/moderator authority permits pause/resume; owner on/off. A game name such as `streamer` does not authenticate a game role. |

Tests of the separate collective adapter have verified real authoritative snapshots, acknowledged input, position
change, cooldown, pause, disconnection and return. Chromium opened the link,
connected two real browser clients to that game, received/decoded their snapshots
and observed movement. A subsequent individual-entry browser rehearsal also opens
two separate platform entry pages and presses each entry button, without a
collective bridge. Both clients receive snapshots and one moves by keyboard input.
The screenshots visibly show ONLINE and legible external
credits. The owner subsequently confirmed individual ONLINE play using the full
local address. There is no human-versus-streamer gameplay or cross-network verification.

## VM decision, revalidated November 2

At 18:19 UTC the inspection began; the new VM/local decision cutoff was set to
18:40 UTC. The official rules were reopened at
<https://twitchcon-codex.devpost.com/rules>: November 2, 14:00 PST means
22:00 UTC / 19:00 Santiago. The prudent submission target remains 21:00 UTC.
Rules require truthful functionality, Twitch and Codex footage, English materials,
source/testing access and free judge testing through November 15. No submission,
invitation, publication, upload or hosting deployment was performed here.

The game worktree's `DEPLOY-CREATEOS.md` identifies a previously authorized validation
VM. Its game root now returns HTTP 404 and a destroyed-sandbox response. The provider
also rejects the read-only inspection because the VM is destroyed. No guest command
ran. Its `/healthz` still responds HTTP 200 with provider JSON `data.up=true`;
that is a control-plane health response, not evidence of a live game. WSS did not
connect. No revision of an executing VM server can therefore be established.
The local path was selected before the cutoff. No other VM was repurposed; none was
created, resumed, built, modified or destroyed by this work, and no model was invoked.

The main game worktree is `2111af2` with extensive pre-existing staged/unstaged
changes; the clean advanced bots worktree is `172cfef66565af00f75e865c60e3c91859beb039`
and recorder is `79f32fa3d6e7d4a4a7546a7d89caedb7df0865d2`. They were not changed.
A separate read-only worktree at the exact advanced pin supplies the codec types.

## Versioned, deliberately narrow translation contract

The game uses its own postcard-over-WebSocket protocol. This is not compatibility
with official Teeworlds or DDNet servers. Its wire protocol has no negotiated
version, so this prototype does not claim a server version handshake.

Instead the private native helper announces **contract version 1**, schema
`teeworlds-rs/172cfef`, and exactly three capabilities: `collective-tee`,
`bounded-input`, `authoritative-position`. The JS adapter refuses unknown versions,
schema IDs, capabilities and handshake fields. The build script requires the full
source revision above and clean shared/workspace dependency files, and builds only
the small codec locally with a committed Cargo lockfile, `--locked --offline`.
It does not build Rust in a VM, compile the game/WASM, train bots or start a game
server.

Every binary server message is deserialized using that revision's complete Rust
`ServerMsg` types with `postcard::take_from_bytes`, requiring an empty remainder.
This understands the advanced input/snapshot fields instead of truncating or
ignoring unknown wire fields. The allowed messages are Welcome, Snapshot, Pong and
Events; other variants stop the bridge. The translation exposes only the small
position/ack/event-count subset needed by the bridge. Unsupported modes, oversized
frames, malformed messages, unknown enum tags and extra bytes fail closed. Pinned
Rust tests independently verify the extended Input golden bytes.

The browser client's wire version still comes from the external game's embedded
WASM. Actual ONLINE/snapshot/input checks establish compatibility of the observed
local binaries with this contract; they do not identify their source commit.

The listener-owning PID is checked through its socket inode before hashing
`/proc/PID/exe`. The existing process executes a deleted/replaced binary:
`85eb8ed241e1ce0f44b7ee866cd43f280574b396cbf7e90fcce6539fde427dc1`.
Its source revision remains **unknown**. Served WASM is fingerprinted separately
in the browser receipt and must not be attributed to the current worktree.
Local `/healthz` returns text `ok`; the production remote registry expects JSON
with `data.up === true`, so it is incompatible. This harness records that mismatch
and requires actual Welcome/snapshots/acks; it does not weaken the registry's check.

## Private operation

For the intended **individual viewer** flow:

```sh
node scripts/tee-join-demo.mjs --twitch YOUR_CHANNEL --auth-file /PRIVATE/EXISTING/AUTH_FILE --pid EXISTING_GAME_PID
```

This uses the existing Twitch authorization, verifies that it belongs to the owner
channel, and does not start a login. It replies only to an explicit real `!join`,
with per-user/global limits, labeling the link **local prototype: this PC only**.
Because Twitch rendered only the old filename as a link in the owner's screenshot,
the local reply now instructs full-address copy/paste and uses a filename-free root
URL. This limitation must stay visible in the demo; a public HTTPS hostname flow
has not been tested.
Replies observed back on the actual Twitch transport are recorded separately from
queued sends. The URL has a display name, game ID and no credential/privilege.
The owner can open the printed streamer entry in a second browser window; the name
`streamer` is only a label. No collective bridge or chat movement is started.
It has a separate exclusive local lock and a ten-minute lifetime. Do not run both
prototype harnesses at once. Its stdin accepts `quit`.

The `--auth-file` path is private operator input, never a public link. Errors do not
print credentials or login instructions. Free access from other viewers' networks
still requires an authorized live HTTPS/WSS runtime and hosted platform.

For the separate **collective fallback** prototype:

Prerequisites: an owner-approved, already running local game; a separate clean
external source worktree at the pinned revision; Rust dependencies available
locally; the existing Node dependencies; Chromium for browser verification.
The helper links owner-controlled external source locally; its binary is not shipped.

From this platform worktree:

```sh
node scripts/build-tee-codec.mjs /PATH/TO/PINNED/EXTERNAL/WORKTREE
node scripts/tee-local-demo.mjs --codec /PATH/PRINTED/BY/BUILD --pid EXISTING_GAME_PID --verify-local
node scripts/tee-local-demo.mjs --codec /PATH/PRINTED/BY/BUILD --pid EXISTING_GAME_PID --twitch YOUR_CHANNEL
```

The last command listens to Twitch anonymously in read-only mode. It sends no chat,
does not authorize/login, and never loads tokens. It prints a random **loopback**
demo URL. The browser link contains no credentials or privileged role. The HTTP
server has no control/mutation endpoint. Native stdin offers `pause`, `resume`,
`quit`. Only trusted Twitch messages from the channel owner/moderator can pause or
resume, and only the owner can enable/disable. Viewer inputs have 250 ms per-account
and 100 ms global cooldowns; each pulse lasts 350 ms, then neutral input resumes.
Idle timeout is 60 seconds. Reconnection after idle requires owner `!tee on`.
The entire harness expires after ten minutes and leaves the existing game running.

Only one prototype may hold the exclusive local lock. An existing lock is an error,
not a reason to delete/reset it. Do not run this alongside another adapter for the
same runtime. The harness never reads or changes the platform's live journals.

For a manual test, write directly in the configured Twitch channel, two seconds
apart: `!tee on`, `!tee right`, `!tee jump`, `!pause`, `!tee left` (blocked),
`!resume`, `!tee left`, `!tee off`, `!tee on`. Observe the visible tee and review
the receipt's real-transport commands, authoritative positions and input acks.
A received command or an acknowledged fire input alone does not prove a hit/buff.

## Evidence and recording

Fresh append-only run receipts and screenshots use `docs/evidence/tee-local-*`.
The final verification receipt links exact evidence and records tests/revisions.
Evidence includes failed/intermediate attempts; none replaces historical records.

Suggested recording caption for the verified local individual entry:

> Vibe Togueter · verified local integration prototype. External teeworlds-rs by
> Cristóbal Muñoz with Devin and Hermes. Individual browser players. VM deployment,
> external access testing pending. Local Twitch entry uses full-address copy/paste.

Use the credits-bearing harness page for a playable shot. A standalone full-screen
game capture must retain the same external credit caption. Human play, a verified
VM revision, TLS/WSS, another network, authenticated game roles and production
integration remain separate acceptance gates. The normal submission/demo documents
are historical and have not been rewritten to imply this increment was in the freeze.

## What would need explicit incorporation into the frozen delivery

Nothing here is merged/cherry-picked to the frozen branch or tag. A future owner
decision would need to incorporate the bridge/legacy-codec fixes, native codec
source and lockfile, individual-join routing/configuration and public entry page,
local-session router, build/demo/browser scripts, test updates
and these new evidence/documents. Then re-run platform/Chromium checks on the chosen
delivery revision and update the English script/submission with the exact tested
scope. A real VM demo additionally needs an authorized running VM, a proven revision,
safe HTTPS/WSS deployment and human/external access checks. The new local result
alone does not justify changing the old delivery's deployment or Twitch claims.
