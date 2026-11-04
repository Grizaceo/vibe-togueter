# Optional session features

Each feature has a flag under `features` in `vibe-arena.config.json`. Every flag ships off. Change the flag and restart the controller to turn a feature on or off.

**Roles.** Broadcaster and moderator mean the roles that Twitch or Kick report for the message itself:
- the IRC tags for Twitch;
- the signed webhook payload for Kick.

A display name or a browser nickname never grants them.

## Community co-credit (`communityCredit`)

Approved build inputs show:
- the selected idea authors;
- the supporting ballot count;
- who actually approved them.

These credits appear in the Studio and the overlay. They are credits for the input round, separate from the game that is playing. No bundled game is credited with votes from an unrelated round.

New quarantine tickets snapshot this participation data and include its fingerprint in the artifact binding. Published contributor records can carry the same snapshot. The line "Voted by N · Approved by …" appears only when the game source matches.

Counts are supporting voting identities, including unverified web sessions, not verified people. Turning the flag off hides the co-credit line without erasing the recorded attribution.

## Temporary moderator approval (`approvalDelegation`)

**Granting.**
- The broadcaster sends `!delegate trusted_mod 10` to let that moderator approve the selected round input for ten minutes.
- `!delegate off` revokes it.
- The local Studio offers the same grant, up to 30 minutes.

**Using the grant.**
- The login is matched on the platform where the broadcaster delegated.
- That account must still carry the moderator role when it sends `!build approve REVIEW_TOKEN`. It should check the selected ideas and resources in the Studio first.

**What denies approval:**
- the grant expires or is revoked;
- the account loses moderator status;
- the message comes from a web alias;
- the review token is stale.

The round history records the actual approver and the delegated authority.

**Limits.** The grant lives in memory and ends when the controller restarts. It does not cover:
- editing the round;
- attesting artifact rights;
- final artifact approval;
- other owner controls.

The overlay shows the delegate and the expiry.

## Chat predictions (`chatPredictions`)

**Running a prediction.**
1. The broadcaster opens a 60-second prediction with `!prediction open Sun|Rain` (2 to 6 choices).
2. Viewers vote with `!predict Sun`. A new vote replaces the viewer's previous one.
3. The broadcaster then sends `!prediction lock`, followed by `!prediction resolve Sun` or `!prediction cancel`.

The overlay marks correct predictions and labels the outcome as reported by the streamer.

**What it does not use:** no money, Channel Points or Twitch Predictions API. Web sessions can predict too, and winner labels tell web names apart from platform logins.

**Lifetime.** Predictions stay in memory until the next prediction or a restart. Changing the game does not resolve them, so the broadcaster resolves or cancels each one.

## Grove emote bursts (`distinctPersonBursts`)

**The bonus.** Three different Twitch or Kick accounts that send the same ☀️ or 🌧️ within five seconds trigger a Grove bonus:
- sunshine speeds up growing trees;
- rain adds growth to planted trees.

**What counts.**
- Each account counts once, and a renamed account is still the same account.
- The same login on Twitch and Kick counts as two people.
- Web aliases do not count.
- These are account counts, not verified people.

**Timing.** Each emote has a five-second cooldown. Pausing chat effects clears pending bursts, and so do game changes and reloads.

The overlay shows progress, and the game announces each bonus.

## Preferred fallback games (`configuredFallback`)

**Setting the order.** Unlock the Studio owner controls and save the safety fallback order, or set `fallback.order` in the config before the first start.
- The ids are `community-grove`, `chat-vs-streamer` and `demo`. Marble Race is always appended last.
- The saved order persists in `runtime/fallback-preferences.json`.

**Eligible games.** Only bundled source whose contributor and resource fingerprints match is eligible. Edited, failed, candidate and external games are skipped.

**When recovery fails.** Each candidate is tried once, then recovery stops. With the flag off, only Marble Race is used.

## Chat-effects pause (`chatPause`)

A broadcaster or moderator on Twitch or Kick sends `!pause` and `!resume`. The overlay shows the pause.

**What stops:**
- incoming game commands;
- crowd pulses;
- mapped reward effects.

**What keeps going:**
- browser play;
- ideas and votes;
- safety fallback;
- the game simulation, and any effects already applied to it.

Reward notifications received during a pause are acknowledged without applying their effect. That does not refund Channel Points.

The pause resets when the controller restarts. Locally, the streamer can `POST {"paused": true}` or `{"paused": false}` to `/admin/chat-effects` with the usual admin and streamer headers.
