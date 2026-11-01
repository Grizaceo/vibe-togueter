# Community studio implementation evidence

November 1, 2026. Codex Session ID: `01a19536-0f02-7fc3-b030-d6b6fd8e170c`.

This increment extends the inherited prototype; it does not complete the platform vision. No parallel game repo or shared Hermes engine was modified.

Implemented: durable configurable idea/voting/approval rounds; exact approval hashes; resource selection revokes stale approval; interrupted build reconciliation; single-controller lease; bounded and malformed WebSocket handling; atomic metadata-only free creator catalog with curator review; license/notice/creator/social links in a selected-resource preview; clear separation of curated public resources from artist submissions. Paid listings remain unpublished while commerce and commission are unconfigured.

Kenney Background Elements was downloaded from the official source page on November 1. The included License.txt explicitly permits personal/commercial use under CC0. Three unmodified PNGs, the original license and per-file/archive SHA-256 provenance are bundled. The full archive remains under `~/Videos/twitchcon-work/2026-11-01/studio-assets`, outside the repo. No creator endorsement is implied. Primary sources: https://kenney.nl/assets/background-elements and https://creativecommons.org/publicdomain/zero/1.0/ .

Build default: cloud-vm, no silent local fallback. Worker disconnected: actual cloud generation is not demonstrated. Trusted-local remains an explicit owner choice, not the default. Node vm is not a security boundary. PR scanning, agent connections, money routing and final published-game credit enforcement are still pending.

Verification: `npm test` completed with 37 focused checks plus 49 isolated legacy/integration checks, zero failures (86 total). Log: `/tmp/vibe-arena-platform-tests.log`. The local mock tests do not show actual AI billing, payments or independent Twitch viewers. Browser layout inspection remains unavailable in this session; DOM contract tests establish credit content only.

Independent Rust checks: `cargo test --locked` in tetris99-rs passed 14 tests; `cargo test -p shared --locked` in teeworlds-rs passed 13. These are separate from Vibe Arena's count and do not prove the new orchestration bridge exists. The provided game handoffs and live CreateOS reports are catalog integration inputs, not completed Vibe Arena integrations.

Deployed-process checks at 11:38 UTC: authenticated Twitch connection restored on gris_96; public `/studio.html` returned 200; public catalog contained the three curated resources. Downloading each served image reproduced its recorded SHA-256. An actual generation request returned `ok:false / isolated_builder_required`; treasury bytes were unchanged. Saved evidence: `docs/evidence/studio-increment-2026-11-01.json`. This is HTTP/data evidence, not visual or real cloud-builder evidence.

Read-only adversarial review verified the previously reported type, license and curator-data fixes, then found the local HTTP link helper rejected bundled curated paths. The helper now permits only exact same-origin `/curated/<pack>/<file>.png` paths in addition to HTTPS links; a regression test covers external HTTP, protocol-relative and traversal attempts. The final full suite passed after this repair.
