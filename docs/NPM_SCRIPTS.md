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

The separate browser rehearsal is `node scripts/rehearse-ui-local.mjs`. It uses a disposable copy, mock worker routes and headless Chromium, with no owner environment, cloud VM or model call. Screenshots and JSON go to `docs/evidence/local-ui-*`; new outputs are ignored, while committed submission evidence remains tracked.

See [Start here](../README.md#start-here) for the demo and delivery evidence. Evidence remains in place to preserve historical references. Do not treat ignored runtime journals as disposable operator data.
