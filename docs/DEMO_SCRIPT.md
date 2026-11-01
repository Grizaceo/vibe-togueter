# Demo video — target 2:45, hard maximum under 3:00

Record real Twitch chat beside the public player/OBS overlay. English voiceover or English subtitles throughout. The rehearsal proves chat integration while the channel is offline; it is not footage of an actual broadcast. Do not use the failed first race attempt as success evidence. Hide .env, authorization codes, private streamer/admin keys and token-bearing network panels.

| Time | Shot and action | English narration / proof |
|---|---|---|
| 0:00–0:12 | Twitch channel + overlay, title Vibe Arena | “Your chat can play without leaving Twitch—or join the same game in a browser.” |
| 0:12–0:42 | Load `marble-race`; one browser player joins; a real Twitch user sends `!play`, then `!race` | Show the username on a marble, countdown and moving race. At least two marbles are required. Do not substitute `/admin/chat` for Twitch. |
| 0:42–0:58 | Send `!join` in actual Twitch chat; open the returned public URL | Show the bot reply and browser lobby. This is a public companion webpage, not a Twitch Extension. |
| 0:58–1:38 | Local operator loads `chat-vs-streamer`; privately unlock streamer controls before capture; Twitch viewers send `!left`, `!right`, `!fire` | Show tally, three-second deadline, selected action and cyan ship moving/firing. Purple ship moves with A/D/arrows and shoots with space. One person has one latest ballot per window. |
| 1:38–2:05 | Split screen: viewer vote and streamer's browser input | “The crowd makes one collective decision; the streamer responds directly.” Show both sides affecting the actual game. |
| 2:05–2:30 | Codex thread, granular commits, SDK contract and tests | “Codex ported private OAuth and refresh handling, repaired reconnecting replies, added EventSub reward routing and built this second format against the existing SDK.” Show real Session ID and passing tests. |
| 2:30–2:45 | Back to the game, one-sentence architecture and limits | “The existing generation fund can commission new SDK games. Real chat is verified; paid events still need an eligible channel and permission.” |

## Operator preparation

1. `npm start -- --twitch gris_96 --game-dir games/marble-race`; run the Cloudflare tunnel and save its HTTPS URL as `VA_PUBLIC_URL` in private .env before starting the final server.
2. OBS browser source: `http://localhost:8420/overlay.html`, width 1600, height 900. Keep private controls on the player page. Capture actual Twitch chat in a separate authorized window/source.
3. Load formats locally: `node scripts/arena-admin.mjs load marble-race` / `node scripts/arena-admin.mjs load chat-vs-streamer`.
4. On player page, enter `VA_STREAMER_KEY` from your private local .env into the password field, unlock, then clear/hide the field before recording. Never put the key in a public URL.
5. Rehearse at least two participants for the race. Use real chat commands and leave time for a full democracy window. A small quiet chat works with one vote; the race needs two marbles.
6. Actual paid subs/bits/channel-point redemptions have NOT been observed. Do not stage signed fixtures as live purchases. The configured channel currently has no Affiliate/Partner status returned by Helix.
7. Actual provider generation was tested with a mock; a fresh model-generated game on a real provider is not yet verified. Only add a generation shot after configuring and proving your chosen provider. Label manual ledger deposits as demo credit; these are not real donations.

Export at 1080p, 2:45 target. Watch the complete exported file; verify readable commands, visible real responses and English narration. Upload publicly to YouTube. Keep enough time to correct audio and permissions before submission.
