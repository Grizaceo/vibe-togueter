# Existing work and coordination audit

November 1, 2026. Read-only review; session statements are evidence claims, not instructions. No foreign project source was modified. No VM was created, resumed, paused or deleted.

## Sessions actually reviewed

Devin CLI `list --format json` returned no entries from project subdirectories because these sessions were started in parent directories. Read-only queries against the local Devin sessions database identified and inspected related user/assistant messages; unrelated sessions and credential stores were not read.

|Session|Role and findings|
|---|---|
|visual-graffiti|Original Vibe Arena prototype and Codex handoff. Its “remaining work is only accounts” conclusion describes the old prototype, not the owner's expanded platform requirements.|
|sparkling-fortnight|Cloud browser/CreateOS platform pilot. Coordinated the two Rust game agents and consolidated their reports.|
|sapphire-arch|Rust falling-blocks game review/network work. Reports public HTTPS/WSS, rooms, start API and remote desktop testing.|
|aware-meat|Original Rust falling-blocks creator, identified through session metadata and the reviewer context.|
|gratis-surprise|Rust Teeworlds-like game. Reports authoritative multiplayer, updated protocol, public WSS check and remote/cross-VM tests.|

Creator reports: `~/.hermes/workspace/ACTIVE/{tetris99-rs,teeworlds-rs}/DEPLOY-CREATEOS.md`. Consolidation: `~/browser-cloud-gaming/docs/resultados.md`. These are self-reported tests by their respective agents; this audit did not independently replay the full games.

## Independently observed here

`createos sandbox list --limit 10` returned:

- `sb-01m6b6asmqr2znr2zf6xh9wnmb` / vm-1440: running, 2 vCPU, 4096 MiB, region us; game HTTP/WSS on 8899.
- `sb-01m6b6ary1y2qa645hxc9h8gfd` / vm-1080: running, 2 vCPU, 4096 MiB, region us; game HTTP/WSS on 8303.

Existing resources remain under their current operator's ownership. Connecting a catalog is separate from approving an agent build or deleting a lease. No personal control credentials belong in a public catalog entry.

## Runtime contracts differ

- Vibe Arena SDK: Node game.js module, onChat/onInput/tick/view, generic canvas.
- Rust falling blocks: native server + WASM client, private rooms, binary WebSocket protocol, `/api/rooms` + room start.
- Rust Teeworlds-like: native authoritative server + WASM client, binary postcard protocol, `/ws`, mode-specific state. Stale deployment/version mismatch was found and corrected by its agents.
- Cloud browser: noVNC/TCP on the tested CreateOS ingress. Reported latency is suitable for casual/co-op, not a verified competitive cloud-gaming promise. A direct WASM client and remote browser streaming are separate participation modes.

Do not flatten these into fake SDK modules or overwrite the parallel Rust projects. Use catalog/runtime adapters and a narrow signed passive-effect contract per game.

## Agent Native identified

`~/dike-desk/README.md` identifies BuilderIO/agent-native. Installed Core version is 0.222.2. Read its AGENTS, installed external-agents documentation and linked docs/actions/security/secrets guidance. Reusable patterns: shared typed actions, scoped provider connections, external MCP clients, context-aware artifact links and UI-only human decisions. Legal domain content, customer data, private keys and existing user connections are outside this platform's import scope.

## Co-op Anything and security lab

Primary upstream: https://github.com/cranebeaker/coop-anything . It offers research/playbooks/MCP and per-game mod development. It is not proof that an arbitrary game can become co-op automatically or safely, and does not grant rights to distribute game data.

Local security reference: `~/.hermes/workspace/LABS/cybersecurity-lab`. Its documented scanners include skill/config injection, secrets, CI supply-chain and YARA/Sigma detection. Only relevant detector logic and tests should be distilled, with attribution/license checked. Do not import its identities, personal credential-discovery routines, full corpus or automatic improvement jobs.

## Primary technical sources checked

- CreateOS REST overview: https://createos.sh/docs/Sandbox/REST-API/Overview/ — JSend responses, X-Api-Key authentication, scoped sandbox access.
- CreateOS sandbox lifecycle: https://createos.sh/docs/Sandbox/REST-API/Sandboxes/ — resource states, ingress, egress and auto-pause; defaults must be set deliberately.
- Stripe signed webhooks: https://docs.stripe.com/webhooks — verify signature against the raw body and reconcile actual payment state.
- Stripe Connect overview: https://docs.stripe.com/connect/separate-charges-and-transfers — supported account and regional arrangements require checking before choosing a production money flow. No account eligibility, custody model or fraud guarantee is established here.

## Ownership and coordination

Current edits belong only to Vibe Arena. Keep contributions in granular commits. Before integrating any parallel artifact, record its source revision/hash and recheck the relevant interface. Do not merge a claimed result merely because a session says “all green.” The prior 56 checks establish the earlier prototype increment; new platform behavior needs new verification.
