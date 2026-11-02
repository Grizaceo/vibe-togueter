# Evidence — Vibe Arena, November 1, 2026

## Current increment snapshot — November 2

Current suite: **271 checks (161 focused + 110 isolated integration)**, [full output](evidence/freeze-suite.txt). [36 local UI checks](evidence/freeze-ui-checks.json), [14 normal-launcher browser checks](evidence/freeze-normal-browser-checks.json), 10 disposable launcher checks and six inert Seed-transfer checks pass separately. [Clean checkout](evidence/freeze-clean-install.json) records its exact commit and passed npm ci and the full suite; cleanup is confirmed.

The final pre-freeze audit tested snapshot `8a58ad3`: both Node 26.12.1 and the `/usr/bin/node` 26.12.0 service profile pass 271 checks. [Audit and source fingerprint](evidence/freeze-clean-install.json), [service-profile output](evidence/freeze-system-node-suite.txt), [720p](evidence/freeze-ui-overlay-crowded-720p.png), [1080p](evidence/freeze-ui-overlay-crowded-1080p.png), [gray disabled controls](evidence/freeze-ui-studio-owner.png) and [resource count](evidence/freeze-ui-studio-resources.png). These are automated local captures, with assistant visual inspection.

The additional normal-launcher harness first [failed on stale UI wording](evidence/freeze-normal-browser-first-failure.json); that failure and cleanup remain recorded. Its corrected [targeted replay](evidence/normal-browser-copy-fix.json) and final clean-checkout run both pass all 14 checks. This changed the harness assertions, not production behavior. [Final configured-value scan](evidence/freeze-secret-value-scan.json) found no matches for seven configured secrets in 560 tracked/nonignored files; it is not a generic or history-wide scan. [Draft recording check](evidence/freeze-recording-check.json) confirms 320 words and 39 matching cues on a 2:45 draft, not a finished video. [Tee Plan B decision](evidence/tee-gate-decision.json) records the passed deadline and no new VM run.

The real Lantern Table workflow completed in about 63 seconds from dispatch to tested/cleaned state: fresh subscription login, actual approved inputs, Codex construction, distinct test VM, nine protocol checks, verified destruction of both guests and exact owner approval saving [local reviewed evidence](evidence/studio-build-e21fef6b-03c9-4946-812f-5f618e4f1877.json). [Owner receipt](evidence/lantern-table-owner-review.json), [review and known gameplay limitations](platform/LANTERN_TABLE_REVIEW.md), [actual status observations](evidence/increment-real-rerun-status.json), [static preview](evidence/lantern-table-static-preview.png). Zero audience ballots; no generated runtime, candidate host execution or human gameplay is claimed. Three resource checks are vacuous because no assets were selected.

The first real attempt's [timeout](evidence/increment-real-attempt.json) remains evidence. The managed-stdin [probe](evidence/increment-stdin-probe.json) and red-to-green regression led to the separately authorized successful run. New [streamer warm controls](platform/BUILDER_PREWARM.md) have local/mock/browser coverage and a complete [real prepare/extend/pause/resume/close verification](evidence/prewarm-real-control-verification-v2.json). It used one guest, no model/login completion/candidate, and verified destruction in about 46 seconds. The first failed fixture and its cleanup reconciliation remain recorded. [Scope](platform/PREWARM_CONTROL_VERIFICATION.md). Their race/recovery failures remain in `increment-prewarm-*-red.txt`. Worker and preparation flags ship off.

The [roles revision](platform/LANTERN_ROLES_REVIEW.md) passed 14 controlled gameplay/role checks in one separate test guest, which is verified destroyed. Exact owner approval saved [local reviewed evidence](evidence/lantern-roles-reviewed-publication.json). The controller authored this inert revision of the VM-built parent; no new coding-model call or login was used. No full natural five-round balance, human/Twitch play or runtime deployment is inferred.

