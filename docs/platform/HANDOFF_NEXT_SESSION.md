# Vibe Arena — prior VM-trial handoff

**Submission-scope update:** the later audit-response session chose Plan B and implemented isolation/fallback/traffic/credits. Resume submission work from [AUDIT_REPORT.md](AUDIT_REPORT.md) and [REORIENTATION.md](REORIENTATION.md). The preserved artifact approval and owner decisions below still apply; deployment-first instructions are historical and do not override the newer scoped demo decision.

Saved November 1, 2026, 15:27 UTC / 12:27 Santiago. Repository `/home/gris96/vibe-arena`, branch `feat/twitchcon-codex`. Working tree was clean before this handoff. Last implementation/evidence commit: `12a037d`; this document is committed immediately afterward. **No push.**

## Start here

The next increment is **deploy the already-approved Cooperative Seed Race to a separate game runtime, then connect browser play and bounded Twitch commands**. Do not rebuild it, ask the owner to select an agent again, or request an API key for this deployment. The owner has already approved this exact artifact. Deployment visibility has not been chosen; prepare a concrete deployment package/cost/access policy before asking for that decision.

This handoff supplements the complete vision, not a reduction of it. Read applicable AGENTS.md, README.md, VISION.md, EXECUTION_PLAN.md, INTEGRATION_AUDIT.md, STUDIO_INCREMENT.md, REMOTE_GAMES.md, CREATOR_GAME_DEMO.md, BUILD_QUARANTINE.md, VM_TRIAL.md, EVIDENCE.md, SUBMISSION.md and DEMO_SCRIPT.md. Use `/home/gris96/.agents/skills/hermes-game-dev/SKILL.md` and its pertinent references. Consult the actual clock and re-open the official rules/resources in the new session.

## Decisions already supplied by the owner

- Agent: **Codex**, model **gpt-6.1-terra**.
- Owner delegated a reasonable bounded trial quota. Operator chose a USD 3 VM ceiling and initially offered USD 5 API use. The owner then chose **a fresh ChatGPT/Codex subscription login inside the VM**, replacing the paid API alternative. No API key or paid API request was used. Do not equate subscription token reports to API dollars.
- Trial game: **Cooperative Seed Race using the reviewed Kenney CC0 art**.
- Owner explicitly approved the exact final source hash below after receiving the preview and separate-VM test result.
- This was an **owner-selected trial**, not a real Twitch proposal/vote. Durable round provenance says `owner-session-trial`; do not relabel it as community selection.
- No general future hosting budget, paid checkout, commission percentage or public/private visibility policy was selected. Do not interpret the trial ceiling as unlimited hosting authorization.

## Approved artifact — preserve these bindings

Source:

`artifacts/seed-race/f145319f61feb57ffbb41a0057954f5533b59d28caed10f3a625d751ef812105/game.js`

Adjacent `provenance.json` contains the complete pinned creator manifest and approval. It is **approved but unpublished**, outside both `games/` and `public/`. Do not import/evaluate/load this source on the host. Build and runtime VMs must be separate; no automatic host fallback.

|Binding|SHA-256|
|---|---|
|Source code|`f145319f61feb57ffbb41a0057954f5533b59d28caed10f3a625d751ef812105`|
|Artifact (round/input/resources/source)|`e41cdbd68ccad078fb9ab33e35b7c95dadbc44db1177808c81c03f62e914f3f5`|
|Test report|`3dcbc39f0eea93ba2acb134b421afb253227c6d5441163337bbb9656ae71165e`|

Exact approval: `docs/evidence/seed-race-owner-approval-1793545735358.json`.
Final guest test: `docs/evidence/seed-race-quarantine-1793545575065.json`.
Actual Chromium static preview: `docs/evidence/seed-race-preview.png`.
Full construction/failure narrative: `docs/platform/VM_TRIAL.md`.

Gameplay: six cooperative seed lanes; `!seed 1–6`, `!water 1–6`, `!wind`; web up/down/W/S selects lane, space or pointer click advances it. Actor cooldowns, bounded player/actor collections, six-seed completion and eight-second reset. The selected lane displays bounded player names. All three actual Kenney PNGs and fingerprints were checked in quarantine; Kenney did not join or endorse the platform.

Creator links/credits must remain outside candidate-controlled code in the official runtime/launcher and bind to the actually deployed version. Source currently also contains attribution, but that does not replace the platform credit panel. `runtimeVmId: pending-seed-race-runtime` in the ticket is a logical placeholder, **not an existing VM**.

## What is implemented and verified

