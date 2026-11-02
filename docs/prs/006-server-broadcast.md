# PR 006: refactor(server): extract WebSocket room and activity broadcast

Local branch: `refactor/server-broadcast` → `develop`. No remote, push or publication.

## What and why

Move feed history, encoded fan-out/backpressure, bounded activity snapshots, the 10 Hz loop and WebSocket connection/input handling into src/server/broadcast.js. Keep limits, compression, welcome payloads and identity checks unchanged.

## Risk

Timing-sensitive extraction: retains STATE_INTERVAL_MS, sendRoom state handling and live getters for fallback/generation. Server is now 788 lines; provider webhooks, game lifecycle and construction wiring still need their own small PRs to reach 200–300 lines.

## Verification

- Before: 271/271 (161 focused + 110 integration); Chromium 36/36. Logs: `/tmp/vibe-pr005-test.log`, `/tmp/vibe-pr005-ui.log` (session-local).
- After: 271/271 (161 focused + 110 integration); Chromium 36/36. Logs: `/tmp/vibe-pr006-test.log`, `/tmp/vibe-pr006-ui.log` (session-local).
- The previous PR's successful post-checks serve as the next PR's pre-checks on the identical code tree.
- No test assertions or test files changed. No dependencies, paid VM or model operations.

| File | Lines before | Lines after |
| --- | ---: | ---: |
| `src/server.js` | 964 | 788 |
| `src/server/broadcast.js` | 0 | 228 |