[New 720p crowded overlay](evidence/local-ui-1793614056771-overlay-crowded-720p.png), [1080p counterpart](evidence/local-ui-1793614056771-overlay-crowded-1080p.png) and [disabled Studio controls](evidence/local-ui-1793614056771-studio-owner.png) show delivery polish O14/O15/O16/O21. Chromium checked geometry, singular labels, neutral disabled controls and the inherited prototype credit. This remains automated local evidence. A later [layout regression](evidence/overlay-sidebar-regression.json) covers one and ten selected authors with maximum-sized summary fields. The [720p synthetic scene](evidence/local-ui-1793614056771-overlay-synthetic-max-10authors-720p.png) is a layout fixture, not a real audience round.

The [current configured-secret scan](evidence/delivery-secret-scan.json) checked 493 tracked working-tree files against seven configured secret values, with zero matches. It is not a history-wide or generic credential-pattern scan.

An earlier [loopback-only replay](evidence/loopback-browser-rehearsal.json) passed the same 35 browser checks in a disposable archive; retained layout screenshots remain from the earlier layout pass. The integration runner's [cleanup check](evidence/private-test-cleanup.json) confirms 271 passing checks and removal of its temporary source/key tree. [Bundled credit verification](evidence/bundled-credit-check.json) confirms the supplied owner name and source/resource pins across all four bundled paths without evaluating game modules.

The [long-banner regression](evidence/overlay-long-banner-regression.json) adds a bounded fallback notice and whole feed rows, including restoration after space grows. Its full local browser run passes 36 checks. [Studio wording capture](evidence/local-ui-1793614056771-studio-games.png) leads with playable reviewed games and distinguishes static build evidence from future runtimes.

The [Studio round-count check](evidence/studio-round-counts-check.json) retains all 36 passing browser checks and a [targeted capture](evidence/studio-round-counts.png). It uses singular voting-session and selection-slot labels, preserving the distinction between unverified sessions and people. The later [resource-count replay](evidence/studio-resource-counts-check.json) extends the same check to distinct published-version usage, with a [targeted capture](evidence/studio-resource-counts.png), and passes 36 browser checks and the 271-check suite.

The later [overlay CSS cleanup replay](evidence/overlay-css-cleanup.json) passes the full 36-check browser run and 271-check suite after consolidating the feed selector and removing styling for hidden overlay details. [Unused Studio style removal](evidence/studio-unused-style-check.json) separately passes the same checks after deleting the unreferenced `.numbers` selector. Current captures above remain the visual references.

The dated sections below preserve historical counts/failures. No human/Twitch/OBS/video, hosting deployment, settled provider cost or public submission is inferred from local automation.

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

Earlier prototype command: `npm test`. Exit: 0. **56 passing checks** = 15 focused tests + 41 isolated legacy/integration checks. Details: [machine-readable validation](evidence/validation.json), [full output](evidence/test-results.txt).

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

## Community studio and external runtimes — later increment

See [studio evidence](platform/STUDIO_INCREMENT.md), [served resource fingerprints](evidence/studio-increment-2026-11-01.json) and [runtime adapter](platform/REMOTE_GAMES.md). Three real Kenney CC0 resources are published with explicit curated origin and clickable creator credits in a selected-pack preview. The build VM policy is active: an actual request was blocked as isolated_builder_required without ledger changes. No coding worker is connected.

The remote runtime rehearsal at 11:43 UTC failed because a ten-character room code was truncated upstream to eight; [failure retained](evidence/remote-games-1793533408317.json). The source constant MAX_ROOM=8 was checked and the adapter repaired. Only that rehearsal's empty room was joined and closed for cleanup. The second attempt at 11:44 UTC passed all nine checks: [remote protocol evidence](evidence/remote-games-1793533461882.json). Both public runtimes answered health checks. Two automated v2 clients joined the new falling-blocks room, received Begin and six snapshots each, then disconnected; the room reconciled as missing. This does not establish browser rendering or human play. The recorded create timing of 2 ms in that run is the idempotent retry, not the original remote creation; the script now retains all timing samples rather than overwriting them.

