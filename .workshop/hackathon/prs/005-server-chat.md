# PR 005: refactor(server): extract chat command pipeline

Local branch: `refactor/server-chat` → `develop`. No remote, push or publication.

## What and why

Move handleChat and its throttle into src/server/chat-commands.js. Preserve command order, fallback/pause authority, aliases, identity bounds, ideas/votes, delegation, Tee and reply behavior. Share the original reply map and resolve the public URL lazily.

## Risk

Chat identity and authorization logic moved without assertion changes. The complete suite covers Twitch/web identity distinctions, fallback, effects, predictions and delegation.

## Verification

- Before: 271/271 (161 focused + 110 integration); Chromium 36/36. Logs: `/tmp/vibe-pr004-test.log`, `/tmp/vibe-pr004-ui.log` (session-local).
- After: 271/271 (161 focused + 110 integration); Chromium 36/36. Logs: `/tmp/vibe-pr005-test.log`, `/tmp/vibe-pr005-ui.log` (session-local).
- The previous PR's successful post-checks serve as the next PR's pre-checks on the identical code tree.
- No test assertions or test files changed. No dependencies, paid VM or model operations.

| File | Lines before | Lines after |
| --- | ---: | ---: |
| `src/server.js` | 1175 | 964 |
| `src/server/chat-commands.js` | 0 | 254 |
