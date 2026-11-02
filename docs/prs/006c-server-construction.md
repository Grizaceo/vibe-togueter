# PR 006c: refactor(server): extract construction coordination

Local branch: `refactor/server-construction` → `develop`. No remote, push or publication.

## What and why

Move treasury/generator initialization, round recovery, worker/prewarm setup and construction coordination into src/server/construction.js. Keep tick scheduling at its original position after remote-game setup. server.js is now 263 lines of composition.

## Risk

Preserve journal paths, feature flags, worker defaults, build permission checks and generation reentrancy. This finishes the additional server responsibility splits; all original assertions remain intact.

## Verification

- Before: 271/271 (161 focused + 110 integration); Chromium 36/36. Logs: `/tmp/vibe-pr006b-test.log`, `/tmp/vibe-pr006b-ui.log` (session-local).
- After: 271/271 (161 focused + 110 integration); Chromium 36/36. Logs: `/tmp/vibe-pr006c-test.log`, `/tmp/vibe-pr006c-ui.log` (session-local).
- The previous PR's successful post-checks serve as the next PR's pre-checks on the identical code tree.
- No test assertions or test files changed. No dependencies, paid VM or model operations.

| File | Lines before | Lines after |
| --- | ---: | ---: |
| `src/server.js` | 387 | 263 |
| `src/server/construction.js` | 0 | 163 |
