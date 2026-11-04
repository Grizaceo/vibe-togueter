# Owner-selected Codex VM trial — Cooperative Seed Race

Continuation session: `01a19776-75a5-7e91-b5c1-f108c345dc8c`. Main inherited build session: `01a19536-0f02-7fc3-b030-d6b6fd8e170c`. November 1, 2026. This is a verified construction/quarantine/owner-approval increment, not completion of Vibe Arena or a general cloud worker service.

## What actually happened

The owner selected Codex, specifically `gpt-6.1-terra`, delegated a reasonable trial quota and chose a new subscription login inside the guest. The owner then selected **Cooperative Seed Race with Kenney art**. No real Twitch proposal or ballot selected this trial. Its durable round explicitly records `owner-session-trial` provenance and the owner override reason; no automated owner input is represented as independent community voting.

The operator ceiling was USD 3 for VM use. The initially proposed USD 5 paid-API alternative was superseded by the subscription choice: **paid API calls were disabled/not used**. Subscription usage is not API dollar billing and these journals are not provider-enforced spending limits or a reconciled expense ledger. The live build had a 300-second guest timeout, its one explicit readability revision a 180-second timeout, and no automatic retry. Guest Codex sessions reported 109,456 input tokens in total (72,960 cached input tokens included within that count), 3,496 output tokens and 64 reasoning output tokens across access check, initial build and revision. These are guest CLI usage reports, not separate subscription credit or invoice measurements.

A fresh CreateOS `devbox:1`, 1-vCPU/2-GiB build VM had no public ingress, no host mounts and an outbound host allowlist. No personal `.codex`/Hermes/browser profile, host auth cache, Twitch credential or Dike account was copied. Node 24.21.0 and Codex 0.160.0 were verified. The owner completed a new device-code login into `/opt/vibe-codex` in that VM. An independent host user-manager timer scheduled its destruction after 30 minutes and was checked active before model dispatch. Idle pause was five minutes. Pause does not mean destruction or zero billing.

A real guest Codex access check returned the requested marker without tools: [access receipt](../evidence/codex-vm-access-1793544636251.json). The two generation turns read only the supplied game contract/task/source and wrote game.js inside the VM. The artifact was received as inert text on the host and put in the quarantine journal. It was never imported, evaluated, loaded as a local SDK game or installed as a host runtime.

- [Initial guest build](../evidence/seed-race-build-1793544931163.json): guest thread `01a1979b-5da5-77f2-9aa2-865908b2e35e`, two tool operations, 6,870 source bytes.
- [Guest readability revision](../evidence/seed-race-revision-1793545531231.json): guest thread `01a197a4-b520-79f0-a679-45bc510547b3`. It corrects left-margin alignment for the actual renderer and labels selected lanes with bounded player names. Prior source/test/approval hashes were not reused.
- [Final source and pinned creator manifest](../../artifacts/seed-race/f145319f61feb57ffbb41a0057954f5533b59d28caed10f3a625d751ef812105): source SHA-256 **f145319f61feb57ffbb41a0057954f5533b59d28caed10f3a625d751ef812105**. This directory is review material outside public/ and games/; do not import it on the host.
- [Exact owner approval](../evidence/seed-race-owner-approval-1793545735358.json): final source approved in the conversation, with its artifact and test-report hashes. Publication remains false.

Kenney's three original bundled PNGs retain CC0 provenance, notices, fingerprints, website and social links. They are curated public resources; Kenney did not join or endorse the project.

## Separate quarantine execution and actual rendering

Each dynamic run created a new private quarantine VM with `blocked.invalid` as its only outbound allowlist entry, no personal profile/auth transfer, no public ingress and the exact candidate bytes, trusted SDK host, fixed test harness, manifest and three PNGs. `node:vm` was used only **inside that disposable guest**; the whole VM was the containment boundary. A process timeout bounded execution. No candidate ran on the streamer host.

The first run retained [three failed checks](../evidence/seed-race-quarantine-1793545125769.json). The operator harness mistakenly passed state twice to GameHost.safeCall; the failure was in the harness. The corrected run passed [11/11 checks for the initial source](../evidence/seed-race-quarantine-1793545212422.json). After the guest revision, a new VM passed [12/12 checks for the final source](../evidence/seed-race-quarantine-1793545575065.json): exact SDK load, exports/state, chat advancement/cooldowns, malformed chat, web key/pointer input, finite frame/approved art, text alignment/lane labels, invalid/large dt, state bounds, cooperative finish/reset, reload and actual PNG hashes. These 12 checks are separate from npm test and the Rust suites.

