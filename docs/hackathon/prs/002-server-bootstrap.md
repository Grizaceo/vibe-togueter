# PR 002: refactor(server): extract config and bootstrap

Local branch: `refactor/server-bootstrap` → `develop`. No remote, push or publication.

## What and why

Move configuration, environment overrides and controller lock into src/server/config.js; move listening and signal shutdown into src/server/bootstrap.js. Preserve startup order and read the resource debounce timer at shutdown through a getter.

## Risk

Configuration paths now resolve from the nested module; verified by full isolated suite and browser rehearsal. Shutdown cancellation and 45-second reconciliation wait are unchanged.

## Verification

- Before: 271/271 (161 focused + 110 integration); Chromium 36/36. Logs: `/tmp/vibe-pr001-test.log`, `/tmp/vibe-pr001-ui.log` (session-local).
- After: 271/271 (161 focused + 110 integration); Chromium 36/36. Logs: `/tmp/vibe-pr002-test.log`, `/tmp/vibe-pr002-ui.log` (session-local).
- The previous PR's successful post-checks serve as the next PR's pre-checks on the identical code tree.
- No test assertions or test files changed. No dependencies, paid VM or model operations.

| File | Lines before | Lines after |
| --- | ---: | ---: |
| `src/server.js` | 1894 | 1812 |
| `src/server/bootstrap.js` | 0 | 53 |
| `src/server/config.js` | 0 | 43 |
