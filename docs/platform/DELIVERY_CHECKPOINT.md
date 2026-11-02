# Delivery checkpoint — November 2, before the freeze

The feature freeze is **12:00 Santiago / 15:00 UTC**. The owner's safe delivery target is **18:00 Santiago / 21:00 UTC**. This checkpoint precedes the freeze; no repository push, new VM/model spend, hosting publication or submission has been performed here.

| Priority | Current state | Evidence / remaining action |
| --- | --- | --- |
| 1. Visible polish and attribution | Done | O14/O15/O16/O21: [720p](../evidence/local-ui-1793614056771-overlay-crowded-720p.png), [1080p](../evidence/local-ui-1793614056771-overlay-crowded-1080p.png), [disabled Studio controls](../evidence/local-ui-1793614056771-studio-owner.png), [36 browser checks](../evidence/local-ui-1793614056771-rehearsal.json). Long banners and whole feed rows also fit the synthetic crowded scenes. |
| 2. Working story first | Done | README Start here, positive Studio wording, SUBMISSION roadmap and declared prototype/Codex provenance. Owner adds tested judge/video URLs. |
| 3. External Tee | Plan A off; Plan B selected | [Source pin, bounded request and alternatives](TEE_DEMO_DECISION.md). The **09:30 Santiago / 12:30 UTC** gate passed without a verified authorized run. [Decision receipt](../evidence/tee-gate-decision.json); no guest was created and public Tee stays off. Owner supplies the separate-game clip or uses roadmap narration over Vibe Arena. |
| 4. Format, cleanup, architecture | Done within current scope | Separate format/cleanup commits, [architecture](../ARCHITECTURE.md), dead-code removal and duplicate gate/reload simplification. No production feature added. Broad route extraction remains deferred. |
| 5. Judge hosting preparation | Checklist ready; deployment pending owner | [Runbook](JUDGE_DEPLOYMENT.md): persistent Linux VM, HTTPS/WSS, admin 403 and isolation/recovery/reboot acceptance. Local template/preflight checks pass; no purchased host is verified. |
| 6. English video preparation | Draft ready; recording pending owner | [Shot list](../recording/SHOT_LIST.md), 320 words and matching phrase-based captions ending at 2:45. Actual voice/footage, retiming and measured export still need human review. |

## Verified state

- The [clean-install suite](../evidence/delivery-current-suite.txt) passes **271 checks: 161 focused + 110 integration**. The [system Node profile](../evidence/system-node-check.json) separately passes the same suite with `/usr/bin/node` 26.12.0; the usual controller uses 26.12.1. These are local Linux checks.
- [Browser evidence](../evidence/local-ui-1793614056771-rehearsal.json) passes **36 checks**. [Long-banner/whole-row regression](../evidence/overlay-long-banner-regression.json) and [earlier author-count regression](../evidence/overlay-sidebar-regression.json) retain their failures and fixes. Maximum-field scenes are synthetic, not audience or real backend-failure footage. Later [overlay CSS](../evidence/overlay-css-cleanup.json) and [Studio CSS](../evidence/studio-unused-style-check.json) cleanup replays each passed the 271-check suite and 36 browser checks.
- [Effective local policy](../evidence/local-effective-policy.json) reads private environment plus public JSON: cloud execution, worker/preparation off, zero allocation/budget, empty remote catalog and event-credit simulation off. The configured origin uses a TryCloudflare hostname; configuration alone establishes neither an active tunnel nor durable judging access.
- [Deployment preflight](../evidence/deployment-template-check.json) passes a safe synthetic configuration and rejects local-execution/event-credit overrides. It parses shell blocks and a temporary systemd unit without installing services, connecting SSH or performing login.
- [All four bundled credit paths](../evidence/bundled-credit-check.json) pass production source/resource validation with the supplied owner name. [Current-secret scan](../evidence/delivery-secret-scan.json) found no matches for seven configured values in 493 then-tracked files; its scope excludes historical values and generic credential patterns.
- [Clean installation](../evidence/delivery-current-clean-install.json) records snapshot `592b8d0`, installation, the full suite, ten launcher checks and six inert-transfer checks. The separate [Studio round-count replay](../evidence/studio-round-counts-check.json) records its exact Studio JavaScript/rehearsal-script hashes. [Private QA cleanup](../evidence/private-test-cleanup.json) confirms process termination and temporary-checkout removal. A final freeze audit remains due at noon.

The original approved Lantern source is still `6bf31dda8d610956129986af157af56e6b46448c3f49f396f707659b98034900`; the approved roles revision remains `449a8def63ca7d6d0261ef0e60d8bea9dddd743962bf6a16e8367674e1b5e075`. Both match the starting HEAD and saved owner receipts. Neither was edited or executed on the PC.

## Owner delivery actions

Host/provider and privacy disclosure; real Twitch moderator/OBS rehearsal; separate-game clip/source-access decision; English export/YouTube; repository push and judge access; submission form. Existing real Lantern evidence supports the build story without buying another run.
