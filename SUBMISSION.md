# Vibe Arena

**Tagline:** A stream's chat becomes the game controller—and the game studio.

## Inspiration

Stream communities contain people who want to play actively and people who want to stay in chat. Vibe Arena brings both into the same game. A fixed game SDK also lets a creator adapt a format with an AI coding assistant instead of building a new multiplayer platform each time.

## Current platform scope

The expanded product is a free-first community game studio, with independent artist visibility at its core. `/studio.html` implements limited idea rounds, replacement ballots, streamer selection and exact content/resource approval, plus a curator-reviewed free resource catalog with license notices and creator links. Three Kenney CC0 images are curated public resources, not artist signups. The selected pack has a credit preview; final generated-game credit enforcement is pending.

Configured Rust browser demos are listed as external runtimes. The falling-blocks adapter can create, share and start a public lobby; Tee Arena currently has health inspection and a browser link. Their game code was built by parallel agents, not this Codex session. Passive Twitch control of those Rust runtimes is pending. Backend privacy and distribution rights require further work.

Coding execution defaults to a separate cloud VM with no automatic host fallback. No isolated coding worker is connected yet; generation therefore returns a clear blocked result. The inherited generator remains available only with explicit trusted-local configuration and matching round approval. Paid creator checkout, VM/API budget separation, actual payments, Agent Native connections and the specialized PR safety gate are not complete. This is a working platform increment, not a claim that the full vision ships today.

## What it does

Vibe Arena hosts small multiplayer games on a temporary public URL and an OBS browser-source overlay. In Marble Race, viewers send `!play` in Twitch chat and `!race` starts the race once at least two marbles exist. `!join` replies in the owner's actual channel with the public browser lobby.

Democracy Duel is a second implemented format: chat votes `!left`, `!right` or `!fire` in three-second windows, while the streamer directly controls the opposing ship from the browser. A person's latest vote replaces their earlier vote. The winning action visibly moves or fires the chat-controlled ship. Private streamer controls prevent ordinary browser players from driving the streamer's side.

The inherited platform also supplies an SDK game host, hot reload, MCP tools and a donation-fund ledger connected to an OpenAI-compatible game generator. New Twitch integrations add private OAuth lifecycle handling and signed EventSub reward-title-to-command routing.

## How we built it

Node ESM, HTTP/WebSocket transport, the existing sandboxed SDK game contract and the existing generic canvas client. Runtime dependencies remain `ws` and `@modelcontextprotocol/sdk`. Tokens and local control secrets stay in an ignored mode-600 .env. Twitch validates at startup and before each hour; tokens refresh during hourly maintenance and after a 401. EventSub webhook subscription creation uses an app access token after broadcaster user-scope authorization.

The server restricts administration to authenticated local requests and rejects requests forwarded by the public tunnel. Generated games still run in `node:vm`, which is an accident barrier rather than a hardened isolation boundary.

## How Codex was used

Real Codex Session ID: **01a19536-0f02-7fc3-b030-d6b6fd8e170c**.

At takeover, the prototype already contained the server, SDK game host, generic client and OBS overlay, chat adapters, signed webhook receivers, treasury, generator, MCP integration and Marble Race. Commit `fab3227` records that inherited source; it is not claimed as newly authored by this Codex session. The owner must confirm the original work's creation dates fall within the event's submission period.

Codex's new work is visible in subsequent commits: porting the sibling project's OAuth lifecycle into Node, repairing tagged IRC parsing and reconnecting replies, creating EventSub subscriptions, mapping reward titles into game commands, building Democracy Duel, adding private streamer controls, testing public-tunnel administration restrictions, isolating test data, and running a real Twitch-chat rehearsal. Later commits add durable community rounds, pinned approvals, a reviewed creator studio, curated licensed art and external runtime adapters. The OAuth port follows `stream-to-shorts/twitchcon-app`; its MIT notice is retained in `LICENSES/`. The Python editing pipeline is not a dependency of Vibe Arena.

## Challenges and accomplishments

Reconnecting IRC sockets previously left the reply function bound to the old connection, and tagged messages were missed. The new stable controller addresses both. A first real race rehearsal correctly failed with only one marble; the second succeeded after a web participant joined. This failure and its correction are both retained in the evidence.

Real Twitch commands, real bot replies and public HTTPS/WSS gameplay were verified on `gris_96`. Democracy votes and private web controls affected the game through those actual network paths. This was performed with automated owner commands while the channel was offline; it is not a claim of independent audience testing or a live OBS broadcast.

## Validation and limits

See `docs/EVIDENCE.md` for exact timestamps and command results. `npm test` runs isolated mock-provider tests and focused auth/game tests without modifying the owner's fund or ideas.

Signed local EventSub/Kick fixtures verify receiver behavior; real paid events have not been received. The configured channel reports no Affiliate/Partner status, and its existing authorization only grants chat scopes. Extra authorization and an eligible broadcaster are needed to test monetized events. Channel-point routing is implemented, not demonstrated by a real redemption. No real money was spent or real donation claimed during this rehearsal.

The generator-to-fund loop has mock-provider evidence. Actual cloud/local-model generation and actual provider billing remain unverified here. Chat Trivia, subscriber-weighted voting and paid-vote modes remain specs/unimplemented. Browser visual inspection was unavailable in this agent session; the owner must check layout and record the video. There is no Twitch Extension.

## Built with

JavaScript, Node.js ESM, WebSocket, Twitch IRC, Twitch OAuth, Twitch EventSub, OBS browser source, Cloudflare Tunnel, MCP, OpenAI Codex.

## Submission fields to complete

- Repository URL: owner creates/pushes the private GitHub or GitLab repository and shares access with `testing@devpost.com`. No push was performed by Codex.
- Public YouTube URL: owner records the real Twitch/OBS demo under three minutes using `docs/DEMO_SCRIPT.md`.
- Testing instructions: `README.md`, with a fresh operator-owned Twitch app/token. Never share the owner's .env with judges.
- Codex thread: use the real Session ID above and show the corresponding thread/commit contribution in the video.

[Official rules](https://twitchcon-codex.devpost.com/rules), checked November 1, 2026, require repository access, a description of features and Codex use, the build thread's Session ID, and public YouTube footage showing both Twitch functionality and Codex work. Submission materials need English or English translations. Current deadline: November 2, 2026, 14:00 PST / 22:00 UTC / 19:00 Santiago. Target submission by 21:00 UTC / 18:00 Santiago; reserve 17:00–21:00 UTC for final review and delivery.
