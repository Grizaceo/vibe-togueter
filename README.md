# Vibe Arena

A Twitch/Kick chat-games platform with two participation modes: open the public web lobby and play directly, or stay in chat and send commands. Existing games follow a fixed SDK and can be adapted live; the inherited fund ledger and OpenAI-compatible generator support commissioning new SDK games.

This submission extends an existing prototype. `fab3227` records the inherited code. Codex-authored changes follow it on `feat/twitchcon-codex`; see `SUBMISSION.md` and `docs/EVIDENCE.md`. Runtime dependencies remain **ws + @modelcontextprotocol/sdk**. Tested with Node 26.12.1 and `--experimental-vm-modules`.

## Community studio increment (November 1)

The product direction is a free-first community game studio, with independent creators visible through clickable credits. Read [the platform vision](docs/platform/VISION.md) and [integration audit](docs/platform/INTEGRATION_AUDIT.md) for the wider scope and the boundaries of this increment.

Open `/studio.html` for proposals, replacement ballots, streamer selection/approval and a reviewed free-resource catalog. Local owner controls require both private admin and streamer keys; public viewers cannot approve builds or resources. Resource submissions currently accept metadata and a public HTTPS URL, not binary uploads. The browser can compute a local file fingerprint without uploading it. Creator names, license notices, website and social links appear in the selected pack's credit preview. That preview is not proof that a published game uses the pack. The new Community Grove example separately binds its approved source and bundled art to a published credit manifest, displayed on the actual player/OBS pages; see [creator game evidence](docs/platform/CREATOR_GAME_DEMO.md).

Three bundled Kenney CC0 images can be imported by a local owner through `/admin/assets/import`, with keys listed in `public/curated/kenney-background-elements/provenance.json`, then reviewed through the studio. The importer verifies actual bundled bytes. They are labeled curated public resources: Kenney has not joined or endorsed this platform. Original archive and working files stay outside this repo.

An owner-operated [build artifact quarantine journal](docs/platform/BUILD_QUARANTINE.md) now receives immutable candidate source as data, binds test receipts and approval to hashes, and preserves failed/interrupted attempts. Its HTTP/CLI path is tested locally. A subsequent [real Codex VM trial](docs/platform/VM_TRIAL.md) built Cooperative Seed Race through a fresh subscription login, tested the artifact in a separate guest and received exact owner approval. Reports remain operator-attested; the game is not deployed and this is not a general worker service.

Build execution defaults to **cloud VM**, with no fallback to the streamer PC. The web/MCP generation path does not dispatch the operator VM tools yet, so it is intentionally blocked with `isolated_builder_required`. A deliberate `VA_BUILD_MODE=trusted-local` opt-in retains the inherited generator for trusted local use; it also requires an exact approved community round. Paid creator checkout and commission are not configured. Neither a real payment processor nor actual VM/API expense reconciliation is implemented.

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

## External Rust game runtimes

The studio's Games section lists the two existing public CreateOS Rust demos. Local owner controls can check both runtimes, create a falling-blocks lobby, share its browser link and start after players join. State is journaled with idempotent creation and explicit reconciliation. No automatic start is placed in viewer links. Tee Arena has a browser link, health check and an owner-enabled Twitch crowd bridge: `!tee on`, then viewers use `!tee left|right|jump|hook|fire|stop`; `!tee off` disconnects. The crowd shares one character with latest-command pulses; it is not per-viewer multiplayer or democracy voting. Inputs expire after 350 ms and an idle bridge closes after 60 seconds. The bridge is off after restart. Real Twitch-to-CreateOS movement and acknowledgements were rehearsed with owner-account commands; see docs/EVIDENCE.md. Both remote backends are public and lack platform-enforced private access. See [remote integration and rehearsal](docs/platform/REMOTE_GAMES.md).

## Illustrated cooperative example

**Community Grove** (`games/community-grove` / `templates/community-grove`): Twitch `!plant 1–6`, `!water 1–6`, `!sun`; web users click a plot or use arrows/A-D and space. Grow six trees together; a completed grove resets after eight seconds. Uses actual Kenney CC0 art with creator website/social and license links on the player and OBS pages. Publication pins the source hash and verifies the bundled images. `node scripts/rehearse-grove.mjs --live` reproduces the authorized network check. This is an original trusted example, not evidence of a functioning VM coding worker.

## Two other implemented SDK formats

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

`!idea TEXT` enters a durable community round (default 100 words, first 10 ideas, one proposal per actor). `!vote ID` replaces that actor's ballot. The owner controls `!build open|vote|close|choose IDs|approve TOKEN|cancel|status`; the local studio offers the same decisions with a pinned review token. Changing selected resources invalidates approval. Interrupted builds require reconciliation. The generation ledger check remains necessary, together with matching round approval and an explicit execution policy. Existing configuration supports a local OpenAI-compatible endpoint (default Ollama/Qwen) or cloud credentials through `VA_BASE_URL`, `VA_MODEL`, `VA_API_KEY`. The actual configured model provider is not verified in this session; the fund→generation→SDK load loop is tested with a mock. Configure and verify your chosen real provider before showing actual generation or billing in the video. Funds are a local accounting ledger, not a payment processor or proof of actual provider debit.

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