- Durable private quarantine journal/API and local review CLI. Candidate source stays inert on the host. Immutable source/resource/input hashes, test-attempt nonces/history, rights attestation, exact report/version approval, restart/cancellation and persistence failure handling.
- Final artifact approval accepts a completed construction round only while its canonical input hash still matches. Tests cover the actual HTTP mock-generator completion path.
- Real CreateOS preflight, fresh subscription device login, fixed-model guest Codex construction and readability revision. No personal auth/profile was copied.
- Separate private quarantine VMs executed the actual SDK host and exact candidate. The final version passed **12/12 guest checks**. This is separate from npm/Rust counts and remains operator-attested evidence, not a signed worker receipt or safety certificate.
- Trusted Chromium canvas renderer displayed a static frame from quarantine JSON. The candidate never executed on the host. This is not interactive browser play, actual Twitch traffic for Seed Race, human audience testing or OBS/video.
- Shared client now releases up/down keys and pointers on blur/outside release/cancel. The SDK prompt documents default centered text alignment.
- **npm test: 150 passing checks = 80 focused + 70 isolated integration/legacy, zero failures.** `docs/evidence/validation-platform.json`; full log `docs/evidence/seed-trial-tests.txt`, original `/tmp/vibe-arena-seed-trial-tests-final.log`. All provider/model work in default tests uses mocks/temporary copies; Seed Race is not imported there.
- Separate inherited Rust counts remain 14 + 13; do not add them to 150 or the 12 guest checks.
- Read-only adversarial reviewer reproduced defects and re-reviewed their fixes. Final review inspected code and saved preview/results, without independent provider queries or executing candidate code. Failures were retained, not rewritten as successes.
- Final secrets scan checked 162 tracked/pending nonignored files against seven configured secrets and the expired device code: no matches. `.env` remains gitignored, mode 600. No new app runtime dependency; still only ws and @modelcontextprotocol/sdk.

## Resources and services at handoff

All **eight VMs created by this continuation were confirmed destroyed** in `docs/evidence/builder-cleanup-1793545844368.json` (last provider recheck around 15:10 UTC). The build VM and its newly created subscription auth cache were destroyed. Its user-manager cleanup timer was stopped. No trial guest should be resumed/reused; revalidate provider state before any action.

The former build VM ID is recorded solely as provenance: `sb-01m6bs0vnqsx186jvqgygfcqr8`. Deployment of the approved source needs no new Codex login. A future rebuild would require a fresh scoped login because that guest is gone.

At the 15:27 UTC local recheck: no listener on 8420 and no cloudflared tunnel process was found. The old quick URL `https://activities-markets-disciplines-shall.trycloudflare.com` returned HTTP 530 earlier in this continuation. No prior live controller/tunnel was killed or restarted here. Community Grove was the last served game historically; **there is no current verified live Vibe player URL**. Inspect current processes, ports and kernel leases before restarting anything; never kill a historical PID.

The two pre-existing Rust VMs were observed still running and were never modified/reused as builders:

- Falling blocks: `sb-01m6b6asmqr2znr2zf6xh9wnmb`, `https://01m6b6asmqr2znr2zf6xh9wnmb-8899.app.sb.createos.sh`.
- Tee: `sb-01m6b6ary1y2qa645hxc9h8gfd`, `https://01m6b6ary1y2qa645hxc9h8gfd-8303.app.sb.createos.sh`.

Their direct backends are public. Local controller authorization does not protect those APIs. Do not touch their repos/VM lifecycles without ownership/coordination/budget review. Read their AGENTS.md and DEPLOY-CREATEOS.md when changing an interface integration.

## Precise next work

1. Build a scoped deployment package from the approved source + SDK + pinned Kenney bytes/credits. Verify hashes before transfer and before launch. Keep arbitrary candidate execution entirely in its separate runtime VM; no host imports or node:vm isolation claim.
2. Define actual public/private access, runtime lease/expiry and a costed bounded hosting plan. The artifact approval is already granted; visibility/hosting is a separate owner decision once concrete. Do not reuse the destroyed builder or public Rust VMs.
3. Connect the platform/browser and `!join`, plus bounded/passive `!seed`, `!water`, `!wind` forwarding to that runtime. No Twitch token or personal configuration belongs in the guest. A narrow job/runtime credential is different from transferring master/provider credentials.
4. Verify real network/browser/chat behavior, restart/disconnect/reconciliation and creator links for the exact executing version. Then conduct human play and capture English demo footage.
5. Generalize the operator trial into worker dispatch/status/cancel/recovery through Studio/MCP. Current `/admin/generate` still returns `isolated_builder_required` in VM-default mode; `/community/state` is not claiming a connected automatic worker. The trial scripts are specialized operator tools, not a production service or clean-checkout automatic build flow.
6. Implement separate VM/AI reservations, actual expenses/releases/reconciliation; current limit metadata is not a payment ledger or provider-enforced cap. Actual VM invoice settlement remains unverified.

