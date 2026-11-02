# Recording plan — Plan B, target 2:45

## What to demonstrate in two minutes

Show an idea entering the studio, a ballot and streamer approval; play Grove through real Twitch commands and browser input; keep the game/art/idea strip in view; demonstrate the fallback; then show Codex commits/tests and the real isolated Seed Race construction evidence. Explicitly distinguish that operator-run trial from the disabled experimental Studio connector.

Use English narration/subtitles and real Twitch footage. The existing evidence files are rehearsal records, not a finished video. Human play, OBS capture and export review remain owner actions. Record only what you can reproduce on screen.

| Time | Capture | English narration / evidence |
|---|---|---|
| 0:00–0:15 | Real channel beside Grove player/overlay; credit strip visible | “Our community can shape games and play together, while game creators, artists and idea authors stay visible.” |
| 0:15–0:40 | Actual Twitch `!idea` and `!vote`, studio round, local streamer selection/review | “Chat proposes and votes. The streamer approves the selected idea and resource pack.” The experimental VM worker remains off: its first actual attempt passed login but timed out without an artifact. Approval alone does not start it. |
| 0:40–1:10 | Actual Twitch `!plant 3`, `!water 3`, `!sun`; browser player clicks another plot | Show the changes in the same live game. If rehearsed successfully, show three distinct Twitch accounts sending the same sun/rain emote within five seconds, then a moderator pause/resume. “Some people open the game; others stay in chat.” Do not substitute the local inject-chat API for Twitch. |
| 1:10–1:25 | Game/art/idea strip and expanded license links | “The credit stays outside the game code, tied to this version.” Explain Kenney as a curated CC0 source, not a joined partner. |
| 1:25–1:40 | Broadcaster/moderator `!fallback`, or local streamer fallback control explicitly labeled | Use empty preferences for this Marble shot, or identify the configured preferred game before Marble. Show the displayed cause. Include a browser player and chat `!play`; `!race` needs two entrants. Do not call a manual fallback shot an automatic crash test. |
| 1:40–2:15 | The real Codex VM trial thread, construction receipt, separate-VM report and exact owner approval | “Codex built Seed Race in one private VM. Another VM tested it before exact version approval.” Label this as the earlier owner-selected trial, not the current Twitch proposal. Its static preview is not live deployed play. |
| 2:15–2:35 | This Codex thread, granular commits, final test output, isolation/fallback regression | “Codex reproduced the failures, isolated game execution, added recovery and verified 247 local checks.” Show the actual session ID. Never include live device codes, keys or credential files. |
| 2:35–2:45 | Back to Grove, visible credits, one honest next step | “Verifying the experimental isolated Studio builder is next. Discovery and credited clips are future work.” |

## English narration and subtitle drafts

[Ready-to-read narration](recording/narration-en.txt) follows these shots and explicitly distinguishes the unpublished Seed Race trial from the live reviewed games. [SRT draft](recording/captions-en.srt) contains matching text on a 2:45 timing track. Retiming to the actual voice and footage, English export review and a measured final duration are still required. Neither draft is a recorded demo or evidence of Twitch/human participation. Use the requested-fallback wording only with a matching manual-fallback shot.

## Operator preparation

The owner chose to rehearse later. Use [REHEARSAL.md](REHEARSAL.md) for disposable local practice and the pending human/Twitch checklist.

1. Verify the supplied Cristóbal Muñoz operator/contact details on `/privacy.html`, complete hosting/recording disclosure, and retain the [owner-confirmed prototype rights/dates](evidence/owner-rights-confirmation-2026-11-01.json). The original prototype is Devin-assisted; show the Codex-authored contributions without reattributing it. Record consent/visibility expectations for anyone whose username appears.
2. Arrange a stable runtime/ingress within your approved hosting budget; no new hosting was provisioned by this revision. The approved Seed Race has no live runtime yet and must not be imported onto the host. Do not spend a new builder trial just to recreate footage.
3. Run setup and Twitch authorization using your own private local configuration, then `npm start -- --twitch YOUR_CHANNEL --game-dir games/community-grove`. Confirm actual chat connection and `!join` replies. No .env or authorization-code screen belongs in the capture.
4. Open the player page and `http://localhost:8420/overlay.html` in OBS at 1920×1080. Record the complete overlay and full-width credit strip; the layout was also checked at 1280×720. The isolated local Chromium rehearsal is evidence of desktop layout and synthetic keyboard input, not an OBS recording or human usability review.
5. Prepare the studio round privately. Use local owner controls to open/start/close/select/review/approve; clear and hide key fields before recording. `!build approve` requires the exact review token; do not stage an unapproved build as a completed one.
6. Rehearse with actual browser and Twitch participants. Let a real command/effect finish before the next shot. Keep at least two entrants for the Marble segment. For local forced fallback, POST `/admin/fallback` with the private confirmation header from a local tool; never put the header value into a screenshot or public URL. A Twitch moderator uses the trusted IRC mod tag, not a browser nickname.
7. Hide unrelated tabs, notifications, credentials and unlicensed logos/music. Exclude all remote Rust demos from the recording path. Keep required source/license credits and verify permission for any third-party material visible in the final video.
8. Record the real guest build from the existing Codex session/evidence if footage is available. The new Lantern Table attempt timed out and is failure evidence only. If no earlier successful construction footage exists, film a truthful walkthrough of that thread and its build/test receipts; do not label playback/static evidence as a new live build. Repeating a cloud trial requires separate scoped authorization and a fresh guest login; the bounded increment proposal remains pending.

## Export and submit — owner only

Watch the entire English export, target 2:45 and under three minutes. Verify readable commands, actual Twitch responses, creator attribution, session IDs and the honest worker boundary. Do not show simulated credit deposits as purchases or Channel Points as funding.

Upload publicly to YouTube; verify logged-out access. Push the private repository yourself and grant testing@devpost.com access. Supply a working free test path through November 15, and complete the Devpost form. Golden-path go/no-go November 2 at 10:00 UTC; feature cutoff at 15:00 UTC; stabilize and finish human rehearsal 15:00–17:00, reserve 17:00–21:00 for recording/review/delivery, verify access by 20:00 and aim to submit at 21:00 UTC. Official close is 22:00 UTC / 19:00 Santiago. No upload, push or submission has been performed by Codex here.
