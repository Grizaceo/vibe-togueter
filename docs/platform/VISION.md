# Vibe Arena — community game studio

Owner-directed revision: November 1, 2026. This supersedes the earlier two-format submission scope. Those formats and real-chat checks are a foundation, not completion of this platform.

## Product thesis

A stream community proposes, funds, builds and plays games together; the streamer decides what is built, accepted, shared and spent.

## Canonical journey

Connect Twitch → choose/attach a cloud runtime → open a proposal round → accept up to 10 first-arriving ideas of up to 100 words → viewers vote → streamer confirms or overrides the selection → reserve the configured VM/AI budgets → run the selected coding agent inside an isolated build VM → quarantine and test the artifact → streamer approves that exact version → deploy to a separate game runtime → play actively or through bounded passive chat effects → save privately or publish with origin credit.

All numerical defaults are streamer settings. More than one selected idea is an explicit streamer policy. No vote, donation, model output or PR can approve itself. A failure to connect an isolated builder blocks the build; it never falls back to the streamer's computer.

## Required capabilities and current evidence

|Owner requirement|Integration target / boundary|Current evidence|
|---|---|---|
|1. CreateOS or standard cloud VMs|Provider adapter, owner connection, runtime leases, usage and shutdown policy|Two existing CreateOS game VMs observed running; no VM created or deleted by this revision|
|2. Preloaded/uploaded games + both Rust projects + Co-op Anything|Catalog separates SDK games, external WASM servers, remote desktops and reviewed uploaded artifacts|SDK games work; Rust projects have their own creator reports and remote endpoints; Co-op Anything upstream is a per-game research/build playbook, not a universal runtime conversion switch|
|3. Prompt → capped intake → chat ballot → streamer choice → funded build|Durable round state; owner-controlled settings and explicit build approval|Prior unrestricted !idea/latest-idea loop is insufficient; this is the first core increment|
|4. Transparent VM/AI funding|Separate settled, reserved and spent balances per purpose; signed payment events; public receipts and usage reconciliation|Existing treasury is accounting/demo credit. Twitch events do not transfer cash to VM/AI providers. No payment or automatic settlement claimed|
|5. Agent Native / bring your accounts and stack|BuilderIO Agent-Native, as identified in dike-desk; scoped connections, shared actions, external MCP agents, UI-only approvals|Installed dike-desk Core 0.222.2 docs read. No account, legal data, memory or credentials copied. Actual framework integration remains separate from matching its design patterns|
|6. Viewer agents submit ideas/improvements|Narrow contribution permissions, immutable artifact hash, review ledger, owner decision|Owner MCP stdio/admin token must never become a viewer credential|
|7. Specialized security review|Read-only distillation of local cybersecurity-lab rules into a small contribution policy; static checks, dependency/license checks and isolated dynamic tests|Lab reviewed as reference only; a scan cannot promise zero risk or replace VM isolation|
|8. Passive participation across games|Capability-declared chat effects, per-user/aggregate limits, bounded parameters, idempotent delivery|SDK onChat works; Rust-specific bridges need explicit game contracts. No universal arbitrary remote command execution|
|9. Public/private catalog and origin credit|Owner policy + actual runtime access control; original channel/version provenance|Hiding a catalog entry does not make an already-public VM endpoint private. Attribution watermark is not DRM|
|10. Legal original games + optional skills/assets|Per-artifact rights/provenance, dependencies and license records; allowlisted resources|Fan-game labels or rewritten code do not establish rights to names, art or presentation. Publication requires rights review; no licensed assets automatically redistributed|
|11. Free platform / optional paid hosting|Local trusted mode or cloud provider adapters; future hosting margins separate from community-purpose funds|Business hypothesis; no paid plan or commerce launch claimed|
|12. Developer/creator discovery tab|Curated entries for games/assets/audio/textures, clear free/paid labels, source/license and submission moderation|New product surface, not currently a working marketplace|

## Execution and agent ownership

**Default: cloud VM builder.** No generated program or agent tool executes on the streamer PC. The coding agent can be Codex, Devin, Hermes or another supported owner-selected profile installed in that VM. The build environment and public player runtime are separate. No host home bind mount, personal browser profile, Twitch refresh token, VM account master key or full Agent-Native credential store is handed to the guest.

A streamer can explicitly select a trusted local agent; this is a distinct mode, recorded in the build request and never selected by outage recovery. Preloaded, previously trusted SDK games retain the existing local mode. Tests that use a local mock builder explicitly opt into trusted-local execution.

Persistent agent resources are scoped to one channel/workspace. Learning records must link to artifact/test outcomes. Untrusted chat or PR text cannot directly install instructions, tools, credentials or permanent memory. Promotion into trusted reusable resources is a streamer decision.

## Funding semantics

Use integer minor units and purpose-bound reservations: VM hosting, AI construction and optional platform fee. A contribution records its allocation policy before payment. Changes affect future contributions, not already-restricted funds. Streamer top-ups are identifiable separately. Reject overspending and concurrent double reservations; release failed/cancelled work; reconcile actual usage and refunds.

Stripe may provide checkout, signed payment events and (where supported/configured) connected-account flows. It does not by itself prove that a streamer spent funds as promised, enforce an off-platform provider bill or eliminate fraud. A public ledger needs provider receipts, settled-payment IDs and reconciliation; a hash chain only detects changes relative to a trusted retained head. The UI must distinguish demo credit, settled cash, estimated charges and actual invoices.

## Build order

1. Durable proposal/ballot/streamer-selection flow; enforce VM-default construction policy.
2. Studio catalog/round UI plus attach existing game endpoints; keep Rust work owned by its current agents.
3. Scoped VM build-worker contract, agent profiles and budget reservation; deploy a separate builder only under a concrete bounded spend policy.
4. Quarantined contributions and owner approval bound to artifact hash; verified isolation before execution.
5. Real provider/payment test integration, public allocation/usage view and failure/restart reconciliation.
6. Agent-Native connection/MCP bridge; curated resource/creator surfaces; private runtime enforcement and attribution.

This order preserves the whole vision while producing an observable complete journey increment by increment. It does not declare the remaining integrations complete.