The final Vibe suite for this adapter passed 43 focused checks plus 49 isolated legacy/integration checks (92 total), zero failures. Log: /tmp/vibe-arena-remote-tests.log. The separate Rust tests remain 14 and 13; do not merge those counts. Computer-use was retried and still returned no browsers / browser access host unavailable. New UI has no visual verification here.

Review found and repairs covered concurrent creation/reconciliation, stable pending request IDs across UI refreshes, and strict backend room-status types before any start or state reconciliation. No runtime dependencies were added. Backend direct APIs remain public; Tee passive chat input remains pending at this increment.

## Real Twitch → Tee runtime bridge

First attempt at 13:49 UTC received the actual Twitch enable command and remote snapshots, but asserted on an input acknowledgement before it arrived: [failure retained](evidence/tee-twitch-1793540985416.json). The verifier now waits for a positive remote input acknowledgement rather than assuming the first snapshots contain one.

Second attempt at 13:50 UTC passed nine checks: [success](evidence/tee-twitch-1793541021702.json). Actual owner-channel IRC messages `!tee on`, `!tee right`, `!tee jump`, `!tee fire`, `!tee off` were observed by a separate anonymous IRC connection. Remote authoritative snapshots showed a maximum +306.01 horizontal displacement in game units after the right command. The fire-command sequence was acknowledged by the server; no kill/damage is claimed. The owner stop closed the bridge. Broadcast remained offline. No independent human viewers, browser rendering or OBS footage were tested.

The separate reviewer hit its service usage limit before this bridge review ran. The earlier studio and runtime-adapter reviews remain valid for their increments; this bridge instead received local sequential review, codec golden checks, lifecycle/input unit checks, permission probes and real network rehearsal. Do not describe this last review as independent.

Final bridge suite: 46 focused plus 52 isolated legacy/integration checks = **98 passing checks**, zero failures; `/tmp/vibe-arena-tee-tests.log`. New permission probes confirm a forged web broadcaster cannot enable the socket, missing streamer confirmation is denied, and a local owner can disable it. These tests make no real model/payment calls.

## Curated illustration becomes a cooperative game

[Community Grove evidence](evidence/grove-1793541737514.json): eight checks passed against actual Twitch and public HTTPS/WSS at 14:02 UTC. Real owner commands !plant 3, !water 3 and !sun changed the game-state HUD; automated web input planted a tree sprite. The served version SHA-256 matched the published creator manifest, including Kenney attribution, website and social links. This does not prove canvas rendering or independent human gameplay. The example is original trusted code from this session, not output of a VM coding agent or a public idea vote.

[Creator publication details](platform/CREATOR_GAME_DEMO.md). Final suite: **107 passing checks** = 50 focused + 57 isolated integration, zero failures. Counts generated from the test log in [validation-platform.json](evidence/validation-platform.json). No personal funds, model APIs or payment endpoints were used by those tests. A sequential local review covered publication hash binding, safe paths, immutable credit records and frontend version matching; independent reviewer service remained unavailable.

## Real Codex VM construction and exact owner approval — continuation

Session `01a19776-75a5-7e91-b5c1-f108c345dc8c` extends the prior session and inherited baseline; it does not author the entire prototype or the Rust games. [Detailed scope, commands and failures](platform/VM_TRIAL.md).

The owner chose Codex/gpt-6.1-terra, a fresh subscription login in the guest, Cooperative Seed Race with reviewed Kenney art, and finally approved exact source SHA-256 `f145319f61feb57ffbb41a0057954f5533b59d28caed10f3a625d751ef812105`. No real Twitch proposal/ballot selected this trial. Its round and evidence explicitly identify an owner-selected trial. The host received source as inert data; construction occurred in the separate authenticated VM and dynamic execution occurred only in new quarantine VMs.

