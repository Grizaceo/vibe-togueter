# Audit response and delivery handoff

Current increment and replacement calendar: [NEXT_INCREMENT.md](NEXT_INCREMENT.md). Historical counts and deadlines below describe the earlier checkpoint.

November 1, 2026. Branch feat/twitchcon-codex. Codex session **01a197c1-5ea9-7b21-8339-a38373db96b1**. This report distinguishes completed local work from owner delivery tasks; it does not declare the platform vision or Devpost submission complete.

## Decision

**Use Plan B for the submission.** The actual Codex Seed Race VM trial is stronger evidence than a simulated worker, but a studio-triggered builder and a separate live Seed Race runtime remain unconnected. Show the functioning studio decisions and reviewed games, and truthfully walk through the real trial's construction, separate tests and exact approval. Do not rebuild the approved artifact merely to create a “live” claim. Its source remains inert in artifacts/, and all trial guests were destroyed.

The complete golden path remains the product goal. Reconsider the demo scope only with a full end-to-end isolated build/runtime rehearsal by November 2 at 09:00 UTC. Freeze at 13:00 UTC, human demo by 16:00, recording/delivery reserve 17:00–21:00. Target submission 21:00 UTC; official close 22:00 UTC / 19:00 Santiago. The November 1 audit-response work occurred before that freeze.

## Requirement-by-requirement result

| Topic | Result and commit | Independent evidence / limit |
|---|---|---|
| Read-only review before implementation | **Done**, bb3ebbc | Current code, post-cdbac51 commits, official rules, 150-test baseline and discarded-process probes recorded in REORIENTATION.md and reorientation-baseline.json. External audit material remained outside the repo. |
| Third-party runtime risk | **Done**, a191b92 | Shipped remoteGames is empty. Branded falling-blocks and Tee are excluded from README/submission/recording path. Existing VM ownership/history is preserved; this is a conservative demo choice, not a legal ruling about those projects. |
| Treasury/event wording | **Done**, a191b92 plus final documentation commit | Overlay says simulated build credits with no payments. Paid-event credit simulation is off by default and the generic payment-like route returns 410. MCP descriptions no longer promise real money from webhooks. No payment gateway or real-money event was used. |
| Privacy notice | **Implemented**, a191b92; **owner completion pending** | Independently written from actual code paths, served and linked from lobby/studio/overlay, rendered in Chromium. Operator/contact/hosting fields remain visibly incomplete. Public deployment and a deletion/retention procedure are owner tasks. No unverified archive wording is claimed as current Twitch contract text. |
| Prototype and external-audit provenance | **Documented**, a191b92 and SUBMISSION.md | Repository INTEGRATION_AUDIT identifies Devin CLI visual-graffiti; fab3227 preserves inherited source. Later Codex sessions and this revision are distinguished. Targeted read-only session metadata independently confirms November 1, 05:54:16 UTC; see prototype-session-origin.json. Ownership of every source/asset still requires owner attestation; inherited code is not attributed to Codex. |
| Isolation and infinite-loop survival | **Done for reviewed local SDK demo**, 6e7ad7a / 6ac1f0e | Separate Linux namespaces, minimal environment/mounts, realm-native inputs, callback/serialization deadlines, bounded IPC and parent watchdog. Actual guest-loop and hostile-frame tests pass. Node permission flags alone were rejected as the security design. No claim of kernel exploit resistance, hard OS memory quota or general upload safety. |
| Automatic and forced fallback | **Done**, 6e7ad7a | Disposable HTTP/WS integration survives a looping game and restores players to Marble Race. Fallback reason is visible. Local confirmation is required; web nicknames cannot impersonate moderators. Trusted Twitch mod parsing has a unit test; real moderator-command rehearsal remains owner work. |
| State broadcast cost | **Done**, a42d000 / 6ac1f0e | Paired actual frames, 20 web/20 chat actors, 100 active samples per game. Marble estimated payload: 1.190 → 0.083 GB/client-hour with negotiated deflate (93.0% reduction); 0.696 without compression. These exclude TLS/framing/feed/credits and are not provider egress invoices. Actual WS negotiation/backpressure tests pass. |
| Credits endpoint and studio polling | **Done**, a42d000 / 6ac1f0e | Public credit requests use a verified snapshot, WS sends changes, no client credit polling. Actual PNG/code changes invalidate and recover attribution. Studio state 5s visible/15s hidden, catalogs 30s, no overlapping refresh. No-op round ticks avoid history cloning. Durable mutation writes remain intentionally synchronous; archival/batching is deferred. |
| Web/chat/remote flood | **Done**, a42d000 | Admission before feed and Tee forwarding, 250 ms per actor, 30 accepted messages/instance-second, bounded actor table. Ordinary text 200 chars; proposals keep a separate 10,000-character and word-policy cap. Socket messages 16 KiB/120 per second; slow state consumers skip or disconnect. Local flood integration remains responsive. No internet-scale DDoS claim. |
| Always-visible creator credits | **Done**, 6ac1f0e | Game/art/idea roles remain outside collapsed details. Source/resource hashes bind the version. External game/idea authors and additional artists are supported; public link validation is reused. Chromium verified viewport position and production input; screenshot inspection repaired the sidebar overflow. |
| English delivery docs and Codex demonstration | **Done as reviewable drafts**, final documentation commit | README, SUBMISSION and DEMO_SCRIPT start with the two-minute path, distinguish real/local evidence and list all three sessions. Video itself is not recorded by this work. |
| Feed / marketplace / role-playing / clips | **Deferred deliberately** | Large features are outside the pre-freeze scope. Roadmap prose is newly written and makes no pricing, partnership, training-policy or adoption claim. |
| Effects pause | **Deferred deliberately** | Prioritize the required recovery, attribution and delivery review. It is optional and not presented as implemented. |
| Push / publishing / spending / submission | **Not performed, as instructed** | No repository push, new VM/model spend, real payment, video upload or Devpost action. The prior approved trial is evidence, not authority for a new hosting budget. |

