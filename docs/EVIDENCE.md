# Evidence — Vibe Arena, November 1, 2026

Codex thread: `01a19536-0f02-7fc3-b030-d6b6fd8e170c`. Branch: `feat/twitchcon-codex`. Inherited baseline: `fab3227`; new work starts with `61d06b3`. No push or submission was performed.

## Baseline and scope

The provided prototype had no commits. Its source was recorded separately before extension. All four original test commands passed in a temporary copy using the existing mock LLM and a test RSA key. No owner ledger, idea file or generated game was deleted to reset tests. No new runtime dependency was added. The sibling OAuth source was read and ported; its MIT notice is retained. The video-editing library is not used by this platform.

## Real network rehearsal

|Attempt|UTC start → finish|Observed result|
|---|---|---|
|1|2026-11-01T09:31:41.222Z → 2026-11-01T09:32:16.751Z|Real !play and !join reply worked. !race did not start with only one marble. Duel votes and private web input worked.|
|2|2026-11-01T09:33:05.515Z → 2026-11-01T09:33:20.645Z|All recorded checks true, including actual Twitch !race after adding one automated public-web participant.|

Raw first result: [retained failure](evidence/twitch-rehearsal-1793525536751.json). Raw second result: [successful rehearsal](evidence/twitch-rehearsal-1793525600645.json). Both include actual message IDs and timestamps. The first record is not overwritten or claimed successful.

Actual path: authenticated owner IRC command → Twitch service → application IRC receiver → game SDK action → public HTTPS/WSS state. An independent anonymous IRC connection observed the owner's commands and the bot's URL reply. This is real Twitch traffic, not `/admin/chat` injection. The sender is an automated owner-account helper; the additional race participant is an automated web client. Independent human audience participation is not established.

Real verified checks:

- `!play` created the owner's named marble; `!race` entered an actual moving race with two marbles.
- `!join` produced the public player URL in `gris_96` chat, observed back through Twitch IRC.
- Public player and OBS HTML returned 200; the WSS connection delivered actual game state. Streamer credentials enabled web input while ordinary viewers could not claim that role.
- Actual Twitch `!left` and `!fire` ballots produced the corresponding democracy decisions, while public WSS input moved the opposing streamer ship.
- Public `/admin/status` returned 403. Final unauthenticated localhost admin is also denied when the private admin key is configured.

Command send → anonymous IRC observation over 5 commands: min 0.271s, median 0.276s, max 0.286s. These are this rehearsal's command-transport measurements, not full player-render latency, an SLA or an independent benchmark.

Channel was **offline** during both rehearsals (`broadcastLive=false`). No stream ID, OBS transmission, rendered browser inspection, Twitch video or recording is claimed. Computer-use inventory returned no apps/browsers and “browser access host is unavailable.” HTTP/WSS checks do not prove that the canvas layout looks correct in a human browser.

Public rehearsal URL (temporary): https://activities-markets-disciplines-shall.trycloudflare.com. It expires when the quick tunnel stops. Do not use it as a durable judging deployment without arranging continued hosting.

## Authentication and paid-event evidence

[Account snapshot](evidence/twitch-account-status.json): actual login `gris_96`, user ID `137260402`, scopes `chat:read chat:edit`, `broadcaster_type=""`. The reused owner app/token validated successfully. Real app-token EventSub listing returned `[]`; no subscriptions were created. Additional user scopes and eligible broadcaster features remain prerequisites for paid-event testing.

The new subscription script constructs the requested `channel.subscribe` and `channel.bits.use` webhooks plus optional channel-point redemptions. App-token transport, callback and broadcaster conditions are tested against mocked API responses. Receiver HMAC, timestamp rejection, malformed payload handling and reward routing are covered by signed local fixtures. A repeated reward delivery changed the duel tally once. These are not actual subscriptions, purchases or redemptions. Ledger mutation and replay-journal append are separate writes, so crash-atomic exactly-once delivery is not claimed.

Hourly validation, refresh rotation, 401 retry, concurrent refresh coalescing, local OAuth state checks and private persistence are tested. The actual clock was not advanced by an hour against Twitch; hourly behavior is test evidence. Startup validation, authenticated receipt and public replies are actual Twitch evidence.

## Final test result

Command: `npm test`. Exit: 0. **56 passing checks** = 15 focused tests + 41 isolated legacy/integration checks. Details: [machine-readable validation](evidence/validation.json), [full output](evidence/test-results.txt).

The harness uses private ports, temporary source copies, test-generated RSA keys, isolated ledger/ideas/game directories and a private mock LLM. It checks both process exits and legacy printed FAIL lines. Normal tests do not use live Twitch credentials or the owner fund.

Final secret scan inspected 59 tracked/pending source/artifact files against seven actual credential/control-secret values: zero matches. .env was mode 600 and gitignored. No secret value was printed or committed. See `evidence/secret-scan.json` for the final result, including documentation and safe evidence additions.

## Remaining manual work and deadlines

- **OBS/Twitch:** owner visually checks both public player and overlay, privately unlocks streamer controls, then broadcasts authorized material and records actual Twitch chat alongside the overlay. Aim before Nov 2 14:00 UTC / 11:00 Santiago, leaving time to redo footage. No broadcast was started by Codex.
- **App / monetization:** the existing app already supports real chat. Only if demonstrating paid events, authorize additional EventSub scopes on a suitably eligible broadcaster, create subscriptions against the active tunnel and verify `enabled`; then observe actual authorized events. No need to buy anything for the core chat demo.
- **Generator:** set a real local/cloud provider and verify an actual generated game before claiming production generation or measured provider cost. Current end-to-end generator evidence uses a mock. No cloud key or donation was consumed by this work.
- **Repository:** owner creates/pushes the private repository and shares `testing@devpost.com`; include source, SDK, tests and instructions, exclude .env/runtime/ledgers. Arrange free judging access through Nov 15; quick tunnels are ephemeral. Codex performed no push.
- **Video:** follow the 2:45 shot list in `DEMO_SCRIPT.md`; include English narration/translation, actual Twitch behavior and the real Codex thread/commits. Public YouTube ready by Nov 2 19:00 UTC / 16:00 Santiago.
- **Devpost:** complete the URLs and review `SUBMISSION.md`; verify authorship/creation dates and eligibility personally. Target Nov 2 21:00 UTC / 18:00 Santiago, before the official 22:00 UTC / 19:00 Santiago cutoff. Reserve 17:00–21:00 UTC for stabilization and delivery.

Other inherited limitations: `node:vm` is not hardened isolation; actual Kick delivery is unverified; Chat Trivia remains a spec; identities are source/username rather than cross-platform verified identity; channel-point handling does not fulfill/refund rewards. These do not inherit a real-world validation claim from mock tests.