[Actual access check](evidence/codex-vm-access-1793544636251.json), [initial build](evidence/seed-race-build-1793544931163.json), [readability revision](evidence/seed-race-revision-1793545531231.json), [12-check final guest execution](evidence/seed-race-quarantine-1793545575065.json), [owner approval](evidence/seed-race-owner-approval-1793545735358.json). The first dynamic harness had three failed checks because it passed state twice to GameHost.safeCall; [failure retained](evidence/seed-race-quarantine-1793545125769.json). Its correction passed 11 checks for the initial source before the final revised source passed 12. These guest checks are separate from npm test and the Rust counts.

[Static frame preview](evidence/seed-race-preview.png) was actually rendered by Chromium using the trusted platform renderer and frame JSON from quarantine, then visually inspected. No candidate JavaScript executed on the host. This is not interactive browser gameplay, a Twitch test of this new game, human audience evidence or OBS/video verification. Earlier failed browser-control attempts remain valid historical records.

[Cleanup](evidence/builder-cleanup-1793545844368.json) confirmed all eight VMs created by this continuation destroyed, including the fresh subscription auth cache. Both existing Rust runtimes remained running and untouched. The owner ceiling was USD 3 for VM use; paid API use was replaced by subscription authentication. No API key or paid API request was used, and actual VM invoice settlement is not reconciled. Guest-reported token usage is retained without equating it to API prices or subscription credits.

Read-only adversarial reviews reproduced lifecycle/input/approval defects; fixes have red-to-green regressions. Reviews examined code and saved results/preview; the reviewer did not independently query the provider or execute the candidate. Final local/isolated counts and full log are in [validation-platform.json](evidence/validation-platform.json). The script-specific guest results above must not be silently merged with those counts.

The approved game remains review material in artifacts/, outside games/ and public/, with version-bound creator metadata. It is not published or loaded locally. General web/MCP worker dispatch, a separate game deployment/runtime, real chat for this game, privacy/access enforcement, VM/AI reservations/settlement, payments, Agent Native and arbitrary uploads remain engineering work. No push occurred.

The prior public quick tunnel returned HTTP 530 during this continuation, and no controller listened on 8420 when inspected; no old process was killed or restarted. This trial did not establish a current public Vibe player URL. Rules were readable and still state November 2 22:00 UTC / 19:00 Santiago; resources returned 403. The prudent target remains 21:00 UTC / 18:00 Santiago, with 17:00–21:00 UTC reserved for stabilization/video/delivery.

## Audit response — Codex session 01a197c1-5ea9-7b21-8339-a38373db96b1

The external read-only audit was treated as hypotheses. [Reorientation](platform/REORIENTATION.md) records the independent baseline at 7fc4f88: 150 tests, a discarded-process constructor escape, an infinite tick exceeding an external timeout, current provider inventory and independently serialized state sizes. The two existing Rust VMs were not changed. No new VM/model/payment request or Twitch message was made in this revision; owner configuration and credential files were not read or copied.

| Evidence | What it establishes | What it does not establish |
|---|---|---|
| [Baseline probes](evidence/reorientation-baseline.json) | Current-code reproduction and inventory, not just copied audit measurements | A live audience or present stable hosting |
| [Isolation suite](evidence/isolation-tests.txt) | 164 checks at the isolation/fallback commit, including a disposable controller surviving a looping game | Arbitrary uploaded-game safety or an OS hard memory quota |
| [Traffic suite](evidence/traffic-tests.txt), [paired payload estimate](evidence/state-bandwidth.json) | Compression negotiation, bounded feed/backpressure, before/after serialized traffic | Billed egress or all-client capacity benchmark |
| [Final credit suite](evidence/credits-tests.txt) | 179 checks: 97 focused + 82 integration; real file invalidation and version-matched HTTP/WS credits | Independent human gameplay |
| [Chromium rehearsal](evidence/local-ui-rehearsal.json), [player screenshot](evidence/local-ui-lobby.png), [overlay](evidence/local-ui-overlay.png), [studio](evidence/local-ui-studio.png), [privacy](evidence/local-ui-privacy.png) | Eight separate local browser checks; production keyboard input; credits inside both viewport axes; no JS exception or credit polling | Twitch traffic, OBS capture, mobile usability or exported video |
| [Clean install](evidence/clean-install.json), [full clean log](evidence/clean-install-tests.txt) | Disposable dependency install and test results with an empty npm profile and no owner configuration | New cloud construction or a publicly deployed URL |