[Preview PNG](../evidence/seed-race-preview.png) uses actual Chromium and the platform's trusted canvas renderer with JSON frame data produced in quarantine. The candidate JavaScript never ran on the host. This verifies a rendered static frame at 1280×720; it is not interactive browser gameplay, actual Twitch participation, OBS footage or an audience test. A browser-control host failure in earlier sessions is retained as historical evidence; this later command-line Chromium rendering is a distinct, successful check.

[Cleanup receipt](../evidence/builder-cleanup-1793545844368.json) re-queried all **eight** VMs identified by this continuation and confirmed `destroyed`. The build VM and its fresh subscription auth cache were destroyed; its timer was stopped. The two pre-existing Rust VMs remain running and were never reused or changed. Settlement/invoice reconciliation remains pending.

## Failure/recovery evidence and review

Rejected creation names (provider maximum 22 characters), partial create responses (canonical metadata requires GET), idle pause before revision, the first faulty harness, and all successful attempts are retained under docs/evidence. Name rejection was reconciled against a complete provider inventory before any further creation. No uncertain existing resource was deleted.

Read-only adversarial reviews reproduced and helped fix: deleted test history on retry; rejection before artifact receipt; treating failed VM status as destroyed; persistence failure skipping cleanup; interruption before timer installation; accepting missing expiry; stuck vertical-key/pointer releases; and approval being limited to a pre-build round phase. Red/green logs are retained. Copied text logs normalize trailing whitespace; original command logs remain under the recorded /tmp paths. Final review inspected source and saved preview; it did not independently query the provider or execute the candidate. The bounded CLI scripts are operator trial tools, not a production worker contract. Some trial-specific failure paths require inspecting the protected journal and explicit operator reconciliation; do not treat them as a fully recoverable service.

## Reproduction interfaces and next engineering

Read every effectful script before invocation. None is part of default npm test:

```bash
node scripts/rehearse-builder-vm.mjs --live     # fresh tool-only probe and destruction
node scripts/rehearse-builder-vm.mjs --recover  # exact journaled probe cleanup
node scripts/builder-login.mjs prepare         # fresh private VM + new device login + timer
node scripts/builder-login.mjs status
node scripts/builder-login.mjs release
node scripts/build-seed-race-trial.mjs --live   # owner-selected fixed trial; no automatic retry
node scripts/revise-seed-race-trial.mjs --live  # single explicit trial readability correction
node scripts/test-seed-race-vm.mjs --live       # new quarantine VM; no model/auth transfer
```

These trial scripts depend on the owner's local reviewed catalog, a current authenticated guest session and protected journals. They deliberately refuse conflicting active rounds, stale source and unresolved work; they are not clean-checkout one-command automatic generation. `scripts/vm-seed-check.mjs` is guest-only and rejects a non-/workspace working directory. `preview-seed-frame.mjs` renders tested frame JSON through trusted browser code, not the candidate.

Next work: generalize dispatch/status/cancellation and contribution permissions into a recoverable worker adapter; export job input/approved resources through a defined contract; bind deployment to the approved artifact/report/credits and launch in a **separate game runtime**; connect bounded real Twitch commands to that remote runtime; implement actual public/private access policy and remix provenance. The web/MCP generation route still returns isolated_builder_required by default because it does not dispatch these operator tools. Separate VM/AI reservations, real provider billing, payments/commission, Agent Native connections, specialized security scanning and arbitrary upload/deploy remain engineering work. A scanner or passing game test cannot certify absence of malicious behavior.

No more account setup is needed to approve this artifact: the owner already approved it. A future build needs a fresh scoped login because the trial guest was destroyed. Runtime visibility/hosting will be an owner decision once its deployment package is concrete. Human play, real chat for this game and English video remain pending.

References actually used: local hermes-game-dev router, gaming-hub and its game-development-resources/studio-capability-gates references; official [Codex subscription/device authentication](https://learn.chatgpt.com/docs/auth), [Terra model](https://developers.openai.com/api/docs/models/gpt-6.1-terra), CreateOS [limits](https://createos.sh/docs/Sandbox/Limits/) and [CLI contract](https://createos.sh/docs/Sandbox/CLI/Commands/); cua-driver core and Linux instructions to expose the device-login window. Native tools included shell/Node, CreateOS CLI, systemd user timers, cua-driver, Chromium and image inspection. No new app runtime dependency was added.
