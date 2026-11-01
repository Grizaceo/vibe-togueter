# Vibe Arena

A Twitch/Kick chat-games platform with two participation modes: open the public web lobby and play directly, or stay in chat and send commands. Existing games follow a fixed SDK and can be adapted live; the inherited fund ledger and OpenAI-compatible generator support commissioning new SDK games.

This submission extends an existing prototype. `fab3227` records the inherited code. Codex-authored changes follow it on `feat/twitchcon-codex`; see `SUBMISSION.md` and `docs/EVIDENCE.md`. Runtime dependencies remain **ws + @modelcontextprotocol/sdk**. Tested with Node 26.12.1 and `--experimental-vm-modules`.

## Install and private setup

```bash
npm ci
cp .env.example .env  # fresh checkout only; never overwrite configured credentials
npm run setup:local  # generates private admin/streamer/webhook secrets; mode 600
```

Edit .env locally with your Twitch app's client ID, client secret, own channel login and exact registered redirect (default `http://localhost:3000/callback`). A Confidential Twitch application and account 2FA are required for the authorization-code flow. Do not paste tokens into chat, code, public URLs, recordings or command-line arguments.

```bash
npm run twitch:auth       # authorize chat:read chat:edit through your browser
npm run twitch:status     # safe login/scope/expiry summary only
npm start -- --twitch YOUR_CHANNEL --game-dir games/marble-race
```

The server validates the token at startup and before each hour, refreshes tokens during hourly maintenance and retries a 401 once. Tokens rotate atomically into ignored mode-600 .env. The application requires the authorized account to own the specified channel and never silently falls back to anonymous read-only chat. `npm start` without `--twitch` still runs local/web play.

## Public player and OBS overlay

```bash
cloudflared tunnel --url http://localhost:8420
```

Save the returned HTTPS URL as `VA_PUBLIC_URL` in .env, then restart the application. `!join` / `!unirse` replies with the public player URL in your actual Twitch channel. A quick tunnel is temporary; use stable hosting/a named tunnel for reliable longer-term access. Restarting the tunnel changes its URL and requires updating any webhook subscriptions.

- Player: `http://localhost:8420/` locally, or your public tunnel URL.
- OBS browser source: `http://localhost:8420/overlay.html`, suggested 1600×900.
- Private streamer controls: enter `VA_STREAMER_KEY` from your local .env into the player page's password field and unlock before recording. The field clears after submission; keys are not placed in URLs or localStorage.
- Local administration uses `VA_ADMIN_TOKEN`. Requests forwarded through the public tunnel are rejected, including with an admin token. MCP reads the local secret automatically.

```bash
node scripts/arena-admin.mjs load marble-race
node scripts/arena-admin.mjs load chat-vs-streamer
node scripts/arena-admin.mjs status
```

## Two implemented formats

**Marble Race** (inherited): `!play` adds your marble; browser players also join. `!race` starts when at least **two** marbles exist. `!reset` clears the race. The HUD's Spanish phrases mean “marbles / play to join / race to start.”

**Democracy Duel** (Codex-authored `templates/chat-vs-streamer/game.js`): chat votes `!left`, `!right`, `!fire` (also `!izq`, `!der`, `!disparar`). Each source/username has one latest ballot per three-second window. Majority determines one action; deterministic rotating ties avoid a permanent preferred option. No votes means hold position. The streamer moves with A/D/arrows or pointer input and fires with space. Three hits ends the round, followed by an automatic restart. Ordinary web viewers cannot drive the streamer ship. Vote identity is source plus username, not cross-platform identity verification.

Chat Trivia remains a spec. Anarchy, subscription-weighted and paid voting are not implemented. A companion webpage / OBS browser source is not a Twitch Extension.

## EventSub subscriptions and reward commands

Normal chat requires no Affiliate/Partner status. Monetized Twitch events and custom rewards additionally depend on broadcaster eligibility and granted scopes. The rehearsed `gris_96` account returned no Affiliate/Partner status and currently grants chat scopes only; real paid events have not been demonstrated.