The read-only adversarial reviewer reproduced a cancellation hang, a second constructor escape, lost fallback requests, recursive frame processing and browser-driven sprite egress. Those findings have fixes and regressions. It then passed 32 targeted checks in a stable-file review without a remaining confirmed P0/P1 in that scope. The 32 are a subset, not added to the full suite. Review ran no browser or server and did not query provider billing.

Intermediate failures remain described in LOCAL_RUNTIME.md and CREATOR_CREDITS.md; raw logs remain under /tmp/vibe-*. The first clean-install invocation failed because npm rejected loading the same empty config path twice; its evidence is retained separately. The retry uses distinct empty config files. Earlier Twitch/VM failures and successes were not rewritten or relabeled as this revision's work.

[Targeted prototype-session metadata](evidence/prototype-session-origin.json) independently confirms visual-graffiti began November 1, 2026, 05:54:16 UTC. Only id, working directory and creation time for that session were selected read-only; no messages, credential fields or unrelated sessions were read. Repository attribution links it to the prototype. This does not prove rights to every asset/source.

## Delivery preparation — November 1, later continuation

Owner chose **prepare for a later human rehearsal**. They supplied Cristóbal Muñoz as operator/credit name and two privacy contacts. The notice and Grove's bundled version-bound contributor record now use those details. This is not an additional source-rights attestation; hosting/recording disclosure and retention/deletion policy remain incomplete.

- [Delivery npm log](evidence/delivery-preparation-tests.txt): 179 passing checks (97 focused + 82 integration), zero failures after the server's loopback-bind/actual-port reporting change and supplied contact/credit details. The copied log normalizes trailing whitespace; original remains `/tmp/vibe-delivery-tests.txt`. This revalidation covers changed code; no new Twitch/VM/model request was made.
- [New Chromium record](evidence/delivery-ui-rehearsal.json), [player](evidence/delivery-ui-lobby.png), [overlay](evidence/delivery-ui-overlay.png), [privacy](evidence/delivery-ui-privacy.png): eight automated desktop checks, production key input and supplied operator/contact display; screenshots visually inspected. Original local-ui evidence is retained unchanged. Future script runs use timestamped names to avoid overwriting earlier evidence.
- [Disposable launcher smoke](evidence/delivery-launcher-check.txt): reviewed game switches, forced fallback and synthetic local proposal/vote/review/exact-input approval pass in a fresh temporary controller with a minimal environment. No owner configuration was copied/read. This is five local route/lifecycle checks, separate from npm and Chromium. The initial launcher attempt rejected the server's plain-text `ok` response as JSON; response decoding was repaired and the check then passed. Neither run was human/Twitch evidence.
- [Transfer verification](evidence/seed-transfer-verification.json), [six transfer tests](evidence/seed-transfer-tests.txt), [package and runtime proposal](platform/SEED_RUNTIME_PROPOSAL.md): 13 allowlisted inert files, exact approved 7,468-byte source, all three approved PNGs, artifact/report/approval bindings and complete historical guest evidence digest. SDK/harness transport hashes are anchored by the externally recorded manifest digest. No candidate execution, new approval, deployment or automatic builder is claimed.

