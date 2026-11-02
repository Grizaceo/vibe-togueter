# Vibe Arena

## What to try in two minutes

Start the local app, open `/studio.html`, propose a short game idea, vote, and inspect the streamer's review boundary. Open the player page, plant a tree with space or a click, and follow the permanent game/art/idea credits. Load Marble Race to try the fallback format. Twitch adds passive commands and `!join` after the operator connects their own channel.

Vibe Arena lets a stream community shape games while keeping creators visible. **The main demo story is the real Studio-to-VM workflow:** owner-approved Lantern Table inputs → Codex subscription construction → inert quarantine → nine checks in another VM → exact owner approval → local reviewed evidence. The run took about 63 seconds from dispatch to tested/cleaned state; both guests are destroyed. [Exact evidence and limitations](docs/platform/LANTERN_TABLE_REVIEW.md). Reviewed bundled games remain the playable Twitch/browser foundation. Generated Lantern Table and Seed Race have no deployed runtime; their previews are static. The worker stays default-off and requires an explicitly configured allocation for each new run.

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

Without installing, inspect the [720p overlay](docs/evidence/local-ui-1793601419450-overlay.png), [lobby](docs/evidence/local-ui-1793601419450-lobby.png), [studio](docs/evidence/local-ui-1793601419450-studio.png), [local browser checks](docs/evidence/local-ui-1793601419450-rehearsal.json), and [real isolated-build evidence](docs/platform/VM_TRIAL.md). These are evidence, not a playable hosted service. **Video URL: owner must add the public English YouTube recording before submission.** Linux judges can use the clean-install commands above; an existing Linux remote host can serve browser players on other operating systems. Hosting and video remain owner delivery actions.

## Connect an operator-owned Twitch channel

Run `npm run setup:local`, then edit the ignored local configuration yourself with your Twitch app details and registered callback URL. Authorize through `npm run twitch:auth`, check the safe summary with `npm run twitch:status`, and start:

```bash
npm start -- --twitch YOUR_CHANNEL --game-dir games/community-grove
```

OAuth validation/refresh and reconnecting IRC replies are implemented. Keep tokens, authorization codes and admin/streamer keys out of chat, URLs and recordings. Put a public player origin in `VA_PUBLIC_URL` only after arranging hosting/ingress and setup secrets. A temporary Cloudflare tunnel can be used for rehearsal; it is not a stable judging deployment. The local API rejects forwarded administration. Players can use the public URL; authenticated Twitch `!join` returns it in chat.

Enter the private streamer key in the player page to control the streamer side of Democracy Duel. The field clears and the key is not placed in browser storage or links. Studio owner tools also require local admin authentication and streamer confirmation. A web nickname never grants Twitch owner/moderator powers.

The [privacy notice](public/privacy.html) is served at `/privacy.html`, linked from all three pages. **Operator/contact were supplied by Cristóbal Muñoz; complete the visible hosting/recording placeholder and retention/deletion procedure before public operation.** Persistent ideas, ballots, creator and quarantine records currently require operator-managed retention/deletion.

## Community co-credit

With `features.communityCredit: true`, approved inputs show their selected idea authors, supporting ballot count and actual approver in the Studio/overlay. These **input-round credits** are separate from the game already playing. No current bundled game is credited with votes from an unrelated round.

New quarantine tickets snapshot this participation metadata and include its fingerprint in the exact artifact binding. Published contributor metadata can carry the same snapshot; its visible “Voted by N · Approved by …” line appears only with matching game source. Delegated approvals identify the mod. Existing Seed Race bindings remain unchanged. Counts represent supporting voting identities, including unverified web sessions, not independently verified people. Disable the flag and restart to hide the added co-credit presentation without erasing recorded attribution.

## Temporary moderator approval

With `features.approvalDelegation: true`, the broadcaster can use `!delegate trusted_mod 10` to delegate **selected round-input approval** for ten minutes, or `!delegate off` to revoke it. Local Studio controls offer the same grant (maximum 30 minutes). The named account must still carry Twitch's moderator tag when sending `!build approve REVIEW_TOKEN`; it should inspect the current selected ideas/resources in the Studio first. Expiry, revocation, loss of mod status, web aliases and stale review tokens deny approval. The round history records the actual approver and delegated authority.

