# Operating Vibe Arena

This guide is for the streamer who runs the controller. For what each part does, see [ARCHITECTURE](ARCHITECTURE.md). For the optional session features, see [FEATURES](FEATURES.md).

## Requirements

- **Host:** a Linux machine with bubblewrap and user namespaces. The controller does not run natively on macOS or Windows. Players only need a browser.
- **Node:** the namespace worker always runs `/usr/bin/node`, and the guest uses usr-merged library paths.
- **Isolation:** if isolation support is missing, the controller fails closed instead of running games unsandboxed.
- **Runtime dependencies:** `ws` and `@modelcontextprotocol/sdk`, plus the dependencies locked with them.

## Local play

```bash
npm ci
npm start -- --game-dir games/community-grove
```

The controller serves three pages:

| Page | Address |
|---|---|
| Players | `http://localhost:8420/` |
| Ideas and resources (Studio) | `/studio.html` |
| OBS layout | `/overlay.html` |

Local play needs no Twitch account, payment or coding-provider key. The lobby offers a web-guest seat.

For a disposable practice session, run `node scripts/demo-local.mjs`.
- It prints loopback URLs and gives terminal controls for game switching, fallback, proposals, votes, review and approval.
- `stop` removes its temporary state.

Switch the bundled game from another terminal:

```bash
node scripts/arena-admin.mjs load marble-race
node scripts/arena-admin.mjs load chat-vs-streamer
node scripts/arena-admin.mjs load community-grove
```

These administration commands are local. A second controller cannot take the same runtime lease. Do not reset a runtime journal to get around reconciliation.

### Bundled games

| Game | Browser | Chat |
|---|---|---|
| Community Grove | Arrows or A-D and space, or click a plot | `!plant 1–6`, `!water 1–6`, `!sun` |
| Marble Race | Joining the room adds a marble | `!play`, then `!race` once two marbles exist |
| Democracy Duel | The streamer moves and fires after unlocking with the streamer key | `!left`, `!right`, `!fire`: one action per three-second vote |

How each game ends:
- **Grove:** grow all six trees; the round resets after the celebration.
- **Marble Race and Democracy Duel:** there is no final round. Democracy Duel's chat-voted turns repeat continuously.

Grove uses three Kenney CC0 images. Its contributor record credits them even before an operator publishes a resource manifest. Kenney has not joined or endorsed this project.

## Local secrets

Run `npm run setup:local` once. It writes these keys into the ignored `.env` and never prints them:

| Key | Use |
|---|---|
| `VA_ADMIN_TOKEN` | Local admin API |
| `VA_STREAMER_KEY` | Streamer controls |
| `VA_EVENTSUB_SECRET`, `VA_WEBHOOK_SECRET` | Webhook secrets |
| `VA_SEAT_KEY` | Seat-token signing key |

It never overwrites a key that already exists. `npm run setup:local -- --rotate-seat-key` replaces only the seat key, which voids every seat token.

Keep tokens, authorization codes and the admin and streamer keys out of chat, URLs and recordings.

## Connecting a Twitch channel

1. Run `npm run setup:local`, then put your Twitch app details and registered callback URL in `.env`.
2. Authorize with `npm run twitch:auth`, and check the safe summary with `npm run twitch:status`.
3. Start the controller with your channel:

   ```bash
   npm start -- --twitch YOUR_CHANNEL --game-dir games/community-grove
   ```

The controller validates and refreshes the OAuth token, and replies through a reconnecting IRC client. `--twitch` must be the channel of the authorized account.

## Connecting Kick

Kick chat arrives through Kick's signed webhooks. Replies use the outgoing chat API. To connect it:

1. In kick.com, open Settings, then Developer. Create an app, enable webhooks and set the webhook URL to `<public URL>/webhook/kick`.
2. Put the channel's numeric `broadcaster_user_id` in `vibe-arena.config.json` as `kick.broadcasterUserId`. Only the sender with that id gets the broadcaster role.
3. Subscribe the events:

   ```bash
   node scripts/kick-subscribe.mjs --token <TOKEN> --user <broadcaster_user_id>
   ```