A read-only adversarial review found that the first transfer verifier checked the normalized approval report but allowed a modified historical frame when its transfer manifest was rehashed. A regression reproduced that defect, then passed after checking the complete historical report digest; raw red/green logs remain `/tmp/vibe-transfer-{red,green}.txt`. Review independently rechecked the then-five transfer tests. A sixth test subsequently verifies the external manifest digest rejects replaced SDK bytes; the final six were run locally and independently rechecked in the final read-only review. The reviewer also verified the archive digest/size and the corrected launcher/API mapping without running a server or browser. The reviewer also identified inaccessible owner voting/review controls in the disposable launcher. Terminal round controls were added and the actual local HTTP smoke now covers the whole input-approval sequence. First proposals already auto-open a round; the missing owner-control path was the reachable gap.

The transfer archive is approved-source data outside public/ and games/. It includes the **current** trusted SDK; historical checks are not recast as tests of that changed SDK. The separate-runtime bridge remains unimplemented. Its proposed one-hour private hosting lease is costed but **not authorized**. No provider operation, new spend, external message, push, publication, upload or submission occurred.

[Prepared human checklist](REHEARSAL.md) retains every real Twitch/browser/OBS/export result as Pending. Official rules were reopened on November 1: deadline remains November 2 22:00 UTC; public YouTube footage must show Twitch and Codex, with English materials and free judge access through November 15. Plan B, 09:00 builder decision, 13:00 freeze and 17:00–21:00 recording/delivery reserve remain in force.

Skill/reference paths actually read: `/home/gris96/.agents/skills/hermes-game-dev/SKILL.md`, `/home/gris96/.hermes/skills/gaming/gaming-hub/SKILL.md` and its `references/game-development-resources.md` / `references/studio-capability-gates.md`. Native tools used: shell/Python/Node, Chromium/CDP and image inspection, plus a read-only review subagent required by that skill. No engine/library/cloud integration is inferred from those references.


## Normal-launcher browser rehearsal and English recording drafts

The next local verification used the actual `scripts/demo-local.mjs` entry point, its terminal controls and production Chromium forms rather than substituting direct proposal/vote HTTP injection. [Final result](evidence/plan-b-browser-1793566672900.json): **14 passing local browser checks**, including a browser-authored proposal and counted ballot, exact input review/approval, Grove keyboard action, fallback cause in the already-connected player, two browser race entrants, actual race-form submission and authoritative marble movement beyond spawn, matching Grove source/credit hashes and viewport-visible credits on return, another round and normal exit. [Approved studio](evidence/plan-b-browser-1793566672900-approved-studio.png), [Grove](evidence/plan-b-browser-1793566672900-grove.png), [fallback](evidence/plan-b-browser-1793566672900-fallback.png) and [moving race](evidence/plan-b-browser-1793566672900-marble-race.png) were captured; the current race screenshot was visually inspected alongside the initial studio/Grove/fallback captures.

This run is **local browser automation**, separate from the 179 npm, earlier eight UI and historical VM checks. It contains no human, new Twitch or OBS claim. It does not establish automatic building, a deployed Seed Race runtime or an exported video. Studio's stale text about public Rust demos was corrected to describe the empty remote catalog, and its privacy link now identifies the remaining hosting disclosure.

Retained history: [initial ten-check pass](evidence/plan-b-browser-1793566393741.json); [first race timeout](evidence/plan-b-browser-1793566488672.json); [diagnostic retry](evidence/plan-b-browser-1793566547596.json); [first full race pass](evidence/plan-b-browser-1793566607161.json). The diagnostic showed two entrants but no submitted race command. The CDP Enter event needed carriage-return text for the browser's form default action; correcting that harness event made the actual production form clear and the race start. No game behavior was changed to satisfy that assertion. The final run additionally checked physical movement and source-version/visible credit matching. Earlier results/screenshots were preserved, not replaced.

