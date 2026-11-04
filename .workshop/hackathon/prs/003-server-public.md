# PR 003: refactor(server): extract public routes and static delivery

Local branch: `refactor/server-public` → `develop`. No remote, push or publication.

## What and why

Move community state/catalog/proposals and static client/public delivery to src/server/routes/public.js. Keep community state ahead of the body limit and every other route after it; retain MIME types, path containment and response bytes.

## Risk

Routing extraction only. Twitch readiness remains a live getter; static custom-client precedence and filesystem containment are unchanged.

## Verification

- Before: 271/271 (161 focused + 110 integration); Chromium 36/36. Logs: `/tmp/vibe-pr002-test.log`, `/tmp/vibe-pr002-ui.log` (session-local).
- After: 271/271 (161 focused + 110 integration); Chromium 36/36. Logs: `/tmp/vibe-pr003-test.log`, `/tmp/vibe-pr003-ui.log` (session-local).
- The previous PR's successful post-checks serve as the next PR's pre-checks on the identical code tree.
- No test assertions or test files changed. No dependencies, paid VM or model operations.

| File | Lines before | Lines after |
| --- | ---: | ---: |
| `src/server.js` | 1812 | 1731 |
| `src/server/routes/public.js` | 0 | 137 |