4. Optionally, to post in Kick chat, set `VA_KICK_TOKEN` to a user token with `chat:write`.

The webhook URL lives in the Kick app settings, and a quick tunnel changes hostname whenever cloudflared restarts. For a session, run cloudflared on its own and start the controller with `VA_TUNNEL=detect`. Restarting the controller then keeps the hostname. Kick unsubscribes an app whose webhook keeps failing for more than a day.

No real Kick account has been tested yet. See [COMPAT](COMPAT.md).

## Public link and `!join`

`!join` in chat answers with the public link. It only hands out a URL after a probe through that URL reaches this controller, so a stale `VA_PUBLIC_URL` is never posted.

`VA_TUNNEL` chooses how the controller finds the link:

| Value | Behaviour |
|---|---|
| `auto` (default) | Checks `VA_PUBLIC_URL`, then a running quick tunnel, then starts `cloudflared tunnel --url` itself. |
| `detect` | Only checks; it never starts a tunnel. |
| `off` | No public link. |

Starting a tunnel requires `npm run setup:local`. `/admin/status` shows the link state under `publicLink`.

To check a real tunnel end to end, run `node scripts/public-link-check.mjs` while the controller runs. It writes its result to `docs/evidence/public-link-real-<timestamp>.json`.

## Seats: playing under a Twitch or Kick name

The posted link is the same for everyone. How a viewer gets a seat:

1. The viewer opens the link. The lobby shows a code such as `!join K7F3QX`.
2. The viewer types it in Twitch or Kick chat.
3. The chat message comes through the authenticated path: IRC tags for Twitch, a signed webhook for Kick. It seats that browser tab as that account, with its platform roles.
4. A reload of the same tab keeps the seat.
5. "Not me" releases it.

Viewers who do not want to pair can play as a web guest. A guest's name is shown as unverified.

The admin side:

| Where | What it does |
|---|---|
| `/admin/status`, field `seats` | Lists every seated or pending tab. |
| `POST /admin/seats/revoke {"sub":"twitch:123"}` | Removes that identity's seat. |

The design and its limits are in [IDENTITY_SEATS](platform/IDENTITY_SEATS.md).

## Streamer controls

Enter the streamer key in the player page to control the streamer side of Democracy Duel. The field clears, and the key never goes into browser storage or links.

Studio owner tools also need local admin authentication plus streamer confirmation. The admin API only answers on localhost and rejects forwarded requests.

A display name never grants broadcaster or moderator powers. Those come from Twitch IRC tags or a signed Kick payload, message by message.

## Safety and recovery

**Isolation.** Reviewed bundled games run in a disposable Linux namespace process with an empty credential environment, bounded pipes and deadlines. The controller never evaluates game callbacks. The browser only receives drawing primitives ([MODE_A_FRAMES](platform/MODE_A_FRAMES.md)).

**Fallback.** When a game stops answering or fails, the controller:
- follows the streamer's fallback order ([FEATURES](FEATURES.md#preferred-fallback-games));
- keeps connected players;
- shows the cause.

Marble Race is always last. A failed fallback stops instead of retrying forever.

**Requesting a fallback.**
- In chat, a broadcaster or moderator on Twitch or Kick can send `!fallback`.
- Locally, `POST /admin/fallback` needs the streamer confirmation key.

**Generated games.** Generated games need separate build, test and runtime VMs. Cloud mode is the default and never falls back to the host. The Studio worker ships disabled ([STUDIO_WORKER](platform/STUDIO_WORKER.md)). Nothing in `artifacts/` is ever imported onto the host as a game.

**Hosting.** Cloud VMs are the default, and self-hosting is a deliberate streamer choice. See [HOSTING_POLICY](platform/HOSTING_POLICY.md).

## Privacy

The privacy notice is served at `/privacy.html` and linked from all three pages.

Before public operation, the operator must complete:
- the hosting and recording placeholder;
- a retention and deletion procedure for ideas, ballots, creator records and quarantine records.
