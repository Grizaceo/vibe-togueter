# PR 006b: refactor(server): extract game lifecycle and publication refresh

Local branch: `refactor/server-game-lifecycle` → `develop`. No remote, push or publication.

## What and why

Move game loading, reloads and fallback recovery into src/server/game-lifecycle.js; move source-bound publication snapshots and resource watching into src/server/publication.js. Keep host startup before construction services and retain resource-debounce shutdown access.

## Risk

Fallback reentrancy and publication callbacks retain their original order. Source/resource credit invalidation and player rejoin paths pass the unchanged full suite and browser rehearsal.

## Verification

- Before: 271/271 (161 focused + 110 integration); Chromium 36/36. Logs: `/tmp/vibe-pr006a-test.log`, `/tmp/vibe-pr006a-ui.log` (session-local).
- After: 271/271 (161 focused + 110 integration); Chromium 36/36. Logs: `/tmp/vibe-pr006b-test.log`, `/tmp/vibe-pr006b-ui.log` (session-local).
- The previous PR's successful post-checks serve as the next PR's pre-checks on the identical code tree.
- No test assertions or test files changed. No dependencies, paid VM or model operations.

| File | Lines before | Lines after |
| --- | ---: | ---: |
| `src/server.js` | 529 | 387 |
| `src/server/game-lifecycle.js` | 0 | 123 |
| `src/server/publication.js` | 0 | 39 |
