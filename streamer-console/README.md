# Vibe Arena streamer console

A private console where the streamer reviews and approves Vibe Arena rounds and builds, and where viewers see their own profile and report problems. It runs as a separate app next to the Vibe Arena controller.

## Built on agent-native (external platform)

This app is built on **agent-native** (`@agent-native/core` 0.222.2, `chat` template). I did not write agent-native: it is a third-party framework, used here as a dependency. It provides:

- the app shell, sign-in and accounts, SQL storage and migrations, and live sync;
- the action system (`defineAction`, `uiOnly`, `authorize`) and the client hooks;
- the agent chat and its tool loop, plus `doctor` and `typecheck`.

The scaffold was committed untouched, in its own commit (`chore(streamer-console): add unmodified agent-native 0.222.2 chat scaffold`). Every change after that commit is this project's code.

**What this project adds:**

- `actions/`: the console and viewer actions, listed in [AGENTS.md](AGENTS.md#vibe-arena-console).
- `server/lib/arena.ts`: a client for the existing controller admin API.
- `server/lib/access.ts` and `server/lib/rules.ts`: the streamer, moderator and viewer rules.
- `server/lib/seat-link.ts`: links a viewer through the controller's existing seat pairing.
- `server/db/`: the console's own tables (unlocks, identity links, reports, decisions, proposals).
- `app/routes/console*.tsx` and `app/routes/me.tsx`: the screens.
- `scripts/local-arena.mjs`: a disposable local controller for testing.
- The controller itself gained two read-only routes, `GET /admin/viewer-profile` and `GET /admin/round-credits`, with tests in the main repository.

## Status

Alpha, local only. It has been tested against a disposable copy of the real controller on loopback. It has not been used in a live stream.

## Quickstart

```bash
pnpm install
cp .env.example .env    # set VA_ARENA_URL, VA_ADMIN_TOKEN, VA_STREAMER_KEY to the controller's values
pnpm exec agent-native dev
```

Sign in, then open `/console` and type the streamer key. Viewers land on `/me`. To test without your real controller, run `node scripts/local-arena.mjs` and point `.env` at the fixture it prints.

## How it works

- **The controller is the source of truth.** It owns rounds, seats, credits, Studio jobs and VM leases. The console server calls the controller on loopback with the same headers the Studio sends (`Authorization: Bearer VA_ADMIN_TOKEN`, `x-streamer-key`). These secrets stay in the server's environment. They never reach the browser, the agent, logs or the database.
- **Streamer.** A signed-in account becomes the streamer after typing `VA_STREAMER_KEY`, and the controller must confirm it. The unlock lasts 4 hours or until the streamer locks it. No new streamer identity exists.
- **Delegated moderator.** The console is read-only for a moderator, under two conditions:
  - their linked chat identity carried the moderator role when they linked it, in the last 12 hours;
  - the controller's current delegation names them.

  They approve input the way they already can, by typing `!build approve <token>` in chat.
- **Viewer.** A viewer can do three things: link a Twitch or Kick identity, read their own profile, and send a report.
  - **Linking.** The console opens a pending `?seat=1` socket and shows a pairing code. The viewer types `!join CODE` in chat, and the controller offers a seat bound to the console's key. The console reads the identity from that offer. It never redeems the token and never takes a game seat.
- **Decisions happen only in the UI.** Approving the input, approving the artifact, managing the round, the VM and the build, the controls and resolving reports are all `uiOnly` actions. The agent can read state and record a proposal. It cannot decide anything. Each decision is logged with `decided_via = streamer-ui`, and the controller records `source: streamer-ui`.

## How this was built

- **The maintainer** chose the scope and the permission rules, and the constraint that the controller, SeatAuthority and VM orchestration stay unchanged.
- **The AI assistant (Devin)** read the Studio and the admin routes and wrote the plan. It added the two controller routes and their tests, and wrote the console code after the scaffold commit.
- **Checked:**
  - the controller test suite;
  - `pnpm typecheck`, `pnpm agent-native:doctor` and `pnpm test` in this app;
  - a headless browser run against a disposable controller. That run covered: linking a viewer, a wrong key and an unlock, a rejected second round, review and approval of the exact input, cancelling a round and opening a new one, the viewer profile, and sending and resolving a report. It also checked the read-only moderator path, and that a direct HTTP call to a `uiOnly` approval is refused.
- **Not checked:** a real Twitch pairing (the browser run used a signed Kick webhook fixture), a real VM, Studio job dispatch, cancellation or artifact approval, and the agent chat with a live model.

## Limits

- **No real build job yet.** Dispatching, cancelling and approving an artifact call the existing controller routes. They have not run end to end, because that needs a cloud VM.
- **Moderator match.** A moderator is matched by display name compared case-insensitively with the delegated login. A Twitch display name that differs from the login does not match.
- **Delegation platform.** A delegation granted from this console (or the Studio) is scoped to Twitch by the controller. A Kick moderator needs `!delegate` sent from Kick chat.
- **Profile history.** The profile finds ideas and ballots made from chat with a platform id, or from a seated browser tab. Older Twitch messages without the `user-id` tag are not attributed.
- **Pairing state.** Pairing state lives in this server's memory, so a restart cancels pending codes.
- **Reports** have no attachments.
