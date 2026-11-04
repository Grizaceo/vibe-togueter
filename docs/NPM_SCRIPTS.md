# npm scripts

Run from the repository root after `npm ci`.

| Script | Purpose |
| --- | --- |
| `npm test` | Full focused and isolated integration suite; temporary state and mock providers. |
| `npm start -- [args]` | Start the controller; arguments are documented in `src/server.js`. Reads local configuration. |
| `npm run dev -- [args]` | Same controller with Node watch mode. |
| `npm run mock-llm` | Local mock coding provider used for development. |
| `npm run mcp` | Start the MCP server over stdio. |
| `npm run twitch:auth` | Authorize the operator-owned Twitch account. Requires operator credentials. |
| `npm run twitch:status` | Print the safe local Twitch authorization summary. |
| `npm run setup:local` | Prepare ignored local operator configuration. |
| `npm run twitch:subscribe -- [args]` | Register Twitch EventSub subscriptions; requires operator authorization. |

## Scripts outside npm

| Script | Purpose |
| --- | --- |
| `node scripts/rehearse-ui-local.mjs` | Headless Chromium rehearsal of the lobby, overlay, Studio and privacy pages. Uses a disposable copy and mock worker routes, with no owner environment, cloud VM or model call. Writes `docs/evidence/local-ui-*`, which git ignores. |
| `node scripts/rehearse-seats.mjs` | Headless Chromium rehearsal of seat pairing. Pairs a Kick viewer through a webhook signed with a local test key, then checks a reload, a web guest and a legacy client. Writes `docs/evidence/seats-local-*`. |
| `node scripts/public-link-check.mjs` | Owner-run check of `!join` through a real cloudflared tunnel. It never opens ingress itself. Writes `docs/evidence/public-link-real-*`. |
| `node scripts/latency/bench.mjs` | Mode-A latency and traffic benchmark. Options and results are in [MODE_A_FRAMES](platform/MODE_A_FRAMES.md). |
| `node scripts/demo-local.mjs` | Disposable practice session with terminal controls. |
| `node scripts/arena-admin.mjs load <game>` | Switch the bundled game on a running local controller. |

How to run the controller is in the [operating guide](OPERATING.md). Do not treat ignored runtime journals as disposable operator data.
