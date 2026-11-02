# Delivery checkpoint — November 2, before the freeze

This is an intermediate checkpoint. The feature freeze remains **12:00 Santiago / 15:00 UTC**; safe owner delivery is **18:00 Santiago / 21:00 UTC**. Nothing has been pushed, hosted or submitted by this work.

| Priority | Current state | Evidence / next action |
| --- | --- | --- |
| 1. Visible polish and attribution | Done | O14/O15/O16/O21: [720p](../evidence/local-ui-1793608089799-overlay-crowded-720p.png), [1080p](../evidence/local-ui-1793608089799-overlay-crowded-1080p.png), [Studio](../evidence/local-ui-1793608089799-studio-owner.png), [35 browser checks](../evidence/local-ui-1793608089799-rehearsal.json). |
| 2. Working story first | Done | README Start here links and working flow; SUBMISSION roadmap and explicit pre-hackathon/Codex attribution. Owner must add actual video/judge URLs. |
| 3. External Tee | Plan A pending; Plan B ready | [Pinned source, bounded request and 09:30 Santiago gate](TEE_DEMO_DECISION.md). No VM created. No guest/model spending, external repository edits or local server execution. The public remote catalog stays empty. |
| 4. Format, cleanup, architecture | Done within current scope | Separate format/cleanup commits, [architecture](../ARCHITECTURE.md), 271 green tests. Broad route extraction remains deferred; only proven unused bindings were removed. |
| 5. Judge hosting preparation | Checklist ready; deployment pending owner | [Runbook](JUDGE_DEPLOYMENT.md): persistent Linux VM, HTTPS/WSS, admin 403, isolation/recovery/reboot acceptance. Provider, URL, budget and actual acceptance are still unknown. |
| 6. English video preparation | Draft ready; recording pending owner | [Shot list](../recording/SHOT_LIST.md), 328-word narration, caption track ends at 2:45. Actual speech, human/Twitch footage and measured export still need review. |

The clean-install snapshot is `c8ff84c7d258d473b704e3006af20dd05dcc5338`. [Clean-install receipt](../evidence/delivery-polish-clean-install.json) records npm ci, 271 checks, the launcher and six inert-transfer checks. Browser results are separate. The subsequent source simplification in `8e5894e` also passed the full 271-check suite; [its receipt](../evidence/delivery-admin-cleanup.json) pins the tested server hash. The later sidebar correction in `278f169` passed the same full suite and 35 Chromium checks, including synthetic one/ten-author layouts. Subsequent commits only format that code and its rehearsal script. [Regression evidence](../evidence/overlay-sidebar-regression.json). No additional cloud run is implied.

The original Lantern Table source remains `6bf31dda8d610956129986af157af56e6b46448c3f49f396f707659b98034900`; the approved roles revision remains `449a8def63ca7d6d0261ef0e60d8bea9dddd743962bf6a16e8367674e1b5e075`. Both match the starting HEAD and saved owner receipts. Neither was edited or executed on the PC.

Owner decisions/actions: optional bounded Tee test and required login; host/provider and privacy disclosure; real Twitch moderator/OBS rehearsal; separate-game clip/source-access decision; English video export/YouTube; repository push and judge access; submission form. The existing real Lantern trial is sufficient construction evidence without purchasing another run.

The [current-secret scan](../evidence/delivery-secret-scan.json) checked 493 tracked files against seven configured secret values and found no matches. It does not certify historical values or every possible credential pattern. Formatting and delivery-document links also pass; approved Lantern source bytes remain unchanged.

Later delivery review: [all bundled credits](../evidence/bundled-credit-check.json) use the supplied owner name and pass the production source/resource validator. The [deployment template check](../evidence/deployment-template-check.json) parses the temporary systemd unit and shell blocks locally, without installing a service or proving remote acceptance. [Private browser QA](../evidence/loopback-browser-rehearsal.json) passes 35 checks; [integration cleanup](../evidence/private-test-cleanup.json) passes the 271-check suite and confirms temporary checkout removal. These maintenance changes add no production features.
