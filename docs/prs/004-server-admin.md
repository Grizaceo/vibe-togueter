# PR 004: refactor(server): extract private admin routes

Local branch: `refactor/server-admin` → `develop`. No remote, push or publication.

## What and why

Move all /admin routes together into src/server/routes/admin.js with the existing forwarded-request rejection, loopback/admin authentication and shared streamer confirmation calculation. Keep every per-operation authorization check in its original position. Live fallback and generation flags use getters.

## Risk

Security-sensitive code is moved verbatim except dependency references. Full tests include forwarded administration, streamer confirmation, quarantine, worker and delegation denial paths. No gate or response was redesigned.

## Verification

- Before: 271/271 (161 focused + 110 integration); Chromium 36/36. Logs: `/tmp/vibe-pr003-test.log`, `/tmp/vibe-pr003-ui.log` (session-local).
- After: 271/271 (161 focused + 110 integration); Chromium 36/36. Logs: `/tmp/vibe-pr004-test.log`, `/tmp/vibe-pr004-ui.log` (session-local).
- The previous PR's successful post-checks serve as the next PR's pre-checks on the identical code tree.
- No test assertions or test files changed. No dependencies, paid VM or model operations.

| File | Lines before | Lines after |
| --- | ---: | ---: |
| `src/server.js` | 1731 | 1175 |
| `src/server/routes/admin.js` | 0 | 630 |