## Findings corrected or not adopted

The audit's 107-check count was already outdated at takeover: the current baseline was 150. Its “no isolated build” wording was also outdated after the owner-selected trial; however, its warning that no automatic worker was connected remained correct. Earlier notes saying artist credits existed only in the studio were stale: version-bound player/overlay details already existed, but compact game/idea/artist visibility did not.

The state-size claim was independently corroborated rather than copied: the initial Marble envelope was 19,287 bytes and about 1.052 GB/client-hour at the old cadence; active frames were larger. The expensive public credit hashing, idle studio work, feed-before-cooldown and process escape/freeze findings were current and reproduced or directly traced.

Do not adopt a child process plus Node permissions as a complete malicious-code boundary: official Node documentation explicitly disclaims that guarantee. Linux namespace confinement was added for reviewed local examples, while arbitrary artifacts retain the separate-VM policy. Do not adopt categorical “art never reaches any AI service” legal language without verifying the actual chosen provider and resource workflow; the new notice describes metadata, public URLs and guest test assets honestly. No external legal template was copied.

Use local Marble as fallback rather than remote Tee: it avoids a network dependency and unresolved publication rights. Keep atomic round/approval persistence rather than batching writes solely for a speculative throughput gain; admission and idle-path fixes address the demonstrated load without weakening durability. Broad server decomposition, formatting, legacy accounting dedupe and the remaining P2 cleanup are deferred; paid-event accounting is out of the deployed demo scope.

## Verification and artifacts

