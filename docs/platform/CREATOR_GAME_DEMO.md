# Curated art → playable example → creator links

Community Grove is an original SDK example authored by this Codex session. It uses three unmodified Kenney Background Elements CC0 images. It is not a game built by a VM worker, an actual community-selected commission, an artist signup or a Kenney endorsement.

Chat plants and waters six plots (`!plant 1–6`, `!water 1–6`) and supplies bounded sunshine (`!sun`). Web players click plots or use arrows/A-D + space. Trees grow using the licensed tree illustration; completing the grove starts the next round after eight seconds. Per-actor cooldowns and bounded player/ballot state limit growth. Tests exercise cooperation, invalid/stale publication, source/asset changes, reset and the actual SDK/WSS path.

The local owner publishes a reviewed game source SHA-256 together with a reviewed resource manifest. Bundled resource bytes are rechecked against their recorded SHA-256. Usage records retain the complete manifest and are counted by distinct game/version. The player and OBS pages display creator links and exact attribution/license notices outside generated game code, only while the executing game's hash matches the approved credit version. Code or image changes invalidate the published-credit response until reviewed again. A changed-version panel is hidden rather than claiming old credits belong to new code.

Scope: this local publication path accepts bundled, curator-reviewed PNG resources. Other artist resources, arbitrary uploaded games and VM-produced artifacts need the quarantine/build/publication path. Existing trusted manual game loading remains available; this does not claim that an external fork, direct backend or manually modified client cannot omit credits. Official remix lineage/source-stream watermark and private game access are still pending.

Reproduce on an authorized owner channel with the live controller and tunnel: `node scripts/rehearse-grove.mjs --live`. The script refuses to replace a game with active web players. It verifies the published pack, sends automated public WSS input, observes actual Twitch commands through separate IRC, and saves the resulting frame metadata. It never calls a paid model or payment provider.

Actual evidence: `docs/evidence/grove-1793541737514.json`, eight checks passed. The channel was offline. This is actual network/game-state and creator-metadata evidence; canvas appearance, human play, streaming/recording and exported video remain unverified because browser access is unavailable in this session.

A small inherited loader repair accompanies publication: path containment now rejects sibling folders with a `games` text prefix and symlinks outside the actual games root. The existing local loading interface is retained.
