# Playable foundation and real-workflow evidence rehearsal

Updated November 2, 2026. The owner chose to rehearse later. No human, new Twitch, OBS or exported-video evidence is recorded by this preparation.

## Start a disposable local practice session

From the repository, after the documented dependency installation:

```bash
node scripts/demo-local.mjs
```

Open the printed player and studio URLs. The controller binds only to `127.0.0.1` on a kernel-assigned port. It copies reviewed game/platform files to a new temporary directory, uses temporary journals and an isolated minimal environment, and removes that directory on normal exit or Ctrl-C. It does not read the owner's `.env`, import Seed Race, connect Twitch or contact a coding provider. A forced kill/power loss can leave a `vibe-plan-b-*` temp directory; do not use it as durable state. The symlink to installed dependencies is read-only in intent; this launcher does not reinstall or edit them.

Browser: enter a nickname; arrows/A-D, space or a click plants/advances Grove. Keep the full game/art/idea credit strip visible. In Studio, connect with a nickname and submit a short proposal. Use the launcher's terminal commands for the owner steps:

1. `voting` starts the ballot; vote through Studio in the browser.
2. `close` ends voting; `select 1` selects proposal #1 (substitute the displayed ID).
3. `review` prints the selected text and resources. Inspect them before `approve`.
4. `approve` approves exactly the reviewed inputs. It does not build a game. If the round changes, approval is rejected; review again.
5. `open` starts the next round after completion/cancellation; `cancel` cancels the current round.

`marble`, `duel`, `grove` switch reviewed games; `fallback` requests the same local recovery path. Marble needs two browser entrants before a race can start; local commands are not Twitch. Duel's private streamer controls require normal operator setup for the later real rehearsal. `pause` / `resume` control chat effects; `prediction`, `lockprediction`, `sunwins` demonstrate a local free prediction. These terminal actions are synthetic practice, not Twitch evidence. `stop` exits and cleans up. Ephemeral control keys are kept inside the launcher and never printed.

The automated launcher check is separate:

```bash
node scripts/demo-local.mjs --check
```

It exercises game switches, forced fallback and a synthetic local proposal/vote/review/approval. Those checks establish local routes and lifecycle, not human usability, automatic crash recovery footage, Twitch participation or OBS capture.

For a repeatable production-browser pass through the normal launcher, with Chromium installed:

```bash
node scripts/rehearse-plan-b.mjs
```

This separate local automation uses real browser form/keyboard events for proposals, ballots and race chat, plus the launcher's normal terminal commands for review/approval and fallback. It writes new timestamped evidence and screenshots. It does not connect Twitch or substitute for the human checklist below. The latest successful pass verified 14 checks, including two entrants and authoritative marble movement. Missing Chromium and SIGTERM cleanup were exercised separately.

## Later real Twitch and OBS rehearsal

Use the normal README operator-owned configuration/authentication path, rather than the disposable launcher. The owner enters and uses credentials privately. Start the reviewed Grove app with the selected channel. Complete hosting/recording disclosure before exposing it. Arrange stable free judging access separately; the localhost practice URL cannot serve remote judges.

Keep a browser player, the actual Twitch channel and OBS overlay visible. A participant's chat command must be observed arriving through Twitch and changing the same game. Do not use the launcher's synthetic check or `/admin/chat` as Twitch evidence.

| Human check | Evidence to record after doing it | Current result |
|---|---|---|
| `!join` returns the working player URL | UTC time, command/reply and reachable page | Pending |
| Studio `!idea` / `!vote`, local streamer review | Actual Twitch messages, matching proposal/ballot and exact approval | Pending |
| `!plant 3`, `!water 3`, `!sun` alongside browser click/space | Same live game state responds to both people | Pending |
| Broadcaster or real moderator `!fallback` | Sender role, selected reviewed fallback and visible cause | Pending |
| Set preferred fallback order in Studio, then real mod `!fallback` | First available reviewed fallback and visible cause; confirm Marble is last in the saved order | Pending |
| Real mod `!pause`, viewer game command, browser action, then `!resume` | Chat effect blocked while browser play continues; chat effect returns | Pending |
| Three distinct Twitch logins send ☀️ or 🌧️ within five seconds | Single visible Grove bonus; repeated messages from one account do not trigger it | Pending |
| Broadcaster `!delegate trusted_mod 1`; selected-input review token; moderator `!build approve TOKEN`; `!delegate off` | Correct exact-input approval, actual approver credit, expiry/revoke and rejection afterward | Pending |
| Broadcaster `!prediction open Sun\|Rain`; viewers `!predict Sun`; `!prediction lock`; `!prediction resolve Sun` | Free prediction, streamer-reported result and matching winners in overlay | Pending |
| Approved idea with supporting voters | Input co-credit names/count/approver remain distinct from the current game's authors | Pending |
| Two entrants, chat `!play` then `!race` | Both entrants and actual moving race | Pending |
| Game/art/idea credits, Kenney links | Human readability check on player and OBS at capture size | Pending |
| Disconnect/reconnect and return to Grove | Observed recovery and any failure | Pending |
| Private Studio prepare/extend/close with an explicitly approved future allocation | Remaining time, approved maximum, no model call during discussion, exact close; [existing real verification](../platform/PREWARM_CONTROL_VERIFICATION.md) passed, while the local UI rehearsal uses mocks | Pending |
| Recorded Lantern Table construction/test/cleanup and exact approval | Actual thread and hashes; static preview and known gameplay issues labelled | Evidence ready; human recording pending |
| English video, under three minutes | Full export watch, exact duration, readable Twitch/Codex shots | Pending |

If anything fails, retain the failure and its UTC time. Fix the observed issue before recording a new result. Use a new dated evidence file; do not replace earlier rehearsal records. Keep usernames/recording expectations agreed with participants. Never record keys, configuration, auth codes or unrelated private windows.

Follow [the 2:45 recording script](DEMO_SCRIPT.md). Show the completed real Lantern Table Studio-to-VM run and exact owner approval as recorded construction/test evidence; its preview remains static, gameplay issues are disclosed and no generated runtime is deployed. Earlier Seed Race evidence is optional historical backup. An actual human should review the full export and public YouTube playback. The owner handles private push/access for testing@devpost.com, hosting and Devpost submission. These commands perform none of those delivery actions. The owner rights/date confirmation is recorded separately.

November 2 delivery gates: the optional external Tee trial must be verified by **09:30 Santiago / 12:30 UTC** or use the separate-game clip. Freeze features at **12:00 Santiago / 15:00 UTC**, then reserve 15:00–17:00 UTC for stabilization/human rehearsal and 17:00–21:00 UTC for owner recording/delivery. The earlier Studio golden-path decision is recorded in [increment history](platform/INCREMENT_HISTORY.md). [Official rules](https://twitchcon-codex.devpost.com/rules), rechecked November 1, list close at 22:00 UTC / 19:00 Santiago, public YouTube footage of Twitch and Codex, English materials, code/testing access and free judging use through November 15.