The grant is memory-only and expires on controller restart. It does not grant round editing, artifact rights attestation, final artifact approval or other private owner controls. Disable the flag and restart to remove it. The overlay shows the delegate and expiry.

## Free chat predictions

With `features.chatPredictions: true`, the broadcaster opens a 60-second prediction with `!prediction open Sun|Rain` (2–6 choices). Viewers use `!predict Sun`; their latest ballot replaces the previous one. The broadcaster uses `!prediction lock`, then `!prediction resolve Sun`, or `!prediction cancel`. The overlay recognizes correct predictions and labels the outcome as **reported by the streamer**. This is a chat-only feature: no money, Channel Points, Twitch Predictions API, scopes or eligibility dependency. Web sessions can also predict; winner labels distinguish web names from Twitch logins. Disable the flag and restart to remove it.

Predictions stay only in controller memory until the next prediction or restart. Recent command text also follows the existing feed policy. Game changes do not resolve predictions automatically; the broadcaster must resolve or cancel them honestly.

## Grove emote bursts

With `features.distinctPersonBursts: true`, **three different Twitch logins** sending the same ☀️ or 🌧️ within five seconds unlock a Grove bonus. Repeated messages from one login count once; web aliases do not count. Sunshine accelerates growing trees; rain adds growth to planted trees. The overlay shows progress and the game announces each bonus. Each emote has a five-second cooldown. Pausing clears pending bursts; game changes/reloads also reset them. Disable the flag and restart to remove this feature. These are account counts, not verified human identities.

## Preferred fallback games

Unlock local Studio controls and save **Safety fallback order**, or configure `fallback.order` before first startup. Supported IDs: `community-grove`, `chat-vs-streamer`, `demo`; Marble Race is always appended last. The owner preference persists in `runtime/fallback-preferences.json`. Only bundled source with matching contributor/resource fingerprints is eligible; edited, failed, candidate and external games are skipped. Failed recovery exhausts each candidate once, then stops. Disable `features.configuredFallback` and restart to restore Marble-only recovery.

## Streamer chat-effects pause

With `features.chatPause: true` in `vibe-arena.config.json`, the Twitch broadcaster or a moderator can use `!pause` and `!resume`. The overlay shows the pause. Incoming game commands, crowd pulses and mapped reward effects stop; browser play, ideas, votes and safety fallback continue. Game simulation and effects already applied to game state continue. This is a session control and resets on controller restart. Reward notifications received during pause are acknowledged without applying their game effect; this does not refund Channel Points.

The private local streamer can POST `{ "paused": true }` or `{ "paused": false }` to `/admin/chat-effects` with the usual admin/streamer headers. A browser nickname grants no pause authority. Set the feature to `false` and restart to disable the control.

## Safety and recovery

Reviewed local SDK code runs in a disposable Linux namespace process with an empty credential environment, bounded pipes and deadlines. The controller does not evaluate game callbacks. An unresponsive or failed game follows the streamer’s reviewed fallback order, retains connected players and displays the cause. Marble Race is always last; its default order contains only Marble. A failed fallback stops instead of retrying indefinitely. Twitch broadcaster/moderators can request `!fallback`; the trusted IRC mod tag supplies authority. Local streamer POST `/admin/fallback` requires the confirmation key. [Runtime details and limits](docs/platform/LOCAL_RUNTIME.md).

Arbitrary generated artifacts still require separate build/test/runtime VMs. Cloud mode is the default and has no host fallback. The experimental Studio worker is disabled by default until a new run has its own budget decision and fresh guest login; see [its implemented boundary](docs/platform/STUDIO_WORKER.md). MCP host installation is also blocked in that mode. Explicit `trusted-local` development is for owner-reviewed fixtures, not a substitute for arbitrary-game quarantine. No approved candidate is imported from `artifacts/` onto the host.

