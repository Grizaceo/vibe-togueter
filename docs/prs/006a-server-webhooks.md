# PR 006a: refactor(server): extract provider webhook routes

Local branch: `refactor/server-webhooks` → `develop`. No remote, push or publication.

## What and why

Move Kick signature acquisition/verification and Twitch delivery deduplication with the three webhook handlers into src/server/routes/webhooks.js. This completes the HTTP responsibility split without moving body limits or changing webhook acknowledgement order.

## Risk

Trust boundary extraction; signatures, delivery journal bytes, synthetic accounting opt-in and reward pause behavior are unchanged. Full platform and integration fixtures passed.

## Verification

- Before: 271/271 (161 focused + 110 integration); Chromium 36/36. Logs: `/tmp/vibe-pr006-test.log`, `/tmp/vibe-pr006-ui.log` (session-local).
- After: 271/271 (161 focused + 110 integration); Chromium 36/36. Logs: `/tmp/vibe-pr006a-test.log`, `/tmp/vibe-pr006a-ui.log` (session-local).
- The previous PR's successful post-checks serve as the next PR's pre-checks on the identical code tree.
- No test assertions or test files changed. No dependencies, paid VM or model operations.

| File | Lines before | Lines after |
| --- | ---: | ---: |
| `src/server.js` | 788 | 529 |
| `src/server/routes/webhooks.js` | 0 | 281 |
