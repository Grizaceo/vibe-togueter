# Vibe Arena

## What to try in two minutes

Start the local app, open `/studio.html`, propose a short game idea, vote, and inspect the streamer's review boundary. Open the player page, plant a tree with space or a click, and follow the permanent game/art/idea credits. Load Marble Race to try the fallback format. Twitch adds passive commands and `!join` after the operator connects their own channel.

Vibe Arena lets a stream community shape games while keeping creators visible. **The submission uses Plan B:** playable reviewed games and community decisions, plus evidence of an actual operator-run Codex VM build. The studio does not dispatch a coding worker automatically. Approved Seed Race remains unpublished; it is not the game currently served by a clean install. See [the scope decision](docs/platform/REORIENTATION.md).

## Run locally

For a disposable practice session without owner configuration, run `node scripts/demo-local.mjs` after installing dependencies. It prints loopback player/studio/overlay URLs and provides terminal controls for game switching, fallback and proposal/vote/review/approval. `stop` cleans up its temporary state. See [the later human/Twitch rehearsal checklist](docs/REHEARSAL.md). This session has no Twitch connection or coding worker.

Requirements: Linux with bubblewrap/user namespaces and `/usr/bin/node`, tested with Node 26.12.1. The local guest uses usr-merged library paths. Missing isolation support fails closed. Runtime dependencies are `ws` and `@modelcontextprotocol/sdk` and their locked dependencies.

```bash
npm ci
npm test
npm start -- --game-dir games/community-grove
```

Open `http://localhost:8420/` to play, `/studio.html` for ideas/resources, and `/overlay.html` for the OBS layout. No Twitch account, payment or coding-provider key is needed for local play. Grove uses the three bundled Kenney CC0 images; its source-pinned contributor record credits their origin even before an operator publishes a resource manifest. Kenney has not joined or endorsed this project.

Grove controls: browser arrows/A-D and space, or click a plot; Twitch `!plant 1–6`, `!water 1–6`, `!sun`. Grow all six trees; the round resets after celebration. Marble Race: browser players join directly, chat users send `!play`, then `!race` once at least two marbles exist. Democracy Duel: chat `!left`, `!right`, `!fire` selects one action per three-second voting window; the privately authenticated streamer uses browser movement and space.

```bash
node scripts/arena-admin.mjs load marble-race
node scripts/arena-admin.mjs load chat-vs-streamer
node scripts/arena-admin.mjs load community-grove
```

These administration commands are local. A second controller cannot acquire the same runtime lease. Do not reset an existing runtime journal to bypass reconciliation.

## Judge access and evidence without installation

The streamer/controller host targets **Linux** with bubblewrap and user namespaces; macOS and Windows native controller execution are unsupported. Players use a browser against that host. No stable hosted judging URL is available yet; the owner is reviewing free hosting. Do not treat a temporary rehearsal link as judging access.

Without installing, inspect the [720p overlay](docs/evidence/local-ui-1793568949942-overlay.png), [lobby](docs/evidence/local-ui-1793568949942-lobby.png), [studio](docs/evidence/local-ui-1793568949942-studio.png), [local browser checks](docs/evidence/local-ui-1793568949942-rehearsal.json), and [real isolated-build evidence](docs/platform/VM_TRIAL.md). These are evidence, not a playable hosted service. **Video URL: owner must add the public English YouTube recording before submission.** Linux judges can use the clean-install commands above; an existing Linux remote host can serve browser players on other operating systems. Hosting and video remain owner delivery actions.

## Connect an operator-owned Twitch channel

Run `npm run setup:local`, then edit the ignored local configuration yourself with your Twitch app details and registered callback URL. Authorize through `npm run twitch:auth`, check the safe summary with `npm run twitch:status`, and start:

```bash
npm start -- --twitch YOUR_CHANNEL --game-dir games/community-grove
```

OAuth validation/refresh and reconnecting IRC replies are implemented. Keep tokens, authorization codes and admin/streamer keys out of chat, URLs and recordings. Put a public player origin in `VA_PUBLIC_URL` only after arranging hosting/ingress and setup secrets. A temporary Cloudflare tunnel can be used for rehearsal; it is not a stable judging deployment. The local API rejects forwarded administration. Players can use the public URL; authenticated Twitch `!join` returns it in chat.

Enter the private streamer key in the player page to control the streamer side of Democracy Duel. The field clears and the key is not placed in browser storage or links. Studio owner tools also require local admin authentication and streamer confirmation. A web nickname never grants Twitch owner/moderator powers.

