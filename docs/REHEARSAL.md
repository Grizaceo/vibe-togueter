# Plan B rehearsal, prepared for later human participation

November 1, 2026. The owner chose to rehearse later. No human, new Twitch, OBS or exported-video evidence is recorded by this preparation.

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

`marble`, `duel`, `grove` switch reviewed games; `fallback` requests the same local recovery path. Marble needs two browser entrants before a race can start; local commands are not Twitch. Duel's private streamer controls require normal operator setup for the later real rehearsal. `stop` exits and cleans up. Ephemeral control keys are kept inside the launcher and never printed.

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
| Broadcaster or real moderator `!fallback` | Sender role, Marble transition and visible cause | Pending |
| Two entrants, chat `!play` then `!race` | Both entrants and actual moving race | Pending |
| Game/art/idea credits, Kenney links | Human readability check on player and OBS at capture size | Pending |
| Disconnect/reconnect and return to Grove | Observed recovery and any failure | Pending |
| English video, under three minutes | Full export watch, exact duration, readable Twitch/Codex shots | Pending |

If anything fails, retain the failure and its UTC time. Fix the observed issue before recording a new result. Use a new dated evidence file; do not replace earlier rehearsal records. Keep usernames/recording expectations agreed with participants. Never record keys, configuration, auth codes or unrelated private windows.

Follow [the 2:45 recording script](DEMO_SCRIPT.md). Show the existing Seed Race trial as prior construction/test/approval evidence; its preview remains static and its runtime remains unconnected. An actual human should review the full export and public YouTube playback. The owner handles private push/access for testing@devpost.com, hosting, rights attestation and Devpost submission; none is performed by these commands.

Checkpoints November 2: builder decision 09:00 UTC; freeze 13:00 (then observed-failure fixes only); human demo by 16:00; recording/delivery reserve 17:00–21:00; prudent submission 21:00. [Official rules](https://twitchcon-codex.devpost.com/rules), rechecked November 1, list close at 22:00 UTC / 19:00 Santiago, public YouTube footage of Twitch and Codex, English materials, code/testing access and free judging use through November 15.
