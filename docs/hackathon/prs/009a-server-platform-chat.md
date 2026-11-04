# PR 009a: refactor(server): finish platform chat wiring and normalize module layout

Local branch: `refactor/server-platform-chat` → `develop`. No remote, push or publication.

## What and why

Move Twitch/Kick connection setup to src/server/platform-chat.js while retaining public URL initialization before platform authentication. Normalize indentation and wrapping in the extracted server modules with the already installed formatter. server.js finishes at 291 readable wiring lines.

## Risk

All 9 otherwise touched server module ASTs are identical before/after formatting. Extracted connection statement ASTs match after relative import adjustment. Review semantic changes with git diff -w; all full checks passed without contacting Twitch/Kick or a provider.

## Verification

- Before: 271/271 (161 focused + 110 integration); Chromium 36/36. Logs: `/tmp/vibe-pr009-test.log`, `/tmp/vibe-pr009-ui.log` (session-local).
- After: 271/271 (161 focused + 110 integration); Chromium 36/36. Logs: `/tmp/vibe-pr009a-test.log`, `/tmp/vibe-pr009a-ui.log` (session-local).
- The previous PR's successful post-checks serve as the next PR's pre-checks on the identical code tree.
- No test assertions or test files changed. No dependencies, paid VM or model operations.

| File | Lines before | Lines after |
| --- | ---: | ---: |
| `src/server.js` | 263 | 291 |
| `src/server/bootstrap.js` | 53 | 69 |
| `src/server/broadcast.js` | 228 | 235 |
| `src/server/config.js` | 43 | 56 |
| `src/server/construction.js` | 163 | 169 |
| `src/server/game-lifecycle.js` | 123 | 138 |
| `src/server/platform-chat.js` | 0 | 56 |
| `src/server/publication.js` | 39 | 51 |
| `src/server/routes/admin.js` | 630 | 638 |
| `src/server/routes/public.js` | 137 | 140 |
| `src/server/routes/webhooks.js` | 281 | 285 |