The [privacy notice](public/privacy.html) is served at `/privacy.html`, linked from all three pages. **Operator/contact were supplied by Cristóbal Muñoz; complete the visible hosting/recording placeholder and retention/deletion procedure before public operation.** Persistent ideas, ballots, creator and quarantine records currently require operator-managed retention/deletion.

## Safety and recovery

Reviewed local SDK code runs in a disposable Linux namespace process with an empty credential environment, bounded pipes and deadlines. The controller does not evaluate game callbacks. An unresponsive or failed game switches to Marble Race, retains connected players and displays the cause. A failed fallback stops instead of retrying indefinitely. Twitch broadcaster/moderators can request `!fallback`; the trusted IRC mod tag supplies authority. Local streamer POST `/admin/fallback` requires the confirmation key. [Runtime details and limits](docs/platform/LOCAL_RUNTIME.md).

Arbitrary generated artifacts still require separate build/test/runtime VMs. Cloud mode is the default, has no host fallback, and rejects automatic construction because the general worker is unconnected. MCP host installation is also blocked in that mode. Explicit `trusted-local` development is for owner-reviewed fixtures, not a substitute for arbitrary-game quarantine. No approved candidate is imported from `artifacts/` onto the host.

Creator credits are outside candidate rendering, tied to the actual source version, and always visible with license details collapsed. External reviewed game/idea/art authors can be recorded in the publication API. Source/resource changes invalidate attribution; clients receive snapshots through WebSocket without credit polling. [Credit publication](docs/platform/CREATOR_CREDITS.md).

State is sent at 10 Hz with compact drawing coordinates, optional negotiated compression and backpressure. Chat is throttled before broadcast/forwarding; ordinary web text is capped at 200 characters, with separately bounded idea submissions. [Reproducible traffic evidence](docs/platform/TRAFFIC.md).

The full hosting plan keeps cloud VMs as default and allows deliberate self-hosting: platform natively/in Docker/in a local VM, and contributed games in a separate local VM after streamer risk acceptance. Managed VMs need configurable inactivity limits and external cleanup; pausing alone still incurs memory/storage usage. Native Linux demo execution works today; Docker/local-hypervisor integration and the general VM supervisor remain pending. See [hosting/lifecycle requirements](docs/platform/HOSTING_POLICY.md).

## What is demonstrated

`npm test`: **179 checks = 97 focused + 82 isolated integration**, all passing. Tests use temporary state and mock coding providers. Separately, automated Chromium passed eight local UI checks, including actual browser keyboard input, visible credits and no credit polling. [Evidence index](docs/EVIDENCE.md).

Earlier saved network rehearsals establish actual Twitch commands/replies and public WSS effects for Marble Race, Democracy Duel and Grove. They used owner-account automation while offline; they are not independent audience or OBS evidence, and were not replayed in this revision.

A real owner-selected Codex/Terra subscription trial built Seed Race in a private VM, passed twelve checks in another VM and received exact source/report approval. All eight trial guests were destroyed. Its preview is static, not proof of live deployed gameplay. [VM trial](docs/platform/VM_TRIAL.md). Browser dispatch, Seed Race runtime deployment, stable public judging access, paid settlement and automatic job recovery are still pending. A [verified inert transfer package and costed runtime proposal](docs/platform/SEED_RUNTIME_PROPOSAL.md) are ready for review; no new hosting is authorized or provisioned.

The inherited treasury is **simulated build-credit accounting**, not money, donations or a claim that Bits, subscriptions or Channel Points finance builds. Event-credit simulation is off by default; `VA_SIMULATE_EVENT_CREDITS=1` is used only by isolated legacy fixtures. The generic donation route returns 410 by default. Real payment processing, creator checkout and provider reconciliation are not implemented. External Rust games are absent from the shipped catalog and recording path pending rights/hosting review.

## Authorship and delivery

The Devin CLI prototype is preserved at `fab3227`; it is not reattributed to Codex. Subsequent Codex sessions built the Twitch/studio/quarantine/VM increments and this audit-response implementation. An external read-only Devin audit informed findings; its prose, legal drafts and code were not imported. [Submission text and session IDs](SUBMISSION.md), [recording script](docs/DEMO_SCRIPT.md), [audit decisions and owner checklist](docs/platform/AUDIT_REPORT.md).

Future work: connecting the isolated builder and approved runtime, a creator-discovery feed, clips retaining game/art/idea attribution, and subscriptions that might subsidize compute under explicit budgets. These are proposals, not current integrations or revenue claims.

Feature freeze is November 2, 13:00 UTC; target submission 21:00 UTC, official close 22:00 UTC. The owner handles human Twitch/OBS rehearsal, English video, public YouTube, private repository push/judge access and Devpost submission. Nothing was pushed, published or submitted by this revision.