Further vision work remains: viewer-agent contribution permissions and specialized review, authenticated worker receipts, general uploads/deploys, remix/source-stream provenance, runtime privacy, real payments/disclosed owner-selected commission and actual Agent Native connections. Do not call reading matching design patterns an Agent Native integration. Do not revive Mercury campaigns or contact third parties/Devin without explicit authorization.

Effectful scripts to read before use: `scripts/rehearse-builder-vm.mjs`, `builder-login.mjs`, `build-seed-race-trial.mjs`, `revise-seed-race-trial.mjs`, `test-seed-race-vm.mjs`. They create/destroy VMs or consume subscription quota. Do not rerun them just to deploy the approved artifact. `scripts/vm-seed-check.mjs` is guest-only. Protected `runtime/` journals retain the owner round/tickets/job; preserve them and reconcile explicitly instead of resetting them. Do not copy runtime auth/diagnostic files into tracked evidence.

## Session attribution, commits and deadline

This actual session ID: **01a19776-75a5-7e91-b5c1-f108c345dc8c**. Prior main build: **01a19536-0f02-7fc3-b030-d6b6fd8e170c**. Obtain the real ID of the next session; never reuse either as its identity. Inherited baseline `fab3227` and parallel Rust games are not authored by this continuation.

This continuation's eight commits before this handoff:

- `0d43521` inert artifact quarantine and durable version/test approval.
- `cdbac51` private handoff API and protected review export.
- `dd1a78d` exact completed-round artifact approval.
- `233459e` focus/pointer release repairs and SDK alignment guidance.
- `e17dd7d` private subscription guests, recovery and timed cleanup.
- `1f80c65` actual VM Seed Race trial tools and approved review artifact.
- `ec3d3cf` evidence/docs/provenance and retained failures.
- `12a037d` normalized trailing whitespace in copied text logs; original /tmp logs retained.

Official rules last revalidated November 1: **November 2, 2026, 22:00 UTC / 19:00 Santiago**. Prudent target **21:00 UTC / 18:00 Santiago**. Preserve **17:00–21:00 UTC** for stabilization, English video and delivery. Feature freeze remains Nov 2 13:00 UTC. At 15:27 UTC Nov 1, calendar remaining is 30h33 to official close, 29h33 to prudent submission and 21h33 to feature freeze. These are not engineering effort estimates; recalculate on resume. Resources returned 403 while rules remained readable.

Owner still needs human play, OBS/video/public YouTube, source-rights/date confirmation, private repo push/judge access and Devpost submission. Do not push or submit on the owner's behalf under the current instruction. This handoff does not declare the platform or submission complete.

## Latest preparation, after 7e8040a

The owner chose to rehearse later and supplied Cristóbal Muñoz plus two privacy contacts. Those fields and Grove's credit now show the supplied identity; hosting/recording, retention/deletion and rights attestation remain pending. `node scripts/demo-local.mjs` provides temporary loopback play and terminal studio round controls without owner configuration; see `docs/REHEARSAL.md`. Do not call its synthetic smoke a human/Twitch rehearsal.

The exact approved Seed Race is packaged inertly at `artifacts/seed-race/transfer/seed-race-approved.tar.gz`. Read `SEED_RUNTIME_PROPOSAL.md` before any transfer or deployment: it records archive/manifest hashes, current-SDK limitations, a one-hour private lease/access design and an estimated cost with **no new hosting authorization**. The runtime bridge is still unimplemented. Do not rebuild/reapprove/import the candidate. All human, OBS, hosting and external delivery actions remain open.

## Normal-launcher browser pass and recording drafts

The full production-browser/terminal route is now checked: `node scripts/rehearse-plan-b.mjs`. Final timestamped result `docs/evidence/plan-b-browser-1793566672900.json` records 14 passing checks, including Studio proposal/ballot/exact-input approval, Grove, requested fallback, two browser entrants, actual Marble movement and source-matched visible credits on return. This is still local automation, not human/Twitch/OBS evidence. Missing-Chromium and SIGTERM cleanup regressions are saved separately; prior form-event harness timeouts remain retained. Studio's stale Rust-hosting copy was corrected. Follow `docs/REHEARSAL.md` for the eventual human pass.

`docs/recording/narration-en.txt` and `captions-en.srt` are matching English drafts on the 2:45 shot plan; no voice/audio/video export exists. The SRT has 28 structurally checked cues, and must be retimed to the actual voice/footage. A hosting-infrastructure question was asked after this preparation; inspect any user response before planning the judging deployment. It does not authorize spending or publication. The remaining genuine dependencies are owner rights/disclosure/retention choices, stable free judge access, human Twitch/OBS participation and external delivery authorization.
