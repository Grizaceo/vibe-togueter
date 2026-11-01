# Remaining platform execution plan

Updated after the November 1 audit response. Submission scope is governed by REORIENTATION.md and AUDIT_REPORT.md; the full vision remains future work. Previous checkpoint note: 2026-11-01 15:16 UTC. Main session: `01a19536-0f02-7fc3-b030-d6b6fd8e170c`; continuation: `01a19776-75a5-7e91-b5c1-f108c345dc8c`. Full owner vision remains in VISION.md; completed increments do not imply the full platform is finished.

For submission work, resume from [AUDIT_REPORT.md](AUDIT_REPORT.md) and [REORIENTATION.md](REORIENTATION.md). HANDOFF_NEXT_SESSION.md preserves the exact approved Seed Race artifact and previous owner decisions; it does not override the newer Plan B demo scope.

Thesis: turn independent creators' freely contributed work into community-built games, with streamer-controlled decisions, cloud-isolated agents, transparent funding and persistent creator visibility.

## Working increments

- Authenticated real Twitch chat/replies; local/web SDK play; Marble Race and Democracy Duel.
- Durable capped idea rounds, replacement ballots, streamer selection and exact input/resource approval.
- Free-first creator resource catalog and moderation; three real Kenney CC0 curated images with traceable source/license/fingerprints.
- Community Grove: original cooperative example using those images; actual Twitch and public WSS effects; published source/resource hashes and creator links on player/OBS pages.
- Historical external-runtime adapter evidence exists for public room creation and Tee chat control. The submission configuration now excludes those runtimes pending rights/hosting review; they are not demo dependencies.
- Owner-operated inert artifact quarantine, pinned source/resource/test-report approval, durable test history/restart recovery and private local CLI. An owner-selected Codex/Terra subscription trial actually built Seed Race in a private VM, passed 12 separate-VM checks and obtained exact owner approval. All eight trial VMs were destroyed. General worker dispatch and deployment remain unconnected; VM_TRIAL.md records the boundary. See BUILD_QUARANTINE.md.
- 179 passing local/isolated checks (97 focused + 82 integration). Reviewed SDK games now run in a Linux namespace guest with automatic Marble fallback, bounded transport and permanent game/art/idea credit snapshots. A separate eight-check Chromium rehearsal exercised production keyboard input and visually inspected desktop player/overlay/studio/privacy layouts. Human play, OBS/video and new Twitch rehearsal remain pending. External runtimes are excluded from submission configuration; the ledger is simulated and event-credit fixtures are off by default.

## Next dependency chain

1. **Separate build VM and agent profile.** Owner chose Codex/gpt-6.1-terra, delegated the quota and completed a fresh guest subscription login. The USD 3 VM ceiling / zero paid API trial succeeded and its VM was destroyed. Connect worker dispatch/status/cancellation, never execute construction on host by fallback. Acceptance: a chat-selected, streamer-approved input produces a real artifact in a separately identified VM, with resource/provider/job evidence and no host-agent credential transfer.
2. **Quarantine and version approval.** Distill relevant local lab checks without copying secrets or full corpus. Viewer-agent submissions get immutable source hashes, static findings and isolated tests; a streamer approval is pinned to the tested version. Acceptance: a changed/injected contribution cannot reuse approval or publish itself. A scanner alone is not a safety certificate.
3. **Purpose-specific budget ledger and settlement integration.** Separate VM/AI reservations and actual settled funds; handle cancellation/retry/refund and explicit streamer top-ups. The inherited fund is demo accounting. Choose real payment account/fee and test processor signatures/reconciliation before claiming donations pay provider bills. Paid creator sales remain separate, with fee unset until owner choice.
4. **Agent Native connection and sharing boundaries.** Reuse scoped remote MCP/connection patterns from BuilderIO/agent-native through the existing SDK dependency. Do not import Dike accounts or personal Hermes state. Add explicit public/private runtime access and original-stream/remix credit. A hidden catalog entry is insufficient privacy.
5. **Human browser rehearsal, recording and submission.** Independently verify the new studio/Grove/Rust pages, creator links and control ergonomics, then capture real Twitch footage. Keep the current working increments reproducible while the cloud builder progresses.

These include remaining engineering, not merely account setup. No Stripe checkout, real money allocation, general cloud worker service, general uploaded-game safety gate, universal co-op conversion, full Agent Native runtime or private game hosting is claimed complete.

## Absolute checkpoints

[Official rules](https://twitchcon-codex.devpost.com/rules) and [resources](https://twitchcon-codex.devpost.com/resources) were reopened today. Rules still show November 2, 2026, 14:00 PST: **22:00 UTC / 19:00 Santiago**. Target submission is **21:00 UTC / 18:00 Santiago**. Four hours, **17:00–21:00 UTC**, stay reserved for stabilization, English video, review and delivery. A later resources follow-up returned 403; the rules page remained readable.

At 15:16 UTC on November 1: 30h44 calendar to official close; 29h44 to the prudent target; 21h44 until the feature freeze below. These are calendar bounds, not attended engineering capacity or a promise that every integration fits. Preserve the November 2 17:00–21:00 UTC stabilization/video/delivery reserve. The owner authorized this bounded trial and selected subscription authentication; no paid API key/billing was used. A general budget/reservation ledger and provider settlement remain pending.

|Checkpoint|UTC, November 2|Santiago|Outcome/cut|
|---|---|---|---|
|Cloud builder scope decision|09:00|06:00|Keep demonstrated path; explicitly list any unverified build/payment capabilities|
|Feature freeze|13:00|10:00|Stop expanding; repair only observed failures|
|Human end-to-end demo complete|16:00|13:00|Actual Twitch + browser evidence; no fixture/synthetic substitution|
|Recording/stabilization reserve starts|17:00|14:00|English <3-minute video, source/provenance review, clean install and secrets check|
|Public YouTube + private repo access verified|20:00|17:00|Owner supplies public video and judge access|
|Prudent Devpost submission|21:00|18:00|Owner submits and checks receipt|
|Official close|22:00|19:00|No reliance on this last-hour buffer|

Human actions needed: choose runtime visibility/hosting once the approved artifact deployment is concrete; inspect the UI and play both participation modes; choose actual payment configuration/commission before paid commerce; confirm rights/dates for inherited and parallel game work; provide OBS/video; push the private repo and share testing@devpost.com; publish YouTube and submit Devpost. Do not publish .env/runtime/owner ledgers. Keep free judging access available through November 15. Runtime lifespan and stable ingress need an explicit hosting decision; quick tunnels and the existing CreateOS demos are temporary.

The four official criteria remain equally weighted: innovation, impact, implementation/Codex use and design. Current local judgement: artist visibility plus actual co-creation is the differentiating thesis; reliable real cloud construction is the next decisive gap. No score or winning outcome is guaranteed.


## New owner hosting requirements

The owner is opening Oracle Cloud; human rehearsal remains deferred. Add [streamer-controlled hosting and inactivity](HOSTING_POLICY.md) to the full platform plan: VM default, default idle timeout with configurable thresholds/actions, pause followed by externally supervised destructive expiry where selected, finite build/runtime leases, and optional native/Docker/local-VM platform plus separate local game VM with explicit owner risk acceptance. Native Linux reviewed-game demo exists; general lifecycle settings, Docker deployment and hypervisor/remote-runtime adapters remain engineering work. Do not turn these requirements into claims that a saved preference or provider pause flag already implements the supervisor, and do not apply the policy to foreign legacy VMs automatically. Keep these full-vision tasks distinct from the pre-freeze Plan B delivery work.