Creator credits are outside candidate rendering, tied to the actual source version, and always visible with license details collapsed. External reviewed game/idea/art authors can be recorded in the publication API. Source/resource changes invalidate attribution; clients receive snapshots through WebSocket without credit polling. [Credit publication](docs/platform/CREATOR_CREDITS.md).

State is sent at 10 Hz with compact drawing coordinates, optional negotiated compression and backpressure. Chat is throttled before broadcast/forwarding; ordinary web text is capped at 200 characters, with separately bounded idea submissions. [Reproducible traffic evidence](docs/platform/TRAFFIC.md).

The full hosting plan keeps cloud VMs as default and allows deliberate self-hosting: platform natively/in Docker/in a local VM, and contributed games in a separate local VM after streamer risk acceptance. Managed VMs need configurable inactivity limits and external cleanup; pausing alone still incurs memory/storage usage. Native Linux demo execution works today; Docker/local-hypervisor integration and the general VM supervisor remain pending. See [hosting/lifecycle requirements](docs/platform/HOSTING_POLICY.md).

The private Studio can now **prepare a VM during voting**, show remaining time, keep it ready in 15-minute increments up to the approved maximum, and close it. These controls do not approve inputs or call the model. Both worker/preparation flags ship off; new lease controls have local/mock and browser-fixture coverage, not a live extension trial. [Operation and limits](docs/platform/BUILDER_PREWARM.md).

## What is demonstrated

`npm test`: **270 checks = 160 focused + 110 isolated integration**, all passing. Tests use temporary state and mock coding providers. Separately, automated Chromium passed **26 local UI checks** and **14 normal-launcher browser checks**, including production input and visible credits. A disposable checkout also passed `npm ci`, the full suite, 10 launcher checks and six inert Seed-transfer checks. These separate checks are not added to the npm total. [Evidence index](docs/EVIDENCE.md).

Earlier saved network rehearsals establish actual Twitch commands/replies and public WSS effects for Marble Race, Democracy Duel and Grove. They used owner-account automation while offline; they are not independent audience or OBS evidence, and were not replayed in this revision.

The earlier Seed Race operator trial passed twelve separate-VM checks and exact approval; all eight earlier trial guests were destroyed. [Historical trial](docs/platform/VM_TRIAL.md). The new Studio connector's first attempt timed out and is preserved as failure evidence. After the stdin correction, a second owner-approved run built Lantern Table, passed nine distinct-VM protocol checks, confirmed both guests destroyed and saved exact owner-reviewed evidence with two known gameplay issues. No human gameplay or live generated runtime is claimed. [Owner review](docs/evidence/lantern-table-owner-review.json). Stable public judging access and paid settlement remain pending.

The inherited treasury is **simulated build-credit accounting**, not money, donations or a claim that Bits, subscriptions or Channel Points finance builds. Event-credit simulation is off by default; `VA_SIMULATE_EVENT_CREDITS=1` is used only by isolated legacy fixtures. The generic donation route returns 410 by default. Real payment processing, creator checkout and provider reconciliation are not implemented. External Rust games are absent from the shipped catalog and recording path pending rights/hosting review.

## Authorship and delivery

The Devin CLI prototype is preserved at `fab3227`; it is not reattributed to Codex. Subsequent Codex sessions built the Twitch/studio/quarantine/VM increments and this audit-response implementation. An external read-only Devin audit informed findings; its prose, legal drafts and code were not imported. [Submission text and session IDs](SUBMISSION.md), [recording script](docs/DEMO_SCRIPT.md), [audit decisions and owner checklist](docs/platform/AUDIT_REPORT.md).

Future work: improving candidate gameplay and connecting a separately approved runtime, a creator-discovery feed, clips retaining game/art/idea attribution, and subscriptions that might subsidize compute under explicit budgets. These are proposals, not current integrations or revenue claims.

Golden-path go/no-go is November 2 at 10:00 UTC; feature cutoff is 15:00 UTC; stabilization/human rehearsal is 15:00–17:00 UTC; target submission 21:00 UTC, official close 22:00 UTC. The owner handles human Twitch/OBS rehearsal, English video, public YouTube, private repository push/judge access and Devpost submission. Nothing was pushed, published or submitted by this revision.