- **179 passing npm checks = 97 focused + 82 isolated integration, zero failures**, repeated successfully after a clean locked install in a disposable checkout. Twelve historical guest checks, eight new browser checks, sibling Rust checks and review subsets are not added to that count.
- Clean dependency install and full log: evidence/clean-install.json and evidence/clean-install-tests.txt. No owner configuration or npm profile was copied. The initial npm empty-config double-load failure is retained separately.
- Chromium rehearsal: evidence/local-ui-rehearsal.json and local-ui-{lobby,overlay,studio,privacy}.png. Desktop 1600×900, automated keyboard input and visual inspection; no human/OBS/Twitch claim.
- Isolation/fallback, traffic and credit results: evidence/{isolation-tests,traffic-tests,credits-tests}.txt. Exact before/after estimate: evidence/state-bandwidth.json; rerun scripts/measure-state.mjs.
- Read-only adversarial re-review passed 32 targeted checks after confirming fixes for cancellation, a global-constructor escape, recursive frames, sprite egress and attribution omission. Failed intermediate attempts are documented in LOCAL_RUNTIME.md and CREATOR_CREDITS.md, with raw /tmp logs retained.
- No current controller at port 8420 or stable live URL was established. Temporary test/browser controllers were stopped; owner runtime journals and approved source were preserved.

## Owner actions remaining

1. Confirm the participant owns the inherited prototype and it was created during the submission period. The prototype session start is independently confirmed as November 1; attest the source/asset rights and your desired public game/idea credit name. Complete the privacy operator/contact/hosting fields and retention/deletion procedure.
2. Choose and provide a stable, free judging runtime/ingress through November 15, within a separately approved hosting budget. If deploying Seed Race later, use its exact approved source/resources/report in a separate runtime VM; do not import it onto the streamer PC.
3. Rehearse with real Twitch and browser participants, including a moderator fallback and readable credit links. Earlier offline owner-automation evidence is not a new human rehearsal. Decide whether the 10 Hz display cadence feels adequate for the selected game.
4. Configure OBS, preserve the complete credit strip, and record/export an English video under three minutes showing real Twitch behavior and these Codex threads/commits/tests. Show the prior real guest construction truthfully; do not stage static receipt playback as a new live build. Check rights for all material visible in the export.
5. Upload the video publicly to YouTube and check logged-out playback. Push the private repository yourself; grant testing@devpost.com access and verify testing instructions with a clean checkout.
6. Fill Devpost repository/video/session fields, submit before the prudent deadline and verify its receipt. No submission has been sent by this session.

Skill workflow used: [Hermes game-dev router](/home/gris96/.agents/skills/hermes-game-dev/SKILL.md), with gaming-hub, its game-development-resources and studio-capability-gates references. Native shell/Node, bubblewrap and Chromium were actually executed; no external engine/library integration is inferred from reading those references.

## Later delivery-preparation update

The owner supplied operator/credit name and privacy contacts; these are now displayed and Chromium-checked. Hosting/recording disclosure, retention/deletion policy and rights/date attestation remain pending. The owner chose human rehearsal later. See [the reproducible local rehearsal](../REHEARSAL.md), [inert approved Seed Race package and costed runtime proposal](SEED_RUNTIME_PROPOSAL.md), and [new evidence](../EVIDENCE.md#delivery-preparation--november-1-later-continuation). The 179 application checks passed again; six separate inert-transfer tests and five launcher checks were added. Plan B and all automation/runtime limitations remain unchanged. No spend, publication or external delivery was performed.

The subsequent normal-launcher browser pass verified 14 additional local checks, including actual Studio forms/ballots, terminal exact-input approval, two browser race entrants and moving marbles. These remain separate from the application suite and human/Twitch/OBS evidence. English narration and matching 2:45 subtitle timing are ready as drafts; recorded voice/export and owner review remain pending. See the latest EVIDENCE.md section and recording files.


The owner has now explicitly supplied the prototype/resource-rights and creation-period attestation, including idea origin in the early hours of November 1. See `../evidence/owner-rights-confirmation-2026-11-01.json`. Earlier pending-attestation entries are historical; no independent ownership audit or new publication permission is implied. Other delivery dependencies remain pending.