```bash
npm run twitch:auth -- --events
npm run twitch:subscribe -- --points
npm run twitch:subscribe -- --list
```

The first command requests `channel:read:subscriptions bits:read channel:read:redemptions` in addition to chat scopes. The subscription script then uses an **app access token** from the same client, creating `channel.subscribe`, `channel.bits.use`, and optionally `channel.channel_points_custom_reward_redemption.add` webhooks at `VA_PUBLIC_URL/webhook/twitch`. It prints safe IDs/status only; check for `enabled`, since callback verification may initially be pending. HTTP 409 is reported as an existing subscription; changing a tunnel may require deleting the stale subscription in the Twitch app console/API first.

`VA_EVENTSUB_SECRET` must match the receiver. Defaults from setup are private random alphanumeric strings. Signed notifications are checked for HMAC, timestamp and duplicate delivery. Recent delivery IDs are restored from ignored runtime storage on restart. Ledger updates and delivery-journal writes are separate operations; exactly-once processing across a crash between those writes is not guaranteed.

Configure exact title-to-command mappings in `vibe-arena.config.json`:

```json
"twitch": { "rewardCommands": {
  "Join race": "!play",
  "Start race": "!race",
  "Vote left": "!left",
  "Vote right": "!right",
  "Vote fire": "!fire"
} }
```

Redeemers are attributed to their Twitch username; unknown titles are reported as unmapped. Only the configured command is used, never the viewer's free-text input. This routes game commands and does not automatically fulfill/refund rewards. Restart after config edits.

## Existing generation fund and MCP

`!idea TEXT` stores an idea. A local operator or MCP tool can request generation when the ledger covers `generator.gameCostUsd`. Existing configuration supports a local OpenAI-compatible endpoint (default Ollama/Qwen) or cloud credentials through `VA_BASE_URL`, `VA_MODEL`, `VA_API_KEY`. The actual configured model provider is not verified in this session; the fund→generation→SDK load loop is tested with a mock. Configure and verify your chosen real provider before showing actual generation or billing in the video. Funds are a local accounting ledger, not a payment processor or proof of actual provider debit.

`src/sdk-prompt.md` is the game contract. `src/gamehost.js` retains the original 30 Hz tick, hot reload and `node:vm` loader. Only trusted games should be loaded: `node:vm` is not hardened isolation. Do not expose admin credentials or activate unreviewed generated code in a production environment.

```bash
npm run mcp  # stdio; existing .devin/mcp_config.json points here
```

Existing tools include status, SDK/template discovery, install/load, generation, ideas, treasury and local command injection. Local tests are labeled separately from Twitch evidence.

Kick's existing receiver verifies RSA signatures. Configure a Kick developer app and use `scripts/kick-subscribe.mjs` for official webhook chat. Actual Kick delivery and replies remain untested in this session; see `docs/COMPAT.md`.

## Tests and authorized real rehearsal

```bash
npm test
# Explicitly sends !play !race !join !left !fire in your own configured Twitch channel:
node scripts/rehearse-twitch.mjs
```

`npm test` runs auth/game tests plus all four inherited suites and HTTP/WSS integration in a temporary copy with a private mock LLM and isolated ledgers/games. It fails on printed FAIL results even if a legacy test exits zero. It does not erase or spend the owner's fund, ideas or generated games. No additional runtime dependencies are installed.

The rehearsal requires the live application, active public tunnel and existing OAuth. It uses actual Twitch commands, an anonymous IRC observer for the bot reply and public WebSocket input/state; it writes timestamped JSON under `docs/evidence/`. Two marbles include one automated web participant. It can run while the channel is offline and does not establish an actual OBS broadcast or independent human audience test.

## Submission

Use `SUBMISSION.md`, `docs/DEMO_SCRIPT.md` and `docs/EVIDENCE.md`. The owner records a real Twitch/OBS video under three minutes, uploads it publicly to YouTube, publishes the repository privately and grants `testing@devpost.com` access, then submits the real Codex Session ID. No push or submission is performed by these scripts. Do not commit .env, ledgers, private keys or runtime files. Retain the MIT notice for the OAuth source port under `LICENSES/`.