Read-only review identified three reachable harness lifecycle defects: an unhandled spawn error if Chromium is missing, no signal cleanup, and an unbounded normal-stop wait. A subsequent review also confirmed that an asynchronous command-pipe EPIPE needed a stream error listener; the listener now records the pipe failure and pending commands reject it during bounded polling. The harness now captures spawn errors, turns interruption into a bounded observation failure, sets handshake/CDP/shutdown deadlines and executes cleanup. [Actual missing-Chromium result](evidence/plan-b-browser-1793566621009.json) records the expected controlled failure and cleanup; [actual SIGTERM result](evidence/plan-b-browser-1793566647304.json) and [owned-process regression](evidence/plan-b-signal-regression.json) show eight live descendants observed before interruption and none left live afterward. Only that newly launched process tree was targeted; existing processes were untouched. These negative checks do not count as successful gameplay runs.

[English narration](recording/narration-en.txt) and [matching SRT](recording/captions-en.srt) are recording drafts. [Structural validation](evidence/narration-draft-check.json) proves 28 ordered, nonempty, nonoverlapping cues with at most two 42-column lines, exact narration text, and a 165-second draft track. It does not measure spoken duration or prove a completed/exported video. Final read-only review confirmed the command-pipe fix and reported no remaining confirmed finding in its scope; it did not execute the server or browser. The owner must align the drafts with real Twitch/Codex footage, retime and watch the full export. Human rehearsal remains deferred at the owner's request; hosting, rights, recording, publishing/access and submission remain open.


## Participant rights and creation-period confirmation

The owner explicitly answered the pending prototype/resource-rights and submission-period question in the active conversation. [Recorded confirmation and English translation](evidence/owner-rights-confirmation-2026-11-01.json) states that the Vibe Arena idea arose in the early hours of **November 1, 2026**, and confirms the question's rights/date scope. This resolves the missing participant attestation; it is separate from the independent prototype-session timestamp and is not an independent ownership audit. The original Devin-assisted prototype and later Codex contributions retain their existing attribution. No source, artifact approval or publication status changed, and the reply authorized no new spending or external delivery. Hosting, privacy/retention choices, human rehearsal/recording and final delivery remain pending.


## Free-hosting research after owner follow-up

The owner declined leaving the PC online for the whole judging period and requested a free external alternative, while deferring rehearsal again. [Primary-source hosting review](platform/FREE_HOSTING_REVIEW.md) compares the existing CreateOS account with Oracle, Google trial, Render and Koyeb against the actual Node/bubblewrap/persistence requirements. It answers the owner's CreateOS question without treating a free-account label as sufficient balance. [Safe read-only summary](evidence/free-hosting-research-2026-11-01.json) records two currently running sandboxes, neither modified, and no verified billing balance. No profile/credential values were printed or copied. The older proposal's rounded 321-hour arithmetic was corrected from $19.93 to $19.90; unrounded 1-vCPU/2-GiB/10-GB usage is about $19.56. No provisioned free host, new isolation test, spending or publication is claimed. The owner needs to establish the existing Sandbox credit/expiry and plan capacity before provider selection; the browser/human/OBS distinction remains unchanged.


## Owner hosting/lifecycle clarification

The owner chose to open Oracle Cloud and asked for configurable VM inactivity defaults plus optional self-hosting: platform on the PC natively/in Docker, and games inside a local VM with accepted risks. [The recorded requirements](platform/HOSTING_POLICY.md) retain cloud VM as default, distinguish pause from continuing RAM/storage charges, separate platform/build/game placement, and require external cleanup supervision and exact resource ownership. VISION.md, EXECUTION_PLAN.md and the handoff now include the complete scope and acceptance gates. This is a requirements/design update, not a running idle supervisor, Docker deployment, local hypervisor integration or automatic builder. The existing trial's five-minute provider pause and thirty-minute cleanup are historical evidence only. No existing VM, provider setting, host configuration, source approval or public URL was changed. No tests were repeated for this documentation-only update.
